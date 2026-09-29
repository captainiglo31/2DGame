import { describe, expect, it } from 'vitest';
import { allGrids, PALETTE } from './sprites';

describe('sprites', () => {
  it('every grid is rectangular and uses palette colours', () => {
    for (const [name, rows] of allGrids()) {
      const w = rows[0].length;
      rows.forEach((r, i) => expect(r.length, `${name} row ${i}: "${r}"`).toBe(w));
      for (const r of rows) for (const ch of r) if (ch !== '.') expect(PALETTE[ch], `${name}: '${ch}'`).toBeDefined();
    }
  });
  it('player frames share one size', () => {
    const sizes = new Set(allGrids().filter(([n]) => n.startsWith('player')).map(([, g]) => `${g[0].length}x${g.length}`));
    expect([...sizes]).toEqual(['14x20']);
  });
});
