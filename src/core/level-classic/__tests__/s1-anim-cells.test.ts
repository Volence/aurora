// The play toggle's cell side: which chunk cells are animated, and how one
// placement's pixels compose under the CHUNK-cell flip (audit §3.3 flip trap —
// a chunk cell's xf/yf mirrors the WHOLE block: the 2x2 tile arrangement AND
// each tile's pixels, exactly as renderChunk's blitRgba does).
//
// Flip expectations are HAND-DERIVED: the fixture block carries one marker
// pixel at block-local (0,0) (tile 1's top-left, color 1). A whole-block
// mirror maps (x,y) → (15-x, y) under xf and (x, 15-y) under yf, so:
//   plain → (0,0)     xf → (15,0)     yf → (0,15)     xf+yf → (15,15)
// …and, as the twin proof, every flip state must be BYTE-IDENTICAL to the
// 16x16 region renderChunk composes for the same placement — the overlay may
// never disagree with the base render it draws over.

import { describe, it, expect } from 'vitest';
import type { BlockCell, ChunkCell, LevelDoc } from '../model';
import { renderBlockPlacement, renderChunk } from '../render';
import { animatedCellsForChunk } from '../s1-anim-art';

const cell = (tile: number, over: Partial<BlockCell> = {}): BlockCell => ({
  tile, xf: false, yf: false, pal: 0, pri: false, ...over,
});
const ccell = (block: number, over: Partial<ChunkCell> = {}): ChunkCell => ({
  block, xf: false, yf: false, solidity: 0, ...over,
});

/** Pool: tile 0 blank; tile 1 has ONE pixel (0,0) = color 1. */
function makeTiles(): Uint8Array {
  const tiles = new Uint8Array(2 * 32);
  tiles[32] = 0x10; // tile 1, row 0, first byte: pixels (0,1) = colors (1,0)
  return tiles;
}

function makeDoc(chunkCells: ChunkCell[]): LevelDoc {
  const blank = Array.from({ length: 256 - chunkCells.length }, () => ccell(0));
  return {
    game: 's1',
    tiles: makeTiles(),
    blocks: [
      { cells: [cell(0), cell(0), cell(0), cell(0)] }, // block 0: static
      { cells: [cell(1), cell(0), cell(0), cell(0)] }, // block 1: marker at TL
    ],
    chunks: [{ cells: [...chunkCells, ...blank] }],
    fg: { width: 1, height: 1, cells: new Uint8Array([1]) },
    bg: { width: 1, height: 1, cells: new Uint8Array(1) },
    collision: { colind: new Uint8Array(4), shapes: { heights: [], angles: new Uint8Array() } },
    palettes: [new Uint16Array(16).fill(0x0eee)],
    paletteSources: [] as unknown as LevelDoc['paletteSources'],
    objects: [],
    start: { x: 0, y: 0 },
    sourceRefs: {},
  };
}

const alphaAt = (buf: Uint8ClampedArray, x: number, y: number, w = 16) => buf[(y * w + x) * 4 + 3];

describe('renderBlockPlacement composes the chunk-cell flip like renderChunk', () => {
  const doc = makeDoc([ccell(1)]);

  it.each([
    [false, false, 0, 0],
    [true, false, 15, 0],
    [false, true, 0, 15],
    [true, true, 15, 15],
  ])('xf=%s yf=%s puts the marker pixel at (%i,%i)', (xf, yf, mx, my) => {
    const buf = renderBlockPlacement(doc, 1, xf as boolean, yf as boolean);
    expect(buf.length).toBe(16 * 16 * 4);
    expect(alphaAt(buf, mx, my)).toBeGreaterThan(0);
    // Exactly one opaque pixel — the marker did not smear or duplicate.
    let opaque = 0;
    for (let i = 3; i < buf.length; i += 4) if (buf[i] > 0) opaque++;
    expect(opaque).toBe(1);
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('is byte-identical to the renderChunk region for xf=%s yf=%s (twin proof)', (xf, yf) => {
    // Place the flipped block at chunk cell 0 and compare the composed 16x16.
    const d = makeDoc([ccell(1, { xf: xf as boolean, yf: yf as boolean })]);
    const whole = renderChunk(d, 1);
    const placement = renderBlockPlacement(d, 1, xf as boolean, yf as boolean);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const w = (y * 256 + x) * 4;
        const p = (y * 16 + x) * 4;
        expect(whole.slice(w, w + 4), `(${x},${y})`).toEqual(placement.slice(p, p + 4));
      }
    }
  });
});

describe('animatedCellsForChunk', () => {
  it('lists exactly the cells whose block touches an animated tile, with their flips', () => {
    const doc = makeDoc([
      ccell(1), // animated (block 1 uses tile 1)
      ccell(0), // static
      ccell(1, { xf: true }), // animated, flipped placement
    ]);
    const cells = animatedCellsForChunk(doc, 1, new Set([1]));
    expect(cells).toEqual([
      { cell: 0, block: 1, xf: false, yf: false },
      { cell: 2, block: 1, xf: true, yf: false },
    ]);
  });

  it('returns [] for air, out-of-range ids, and non-animated tile sets', () => {
    const doc = makeDoc([ccell(1)]);
    expect(animatedCellsForChunk(doc, 0, new Set([1]))).toEqual([]);
    expect(animatedCellsForChunk(doc, 99, new Set([1]))).toEqual([]);
    expect(animatedCellsForChunk(doc, 1, new Set([0x378]))).toEqual([]);
  });

  it('tolerates out-of-range block refs (renderer never throws mid-edit)', () => {
    const doc = makeDoc([ccell(200), ccell(1)]);
    expect(animatedCellsForChunk(doc, 1, new Set([1]))).toEqual([
      { cell: 1, block: 1, xf: false, yf: false },
    ]);
  });
});
