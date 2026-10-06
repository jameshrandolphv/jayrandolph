//! Compares the Rust pipeline with spektrafilm golden vectors (tools/reference/gen_golden.py).

use film_engine::film::Film;
use film_engine::pipeline::{process_tile, Params, PARAM_COUNT};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn deterministic_params() -> Params {
    let mut v = vec![0.0f32; PARAM_COUNT];
    v[1] = 6.0; // pixel size, irrelevant while spatial effects are off
    v[25] = 1.0; // DIR couplers on, no diffusion
    v[29] = 0.0; // compare the raw scan, not the inverted negative
    Params::from_slice(&v).unwrap()
}

fn check(stock: &str, tol_mean: f32, tol_max: f32) {
    check_params(stock, stock, deterministic_params(), tol_mean, tol_max);
}

fn check_params(stock: &str, golden: &str, params: Params, tol_mean: f32, tol_max: f32) {
    let film = Film::parse(&std::fs::read(root().join(format!("../public/film/{stock}.fsp"))).unwrap()).unwrap();
    let text = std::fs::read_to_string(root().join(format!("tests/golden/{golden}.txt"))).unwrap();
    let rows: Vec<Vec<f32>> = text
        .lines()
        .map(|l| l.split_whitespace().map(|t| t.parse().unwrap()).collect())
        .collect();
    let input: Vec<f32> = rows.iter().flat_map(|r| r[0..3].to_vec()).collect();
    let mut out = vec![0.0f32; input.len()];
    process_tile(&film, &params, &input, &mut out, rows.len(), 1);
    let (mut sum, mut worst, mut worst_i) = (0.0f32, 0.0f32, 0);
    for (i, r) in rows.iter().enumerate() {
        for c in 0..3 {
            let e = r[3 + c].clamp(0.0, 1.0);
            let d = (out[3 * i + c] - e).abs();
            sum += d;
            if d > worst {
                worst = d;
                worst_i = i;
            }
        }
    }
    let mean = sum / out.len() as f32;
    println!("{stock}: mean {mean:.5} max {worst:.5} at patch {worst_i}");
    for (i, r) in rows.iter().enumerate() {
        println!(
            "  in {:?} want {:?} got {:?}",
            &r[0..3],
            &r[3..6],
            &out[3 * i..3 * i + 3]
        );
    }
    assert!(mean < tol_mean, "mean error {mean}");
    assert!(worst < tol_max, "max error {worst}");
}

#[test]
fn kodachrome_matches_reference() {
    check("kodak_kodachrome_64", 0.0005, 0.003);
}

#[test]
fn portra_matches_reference() {
    check("kodak_portra_400", 0.0005, 0.003);
}

#[test]
fn portra_print_matches_reference() {
    let mut v = vec![0.0f32; PARAM_COUNT];
    v[1] = 6.0;
    v[25] = 1.0; // DIR couplers on
    v[38] = 1.0; // print on
    let params = Params::from_slice(&v).unwrap();
    check_params("kodak_portra_400", "kodak_portra_400_print", params, 0.0005, 0.003);
}
