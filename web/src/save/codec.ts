// Run-length + base64 encoding for the cell layers. Terrain is mostly long
// runs, so a 1024×512 world typically packs into a few dozen KB.

export function rleEncode(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < src.length) {
    const v = src[i];
    let n = 1;
    while (i + n < src.length && src[i + n] === v) n++;
    out.push(v);
    // unsigned LEB128 run length
    let r = n;
    while (r >= 0x80) {
      out.push((r & 0x7f) | 0x80);
      r >>>= 7;
    }
    out.push(r);
    i += n;
  }
  return Uint8Array.from(out);
}

export function rleDecode(src: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let o = 0;
  let i = 0;
  while (i < src.length && o < length) {
    const v = src[i++];
    let n = 0;
    let shift = 0;
    for (;;) {
      const b = src[i++];
      n |= (b & 0x7f) << shift;
      if (b < 0x80) break;
      shift += 7;
    }
    out.fill(v, o, Math.min(length, o + n));
    o += n;
  }
  if (o !== length) throw new Error(`RLE length mismatch: ${o} != ${length}`);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
