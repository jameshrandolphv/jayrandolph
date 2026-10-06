"""Dev-only: builds spektrafilm-format profiles for black-and-white stocks from the
digitised datasheet curves in tools/reference/bw/*.json and installs them into
the spektrafilm package so bake.py can bake them like any colour stock.

spektrafilm has no black-and-white profiles, so a B&W stock is expressed as a
colour-model profile whose three channels are identical:
  - the same panchromatic spectral sensitivity in R, G and B,
  - the same density curve D(logE) in R, G and B, built from three CDF layers,
  - a flat neutral channel density (1/3 per channel), so a neutral CMY triplet
    of density D is a neutral optical density D.
The engine then renders one grain field for all channels (mono) and equal
halation in every channel; see bake.py.
"""
import json
from dataclasses import replace
from pathlib import Path

import numpy as np
import scipy.optimize
import scipy.special
from spektrafilm import init_params, digest_params, simulate
from spektrafilm.profiles.io import load_profile
from spektrafilm.runtime import params_builder

HERE = Path(__file__).parent
BW_DIR = HERE / 'bw'
WAVELENGTHS = np.arange(380.0, 781.0, 5.0)
LOG_EXPOSURE = np.linspace(-3.0, 4.0, 256)
PRINT = 'kodak_portra_endura'

# Mid-gray (0.184) sits this many log10 above the speed point (D = Dmin + 0.1)
# in the colour stocks (measured on the shipped profiles: 1.14 .. 1.56, mean 1.3).
SPEED_TO_MIDGRAY = 1.3

# Per-stock settings that are not on the datasheet curves.
STOCKS = {
    'kodak_tri_x_400': {'antihalation': 'weak', 'grain_area_um2': 0.9},
    'kodak_t_max_100': {'antihalation': 'strong', 'grain_area_um2': 0.30},
    'ilford_hp5_plus': {'antihalation': 'weak', 'grain_area_um2': 0.7},
}


def installed_dir() -> Path:
    import spektrafilm.data.profiles as pkg
    return Path(list(pkg.__path__)[0])


def log_sensitivity(src: dict) -> np.ndarray:
    wl = np.array(src['wavelength_nm'])
    ls = np.array(src['log_sensitivity'])
    out = np.interp(WAVELENGTHS, wl, ls)  # flat below the first point
    beyond = WAVELENGTHS > wl[-1]
    # steep long-wavelength cut-off of the panchromatic sensitising dye
    out[beyond] = ls[-1] - 0.08 * (WAVELENGTHS[beyond] - wl[-1])
    return out


def fit_cdf_layers(x, y, y_max_cap):
    """Fit y(x) = sum_i A_i * Phi((x - c_i) / s_i) to the digitised curve."""
    span = y.max()

    def model(p, xs):
        a, c, s = p[:3], p[3:6], p[6:9]
        return sum(a[i] * scipy.special.ndtr((xs - c[i]) / s[i]) for i in range(3))

    def resid(p):
        extra = max(0.0, p[:3].sum() - y_max_cap)  # keep the extrapolated shoulder sane
        return np.append(model(p, x) - y, 0.5 * extra)

    x0 = np.array([span * .35, span * .4, span * .4,
                   x.min() + 1.0, x.min() + 2.0, x.max() - 0.5, 0.45, 0.5, 0.5])
    lo = [0.0] * 3 + [x.min() - 1.0] * 3 + [0.25] * 3
    hi = [4.0] * 3 + [x.max() + 2.0] * 3 + [1.0] * 3
    r = scipy.optimize.least_squares(resid, x0, bounds=(lo, hi))
    p = r.x
    order = np.argsort(p[3:6])
    a, c, s = p[:3][order], p[3:6][order], p[6:9][order]
    rms = float(np.sqrt(np.mean((model(p, x) - y) ** 2)))
    return a, c, s, rms


