// The SHARED priority-lens depiction (canvas/tile-lens.ts).
//
// Every row here asserts GEOMETRY — the exact rects and the exact segments —
// not "it drew something", because "it drew something" is what a lens that
// veils the wrong tile also reports.

import { describe, it, expect } from 'vitest';
import { drawTileLens, type TileLensSpec } from '../tile-lens';

interface Rect { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }

/** Recording context: keeps the rects and the path points, in order. */
function recCtx() {
  const rects: Rect[] = [];
  const pts: Pt[] = [];
  const styles: string[] = [];
  const ctx = {
    lineWidth: 0,
    set fillStyle(v: string) { styles.push(`fill:${v}`); },
    set strokeStyle(v: string) { styles.push(`stroke:${v}`); },
    beginPath() {}, stroke() {},
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }); },
    moveTo(x: number, y: number) { pts.push({ x, y }); },
    lineTo(x: number, y: number) { pts.push({ x, y }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, pts, styles };
}

/** A spec over a 4x4 grid, whole grid windowed, marks given as "x,y" strings. */
function spec4(marks: string[], over: Partial<TileLensSpec> = {}): TileLensSpec {
  const set = new Set(marks);
  return {
    cols: 4, rows: 4,
    colStart: 0, colEnd: 4, rowStart: 0, rowEnd: 4,
    tilePx: 8, originX: 0, originY: 0,
    marked: (tx, ty) => set.has(`${tx},${ty}`),
    fill: 'FILL', edge: 'EDGE', invZoom: 1,
    ...over,
  };
}

describe('drawTileLens: the veil', () => {
  it('veils exactly the marked tile, at its world position', () => {
    const { ctx, rects } = recCtx();
    const drawn = drawTileLens(ctx, spec4(['1,2']));
    expect(rects).toEqual([{ x: 8, y: 16, w: 8, h: 8 }]);
    expect(drawn.veils).toBe(1);
  });

  it('MERGES a horizontal run into one rect (the cost property, asserted)', () => {
    const { ctx, rects } = recCtx();
    const drawn = drawTileLens(ctx, spec4(['0,1', '1,1', '2,1']));
    expect(rects).toEqual([{ x: 0, y: 8, w: 24, h: 8 }]);
    expect(drawn.veils).toBe(1); // three tiles, ONE fillRect
  });

  it('does not merge across a gap', () => {
    const { ctx, rects } = recCtx();
    drawTileLens(ctx, spec4(['0,0', '2,0']));
    expect(rects).toEqual([{ x: 0, y: 0, w: 8, h: 8 }, { x: 16, y: 0, w: 8, h: 8 }]);
  });

  it('offsets every coordinate by the origin', () => {
    const { ctx, rects } = recCtx();
    drawTileLens(ctx, spec4(['1,1'], { originX: 2048, originY: 4096 }));
    expect(rects).toEqual([{ x: 2048 + 8, y: 4096 + 8, w: 8, h: 8 }]);
  });

  it('draws NOTHING when no tile is marked (anti-vacuous)', () => {
    const { ctx, rects, pts } = recCtx();
    const drawn = drawTileLens(ctx, spec4([]));
    expect(rects).toEqual([]);
    expect(pts).toEqual([]);
    expect(drawn).toEqual({ veils: 0, segments: 0 });
  });

  it('uses the caller\'s colours and 1 SCREEN px for the stroke', () => {
    const { ctx, styles } = recCtx();
    drawTileLens(ctx, spec4(['1,1'], { invZoom: 0.25 }));
    expect(styles).toEqual(['fill:FILL', 'stroke:EDGE']);
    expect(ctx.lineWidth).toBe(0.25);
  });
});

describe('drawTileLens: the boundary strokes', () => {
  it('outlines a lone interior tile on all four sides', () => {
    const { ctx, pts } = recCtx();
    const drawn = drawTileLens(ctx, spec4(['1,1']));
    expect(drawn.segments).toBe(4);
    expect(pts.length).toBe(8); // 4 segments x (moveTo + lineTo)
    // Every point sits on the tile's own 8..16 box.
    for (const p of pts) {
      expect(p.x === 8 || p.x === 16).toBe(true);
      expect(p.y === 8 || p.y === 16).toBe(true);
    }
  });

  it('does NOT stroke between two adjacent marked tiles (one shape, not a grid)', () => {
    const { ctx } = recCtx();
    const drawn = drawTileLens(ctx, spec4(['1,1', '2,1']));
    // 2x1 region: 6 exposed sides, not 8.
    expect(drawn.segments).toBe(6);
  });

  it('SKIPS the grid perimeter: an unknown neighbour is not an unmarked one', () => {
    const { ctx, pts } = recCtx();
    // Tile (0,0): its left and top sides are on the grid perimeter.
    const drawn = drawTileLens(ctx, spec4(['0,0']));
    expect(drawn.segments).toBe(2);
    // The two drawn segments are the RIGHT (x=8) and BOTTOM (y=8) sides.
    expect(pts).toEqual([
      { x: 0, y: 8 }, { x: 8, y: 8 },   // bottom
      { x: 8, y: 0 }, { x: 8, y: 8 },   // right
    ]);
  });
});

describe('drawTileLens: the window', () => {
  it('iterates ONLY the window: a marked tile outside it is not veiled', () => {
    const { ctx, rects } = recCtx();
    drawTileLens(ctx, spec4(['0,0', '3,3'], { colStart: 2, colEnd: 4, rowStart: 2, rowEnd: 4 }));
    expect(rects).toEqual([{ x: 24, y: 24, w: 8, h: 8 }]);
  });

  it('decides a WINDOW-EDGE boundary against the REAL neighbour, not against the window', () => {
    // (1,1) and (2,1) are both marked; the window stops at col 2, so (1,1) is
    // the last tile iterated. Its RIGHT neighbour is marked and outside the
    // window — no stroke may appear there, or every pan would draw a false
    // seam down the edge of the screen.
    const { ctx, pts } = recCtx();
    const drawn = drawTileLens(ctx, spec4(['1,1', '2,1'], { colStart: 0, colEnd: 2 }));
    expect(drawn.segments).toBe(3); // top, bottom, left — NOT right
    // The right side would be a VERTICAL segment at x=16. Checking "no point at
    // x=16" would be wrong (the top/bottom strokes END there), so the predicate
    // is the segment, taken as consecutive pairs.
    const vertical = [];
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i].x === pts[i + 1].x) vertical.push(pts[i].x);
    }
    expect(vertical).toEqual([8]); // the LEFT side only
  });

  it('clamps the run merge to the window (cost, not correctness)', () => {
    const { ctx, rects } = recCtx();
    drawTileLens(ctx, spec4(['0,0', '1,0', '2,0', '3,0'], { colStart: 0, colEnd: 2 }));
    expect(rects).toEqual([{ x: 0, y: 0, w: 16, h: 8 }]);
  });

  it('clamps a window that runs off the grid, and draws nothing for an empty one', () => {
    const { ctx, rects } = recCtx();
    drawTileLens(ctx, spec4(['3,3'], { colStart: -10, colEnd: 99, rowStart: -10, rowEnd: 99 }));
    expect(rects).toEqual([{ x: 24, y: 24, w: 8, h: 8 }]);

    const empty = recCtx();
    const drawn = drawTileLens(empty.ctx, spec4(['1,1'], { colStart: 3, colEnd: 3 }));
    expect(empty.rects).toEqual([]);
    expect(drawn).toEqual({ veils: 0, segments: 0 });
  });
});
