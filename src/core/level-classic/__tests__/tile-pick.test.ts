import { describe, it, expect } from 'vitest';
import {
  isBlankTile, firstEditableNonBlankTile, firstNonBlankBlock, firstEditableChunkId,
  landingPaletteLine,
} from '../tile-pick';
import type { BlockDef, ChunkDef256 } from '../model';

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
  // Tile 0 blank, tiles 5 and 9 have art — the stock shape.
  const TILES = pool(16, [5, 9]);

  it('skips leading blank blocks (the stock $000 case)', () => {
    const blocks = [blank(), blank(), { cells: [cell(5), cell(), cell(), cell()] }];
    expect(firstNonBlankBlock(blocks, TILES)).toBe(2);
  });

  it('does NOT count a flip/pal/pri-only cell: none of those draws a pixel', () => {
    // THE BUG. S1 Green Hill's block $000 has cells on palette line 2 pointing
    // at the blank tile $000, so the old "non-default cell" rule landed the
    // Block tier on four black quadrants — with no message any source guard
    // could have caught.
    const decorated = { cells: [cell(0, { pal: 2, xf: true, pri: true }), cell(), cell(), cell()] };
    expect(firstNonBlankBlock([decorated, { cells: [cell(9), cell(), cell(), cell()] }], TILES)).toBe(1);
  });

  it('is decided by the TILE POOL, not the cell record', () => {
    // The same block is blank or not depending on whether tile 5 has pixels —
    // which is the whole reason this takes the pool.
    const blocks = [{ cells: [cell(5), cell(), cell(), cell()] }];
    expect(firstNonBlankBlock(blocks, pool(16, [5]))).toBe(0);
    expect(firstNonBlankBlock(blocks, pool(16, []))).toBe(0); // fallback, all blank
    expect(firstNonBlankBlock([blank(), blocks[0]], pool(16, []))).toBe(0);
    expect(firstNonBlankBlock([blank(), blocks[0]], pool(16, [5]))).toBe(1);
  });

  it('falls back to 0 when every block is blank (or the list is empty)', () => {
    expect(firstNonBlankBlock([blank(), blank()], TILES)).toBe(0);
    expect(firstNonBlankBlock([], TILES)).toBe(0);
  });
});

describe('landingPaletteLine', () => {
  const cell = (tile = 0, extra: Partial<BlockDef['cells'][number]> = {}) =>
    ({ tile, xf: false, yf: false, pal: 0, pri: false, ...extra });
  const TILES = pool(16, [5, 9]);

  it('answers the line the Block tier will be drawing its tile strip under', () => {
    // THE BUG this seeds away: the Block tier shows the strip under the landing
    // block's TL cell (line 2 here) while the Tile tier showed it under the IDLE
    // `composerPalLine` of 0 — one tab click, two palettes, same 965 tiles.
    const blocks = [
      { cells: [cell(0, { pal: 3 }), cell(), cell(), cell()] },      // blank, skipped
      { cells: [cell(5, { pal: 2 }), cell(9, { pal: 1 }), cell(), cell()] },
    ];
    const landed = firstNonBlankBlock(blocks, TILES);
    expect(landed).toBe(1);
    expect(landingPaletteLine(blocks, landed)).toBe(2);
  });

  it('reads the TOP-LEFT cell, which is the one BlockTab starts selected on', () => {
    // Not the cell that made the block non-blank: BlockTab's `selCell` starts at
    // 0, so cell 0 is what the strip is actually keyed on at rest.
    const blocks = [{ cells: [cell(0, { pal: 0 }), cell(5, { pal: 3 }), cell(), cell()] }];
    expect(landingPaletteLine(blocks, 0)).toBe(0);
  });

  it('falls back to 0 for an empty or out-of-range block list', () => {
    expect(landingPaletteLine([], 0)).toBe(0);
    expect(landingPaletteLine([{ cells: [cell(0, { pal: 2 }), cell(), cell(), cell()] }], 7)).toBe(0);
  });
});

describe('firstEditableChunkId', () => {
  const cell = (block = 0, extra: Partial<ChunkDef256['cells'][number]> = {}) =>
    ({ block, xf: false, yf: false, solidity: 0, ...extra });
  const chunk = (...cells: ChunkDef256['cells']): ChunkDef256 => ({
    cells: [...cells, ...Array.from({ length: 256 - cells.length }, () => cell())],
  });
  const blank = (): ChunkDef256 => chunk();

  it('returns an ENGINE ID, not an index: chunks[0] is $01', () => {
    expect(firstEditableChunkId([chunk(cell(4))])).toBe(1);
  });

  it('skips leading blank chunks', () => {
    expect(firstEditableChunkId([blank(), blank(), chunk(cell(9))])).toBe(3);
  });

  it('counts a flip/solidity-only cell as non-blank (it behaves differently)', () => {
    expect(firstEditableChunkId([blank(), chunk(cell(0, { solidity: 1 }))])).toBe(2);
    expect(firstEditableChunkId([blank(), chunk(cell(0, { xf: true }))])).toBe(2);
  });

  it('falls back to the first REAL chunk when every chunk is blank: never to air', () => {
    // Air is the one id the Chunk tab cannot edit, so an all-blank pool still
    // lands on something editable. Blank chunks are legitimate data.
    expect(firstEditableChunkId([blank(), blank()])).toBe(1);
  });

  it('answers air only when there is no chunk at all', () => {
    expect(firstEditableChunkId([])).toBe(0);
  });
});
