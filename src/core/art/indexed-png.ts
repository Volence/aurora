// src/core/art/indexed-png.ts
//
// 1/2/4/8-bit indexed PNG in, 8-bit indexed PNG out — the open format a canvas
// document is stored in (spec §4.1: "these files stay openable in Aseprite, and
// Aseprite output stays importable").
//
// NO DEPENDENCY, NO NEW IPC. Deflate/inflate live in ./zlib-stream (deliberately
// split out — see that module's header for why and for the view-safety rule
// both directions share); 'deflate' is the zlib-wrapped format, which is
// exactly what a PNG IDAT holds — no wrapper arithmetic of our own.
//
// SCOPE, deliberately narrow: colour type 3 (indexed), non-interlaced. Anything
// else is refused with a message that says what to do about it, because the
// alternative — a partial truecolour reader — would be a second image pipeline
// to keep correct for no gain. Encoding always writes 8-bit; decoding accepts
// 1/2/4/8 because other tools emit the smaller depths for small palettes.
//
// Pure core: async because the compression streams are, but no fs and no DOM.

import { deflate, inflate } from './zlib-stream';

export interface Rgb { r: number; g: number; b: number }

export interface IndexedImage {
  width: number;
  height: number;
  /** One byte per pixel, each < palette.length. */
  indices: Uint8Array;
  palette: Rgb[];
  /** Written as tRNS (alpha 0). Null/undefined writes no tRNS chunk. */
  transparentIndex?: number | null;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  // A typo in a call site's type literal (IHDR, PLTE, ...) would otherwise
  // silently write NaN-derived bytes into the type field via charCodeAt(i)
  // returning undefined — with no error anywhere else in this file to catch
  // it. This guard is the only thing standing between that and a chunk whose
  // type is corrupt bytes nobody notices until a viewer chokes on it.
  if (type.length !== 4) {
    throw new Error(`PNG chunk type must be exactly 4 ASCII characters (got ${JSON.stringify(type)})`);
  }
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the TYPE and the DATA, not the length.
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * Walk a PNG's chunk list starting right after the 8-byte signature:
 * [{ type, data }] in file order. `chunk()`'s read sibling (review correction
 * R9) — a decoder written straight from scratch tends to grow its own
 * `while (p < bytes.length)` copy of this walk, which is exactly the kind of
 * duplicate that silently drifts from the writer's framing. `decodeIndexedPng`
 * is the production caller; the hand-rolled walkers in the test files are
 * deliberately independent of this function (a test that shares the parser it
 * is checking proves nothing about that parser).
 *
 * Stops at IEND or at the end of the buffer, whichever comes first — trailing
 * bytes after IEND (some tools pad) are not an error.
 *
 * CRCs are written by chunk() but deliberately NOT verified here: inflate()
 * already surfaces IDAT corruption when it fails to decompress, and refusing
 * an otherwise-readable file over a mismatched ancillary-chunk checksum would
 * only make files unopenable that this reader could safely have shown.
 */
export function parseChunks(bytes: Uint8Array): { type: string; data: Uint8Array }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p);
    if (p + 12 + len > bytes.length) {
      // A chunk claiming more data than the file has left is corrupt input,
      // not a bug in this walker — report it as such rather than reading
      // past the end into whatever memory `subarray` clamps to.
      throw new Error(`PNG chunk at offset ${p} claims ${len} bytes of data but the file ends first`);
    }
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    out.push({ type, data: bytes.subarray(p + 8, p + 8 + len) });
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}

