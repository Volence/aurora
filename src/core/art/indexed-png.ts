// src/core/art/indexed-png.ts
//
// 8-bit indexed PNG in, 1/2/4/8-bit indexed PNG out — the open format a canvas
// document is stored in (spec §4.1: "these files stay openable in Aseprite, and
// Aseprite output stays importable").
//
// NO DEPENDENCY, NO NEW IPC. Deflate comes from CompressionStream/
// DecompressionStream, which exist in Chromium (the renderer) and in Node 18+
// (the test env). 'deflate' is the zlib-wrapped format, which is exactly what a
// PNG IDAT holds — no wrapper arithmetic of our own.
//
// SCOPE, deliberately narrow: colour type 3 (indexed), non-interlaced. Anything
// else is refused with a message that says what to do about it, because the
// alternative — a partial truecolour reader — would be a second image pipeline
// to keep correct for no gain. Encoding always writes 8-bit; decoding accepts
// 1/2/4/8 because other tools emit the smaller depths for small palettes.
//
// Pure core: async because the compression streams are, but no fs and no DOM.

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

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
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

// Exported (not just used internally) so the view-safety contract below is
// unit-testable at its actual hazard site: inside encodeIndexedPng, `raw` is
// always a buffer allocated fresh at exactly its own size, so a bug here
// cannot be observed by calling encodeIndexedPng — only by calling deflate
// directly with a real subarray, which is what its test does, and which is
// exactly the shape Task 4's inflate(chunkData_subarray) will be called with.
export async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  // MUST accept a view, not just a buffer-owning array: `raw` (or, for
  // inflate, a chunk's data) is routinely a `.subarray()` of something larger.
  // `raw.buffer` would silently discard byteOffset/byteLength and hand Blob
  // the WHOLE backing ArrayBuffer, compressing neighbouring bytes that were
  // never part of this view:
  //   view = big.subarray(2, 6)
  //   new Blob([view.buffer])  -> the whole backing store (wrong)
  //   new Blob([view])         -> just the window (right)
  // Uint8Array itself is a valid BlobPart at runtime; the `as unknown as
  // BlobPart` cast below is only working around @types/node's global
  // Uint8Array being generic over ArrayBufferLike (to also cover
  // SharedArrayBuffer views) where DOM's BlobPart type wants the narrower
  // ArrayBufferView<ArrayBuffer> — a type-checker mismatch, not a real one.
  const stream = new Blob([raw as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeIndexedPng(img: IndexedImage): Promise<Uint8Array> {
  const { width, height, indices, palette } = img;
  if (width <= 0 || height <= 0) throw new Error(`PNG size must be positive (got ${width}x${height})`);
  if (indices.length !== width * height) {
    throw new Error(`${width}x${height} needs ${width * height} indices (got ${indices.length})`);
  }
  if (palette.length === 0 || palette.length > 256) {
    throw new Error(`an indexed PNG palette holds 1..256 colours (got ${palette.length})`);
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

  const plte = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i].r & 0xff;
    plte[i * 3 + 1] = palette[i].g & 0xff;
    plte[i * 3 + 2] = palette[i].b & 0xff;
  }

  // Filter type 0 (None) on every row. Adaptive filtering would shrink the file
  // and buys nothing here — these are small, and a decoder we will also own
  // will read it.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', plte)];
  const t = img.transparentIndex;
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
