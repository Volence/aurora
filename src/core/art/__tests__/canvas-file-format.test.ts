// src/core/art/__tests__/canvas-file-format.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { encodeCanvasFiles, decodeCanvasFiles, parseCanvasSidecar, CANVAS_SIDECAR_VERSION } from '../canvas-file-format';
import { blankCanvasDoc, canvasIndex, CANVAS_COLORS } from '../canvas-doc';
import { encodeIndexedPng } from '../indexed-png';
import { encodeGenesisColor, decodeGenesisColor } from '../../formats/palette';

function docWithArt() {
  const doc = blankCanvasDoc({ name: 'Ramp', width: 16, height: 8, profileId: 'genesis-level-art' });
  // A recognisable palette: line L entry E -> a distinct CRAM word.
  doc.palette = Array.from({ length: CANVAS_COLORS }, (_, i) =>
    encodeGenesisColor({ r: (i % 8) * 36, g: ((i >> 3) % 8) * 36, b: 0 }));
  doc.pixels.data[0] = canvasIndex(0, 1);
  doc.pixels.data[1] = canvasIndex(2, 15);
  doc.pixels.data[17] = canvasIndex(3, 7);
  return doc;
}

describe('canvas file format', () => {
  it('round-trips a document through PNG + sidecar', async () => {
    const doc = docWithArt();
    const { png, sidecar } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.name).toBe('Ramp');
    expect(back.profileId).toBe('genesis-level-art');
    expect(back.pixels.width).toBe(16);
    expect(back.pixels.height).toBe(8);
    expect(Array.from(back.pixels.data)).toEqual(Array.from(doc.pixels.data));
    expect(back.palette).toEqual(doc.palette);
  });

  it('recovers the palette from PLTE when the sidecar is missing', async () => {
    // A canvas opened from an Aseprite export has no sidecar. The colours still
    // have to come back — snapped to the Genesis 3-bit space.
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, null);
    expect(back.palette).toEqual(doc.palette.map((w) => encodeGenesisColor(decodeGenesisColor(w))));
    expect(back.profileId).toBe('none');   // unknown constraints, not assumed
  });

  it('normalizes foreign spellings of transparency on the way in', async () => {
    const png = await encodeIndexedPng({
      width: 4, height: 1,
      indices: new Uint8Array([0, 16, 32, 17]),
      palette: Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0 })),
      transparentIndex: 0,
    });
    const back = await decodeCanvasFiles(png, null);
    expect(Array.from(back.pixels.data)).toEqual([0, 0, 0, 17]);
  });

  it('refuses a PNG with more colours than a canvas holds, and says the numbers', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 1, indices: new Uint8Array([0, 1]),
      palette: Array.from({ length: 137 }, (_, i) => ({ r: i, g: 0, b: 0 })),
    });
    await expect(decodeCanvasFiles(png, null)).rejects.toThrow(/137.*64/s);
  });

  it('a sidecar naming an unknown profile still opens, unconstrained', async () => {
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const sidecar = JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, name: 'Ramp', profile: 'genesis-2027',
      palette: doc.palette, gridOrigin: { originX: 0, originY: 0 },
    });
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.profileId).toBe('none');
    expect(back.palette).toEqual(doc.palette);   // the palette is still honoured
  });

  it('parseCanvasSidecar rejects a future version and malformed JSON', () => {
    const bad = parseCanvasSidecar('{ not json');
    expect(bad.ok).toBe(false);
    const future = parseCanvasSidecar(JSON.stringify({ version: 99, name: 'x', profile: 'none', palette: [], gridOrigin: {} }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/99/);
  });

  it('parseCanvasSidecar rejects a palette that is the wrong length', () => {
    const r = parseCanvasSidecar(JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, name: 'x', profile: 'none',
      palette: [1, 2, 3], gridOrigin: { originX: 0, originY: 0 },
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/64/);
  });

  it('parseCanvasSidecar rejects a future version even with an otherwise-valid sidecar', () => {
    // The Step-1 fixture above pairs its bad version with an EMPTY palette
    // (also invalid, for an unrelated reason), so `ok === false` there could
    // in principle be caused by either guard — only the `.error` content
    // assertion actually distinguishes them (confirmed by falsification: see
    // the task report). This fixture is otherwise fully valid, so a false
    // here can only be the version guard.
    const r = parseCanvasSidecar(JSON.stringify({
      version: 2, name: 'x', profile: 'none',
      palette: new Array(CANVAS_COLORS).fill(0), gridOrigin: { originX: 0, originY: 0 },
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version 2/);
  });

  it('writes a sidecar a human can read and diff', async () => {
    const { sidecar } = await encodeCanvasFiles(docWithArt());
    expect(sidecar.endsWith('\n')).toBe(true);
    expect(sidecar).toContain('"version": 1');
  });

  // -------------------------------------------------------------------------
  // R10 — the codec deliberately does not guarantee decoded indices stay
  // inside the decoded palette's length, and this module is the checkpoint.
  // These probe that asymmetry directly, which the tests above (written
  // before Task 4's hardening) never exercise: every PNG they build either
  // goes through encodeIndexedPng (which enforces indices < palette.length)
  // or uses a palette that already covers every index in play.
  // -------------------------------------------------------------------------

  /** Hand-build an 8-bit indexed PNG whose pixel indices are free to exceed
   *  its own PLTE length — encodeIndexedPng refuses that on purpose (it is
   *  what makes IndexedImage.indices's "each byte < palette.length" promise
   *  true), so a hostile/foreign fixture has to be built independently of the
   *  module under test, the same way indexed-png-decode.test.ts's `handMade`
   *  does for row filters. */
  function pngWithOutOfRangeIndices(opts: {
    width: number; height: number; indices: number[];
    palette: { r: number; g: number; b: number }[];
  }): Uint8Array {
    const { width, height, indices, palette } = opts;
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
    const idv = new DataView(ihdr.buffer);
    idv.setUint32(0, width);
    idv.setUint32(4, height);
    ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const plte = new Uint8Array(palette.length * 3);
    palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; });
    // Filter 0 (None) on every row — indices are written raw, no bounds check.
    const raw = new Uint8Array((width + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (width + 1)] = 0;
      for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = indices[y * width + x] & 0xff;
    }
    const idat = new Uint8Array(deflateSync(Buffer.from(raw)));
    const parts = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mk('IHDR', ihdr), mk('PLTE', plte), mk('IDAT', idat), mk('IEND', new Uint8Array(0)),
    ];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  it('folds pixel indices that exceed the PNG\'s own palette length into a legal document', async () => {
    // A 3-colour PLTE with indices 5, 200, 63 and 2 in the pixel data: no
    // encoder we own would ever produce this (encodeIndexedPng refuses
    // indices[i] >= palette.length), but a foreign or hand-edited file is
    // not bound by that, and decodeIndexedPng deliberately does not check it
    // either (R10) — it is canvas-doc.ts's normalizeCanvasPixels that owns
    // folding the whole domain, not the file-format layer re-deriving it.
    const png = pngWithOutOfRangeIndices({
      width: 4, height: 1,
      indices: [5, 200, 63, 2],
      palette: [{ r: 10, g: 20, b: 30 }, { r: 40, g: 50, b: 60 }, { r: 70, g: 80, b: 90 }],
    });
    const back = await decodeCanvasFiles(png, null);
    // Every pixel must land in the canvas's 6-bit domain — the legality
    // canvas-doc.ts's own header comment demands of ANY CanvasDoc, not a
    // special case for PNG-sourced ones.
    expect(back.pixels.data.every((v) => v >= 0 && v <= 63)).toBe(true);
    // The RIGHT answer, not just "doesn't crash": canvasIndex masks both the
    // line and entry fields, so each raw byte folds deterministically —
    // 5 -> line 0 entry 5 (5 itself), 200 -> line (200>>4)&3=0, entry
    // 200&15=8 -> 8, 63 -> line 3 entry 15 -> 63 (already canonical), 2 -> 2.
    expect(Array.from(back.pixels.data)).toEqual([5, 8, 63, 2]);
    // A legal CanvasDoc always has a full 64-entry palette, independent of
    // what the source PNG's PLTE happened to hold.
    expect(back.palette).toHaveLength(64);
  });

  it('pads a PLTE shorter than 64 colours to a full palette, with a well-defined surplus', async () => {
    const rgb = [{ r: 10, g: 20, b: 30 }, { r: 200, g: 0, b: 0 }, { r: 0, g: 200, b: 0 }];
    const png = await encodeIndexedPng({
      width: 3, height: 1, indices: new Uint8Array([0, 1, 2]), palette: rgb,
    });
    const back = await decodeCanvasFiles(png, null);
    expect(back.palette).toHaveLength(64);
    // The first 3 entries are the snapped PLTE colours...
    expect(back.palette.slice(0, 3)).toEqual(rgb.map((c) => encodeGenesisColor(c)));
    // ...and the RIGHT answer for the other 61 is "black, like any other
    // unused canvas entry" (blankCanvasPalette's default), not leftover data
    // or a crash: a canvas created fresh via blankCanvasDoc has exactly the
    // same all-zero palette for slots nobody has painted with yet, so a PNG
    // with a short PLTE should look indistinguishable from that.
    expect(back.palette.slice(3)).toEqual(new Array(61).fill(0));
  });

  it('parseCanvasSidecar coerces junk palette entries to well-defined 16-bit words instead of throwing', () => {
    // A hand-edited sidecar is exactly the kind of file this function has to
    // survive (see this module's header). The RIGHT answer is graceful
    // coercion, not a crash and not silently propagating NaN into a CRAM
    // word that then renders as garbage with no diagnostic anywhere: Number(w)
    // & 0xffff turns every JS value into SOME 16-bit integer.
    const palette: unknown[] = new Array(CANVAS_COLORS).fill(0);
    palette[0] = 'not a number';
    palette[1] = null;
    palette[2] = undefined;
    palette[3] = {};
    palette[4] = [7];        // Number([7]) === 7 — arrays with one element coerce
    palette[5] = -1;         // wraps via two's complement, same as any bitwise mask
    palette[6] = 999999;     // masked to its low 16 bits
    palette[7] = 12.9;       // Number() keeps the fraction; only the mask below is integral... see assertion
    const r = parseCanvasSidecar(JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, name: 'x', profile: 'none', palette, gridOrigin: { originX: 0, originY: 0 },
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sidecar.palette).toHaveLength(CANVAS_COLORS);
    // Every entry is an integer 0..65535 — no NaN, no non-integer, whatever
    // the input was. This is the property that matters: decodeGenesisColor
    // can safely read bits out of ANY of these without special-casing junk.
    for (const w of r.sidecar.palette) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(0xffff);
    }
    expect(r.sidecar.palette[0]).toBe(0);       // 'not a number' -> NaN -> 0
    expect(r.sidecar.palette[1]).toBe(0);       // null -> 0
    expect(r.sidecar.palette[2]).toBe(0);       // undefined -> NaN -> 0
    expect(r.sidecar.palette[3]).toBe(0);       // {} -> NaN -> 0
    expect(r.sidecar.palette[4]).toBe(7);       // [7] -> 7
    expect(r.sidecar.palette[5]).toBe(0xffff);  // -1 & 0xffff
  });

  it('parseCanvasSidecar treats a missing or malformed gridOrigin as (0, 0), not a rejection', () => {
    const base = { version: CANVAS_SIDECAR_VERSION, name: 'x', profile: 'none', palette: new Array(CANVAS_COLORS).fill(0) };

    const missing = parseCanvasSidecar(JSON.stringify(base));  // no gridOrigin key at all
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.sidecar.gridOrigin).toEqual({ originX: 0, originY: 0 });

    const nullOrigin = parseCanvasSidecar(JSON.stringify({ ...base, gridOrigin: null }));
    expect(nullOrigin.ok).toBe(true);
    if (nullOrigin.ok) expect(nullOrigin.sidecar.gridOrigin).toEqual({ originX: 0, originY: 0 });

    const wrongType = parseCanvasSidecar(JSON.stringify({ ...base, gridOrigin: 'top-left' }));
    expect(wrongType.ok).toBe(true);
    if (wrongType.ok) expect(wrongType.sidecar.gridOrigin).toEqual({ originX: 0, originY: 0 });

    const partial = parseCanvasSidecar(JSON.stringify({ ...base, gridOrigin: { originX: 5 } }));
    expect(partial.ok).toBe(true);
    // RIGHT answer: a gridOrigin is a guide-alignment convenience (see this
    // module's header), not load-bearing data, so a malformed field should
    // never be the reason a sidecar — or the art it describes — fails to
    // open. Every case above degrades to a safe default instead of rejecting.
    if (partial.ok) expect(partial.sidecar.gridOrigin).toEqual({ originX: 5, originY: 0 });

    const nonNumeric = parseCanvasSidecar(JSON.stringify({ ...base, gridOrigin: { originX: 'left', originY: 'top' } }));
    expect(nonNumeric.ok).toBe(true);
    if (nonNumeric.ok) expect(nonNumeric.sidecar.gridOrigin).toEqual({ originX: 0, originY: 0 });
  });
});
