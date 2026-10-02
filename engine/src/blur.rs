//! Separable blur filters on single-channel f32 planes with edge extension.

/// Gaussian blur with standard deviation `sigma` (pixels).
pub fn gaussian(plane: &mut [f32], w: usize, h: usize, sigma: f32, scratch: &mut Vec<f32>) {
    if sigma < 0.25 {
        return;
    }
    if sigma < 3.0 {
        kernel_blur(plane, w, h, sigma, scratch);
        return;
    }
    for r in box_radii(sigma) {
        box_h(plane, w, h, r, scratch);
        box_v(plane, w, h, r, scratch);
    }
}

/// Isotropic-ish two-sided exponential (Laplace) blur, decay length `lambda` pixels.
pub fn exponential(plane: &mut [f32], w: usize, h: usize, lambda: f32) {
    if lambda < 0.25 {
        return;
    }
    let a = (-1.0 / lambda).exp();
    let c = (1.0 - a) / (1.0 + a);
    let edge = a / (1.0 - a);
    // horizontal
    let mut f = vec![0.0f32; w];
    for y in 0..h {
        let row = &mut plane[y * w..(y + 1) * w];
        let mut acc = row[0] * (1.0 + edge);
        f[0] = acc;
        for x in 1..w {
            acc = row[x] + a * acc;
            f[x] = acc;
        }
        let mut acc = row[w - 1] * (1.0 + edge);
        for x in (0..w).rev() {
            if x != w - 1 {
                acc = row[x] + a * acc;
            }
            row[x] = c * (f[x] + acc - row[x]);
        }
    }
    // vertical, vectorised across x
    let mut fw = vec![0.0f32; w * h];
    for x in 0..w {
        fw[x] = plane[x] * (1.0 + edge);
    }
    for y in 1..h {
        for x in 0..w {
            fw[y * w + x] = plane[y * w + x] + a * fw[(y - 1) * w + x];
        }
    }
    let mut b = vec![0.0f32; w];
    for x in 0..w {
        b[x] = plane[(h - 1) * w + x] * (1.0 + edge);
    }
    for y in (0..h).rev() {
        for x in 0..w {
            let v = plane[y * w + x];
            if y != h - 1 {
                b[x] = v + a * b[x];
            }
            plane[y * w + x] = c * (fw[y * w + x] + b[x] - v);
        }
    }
}

fn kernel_blur(plane: &mut [f32], w: usize, h: usize, sigma: f32, scratch: &mut Vec<f32>) {
    let r = (sigma * 3.0).ceil() as isize;
    let mut k: Vec<f32> = (-r..=r)
        .map(|i| (-(i * i) as f32 / (2.0 * sigma * sigma)).exp())
        .collect();
    let s: f32 = k.iter().sum();
    k.iter_mut().for_each(|v| *v /= s);
    scratch.clear();
    scratch.resize(w * h, 0.0);
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for (j, kv) in k.iter().enumerate() {
                let xx = (x as isize + j as isize - r).clamp(0, w as isize - 1) as usize;
                acc += kv * plane[y * w + xx];
            }
            scratch[y * w + x] = acc;
        }
    }
    for y in 0..h {
        for (j, kv) in k.iter().enumerate() {
            let yy = (y as isize + j as isize - r).clamp(0, h as isize - 1) as usize;
            let (dst, src) = (&mut plane[y * w..(y + 1) * w], &scratch[yy * w..(yy + 1) * w]);
            if j == 0 {
                for x in 0..w {
                    dst[x] = kv * src[x];
                }
            } else {
                for x in 0..w {
                    dst[x] += kv * src[x];
                }
            }
        }
    }
}

