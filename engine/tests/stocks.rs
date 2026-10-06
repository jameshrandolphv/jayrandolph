//! Sanity checks over every baked film stock in public/film.

use film_engine::film::Film;
use film_engine::pipeline::{process_tile, Params, PARAM_COUNT};
use std::path::PathBuf;

const RAMP: [f32; 8] = [0.01, 0.03, 0.08, 0.184, 0.4, 0.7, 1.0, 1.5];

fn render(film: &Film, print: bool) -> Vec<[f32; 3]> {
    let mut v = vec![0.0f32; PARAM_COUNT];
    v[1] = 6.0;
    v[29] = 1.0;
    v[30] = 1.15;
    v[38] = print as u8 as f32;
    let p = Params::from_slice(&v).unwrap();
    let input: Vec<f32> = RAMP.iter().flat_map(|&l| [l, l, l]).collect();
    let mut out = vec![0.0; input.len()];
    process_tile(film, &p, &input, &mut out, RAMP.len(), 1);
    out.chunks(3).map(|c| [c[0], c[1], c[2]]).collect()
}

#[test]
fn every_stock_renders_a_sane_neutral_ramp() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../public/film");
    let mut n = 0;
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("fsp") {
            continue;
        }
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let film = Film::parse(&std::fs::read(&path).unwrap()).unwrap();
        for print in [false, true] {
            let r = render(&film, print);
            println!("{name} print={print}: mid {:?} white {:?}", r[3], r[7]);
            for (i, c) in r.iter().enumerate() {
                assert!(c.iter().all(|x| x.is_finite() && (0.0..=1.0).contains(x)), "{name} {i} {c:?}");
                if i > 0 {
                    assert!(c[1] >= r[i - 1][1] - 1e-4, "{name} print={print} not monotonic at {i}");
                }
            }
            let mid = r[3];
            let spread = mid.iter().cloned().fold(0.0f32, f32::max) - mid.iter().cloned().fold(1.0f32, f32::min);
            assert!(spread < 0.06, "{name} print={print} mid-gray tinted: {mid:?}");
            assert!((mid[1] - 0.466).abs() < 0.1, "{name} print={print} mid-gray level: {mid:?}");
        }
        n += 1;
    }
    assert!(n >= 18, "expected all baked stocks, found {n}");
}
