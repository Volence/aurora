import { describe, it, expect } from 'vitest';
import { importPngAgainstPalette } from '../png-import';
import type { DecodedIndexedPng } from '../indexed-png';
import { encodeGenesisColor } from '../../formats/palette';
import { paletteLineOf, paletteEntryOf } from '../canvas-doc';

const RED = { r: 255, g: 0, b: 0 };
const GREEN = { r: 0, g: 255, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };
const PURPLE = { r: 255, g: 0, b: 255 };

/** A 64-word act palette, line-major, with the given colours placed. */
function actPalette(place: { line: number; entry: number; rgb: { r: number; g: number; b: number } }[]) {
  const p = new Array(64).fill(0);
  for (const { line, entry, rgb } of place) p[line * 16 + entry] = encodeGenesisColor(rgb);
  return p;
}

/** A w×h indexed PNG whose pixel at (x,y) is `fn(x,y)` (a PLTE index). */
function png(
  w: number, h: number, palette: { r: number; g: number; b: number }[],
  fn: (x: number, y: number) => number, transparentIndex: number | null = null,
): DecodedIndexedPng {
  const indices = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) indices[y * w + x] = fn(x, y);
  return { width: w, height: h, indices, palette: palette.map((c) => ({ ...c })), transparentIndex } as DecodedIndexedPng;
}

describe('importPngAgainstPalette — the happy path', () => {
  it('maps a single-colour image onto the line that holds it', () => {
    const pal = actPalette([{ line: 2, entry: 5, rgb: RED }]);
    const r = importPngAgainstPalette(png(8, 8, [RED], () => 0), pal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.usedLines).toEqual([2]);
    expect(paletteLineOf(r.result.pixels.data[0])).toBe(2);
    expect(paletteEntryOf(r.result.pixels.data[0])).toBe(5);
  });

  it('keeps a transparent pixel at index 0, whatever line the cell chose', () => {
    const pal = actPalette([{ line: 1, entry: 3, rgb: RED }]);
    // index 1 is transparent
    const r = importPngAgainstPalette(png(8, 8, [RED, BLACK], (x) => (x < 4 ? 0 : 1), 1), pal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pixels.data[0]).not.toBe(0);
    expect(r.result.pixels.data[7]).toBe(0);
  });
});

