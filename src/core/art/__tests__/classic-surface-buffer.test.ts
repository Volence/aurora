import { describe, it, expect } from 'vitest';
import { buildBlockSurface, buildChunkSurface } from '../classic-surface-buffer';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell } from '../../level-classic/model';

/** Minimal doc: tile N is filled entirely with palette value N. */
export function makeDoc(blocks: BlockDef[], tileCount = 8): LevelDoc {
  const tiles = new Uint8Array(tileCount * 32);
  for (let t = 1; t < tileCount; t++) {
    // 4bpp: both nibbles = t, so every pixel of tile t reads back as t.
    tiles.fill((t << 4) | t, t * 32, t * 32 + 32);
  }
  return {
    game: 's1', tiles, blocks, chunks: [],
    fg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    bg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    collision: { colind: new Uint8Array(blocks.length), shapes: { heights: [], angles: new Uint8Array(0) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [], objects: [], start: { x: 0, y: 0 }, sourceRefs: {},
  };
}

const cell = (tile: number, xf = false, yf = false, pal = 0) => ({ tile, xf, yf, pal, pri: false });

describe('buildBlockSurface', () => {
  it('is 16x16 with 2x2 cells laid out TL, TR, BL, BR', () => {
    const doc = makeDoc([{ cells: [cell(1), cell(2), cell(3), cell(4)] }]);
    const { buffer, provenance } = buildBlockSurface(doc, 0);

    expect(buffer.width).toBe(16);
    expect(buffer.height).toBe(16);
    expect(provenance.cellsX).toBe(2);
    expect(provenance.cellsY).toBe(2);

    // One pixel from each quadrant proves the layout order.
    expect(buffer.data[0 * 16 + 0]).toBe(1);   // TL
    expect(buffer.data[0 * 16 + 8]).toBe(2);   // TR
    expect(buffer.data[8 * 16 + 0]).toBe(3);   // BL
    expect(buffer.data[8 * 16 + 8]).toBe(4);   // BR
  });

  it('records provenance per cell, with no chunk cell', () => {
    const doc = makeDoc([{ cells: [cell(1), cell(2, true), cell(3), cell(4)] }]);
    const { provenance } = buildBlockSurface(doc, 0);

    expect(provenance.cells[1]).toEqual({
      chunkCellIndex: null, blockId: 0, blockCellIndex: 1,
      tileIndex: 2, xf: true, yf: false, pal: 0,
    });
  });
});

describe('buildBlockSurface — the blit places pixels within a cell correctly', () => {
  /** A doc whose tile 1 is blank except for value 5 at local (1,0). */
  function docWithMarker(xf: boolean, yf: boolean): LevelDoc {
    const d = makeDoc([{ cells: [cell(1, xf, yf), cell(0), cell(0), cell(0)] }]);
    d.tiles.fill(0, 32, 64);   // clear tile 1
    d.tiles[32] = 0x05;        // byte 0: pixel (0,0) = 0, pixel (1,0) = 5
    return d;
  }

  it('unflipped, the marker stays at (1,0) — and NOT at (0,1)', () => {
    const { buffer } = buildBlockSurface(docWithMarker(false, false), 0);
    expect(buffer.data[0 * 16 + 1]).toBe(5);
    expect(buffer.data[1 * 16 + 0]).toBe(0);   // transposition guard
  });

  it('xf mirrors it across the cell to (6,0)', () => {
    const { buffer } = buildBlockSurface(docWithMarker(true, false), 0);
    expect(buffer.data[0 * 16 + 6]).toBe(5);
    expect(buffer.data[0 * 16 + 1]).toBe(0);
  });

  it('yf mirrors it down the cell to (1,7)', () => {
    const { buffer } = buildBlockSurface(docWithMarker(false, true), 0);
    expect(buffer.data[7 * 16 + 1]).toBe(5);
    expect(buffer.data[0 * 16 + 1]).toBe(0);
  });
});

const chunkCell = (block: number, xf = false, yf = false): ChunkCell =>
  ({ block, xf, yf, solidity: 0 });

/** A chunk whose cell 0 is `first`, every other cell block 0. */
function chunkWith(first: ChunkCell): ChunkDef256 {
  return { cells: Array.from({ length: 256 }, (_, i) => (i === 0 ? first : chunkCell(0))) };
}

describe('buildChunkSurface — flip composition', () => {
  // Block 0's four cells are tiles 1,2,3,4 (TL,TR,BL,BR), all unflipped.
  const doc = () => makeDoc([{ cells: [cell(1), cell(2), cell(3), cell(4)] }]);

  it('is 256x256 with 32x32 cells', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0))];
    const { buffer, provenance } = buildChunkSurface(d, 0);
    expect(buffer.width).toBe(256);
    expect(buffer.height).toBe(256);
    expect(provenance.cellsX).toBe(32);
    expect(provenance.cellsY).toBe(32);
  });

  it('unflipped: block cells appear in TL,TR,BL,BR order', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(1);              // surface cell (0,0)
    expect(provenance.cells[1].tileIndex).toBe(2);              // (1,0)
    expect(provenance.cells[32].tileIndex).toBe(3);             // (0,1)
    expect(provenance.cells[33].tileIndex).toBe(4);             // (1,1)
  });

  it('chunk xflip SWAPS the left/right sub-tiles AND mirrors each tile', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0, true, false))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(2);
    expect(provenance.cells[1].tileIndex).toBe(1);
    expect(provenance.cells[0].xf).toBe(true);
    expect(provenance.cells[0].yf).toBe(false);
  });

  it('chunk yflip swaps top/bottom and mirrors vertically', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0, false, true))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(3);
    expect(provenance.cells[32].tileIndex).toBe(1);
    expect(provenance.cells[0].yf).toBe(true);
    expect(provenance.cells[0].xf).toBe(false);
  });

  it('BOTH flips compose — the diagonal case', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0, true, true))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(4);   // BR ends up at TL
    expect(provenance.cells[33].tileIndex).toBe(1);  // TL ends up at BR
    expect(provenance.cells[0].xf).toBe(true);
    expect(provenance.cells[0].yf).toBe(true);
  });

  it('a chunk flip XORs with the block cell\'s own flip rather than replacing it', () => {
    // Block cell TL is ALREADY xflipped; the chunk flips too -> they cancel.
    const d = makeDoc([{ cells: [cell(1, true), cell(2), cell(3), cell(4)] }]);
    d.chunks = [chunkWith(chunkCell(0, true, false))];
    const { provenance } = buildChunkSurface(d, 0);
    // TL of the flipped block is the old TR (tile 2, unflipped) -> xf true.
    expect(provenance.cells[0].tileIndex).toBe(2);
    expect(provenance.cells[0].xf).toBe(true);
    // The old TL (tile 1, xf true) lands right, and its flip CANCELS.
    expect(provenance.cells[1].tileIndex).toBe(1);
    expect(provenance.cells[1].xf).toBe(false);
  });
});
