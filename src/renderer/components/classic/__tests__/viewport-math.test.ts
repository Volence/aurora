import { describe, it, expect } from 'vitest';
import {
  CHUNK_PX,
  visibleChunkRange,
  layoutCellAt,
  ringGroupPositions,
} from '../viewport-math';
import type { LayoutGrid } from '../../../../core/level-classic/model';

// ---------------------------------------------------------------------------
// visibleChunkRange — which 256px chunk cells intersect the camera rect.
// ---------------------------------------------------------------------------
describe('visibleChunkRange', () => {
  it('covers the whole grid when the viewport is larger than it', () => {
    // 4x3 chunk grid = 1024x768 world px; a 2000x2000 @ zoom 1 view sees all.
    const r = visibleChunkRange(0, 0, 2000, 2000, 1, 4, 3);
    expect(r).toEqual({ startCol: 0, startRow: 0, endCol: 4, endRow: 3 });
  });

  it('clamps to the grid bounds (never negative, never past width/height)', () => {
    // Camera pushed well past the gring edge.
    const r = visibleChunkRange(-500, -500, 300, 300, 1, 4, 3);
    expect(r.startCol).toBe(0);
    expect(r.startRow).toBe(0);
    expect(r.endCol).toBeLessThanOrEqual(4);
    expect(r.endRow).toBeLessThanOrEqual(3);
  });

  it('returns a window of chunks around the camera at 1x', () => {
    // Camera at world (300,300): 300/256 = 1.17 → startCol/Row = 1.
    // 300+512 view span → (300+512)/256 = 3.17 → ceil = 4 → endCol = min(4, wide).
    const r = visibleChunkRange(300, 300, 512, 512, 1, 8, 8);
    expect(r.startCol).toBe(1);
    expect(r.startRow).toBe(1);
    expect(r.endCol).toBe(4);
    expect(r.endRow).toBe(4);
  });

  it('accounts for zoom: a higher zoom sees fewer world chunks', () => {
    // 512px canvas @ zoom 2 = 256 world px = exactly one chunk span from origin.
    const r = visibleChunkRange(0, 0, 512, 512, 2, 8, 8);
    expect(r.startCol).toBe(0);
    expect(r.startRow).toBe(0);
    expect(r.endCol).toBe(1);
    expect(r.endRow).toBe(1);
  });

  it('exposes CHUNK_PX = 256', () => {
    expect(CHUNK_PX).toBe(256);
  });
});

// ---------------------------------------------------------------------------
// layoutCellAt — defensive indexing over the (possibly irregular) layout blob.
// ---------------------------------------------------------------------------
describe('layoutCellAt', () => {
  const grid = (width: number, height: number, cells: number[]): LayoutGrid => ({
    width,
    height,
    cells: new Uint8Array(cells),
  });

  it('reads row-major cells inside a regular grid', () => {
    const g = grid(3, 2, [10, 11, 12, 20, 21, 22]);
    expect(layoutCellAt(g, 0, 0)).toBe(10);
    expect(layoutCellAt(g, 2, 0)).toBe(12);
    expect(layoutCellAt(g, 1, 1)).toBe(21);
    expect(layoutCellAt(g, 2, 1)).toBe(22);
  });

  it('returns undefined outside the declared grid', () => {
    const g = grid(3, 2, [10, 11, 12, 20, 21, 22]);
    expect(layoutCellAt(g, 3, 0)).toBeUndefined(); // col past width
    expect(layoutCellAt(g, 0, 2)).toBeUndefined(); // row past height
    expect(layoutCellAt(g, -1, 0)).toBeUndefined();
    expect(layoutCellAt(g, 0, -1)).toBeUndefined();
  });

  it('clamps to cells.length when the blob is SHORTER than width*height (ending.bin case)', () => {
    // Declared 3x2 = 6 cells, but only 4 bytes present.
    const g = grid(3, 2, [10, 11, 12, 20]);
    expect(layoutCellAt(g, 0, 1)).toBe(20); // index 3, present
    expect(layoutCellAt(g, 1, 1)).toBeUndefined(); // index 4, absent → blank
    expect(layoutCellAt(g, 2, 1)).toBeUndefined(); // index 5, absent → blank
  });

  it('ignores trailing bytes when the blob is LONGER than width*height', () => {
    // Declared 2x2 = 4 cells, but 5 bytes present (one trailing byte).
    const g = grid(2, 2, [1, 2, 3, 4, 99]);
    expect(layoutCellAt(g, 1, 1)).toBe(4); // last in-grid cell
    // The trailing 99 is unreachable through in-grid coordinates.
  });
});

// ---------------------------------------------------------------------------
// ringGroupPositions — S1 object $25 group expansion.
// Ported from s1disasm/_incObj/25, 37 Rings.asm (Ring_Main + Ring_PosData).
// ---------------------------------------------------------------------------
describe('ringGroupPositions', () => {
  it('subtype 0 → a single ring at the placement point', () => {
    // low nibble 0 → count 1; orientation 0 → spacing (0x10, 0).
    const pts = ringGroupPositions(0x00, 100, 200);
    expect(pts).toEqual([{ x: 100, y: 200 }]);
  });

  it('low nibble is (count-1): subtype 3 → 4 rings spaced right by 0x10', () => {
    const pts = ringGroupPositions(0x03, 0, 0);
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 0x10, y: 0 },
      { x: 0x20, y: 0 },
      { x: 0x30, y: 0 },
    ]);
  });

  it('orientation nibble picks the spacing vector: $3 = down, medium (0, 0x18)', () => {
    // subtype 0x31 → orientation 3 (down short 0x10), count 2.
    const pts = ringGroupPositions(0x31, 10, 20);
    expect(pts).toEqual([
      { x: 10, y: 20 },
      { x: 10, y: 20 + 0x10 },
    ]);
  });

  it('diagonal-left orientation uses a negative X step', () => {
    // subtype 0x91 → orientation 9 (diag left short: -0x10, 0x10), count 2.
    const pts = ringGroupPositions(0x91, 0x40, 0);
    expect(pts).toEqual([
      { x: 0x40, y: 0 },
      { x: 0x40 - 0x10, y: 0x10 },
    ]);
  });

  it('reproduces the 8-ring guard: low nibble 7 spawns 7 rings, not 8', () => {
    const pts = ringGroupPositions(0x07, 0, 0);
    expect(pts).toHaveLength(7);
  });

  it('count of a normal group is (subtype & 7) + 1', () => {
    expect(ringGroupPositions(0x01, 0, 0)).toHaveLength(2);
    expect(ringGroupPositions(0x05, 0, 0)).toHaveLength(6);
    expect(ringGroupPositions(0x06, 0, 0)).toHaveLength(7);
  });
});
