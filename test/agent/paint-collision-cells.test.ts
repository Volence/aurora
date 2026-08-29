import { describe, it, expect } from 'vitest';
import { paintCollisionCellEntries, paintCollisionRectEntries } from '../../src/core/collision/collision-paint';
import { validateCollisionWrite } from '../../src/core/agent/validation';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import {
  COLLISION_CELL_UNOWNED_MASK, unownedCollisionBits,
} from '../../src/core/editing/collision-word';
import { readCollisionRegion } from '../../src/core/collision/collision-region-read';

// The per-cell write half of paint_collision, and the round trip it makes
// possible. See docs/reviews/2026-08-29-collision-read.md §2.
//
// ⚠ ANTI-VACUOUS: every preservation row below AUTHORS a destination with
// non-zero bits outside COLLISION_CELL_OWNED_MASK. On real content those bits
// are zero everywhere, so `0` preserved and `0` truncated are the same sixteen
// bits and a row over real data can only land heads.

const width = 8; // 8 tiles wide = 4x4 cells
const solid = (shape: number) => packCollisionCell({ shape, xFlip: false, yFlip: false, solidity: 'all' });

function fresh(): Uint16Array { return new Uint16Array(width * width); }
function setCell(plane: Uint16Array, cc: number, cr: number, word: number): void {
  for (const i of cellTileIndices(cc, cr, width)) plane[i] = word;
}
function apply(plane: Uint16Array, entries: { index: number; newColl: number }[]): void {
  for (const e of entries) plane[e.index] = e.newColl;
}

describe('validateCollisionWrite', () => {
  it('refuses both forms at once, naming both', () => {
    const err = validateCollisionWrite(5, [1, 2, 3, 4], 2, 2);
    expect(err).toMatch(/not both/);
  });

  it('refuses neither form', () => {
    expect(validateCollisionWrite(undefined, undefined, 1, 1)).toMatch(/neither/);
  });

  it('accepts exactly one of each form', () => {
    expect(validateCollisionWrite(0x1005, undefined, 3, 3)).toBeNull();
    expect(validateCollisionWrite(undefined, [1, 2, 3, 4], 2, 2)).toBeNull();
  });

  it('refuses a words array whose length is not w*h, and says both numbers', () => {
    const err = validateCollisionWrite(undefined, [1, 2, 3], 2, 2)!;
    expect(err).toContain('3');
    expect(err).toContain('4');
  });

  it('accepts null inside words (leave this cell alone) but not other junk', () => {
    expect(validateCollisionWrite(undefined, [1, null, 2, null], 2, 2)).toBeNull();
    expect(validateCollisionWrite(undefined, [1, 2, 3, 'x'], 2, 2)).toMatch(/words\[3\]/);
    expect(validateCollisionWrite(undefined, [1, 2, 3, 0x10000], 2, 2)).toMatch(/words\[3\]/);
    expect(validateCollisionWrite(undefined, [1, 2, 3, 1.5], 2, 2)).toMatch(/words\[3\]/);
  });

  it('still range-checks the fill word', () => {
    expect(validateCollisionWrite(0x10000, undefined, 1, 1)).toMatch(/word must be/);
    expect(validateCollisionWrite(-1, undefined, 1, 1)).toMatch(/word must be/);
  });
});

