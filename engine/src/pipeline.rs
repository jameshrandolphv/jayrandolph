//! Film emulation pipeline: linear Rec.2020 in, display-encoded sRGB out.

use crate::blur;
use crate::film::{Film, Print, Projection};

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
    /// Negatives: enlarger + paper print. Slides: projection tone stage.
    pub print_active: bool,
    /// Print (or projector) exposure in stops.
    pub print_ev: f32,
    /// Inverted negatives without a print: lab-scanner style S-curve instead of a plain power law.
    pub lab_scan: bool,
    /// Display-referred S-curve strength about mid-gray (0 = off).
    pub punch: f32,
    /// Extra saturation applied after the S-curve (0 = off).
    pub saturation: f32,
    /// Tone sliders, each in -1..1 (0 = off).
    pub whites: f32,
    pub highlights: f32,
    pub blacks: f32,
    pub shadows: f32,
    /// Colour sliders, each in -1..1; positive temperature is warmer, positive tint is magenta.
    pub temperature: f32,
    pub tint: f32,
}

pub const PARAM_COUNT: usize = 49;

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
            print_active: v[38] != 0.0,
            print_ev: v[39],
            lab_scan: v[40] != 0.0,
            punch: v[41],
            saturation: v[42],
            whites: v[43],
            highlights: v[44],
            blacks: v[45],
            shadows: v[46],
            temperature: v[47],
            tint: v[48],
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
    srgb_encode_open(v.clamp(0.0, 1.0))
}

