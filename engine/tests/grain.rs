//! Statistical checks of the sub-pixel Boolean grain model against the reference
//! (spektrafilm) Poisson-binomial layer model, plus tile independence.

use film_engine::film::Film;
use film_engine::grain;
use film_engine::pipeline::{process_tile, required_halo, Params, PARAM_COUNT};

fn load(stock: &str) -> Film {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../public/film/{stock}.fsp"));
    Film::parse(&std::fs::read(p).unwrap()).unwrap()
}

fn params(pixel_um: f32, blur: f32) -> Params {
    let mut v = vec![0.0f32; PARAM_COUNT];
    v[1] = pixel_um;
    v[29] = 1.0; // invert
    v[30] = 1.0; // contrast
    v[31] = 1.0; // grain on
    v[32] = 1.0; // amount
    v[33] = 1.0; // size
    v[34] = blur;
    v[35] = 7.0; // seed
    Params::from_slice(&v).unwrap()
}

/// Expected (mean, std) of the reference model for a flat patch at total density `d` in `ch`.
fn reference_stats(film: &Film, ch: usize, d: f32, pixel_um: f32) -> (f32, f32) {
    let g = &film.grain;
    let total: f32 = (0..3).map(|sl| g.layer_max[sl * 3 + ch]).sum();
    let lut_n = g.lut_n;
    let f = d / film.density_max[ch] * (lut_n - 1) as f32;
    let i0 = (f as usize).min(lut_n - 2);
    let t = f - i0 as f32;
    let (mut mean, mut var) = (0.0f32, 0.0f32);
    for sl in 0..3 {
        let lmax = g.layer_max[sl * 3 + ch];
        let frac = lmax / total;
        let dmin_l = frac * g.density_min[ch];
        let dmax_l = lmax + dmin_l;
        let lut = &g.layer_lut[ch * lut_n * 3..];
        let dl = lut[i0 * 3 + sl] * (1.0 - t) + lut[(i0 + 1) * 3 + sl] * t;
        let p = ((dl + dmin_l) / dmax_l).clamp(1e-6, 1.0 - 1e-6);
        let a = g.particle_area_um2 * g.particle_scale[ch] * g.particle_scale_layers[sl];
        let n = pixel_um * pixel_um * frac / a;
        let sat = 1.0 - p * g.uniformity[ch] * (1.0 - 1e-6);
        mean += dmax_l * p;
        var += dmax_l * dmax_l * p * sat / n;
    }
    (mean - g.density_min[ch], var.sqrt())
}

fn stats(v: &[f32], margin: usize, w: usize, h: usize) -> (f32, f32) {
    let mut xs = Vec::new();
    for y in margin..h - margin {
        for x in margin..w - margin {
            xs.push(v[y * w + x] as f64);
        }
    }
    let m = xs.iter().sum::<f64>() / xs.len() as f64;
    let var = xs.iter().map(|x| (x - m) * (x - m)).sum::<f64>() / xs.len() as f64;
    (m as f32, var.sqrt() as f32)
}

#[test]
fn flat_patch_matches_reference_mean_and_noise() {
    let (w, h) = (192usize, 192usize);
    for stock in ["kodak_portra_400", "kodak_kodachrome_64"] {
        let film = load(stock);
        let p = params(6.0, 0.0);
        for frac in [0.15f32, 0.4, 0.7, 0.9] {
            for ch in 0..3 {
                let d = frac * film.density_max[ch];
                let mut dens = [vec![0.0f32; w * h], vec![0.0f32; w * h], vec![0.0f32; w * h]];
                for c in 0..3 {
                    dens[c].fill(frac * film.density_max[c]);
                }
                grain::apply(&film, &p, &mut dens, w, h);
                let (mean, std) = stats(&dens[ch], 4, w, h);
                let (rmean, rstd) = reference_stats(&film, ch, d, 6.0);
                let dm = film.density_max[ch];
                assert!(
                    (mean - rmean).abs() < 0.02 * dm + 3.0 * rstd / ((w * h) as f32).sqrt() * 10.0,
                    "{stock} ch{ch} f{frac}: mean {mean} vs {rmean}"
                );
                let ratio = std / rstd;
                eprintln!("{stock} ch{ch} f{frac}: mean {mean:.4}/{rmean:.4} std {std:.4}/{rstd:.4} ratio {ratio:.2}");
                assert!((0.6..1.6).contains(&ratio), "{stock} ch{ch} f{frac}: std ratio {ratio}");
            }
        }
    }
}

