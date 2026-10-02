//! Film emulation pipeline: linear Rec.2020 in, display-encoded sRGB out.

use crate::blur;
use crate::film::Film;

/// Tunable parameters. `PARAM_COUNT` f32 values in this order cross the FFI boundary.
#[derive(Clone, Debug)]
pub struct Params {
    /// Exposure compensation in stops.
    pub ev: f32,
    /// Film pixel pitch in micrometres (depends on tile scale).
    pub pixel_size_um: f32,
    pub halation_active: bool,
    pub scatter_amount: f32,
    pub scatter_scale: f32,
    pub scatter_core_um: [f32; 3],
    pub scatter_tail_um: [f32; 3],
    pub scatter_tail_weight: [f32; 3],
    pub halation_amount: f32,
    pub halation_scale: f32,
    pub halation_strength: [f32; 3],
    pub halation_sigma_um: [f32; 3],
    pub halation_bounces: u32,
    pub halation_decay: f32,
    pub halation_renormalize: bool,
    pub dir_active: bool,
    pub dir_diffusion_um: f32,
    pub dir_tail_um: f32,
    pub dir_tail_weight: f32,
    /// Invert negatives to a positive image (false returns the raw negative scan).
    pub invert: bool,
    /// Overall tonal contrast of the inverted negative (1 = scene-linear reproduction).
    pub contrast: f32,
    pub grain_active: bool,
    /// Blend between the smooth density (0) and the grainy density (1).
    pub grain_amount: f32,
    /// Multiplier on grain particle area.
    pub grain_size: f32,
    /// Gaussian softening of the grain field in pixels (the film's own value by default).
    pub grain_blur_px: f32,
    pub grain_seed: f32,
    /// Absolute pixel coordinates of the tile's top-left corner (halo included).
    pub grain_origin_x: f32,
    pub grain_origin_y: f32,
}

pub const PARAM_COUNT: usize = 38;

impl Params {
    pub fn from_slice(v: &[f32]) -> Option<Params> {
        if v.len() < PARAM_COUNT {
            return None;
        }
        let a3 = |i: usize| [v[i], v[i + 1], v[i + 2]];
        Some(Params {
            ev: v[0],
            pixel_size_um: v[1],
            halation_active: v[2] != 0.0,
            scatter_amount: v[3],
            scatter_scale: v[4],
            scatter_core_um: a3(5),
            scatter_tail_um: a3(8),
            scatter_tail_weight: a3(11),
            halation_amount: v[14],
            halation_scale: v[15],
            halation_strength: a3(16),
            halation_sigma_um: a3(19),
            halation_bounces: v[22].max(0.0) as u32,
            halation_decay: v[23],
            halation_renormalize: v[24] != 0.0,
            dir_active: v[25] != 0.0,
            dir_diffusion_um: v[26],
            dir_tail_um: v[27],
            dir_tail_weight: v[28],
            invert: v[29] != 0.0,
            contrast: v[30],
            grain_active: v[31] != 0.0,
            grain_amount: v[32],
            grain_size: v[33],
            grain_blur_px: v[34],
            grain_seed: v[35],
            grain_origin_x: v[36],
            grain_origin_y: v[37],
        })
    }
}

type Planes = [Vec<f32>; 3];

/// Halo (pixels) a tile needs around its payload so spatial filters see real neighbours.
pub fn required_halo(p: &Params) -> usize {
    let ps = p.pixel_size_um.max(1e-3);
    let mut um = 0.0f32;
    if p.halation_active {
        let s = p.scatter_tail_um.iter().cloned().fold(0.0, f32::max) * p.scatter_scale * 6.0;
        let hsig = p.halation_sigma_um.iter().cloned().fold(0.0, f32::max)
            * p.halation_scale
            * (p.halation_bounces.max(1) as f32).sqrt()
            * 3.5;
        um = um.max(s).max(hsig);
    }
    if p.dir_active {
        um = um.max(p.dir_tail_um * 6.0).max(p.dir_diffusion_um * 4.0);
    }
    let mut px = (um / ps).ceil() as usize;
    if p.grain_active {
        px += crate::grain::halo(p);
    }
    px
}

#[inline]
fn tri2quad(x: f32, y: f32) -> (f32, f32) {
    let ty = y / (1.0 - x).max(1e-10);
    let qx = ((1.0 - x) * (1.0 - x)).clamp(0.0, 1.0);
    (qx, ty.clamp(0.0, 1.0))
}