export async function encodeIndexedPng(img: IndexedImage): Promise<Uint8Array> {
  const { width, height, indices, palette } = img;
  // Number.isInteger folded in here (not a separate check) so a non-integer or
  // NaN size is reported as the size problem it is, rather than tripping the
  // indices-count guard below with a message about the wrong thing: width 2.5
  // used to produce "2.5x1 needs 2.5 indices (got 2)".
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`PNG size must be positive integers (got ${width}x${height})`);
  }
  if (indices.length !== width * height) {
    throw new Error(`${width}x${height} needs ${width * height} indices (got ${indices.length})`);
  }
  if (palette.length === 0 || palette.length > 256) {
    throw new Error(`an indexed PNG palette holds 1..256 colours (got ${palette.length})`);
  }
  // Every component is a PNG PLTE byte: 0..255, no fractional part. Silently
  // masking with `& 0xff` (the previous behaviour) turns 300 into 44 and
  // 255.9 into 255 with no error anywhere — colour corruption a decoder would
  // just render, wrongly, forever.
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    if (!Number.isInteger(c.r) || c.r < 0 || c.r > 255) {
      throw new Error(`palette[${i}].r must be an integer 0..255 (got ${c.r})`);
    }
    if (!Number.isInteger(c.g) || c.g < 0 || c.g > 255) {
      throw new Error(`palette[${i}].g must be an integer 0..255 (got ${c.g})`);
    }
    if (!Number.isInteger(c.b) || c.b < 0 || c.b > 255) {
      throw new Error(`palette[${i}].b must be an integer 0..255 (got ${c.b})`);
    }
  }
  // A transparentIndex outside the palette produces a spec-invalid file three
  // different ways depending on how far outside: too large writes a tRNS
  // chunk with more entries than PLTE has (PNG §11.3.2.1, a MUST-level
  // violation); -1 writes a zero-length tRNS; anything more negative throws a
  // raw V8 RangeError out of `new Uint8Array(t + 1)` with a message nowhere
  // near this codebase's voice. One guard replaces all three failure shapes.
  const t = img.transparentIndex;
  if (t !== null && t !== undefined) {
    if (!Number.isInteger(t) || t < 0 || t >= palette.length) {
      throw new Error(`transparentIndex must be a palette index 0..${palette.length - 1} (got ${t})`);
    }
  }
  // The JSDoc on IndexedImage.indices promises "each byte < palette.length";
  // this is what actually enforces that promise. Without it, index 250 against
  // a 3-colour palette encodes into a valid-looking file whose out-of-range
  // pixels are then undefined behaviour that varies by decoder — exactly the
  // hostile-input posture canvas-doc.ts takes on its own pixel domain (see
  // normalizeCanvasPixels there). An O(n) scan is free at these sizes.
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= palette.length) {
      throw new Error(
        `indices[${i}] = ${indices[i]} is out of range for a ${palette.length}-colour palette (0..${palette.length - 1})`,
      );
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type: indexed
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter method: adaptive
  ihdr[12] = 0;  // interlace: none

  // No `& 0xff` masking here: the validation above already guarantees every
  // component is an integer 0..255, so a mask at this point could only ever
  // hide a bug in that guard rather than legitimately do anything.
  const plte = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i].r;
    plte[i * 3 + 1] = palette[i].g;
    plte[i * 3 + 2] = palette[i].b;
  }

  // Filter type 0 (None) on every row. Adaptive filtering would shrink the file
  // and buys nothing here — these are small, and decodeIndexedPng below (which
  // we also own) reads it either way.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (t !== null && t !== undefined) {
    // tRNS is a prefix: entries past the array are opaque, so one byte marks
    // index 0 and says nothing about the other 63.
    const trns = new Uint8Array(t + 1).fill(255);
    trns[t] = 0;
    parts.push(chunk('tRNS', trns));
  }
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}

// ---------------------------------------------------------------------------
// Decode

export interface DecodedIndexedPng {
  width: number;
  height: number;
  /**
   * One byte per pixel. UNLIKE IndexedImage.indices above — which promises
   * "each byte < palette.length" because encodeIndexedPng enforces it on the
   * way out — this is NOT guaranteed to be in range. This decoder refuses
   * structurally broken files (bad signature, missing/truncated IHDR, wrong
   * colour type, no usable PLTE, no IDAT) but does not validate that pixel
   * VALUES stay inside the palette; a hand-edited or foreign-tool file could
   * still contain an out-of-range index. `canvas-doc.ts`'s
   * `normalizeCanvasPixels` is the checkpoint that folds the wider domain
   * back into range on the way into a CanvasDoc — this type does not.
   */
  indices: Uint8Array;
  palette: Rgb[];
  /** The first REAL palette entry (index < palette.length) whose tRNS byte is
   *  0, or null. A tRNS chunk longer than PLTE is spec-invalid; its bytes
   *  past palette.length are ignored rather than reported as if they named a
   *  colour that doesn't exist. */
  transparentIndex: number | null;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Undo the per-row filters. `bpp` — the byte distance to the pixel on the left —
 * is 1 for EVERY indexed depth: below 8 bits the filter still operates on whole
 * bytes, not on samples. Getting that wrong produces art that is subtly striped
 * rather than obviously broken.
 */
function unfilterRows(raw: Uint8Array, width: number, height: number, depth: number): Uint8Array {
  const bpr = Math.ceil((width * depth) / 8);
  if (raw.length < (bpr + 1) * height) {
    throw new Error(`PNG data is short: expected ${(bpr + 1) * height} bytes, got ${raw.length}`);
  }
  const out = new Uint8Array(bpr * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const rowStart = y * bpr;
    const prevStart = (y - 1) * bpr;
    for (let i = 0; i < bpr; i++) {
      const x = raw[pos + i];
      const a = i >= 1 ? out[rowStart + i - 1] : 0;
      const b = y >= 1 ? out[prevStart + i] : 0;
      const c = (y >= 1 && i >= 1) ? out[prevStart + i - 1] : 0;
      let v: number;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`unsupported PNG row filter ${ft}`);
      }
      out[rowStart + i] = v & 0xff;
    }
    pos += bpr;
  }
  return out;
}

/** Expand sub-byte samples to one byte per pixel. At depth 8, bpr === width
 *  and unfilterRows's output is already a fresh buffer of exactly width *
 *  height bytes — return it directly rather than copying the whole image. */
function expandSamples(rows: Uint8Array, width: number, height: number, depth: number): Uint8Array {
  if (depth === 8) return rows;
  const bpr = Math.ceil((width * depth) / 8);
  const per = 8 / depth;
  const mask = (1 << depth) - 1;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = rows[y * bpr + ((x / per) | 0)];
      const shift = 8 - depth * ((x % per) + 1);
      out[y * width + x] = (byte >> shift) & mask;
    }
  }
  return out;
}

