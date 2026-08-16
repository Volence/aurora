import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { canvasIndex } from '../canvas-doc';
import { countUniqueTiles } from '../canvas-constraints';
import { resolveCanvasRegion, mirrorBlock } from '../canvas-resolve';
import type { ResolvedBlock } from '../canvas-resolve';

const CHUNK = 256;

/** A canvas `w x h` chunks in size, painted by `fn(x, y)` in canvas index space. */
function canvas(wChunks: number, hChunks: number, fn: (x: number, y: number) => number) {
  const b = createBuffer(wChunks * CHUNK, hChunks * CHUNK);
  for (let y = 0; y < b.height; y++) {
    for (let x = 0; x < b.width; x++) b.data[y * b.width + x] = fn(x, y);
  }
  return b;
}

const whole = (wChunks = 1, hChunks = 1) => ({ x: 0, y: 0, chunksWide: wChunks, chunksHigh: hChunks });

describe('resolveCanvasRegion — shape', () => {
  it('yields one chunk of 256 cells per 256x256 region cell', () => {
    const r = resolveCanvasRegion(canvas(1, 1, () => 0), whole());
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0].cells).toHaveLength(256);
    expect(r.blocks[0].cells).toHaveLength(4);
  });

  it('walks a multi-chunk region row-major', () => {
    // Left chunk all transparent, right chunk lit — so they must differ.
    const px = canvas(2, 1, (x) => (x < CHUNK ? 0 : canvasIndex(0, 1)));
    const r = resolveCanvasRegion(px, whole(2, 1));
    expect(r.chunks).toHaveLength(2);
    const leftBlank = r.chunks[0].cells.every((c) => r.blocks[c.blockHandle].blank);
    const rightBlank = r.chunks[1].cells.every((c) => r.blocks[c.blockHandle].blank);
    expect(leftBlank).toBe(true);
    expect(rightBlank).toBe(false);
  });
});

describe('resolveCanvasRegion — tile interning', () => {
  it('interns two identical cells as one tile', () => {
    // Every 8x8 cell painted the same way -> exactly one tile.
    const px = canvas(1, 1, (x, y) => canvasIndex(0, ((x % 8) + (y % 8)) % 15 + 1));
    const r = resolveCanvasRegion(px, whole());
    expect(r.tiles).toHaveLength(1);
  });

  it('interns an x-mirrored pair as one tile with differing cell flips', () => {
    // Left half of each 16px block is a wedge; right half is its mirror.
    const px = canvas(1, 1, (x, y) => {
      const inBlock = x % 16;
      const cx = inBlock < 8 ? inBlock : 15 - inBlock; // mirrored across the block
      return canvasIndex(0, cx === 0 && y % 8 === 0 ? 1 : 0);
    });
    const r = resolveCanvasRegion(px, whole());
    expect(r.tiles).toHaveLength(1);
    // Within a block, cell 0 (TL) and cell 1 (TR) are mirrors of each other.
    const b = r.blocks.find((blk) => !blk.blank)!;
    expect(b.cells[0].xf).not.toBe(b.cells[1].xf);
  });

  it('marks an all-transparent cell blank', () => {
    const r = resolveCanvasRegion(canvas(1, 1, () => 0), whole());
    expect(r.tiles).toHaveLength(1);
    expect(r.tiles[0].blank).toBe(true);
    expect(r.blocks[0].blank).toBe(true);
  });

  it('reads palLine from the cell, and gives a transparent cell line 0', () => {
    // Top half of the canvas drawn in line 2, bottom half transparent.
    const px = canvas(1, 1, (_x, y) => (y < 128 ? canvasIndex(2, 5) : 0));
    const r = resolveCanvasRegion(px, whole());
    const lines = new Set(r.blocks.flatMap((b) => b.cells.map((c) => c.palLine)));
    expect(lines).toEqual(new Set([2, 0]));
  });

  it('never exceeds the flip-aware unique count the 2B readout promises', () => {
    const px = canvas(1, 1, (x, y) => canvasIndex(0, ((x * 3 + y * 5) % 15) + 1));
    const r = resolveCanvasRegion(px, whole());
    const readout = countUniqueTiles(px, { originX: 0, originY: 0 });
    expect(r.tiles.length).toBeLessThanOrEqual(readout.unique);
  });
});

describe('resolveCanvasRegion — block dedup', () => {
  it('interns identical blocks once', () => {
    const px = canvas(1, 1, (x, y) => canvasIndex(0, ((x % 16) + (y % 16)) % 15 + 1));
    const r = resolveCanvasRegion(px, whole());
    expect(r.blocks).toHaveLength(1);
  });

  it('treats blocks differing only in palette line as two blocks', () => {
    // Same shape everywhere, but the left half of the canvas uses line 1.
    const shape = (x: number, y: number) => (((x % 16) + (y % 16)) % 15) + 1;
    const twoLines = canvas(1, 1, (x, y) => canvasIndex(x < 128 ? 1 : 3, shape(x, y)));
    const oneLine = canvas(1, 1, (x, y) => canvasIndex(1, shape(x, y)));
    const r = resolveCanvasRegion(twoLines, whole());
    expect(r.blocks).toHaveLength(2);
    // The SAME tiles serve both lines — the line lives in the block cell, not in
    // the tile — so drawing in two lines costs no extra tiles at all.
    expect(r.tiles).toHaveLength(resolveCanvasRegion(oneLine, whole()).tiles.length);
  });
});

describe('mirrorBlock', () => {
  const b: ResolvedBlock = {
    blank: false,
    cells: [
      { tileHandle: 1, xf: false, yf: false, palLine: 2 },
      { tileHandle: 2, xf: true, yf: false, palLine: 2 },
      { tileHandle: 3, xf: false, yf: true, palLine: 2 },
      { tileHandle: 4, xf: true, yf: true, palLine: 2 },
    ],
  };

  it('is the identity with no flips', () => {
    expect(mirrorBlock(b, false, false)).toEqual(b);
  });

  it('x-mirroring swaps columns and toggles xf', () => {
    const m = mirrorBlock(b, true, false);
    expect(m.cells[0].tileHandle).toBe(2);
    expect(m.cells[1].tileHandle).toBe(1);
    expect(m.cells[2].tileHandle).toBe(4);
    expect(m.cells[3].tileHandle).toBe(3);
    expect(m.cells[0].xf).toBe(false); // cell 1 had xf true; mirrored -> false
    expect(m.cells[1].xf).toBe(true);
  });

  it('y-mirroring swaps rows and toggles yf', () => {
    const m = mirrorBlock(b, false, true);
    expect(m.cells[0].tileHandle).toBe(3);
    expect(m.cells[2].tileHandle).toBe(1);
    expect(m.cells[0].yf).toBe(false); // cell 2 had yf true; mirrored -> false
    expect(m.cells[2].yf).toBe(true);
  });

  it('is an involution — the property the planner relies on', () => {
    expect(mirrorBlock(mirrorBlock(b, true, true), true, true)).toEqual(b);
  });

  it('carries palLine unchanged — a mirror moves cells, it does not recolour them', () => {
    const m = mirrorBlock(b, true, true);
    expect(m.cells.map((c) => c.palLine)).toEqual([2, 2, 2, 2]);
  });
});