fn tc_lookup(film: &Film, qx: f32, qy: f32) -> [f32; 3] {
    let n = film.tc_n;
    let s = (n - 1) as f32;
    let fx = qx * s;
    let fy = qy * s;
    let x0 = (fx.floor() as usize).min(n - 2);
    let y0 = (fy.floor() as usize).min(n - 2);
    let tx = fx - x0 as f32;
    let ty = fy - y0 as f32;
    let at = |x: usize, y: usize, c: usize| film.tc_lut[(x * n + y) * 3 + c];
    let mut o = [0.0; 3];
    for c in 0..3 {
        let a = at(x0, y0, c) * (1.0 - tx) + at(x0 + 1, y0, c) * tx;
        let b = at(x0, y0 + 1, c) * (1.0 - tx) + at(x0 + 1, y0 + 1, c) * tx;
        o[c] = a * (1.0 - ty) + b * ty;
    }
    o
}

/// Linear Rec.2020 -> film raw exposure (relative to mid-gray = 1).
fn expose(film: &Film, rgb: &[f32], n: usize, gain: f32, out: &mut Planes) {
    let m = &film.rgb2xyz;
    for i in 0..n {
        let (r, g, b) = (rgb[3 * i], rgb[3 * i + 1], rgb[3 * i + 2]);
        let x = m[0] * r + m[1] * g + m[2] * b;
        let y = m[3] * r + m[4] * g + m[5] * b;
        let z = m[6] * r + m[7] * g + m[8] * b;
        let s = x + y + z;
        let s = if s.is_finite() { s } else { 0.0 };
        let inv = 1.0 / s.max(1e-10);
        let (qx, qy) = tri2quad(x * inv, y * inv);
        let l = tc_lookup(film, qx, qy);
        for c in 0..3 {
            out[c][i] = l[c] * s * gain;
        }
    }
}

fn scatter_and_halation(p: &Params, raw: &mut Planes, w: usize, h: usize) {
    if !p.halation_active {
        return;
    }
    let ps = p.pixel_size_um;
    let n = w * h;
    let mut scratch = Vec::new();
    for c in 0..3 {
        let plane = &mut raw[c];
        let sigma_c = p.scatter_core_um[c] * p.scatter_scale / ps;
        let lambda_t = p.scatter_tail_um[c] * p.scatter_scale / ps;
        if p.scatter_amount > 0.0 && (sigma_c > 0.0 || lambda_t > 0.0) {
            let mut core = plane.clone();
            blur::gaussian(&mut core, w, h, sigma_c.max(1e-6), &mut scratch);
            let mut tail = plane.clone();
            blur::exponential(&mut tail, w, h, lambda_t.max(1e-6));
            let ws = p.scatter_tail_weight[c];
            let s = p.scatter_amount;
            for i in 0..n {
                let scattered = (1.0 - ws) * core[i] + ws * tail[i];
                plane[i] = (1.0 - s) * plane[i] + s * scattered;
            }
        }
        let a_tot = p.halation_strength[c] * p.halation_amount;
        let sigma_h = p.halation_sigma_um[c] * p.halation_scale / ps;
        let nb = p.halation_bounces as usize;
        if nb >= 1 && a_tot > 0.0 && sigma_h > 0.0 {
            let mut wts: Vec<f32> = (0..nb).map(|k| p.halation_decay.powi(k as i32)).collect();
            let sum: f32 = wts.iter().sum();
            wts.iter_mut().for_each(|v| *v /= sum);
            let mut acc = vec![0.0f32; n];
            for (k, wk) in wts.iter().enumerate() {
                let mut b = plane.clone();
                blur::gaussian(&mut b, w, h, (sigma_h * ((k + 1) as f32).sqrt()).max(1e-6), &mut scratch);
                for i in 0..n {
                    acc[i] += wk * b[i];
                }
            }
            let norm = if p.halation_renormalize { 1.0 / (1.0 + a_tot) } else { 1.0 };
            for i in 0..n {
                plane[i] = (plane[i] + a_tot * acc[i]) * norm;
            }
        }
    }
}

/// Piecewise-linear interpolation with end clamping and right-biased ties (np.interp style).
#[inline]
fn interp(x: f32, xs: &[f32], ys: &[f32], ch: usize) -> f32 {
    let k = xs.len();
    if x <= xs[0] {
        return ys[ch];
    }
    if x >= xs[k - 1] {
        return ys[(k - 1) * 3 + ch];
    }
    let hi = xs.partition_point(|&v| v <= x).min(k - 1).max(1);
    let lo = hi - 1;
    let dx = xs[hi] - xs[lo];
    if dx <= 0.0 {
        return ys[hi * 3 + ch];
    }
    let t = (x - xs[lo]) / dx;
    ys[lo * 3 + ch] * (1.0 - t) + ys[hi * 3 + ch] * t
}

