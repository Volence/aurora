// src/core/art/__tests__/indexed-png-encode.test.ts
import { describe, it, expect } from 'vitest';
import { inflateSync, crc32 } from 'node:zlib';
import { encodeIndexedPng } from '../indexed-png';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Walk the chunk list of a PNG: [{type, data}], in file order. */
function chunks(bytes: Uint8Array): { type: string; data: Uint8Array }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  let p = 8;
  while (p < bytes.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    out.push({ type, data: bytes.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

const PAL = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }];

describe('encodeIndexedPng', () => {
  it('writes a signature and the mandatory chunks in order', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 2, indices: new Uint8Array([0, 1, 2, 1]), palette: PAL, transparentIndex: 0,
    });
    expect(Array.from(png.subarray(0, 8))).toEqual(SIG);
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  });

  it('declares 8-bit indexed, non-interlaced', async () => {
    const png = await encodeIndexedPng({ width: 3, height: 1, indices: new Uint8Array([0, 1, 2]), palette: PAL });
    const ihdr = chunks(png).find((c) => c.type === 'IHDR')!.data;
    const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(dv.getUint32(0)).toBe(3);   // width
    expect(dv.getUint32(4)).toBe(1);   // height
    expect(ihdr[8]).toBe(8);           // bit depth
    expect(ihdr[9]).toBe(3);           // colour type 3 = indexed
    expect(ihdr[12]).toBe(0);          // interlace
  });

  it('IDAT inflates to filter-0 scanlines of the source indices', async () => {
    const indices = new Uint8Array([0, 1, 2, 2, 1, 0]);
    const png = await encodeIndexedPng({ width: 3, height: 2, indices, palette: PAL });
    const idat = chunks(png).find((c) => c.type === 'IDAT')!.data;
    const raw = new Uint8Array(inflateSync(Buffer.from(idat)));
    expect(Array.from(raw)).toEqual([0, 0, 1, 2, 0, 2, 1, 0]); // filter byte per row
  });

  it('tRNS marks exactly the transparent index', async () => {
    const png = await encodeIndexedPng({ width: 1, height: 1, indices: new Uint8Array([0]), palette: PAL, transparentIndex: 0 });
    const trns = chunks(png).find((c) => c.type === 'tRNS')!.data;
    expect(Array.from(trns)).toEqual([0]); // alpha 0 for index 0; later entries default opaque
  });

  it('omits tRNS when no index is transparent', async () => {
    const png = await encodeIndexedPng({ width: 1, height: 1, indices: new Uint8Array([1]), palette: PAL, transparentIndex: null });
    expect(chunks(png).some((c) => c.type === 'tRNS')).toBe(false);
  });

  it('refuses a mismatched index count and an oversized palette', async () => {
    await expect(encodeIndexedPng({ width: 2, height: 2, indices: new Uint8Array([0]), palette: PAL }))
      .rejects.toThrow(/4 indices/);
    await expect(encodeIndexedPng({
      width: 1, height: 1, indices: new Uint8Array([0]),
      palette: new Array(257).fill({ r: 0, g: 0, b: 0 }),
    })).rejects.toThrow(/257/);
  });

  // I1: an out-of-range transparentIndex used to produce spec-invalid output
  // three different ways depending on how far out of range — a tRNS chunk
  // with more entries than PLTE (too large), a zero-length tRNS (-1), or a
  // raw V8 RangeError with none of this codebase's voice (more negative than
  // -1). One guard, three cases, all now a clean rejection.
  it('rejects an out-of-range transparentIndex instead of emitting a spec-invalid file', async () => {
    const base = { width: 1, height: 1, indices: new Uint8Array([0]), palette: PAL }; // PAL has 3 entries: 0..2
    await expect(encodeIndexedPng({ ...base, transparentIndex: 200 })).rejects.toThrow(/0\.\.2/);
    await expect(encodeIndexedPng({ ...base, transparentIndex: -1 })).rejects.toThrow(/0\.\.2/);
    await expect(encodeIndexedPng({ ...base, transparentIndex: -5 })).rejects.toThrow(/0\.\.2/);
  });

  // I2: the JSDoc on IndexedImage.indices promises "each byte < palette.length"
  // but nothing enforced it — index 250 against a 3-colour palette encoded
  // silently into a valid-looking file whose out-of-range pixels are then
  // decoder-defined behaviour.
  it('rejects an index that is out of range for the palette', async () => {
    await expect(encodeIndexedPng({ width: 1, height: 1, indices: new Uint8Array([250]), palette: PAL }))
      .rejects.toThrow(/250.*0\.\.2/);
  });

  // M1: non-integer/NaN dimensions used to be caught by the indices-count
  // guard with a message about the wrong thing ("2.5x1 needs 2.5 indices
  // (got 2)"). Number.isInteger is folded into the size check so the message
  // names the actual problem.
  it('rejects non-integer or NaN dimensions with a message about size, not index count', async () => {
    await expect(encodeIndexedPng({ width: 2.5, height: 1, indices: new Uint8Array([0, 0]), palette: PAL }))
      .rejects.toThrow(/positive integers/);
    await expect(encodeIndexedPng({ width: NaN, height: 1, indices: new Uint8Array([0]), palette: PAL }))
      .rejects.toThrow(/positive integers/);
  });

  // M2: palette components used to be masked with `& 0xff`, so {r:300, g:-1,
  // b:255.9} wrote [44, 255, 255] with no error — silent colour corruption in
  // the one module whose entire justification is producing spec-valid files.
  it('rejects out-of-range or non-integer palette components instead of masking them', async () => {
    await expect(encodeIndexedPng({
      width: 1, height: 1, indices: new Uint8Array([0]),
      palette: [{ r: 300, g: -1, b: 255.9 }],
    })).rejects.toThrow(/palette\[0\]\.r/);
  });

  // Not part of the given spec, but the failure a real viewer reports and a
  // round-trip against our own decoder would never catch: a corrupt chunk. Each
  // chunk's trailing 4 bytes must be the CRC-32 of its TYPE+DATA (not its
  // length field, which precedes the region the CRC covers).
  it('every chunk carries a correct CRC over its type and data', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 2, indices: new Uint8Array([0, 1, 2, 1]), palette: PAL, transparentIndex: 0,
    });
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let p = 8;
    let count = 0;
    while (p < png.length) {
      const len = dv.getUint32(p);
      const typeAndData = png.subarray(p + 4, p + 8 + len);
      const storedCrc = dv.getUint32(p + 8 + len);
      const expectedCrc = crc32(typeAndData) >>> 0;
      expect(storedCrc).toBe(expectedCrc);
      count += 1;
      p += 12 + len;
    }
    expect(count).toBe(5); // IHDR, PLTE, tRNS, IDAT, IEND — proves the loop actually ran
  });

  // The deflate() view-safety guard (a hazard the reviewer reproduced against
  // an earlier fix) now lives in zlib-stream.test.ts, next to deflate()/
  // inflate() themselves (review correction R8) — moved there rather than
  // duplicated here.
});
