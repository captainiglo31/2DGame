// Builds the Rust simulation to WebAssembly and copies it next to the TS loader.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

execSync('cargo build --release --target wasm32-unknown-unknown --manifest-path sim/Cargo.toml', { stdio: 'inherit' });
mkdirSync('web/src/sim', { recursive: true });
copyFileSync('sim/target/wasm32-unknown-unknown/release/abyssal_sim.wasm', 'web/src/sim/sim.wasm');
console.log('wasm -> web/src/sim/sim.wasm');
