import { describe, it, expect } from 'vitest';
import { buildBlockSurface } from '../classic-surface-buffer';
import type { LevelDoc, BlockDef } from '../../level-classic/model';

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