def build(stock: str) -> dict:
    src = json.loads((BW_DIR / f'{stock}.json').read_text())
    cfg = STOCKS[stock]
    le, d = np.array(src['log_exposure']), np.array(src['density'])
    d_min = float(d.min())

    # speed point (D = Dmin + 0.1) -> scene mid-gray = 0 on the profile axis
    speed = float(np.interp(d_min + 0.1, d, le))
    shift = speed + SPEED_TO_MIDGRAY
    x = le - shift
    a, c, s, rms = fit_cdf_layers(x, d - d_min, y_max_cap=d.max() - d_min + 0.9)
    layers = np.stack([a[i] * scipy.special.ndtr((LOG_EXPOSURE - c[i]) / s[i])
                       for i in range(3)], axis=1)  # [logE, layer]
    curve = layers.sum(axis=1)
    layers3 = np.repeat(layers[:, :, None], 3, axis=2)  # [logE, layer, channel]
    curves3 = np.repeat(curve[:, None], 3, axis=1)

    ref = load_profile('kodak_portra_400')
    ls = log_sensitivity(src)
    profile = {
        'metadata': {
            'version': '0.3.2',
            'copyright': 'Digitised from manufacturer datasheets; derived profile format by '
                         'Andrea Volpato (spektrafilm), CC BY-SA 4.0.',
            'license': 'Profile format and conventions follow spektrafilm '
                       '(https://github.com/andreavolpato/spektrafilm), CC BY-SA 4.0. '
                       'Curves approximate the manufacturer datasheet plots; original data '
                       'belong to Kodak / Harman Technology.',
            'datasource': src['source'],
        },
        'info': {
            'stock': stock, 'name': src['name'], 'type': 'negative', 'support': 'film',
            'stage': 'filming', 'use': 'still', 'antihalation': cfg['antihalation'],
            'target_print': PRINT, 'channel_model': 'bw', 'densitometer': 'visual',
            'log_sensitivity_density_over_min': 1.0 if 'D=1.0' in src['source'] or '1.0 above' in src['source'] else 0.2,
            'reference_illuminant': 'D55', 'viewing_illuminant': 'D50',
        },
        'data': {
            'wavelengths': WAVELENGTHS.tolist(),
            'log_sensitivity': np.repeat(ls[:, None], 3, axis=1).tolist(),
            # panchromatic stock: no band-pass window, no chromaticity surface
            'hanatos2025_adaptation_window_params': [300.0, 20.0, 800.0, 20.0],
            'hanatos2025_adaptation_surface_params': np.zeros((3, 15)).tolist(),
            'channel_density': np.full((len(WAVELENGTHS), 3), 1.0 / 3.0).tolist(),
            'base_density': np.full(len(WAVELENGTHS), d_min).tolist(),
            'midscale_neutral_density': np.full(len(WAVELENGTHS), d_min + float(np.interp(0.0, LOG_EXPOSURE, curve))).tolist(),
            'log_exposure': LOG_EXPOSURE.tolist(),
            'density_curves': curves3.tolist(),
            'density_curves_layers': layers3.tolist(),
            'density_curves_model': {
                'model_type': 'cdfs',
                'centers': np.repeat(c[None, :], 3, axis=0).tolist(),
                'amplitudes': np.repeat(a[None, :], 3, axis=0).tolist(),
                'sigmas': np.repeat(s[None, :], 3, axis=0).tolist(),
            },
        },
    }
    print(f'{stock}: Dmin {d_min:.2f} speed logE {speed:.2f} fit rms {rms:.3f} '
          f'Dmax(model) {d_min + curve[-1]:.2f}  D(mid) {d_min + np.interp(0, LOG_EXPOSURE, curve):.2f}')
    return profile


def sensitivity_to_unit_midgray(stock: str) -> None:
    """Shift log_sensitivity so a mid-gray (0.184) card has raw exposure 1."""
    from spektrafilm.utils.spectral_upsampling import (compute_hanatos2025_tc_lut,
                                                       rgb_to_raw_hanatos2025)
    prof = load_profile(stock)
    sens = 10 ** prof.data.log_sensitivity
    ad = prof.hanatos2025_adaptation()
    ad.apply_window, ad.apply_surface, ad.spectral_gaussian_blur = True, True, 0.0
    lut = compute_hanatos2025_tc_lut(sens, ad, gamut_compress=None)
    gray = np.full((4, 4, 3), 0.184)
    raw = rgb_to_raw_hanatos2025(gray, sens, 'ITU-R BT.2020', False, 'D55', tc_lut=lut)[1, 1]
    shift = -np.log10(raw[1])
    path = installed_dir() / f'{stock}.json'
    j = json.loads(path.read_text())
    j['data']['log_sensitivity'] = (np.array(j['data']['log_sensitivity']) + shift).tolist()
    path.write_text(json.dumps(j))
    print(f'{stock}: sensitivity shifted by {shift:+.3f} log10 (raw mid-gray {raw.round(4)})')


