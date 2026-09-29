import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../data/balance';
import { CONTRACTS } from '../data/contracts';
import { RESEARCH } from '../data/research';
import { MAT_KEYS } from '../sim/materials';
import { de } from './de';
import { missingKeys } from './index';

describe('i18n', () => {
  it('German and English have the same keys', () => {
    expect(missingKeys()).toEqual([]);
  });
  it('all game content has texts', () => {
    const keys = [
      ...RESEARCH.flatMap((r) => [`research.${r.id}.name`, `research.${r.id}.desc`]),
      ...CONTRACTS.flatMap((c) => [`contract.${c.id}.title`, `contract.${c.id}.hint`]),
      ...BUILDINGS.flatMap((b) => [`build.${b.id}`, `build.${b.id}.desc`]),
      ...Object.values(MAT_KEYS).map((k) => `mat.${k}`),
    ];
    for (const k of keys) expect(de[k], k).toBeDefined();
  });

  it('every literal t(\'key\') used in the code exists', () => {
    const root = new URL('..', import.meta.url).pathname;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes('/i18n/')) files.push(p);
      }
    };
    walk(root);
    const missing: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in de)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});