describe('importPngAgainstPalette — the reason this is not a lookup', () => {
  /**
   * The failure a per-COLOUR mapping produces. Black lives in every line of a
   * real act palette; red lives only in line 2. A first-match-wins mapping puts
   * black in line 0 and red in line 2, so a cell containing both is a clash the
   * artist cannot fix — nothing they drew is wrong.
   */
  it('assigns a shared colour to the line its NEIGHBOURS need', () => {
    const pal = actPalette([
      { line: 0, entry: 1, rgb: BLACK },
      { line: 1, entry: 1, rgb: BLACK },
      { line: 2, entry: 1, rgb: BLACK },
      { line: 3, entry: 1, rgb: BLACK },
      { line: 2, entry: 4, rgb: RED },
    ]);
    // One cell: half black, half red. Only line 2 can express both.
    const r = importPngAgainstPalette(png(8, 8, [BLACK, RED], (x) => (x < 4 ? 0 : 1)), pal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.usedLines).toEqual([2]);
    // Both pixels resolved in line 2 — including the black one, which a
    // per-colour mapping would have put in line 0.
    expect(paletteLineOf(r.result.pixels.data[0])).toBe(2);
    expect(paletteLineOf(r.result.pixels.data[4])).toBe(2);
  });

  it('lets two cells choose DIFFERENT lines when they need to', () => {
    const pal = actPalette([
      { line: 0, entry: 1, rgb: BLACK }, { line: 1, entry: 1, rgb: BLACK },
      { line: 0, entry: 2, rgb: GREEN },
      { line: 1, entry: 2, rgb: BLUE },
    ]);
    // Left cell: black + green (line 0 only). Right cell: black + blue (line 1).
    const r = importPngAgainstPalette(
      png(16, 8, [BLACK, GREEN, BLUE], (x) => (x < 8 ? (x < 4 ? 0 : 1) : (x < 12 ? 0 : 2))),
      pal,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.usedLines).toEqual([0, 1]);
    expect(paletteLineOf(r.result.pixels.data[0])).toBe(0);
    expect(paletteLineOf(r.result.pixels.data[8])).toBe(1);
  });

  it('refuses a cell no single line can express, naming it', () => {
    const pal = actPalette([
      { line: 0, entry: 1, rgb: GREEN },
      { line: 1, entry: 1, rgb: BLUE },
    ]);
    // Green is line 0 only, blue is line 1 only, and they share a cell.
    const r = importPngAgainstPalette(png(8, 8, [GREEN, BLUE], (x) => (x < 4 ? 0 : 1)), pal);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe('cell-needs-two-lines');
    expect(r.refusal.cells).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('importPngAgainstPalette — refusals and tolerance', () => {
  it('refuses a colour the act does not have, naming the CRAM word', () => {
    const pal = actPalette([{ line: 0, entry: 1, rgb: RED }]);
    const r = importPngAgainstPalette(png(8, 8, [RED, PURPLE], (x) => (x < 4 ? 0 : 1)), pal);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.kind).toBe('colour-not-in-act');
    expect(r.refusal.colours).toEqual([encodeGenesisColor(PURPLE)]);
  });

  it('ignores palette entries the image never draws with', () => {
    // A 256-entry PLTE for a two-colour picture is routine; an unused colour
    // with no home must not be able to refuse the import.
    const pal = actPalette([{ line: 0, entry: 1, rgb: RED }]);
    const big = [RED, PURPLE, WHITE, GREEN, BLUE];
    const r = importPngAgainstPalette(png(8, 8, big, () => 0), pal);
    expect(r.ok).toBe(true);
  });

  it('snaps an off-grid colour into the 3-bit space and counts it', () => {
    // 250 is not on the 3-bit grid; it snaps to 255.
    const nearlyRed = { r: 250, g: 0, b: 0 };
    const pal = actPalette([{ line: 0, entry: 1, rgb: RED }]);
    const r = importPngAgainstPalette(png(8, 8, [nearlyRed], () => 0), pal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.snappedColours).toBe(1);
    expect(paletteEntryOf(r.result.pixels.data[0])).toBe(1);
  });

  it('handles an image far larger than a canvas may be — that is the point', () => {
    const pal = actPalette([{ line: 1, entry: 1, rgb: RED }]);
    const r = importPngAgainstPalette(png(2048, 512, [RED], () => 0), pal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pixels.width).toBe(2048);
    expect(r.result.pixels.height).toBe(512);
  });

  it('treats a blank cell as unconstrained rather than as a clash', () => {
    const pal = actPalette([{ line: 3, entry: 1, rgb: RED }]);
    // Left cell all transparent, right cell red.
    const r = importPngAgainstPalette(
      png(16, 8, [RED, BLACK], (x) => (x < 8 ? 1 : 0), 1), pal,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.usedLines).toEqual([3]);
  });
});

describe('importPngAgainstPalette — the rules that had no test', () => {
  /**
   * Entry 0 NEVER DRAWS, in any line. If a line's entry-0 slot happens to hold
   * the colour being mapped, treating it as a candidate spells an opaque pixel
   * as index 0 — the art silently disappears, and every downstream count agrees
   * with the disappearance. Found by planting `entry = 0` in the candidate scan
   * and watching every test still pass.
   */
  it('never spells an opaque pixel with entry 0, even when that slot holds the colour', () => {
    const pal = actPalette([
      { line: 0, entry: 0, rgb: RED },  // the transparent slot happens to be red
      { line: 2, entry: 5, rgb: RED },  // the real home
    ]);
    const r = importPngAgainstPalette(png(8, 8, [RED], () => 0), pal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pixels.data[0]).not.toBe(0);
    expect(paletteEntryOf(r.result.pixels.data[0])).toBe(5);
    expect(paletteLineOf(r.result.pixels.data[0])).toBe(2);
  });

  /**
   * A cell that could use several lines takes the one the REST of the sheet
   * needs. A block cell's palette line is part of its identity, so scattering
   * flexible cells across lines splits blocks that would otherwise be one.
   * Found by deleting the preference and watching every test still pass.
   */
  it('pulls a flexible cell onto the line the rest of the sheet already needs', () => {
    const pal = actPalette([
      { line: 0, entry: 1, rgb: BLACK },
      { line: 1, entry: 1, rgb: BLACK },
      { line: 1, entry: 2, rgb: GREEN }, // green exists ONLY in line 1
    ]);
    // Left cell: black only (lines 0 and 1 both work).
    // Right cell: black + green (line 1 only).
    const r = importPngAgainstPalette(
      png(16, 8, [BLACK, GREEN], (x) => (x < 8 ? 0 : (x < 12 ? 0 : 1))), pal,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Both cells on line 1 — not [0, 1], which is what taking the first viable
    // line per cell would produce.
    expect(r.result.usedLines).toEqual([1]);
  });
});