/// sRGB transfer function without the upper clamp (values above 1 map above 1).
#[inline]
fn srgb_encode_open(v: f32) -> f32 {
    let v = v.max(0.0);
    if v <= 0.003_130_8 {
        12.92 * v
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}

/// Trilinear lookup of a 3-D table indexed [a][b][c][ch] over the per-axis range `lo..hi`.
#[inline]
fn trilinear(lut: &[f32], sn: usize, lo: &[f32; 3], hi: &[f32; 3], d: [f32; 3]) -> [f32; 3] {
    let last = (sn - 1) as f32;
    let mut f = [0.0f32; 3];
    let mut i0 = [0usize; 3];
    for c in 0..3 {
        let u = ((d[c] - lo[c]) * last / (hi[c] - lo[c])).clamp(0.0, last);
        i0[c] = (u.floor() as usize).min(sn - 2);
        f[c] = u - i0[c] as f32;
    }
    let mut o = [0.0f32; 3];
    for corner in 0..8 {
        let (da, db, dc) = (corner & 1, (corner >> 1) & 1, (corner >> 2) & 1);
        let wgt = (if da == 1 { f[0] } else { 1.0 - f[0] })
            * (if db == 1 { f[1] } else { 1.0 - f[1] })
            * (if dc == 1 { f[2] } else { 1.0 - f[2] });
        let base = (((i0[0] + da) * sn + i0[1] + db) * sn + i0[2] + dc) * 3;
        for k in 0..3 {
            o[k] += wgt * lut[base + k];
        }
    }
    o
}

/// density (CMY) -> linear sRGB via the baked scanner LUT (trilinear in log-XYZ).
fn scan_linear(film: &Film, density: &Planes, n: usize, out: &mut [f32]) {
    let m = &film.xyz2rgb;
    for i in 0..n {
        let d = [density[0][i], density[1][i], density[2][i]];
        let lx = trilinear(&film.scan_lut, film.scan_n, &film.scan_min, &film.scan_max, d);
        let xyz = [10f32.powf(lx[0]), 10f32.powf(lx[1]), 10f32.powf(lx[2])];
        for c in 0..3 {
            out[3 * i + c] = m[3 * c] * xyz[0] + m[3 * c + 1] * xyz[1] + m[3 * c + 2] * xyz[2];
        }
    }
}

/// Negative density -> enlarger exposure -> paper curves -> paper scan, as display sRGB.
fn print_stage(film: &Film, pr: &Print, p: &Params, density: &Planes, n: usize, out: &mut [f32]) {
    // Positive print exposure brightens the result, so it removes light from the paper.
    let shift = -p.print_ev * std::f32::consts::LOG10_2;
    let m = &pr.xyz2rgb;
    for i in 0..n {
        let d = [density[0][i], density[1][i], density[2][i]];
        let raw = trilinear(&pr.raw_lut, pr.n, &film.scan_min, &film.scan_max, d);
        let mut paper = [0.0f32; 3];
        for c in 0..3 {
            paper[c] = interp(raw[c] + shift, &pr.log_exposure, &pr.curves, c);
        }
        let lx = trilinear(&pr.scan_lut, pr.n, &pr.scan_min, &pr.scan_max, paper);
        let xyz = [10f32.powf(lx[0]), 10f32.powf(lx[1]), 10f32.powf(lx[2])];
        for c in 0..3 {
            let v = m[3 * c] * xyz[0] + m[3 * c + 1] * xyz[1] + m[3 * c + 2] * xyz[2];
            out[3 * i + c] = srgb_encode(v);
        }
    }
}

#[inline]
fn luminance(c: [f32; 3]) -> f32 {
    0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/// Power-law gamma about mid-gray; stands in for the dark-room contrast of a projected slide.
const SLIDE_CONTRAST: f32 = 1.25;

/// Slide viewing: black/white anchored to the film's own Dmax/Dmin, then contrast about mid-gray.
fn project(film: &Film, p: &Params, lin: &[f32], n: usize, out: &mut [f32]) {
    let pj = &film.proj;
    let span = (pj.white_y - luminance(pj.black)).max(1e-6);
    let gain = p.print_ev.exp2();
    for i in 0..n {
        let mut c = [0.0f32; 3];
        for k in 0..3 {
            c[k] = ((lin[3 * i + k] - pj.black[k]) / span).max(0.0) * gain;
        }
        let y = luminance(c);
        let s = if y > 1e-6 {
            shoulder(pj.mid_y * (y / pj.pivot).powf(SLIDE_CONTRAST)) / y
        } else {
            0.0
        };
        for k in 0..3 {
            out[3 * i + k] = srgb_encode(c[k] * s);
        }
    }
}

const MID_GRAY: f32 = 0.184;

/// Derives the negative-inversion anchors from the film's own response to neutral exposures,
/// so a neutral mid-gray comes out neutral without analysing the image.
pub fn calibrate(film: &mut Film) {
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
    if film.positive {
        let deepest: Planes = [
            vec![film.density_max[0]],
            vec![film.density_max[1]],
            vec![film.density_max[2]],
        ];
        let mut black = [0.0f32; 3];
        scan_linear(film, &deepest, 1, &mut black);
        let (yw, yb) = (luminance(base), luminance(black));
        let ym = luminance(one(film, MID_GRAY));
        film.proj = Projection {
            white_y: yw,
            black,
            pivot: ((ym - yb) / (yw - yb).max(1e-6)).max(1e-4),
            mid_y: ym,
        };
        return;
    }
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
    let gain = if p.lab_scan { p.print_ev.exp2() } else { 1.0 };
    for i in 0..n {
        for c in 0..3 {
            let t = (lin[3 * i + c] / film.neg_base[c]).max(1e-6);
            let d = -t.log10();
            if p.lab_scan {
                let gamma = 1.0 / film.neg_slope[c];
                let y = 10f32.powf(log_mid + gamma * (d - film.neg_d_mid[c])) * gain;
                out[3 * i + c] = lab_curve(srgb_encode_open(y));
            } else {
                let gamma = p.contrast / film.neg_slope[c];
                let y = 10f32.powf(log_mid + gamma * (d - film.neg_d_mid[c]));
                out[3 * i + c] = srgb_encode(shoulder(y));
            }
        }
    }
}

/// Mid-slope of the lab-scan curve.
const LAB_GAIN: f32 = 1.1;
/// Reach of the toe (below mid-gray) and shoulder (above) in display units; the toe's asymptote is a lifted black.
const LAB_TOE: f32 = 0.62;
const LAB_SHOULDER: f32 = 0.5;

/// Soft S-curve about mid-gray on display-encoded values: lifted blacks, rolled-off highlights.
#[inline]
fn lab_curve(e: f32) -> f32 {
    let pivot = srgb_encode(MID_GRAY);
    let u = e - pivot;
    let r = if u >= 0.0 {
        LAB_SHOULDER * (LAB_GAIN * u / LAB_SHOULDER).tanh()
    } else {
        -LAB_TOE * (-LAB_GAIN * u / LAB_TOE).tanh()
    };
    (pivot + r).clamp(0.0, 1.0)
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

/// Largest display-value shift a tone slider makes at +/-1.
const TONE_RANGE: f32 = 0.18;
/// Channel gain swing of the temperature and tint sliders at +/-1.
const TEMP_RANGE: f32 = 0.12;
const TINT_RANGE: f32 = 0.10;

/// Raised-cosine bump of half-width `r` centred on `c`.
#[inline]
fn bump(x: f32, c: f32, r: f32) -> f32 {
    let u = (x - c).abs() / r;
    if u >= 1.0 {
        0.0
    } else {
        let k = (u * std::f32::consts::FRAC_PI_2).cos();
        k * k
    }
}

/// Luminance remap from the whites/highlights/shadows/blacks sliders.
#[inline]
fn tone_shift(p: &Params, l: f32) -> f32 {
    let d = p.whites * l.powi(3)
        + p.highlights * bump(l, 0.75, 0.4)
        + p.shadows * bump(l, 0.25, 0.4)
        + p.blacks * (1.0 - l).powi(3);
    TONE_RANGE * d
}

/// Film look (S-curve about display mid-gray, saturation) then the user tone and colour grade.
fn apply_look(p: &Params, out: &mut [f32]) {
    let tone = p.whites != 0.0 || p.highlights != 0.0 || p.shadows != 0.0 || p.blacks != 0.0;
    let wb = p.temperature != 0.0 || p.tint != 0.0;
    if p.punch == 0.0 && p.saturation == 0.0 && !tone && !wb {
        return;
    }
    let gains = [
        1.0 + TEMP_RANGE * p.temperature,
        1.0 - TINT_RANGE * p.tint,
        1.0 - TEMP_RANGE * p.temperature,
    ];
    let pivot = srgb_encode(MID_GRAY);
    let g = 1.0 + p.punch;
    let curve = |x: f32| {
        let x = x.clamp(0.0, 1.0);
        if x < pivot {
            pivot * (x / pivot).powf(g)
        } else {
            1.0 - (1.0 - pivot) * ((1.0 - x) / (1.0 - pivot)).powf(g)
        }
    };
    let k = 1.0 + p.saturation;
    for px in out.chunks_exact_mut(3) {
        let mut c = [curve(px[0]), curve(px[1]), curve(px[2])];
        if tone {
            let shift = tone_shift(p, luminance(c).clamp(0.0, 1.0));
            for v in c.iter_mut() {
                *v = (*v + shift).clamp(0.0, 1.0);
            }
        }
        let l = luminance(c);
        for i in 0..3 {
            let v = l + (c[i] - l) * k;
            px[i] = (if wb { v * gains[i] } else { v }).clamp(0.0, 1.0);
        }
    }
}

/// Process one tile. `input` is interleaved linear Rec.2020 (w*h*3); `output` receives
/// interleaved display-encoded sRGB in [0,1].
pub fn process_tile(film: &Film, p: &Params, input: &[f32], output: &mut [f32], w: usize, h: usize) {
    render_tile(film, p, input, output, w, h);
    apply_look(p, output);
}

fn render_tile(film: &Film, p: &Params, input: &[f32], output: &mut [f32], w: usize, h: usize) {
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
    if p.print_active {
        if let Some(print) = film.print.as_ref() {
            print_stage(film, print, p, &density, n, output);
            return;
        }
    }
    scan_linear(film, &density, n, &mut lin);
    if p.print_active && film.positive {
        project(film, p, &lin, n, output);
        return;
    }
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

    #[test]
    fn grade_sliders_move_in_the_expected_direction() {
        let film = portra();
        let input = [0.05f32, 0.05, 0.05, 0.184, 0.184, 0.184, 0.7, 0.7, 0.7];
        let run = |set: &dyn Fn(&mut Params)| {
            let mut p = params();
            set(&mut p);
            let mut out = vec![0.0; 9];
            process_tile(&film, &p, &input, &mut out, 3, 1);
            out
        };
        let base = run(&|_| {});
        let shadows = run(&|p| p.shadows = 1.0);
        assert!(shadows[0] > base[0] + 0.02);
        let highlights = run(&|p| p.highlights = -1.0);
        assert!(highlights[6] < base[6] - 0.02);
        let warm = run(&|p| p.temperature = 1.0);
        assert!(warm[3] > base[3] && warm[5] < base[5]);
        let magenta = run(&|p| p.tint = 1.0);
        assert!(magenta[4] < base[4]);
        let mono = run(&|p| p.saturation = -1.0);
        assert!((mono[3] - mono[4]).abs() < 1e-4 && (mono[4] - mono[5]).abs() < 1e-4);
    }

    const RAMP: [f32; 8] = [0.01, 0.03, 0.08, 0.184, 0.4, 0.7, 1.0, 1.5];

    /// Neutral-ramp green channel through `process_tile`.
    fn ramp(film: &Film, print: bool, print_ev: f32) -> Vec<[f32; 3]> {
        let mut p = params();
        p.print_active = print;
        p.print_ev = print_ev;
        let input: Vec<f32> = RAMP.iter().flat_map(|&l| [l, l, l]).collect();
        let mut out = vec![0.0; input.len()];
        process_tile(film, &p, &input, &mut out, RAMP.len(), 1);
        out.chunks(3).map(|c| [c[0], c[1], c[2]]).collect()
    }

    fn load(stock: &str) -> Film {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../public/film/{stock}.fsp"));
        Film::parse(&std::fs::read(p).unwrap()).unwrap()
    }

    #[test]
    fn print_deepens_tone_scale_and_keeps_mid_gray() {
        let film = portra();
        let flat = ramp(&film, false, 0.0);
        let printed = ramp(&film, true, 0.0);
        println!("flat    {flat:?}\nprinted {printed:?}");
        let mid = srgb_encode(MID_GRAY);
        assert!((printed[3][1] - mid).abs() < 0.03, "mid {}", printed[3][1]);
        for i in 1..RAMP.len() {
            assert!(printed[i][1] >= printed[i - 1][1], "not monotonic at {i}");
        }
        // Deeper shadows and a steeper midtone than the plain inversion.
        assert!(printed[0][1] < flat[0][1]);
        let slope = |r: &[[f32; 3]]| (r[4][1] - r[2][1]) / (RAMP[4] / RAMP[2]).log2();
        assert!(slope(&printed) > slope(&flat) * 0.9);
    }

    #[test]
    fn lab_scan_is_softer_than_print_and_keeps_mid_gray() {
        for stock in ["kodak_portra_400", "kodak_tri_x_400"] {
            let film = load(stock);
            let mut p = params();
            p.lab_scan = true;
            let input: Vec<f32> = RAMP.iter().flat_map(|&l| [l, l, l]).collect();
            let mut out = vec![0.0; input.len()];
            process_tile(&film, &p, &input, &mut out, RAMP.len(), 1);
            let lab: Vec<[f32; 3]> = out.chunks(3).map(|c| [c[0], c[1], c[2]]).collect();
            let printed = ramp(&film, true, 0.0);
            println!("{stock} lab {lab:?}\nprinted {printed:?}");
            let mid = srgb_encode(MID_GRAY);
            assert!((lab[3][1] - mid).abs() < 0.03, "{stock} mid {}", lab[3][1]);
            let spread = lab[3].iter().cloned().fold(0.0f32, f32::max) - lab[3].iter().cloned().fold(1.0f32, f32::min);
            assert!(spread < 0.03, "{stock} mid-gray tinted: {:?}", lab[3]);
            for i in 1..RAMP.len() {
                assert!(lab[i][1] >= lab[i - 1][1], "{stock} not monotonic at {i}");
            }
            // Lifted black, rolled-off white, and a gentler midtone than the print.
            assert!(lab[0][1] > printed[0][1] + 0.02, "{stock} toe");
            assert!(lab[6][1] < 0.97, "{stock} shoulder {}", lab[6][1]);
            let slope = |r: &[[f32; 3]]| (r[4][1] - r[2][1]) / (RAMP[4] / RAMP[2]).log2();
            assert!(slope(&lab) < slope(&printed), "{stock} midtone slope");
        }
    }

    #[test]
    fn print_exposure_lightens_and_darkens() {
        let film = portra();
        let dark = ramp(&film, true, -1.0);
        let light = ramp(&film, true, 1.0);
        println!("dark {:?}\nlight {:?}", dark, light);
        assert!(light[3][1] > dark[3][1] + 0.1);
    }

    #[test]
    fn slide_projection_deepens_ends_and_keeps_pivot() {
        let film = load("kodak_kodachrome_64");
        let scan = ramp(&film, false, 0.0);
        let proj = ramp(&film, true, 0.0);
        println!("scan {scan:?}\nproj {proj:?}");
        assert!((proj[3][1] - scan[3][1]).abs() < 0.03, "pivot moved");
        assert!(proj[0][1] < scan[0][1]);
        assert!(proj[6][1] > scan[6][1]);
        assert!(proj[7][1] <= 1.0);
        for i in 1..RAMP.len() {
            assert!(proj[i][1] >= proj[i - 1][1], "not monotonic at {i}");
        }
    }
}
