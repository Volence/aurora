// src/core/art/__tests__/indexed-png-decode.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { encodeIndexedPng, decodeIndexedPng, parseChunks } from '../indexed-png';

const PAL = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }];

/** Build a PNG by hand so we can choose the bit depth, the filter per row and
 *  the colour type — none of which our own encoder ever varies. */
function handMade(opts: {
  width: number; height: number; depth: number; colorType?: number; interlace?: number;
  rows: number[][];            // raw (unfiltered) sample values per row
  filters: number[];           // one filter type per row
  palette?: { r: number; g: number; b: number }[];
}): Uint8Array {
  const { width, height, depth, rows, filters } = opts;
  const palette = opts.palette ?? PAL;
  const bpr = Math.ceil((width * depth) / 8);

  // Pack each row to `bpr` bytes at the given depth.
  const packed = rows.map((row) => {
    const out = new Uint8Array(bpr);
    if (depth === 8) { out.set(row.map((v) => v & 0xff)); return out; }
    const per = 8 / depth;
    for (let x = 0; x < width; x++) {
      const shift = 8 - depth * ((x % per) + 1);
      out[(x / per) | 0] |= (row[x] & ((1 << depth) - 1)) << shift;
    }
    return out;
  });

  // Apply the row filter (bpp is 1 byte for every indexed depth).
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raw = new Uint8Array((bpr + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (bpr + 1)] = filters[y];
    for (let i = 0; i < bpr; i++) {
      const cur = packed[y][i];
      const a = i >= 1 ? packed[y][i - 1] : 0;
      const b = y >= 1 ? packed[y - 1][i] : 0;
      const c = (y >= 1 && i >= 1) ? packed[y - 1][i - 1] : 0;
      let v: number;
      switch (filters[y]) {
        case 0: v = cur; break;
        case 1: v = cur - a; break;
        case 2: v = cur - b; break;
        case 3: v = cur - ((a + b) >> 1); break;
        case 4: v = cur - paeth(a, b, c); break;
        default: throw new Error('bad filter');
      }
      raw[y * (bpr + 1) + 1 + i] = v & 0xff;
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const mk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = depth; ihdr[9] = opts.colorType ?? 3; ihdr[12] = opts.interlace ?? 0;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; });

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mk('IHDR', ihdr), mk('PLTE', plte),
    mk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    mk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

describe('decodeIndexedPng', () => {
  it('round-trips our own encoder', async () => {
    const indices = new Uint8Array([0, 1, 2, 3, 3, 2, 1, 0, 1, 1, 2, 2]);
    const png = await encodeIndexedPng({ width: 4, height: 3, indices, palette: PAL, transparentIndex: 0 });
    const got = await decodeIndexedPng(png);
    expect(got.width).toBe(4);
    expect(got.height).toBe(3);
    expect(Array.from(got.indices)).toEqual(Array.from(indices));
    expect(got.palette).toEqual(PAL);
    expect(got.transparentIndex).toBe(0);
  });

  it.each([0, 1, 2, 3, 4])('reads a row filtered with type %i', async (filter) => {
    // Each filter is a DIFFERENT reconstruction rule; a decoder that implements
    // only None passes a round-trip test against our encoder and fails here.
    const rows = [[1, 2, 3, 0], [3, 3, 1, 2], [0, 1, 1, 3]];
    const png = handMade({ width: 4, height: 3, depth: 8, rows, filters: [filter, filter, filter] });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows.flat());
  });

  it('reads a file whose rows use DIFFERENT filters', async () => {
    const rows = [[1, 2, 3, 0], [3, 3, 1, 2], [0, 1, 1, 3]];
    const png = handMade({ width: 4, height: 3, depth: 8, rows, filters: [0, 4, 2] });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows.flat());
  });

  it.each([1, 2, 4])('expands %i-bit samples to one byte per pixel', async (depth) => {
    const max = (1 << depth) - 1;
    const rows = [[0, max, 0, max, max, 0, 0, max]];  // 8 px: not a byte multiple at 4bpp
    const png = handMade({
      width: 8, height: 1, depth, rows, filters: [0],
      palette: Array.from({ length: max + 1 }, (_, i) => ({ r: i, g: 0, b: 0 })),
    });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows[0]);
  });

  it('handles a row whose width is not a whole number of bytes at 4bpp', async () => {
    const rows = [[1, 2, 3]];  // 3 px at 4bpp = 1.5 bytes; the last nibble is padding
    const png = handMade({ width: 3, height: 1, depth: 4, rows, filters: [0] });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual([1, 2, 3]);
  });

  it('reads a file split across several IDAT chunks', async () => {
    // Real encoders chunk large images; a decoder that reads only the first IDAT
    // silently truncates the picture.
    const indices = new Uint8Array(Array.from({ length: 64 * 64 }, (_, i) => i % 4));
    const png = await encodeIndexedPng({ width: 64, height: 64, indices, palette: PAL });
    const split = splitFirstIdat(png);
    const got = await decodeIndexedPng(split);
    expect(Array.from(got.indices)).toEqual(Array.from(indices));
  });

  it('refuses a truecolour PNG with a message that says what to do', async () => {
    const png = handMade({ width: 1, height: 1, depth: 8, colorType: 2, rows: [[0]], filters: [0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/indexed/i);
  });

  it('refuses an interlaced PNG', async () => {
    const png = handMade({ width: 2, height: 2, depth: 8, interlace: 1, rows: [[0, 1], [1, 0]], filters: [0, 0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/interlac/i);
  });

  it('refuses a file that is not a PNG at all', async () => {
    await expect(decodeIndexedPng(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not a PNG/i);
  });
});

/** Re-chunk a PNG so its single IDAT becomes two. */
function splitFirstIdat(png: Uint8Array): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  while (p < png.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    if (type === 'IDAT' && len > 4) {
      const data = png.subarray(p + 8, p + 8 + len);
      const head = png.subarray(0, p);
      const tail = png.subarray(p + 12 + len);
      const mk = (d: Uint8Array): Uint8Array => {
        // Reuse the module's own chunk writer via a second encode is not possible
        // here, so build it inline with the same CRC as the test helper above.
        const out = new Uint8Array(12 + d.length);
        const odv = new DataView(out.buffer);
        odv.setUint32(0, d.length);
        'IDAT'.split('').forEach((ch, i) => { out[4 + i] = ch.charCodeAt(0); });
        out.set(d, 8);
        let c = 0xffffffff;
        const body = out.subarray(4, 8 + d.length);
        for (let i = 0; i < body.length; i++) {
          c ^= body[i];
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        odv.setUint32(8 + d.length, (c ^ 0xffffffff) >>> 0);
        return out;
      };
      const half = len >> 1;
      const parts = [head, mk(data.subarray(0, half)), mk(data.subarray(half)), tail];
      const total = parts.reduce((n, x) => n + x.length, 0);
      const out = new Uint8Array(total);
      let at = 0;
      for (const x of parts) { out.set(x, at); at += x.length; }
      return out;
    }
    p += 12 + len;
  }
  return png;
}

describe('parseChunks', () => {
  // decodeIndexedPng's chunk walk is parseChunks (review correction R9) rather
  // than a private copy, so its own defensive checks are reachable through the
  // public surface without exporting the writer-side chunk() as well.
  it('throws when a chunk claims more data than the file actually has', () => {
    // A chunk claiming a huge length is exactly what a truncated download or a
    // hand-edited file looks like; parseChunks must report that rather than
    // let `subarray` silently clamp to whatever bytes remain.
    const bytes = new Uint8Array(20);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(8, 9999); // length field lies: file has nowhere near 9999 bytes left
    bytes.set([73, 72, 68, 82], 12); // "IHDR"
    expect(() => parseChunks(bytes)).toThrow(/claims 9999 bytes/);
  });

  it('stops at IEND rather than reading trailing bytes as another chunk', () => {
    // Some tools pad after IEND. A walker that keeps going past it would
    // either error on garbage or fabricate a phantom chunk.
    const bytes = new Uint8Array(8 + 12 + 12 + 4); // sig + one empty chunk + IEND + 4 trailing pad bytes
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(8, 0);
    bytes.set([116, 69, 83, 84], 12); // "tEST" — an ancillary chunk, length 0
    dv.setUint32(20, 0);
    bytes.set([73, 69, 78, 68], 24); // "IEND", length 0
    const parsed = parseChunks(bytes);
    expect(parsed.map((c) => c.type)).toEqual(['tEST', 'IEND']);
  });
});
