"""Dev-only: digitises the published characteristic curve and spectral sensitivity
of black-and-white stocks from their manufacturer datasheets.

spektrafilm ships no black-and-white profiles, so these are read off the
datasheet plots (vector paths for Kodak, raster tracing for Ilford) and written
to tools/reference/bw/<stock>.json. bw_profiles.py turns them into profiles.

Usage: /tmp/spkenv/bin/python tools/reference/bw_digitize.py <pdf_dir>
  pdf_dir holds trix.pdf, tmax100.pdf, hp5_full.pdf (see README in bw/).

Accuracy is that of reading a printed plot (~0.02 log E, ~0.02 density).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pymupdf

OUT = Path(__file__).parent / 'bw'


def fit(pairs):
    """Linear map pdf-point -> data units from (data, point) label pairs."""
    d, p = np.array(pairs, dtype=float).T
    a, b = np.polyfit(p, d, 1)
    return lambda v: a * np.asarray(v, dtype=float) + b


def drawing_points(page, index):
    pts = []
    for it in page.get_drawings()[index]['items']:
        if it[0] == 'l':
            pts += [(it[1].x, it[1].y), (it[2].x, it[2].y)]
    return np.array(pts)


def vector_curve(page, index, fx, fy):
    p = drawing_points(page, index)
    x, y = fx(p[:, 0]), fy(p[:, 1])
    o = np.argsort(x, kind='stable')
    return x[o], y[o]


def monotone_resample(x, y, grid, increasing=True):
    """Bin the raw path points onto the grid (median per bin) and interpolate."""
    step = grid[1] - grid[0]
    xs, ys = [], []
    for g in grid:
        m = np.abs(x - g) <= step / 2
        if m.any():
            xs.append(g)
            ys.append(np.median(y[m]))
    xs, ys = np.array(xs), np.array(ys)
    out = np.interp(grid, xs, ys)
    return np.maximum.accumulate(out) if increasing else out


def trace_raster(page, clip, dpi=300):
    """Render a raster plot and return (gray image, pixel->point scale, origin)."""
    pix = page.get_pixmap(dpi=dpi, clip=clip)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
    return img[..., :3].mean(axis=2)


def thick_centre(col_dark, min_run):
    """Centre row of the longest dark run in a column (the thick curve stroke)."""
    best, start = (0, None), None
    for i, v in enumerate(np.append(col_dark, False)):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start > best[0]:
                best = (i - start, (start + i - 1) / 2)
            start = None
    return best[1] if best[0] >= min_run else None


def grid_lines(dark, axis, frac=0.6):
    s = dark.sum(axis=axis)
    idx = np.where(s > frac * dark.shape[axis])[0]
    groups, cur = [], [idx[0]]
    for i in idx[1:]:
        if i - cur[-1] <= 2:
            cur.append(i)
        else:
            groups.append(np.mean(cur))
            cur = [i]
    groups.append(np.mean(cur))
    return groups


def kodak(pdf, char_idx, char_cal, sens_idx, sens_cal, meta, out_name):
    page = pymupdf.open(pdf)[7]
    fx, fy = fit(char_cal['x']), fit(char_cal['y'])
    le, d = vector_curve(page, char_idx, fx, fy)
    grid_le = np.round(np.arange(np.ceil(le.min() * 20) / 20, np.floor(le.max() * 20) / 20 + 1e-9, 0.05), 2)
    dens = monotone_resample(le, d, grid_le)
    sx, sy = fit(sens_cal['x']), fit(sens_cal['y'])
    wl, ls = vector_curve(page, sens_idx, sx, sy)
    grid_wl = np.arange(np.ceil(wl.min() / 5) * 5, np.floor(wl.max() / 5) * 5 + 1, 5.0)
    sens = monotone_resample(wl, ls, grid_wl, increasing=False)
    write(out_name, meta, grid_le, dens, grid_wl, sens, sens_is_log=True)


def hp5(pdf, out_name, meta):
    doc = pymupdf.open(pdf)
    # --- characteristic curve (page 5, relative log exposure) ---
    img = trace_raster(doc[4], pymupdf.Rect(50, 80, 270, 250))
    dark = img < 110
    vx, hy = grid_lines(dark, 0), grid_lines(dark, 1)
    # vertical grid every 0.5 log E starting at 0; horizontal every 0.5 D, bottom = 0
    xs, ys = [], []
    for c in range(int(vx[0]) + 3, int(vx[-1]) - 2):
        if any(abs(c - v) < 4 for v in vx):
            continue
        r = thick_centre(dark[: int(hy[-1]) - 2, c], 5)
        if r is not None:
            xs.append(c)
            ys.append(r)
    xs, ys = np.array(xs, float), np.array(ys, float)
    le = (xs - vx[0]) / (vx[2] - vx[0]) * 1.0  # grid line 2 is log E = 1
    dd = (hy[-1] - ys) / (hy[-1] - hy[-3]) * 1.0  # hy[-3] is D = 1.0
    grid_le = np.round(np.arange(np.ceil(le.min() * 20) / 20, np.floor(le.max() * 20) / 20 + 1e-9, 0.05), 2)
    dens = monotone_resample(le, dd, grid_le)

    # --- spectral sensitivity (page 1, relative, tungsten wedge) ---
    img = trace_raster(doc[0], pymupdf.Rect(50, 560, 310, 705))
    dark = img < 110
    box_l = grid_lines(dark, 0, 0.5)[0]
    box_b = grid_lines(dark, 1, 0.5)[-1]
    # tick labels 400..650 at 2.31 px/nm measured from the plot: x(400)=162 px, x(650)=739 px
    px_per_nm = (739 - 162) / 250.0
    x400, y_zero, y_one = 162.0, float(box_b), 188.0
    wl_l, rel = [], []
    for c in range(int(box_l) + 4, 760):
        r = thick_centre(dark[: int(box_b) - 2, c], 5)
        if r is not None:
            wl_l.append(400 + (c - x400) / px_per_nm)
            rel.append((y_zero - r) / (y_zero - y_one))
    wl_a, rel = np.array(wl_l), np.array(rel)
    grid_wl = np.arange(np.ceil(wl_a.min() / 5) * 5, np.floor(wl_a.max() / 5) * 5 + 1, 5.0)
    sens_rel = np.interp(grid_wl, wl_a, rel)
    ls = np.log10(np.maximum(sens_rel, 0.01))
    write(out_name, meta, grid_le, dens, grid_wl, ls, sens_is_log=True)


def write(name, meta, le, dens, wl, ls, sens_is_log):
    OUT.mkdir(exist_ok=True)
    doc = dict(meta)
    doc['log_exposure'] = [round(float(v), 3) for v in le]
    doc['density'] = [round(float(v), 3) for v in dens]
    doc['wavelength_nm'] = [float(v) for v in wl]
    doc['log_sensitivity'] = [round(float(v), 3) for v in ls]
    (OUT / f'{name}.json').write_text(json.dumps(doc, indent=1))
    print(name, f'logE {le[0]:.2f}..{le[-1]:.2f}  D {dens[0]:.2f}..{dens[-1]:.2f}  '
          f'{wl[0]:.0f}-{wl[-1]:.0f} nm')


if __name__ == '__main__':
    src = Path(sys.argv[1])
    kodak(
        str(src / 'trix.pdf'), 101,
        {'x': [(-4, 354.3), (-3, 391.3), (-2, 428.1), (-1, 465.0), (0, 502.15), (1, 538.0)],
         'y': [(0, 248.9), (1, 201.9), (2, 155.65), (3, 110.1), (4, 64.0)]},
        73,
        {'x': [(250, 75.6), (700, 256.3)],
         'y': [(0, 442.5), (1, 405.1), (2, 368.0), (3, 331.0), (4, 293.2)]},
        {'stock': 'kodak_tri_x_400', 'name': 'Kodak Professional Tri-X 400',
         'source': 'Kodak F-4017 datasheet, 35 mm characteristic curve, T-Max Developer 7 min 20C; '
                   'spectral sensitivity D=1.0 above gross fog',
         'log_exposure_units': 'log lux-seconds', 'speed': 400},
        'kodak_tri_x_400')
    kodak(
        str(src / 'tmax100.pdf'), 112,
        {'x': [(-4, 355.75), (-3, 392.5), (-2, 429.5), (-1, 466.4), (0, 503.15), (1, 539.2)],
         'y': [(0, 241.85), (1, 194.9), (2, 148.65), (3, 103.1), (4, 57.0)]},
        79,
        {'x': [(250, 75.2), (700, 256.1)],
         'y': [(1, 536.4), (0, 573.7), (-1, 611.9), (-2, 650.3)]},
        {'stock': 'kodak_t_max_100', 'name': 'Kodak Professional T-Max 100',
         'source': 'Kodak F-4016 datasheet, characteristic curve, D-76 7.5 min 20C; '
                   'spectral sensitivity 1.0 above D-min',
         'log_exposure_units': 'log lux-seconds', 'speed': 100},
        'kodak_t_max_100')
    hp5(str(src / 'hp5_full.pdf'), 'ilford_hp5_plus',
        {'stock': 'ilford_hp5_plus', 'name': 'Ilford HP5 Plus',
         'source': 'Ilford HP5 Plus technical information (Nov 2018), Ilfotec HC 1+31 6.5 min 20C; '
                   'tungsten wedge spectrogram (relative)',
         'log_exposure_units': 'relative log exposure (uncalibrated)', 'speed': 400})
