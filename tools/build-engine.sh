#!/bin/sh
# Builds the Rust engine to WebAssembly and copies it into public/engine/.
set -e
cd "$(dirname "$0")/../engine"
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
cargo build --release --target wasm32-unknown-unknown
mkdir -p ../public/engine
cp target/wasm32-unknown-unknown/release/film_engine.wasm ../public/engine/film_engine.wasm
