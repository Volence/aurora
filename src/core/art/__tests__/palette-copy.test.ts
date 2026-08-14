// palette-copy is what every "Copy to ▸" menu item and every swatch/line DROP in
// PaletteEditor goes through, and it had no test at all. Its three rules are the
// kind that fail silently — a copy that overwrites index 0 looks fine until the
// transparent backdrop of a sprite line turns opaque black, and a copy that skips
// the gamut snap looks fine until the palette is written back to CRAM and the
// colors are not what the editor showed.

import { describe, it, expect } from 'vitest';
import { copySwatchInto, copyLineInto, snapColorToGenesis } from '../palette-copy';
import { encodeGenesisColor, decodeGenesisColor } from '../../formats/palette';
import type { Color } from '../../model/s4-types';

const c = (r: number, g: number, b: number, a = 255): Color => ({ r, g, b, a });

/** A 16-color line whose every index is distinguishable. */
function line(): Color[] {
  return Array.from({ length: 16 }, (_, i) => c(i * 16, 0, 0, i === 0 ? 0 : 255));
}

describe('snapColorToGenesis', () => {
  it('quantizes each channel to one of the 8 Genesis levels', () => {
    // 130 is nearest level 4 (=146); 200 nearest level 5 (=182); 10 nearest 0.
    const s = snapColorToGenesis(c(130, 200, 10));
    expect([s.r, s.g, s.b]).toEqual([146, 182, 0]);
    // …and the result is a fixed point: snapping a snapped color changes nothing.
    expect(snapColorToGenesis(s)).toEqual(s);
  });

  it('PRESERVES alpha — it is a gamut operation, not an opacity one', () => {
    expect(snapColorToGenesis(c(130, 130, 130, 0)).a).toBe(0);
    expect(snapColorToGenesis(c(130, 130, 130, 255)).a).toBe(255);
  });
});

describe('copySwatchInto', () => {
  it('writes the snapped source at the destination index and nowhere else', () => {
    const dest = line();
    const out = copySwatchInto(dest, 5, c(130, 200, 10));
    expect([out[5].r, out[5].g, out[5].b]).toEqual([146, 182, 0]);
    for (let i = 0; i < 16; i++) {
      if (i !== 5) expect(out[i], `index ${i} was disturbed`).toEqual(dest[i]);
    }
  });

  it('FORCES the copy opaque even from a transparent source', () => {
    // The source may be index 0 of some other line, which carries a === 0. Copied
    // into a paintable index it must not make that index invisible.
    const out = copySwatchInto(line(), 3, c(255, 255, 255, 0));
    expect(out[3].a).toBe(255);
  });

  it('never writes index 0, the transparent backdrop', () => {
    const dest = line();
    const out = copySwatchInto(dest, 0, c(255, 255, 255));
    expect(out[0]).toEqual(dest[0]);
    expect(out[0].a).toBe(0);
  });

  it('never writes a negative or out-of-range index', () => {
    const dest = line();
    for (const idx of [-1, 16, 99]) {
      expect(copySwatchInto(dest, idx, c(255, 255, 255)), `idx ${idx}`).toEqual(dest);
    }
  });

  it('does not mutate `dest`, and returns fresh color objects', () => {
    const dest = line();
    const before = JSON.parse(JSON.stringify(dest));
    const out = copySwatchInto(dest, 5, c(255, 255, 255));
    expect(dest).toEqual(before);
    expect(out).not.toBe(dest);
    // Deep, not shallow: mutating a returned color must not reach back into dest.
    out[7].r = 1;
    expect(dest[7].r).not.toBe(1);
  });
});

describe('copyLineInto', () => {
  it('copies indices 1-15 snapped and opaque, preserving dest index 0', () => {
    const dest = line();
    const src = Array.from({ length: 16 }, () => c(130, 200, 10, 0));
    const out = copyLineInto(dest, src);
    expect(out[0]).toEqual(dest[0]);
    expect(out[0].a).toBe(0);
    for (let i = 1; i < 16; i++) {
      expect([out[i].r, out[i].g, out[i].b], `index ${i}`).toEqual([146, 182, 0]);
      expect(out[i].a, `index ${i} alpha`).toBe(255);
    }
  });

  it('ignores src[0] entirely', () => {
    const dest = line();
    const src = line();
    src[0] = c(255, 255, 255, 255);
    expect(copyLineInto(dest, src)[0]).toEqual(dest[0]);
  });

  it('stops at the shorter of the two arrays', () => {
    // A short source leaves the tail of dest alone rather than writing undefined.
    const dest = line();
    const out = copyLineInto(dest, [c(0, 0, 0), c(255, 255, 255), c(255, 255, 255)]);
    expect(out).toHaveLength(16);
    expect(out[1].r).toBe(255);
    expect(out[2].r).toBe(255);
    for (let i = 3; i < 16; i++) expect(out[i], `index ${i}`).toEqual(dest[i]);
    // …and a short DEST is not grown by a long source.
    expect(copyLineInto([c(0, 0, 0, 0), c(0, 0, 0)], line())).toHaveLength(2);
  });

  it('does not mutate either argument', () => {
    const dest = line();
    const src = line();
    const snap = JSON.parse(JSON.stringify([dest, src]));
    copyLineInto(dest, src);
    expect([dest, src]).toEqual(snap);
  });

  it('round-trips through the CRAM encoder unchanged', () => {
    // The point of the snap: what the editor shows after a copy is exactly what
    // gets written to the ROM, with no second quantization shifting it.
    // Deliberately NOT phrased through snapColorToGenesis — that would hold even
    // if the snap were the identity function. decode(encode(x)) is CRAM's own
    // round trip, and only an already-quantized color survives it unchanged.
    const out = copyLineInto(line(), Array.from({ length: 16 }, (_, i) => c(i * 17, 255 - i * 17, 90)));
    for (let i = 1; i < 16; i++) {
      const viaCram = decodeGenesisColor(encodeGenesisColor(out[i]));
      expect([viaCram.r, viaCram.g, viaCram.b], `index ${i}`).toEqual([out[i].r, out[i].g, out[i].b]);
    }
  });
});
