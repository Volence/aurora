// src/core/art/__tests__/canvas-file-format.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  encodeCanvasFiles, decodeCanvasFiles, parseCanvasSidecar,
  CANVAS_SIDECAR_VERSION, CANVAS_PLACEHOLDER_NAME,
} from '../canvas-file-format';
import { blankCanvasDoc, canvasIndex, CANVAS_COLORS } from '../canvas-doc';
import { encodeIndexedPng, parseChunks } from '../indexed-png';
import { encodeGenesisColor } from '../../formats/palette';

function docWithArt() {
  const doc = blankCanvasDoc({ name: 'Ramp', width: 16, height: 8, profileId: 'genesis-level-art' });
  // A recognisable palette: line L entry E -> a distinct CRAM word.
  doc.palette = Array.from({ length: CANVAS_COLORS }, (_, i) =>
    encodeGenesisColor({ r: (i % 8) * 36, g: ((i >> 3) % 8) * 36, b: 0 }));
  doc.pixels.data[0] = canvasIndex(0, 1);
  doc.pixels.data[1] = canvasIndex(2, 15);
  doc.pixels.data[17] = canvasIndex(3, 7);
  // H1: a non-zero origin, so the round-trip test below can actually catch a
  // regression that hardcodes gridOrigin on the way out — (0,0) was already
  // the default, so a bug that discarded it would otherwise be invisible.
  doc.gridOrigin = { originX: 3, originY: 5 };
  return doc;
}

