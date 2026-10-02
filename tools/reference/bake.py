"""Dev-only: bakes a spektrafilm film profile into the compact binary the WASM
engine consumes (public/film/<stock>.fsp + <stock>.json).

Everything that depends only on the film (spectral integration, colour
adaptation, scanner LUT) is evaluated here by the reference implementation so
the browser only has to run cheap per-pixel table lookups.

Usage: /tmp/spkenv/bin/python tools/reference/bake.py <out_dir> [stock ...]

Binary layout (little-endian, all payload f32):
  u32 magic 'FSP1', u32 version, u32 positive(0/1), u32 tcN, u32 curveK, u32 scanN
  f32 rgb2xyz[9]   linear Rec.2020 -> XYZ (CAT16 adapted to film reference illuminant)
  f32 xyz2rgb[9]   scanner XYZ -> linear sRGB (viewing illuminant -> D65, Bradford)
  f32 tcLut[tcN*tcN*3]   index [x][y][ch], x,y in [0,1]
  f32 logExposure[K]
  f32 curves[K*3]        density curves minus per-channel minimum
  f32 curves0[K*3]       curves before DIR couplers
  f32 dirMatrix[9]       donor row, receiver column (amount applied)
  f32 densityMax[3]      max of normalised curves
  f32 scanMin[3], scanMax[3]
  f32 scanLut[scanN^3*3] log10 XYZ, index [r][g][b][ch]
  -- version 2 grain block --
  u32 grainN
  f32 grain[14]   particleArea_um2, particleScale[3], particleScaleLayers[3],
                  densityMin[3], uniformity[3], blur_px
  f32 densityMaxLayers[9]   index [sublayer][ch], per-layer max of the layer curves
  f32 layerLut[3*grainN*3]  index [ch][i][sublayer]: per-sublayer density at total
                            normalised density D = i/(grainN-1)*densityMax[ch]
"""
import json
import struct
import sys
from dataclasses import replace
from pathlib import Path

import colour
import numpy as np
from spektrafilm import init_params, digest_params
from spektrafilm.config import STANDARD_OBSERVER_CMFS
from spektrafilm.model.couplers import (compute_dir_couplers_matrix,
                                        compute_density_curves_before_dir_couplers)
from spektrafilm.model.density_curves import interp_density_cmy_layers
from spektrafilm.model.develop import compute_density_spectral
from spektrafilm.model.illuminants import standard_illuminant
from spektrafilm.utils.conversions import density_to_light
from spektrafilm.utils.spectral_upsampling import (compute_hanatos2025_tc_lut,
                                                   _illuminant_to_xy)

SCAN_N = 33
GRAIN_N = 256
INPUT_SPACE = 'ITU-R BT.2020'


