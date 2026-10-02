//! Sub-pixel Boolean grain model (Monte Carlo).
//!
//! Each emulsion sub-layer is a Boolean model: developed silver-halide grains are dropped at
//! random positions on a continuous plane and their footprints are united (overlaps do not add
//! density). Every pixel owns a 16x16 bit raster of sub-pixel cells; a grain stamps a small
//! rectangle of cells (spilling into neighbouring pixels when it straddles an edge) and the
//! pixel's coverage is the popcount of its raster. Optical density is `Dmax_layer * coverage`.
//!
//! The number of developed grains per pixel is Poisson with a mean chosen so that the expected
//! coverage reproduces the density curve exactly: for coverage `c = p * u` (`p` = development
//! probability, `u` = grain uniformity = maximum coverage) the Boolean-model identity
//! `c = 1 - exp(-nu * s)` gives `nu * s = -ln(1 - p * u)`.
//!
//! Randomness is a counter-based hash of absolute pixel coordinates, the layer and a seed, so
//! the pattern is identical however an image is tiled.
//!
//! Layer structure, grain sizes and uniformity follow the spektrafilm grain model
//! (GPL-3.0, https://github.com/andreavolpato/spektrafilm).

use crate::blur;
use crate::film::Film;
use crate::pipeline::Params;

/// Sub-pixel cells per pixel edge.
pub const SUB: usize = 16;
const CELLS: f32 = (SUB * SUB) as f32;

/// Extra pixels around a tile payload that a grain can reach (footprint spill into neighbours).
pub const SPILL_PX: usize = 2;

/// Grain data baked with the film.
pub struct GrainFilm {
    pub particle_area_um2: f32,
    pub particle_scale: [f32; 3],
    pub particle_scale_layers: [f32; 3],
    pub density_min: [f32; 3],
    pub uniformity: [f32; 3],
    pub blur_px: f32,
    /// Max density of each sub-layer curve, index `[sublayer * 3 + ch]`.
    pub layer_max: [f32; 9],
    pub lut_n: usize,
    /// Sub-layer density vs total normalised density, index `[(ch * lut_n + i) * 3 + sublayer]`.
    pub layer_lut: Vec<f32>,
}

/// Grain blur radius (pixels) actually applied for these parameters.
pub fn blur_sigma(p: &Params) -> f32 {
    if p.grain_blur_px > 0.4 {
        p.grain_blur_px
    } else {
        0.0
    }
}

/// Extra halo (pixels) the grain stage needs around the payload.
pub fn halo(p: &Params) -> usize {
    SPILL_PX + (3.0 * blur_sigma(p)).ceil() as usize
}

