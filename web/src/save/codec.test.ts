import { describe, expect, it } from 'vitest';
import { fromBase64, rleDecode, rleEncode, toBase64 } from './codec';

describe('codec', () => {
  it('round-trips runs and noise', () => {
    const a = new Uint8Array(100000);
    a.fill(3, 0, 40000);
    for (let i = 40000; i < 41000; i++) a[i] = i % 7;
    a.fill(200, 41000);
    const enc = rleEncode(a);
    expect(enc.length).toBeLessThan(3000);
    expect(rleDecode(fromBase64(toBase64(enc)), a.length)).toEqual(a);
  });

  it('rejects truncated data', () => {
    const enc = rleEncode(new Uint8Array(1000).fill(1));
    expect(() => rleDecode(enc, 2000)).toThrow();
  });
});