#[test]
fn noise_falls_with_coarser_pixels() {
    let film = load("kodak_portra_400");
    let (w, h) = (128usize, 128usize);
    let mut stds = Vec::new();
    for pitch in [6.0f32, 12.0, 24.0] {
        let mut dens = [vec![0.8f32; w * h], vec![0.8f32; w * h], vec![0.8f32; w * h]];
        grain::apply(&film, &params(pitch, 0.0), &mut dens, w, h);
        stds.push(stats(&dens[1], 4, w, h).1);
    }
    assert!(stds[0] > stds[1] && stds[1] > stds[2], "{stds:?}");
}

#[test]
fn deterministic_and_tile_independent() {
    let film = load("kodak_portra_400");
    let p = params(6.0, 0.65);
    let (w, h) = (96usize, 80usize);
    let mut img = vec![0.0f32; w * h * 3];
    for y in 0..h {
        for x in 0..w {
            for c in 0..3 {
                img[(y * w + x) * 3 + c] = 0.05 + 0.4 * (x as f32 / w as f32) * (0.6 + 0.2 * c as f32) + 0.1 * (y as f32 / h as f32);
            }
        }
    }
    let mut whole = vec![0.0f32; w * h * 3];
    process_tile(&film, &p, &img, &mut whole, w, h);

    // Re-render a payload window from a sub-tile with halo, with the absolute origin supplied.
    let halo = required_halo(&p);
    assert!(halo >= 4);
    let (px0, py0, pw, ph) = (30usize, 20usize, 32usize, 28usize);
    let (tx0, ty0) = (px0 - halo, py0 - halo);
    let (tw, th) = (pw + 2 * halo, ph + 2 * halo);
    let mut tile = vec![0.0f32; tw * th * 3];
    for y in 0..th {
        for x in 0..tw {
            for c in 0..3 {
                tile[(y * tw + x) * 3 + c] = img[((ty0 + y) * w + tx0 + x) * 3 + c];
            }
        }
    }
    let mut v = vec![0.0f32; PARAM_COUNT];
    v[1] = 6.0;
    v[29] = 1.0;
    v[30] = 1.0;
    v[31] = 1.0;
    v[32] = 1.0;
    v[33] = 1.0;
    v[34] = 0.65;
    v[35] = 7.0;
    v[36] = tx0 as f32;
    v[37] = ty0 as f32;
    let pt = Params::from_slice(&v).unwrap();
    let mut out = vec![0.0f32; tw * th * 3];
    process_tile(&film, &pt, &tile, &mut out, tw, th);
    let mut worst = 0.0f32;
    for y in 0..ph {
        for x in 0..pw {
            for c in 0..3 {
                let a = whole[((py0 + y) * w + px0 + x) * 3 + c];
                let b = out[((y + halo) * tw + x + halo) * 3 + c];
                worst = worst.max((a - b).abs());
            }
        }
    }
    assert!(worst < 2e-4, "tile/whole mismatch {worst}");

    let mut again = vec![0.0f32; w * h * 3];
    process_tile(&film, &p, &img, &mut again, w, h);
    assert_eq!(whole, again);
}

/// Run with `cargo test --release --test grain -- --ignored --nocapture`.
#[test]
#[ignore]
fn bench_tile() {
    let film = load("kodak_portra_400");
    let (w, h) = (560usize, 560usize);
    let img: Vec<f32> = (0..w * h * 3).map(|i| 0.02 + 0.5 * ((i / 3 % w) as f32 / w as f32)).collect();
    let mut out = vec![0.0f32; w * h * 3];
    let mut p = params(6.0, 0.65);
    let t = std::time::Instant::now();
    process_tile(&film, &p, &img, &mut out, w, h);
    let with = t.elapsed();
    p.grain_active = false;
    let t = std::time::Instant::now();
    process_tile(&film, &p, &img, &mut out, w, h);
    eprintln!("tile {w}x{h}: with grain {with:?}, without {:?}", t.elapsed());
}