describe('canvas file format', () => {
  it('round-trips a document through PNG + sidecar', async () => {
    const doc = docWithArt();
    const { png, sidecar } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.doc.profileId).toBe('genesis-level-art');
    expect(back.doc.pixels.width).toBe(16);
    expect(back.doc.pixels.height).toBe(8);
    expect(Array.from(back.doc.pixels.data)).toEqual(Array.from(doc.pixels.data));
    expect(back.doc.palette).toEqual(doc.palette);
    // H1: the origin must actually come back, not just default to (0,0).
    expect(back.doc.gridOrigin).toEqual({ originX: 3, originY: 5 });
    expect(back.warnings).toEqual([]);
    expect(back.sidecarRejected).toBe(false);
  });

  it('recovers the palette from PLTE when the sidecar is missing', async () => {
    // A canvas opened from an Aseprite export has no sidecar. The colours still
    // have to come back.
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, null);
    // NOTE: this is an IDENTITY, not proof of snapping. decodeGenesisColor
    // always returns RGB values sitting exactly on one of the Genesis' 8 steps
    // per channel, so a PLTE built (as this one was) from THIS module's own
    // encodeGenesisColor can never hold an off-grid colour to snap in the
    // first place. "snaps an off-grid PLTE colour..." below is the test that
    // actually exercises snapping, against a hand-built PLTE and
    // hand-verified expected words.
    expect(back.doc.palette).toEqual(doc.palette);
    expect(back.doc.profileId).toBe('none');   // unknown constraints, not assumed
    expect(back.doc.name).toBe(CANVAS_PLACEHOLDER_NAME); // I3: caller supplies the real name
    expect(back.sidecarRejected).toBe(false);  // no sidecar supplied isn't a rejection
    expect(back.warnings).toEqual([]);         // a full 64-colour PLTE needs no note
  });

  it('snaps an off-grid PLTE colour to the nearest Genesis word, verified against hand-computed values', async () => {
    // Hand-verified against encodeGenesisColor's 0BGR layout
    // (to3(v) = round(v/255*7), word = (b<<9)|(g<<5)|(r<<1)):
    //   (250,130,5) -> r=round(250/255*7)=7, g=round(130/255*7)=4, b=round(5/255*7)=0
    //                -> (0<<9)|(4<<5)|(7<<1) = 128 + 14 = 142 = 0x008e
    //   ( 10, 20,30) -> r=round(10/255*7)=0, g=round(20/255*7)=1, b=round(30/255*7)=1
    //                -> (1<<9)|(1<<5)|(0<<1) = 512 + 32 = 544 = 0x0220
    const png = await encodeIndexedPng({
      width: 2, height: 1, indices: new Uint8Array([0, 1]),
      palette: [{ r: 250, g: 130, b: 5 }, { r: 10, g: 20, b: 30 }],
    });
    const back = await decodeCanvasFiles(png, null);
    expect(back.doc.palette[0]).toBe(0x008e);
    expect(back.doc.palette[1]).toBe(0x0220);
  });

  it('normalizes foreign spellings of transparency on the way in', async () => {
    const png = await encodeIndexedPng({
      width: 4, height: 1,
      indices: new Uint8Array([0, 16, 32, 17]),
      palette: Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0 })),
      transparentIndex: 0,
    });
    const back = await decodeCanvasFiles(png, null);
    expect(Array.from(back.doc.pixels.data)).toEqual([0, 0, 0, 17]);
  });

  it('refuses a PNG with more colours than a canvas holds, and says the numbers', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 1, indices: new Uint8Array([0, 1]),
      palette: Array.from({ length: 137 }, (_, i) => ({ r: i, g: 0, b: 0 })),
    });
    await expect(decodeCanvasFiles(png, null)).rejects.toThrow(/137.*64.*4 lines x 16/s);
  });

  it('a sidecar naming an unknown profile still opens, unconstrained', async () => {
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const sidecar = JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, profile: 'genesis-2027',
      palette: doc.palette, gridOrigin: doc.gridOrigin,
    });
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.doc.profileId).toBe('none');
    expect(back.doc.palette).toEqual(doc.palette);   // the palette is still honoured
    expect(back.sidecarRejected).toBe(false);         // the sidecar itself parsed fine
  });

  it('parseCanvasSidecar rejects a future version and malformed JSON', () => {
    const bad = parseCanvasSidecar('{ not json');
    expect(bad.ok).toBe(false);
    const future = parseCanvasSidecar(JSON.stringify({ version: 99, profile: 'none', palette: [], gridOrigin: {} }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/99/);
  });

  it('parseCanvasSidecar splits "newer" from "older" and ends each message in an action', () => {
    // I4: version 99 (unambiguously ahead of CANVAS_SIDECAR_VERSION = 1) and
    // version 0 (behind it) are different problems and must not collapse into
    // the SAME wording. Both fixtures below are otherwise fully valid, so a
    // failure here can only be the version guard, not some other field —
    // this is the fixture the Step-1 test above deliberately doesn't have
    // (its palette is also invalid, which can mask which guard actually ran).
    const validRest = { palette: new Array(CANVAS_COLORS).fill(0), gridOrigin: { originX: 0, originY: 0 } };
    const newer = parseCanvasSidecar(JSON.stringify({ version: 2, profile: 'none', ...validRest }));
    expect(newer.ok).toBe(false);
    if (!newer.ok) {
      expect(newer.error).toMatch(/version 2 is newer/);
      expect(newer.error).toMatch(/update Aurora/);
    }
    const older = parseCanvasSidecar(JSON.stringify({ version: 0, profile: 'none', ...validRest }));
    expect(older.ok).toBe(false);
    if (!older.ok) {
      expect(older.error).toMatch(/version 0 is older/);
      expect(older.error).toMatch(/update Aurora/);
    }
  });

  it('parseCanvasSidecar rejects a palette that is the wrong length', () => {
    const r = parseCanvasSidecar(JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, profile: 'none',
      palette: [1, 2, 3], gridOrigin: { originX: 0, originY: 0 },
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/64/);
  });

  it('writes a sidecar a human can read and diff', async () => {
    const { sidecar } = await encodeCanvasFiles(docWithArt());
    expect(sidecar.endsWith('\n')).toBe(true);
    expect(sidecar).toContain('"version": 1');
    // I3: name is never written — it would only ever be a stale copy of the
    // filename, and nothing reads it back.
    expect(sidecar).not.toContain('"name"');
  });

  // -------------------------------------------------------------------------
  // I1/I2/M2/M3 — reportability. A guard whose diagnostic never reaches a
  // caller is this project's own documented defect class; these confirm each
  // diagnosis this module computes actually surfaces through CanvasLoad.
  // -------------------------------------------------------------------------

  it('a sidecar that fails to parse opens the art anyway, flagged as rejected, with the reason as a warning', async () => {
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, '{ not json');
    expect(back.sidecarRejected).toBe(true);
    expect(back.doc.pixels.width).toBe(doc.pixels.width);   // the art still opens
    expect(back.doc.profileId).toBe('none');                 // recovered, not the rejected sidecar's
    expect(back.warnings.some((w) => /sidecar could not be read/.test(w) && /not valid JSON/.test(w))).toBe(true);
  });

  it('a sidecar with a bad version also opens the art, flagged as rejected', async () => {
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const badSidecar = JSON.stringify({ version: 2, profile: 'none', palette: doc.palette, gridOrigin: doc.gridOrigin });
    const back = await decodeCanvasFiles(png, badSidecar);
    expect(back.sidecarRejected).toBe(true);
    expect(back.warnings.some((w) => /version 2 is newer/.test(w))).toBe(true);
  });

  /** Mutate an already-encoded PNG's PLTE entry 0 in place, simulating a
   *  re-save by a tool (Aseprite) that knows nothing about the sidecar.
   *  `parseChunks`' chunk `data` fields are VIEWS into the buffer, and
   *  decodeIndexedPng deliberately does not verify chunk CRCs (see its own
   *  comment), so poking bytes here without recomputing one is exactly the
   *  kind of file a real re-save (which DOES fix up the CRC) is a superset
   *  of — a stricter fixture, not a cheat. */
  function recolourFirstPaletteEntry(png: Uint8Array, rgb: { r: number; g: number; b: number }): Uint8Array {
    const copy = new Uint8Array(png);
    const plte = parseChunks(copy).find((c) => c.type === 'PLTE');
    if (!plte) throw new Error('test fixture has no PLTE chunk');
    plte.data[0] = rgb.r; plte.data[1] = rgb.g; plte.data[2] = rgb.b;
    return copy;
  }

  it('I2: warns when the PNG has been recoloured by another tool since the sidecar was last saved, and the sidecar still wins', async () => {
    const doc = docWithArt();
    const { png, sidecar } = await encodeCanvasFiles(doc);
    // doc.palette[0] is encodeGenesisColor({r:0,g:0,b:0}) === 0; recolour PLTE
    // entry 0 to white, which snaps to a word nowhere near 0 (0x0eee) — a
    // definite, not marginal, disagreement.
    const recoloured = recolourFirstPaletteEntry(png, { r: 255, g: 255, b: 255 });
    const back = await decodeCanvasFiles(recoloured, sidecar);
    expect(back.warnings.some((w) => /no longer match its sidecar/.test(w) && /another tool/.test(w))).toBe(true);
    // The sidecar wins for colour — the PNG's new white is NOT what comes back.
    expect(back.doc.palette[0]).toBe(doc.palette[0]);
    expect(back.doc.palette[0]).not.toBe(encodeGenesisColor({ r: 255, g: 255, b: 255 }));
    // Recolouring is not a parse failure — the sidecar WAS understood.
    expect(back.sidecarRejected).toBe(false);
  });

  it('I2: an untouched PNG next to its own sidecar raises no mismatch warning', async () => {
    // Guards against a detector so eager it fires on every load — the
    // baseline round-trip test above already asserts `warnings` is empty, but
    // this pins the specific "no false positive on an exact match" case.
    const doc = docWithArt();
    const { png, sidecar } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.warnings.some((w) => /no longer match/.test(w))).toBe(false);
  });

  it('M3: warns when a PNG marks a transparency index other than 0, which a canvas cannot honour', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 1, indices: new Uint8Array([0, 2]),
      palette: [{ r: 0, g: 0, b: 0 }, { r: 10, g: 10, b: 10 }, { r: 20, g: 20, b: 20 }],
      transparentIndex: 2,
    });
    const back = await decodeCanvasFiles(png, null);
    expect(back.warnings.some((w) => /entry 2/.test(w) && /can only treat entry 0/.test(w))).toBe(true);
  });

  it('M2: encodeCanvasFiles refuses a wrong-length palette by name, not as a pixel-index error', async () => {
    const doc = docWithArt();
    doc.palette = doc.palette.slice(0, 30);
    await expect(encodeCanvasFiles(doc)).rejects.toThrow(/64 CRAM words \(got 30\)/);
  });

  // -------------------------------------------------------------------------
  // H2 — the encoded PNG must actually declare transparency (tRNS), not rely
  // on index-0-is-transparent as an unstated convention a real viewer has no
  // way to know. Verified by parseChunks against the raw bytes: decoding
  // cannot catch a missing tRNS here because decodeIndexedPng treats a
  // missing tRNS as "nothing is transparent," which is a legal file, just the
  // wrong one — indistinguishable from the outside without reading the bytes.
  // -------------------------------------------------------------------------

  it('H2: the encoded PNG actually declares transparency via a tRNS chunk', async () => {
    const { png } = await encodeCanvasFiles(docWithArt());
    const trns = parseChunks(png).find((c) => c.type === 'tRNS');
    expect(trns).toBeDefined();
    expect(trns!.data[0]).toBe(0); // alpha 0 for palette index 0 = CANVAS_TRANSPARENT
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
    expect(back.doc.pixels.data.every((v) => v >= 0 && v <= 63)).toBe(true);
    // The RIGHT answer, not just "doesn't crash": canvasIndex masks both the
    // line and entry fields, so each raw byte folds deterministically —
    // 5 -> line 0 entry 5 (5 itself), 200 -> line (200>>4)&3=0, entry
    // 200&15=8 -> 8, 63 -> line 3 entry 15 -> 63 (already canonical), 2 -> 2.
    expect(Array.from(back.doc.pixels.data)).toEqual([5, 8, 63, 2]);
    // A legal CanvasDoc always has a full 64-entry palette, independent of
    // what the source PNG's PLTE happened to hold.
    expect(back.doc.palette).toHaveLength(64);
  });

  it('pads a PLTE shorter than 64 colours to a full palette, with a well-defined surplus', async () => {
    const rgb = [{ r: 10, g: 20, b: 30 }, { r: 200, g: 0, b: 0 }, { r: 0, g: 200, b: 0 }];
    const png = await encodeIndexedPng({
      width: 3, height: 1, indices: new Uint8Array([0, 1, 2]), palette: rgb,
    });
    const back = await decodeCanvasFiles(png, null);
    expect(back.doc.palette).toHaveLength(64);
    // The first 3 entries are the snapped PLTE colours...
    expect(back.doc.palette.slice(0, 3)).toEqual(rgb.map((c) => encodeGenesisColor(c)));
    // ...and the RIGHT answer for the other 61 is "black, like any other
    // unused canvas entry" (blankCanvasPalette's default), not leftover data
    // or a crash: a canvas created fresh via blankCanvasDoc has exactly the
    // same all-zero palette for slots nobody has painted with yet, so a PNG
    // with a short PLTE should look indistinguishable from that.
    expect(back.doc.palette.slice(3)).toEqual(new Array(61).fill(0));
    // The short-PLTE note, absorbed into the warnings channel: the artist
    // should be told their canvas has fewer real colours than the PLTE-length
    // ceiling might suggest, not silently get a black fill with no record.
    expect(back.warnings.some((w) => /only 3 colours/.test(w) && /61/.test(w))).toBe(true);
  });

  it('parseCanvasSidecar coerces junk palette entries to well-defined values inside the Genesis word domain instead of throwing', () => {
    // A hand-edited sidecar is exactly the kind of file this function has to
    // survive (see this module's header). The RIGHT answer is graceful
    // coercion, not a crash and not silently propagating NaN into a CRAM
    // word that then renders as garbage with no diagnostic anywhere:
    // Number(w) & GENESIS_WORD_MASK turns every JS value into some value
    // inside the mask's domain (0..0x0eee, i.e. never more than 0x0eee since
    // the mask clears every bit outside it).
    const palette: unknown[] = new Array(CANVAS_COLORS).fill(0);
    palette[0] = 'not a number';
    palette[1] = null;
    palette[2] = undefined;
    palette[3] = {};
    palette[4] = [7];        // Number([7]) === 7 — arrays with one element coerce
    palette[5] = -1;         // wraps via two's complement, same as any bitwise mask
    palette[6] = 999999;     // masked to the low bits GENESIS_WORD_MASK keeps
    palette[7] = 12.9;       // Number() keeps the fraction; ToInt32 truncates it
    const r = parseCanvasSidecar(JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, profile: 'none', palette, gridOrigin: { originX: 0, originY: 0 },
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sidecar.palette).toHaveLength(CANVAS_COLORS);
    // Every entry is an integer within the live-bit domain — no NaN, no
    // non-integer, whatever the input was. This is the property that
    // matters: decodeGenesisColor can safely read bits out of ANY of these
    // without special-casing junk.
    for (const w of r.sidecar.palette) {
      expect(Number.isInteger(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(0x0eee);
    }
    // Hand-computed against GENESIS_WORD_MASK = 0x0eee (0000 1110 1110 1110):
    expect(r.sidecar.palette[0]).toBe(0);      // 'not a number' -> NaN -> 0
    expect(r.sidecar.palette[1]).toBe(0);      // null -> 0
    expect(r.sidecar.palette[2]).toBe(0);      // undefined -> NaN -> 0
    expect(r.sidecar.palette[3]).toBe(0);      // {} -> NaN -> 0
    expect(r.sidecar.palette[4]).toBe(6);      // [7] -> 7 -> 7 & 0x0eee = 6
    expect(r.sidecar.palette[5]).toBe(0x0eee); // -1 & 0x0eee = 0x0eee (every live bit set)
    expect(r.sidecar.palette[6]).toBe(0x022e); // 999999 & 0x0eee = 0x022e
    expect(r.sidecar.palette[7]).toBe(12);     // 12.9 -> truncates to 12, already inside the mask
  });

  it('parseCanvasSidecar treats a missing or malformed gridOrigin as (0, 0), not a rejection', () => {
    const base = { version: CANVAS_SIDECAR_VERSION, profile: 'none', palette: new Array(CANVAS_COLORS).fill(0) };

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

  it('I5: parseCanvasSidecar folds a non-finite gridOrigin value to 0 instead of letting Infinity through', () => {
    // Number('1e400') is Infinity, and the previous `Number(x) || 0` form let
    // it straight through (Infinity is truthy). `| 0` (ToInt32) turns any
    // non-finite value into 0, same fold blankCanvasDoc already applies to
    // width/height.
    const r = parseCanvasSidecar(JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, profile: 'none', palette: new Array(CANVAS_COLORS).fill(0),
      gridOrigin: { originX: '1e400', originY: 5.9 },
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sidecar.gridOrigin).toEqual({ originX: 0, originY: 5 });
  });
});
