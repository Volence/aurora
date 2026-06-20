import { describe, it, expect } from 'vitest';
import { blockTileWords, isEmptyBlock, findMatchingBlockCells } from '../../src/core/collision/collision-block';

// Build a tiny nametable: width W tiles. Helper sets a 2x2 block's 4 words.
function grid(w: number, h: number): Uint16Array { return new Uint16Array(w * h); }
function setBlock(nt: Uint16Array, w: number, cc: number, cr: number, words: [number, number, number, number]) {
  const tc = cc * 2, tr = cr * 2;
  nt[tr * w + tc] = words[0]; nt[tr * w + tc + 1] = words[1];
  nt[(tr + 1) * w + tc] = words[2]; nt[(tr + 1) * w + tc + 1] = words[3];
}

describe('blockTileWords / isEmptyBlock', () => {
  it('reads the 4 words of a 16px block', () => {
    const w = 8, nt = grid(w, 8);
    setBlock(nt, w, 1, 1, [10, 11, 12, 13]);
    expect(blockTileWords(nt, 1, 1, w)).toEqual([10, 11, 12, 13]);
  });
  it('isEmptyBlock true only when all four words are 0', () => {
    expect(isEmptyBlock([0, 0, 0, 0])).toBe(true);
    expect(isEmptyBlock([0, 0, 1, 0])).toBe(false);
  });
});

describe('findMatchingBlockCells', () => {
  it('returns every block cell with the same 4 words', () => {
    const w = 8, h = 8, nt = grid(w, h); // 4x4 block grid
    const shape: [number, number, number, number] = [5, 6, 7, 8];
    setBlock(nt, w, 0, 0, shape);
    setBlock(nt, w, 2, 1, shape);
    setBlock(nt, w, 3, 3, shape);
    setBlock(nt, w, 1, 1, [5, 6, 7, 9]); // one word differs — no match
    const cells = findMatchingBlockCells(nt, 0, 0, w, 4, 4);
    expect(cells.map((c) => `${c.cellCol},${c.cellRow}`).sort())
      .toEqual(['0,0', '2,1', '3,3'].sort());
  });
  it('an empty (all-zero) block matches only itself', () => {
    const w = 8, h = 8, nt = grid(w, h); // all zero
    const cells = findMatchingBlockCells(nt, 1, 1, w, 4, 4);
    expect(cells).toEqual([{ cellCol: 1, cellRow: 1 }]);
  });
});
