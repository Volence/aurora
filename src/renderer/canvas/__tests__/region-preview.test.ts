import { describe, it, expect } from 'vitest';
import { regionPreviewRgba } from '../region-preview';
import { rasterizeAeonChunk } from '../../providers/chunk-grid-aeon';
import { packNametableWord } from '../../../core/model/s4-types';
import type { Palette, Tile } from '../../../core/model/s4-types';

/**
 * THE PREVIEW BUFFER MUST FIT THE PREVIEW CANVAS — at every region size a
 * marquee can produce.
 *
 * ═══ THE CRASH THIS FILE STANDS OVER ═══
 *
 * The stamp ghost once rasterised through `rasterizeAeonChunk`, which returns a
 * FIXED 128x128 buffer (the thumbnail grid's contract), and paired it with an
 * ImageData sized to the chunk's own footprint. `ImageData.data` is a
 * `Uint8ClampedArray`, and `TypedArray.prototype.set` throws RangeError when the
 * source is longer than the destination — so every chunk smaller than 16x16
 * tiles threw. It threw from mousemove (which ate the ghost) and again from
 * inside the render effect after the stamp click, where it unmounted the whole
 * React root. That was the owner's crash, and marquee-saved chunks — arbitrary
 * sizes — were the input class that produced it.
 *
 * This parcel adds two more preview call sites (the paste ghost and the marquee
 * panel) over regions that go SMALLER (a single 8x8 tile) and ODDER (any width
 * by any height, no longer even) than any chunk the stamp path ever saw. So the
 * invariant is held here, at those sizes.
 *
 * ═══ WHY THIS IS A REAL ROW AND NOT A PROXY ═══
 *
 * `dest.set(rgba)` below is not "something like" the failing operation — it IS
 * it. `img.data` is a Uint8ClampedArray and `img.data.set(rgba)` is the exact
 * line that threw; the only thing this file cannot construct in node is the
 * ImageData wrapper around it, which is not the part that throws. Row 3 proves
 * the harness half of that by running the SAME assertion against the fixed-size
 * rasteriser and demanding it DOES throw — so a green row 2 cannot be an
 * assertion that is incapable of failing.
 */

const tiles: Tile[] = [
  { pixels: new Uint8Array(64) },                 // tile 0: colour 0
  { pixels: new Uint8Array(64).fill(1) },         // tile 1: colour 1
];
const palette: Palette = {
  lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 200, g: 40, b: 90, a: 255 }] }],
};

/** A region of the given tile dims, every cell referencing tile 1 so the
 *  rasteriser has something real to draw. */
function region(widthTiles: number, heightTiles: number) {
  const n = widthTiles * heightTiles;
  return {
    widthTiles, heightTiles,
    nametable: Uint16Array.from(
      Array.from({ length: n }, () => packNametableWord(1, 0, false, false, false))),
  };
}

/** Exactly what a preview canvas does with the buffer: `img.data.set(rgba)`. */
function intoNativeSizedImageBuffer(widthTiles: number, heightTiles: number,
  rgba: Uint8ClampedArray): void {
  const dest = new Uint8ClampedArray(widthTiles * 8 * heightTiles * 8 * 4);
  dest.set(rgba);
}

// Every shape the two new call sites can be handed. 1x1 is a single-tile
// marquee; 5x3 and 33x17 are odd in both axes, which BLOCK granularity could
// never produce and which therefore had no prior coverage anywhere; 16x16 is
// the size at which the old fixed buffer happened to be correct, included so a
// regression cannot hide behind the one case that always worked.
const SIZES: ReadonlyArray<[number, number]> = [
  [1, 1], [1, 5], [5, 1], [3, 3], [5, 3], [16, 16], [33, 17], [64, 2],
];

describe('regionPreviewRgba', () => {
  it('1. returns exactly (w*8)*(h*8)*4 bytes for every marquee-producible size', () => {
    for (const [w, h] of SIZES) {
      const rgba = regionPreviewRgba(region(w, h), tiles, palette);
      expect(rgba, `${w}x${h}`).not.toBeNull();
      expect(rgba!.length, `${w}x${h}`).toBe(w * 8 * h * 8 * 4);
    }
  });

  it('2. THE CRASH ROW: `img.data.set(rgba)` into a natively-sized buffer never '
    + 'throws, at every one of those sizes', () => {
    for (const [w, h] of SIZES) {
      const rgba = regionPreviewRgba(region(w, h), tiles, palette)!;
      expect(() => intoNativeSizedImageBuffer(w, h, rgba), `${w}x${h}`).not.toThrow();
    }
  });

  it('3. THE ASSERTION CAN FAIL: the fixed-size thumbnail rasteriser throws '
    + 'RangeError through the identical assertion, for every region under 16x16 tiles', () => {
    // This is the shipped defect, reproduced deliberately. Without it, row 2 is
    // "a thing that does not throw does not throw" and would stay green if
    // `regionPreviewRgba` were replaced by a stub returning an empty array.
    const throwers = SIZES.filter(([w, h]) => w * h < 16 * 16);
    expect(throwers.length).toBeGreaterThan(0);
    for (const [w, h] of throwers) {
      const fixed = rasterizeAeonChunk(
        { ...region(w, h), id: 'x', name: 'x', collisionA: new Uint16Array(0), collisionB: new Uint16Array(0) },
        tiles, palette)!;
      expect(fixed.length).toBe(128 * 128 * 4);   // the fixed contract, unchanged
      expect(() => intoNativeSizedImageBuffer(w, h, fixed), `${w}x${h}`).toThrow(RangeError);
    }
  });

  it('4. ANTI-VACUOUS: the buffer holds the REGION\'S ART, not zeroes: a stub '
    + 'returning a correctly-sized empty array would pass rows 1 and 2', () => {
    const rgba = regionPreviewRgba(region(5, 3), tiles, palette)!;
    // Every pixel is tile 1 -> palette colour 1 -> (200,40,90,255).
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([200, 40, 90, 255]);
    // ...including the far corner, which is what catches a raster that got the
    // stride right and the height wrong.
    const last = (5 * 8 * 3 * 8 - 1) * 4;
    expect([rgba[last], rgba[last + 1], rgba[last + 2], rgba[last + 3]]).toEqual([200, 40, 90, 255]);
  });

  it('5. refuses a degenerate region rather than allocating a zero-byte canvas', () => {
    expect(regionPreviewRgba(region(0, 4), tiles, palette)).toBeNull();
    expect(regionPreviewRgba(region(4, 0), tiles, palette)).toBeNull();
    expect(regionPreviewRgba({ widthTiles: -1, heightTiles: 4, nametable: new Uint16Array(0) },
      tiles, palette)).toBeNull();
  });
});