describe('paintCollisionCellEntries', () => {
  it('writes a DIFFERENT word per cell, all four sub-tiles each', () => {
    // The whole reason the entries form exists: the fill form cannot express
    // this, and a loop is never uniform.
    const plane = fresh();
    const { entries, skipped } = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 1, words: [solid(1), solid(2)], plane, tileWidth: width,
    });
    expect(skipped).toBe(0);
    expect(entries).toHaveLength(8);
    apply(plane, entries);
    expect(cellTileIndices(0, 0, width).map((i) => plane[i])).toEqual([solid(1), solid(1), solid(1), solid(1)]);
    expect(cellTileIndices(1, 0, width).map((i) => plane[i])).toEqual([solid(2), solid(2), solid(2), solid(2)]);
  });

  it('null skips a cell entirely and is COUNTED, not silently dropped', () => {
    const plane = fresh();
    setCell(plane, 1, 0, solid(9));
    const { entries, skipped } = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 1, words: [solid(1), null], plane, tileWidth: width,
    });
    expect(skipped).toBe(1);
    apply(plane, entries);
    expect(plane[cellTileIndices(1, 0, width)[0]]).toBe(solid(9)); // untouched
  });

  it('KEEPS the destination cell\'s unowned bits (it is a DECIDER)', () => {
    // Authored, not found: real content is all zeros up there.
    const dest = (solid(3) | COLLISION_CELL_UNOWNED_MASK) & 0xFFFF;
    expect(unownedCollisionBits(dest)).not.toBe(0); // the fixture is real
    const plane = fresh();
    setCell(plane, 0, 0, dest);
    const { entries } = paintCollisionCellEntries({
      x: 0, y: 0, w: 1, h: 1, words: [solid(7)], plane, tileWidth: width,
    });
    apply(plane, entries);
    const got = plane[cellTileIndices(0, 0, width)[0]];
    expect(unownedCollisionBits(got)).toBe(unownedCollisionBits(dest));
    expect(got & ~COLLISION_CELL_UNOWNED_MASK & 0xFFFF).toBe(solid(7));
  });

  it('cannot smuggle unowned bits IN through a source word', () => {
    // The other half of the decider rule, and the half that makes the round
    // trip's boundary honest: a word carrying spare bits does not get to write
    // them into a clean destination.
    const plane = fresh(); // destination is all zeros
    const smuggler = (solid(4) | COLLISION_CELL_UNOWNED_MASK) & 0xFFFF;
    const { entries } = paintCollisionCellEntries({
      x: 0, y: 0, w: 1, h: 1, words: [smuggler], plane, tileWidth: width,
    });
    apply(plane, entries);
    expect(unownedCollisionBits(plane[cellTileIndices(0, 0, width)[0]])).toBe(0);
  });

  it('classifies the same as the fill form it sits beside', () => {
    // Two forms of one tool must not be two rules. Same destination, same
    // authored word, both forms — the resulting cell must be identical.
    const dest = (solid(3) | COLLISION_CELL_UNOWNED_MASK) & 0xFFFF;
    const a = fresh(); setCell(a, 0, 0, dest);
    const b = fresh(); setCell(b, 0, 0, dest);
    apply(a, paintCollisionRectEntries({ x: 0, y: 0, w: 1, h: 1, word: solid(7), plane: a, tileWidth: width }));
    apply(b, paintCollisionCellEntries({ x: 0, y: 0, w: 1, h: 1, words: [solid(7)], plane: b, tileWidth: width }).entries);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('emits nothing for cells already holding the merged word', () => {
    const plane = fresh();
    setCell(plane, 0, 0, solid(5));
    const { entries } = paintCollisionCellEntries({
      x: 0, y: 0, w: 1, h: 1, words: [solid(5)], plane, tileWidth: width,
    });
    expect(entries).toHaveLength(0);
  });
});

describe('the round trip: get_collision_region -> paint_collision', () => {
  /** A non-uniform region — the case the fill form provably cannot express. */
  function loopish(): Uint16Array {
    const plane = fresh();
    setCell(plane, 0, 0, solid(11));
    setCell(plane, 1, 0, 0);
    setCell(plane, 0, 1, solid(22));
    setCell(plane, 1, 1, solid(33));
    return plane;
  }

  it('the read\'s words, fed back UNCHANGED, restore the region exactly', () => {
    const source = loopish();
    const read = readCollisionRegion({
      plane: 'a', planeWords: source, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    // A DIFFERENT plane, scribbled over first, so "restored" cannot mean
    // "was already like that".
    const dest = fresh();
    for (let i = 0; i < dest.length; i++) dest[i] = solid(99);
    const { entries, skipped } = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 2, words: read.words, plane: dest, tileWidth: width,
    });
    expect(skipped).toBe(0);
    apply(dest, entries);
    const back = readCollisionRegion({
      plane: 'a', planeWords: dest, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(back.words).toEqual(read.words);
  });

  it('a region the FILL form cannot express is exactly what this fixes', () => {
    // The premise of the whole parcel, asserted rather than asserted-about: no
    // single `word` reproduces this region.
    const source = loopish();
    const read = readCollisionRegion({
      plane: 'a', planeWords: source, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(new Set(read.words).size).toBeGreaterThan(1);
  });

  it('a MIXED cell round-trips as a skip, never as a guess', () => {
    const source = loopish();
    // Author the disagreement the way a per-8px-tile producer would.
    const four = cellTileIndices(1, 1, width);
    source[four[3]] = solid(44);
    const read = readCollisionRegion({
      plane: 'a', planeWords: source, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(read.mixedCells).toBe(1);
    const dest = fresh();
    const untouched = solid(77);
    setCell(dest, 1, 1, untouched);
    const { entries, skipped } = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 2, words: read.words, plane: dest, tileWidth: width,
    });
    expect(skipped).toBe(1);
    apply(dest, entries);
    // The destination cell is EXACTLY as it was — not half-written from one of
    // the four sub-tiles.
    expect(cellTileIndices(1, 1, width).map((i) => dest[i]))
      .toEqual([untouched, untouched, untouched, untouched]);
  });
});