fn develop(film: &Film, log_raw: &Planes, curves: &[f32], n: usize, out: &mut Planes) {
    for c in 0..3 {
        for i in 0..n {
            out[c][i] = interp(log_raw[c][i], &film.log_exposure, curves, c);
        }
    }
}

fn dir_couplers(film: &Film, p: &Params, log_raw: &Planes, density: &mut Planes, w: usize, h: usize) {
    let n = w * h;
    let m = &film.dir_matrix;
    let mut corr: Planes = [vec![0.0; n], vec![0.0; n], vec![0.0; n]];
    for i in 0..n {
        let mut silver = [density[0][i], density[1][i], density[2][i]];
        if film.positive {
            for c in 0..3 {
                silver[c] = film.density_max[c] - silver[c];
            }
        }
        for r in 0..3 {
            corr[r][i] = silver[0] * m[r] + silver[1] * m[3 + r] + silver[2] * m[6 + r];
        }
    }
    if p.dir_diffusion_um > 0.0 {
        let sg = p.dir_diffusion_um / p.pixel_size_um;
        let lt = p.dir_tail_um / p.pixel_size_um;
        let wt = p.dir_tail_weight;
        let mut scratch = Vec::new();
        for c in 0..3 {
            let mut tail = corr[c].clone();
            blur::exponential(&mut tail, w, h, lt);
            blur::gaussian(&mut corr[c], w, h, sg, &mut scratch);
            for i in 0..n {
                corr[c][i] = (1.0 - wt) * corr[c][i] + wt * tail[i];
            }
        }
    }
    let mut shifted: Planes = [vec![0.0; n], vec![0.0; n], vec![0.0; n]];
    for c in 0..3 {
        for i in 0..n {
            shifted[c][i] = log_raw[c][i] - corr[c][i];
        }
    }
    develop(film, &shifted, &film.curves0, n, density);
}

