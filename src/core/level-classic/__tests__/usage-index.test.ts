import { describe, it, expect } from 'vitest';
import { buildUsageIndex } from '../usage-index';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell } from '../model';

// A LevelDoc whose shared-reference structure is hand-designed so every count is
// independently verifiable:
//   • blocks: 3. Block 0 uses tile 5 in all 4 cells; block 1 uses tiles 5,6,6,7;
//     block 2 uses tile 9 once and tile 0 thrice.
//     → tile 5 in blocks {0,1} (4+1 = 5 cells); tile 6 in block {1} (2 cells);
//       tile 7 in {1} (1); tile 9 in {2} (1); tile 0 in {2} (3).
//   • chunks: 2. chunk 0 stamps block 1 in cells 0 and 5, block 0 elsewhere;
//     chunk 1 stamps block 1 in cell 0 only.
//   • layout: fg places engine ids [1,2,1,0]; bg places [2,2,0,0]. With the loop
//     bit set on one fg cell (0x81) to prove masking.
function makeDoc(): LevelDoc {
  const blk = (tiles: number[]): BlockDef => ({
    cells: tiles.map((t) => ({ tile: t, xf: false, yf: false, pal: 0, pri: false })),
  });
  const cell = (block: number): ChunkCell => ({ block, xf: false, yf: false, solidity: 0 });
  const chunk = (blockAt: Map<number, number>, fill: number): ChunkDef256 => ({
    cells: Array.from({ length: 256 }, (_, i) => cell(blockAt.get(i) ?? fill)),
  });

  return {
    game: 's1',
    tiles: new Uint8Array(10 * 32),
    blocks: [blk([5, 5, 5, 5]), blk([5, 6, 6, 7]), blk([9, 0, 0, 0])],
    chunks: [
      // chunk 0: block 1 at cells 0 and 5, block 0 (fill) elsewhere.
      chunk(new Map([[0, 1], [5, 1]]), 0),
      // chunk 1: block 1 at cell 0, block 2 (fill) elsewhere.
      chunk(new Map([[0, 1]]), 2),
    ],
    fg: { width: 2, height: 2, cells: new Uint8Array([0x81, 2, 1, 0]) }, // 0x81 = id 1 + loop bit
    bg: { width: 2, height: 2, cells: new Uint8Array([2, 2, 0, 0]) },
    collision: { colind: new Uint8Array([0, 0, 0]), shapes: { heights: [new Int8Array(16)], angles: new Uint8Array(1) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [],
    objects: [],
    start: { x: 0, y: 0 },
    sourceRefs: {},
  };
}

describe('buildUsageIndex — tile → blocks', () => {
  const idx = buildUsageIndex(makeDoc());

  it('reverse lookup lists distinct blocks per tile (sorted)', () => {
    expect(idx.tileToBlocks.get(5)).toEqual([0, 1]);
    expect(idx.tileToBlocks.get(6)).toEqual([1]);
    expect(idx.tileToBlocks.get(7)).toEqual([1]);
    expect(idx.tileToBlocks.get(9)).toEqual([2]);
    expect(idx.tileToBlocks.get(0)).toEqual([2]);
  });

  it('tileUsage reports distinct containers + total cell references', () => {
    expect(idx.tileUsage(5)).toEqual({ containers: 2, cells: 5 }); // 4 in block0 + 1 in block1
    expect(idx.tileUsage(6)).toEqual({ containers: 1, cells: 2 });
    expect(idx.tileUsage(0)).toEqual({ containers: 1, cells: 3 });
    expect(idx.tileUsage(4)).toEqual({ containers: 0, cells: 0 }); // unused tile
  });
});

describe('buildUsageIndex — block → chunks', () => {
  const idx = buildUsageIndex(makeDoc());

  it('reverse lookup lists distinct chunk indices per block (sorted)', () => {
    // block 0 only appears as chunk 0's fill (254 cells).
    expect(idx.blockToChunks.get(0)).toEqual([0]);
    // block 1 appears in both chunks.
    expect(idx.blockToChunks.get(1)).toEqual([0, 1]);
    // block 2 is chunk 1's fill only.
    expect(idx.blockToChunks.get(2)).toEqual([1]);
  });

  it('blockUsage reports distinct chunks + total chunk-cell references', () => {
    expect(idx.blockUsage(1)).toEqual({ containers: 2, cells: 3 }); // 2 in chunk0 + 1 in chunk1
    expect(idx.blockUsage(0)).toEqual({ containers: 1, cells: 254 }); // chunk0 fill minus 2 cells
    expect(idx.blockUsage(2)).toEqual({ containers: 1, cells: 255 }); // chunk1 fill minus 1 cell
  });
});

describe('buildUsageIndex — chunk placements', () => {
  const idx = buildUsageIndex(makeDoc());

  it('counts layout placements across fg + bg, masking the loop bit', () => {
    // fg: 0x81(=id1) , 2 , 1 , 0(air)  → id1 twice, id2 once
    // bg: 2 , 2 , 0 , 0                → id2 twice
    expect(idx.chunkPlacementCount(1)).toBe(2);
    expect(idx.chunkPlacementCount(2)).toBe(3);
    // The loop-flagged byte 0x81 is counted as engine id 1 (not a separate key).
    expect(idx.chunkPlacements.get(0x81)).toBeUndefined();
  });

  it('air (id 0) has no placements', () => {
    expect(idx.chunkPlacementCount(0)).toBe(0);
    expect(idx.chunkPlacements.get(0)).toBeUndefined();
  });

  it('an unplaced chunk id reports 0', () => {
    expect(idx.chunkPlacementCount(7)).toBe(0);
  });
});

describe('Usage object identity (React.memo contract)', () => {
  const idx = buildUsageIndex(makeDoc());

  // These Usage objects are passed straight into React.memo'd thumbnails as a
  // prop. Returning a fresh object per call made the prop reference-unequal on
  // every render, so the memo never held and ~800 tile thumbnails re-rendered on
  // any unrelated store change. Identity must be stable for a given index.
  it('returns the SAME object across repeated calls for a used tile', () => {
    expect(idx.tileUsage(5)).toBe(idx.tileUsage(5));
    expect(idx.tileUsage(6)).toBe(idx.tileUsage(6));
  });

  it('returns the SAME object across repeated calls for an unused tile', () => {
    expect(idx.tileUsage(4)).toBe(idx.tileUsage(4));
  });

  it('returns the SAME object across repeated calls for blocks', () => {
    expect(idx.blockUsage(0)).toBe(idx.blockUsage(0));
    expect(idx.blockUsage(1)).toBe(idx.blockUsage(1));
  });

  it('still distinguishes different indices by value', () => {
    expect(idx.tileUsage(5)).not.toBe(idx.tileUsage(6));
    expect(idx.tileUsage(5)).not.toEqual(idx.tileUsage(6));
  });
});
