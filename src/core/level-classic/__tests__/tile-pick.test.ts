import { describe, it, expect } from 'vitest';
import { isBlankTile, firstEditableNonBlankTile, firstNonBlankBlock } from '../tile-pick';
import type { BlockDef } from '../model';

/** A pool of `n` tiles; `filled` indices get a non-zero byte. */
function pool(n: number, filled: number[]): Uint8Array {
  const tiles = new Uint8Array(n * 32);
  for (const t of filled) tiles[t * 32 + 7] = 0xa5;
  return tiles;
}

describe('isBlankTile', () => {
  it('detects all-zero spans as blank and any non-zero byte as art', () => {
    const tiles = pool(3, [1]);
    expect(isBlankTile(tiles, 0)).toBe(true);
    expect(isBlankTile(tiles, 1)).toBe(false);
    expect(isBlankTile(tiles, 2)).toBe(true);
  });

  it('treats out-of-range indices as blank (never throws)', () => {
    expect(isBlankTile(pool(1, []), 5)).toBe(true);
    expect(isBlankTile(pool(1, []), -1)).toBe(true);
  });
});

describe('firstEditableNonBlankTile', () => {
  it('skips leading blank tiles (the stock $000 case)', () => {
    expect(firstEditableNonBlankTile(pool(8, [3, 5]), null)).toBe(3);
  });

  it('skips animated-art slots even when they hold art', () => {
    const range = { baseTileCount: 8, animRanges: [{ start: 2, count: 2 }] };
    // tiles 2,3 are anim slots with art; 4 is the first pickable one
    expect(firstEditableNonBlankTile(pool(8, [2, 3, 4]), range)).toBe(4);
  });

  it('never picks past baseTileCount (gap/appended tiles are view-only)', () => {
    const range = { baseTileCount: 4, animRanges: [] };
    expect(firstEditableNonBlankTile(pool(8, [6]), range)).toBe(0);
  });

  it('falls back to 0 when every tile is blank or locked', () => {
    expect(firstEditableNonBlankTile(pool(4, []), null)).toBe(0);
    expect(firstEditableNonBlankTile(new Uint8Array(0), null)).toBe(0);
  });
});

describe('firstNonBlankBlock', () => {
  const cell = (tile = 0, extra: Partial<BlockDef['cells'][number]> = {}) =>
    ({ tile, xf: false, yf: false, pal: 0, pri: false, ...extra });
  const blank = (): BlockDef => ({ cells: [cell(), cell(), cell(), cell()] });

  it('skips leading blank blocks (the stock $000 case)', () => {
    const blocks = [blank(), blank(), { cells: [cell(5), cell(), cell(), cell()] }];
    expect(firstNonBlankBlock(blocks)).toBe(2);
  });

  it('counts a flip/pal/pri-only cell as non-blank (it renders/behaves differently)', () => {
    expect(firstNonBlankBlock([blank(), { cells: [cell(0, { pal: 2 }), cell(), cell(), cell()] }])).toBe(1);
  });

  it('falls back to 0 when every block is blank (or the list is empty)', () => {
    expect(firstNonBlankBlock([blank(), blank()])).toBe(0);
    expect(firstNonBlankBlock([])).toBe(0);
  });
});
