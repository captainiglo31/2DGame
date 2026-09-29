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
});