#[inline]
fn splitmix(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[inline]
fn unit(r: u64) -> f32 {
    // 24 random bits -> [0,1)
    (r >> 40) as f32 * (1.0 / 16_777_216.0)
}

#[inline]
fn ln_fact(k: f32) -> f32 {
    let x = k + 1.0;
    let inv = 1.0 / x;
    (x - 0.5) * x.ln() - x + 0.918_938_5 + inv * (1.0 / 12.0 - inv * inv * (1.0 / 360.0 - inv * inv / 1260.0))
}

/// Poisson variate; Knuth for small means, Hormann's PTRS otherwise.
fn poisson(mu: f32, st: &mut u64) -> u32 {
    if mu <= 0.0 {
        return 0;
    }
    if mu < 10.0 {
        let l = (-mu).exp();
        let mut k = 0u32;
        let mut prod = unit(splitmix(st)).max(1e-12);
        while prod > l {
            k += 1;
            prod *= unit(splitmix(st)).max(1e-12);
            if k > 64 {
                break;
            }
        }
        return k;
    }
    let slam = mu.sqrt();
    let loglam = mu.ln();
    let b = 0.931 + 2.53 * slam;
    let a = -0.059 + 0.024_83 * b;
    let inv_alpha = 1.1239 + 1.1328 / (b - 3.4);
    let vr = 0.9277 - 3.6224 / (b - 2.0);
    loop {
        let r = splitmix(st);
        let u = unit(r) - 0.5;
        let v = unit(r << 24 | (r >> 40)).max(1e-9);
        let us = 0.5 - u.abs();
        let k = ((2.0 * a / us + b) * u + mu + 0.43).floor();
        if us >= 0.07 && v <= vr {
            return k.max(0.0) as u32;
        }
        if k < 0.0 || (us < 0.013 && v > us) {
            continue;
        }
        if v.ln() + inv_alpha.ln() - (a / (us * us) + b).ln() <= -mu + k * loglam - ln_fact(k) {
            return k as u32;
        }
    }
}

#[inline]
fn stamp(raster: &mut [u16], w: usize, h: usize, x: usize, y: usize, sx: usize, sy: usize, wc: usize, hc: usize) {
    let mask = ((1u32 << wc) - 1) << sx;
    let lo = mask as u16;
    let hi = (mask >> 16) as u16;
    let has_next_x = x + 1 < w && hi != 0;
    for r in 0..hc {
        let row = sy + r;
        let (py, rr) = if row >= SUB { (y + 1, row - SUB) } else { (y, row) };
        if py >= h {
            break;
        }
        let base = (py * w + x) * SUB + rr;
        raster[base] |= lo;
        if has_next_x {
            raster[base + SUB] |= hi;
        }
    }
}

/// Replace `density` (CMY, normalised so the film minimum is 0) with a grainy version.
pub fn apply(film: &Film, p: &Params, density: &mut [Vec<f32>; 3], w: usize, h: usize) {
    let g = &film.grain;
    let n = w * h;
    let pixel_area = p.pixel_size_um * p.pixel_size_um;
    let cell_area = pixel_area / CELLS;
    let mut raster = vec![0u16; n * SUB];
    let mut out: [Vec<f32>; 3] = [vec![0.0; n], vec![0.0; n], vec![0.0; n]];
    let origin_x = p.grain_origin_x as i64;
    let origin_y = p.grain_origin_y as i64;
    let seed = (p.grain_seed as u32 as u64).wrapping_mul(0xD1B5_4A32_D192_ED03);

    for ch in 0..3 {
        let layer_total: f32 = (0..3).map(|sl| g.layer_max[sl * 3 + ch]).sum();
        let dmax_total = film.density_max[ch].max(1e-6);
        let u = g.uniformity[ch].clamp(0.0, 0.999);
        let lut_scale = (g.lut_n - 1) as f32 / dmax_total;
        let lut = &g.layer_lut[ch * g.lut_n * 3..(ch + 1) * g.lut_n * 3];
        let dmin_ch = g.density_min[ch];

        for sl in 0..3 {
            let lmax = g.layer_max[sl * 3 + ch];
            let frac = (lmax / layer_total.max(1e-9)).max(1e-3);
            let dmin_l = frac * dmin_ch;
            let dmax_l = lmax + dmin_l;
            // Effective grain area: reference counts `pixel_area * frac / particle_area` grains per
            // layer, which matches grains of area `particle_area / frac` tiling the pixel once.
            let a_eff = g.particle_area_um2 * g.particle_scale[ch] * g.particle_scale_layers[sl] * p.grain_size
                / frac;
            let s_cells = (a_eff / cell_area).max(1e-3);
            let side = s_cells.sqrt().min(SUB as f32 - 1.0);
            let mu_scale = CELLS / (side * side);
            raster.fill(0);

            let layer_seed = seed ^ (((ch * 3 + sl) as u64 + 1) << 56);
            for y in 0..h {
                let ay = (origin_y + y as i64) as u64;
                for x in 0..w {
                    let i = y * w + x;
                    let d = density[ch][i].clamp(0.0, dmax_total);
                    let f = d * lut_scale;
                    let i0 = (f as usize).min(g.lut_n - 2);
                    let t = f - i0 as f32;
                    let d_l = lut[i0 * 3 + sl] * (1.0 - t) + lut[(i0 + 1) * 3 + sl] * t;
                    let pdev = ((d_l + dmin_l) / dmax_l).clamp(1e-6, 1.0);
                    let mu = -(1.0 - pdev * u).ln() * mu_scale;
                    let ax = (origin_x + x as i64) as u64;
                    let mut st = layer_seed ^ (ax << 32 | (ay & 0xFFFF_FFFF)).wrapping_mul(0xA24B_AED4_963E_E407);
                    let count = poisson(mu, &mut st);
                    for _ in 0..count {
                        let r = splitmix(&mut st);
                        let sx = (r & 15) as usize;
                        let sy = ((r >> 4) & 15) as usize;
                        let fw = ((r >> 8) & 0xFFFF) as f32 * (1.0 / 65536.0);
                        let fh = ((r >> 24) & 0xFFFF) as f32 * (1.0 / 65536.0);
                        let wc = (side + fw) as usize;
                        let hc = (side + fh) as usize;
                        if wc == 0 || hc == 0 {
                            continue;
                        }
                        stamp(&mut raster, w, h, x, y, sx, sy, wc.min(SUB), hc.min(SUB));
                    }
                }
            }
            let k = dmax_l / (u * CELLS);
            let plane = &mut out[ch];
            for i in 0..n {
                let mut bits = 0u32;
                for r in 0..SUB {
                    bits += raster[i * SUB + r].count_ones();
                }
                plane[i] += k * bits as f32;
            }
        }
        for v in out[ch].iter_mut() {
            *v -= dmin_ch;
        }
    }

    let sigma = blur_sigma(p);
    if sigma > 0.0 {
        let mut scratch = Vec::new();
        for c in 0..3 {
            blur::gaussian(&mut out[c], w, h, sigma, &mut scratch);
        }
    }
    let amount = p.grain_amount;
    for c in 0..3 {
        for i in 0..n {
            density[c][i] += amount * (out[c][i] - density[c][i]);
        }
    }
}
