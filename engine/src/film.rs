//! Parser for the baked film binary produced by tools/reference/bake.py.

use crate::grain::GrainFilm;

/// Enlarger + colour paper, baked from the reference pipeline (negatives only).
pub struct Print {
    pub n: usize,
    /// Film CMY density (axes: the film's `scan_min..scan_max`) -> log10 paper exposure.
    pub raw_lut: Vec<f32>,
    pub log_exposure: Vec<f32>,
    /// Paper density curves, K x 3.
    pub curves: Vec<f32>,
    pub scan_min: [f32; 3],
    pub scan_max: [f32; 3],
    pub xyz2rgb: [f32; 9],
    /// Paper CMY density -> log10 XYZ.
    pub scan_lut: Vec<f32>,
}

/// Slide projection anchors (filled by `pipeline::calibrate`).
#[derive(Clone, Copy, Default)]
pub struct Projection {
    /// Luminance of the clear film base.
    pub white_y: f32,
    /// Linear sRGB of the densest film.
    pub black: [f32; 3],
    /// Normalised luminance a neutral mid-gray scene lands on.
    pub pivot: f32,
    /// Linear luminance of that mid-gray in the plain scan, which the stage keeps fixed.
    pub mid_y: f32,
}

pub struct Film {
    pub positive: bool,
    /// Black-and-white stock: one emulsion, so grain is one field shared by all channels.
    pub mono: bool,
    pub tc_n: usize,
    pub rgb2xyz: [f32; 9],
    pub xyz2rgb: [f32; 9],
    pub tc_lut: Vec<f32>,
    pub log_exposure: Vec<f32>,
    pub curves: Vec<f32>,
    pub curves0: Vec<f32>,
    pub dir_matrix: [f32; 9],
    pub density_max: [f32; 3],
    pub scan_n: usize,
    pub scan_min: [f32; 3],
    pub scan_max: [f32; 3],
    pub scan_lut: Vec<f32>,
    pub grain: GrainFilm,
    pub print: Option<Print>,
    pub proj: Projection,
    /// Negative inversion calibration (filled by `pipeline::calibrate`).
    pub neg_base: [f32; 3],
    pub neg_d_mid: [f32; 3],
    pub neg_slope: [f32; 3],
}

const MAGIC: u32 = 0x3150_5346; // "FSP1"

struct Reader<'a> {
    b: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn u32(&mut self) -> Result<u32, &'static str> {
        let s = self.b.get(self.pos..self.pos + 4).ok_or("truncated")?;
        self.pos += 4;
        Ok(u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn f32s(&mut self, n: usize) -> Result<Vec<f32>, &'static str> {
        let s = self.b.get(self.pos..self.pos + 4 * n).ok_or("truncated")?;
        self.pos += 4 * n;
        Ok(s.chunks_exact(4)
            .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect())
    }
    fn arr<const N: usize>(&mut self) -> Result<[f32; N], &'static str> {
        let v = self.f32s(N)?;
        let mut a = [0.0; N];
        a.copy_from_slice(&v);
        Ok(a)
    }
}

impl Film {
    pub fn parse(bytes: &[u8]) -> Result<Film, &'static str> {
        let mut r = Reader { b: bytes, pos: 0 };
        if r.u32()? != MAGIC {
            return Err("bad magic");
        }
        let version = r.u32()?;
        if version != 2 && version != 3 {
            return Err("unsupported version");
        }
        let flags = r.u32()?;
        let positive = flags & 1 != 0;
        let mono = flags & 2 != 0;
        let tc_n = r.u32()? as usize;
        let k = r.u32()? as usize;
        let scan_n = r.u32()? as usize;
        if tc_n < 2 || k < 2 || scan_n < 2 {
            return Err("bad dimensions");
        }
        let rgb2xyz = r.arr()?;
        let xyz2rgb = r.arr()?;
        let tc_lut = r.f32s(tc_n * tc_n * 3)?;
        let log_exposure = r.f32s(k)?;
        let curves = r.f32s(k * 3)?;
        let curves0 = r.f32s(k * 3)?;
        let dir_matrix = r.arr()?;
        let density_max = r.arr()?;
        let scan_min = r.arr()?;
        let scan_max = r.arr()?;
        let scan_lut = r.f32s(scan_n * scan_n * scan_n * 3)?;
        let lut_n = r.u32()? as usize;
        if lut_n < 2 {
            return Err("bad grain lut");
        }
        let head: [f32; 14] = r.arr()?;
        let layer_max: [f32; 9] = r.arr()?;
        let layer_lut = r.f32s(3 * lut_n * 3)?;
        let grain = GrainFilm {
            particle_area_um2: head[0],
            particle_scale: [head[1], head[2], head[3]],
            particle_scale_layers: [head[4], head[5], head[6]],
            density_min: [head[7], head[8], head[9]],
            uniformity: [head[10], head[11], head[12]],
            blur_px: head[13],
            layer_max,
            lut_n,
            layer_lut,
        };
        let print = if version >= 3 && r.u32()? != 0 {
            let n = r.u32()? as usize;
            let k = r.u32()? as usize;
            if n < 2 || k < 2 {
                return Err("bad print dimensions");
            }
            Some(Print {
                n,
                raw_lut: r.f32s(n * n * n * 3)?,
                log_exposure: r.f32s(k)?,
                curves: r.f32s(k * 3)?,
                scan_min: r.arr()?,
                scan_max: r.arr()?,
                xyz2rgb: r.arr()?,
                scan_lut: r.f32s(n * n * n * 3)?,
            })
        } else {
            None
        };
        let mut film = Film {
            neg_base: [1.0; 3],
            neg_d_mid: [0.0; 3],
            neg_slope: [1.0; 3],
            positive,
            mono,
            tc_n,
            rgb2xyz,
            xyz2rgb,
            tc_lut,
            log_exposure,
            curves,
            curves0,
            dir_matrix,
            density_max,
            scan_n,
            scan_min,
            scan_max,
            scan_lut,
            grain,
            print,
            proj: Projection::default(),
        };
        crate::pipeline::calibrate(&mut film);
        Ok(film)
    }
}