/// Radii of three box blurs approximating a Gaussian of the given sigma.
fn box_radii(sigma: f32) -> [usize; 3] {
    let n = 3.0f32;
    let ideal = (12.0 * sigma * sigma / n + 1.0).sqrt();
    let mut wl = ideal.floor() as i32;
    if wl % 2 == 0 {
        wl -= 1;
    }
    let wu = wl + 2;
    let wlf = wl as f32;
    let m = ((12.0 * sigma * sigma - n * wlf * wlf - 4.0 * n * wlf - 3.0 * n)
        / (-4.0 * wlf - 4.0))
        .round() as i32;
    let mut out = [0usize; 3];
    for (i, o) in out.iter_mut().enumerate() {
        let size = if (i as i32) < m { wl } else { wu };
        *o = ((size - 1) / 2).max(0) as usize;
    }
    out
}

fn box_h(plane: &mut [f32], w: usize, h: usize, r: usize, scratch: &mut Vec<f32>) {
    if r == 0 {
        return;
    }
    scratch.clear();
    scratch.resize(w, 0.0);
    let inv = 1.0 / (2 * r + 1) as f32;
    for y in 0..h {
        let row = &mut plane[y * w..(y + 1) * w];
        scratch.copy_from_slice(row);
        let first = scratch[0];
        let last = scratch[w - 1];
        let at = |i: isize| -> f32 {
            if i < 0 {
                first
            } else if i as usize >= w {
                last
            } else {
                scratch[i as usize]
            }
        };
        let ri = r as isize;
        let mut sum = 0.0f32;
        for i in -ri..=ri {
            sum += at(i);
        }
        for x in 0..w as isize {
            row[x as usize] = sum * inv;
            sum += at(x + ri + 1) - at(x - ri);
        }
    }
}

fn box_v(plane: &mut [f32], w: usize, h: usize, r: usize, scratch: &mut Vec<f32>) {
    if r == 0 {
        return;
    }
    scratch.clear();
    scratch.resize(w * h, 0.0);
    scratch.copy_from_slice(plane);
    let inv = 1.0 / (2 * r + 1) as f32;
    let ri = r as isize;
    let row_of = |y: isize| -> usize { y.clamp(0, h as isize - 1) as usize };
    let mut sum = vec![0.0f32; w];
    for i in -ri..=ri {
        let src = &scratch[row_of(i) * w..row_of(i) * w + w];
        for x in 0..w {
            sum[x] += src[x];
        }
    }
    for y in 0..h as isize {
        let dst = &mut plane[y as usize * w..(y as usize + 1) * w];
        let add = &scratch[row_of(y + ri + 1) * w..row_of(y + ri + 1) * w + w];
        let sub = &scratch[row_of(y - ri) * w..row_of(y - ri) * w + w];
        for x in 0..w {
            dst[x] = sum[x] * inv;
            sum[x] += add[x] - sub[x];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gaussian_preserves_mass_and_matches_variance() {
        let (w, h) = (129usize, 129usize);
        let mut p = vec![0.0f32; w * h];
        p[64 * w + 64] = 1.0;
        let mut s = Vec::new();
        gaussian(&mut p, w, h, 6.0, &mut s);
        let total: f32 = p.iter().sum();
        assert!((total - 1.0).abs() < 1e-3, "mass {total}");
        let col_var: f32 = (0..w)
            .map(|x| {
                let d = x as f32 - 64.0;
                d * d * (0..h).map(|y| p[y * w + x]).sum::<f32>()
            })
            .sum();
        assert!((col_var.sqrt() - 6.0).abs() < 0.3, "sigma {}", col_var.sqrt());
    }

    #[test]
    fn exponential_preserves_mass() {
        let (w, h) = (101usize, 101usize);
        let mut p = vec![0.0f32; w * h];
        p[50 * w + 50] = 1.0;
        exponential(&mut p, w, h, 5.0);
        let total: f32 = p.iter().sum();
        assert!((total - 1.0).abs() < 2e-3, "mass {total}");
    }

    #[test]
    fn constant_stays_constant() {
        let (w, h) = (40usize, 30usize);
        let mut p = vec![0.7f32; w * h];
        let mut s = Vec::new();
        gaussian(&mut p, w, h, 8.0, &mut s);
        exponential(&mut p, w, h, 8.0);
        assert!(p.iter().all(|v| (v - 0.7).abs() < 1e-4));
    }
}