export async function decodeIndexedPng(bytes: Uint8Array): Promise<DecodedIndexedPng> {
  if (bytes.length < 8 || !SIGNATURE.every((b, i) => bytes[i] === b)) {
    throw new Error('not a PNG file (bad signature)');
  }

  let ihdrSeen = false;
  let width = 0, height = 0, depth = 0, colorType = -1, interlace = 0;
  let palette: Rgb[] | null = null;
  // Deferred rather than resolved inline: the scan below must be clamped to
  // the palette's REAL length, which isn't known until PLTE (wherever it
  // falls in the file) has been seen — see the comment at the scan site.
  let trnsData: Uint8Array | null = null;
  const idatParts: Uint8Array[] = [];

  for (const { type, data } of parseChunks(bytes)) {
    if (type === 'IHDR') {
      // A chunk declaring type IHDR but too little data to hold width/height/
      // depth/colourType/interlace would otherwise reach the DataView reads
      // below and throw a raw "Offset is outside the bounds" RangeError —
      // accurate to V8, meaningless to a user looking at a corrupt file.
      if (data.length < 13) {
        throw new Error(
          `PNG IHDR chunk is truncated or corrupt (needs 13 bytes, got ${data.length}) — the file is likely an incomplete download or a partial write`,
        );
      }
      ihdrSeen = true;
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = dv.getUint32(0);
      height = dv.getUint32(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i + 2 < data.length; i += 3) palette.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    } else if (type === 'tRNS') {
      trnsData = data;
    } else if (type === 'IDAT') {
      // Concatenated, not read-first: real encoders split large images, and a
      // decoder that stops at the first IDAT silently truncates the picture.
      idatParts.push(data);
    }
  }

  // A file with no IHDR at all would otherwise fall through to the colour-
  // type check below with colorType still at its -1 sentinel, reporting
  // "this PNG is colour type -1, not indexed" — a real value that leaks an
  // implementation detail and points the user at the wrong fix entirely.
  if (!ihdrSeen) throw new Error('PNG has no IHDR chunk (not a valid PNG)');
  // Zero (negative can't happen — IHDR's fields are read with getUint32) is
  // spec-invalid on its own; the encoder already refuses it on the way out,
  // so the two directions should agree here too rather than let a decoded
  // zero-size image quietly exist.
  if (width <= 0 || height <= 0) {
    throw new Error(`PNG has invalid dimensions ${width}x${height} — its IHDR chunk looks corrupt`);
  }
  if (colorType !== 3) {
    throw new Error(
      `this PNG is colour type ${colorType}, not indexed — re-export it as an indexed (paletted) PNG`,
    );
  }
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported — re-export without Adam7 interlacing');
  if (![1, 2, 4, 8].includes(depth)) {
    throw new Error(
      `unsupported indexed bit depth ${depth} — indexed PNGs must be 1, 2, 4 or 8 bits per pixel; re-export at one of those depths`,
    );
  }
  // `!palette` catches a missing PLTE; `palette.length === 0` catches a PLTE
  // chunk that is PRESENT but empty — `[]` is truthy, so the first check
  // alone lets a zero-colour palette through, which then has nothing for any
  // pixel index to mean. The encoder refuses exactly this on the way out
  // ("an indexed PNG palette holds 1..256 colours"); the two directions
  // should not disagree about what a valid palette is.
  if (!palette || palette.length === 0) {
    throw new Error('indexed PNG has no PLTE palette chunk — re-export as an indexed (paletted) PNG with a palette');
  }
  if (idatParts.length === 0) throw new Error('PNG has no image data (no IDAT chunk)');

  let transparentIndex: number | null = null;
  if (trnsData) {
    // Scanned only across REAL palette entries: a tRNS chunk longer than
    // PLTE, with its zero-alpha byte past the end, would otherwise produce
    // an index this very type's JSDoc promises is always "a real palette
    // entry" — a lie a consumer discovers however far downstream it tries to
    // look the colour up.
    const limit = Math.min(trnsData.length, palette.length);
    for (let i = 0; i < limit; i++) if (trnsData[i] === 0) { transparentIndex = i; break; }
  }

  let raw: Uint8Array;
  try {
    raw = await inflate(concat(idatParts));
  } catch {
    // DecompressionStream rejects a broken deflate stream with a bare
    // TypeError whose .message is the empty string. Left unwrapped, that
    // reaches a user's error toast (Task 9) as literally nothing — the same
    // failure shape the transparentIndex validation guard above exists to
    // prevent on the encode side. A truncated download or a half-written
    // save is the likeliest real cause, so say that instead of nothing.
    throw new Error('PNG image data (IDAT) is truncated or corrupt and could not be decompressed');
  }
  const rows = unfilterRows(raw, width, height, depth);
  return { width, height, indices: expandSamples(rows, width, height, depth), palette, transparentIndex };
}
