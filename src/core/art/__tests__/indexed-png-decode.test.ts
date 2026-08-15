// src/core/art/__tests__/indexed-png-decode.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { encodeIndexedPng, decodeIndexedPng, parseChunks } from '../indexed-png';

const PAL = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }];
const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Shared by handMade and splitFirstIdat below. The deliberate-independence
// rule (see the `parseChunks` describe block) protects these hand-rolled
// test fixtures from the PRODUCTION parser they are exercising — it says
// nothing about the fixtures sharing plumbing with each other, and this pair
// used to be duplicated verbatim in both places.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crcOf(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function mkChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crcOf(out.subarray(4, 8 + data.length)));
  return out;
}

function joinParts(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Build a PNG by hand so we can choose the bit depth, the filter per row and
 *  the colour type — none of which our own encoder ever varies. */
function handMade(opts: {
  width: number; height: number; depth: number; colorType?: number; interlace?: number;
  rows: number[][];            // raw (unfiltered) sample values per row
  filters: number[];           // one filter type per row
  palette?: { r: number; g: number; b: number }[];
  omitPlte?: boolean;          // for the "missing PLTE" refusal case
  omitIdat?: boolean;          // for the "missing IDAT" refusal case
  trns?: number[];             // raw tRNS bytes, written verbatim (for malformed-tRNS cases)
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

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = depth; ihdr[9] = opts.colorType ?? 3; ihdr[12] = opts.interlace ?? 0;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; });

  const parts = [
    SIGNATURE,
    mkChunk('IHDR', ihdr),
    ...(opts.omitPlte ? [] : [mkChunk('PLTE', plte)]),
    ...(opts.trns ? [mkChunk('tRNS', new Uint8Array(opts.trns))] : []),
    ...(opts.omitIdat ? [] : [mkChunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw))))]),
    mkChunk('IEND', new Uint8Array(0)),
  ];
  return joinParts(parts);
}

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
      const half = len >> 1;
      const parts = [head, mkChunk('IDAT', data.subarray(0, half)), mkChunk('IDAT', data.subarray(half)), tail];
      return joinParts(parts);
    }
    p += 12 + len;
  }
  return png;
}

/** Scramble an existing PNG's (first) IDAT payload bytes in place, producing
 *  a structurally valid file whose compressed data is garbage. Safe to do
 *  without recomputing the chunk CRC: parseChunks does not verify it on read
 *  (see the `parseChunks` doc comment in indexed-png.ts) — inflate() is what
 *  is meant to catch this, which is exactly what this fixture is for. */
