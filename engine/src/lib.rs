//! Film emulation engine. Pure Rust core plus a small C ABI for WebAssembly hosts.

pub mod blur;
pub mod film;
pub mod grain;
pub mod pipeline;

use film::Film;
use pipeline::{process_tile, required_halo, Params, PARAM_COUNT};

/// Allocate `len` bytes of linear memory owned by the host (8-byte aligned).
#[no_mangle]
pub extern "C" fn fs_alloc(len: usize) -> *mut u8 {
    let mut v = vec![0u64; len.div_ceil(8).max(1)];
    let p = v.as_mut_ptr() as *mut u8;
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` must come from `fs_alloc` with the same `len`.
#[no_mangle]
pub unsafe extern "C" fn fs_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr as *mut u64, len.div_ceil(8).max(1), len.div_ceil(8).max(1)));
}

#[no_mangle]
pub extern "C" fn fs_param_count() -> usize {
    PARAM_COUNT
}

/// Parse a baked film. Returns an opaque handle, or null on failure.
///
/// # Safety
/// `ptr..ptr+len` must be readable.
#[no_mangle]
pub unsafe extern "C" fn fs_film_load(ptr: *const u8, len: usize) -> *mut Film {
    match Film::parse(std::slice::from_raw_parts(ptr, len)) {
        Ok(f) => Box::into_raw(Box::new(f)),
        Err(_) => std::ptr::null_mut(),
    }
}

/// # Safety
/// `film` must come from `fs_film_load` and not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn fs_film_free(film: *mut Film) {
    if !film.is_null() {
        drop(Box::from_raw(film));
    }
}

/// Halo in pixels a tile needs for the given parameters (`PARAM_COUNT` f32).
///
/// # Safety
/// `params` must point to `PARAM_COUNT` f32 values.
#[no_mangle]
pub unsafe extern "C" fn fs_required_halo(params: *const f32) -> usize {
    match Params::from_slice(std::slice::from_raw_parts(params, PARAM_COUNT)) {
        Some(p) => required_halo(&p),
        None => 0,
    }
}

/// Process a tile of 16-bit data: linear Rec.2020 in, display-encoded sRGB out.
///
/// # Safety
/// `input` and `output` must each hold `w*h*3` u16 values (2-byte aligned).
#[no_mangle]
pub unsafe extern "C" fn fs_process_tile_u16(
    film: *const Film,
    params: *const f32,
    input: *const u16,
    output: *mut u16,
    w: usize,
    h: usize,
) -> i32 {
    let Some(p) = Params::from_slice(std::slice::from_raw_parts(params, PARAM_COUNT)) else {
        return 1;
    };
    let n = w * h * 3;
    let src: Vec<f32> = std::slice::from_raw_parts(input, n)
        .iter()
        .map(|&v| v as f32 * (1.0 / 65535.0))
        .collect();
    let mut dst = vec![0.0f32; n];
    process_tile(&*film, &p, &src, &mut dst, w, h);
    for (o, v) in std::slice::from_raw_parts_mut(output, n).iter_mut().zip(dst) {
        *o = (v * 65535.0 + 0.5) as u16;
    }
    0
}

/// Process a tile. Returns 0 on success.
///
/// # Safety
/// `input` and `output` must each hold `w*h*3` f32 values.
#[no_mangle]
pub unsafe extern "C" fn fs_process_tile(
    film: *const Film,
    params: *const f32,
    input: *const f32,
    output: *mut f32,
    w: usize,
    h: usize,
) -> i32 {
    let Some(p) = Params::from_slice(std::slice::from_raw_parts(params, PARAM_COUNT)) else {
        return 1;
    };
    let n = w * h * 3;
    process_tile(
        &*film,
        &p,
        std::slice::from_raw_parts(input, n),
        std::slice::from_raw_parts_mut(output, n),
        w,
        h,
    );
    0
}
