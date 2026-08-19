import { describe, it, expect } from 'vitest';
import {
  CHUNK_PX,
  visibleChunkRange,
  layoutCellAt,
  ringGroupPositions,
  screenToWorld,
  worldToLayoutCell,
  worldToCollisionCell,
  rectFromCorners,
  COLLISION_CELL_PX,
  addStampCell,
  stampAccumToCells,
  hitTestObjectFrames,
  hitTestPoint,
  fitCamera,
  FIT_ZOOM_MIN,
  FIT_ZOOM_MAX,
  type ObjectHitBounds,
  type StampCell,
} from '../viewport-math';
import { GHOST_MARKER_BOUNDS } from '../classic-overlays';
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
// hitTestPoint — single-anchor grab test (player-start crosshair drag).
// ---------------------------------------------------------------------------

describe('hitTestPoint', () => {
  it('hits inside the radius and misses outside it', () => {
    expect(hitTestPoint(103, 104, 100, 100, 16)).toBe(true); // dist 5 < 16
    expect(hitTestPoint(120, 100, 100, 100, 16)).toBe(false); // dist 20 > 16
  });

  it('treats the radius as inclusive (dist == radius hits)', () => {
    expect(hitTestPoint(116, 100, 100, 100, 16)).toBe(true); // dist == 16
    expect(hitTestPoint(117, 100, 100, 100, 16)).toBe(false); // dist 17 > 16
  });

  it('a smaller radius (higher zoom) shrinks the grab area', () => {
    expect(hitTestPoint(102, 100, 100, 100, 4)).toBe(true);
    expect(hitTestPoint(108, 100, 100, 100, 4)).toBe(false);
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

// ---------------------------------------------------------------------------
// hitTestObjectFrames — frame-bounds hit-test (Task B1), incl. ring-group rings.
// ---------------------------------------------------------------------------
describe('hitTestObjectFrames', () => {
  const obj = (x: number, y: number, id = 1, subtype = 0, xflip = false, yflip = false): S1ObjectEntry => ({
    x, y, xflip, yflip, respawn: false, id, subtype,
  });
  const B: ObjectHitBounds = { width: 48, height: 32, originX: 24, originY: 16 };

  it('hits inside the frame rect and misses outside it', () => {
    const objs = [obj(100, 100)];
    const bounds = () => B; // rect = left 76, top 84, 48x32
    expect(hitTestObjectFrames(objs, 90, 90, bounds, 8)).toBe(0);
    expect(hitTestObjectFrames(objs, 76, 84, bounds, 8)).toBe(0); // top-left corner
    expect(hitTestObjectFrames(objs, 200, 200, bounds, 8)).toBeNull();
    // Just left of the box (x < left) misses.
    expect(hitTestObjectFrames(objs, 75, 100, bounds, 8)).toBeNull();
  });

  it('falls back to an anchor box when no sprite bounds are given', () => {
    const objs = [obj(100, 100)];
    const noBounds = () => null;
    expect(hitTestObjectFrames(objs, 104, 104, noBounds, 8)).toBe(0); // within ±8
    expect(hitTestObjectFrames(objs, 120, 100, noBounds, 8)).toBeNull(); // outside
  });

  it('ghost-marker bounds make the full drawn 24x16 box grabbable', () => {
    // The viewport hands an invisible id the GHOST_MARKER_BOUNDS so the grab region
    // matches the drawn box (originX 12, originY 8 → left 88, top 92, 24x16).
    const objs = [obj(100, 100, 0x49)];
    const ghost = () => ({ ...GHOST_MARKER_BOUNDS });
    expect(hitTestObjectFrames(objs, 88, 92, ghost, 2)).toBe(0); // top-left corner of the box
    expect(hitTestObjectFrames(objs, 111, 107, ghost, 2)).toBe(0); // bottom-right, inside
    expect(hitTestObjectFrames(objs, 112, 100, ghost, 2)).toBeNull(); // just past the right edge
    // The tiny anchor-radius fallback (2px) would MISS the box corner — the ghost
    // bounds are what widen it to the drawn extent.
    expect(hitTestObjectFrames(objs, 88, 92, () => null, 2)).toBeNull();
  });

  it('the topmost (later) object wins when frames overlap', () => {
    const objs = [obj(100, 100), obj(110, 100)];
    const bounds = () => B;
    // Both rects contain (100,100); the later index is chosen.
    expect(hitTestObjectFrames(objs, 100, 100, bounds, 8)).toBe(1);
  });

  it('selects a ring GROUP by clicking any expanded ring, not just the origin', () => {
    // Ring group ($25): subtype 0x02 → count 3, orientation 0 → step (0x10, 0).
    // Rings at (10,10), (26,10), (42,10). Ring bounds 16x16 centred (origin 8,8).
    const ring: ObjectHitBounds = { width: 16, height: 16, originX: 8, originY: 8 };
    const objs = [obj(10, 10, 0x25, 0x02)];
    const bounds = () => ring;
    // Far ring at (42,10): its box is left 34..50, top 2..18.
    expect(hitTestObjectFrames(objs, 42, 10, bounds, 4)).toBe(0);
    // Middle ring.
    expect(hitTestObjectFrames(objs, 26, 10, bounds, 4)).toBe(0);
    // A gap well outside every ring box.
    expect(hitTestObjectFrames(objs, 200, 200, bounds, 4)).toBeNull();
  });

  it('respects flips in the frame rect', () => {
    // Asymmetric origin makes the flip observable: xflip mirrors the box about the
    // anchor (left = x - (width - originX)).
    const asym: ObjectHitBounds = { width: 40, height: 20, originX: 4, originY: 4 };
    const bounds = () => asym;
    // Unflipped rect: left 96..136 (x=100, origin 4). A click at 130 is inside.
    expect(hitTestObjectFrames([obj(100, 100)], 130, 100, bounds, 4)).toBe(0);
    // Flipped rect: left 100-(40-4)=64 .. 104. 130 is now outside; 70 is inside.
    const flipped = [obj(100, 100, 1, 0, true, false)];
    expect(hitTestObjectFrames(flipped, 130, 100, bounds, 4)).toBeNull();
    expect(hitTestObjectFrames(flipped, 70, 100, bounds, 4)).toBe(0);
  });
});

describe('fitCamera', () => {
  // Green Hill Act 1 at 900px of canvas: the FG plane is 16 chunks tall, the BG
  // plane 4 — the exact shape that made a plane toggle jump 58% -> 200%.
  const CANVAS = 900;
  const FG_H = 16 * CHUNK_PX;
  const BG_H = 4 * CHUNK_PX;

  it('an act load fits the plane to the canvas, anchored top-left', () => {
    expect(fitCamera(CANVAS, FG_H, null)).toEqual({ x: 0, y: 0, zoom: CANVAS / FG_H });
  });

  it('clamps the act-load fit to the zoom bounds', () => {
    // The BG plane through the OLD code path: canvasH/planeH is well past the
    // ceiling, so the clamp handed back 2x — which is where the 200% came from.
    expect(fitCamera(CANVAS, BG_H, null).zoom).toBeLessThan(FIT_ZOOM_MAX);
    expect(fitCamera(CANVAS, 10, null).zoom).toBe(FIT_ZOOM_MAX);
    expect(fitCamera(CANVAS, 1e9, null).zoom).toBe(FIT_ZOOM_MIN);
    // A degenerate plane must not produce Infinity/NaN.
    expect(fitCamera(CANVAS, 0, null).zoom).toBe(1);
  });

  it('a plane switch NEVER changes the zoom — the 58% -> 200% bug', () => {
    for (const planeH of [BG_H, FG_H, CHUNK_PX, 32 * CHUNK_PX]) {
      for (const zoom of [FIT_ZOOM_MIN, 0.3, 0.58, 1, FIT_ZOOM_MAX, 8]) {
        expect(fitCamera(CANVAS, planeH, { x: 0, y: 0, zoom }).zoom, `${planeH}@${zoom}`)
          .toBe(zoom);
      }
    }
  });

  it('a plane switch keeps the pan, so the planes can be compared in place', () => {
    // Zoomed in on the FG, mid-plane: everything survives untouched.
    const before = { x: 300, y: 120, zoom: 1 };
    expect(fitCamera(CANVAS, FG_H, before)).toEqual(before);
  });

  it('pans back into bounds when the new plane is too short to hold the camera', () => {
    // Near the bottom of the tall FG, then switching to the short BG: keeping y
    // would leave the camera below the plane entirely, looking at void.
    const before = { x: 40, y: FG_H - 200, zoom: 1 };
    const after = fitCamera(CANVAS, BG_H, before);
    expect(after.y).toBe(BG_H - CANVAS);
    expect(after.y).toBeLessThan(before.y);
    expect(after.x).toBe(40);
    expect(after.zoom).toBe(1);
  });

  it('never pans to a negative y for a plane shorter than the visible height', () => {
    expect(fitCamera(CANVAS, CHUNK_PX, { x: 0, y: 5000, zoom: 1 }).y).toBe(0);
  });

  it('the bound is in WORLD units — zoom changes how much plane is visible', () => {
    // canvasH/zoom, not canvasH: at 2x only half the canvas height of world is
    // on screen, so more of a short plane is legitimately scrollable.
    expect(fitCamera(CANVAS, BG_H, { x: 0, y: 9999, zoom: 2 }).y).toBe(BG_H - CANVAS / 2);
  });
});

// ---------------------------------------------------------------------------
// worldToCollisionCell / rectFromCorners — the COLLISION facet's units.
//
// The layout facet stamps 256px chunks; the collision facet writes 16px cells.
// Both gestures start from the same mouse event, so the two quantisers have to
// agree about where the boundaries are or the map paints one place and
// highlights another.
// ---------------------------------------------------------------------------
describe('worldToCollisionCell', () => {
  it('quantises level pixels to 16px cells', () => {
    expect(COLLISION_CELL_PX).toBe(16);
    expect(worldToCollisionCell(0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToCollisionCell(15, 15)).toEqual({ x: 0, y: 0 });
    expect(worldToCollisionCell(16, 32)).toEqual({ x: 1, y: 2 });
  });

  it('agrees with worldToLayoutCell about which chunk a point is in', () => {
    // A collision cell is 16px and a layout cell is a 256px CHUNK, so
    // CHUNK_PX/COLLISION_CELL_PX collision cells span one layout cell. If these
    // two ever disagree the map would paint one chunk and highlight another.
    const per = CHUNK_PX / COLLISION_CELL_PX;
    for (const [x, y] of [[0, 0], [255, 255], [256, 0], [1000, 300]] as const) {
      const cc = worldToCollisionCell(x, y);
      const lc = worldToLayoutCell(x, y);
      expect(Math.floor(cc.x / per), `col at ${x},${y}`).toBe(lc.col);
      expect(Math.floor(cc.y / per), `row at ${x},${y}`).toBe(lc.row);
    }
  });
});

describe('rectFromCorners', () => {
  it('normalises a drag in any direction into the same inclusive box', () => {
    // A marquee dragged up-and-left must paint the SAME cells as one dragged
    // down-and-right. This is the case a naive implementation gets wrong, and
    // it is invisible until someone drags the other way.
    const want = { x: 2, y: 3, w: 3, h: 2 };
    expect(rectFromCorners({ x: 2, y: 3 }, { x: 4, y: 4 })).toEqual(want);
    expect(rectFromCorners({ x: 4, y: 4 }, { x: 2, y: 3 })).toEqual(want);
    expect(rectFromCorners({ x: 2, y: 4 }, { x: 4, y: 3 })).toEqual(want);
    expect(rectFromCorners({ x: 4, y: 3 }, { x: 2, y: 4 })).toEqual(want);
  });

  it('a single cell is a 1x1 box, INCLUSIVE of both corners', () => {
    expect(rectFromCorners({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, w: 1, h: 1 });
  });
});