function corruptIdat(png: Uint8Array): Uint8Array {
  const out = new Uint8Array(png); // copy — don't mutate the caller's buffer
  const dv = new DataView(out.buffer);
  let p = 8;
  while (p < out.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(out[p + 4], out[p + 5], out[p + 6], out[p + 7]);
    if (type === 'IDAT') {
      out.fill(0xff, p + 8, p + 8 + len); // 0xff repeated is not a valid zlib stream
      return out;
    }
    p += 12 + len;
  }
  throw new Error('test fixture has no IDAT to corrupt');
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

  // The filter suite above only varies filter at depth 8, and the depth suite
  // above only varies depth at filter 0 — the intersection (say, a 4bpp row
  // reconstructed with Paeth) is exactly where a bpp-vs-sample confusion in
  // unfilterRows would bite (bpp is 1 BYTE regardless of depth; get that
  // wrong and only the sub-byte, non-filter-0 cases show it). An external
  // tool (Pillow) proved the real decoder handles this; this pins it here in
  // a form that survives.
  const DEPTH_FILTER_PAIRS: [number, number][] = [1, 2, 4, 8].flatMap(
    (depth) => [0, 1, 2, 3, 4].map((filter): [number, number] => [depth, filter]),
  );
  it.each(DEPTH_FILTER_PAIRS)('reconstructs %ibpp with filter type %i', async (depth, filter) => {
    const max = (1 << depth) - 1;
    // width 12 keeps bpr >= 2 at EVERY depth down to 1bpp (bpr =
    // ceil(12*1/8) = 2). At bpr === 1 there is only ever byte index i === 0
    // in a row, so Sub's `a` (the byte to the left) is always 0 and Sub
    // degenerates to identical output to filter None — no row of any values
    // could tell the two apart. Caught by planting this exact falsification.
    const width = 12, height = 3;
    const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (x + y * 3) % (max + 1)));
    const png = handMade({
      width, height, depth, rows, filters: [filter, filter, filter],
      palette: Array.from({ length: max + 1 }, (_, i) => ({ r: i, g: 0, b: 0 })),
    });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows.flat());
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

  it('refuses a corrupted IDAT with a message that says so, not an empty string', async () => {
    // DecompressionStream rejects a broken deflate stream with a bare
    // TypeError whose .message is ''. A truncated download or half-written
    // save is the likeliest real-world way to produce exactly this.
    const indices = new Uint8Array([0, 1, 2, 3]);
    const png = await encodeIndexedPng({ width: 2, height: 2, indices, palette: PAL });
    const corrupted = corruptIdat(png);
    await expect(decodeIndexedPng(corrupted)).rejects.toThrow(/truncated|corrupt/i);
  });

  it('refuses a truecolour PNG with a message that says what to do', async () => {
    const png = handMade({ width: 1, height: 1, depth: 8, colorType: 2, rows: [[0]], filters: [0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/indexed/i);
  });

  it('refuses an interlaced PNG', async () => {
    const png = handMade({ width: 2, height: 2, depth: 8, interlace: 1, rows: [[0, 1], [1, 0]], filters: [0, 0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/interlac/i);
  });

  // The refusals below were missing from the plan's Step 1 test list — a real
  // coverage hole, since error paths in a file reader are exactly where a
  // wrong message or a branch that never fires gets discovered by a user who
  // opened their own corrupt or foreign PNG and cannot debug it.

  it('refuses a colour-type-3 PNG with no PLTE chunk, saying so', async () => {
    // Legal-looking IHDR (indexed, non-interlaced, depth 8) but the palette a
    // colour-type-3 file is defined against is simply absent.
    const png = handMade({ width: 1, height: 1, depth: 8, rows: [[0]], filters: [0], omitPlte: true });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/no PLTE/i);
  });

  it('refuses a colour-type-3 PNG with a PRESENT but zero-length PLTE chunk', async () => {
    // `!palette` alone only catches a MISSING chunk — an empty array is
    // truthy, so a PLTE chunk that exists but names zero colours used to
    // sail through, leaving every pixel index meaningless. The encoder
    // refuses exactly this ("an indexed PNG palette holds 1..256 colours");
    // the two directions should not disagree about what a valid palette is.
    const png = handMade({ width: 1, height: 1, depth: 8, rows: [[0]], filters: [0], palette: [] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/no PLTE/i);
  });

  it('refuses a well-formed header with no IDAT chunk, saying so', async () => {
    // Everything else about the file is fine — IHDR and PLTE both parse — but
    // there is no pixel data to decode at all.
    const png = handMade({ width: 1, height: 1, depth: 8, rows: [[0]], filters: [0], omitIdat: true });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/no image data|IDAT/i);
  });

  it('refuses an unsupported indexed bit depth, naming it', async () => {
    // 16 is a legal PNG bit depth for OTHER colour types (grayscale, truecolour)
    // but not for indexed (colour type 3, max 8 bits per PNG's own table) — the
    // realistic mistake, not a nonsense value nothing would ever produce.
    const png = handMade({ width: 1, height: 1, depth: 16, rows: [[0]], filters: [0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/unsupported indexed bit depth 16/i);
  });

  it('refuses a truncated IHDR chunk instead of leaking a raw RangeError', async () => {
    // An IHDR chunk that declares only 4 bytes of data (needs 13) would
    // otherwise reach `dv.getUint32(4)` inside decodeIndexedPng and throw
    // V8's own "Offset is outside the bounds of the DataView" — accurate,
    // and meaningless to a user looking at a corrupt file.
    const bytes = new Uint8Array(8 + 12 + 4 + 4); // sig + (len+type+4-byte-data+crc)
    bytes.set(SIGNATURE, 0);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(8, 4); // IHDR length = 4, short of the 13 it needs
    bytes.set([73, 72, 68, 82], 12); // "IHDR"
    await expect(decodeIndexedPng(bytes)).rejects.toThrow(/IHDR/i);
  });

  it('refuses a PNG with no IHDR chunk instead of reporting a bogus colour type', async () => {
    // Without an IHDR-seen guard, colorType stays at its -1 sentinel and the
    // colour-type check below fires with "this PNG is colour type -1, not
    // indexed" — a real value that leaks an implementation detail and points
    // the user at re-exporting as indexed, which isn't the actual problem.
    const png = joinParts([
      SIGNATURE,
      mkChunk('PLTE', new Uint8Array([0, 0, 0])),
      mkChunk('IDAT', new Uint8Array(deflateSync(Buffer.from([0, 0])))),
      mkChunk('IEND', new Uint8Array(0)),
    ]);
    await expect(decodeIndexedPng(png)).rejects.toThrow(/no IHDR/i);
  });

  it('refuses a PNG whose IHDR declares zero width or height', async () => {
    const png = handMade({ width: 1, height: 1, depth: 8, rows: [[0]], filters: [0] });
    // IHDR's data starts right after signature(8) + length(4) + type(4) = 16;
    // width is its first 4 bytes.
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    dv.setUint32(16, 0);
    await expect(decodeIndexedPng(png)).rejects.toThrow(/dimensions|width|height/i);
  });

  it('clamps the tRNS scan to real palette entries', async () => {
    // A tRNS chunk longer than PLTE, with its zero-alpha byte past the
    // palette's end, is spec-invalid but not something a hostile or buggy
    // tool couldn't produce. DecodedIndexedPng.transparentIndex's own JSDoc
    // promises "the first REAL palette entry" — an index with no
    // corresponding colour would make the type a lie.
    const trns = [255, 255, 255, 255, 255, 0]; // zero byte sits past PAL's 4 entries
    const png = handMade({ width: 1, height: 1, depth: 8, rows: [[0]], filters: [0], trns });
    const got = await decodeIndexedPng(png);
    expect(got.transparentIndex).toBeNull();
  });

  it('refuses a file that is not a PNG at all', async () => {
    await expect(decodeIndexedPng(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not a PNG/i);
  });
});

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