#[inline]
fn srgb_encode(v: f32) -> f32 {
    let v = v.clamp(0.0, 1.0);
    if v <= 0.003_130_8 {
        12.92 * v
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}

/// density (CMY) -> linear sRGB via the baked scanner LUT (trilinear in log-XYZ).
fn scan_linear(film: &Film, density: &Planes, n: usize, out: &mut [f32]) {
    let sn = film.scan_n;
    let last = (sn - 1) as f32;
    let at = |r: usize, g: usize, b: usize, c: usize| film.scan_lut[((r * sn + g) * sn + b) * 3 + c];
    let m = &film.xyz2rgb;
    let mut inv = [0.0f32; 3];
    for c in 0..3 {
        inv[c] = last / (film.scan_max[c] - film.scan_min[c]);
    }
    for i in 0..n {
        let mut f = [0.0f32; 3];
        let mut i0 = [0usize; 3];
        for c in 0..3 {
            let u = ((density[c][i] - film.scan_min[c]) * inv[c]).clamp(0.0, last);
            i0[c] = (u.floor() as usize).min(sn - 2);
            f[c] = u - i0[c] as f32;
        }
        let mut xyz = [0.0f32; 3];
        for k in 0..3 {
            let mut v = 0.0;
            for corner in 0..8 {
                let (dr, dg, db) = (corner & 1, (corner >> 1) & 1, (corner >> 2) & 1);
                let wgt = (if dr == 1 { f[0] } else { 1.0 - f[0] })
                    * (if dg == 1 { f[1] } else { 1.0 - f[1] })
                    * (if db == 1 { f[2] } else { 1.0 - f[2] });
                v += wgt * at(i0[0] + dr, i0[1] + dg, i0[2] + db, k);
            }
            xyz[k] = 10f32.powf(v);
        }
        for c in 0..3 {
            out[3 * i + c] = m[3 * c] * xyz[0] + m[3 * c + 1] * xyz[1] + m[3 * c + 2] * xyz[2];
        }
    }
}

const MID_GRAY: f32 = 0.184;

/// Derives the negative-inversion anchors from the film's own response to neutral exposures,
/// so a neutral mid-gray comes out neutral without analysing the image.
pub fn calibrate(film: &mut Film) {
    if film.positive {
        return;
    }
    let one = |film: &Film, scene: f32| -> [f32; 3] {
        let mut raw: Planes = [vec![0.0], vec![0.0], vec![0.0]];
        expose(film, &[scene, scene, scene], 1, 1.0, &mut raw);
        let mut d: Planes = [vec![0.0], vec![0.0], vec![0.0]];
        for c in 0..3 {
            raw[c][0] = (raw[c][0].max(0.0) + 1e-10).log10();
        }
        develop(film, &raw, &film.curves, 1, &mut d);
        let mut lin = [0.0f32; 3];
        scan_linear(film, &d, 1, &mut lin);
        lin
    };
    let zero: Planes = [vec![0.0], vec![0.0], vec![0.0]];
    let mut base = [0.0f32; 3];
    scan_linear(film, &zero, 1, &mut base);
    let dens = |lin: [f32; 3]| -> [f32; 3] {
        let mut d = [0.0; 3];
        for c in 0..3 {
            d[c] = -((lin[c] / base[c]).max(1e-6)).log10();
        }
        d
    };
    let lo = dens(one(film, MID_GRAY * 0.5));
    let mid = dens(one(film, MID_GRAY));
    let hi = dens(one(film, MID_GRAY * 2.0));
    let span = 4.0f32.log10();
    film.neg_base = base;
    film.neg_d_mid = mid;
    // Per-channel slopes neutralise the grey axis across the tonal range.
    for c in 0..3 {
        film.neg_slope[c] = ((hi[c] - lo[c]) / span).max(0.05);
    }
}

/// Linear scan -> display. Positives are encoded directly; negatives are inverted first.
fn finish(film: &Film, p: &Params, lin: &[f32], n: usize, out: &mut [f32]) {
    if film.positive || !p.invert {
        for i in 0..n * 3 {
            out[i] = srgb_encode(lin[i]);
        }
        return;
    }
    let log_mid = MID_GRAY.log10();
    for i in 0..n {
        for c in 0..3 {
            let t = (lin[3 * i + c] / film.neg_base[c]).max(1e-6);
            let d = -t.log10();
            let gamma = p.contrast / film.neg_slope[c];
            let y = 10f32.powf(log_mid + gamma * (d - film.neg_d_mid[c]));
            out[3 * i + c] = srgb_encode(shoulder(y));
        }
    }
}

/// Soft highlight roll-off: identity below the knee, asymptotic to 1 above it.
#[inline]
fn shoulder(y: f32) -> f32 {
    const KNEE: f32 = 0.8;
    if y <= KNEE {
        y.max(0.0)
    } else {
        KNEE + (1.0 - KNEE) * ((y - KNEE) / (1.0 - KNEE)).tanh()
    }
}

/// Process one tile. `input` is interleaved linear Rec.2020 (w*h*3); `output` receives
/// interleaved display-encoded sRGB in [0,1].
pub fn process_tile(film: &Film, p: &Params, input: &[f32], output: &mut [f32], w: usize, h: usize) {
    let n = w * h;
    let mut raw: Planes = [vec![0.0; n], vec![0.0; n], vec![0.0; n]];
    expose(film, input, n, p.ev.exp2(), &mut raw);
    scatter_and_halation(p, &mut raw, w, h);
    for c in 0..3 {
        for v in raw[c].iter_mut() {
            *v = (v.max(0.0) + 1e-10).log10();
        }
    }
    let log_raw = raw;
    let mut density: Planes = [vec![0.0; n], vec![0.0; n], vec![0.0; n]];
    develop(film, &log_raw, &film.curves, n, &mut density);
    if p.dir_active {
        dir_couplers(film, p, &log_raw, &mut density, w, h);
    }
    if p.grain_active && p.grain_amount != 0.0 {
        crate::grain::apply(film, p, &mut density, w, h);
    }
    let mut lin = vec![0.0f32; n * 3];
    scan_linear(film, &density, n, &mut lin);
    finish(film, p, &lin, n, output);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn portra() -> Film {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/film/kodak_portra_400.fsp");
        Film::parse(&std::fs::read(p).unwrap()).unwrap()
    }

    fn params() -> Params {
        let mut v = vec![0.0f32; PARAM_COUNT];
        v[1] = 6.0;
        v[29] = 1.0;
        v[30] = 1.0;
        Params::from_slice(&v).unwrap()
    }

    #[test]
    fn inverted_negative_keeps_mid_gray_neutral_and_monotonic() {
        let film = portra();
        let p = params();
        let levels = [0.02f32, 0.05, 0.1, 0.184, 0.4, 0.8];
        let input: Vec<f32> = levels.iter().flat_map(|&l| [l, l, l]).collect();
        let mut out = vec![0.0; input.len()];
        process_tile(&film, &p, &input, &mut out, levels.len(), 1);
        let mid = &out[9..12];
        println!("slope {:?} mid {:?}", film.neg_slope, mid);
        let expect = srgb_encode(MID_GRAY);
        for c in mid {
            assert!((c - expect).abs() < 0.02, "mid {c} vs {expect}");
        }
        for (i, l) in levels.iter().enumerate() {
            println!("{l} -> {:?}", &out[3 * i..3 * i + 3]);
        }
        for i in 1..levels.len() {
            assert!(out[3 * i + 1] > out[3 * (i - 1) + 1], "not monotonic at {i}");
        }
    }
}
