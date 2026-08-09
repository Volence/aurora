import { describe, it, expect } from 'vitest';
import {
  CHUNK_PX,
  visibleChunkRange,
  layoutCellAt,
  ringGroupPositions,
  screenToWorld,
  worldToLayoutCell,
  addStampCell,
  stampAccumToCells,
  hitTestObject,
  type StampCell,
} from '../viewport-math';
import type { LayoutGrid } from '../../../../core/level-classic/model';
import type { S1ObjectEntry } from '../../../../core/formats/classic/s1-objpos';

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
// worldToLayoutCell / stamp-gesture accumulation (Task 13) — the pure logic
// behind the stamp tool: one undo step per drag via dedupe + in-bounds clamping.
// ---------------------------------------------------------------------------
describe('worldToLayoutCell', () => {
  it('floors world pixels to the 256px cell', () => {
    expect(worldToLayoutCell(0, 0)).toEqual({ col: 0, row: 0 });
    expect(worldToLayoutCell(255, 255)).toEqual({ col: 0, row: 0 });
    expect(worldToLayoutCell(256, 512)).toEqual({ col: 1, row: 2 });
    expect(worldToLayoutCell(700, 300)).toEqual({ col: 2, row: 1 });
  });

  it('clamps toward negative for off-grid coords (caller drops them)', () => {
    expect(worldToLayoutCell(-1, -1)).toEqual({ col: -1, row: -1 });
  });
});

