// Runs the real WASM module in Node and checks the TS mirror tables.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAT_COLORS, MAT_COUNT, M } from './materials';
import { Sim } from './Sim';
import { rleEncode } from '../save/codec';

const bytes = readFileSync(new URL('./sim.wasm', import.meta.url));

describe('wasm sim', () => {
  it('material table matches Rust', async () => {
    const sim = await Sim.load(bytes, 64, 64, 1);
    expect(sim.api.mat_count()).toBe(MAT_COUNT);
    for (const [id, hex] of Object.entries(MAT_COLORS)) {
      expect(sim.api.mat_rgb(Number(id)).toString(16).padStart(6, '0'), `mat ${id}`).toBe(hex.slice(1));
    }
  });

  it('generates a coast and simulates', async () => {
    const sim = await Sim.load(bytes, 1024, 512, 1);
    sim.generate(99);
    expect(sim.api.count_mat(M.INLET)).toBeGreaterThan(10);
    const t0 = performance.now();
    sim.step(120);
    const ms = (performance.now() - t0) / 120;
    expect(ms).toBeLessThan(8); // generous budget for CI machines
    // the terrain compresses well for saving
    expect(rleEncode(sim.mat).length).toBeLessThan(400_000);
  });

  it('delivery into the core inlet is counted', async () => {
    const sim = await Sim.load(bytes, 1024, 512, 1);
    sim.generate(5);
    const c = sim.core;
    const placed = sim.emit(c.x + c.w / 2, c.y - 4, 2, M.SAND, 10);
    expect(placed).toBe(10);
    sim.step(60);
    expect(sim.collectAbsorbed()[M.SAND]).toBe(10);
  });
});