def bake(stock: str, out: Path) -> None:
    p = init_params(film_profile=stock, print_profile='kodak_portra_endura')
    d = digest_params(p)
    film = d.film
    positive = film.info.type == 'positive'

    # --- rgb -> raw ---
    sens = np.nan_to_num(10 ** film.data.log_sensitivity)
    ad = film.hanatos2025_adaptation()
    ad.apply_window = d.settings.apply_hanatos2025_adaptation_window
    ad.apply_surface = d.settings.apply_hanatos2025_adaptation_surface
    ad.spectral_gaussian_blur = d.settings.spectral_gaussian_blur
    tc_lut = compute_hanatos2025_tc_lut(sens, ad, gamut_compress=None)
    illu_xy = _illuminant_to_xy(film.info.reference_illuminant)
    rgb2xyz = colour.RGB_to_XYZ(np.eye(3), colourspace=INPUT_SPACE,
                                apply_cctf_decoding=False, illuminant=illu_xy,
                                chromatic_adaptation_transform='CAT16').T

    # --- density curves + DIR couplers ---
    log_exp = np.asarray(film.data.log_exposure, dtype=np.float64)
    raw_curves = np.asarray(film.data.density_curves, dtype=np.float64)
    assert not np.isnan(raw_curves).any()
    curves = raw_curves - raw_curves.min(axis=0)
    dc = d.film_render.dir_couplers
    dir_m = compute_dir_couplers_matrix(dc) * dc.amount
    curves0 = compute_density_curves_before_dir_couplers(curves, log_exp, dir_m,
                                                         positive=positive)
    dmax = curves.max(axis=0)

    # --- scanner (direct film scan) ---
    scan_min = -np.array(d.film_render.grain.density_min, dtype=np.float64)
    scan_max = raw_curves.max(axis=0)
    illum = standard_illuminant(film.info.viewing_illuminant)
    norm = np.sum(illum * STANDARD_OBSERVER_CMFS[:, 1], axis=0)
    chan = np.asarray(film.data.channel_density)
    base = np.asarray(film.data.base_density)

    def cmy_to_log_xyz(cmy):
        spec = compute_density_spectral(chan, cmy, base)
        light = density_to_light(spec, illum)
        xyz = np.einsum('ijk,kl->ijl', light, STANDARD_OBSERVER_CMFS[:]) / norm
        return np.log10(np.fmax(xyz, 0.0) + 1e-10)

    axes = [np.linspace(scan_min[i], scan_max[i], SCAN_N) for i in range(3)]
    grid = np.stack(np.meshgrid(*axes, indexing='ij'), axis=-1).reshape(SCAN_N ** 2, SCAN_N, 3)
    scan_lut = cmy_to_log_xyz(grid).reshape(SCAN_N, SCAN_N, SCAN_N, 3)
    illum_xyz = np.einsum('k,kl->l', illum, STANDARD_OBSERVER_CMFS[:]) / norm
    illum_xy = colour.XYZ_to_xy(illum_xyz)
    xyz2rgb = colour.XYZ_to_RGB(np.eye(3), colourspace='sRGB',
                                apply_cctf_encoding=False, illuminant=illum_xy).T

    # --- grain: per-sublayer density as a function of total density ---
    g = d.film_render.grain
    layers = np.nan_to_num(np.asarray(film.data.density_curves_layers, dtype=np.float64))
    assert layers.shape[1:] == (3, 3), layers.shape
    layer_max = layers.max(axis=0)  # [sublayer, ch]
    layer_lut = np.zeros((3, GRAIN_N, 3))
    for ch in range(3):
        probe = np.zeros((GRAIN_N, 1, 3))
        probe[:, 0, ch] = np.linspace(0.0, dmax[ch], GRAIN_N)
        lay = interp_density_cmy_layers(probe, curves, layers, positive_film=positive)
        layer_lut[ch] = lay[:, 0, :, ch]
    grain_head = np.array([g.particle_area_um2, *g.particle_scale, *g.particle_scale_layers,
                           *g.density_min, *g.uniformity, g.blur], dtype=np.float64)
    assert grain_head.shape == (14,)

    f32 = lambda a: np.ascontiguousarray(a, dtype='<f4').tobytes()
    blob = struct.pack('<6I', 0x31505346, 2, int(positive), tc_lut.shape[0],
                       log_exp.shape[0], SCAN_N)
    for a in (rgb2xyz, xyz2rgb, tc_lut, log_exp, curves, curves0, dir_m, dmax,
              scan_min, scan_max, scan_lut):
        blob += f32(a)
    blob += struct.pack('<I', GRAIN_N)
    for a in (grain_head, layer_max, layer_lut):
        blob += f32(a)
    (out / f'{stock}.fsp').write_bytes(blob)

    r = d.film_render
    meta = {
        'stock': stock,
        'name': film.info.name,
        'type': film.info.type,
        'format_mm': d.camera.film_format_mm,
        'halation': {k: (list(v) if isinstance(v, tuple) else v)
                     for k, v in r.halation.__dict__.items()},
        'dir': {k: (list(v) if isinstance(v, tuple) else v)
                for k, v in dc.__dict__.items()},
        'grain': {k: (list(v) if isinstance(v, tuple) else v)
                  for k, v in r.grain.__dict__.items()},
    }
    (out / f'{stock}.json').write_text(json.dumps(meta, indent=1))
    print(stock, 'bytes', len(blob))


if __name__ == '__main__':
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    stocks = sys.argv[2:] or ['kodak_kodachrome_64', 'kodak_portra_400']
    for s in stocks:
        bake(s, out)
