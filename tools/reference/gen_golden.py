"""Dev-only: runs the spektrafilm reference to produce golden vectors and data tables.

Usage: /tmp/spkenv/bin/python tools/reference/gen_golden.py <out_dir>
"""
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
from spektrafilm import init_params, digest_params, simulate

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

# Deterministic test chart in linear Rec.2020: neutral ramp + saturated primaries/secondaries.
ramp = np.geomspace(0.01, 1.0, 12)
patches = [[v, v, v] for v in ramp]
for r in (0.0, 0.5, 1.0):
    for g in (0.0, 0.5, 1.0):
        for b in (0.0, 0.5, 1.0):
            if (r, g, b) != (0.0, 0.0, 0.0):
                patches.append([r * 0.5, g * 0.5, b * 0.5])
patches = np.array(patches)[None, :, :]  # 1 x N x 3
np.save(OUT / 'input_rec2020_linear.npy', patches)

for stock, kind in (('kodak_kodachrome_64', 'positive'), ('kodak_portra_400', 'negative')):
    p = init_params(film_profile=stock, print_profile='kodak_portra_endura')
    p.io.input_color_space = 'ITU-R BT.2020'
    p.io.input_cctf_decoding = False
    p.io.scan_film = True
    p.io.input_gamut_compress = replace(p.io.input_gamut_compress, active=False)
    p.io.output_gamut_compress = replace(p.io.output_gamut_compress, algorithm='off')
    p.debug.lut_mode = True
    p.debug.deactivate_spatial_effects = True
    p.debug.deactivate_stochastic_effects = True
    p.camera.auto_exposure = False
    out = simulate(patches.copy(), digest_params(p))
    np.save(OUT / f'{stock}_scan_film_srgb.npy', np.asarray(out))
    # Plain text for the dependency-free Rust test: "r g b  er eg eb" per line.
    exp = np.asarray(out)[0]
    (OUT / f'{stock}.txt').write_text('\n'.join(
        ' '.join(f'{v:.9g}' for v in (*i, *e)) for i, e in zip(patches[0], exp)) + '\n')
    print(stock, kind, np.asarray(out).shape, np.asarray(out)[0, :3])

    if kind == 'negative':
        # Enlarger + paper print, scanned as the finished photograph.
        p.io.scan_film = False
        out = np.asarray(simulate(patches.copy(), digest_params(p)))
        np.save(OUT / f'{stock}_print_srgb.npy', out)
        (OUT / f'{stock}_print.txt').write_text('\n'.join(
            ' '.join(f'{v:.9g}' for v in (*i, *e)) for i, e in zip(patches[0], out[0])) + '\n')
        print(stock, 'print', out.shape, out[0, :3])