def fit_print_filters(stock: str):
    """Enlarger (c, m, y) filtration that prints a neutral gray ramp neutral."""
    def render(m, y, patches):
        p = init_params(film_profile=stock, print_profile=PRINT)
        p.settings.neutral_print_filters_from_database = False
        p.enlarger.c_filter_neutral, p.enlarger.m_filter_neutral, p.enlarger.y_filter_neutral = 0.0, m, y
        p.io.input_color_space = 'ITU-R BT.2020'
        p.io.input_cctf_decoding = False
        p.io.scan_film = False
        p.io.input_gamut_compress = replace(p.io.input_gamut_compress, active=False)
        p.io.output_gamut_compress = replace(p.io.output_gamut_compress, algorithm='off')
        p.debug.lut_mode = True
        p.debug.deactivate_spatial_effects = True
        p.debug.deactivate_stochastic_effects = True
        p.camera.auto_exposure = False
        d = digest_params(p)
        apply_bw_overrides(d, stock)
        return np.asarray(simulate(patches.copy(), d))[0]

    levels = np.array([0.03, 0.09, 0.184, 0.4, 0.8])
    patches = np.repeat(levels[None, :, None], 3, axis=2)
    weights = np.array([0.3, 0.6, 1.0, 0.6, 0.3])

    def resid(v):
        out = render(v[0], v[1], patches)
        return np.concatenate([(out[:, 0] - out[:, 1]) * weights, (out[:, 2] - out[:, 1]) * weights])

    r = scipy.optimize.least_squares(resid, [60.0, 55.0], diff_step=0.02, bounds=([0, 0], [170, 170]))
    out = render(r.x[0], r.x[1], patches)
    print(f'{stock}: print filters M={r.x[0]:.1f} Y={r.x[1]:.1f}  ramp spread '
          f'{np.abs(out - out.mean(axis=1, keepdims=True)).max():.4f}')
    return [0.0, float(r.x[0]), float(r.x[1])]


def apply_bw_overrides(d, stock: str) -> None:
    """Make the render parameters channel-independent (the stock has one emulsion).

    Applied to digested params before baking/fitting. The engine renders one
    grain field for all channels; here every per-channel parameter becomes its
    channel mean so halation and grain statistics agree across channels.
    """
    r = d.film_render
    r.dir_couplers.amount = 0.0  # no inter-layer inhibition in a single emulsion
    h = r.halation
    for name in ('scatter_core_um', 'scatter_tail_um', 'scatter_tail_weight',
                 'halation_strength', 'halation_first_sigma_um'):
        v = getattr(h, name)
        setattr(h, name, (float(np.mean(v)),) * 3)
    g = r.grain
    for name in ('particle_scale', 'uniformity', 'density_min'):
        v = getattr(g, name)
        setattr(g, name, (float(np.mean(v)),) * 3)
    g.particle_area_um2 = STOCKS[stock]['grain_area_um2']


def install(stock: str) -> list:
    """Write the profile into the spektrafilm package; returns the neutral print filters."""
    (installed_dir() / f'{stock}.json').write_text(json.dumps(build(stock)))
    sensitivity_to_unit_midgray(stock)
    return fit_print_filters(stock)


def register_filters(filters: dict) -> None:
    db = params_builder._get_neutral_print_filters()
    for stock, f in filters.items():
        db.setdefault(PRINT, {}).setdefault('TH-KG3', {})[stock] = f


if __name__ == '__main__':
    result = {s: install(s) for s in STOCKS}
    (BW_DIR / 'print_filters.json').write_text(json.dumps(result, indent=1))