describe('addStampCell / stampAccumToCells', () => {
  const grid = { w: 4, h: 3 };

  it('adds a new in-bounds cell and reports it as added', () => {
    const acc = new Map<number, StampCell>();
    expect(addStampCell(acc, 1, 2, grid.w, grid.h)).toBe(true);
    expect(acc.size).toBe(1);
    expect([...acc.values()]).toEqual([{ x: 1, y: 2 }]);
  });

  it('dedupes a re-touched cell (one write per cell → one undo step)', () => {
    const acc = new Map<number, StampCell>();
    addStampCell(acc, 2, 1, grid.w, grid.h);
    expect(addStampCell(acc, 2, 1, grid.w, grid.h)).toBe(false); // same cell again
    expect(acc.size).toBe(1);
  });

  it('drops cells outside the grid (drag wandered off the level)', () => {
    const acc = new Map<number, StampCell>();
    expect(addStampCell(acc, -1, 0, grid.w, grid.h)).toBe(false);
    expect(addStampCell(acc, 0, -1, grid.w, grid.h)).toBe(false);
    expect(addStampCell(acc, 4, 0, grid.w, grid.h)).toBe(false); // col == width
    expect(addStampCell(acc, 0, 3, grid.w, grid.h)).toBe(false); // row == height
    expect(acc.size).toBe(0);
  });

  it('rejects non-integer coordinates', () => {
    const acc = new Map<number, StampCell>();
    expect(addStampCell(acc, 1.5, 0, grid.w, grid.h)).toBe(false);
    expect(acc.size).toBe(0);
  });

  it('distinct cells on the same row do not collide in the linear key', () => {
    const acc = new Map<number, StampCell>();
    addStampCell(acc, 0, 0, grid.w, grid.h);
    addStampCell(acc, 1, 0, grid.w, grid.h);
    addStampCell(acc, 0, 1, grid.w, grid.h);
    expect(acc.size).toBe(3);
  });

  it('flattens the accumulator into a chunk-stamped command payload', () => {
    const acc = new Map<number, StampCell>();
    addStampCell(acc, 1, 0, grid.w, grid.h);
    addStampCell(acc, 2, 1, grid.w, grid.h);
    expect(stampAccumToCells(acc, 0x05)).toEqual([
      { x: 1, y: 0, chunkId: 0x05 },
      { x: 2, y: 1, chunkId: 0x05 },
    ]);
  });

  it('an empty accumulator flattens to an empty payload (no command)', () => {
    expect(stampAccumToCells(new Map(), 3)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// screenToWorld — inverse of the camera's draw transform (cam.x + px/zoom).
// The convention is documented at ClassicLevelViewport.tsx:39-53.
// ---------------------------------------------------------------------------
describe('screenToWorld', () => {
  it('at zoom 1 with no pan, screen == world', () => {
    expect(screenToWorld({ x: 0, y: 0, zoom: 1 }, 40, 30)).toEqual({ x: 40, y: 30 });
  });

  it('adds the camera world origin (pan)', () => {
    expect(screenToWorld({ x: 100, y: 200, zoom: 1 }, 40, 30)).toEqual({ x: 140, y: 230 });
  });

  it('divides the screen offset by zoom', () => {
    // zoom 2: a 100px screen offset spans 50 world px; origin at (10, 20).
    expect(screenToWorld({ x: 10, y: 20, zoom: 2 }, 100, 80)).toEqual({ x: 60, y: 60 });
  });

  it('round-trips a world point through the draw transform under zoom + pan', () => {
    // Forward transform: screenPx = (world - cam) * zoom. screenToWorld inverts it.
    const cam = { x: 137, y: 512, zoom: 4 };
    for (const [wx, wy] of [[137, 512], [200, 700], [1000, 900]] as const) {
      const sx = (wx - cam.x) * cam.zoom;
      const sy = (wy - cam.y) * cam.zoom;
      expect(screenToWorld(cam, sx, sy)).toEqual({ x: wx, y: wy });
    }
  });

  it('with a zero-origin camera, converts a screen delta into a world delta', () => {
    // The panning usage: drag delta (dx, dy) → world delta (dx/zoom, dy/zoom).
    expect(screenToWorld({ x: 0, y: 0, zoom: 4 }, 40, 80)).toEqual({ x: 10, y: 20 });
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
// hitTestObject — nearest object marker within a world-space pick radius.
// ---------------------------------------------------------------------------
describe('hitTestObject', () => {
  const obj = (x: number, y: number, id = 1): S1ObjectEntry => ({
    x, y, xflip: false, yflip: false, respawn: false, id, subtype: 0,
  });

  it('returns null for an empty object list', () => {
    expect(hitTestObject([], 100, 100, 16)).toBeNull();
  });

  it('selects an object when the click is within the radius', () => {
    const objs = [obj(100, 100)];
    expect(hitTestObject(objs, 105, 103, 16)).toBe(0); // dist ~5.8 < 16
  });

  it('returns null when the click is outside every radius', () => {
    const objs = [obj(100, 100)];
    expect(hitTestObject(objs, 200, 200, 16)).toBeNull();
  });

  it('picks the NEAREST object when several are in range', () => {
    const objs = [obj(100, 100), obj(110, 100), obj(90, 100)];
    // Click at 108,100: nearest is index 1 (dist 2) over 0 (8) and 2 (18).
    expect(hitTestObject(objs, 108, 100, 32)).toBe(1);
  });

  it('is inclusive at exactly the radius boundary', () => {
    const objs = [obj(100, 100)];
    expect(hitTestObject(objs, 116, 100, 16)).toBe(0); // dist == 16
    expect(hitTestObject(objs, 117, 100, 16)).toBeNull(); // dist 17 > 16
  });

  it('resolves an exact tie to the later (topmost) index', () => {
    // Two objects equidistant from the click — the later one draws on top.
    const objs = [obj(90, 100), obj(110, 100)];
    expect(hitTestObject(objs, 100, 100, 16)).toBe(1);
  });

  it('a smaller radius (higher zoom) still selects a close marker', () => {
    const objs = [obj(100, 100)];
    // radius 4 (e.g. 16px tolerance at zoom 4): a 2px-away click still hits.
    expect(hitTestObject(objs, 102, 100, 4)).toBe(0);
    expect(hitTestObject(objs, 108, 100, 4)).toBeNull();
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

  it('orientation nibble picks the spacing vector: $3 = down, short (0, 0x10)', () => {
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
