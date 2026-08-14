import { describe, it, expect } from 'vitest';
import { cellIndexAt, canvasLocalPoint, canvasCellIndexAt, fitCellSize, type CanvasGeom } from '../composer-math';

describe('cellIndexAt', () => {
  it('maps coords to a row-major index in a 16x16 chunk grid', () => {
    expect(cellIndexAt(0, 0, 20, 16, 16)).toBe(0);
    expect(cellIndexAt(25, 0, 20, 16, 16)).toBe(1); // col 1, row 0
    expect(cellIndexAt(0, 25, 20, 16, 16)).toBe(16); // col 0, row 1
    expect(cellIndexAt(319, 319, 20, 16, 16)).toBe(255); // last cell (col15,row15)
  });

  it('works for a 2x2 block grid', () => {
    expect(cellIndexAt(0, 0, 64, 2, 2)).toBe(0); // TL
    expect(cellIndexAt(70, 0, 64, 2, 2)).toBe(1); // TR
    expect(cellIndexAt(0, 70, 64, 2, 2)).toBe(2); // BL
    expect(cellIndexAt(70, 70, 64, 2, 2)).toBe(3); // BR
  });

  it('works for an 8x8 pixel grid', () => {
    expect(cellIndexAt(0, 0, 28, 8, 8)).toBe(0);
    expect(cellIndexAt(28 * 7 + 1, 28 * 7 + 1, 28, 8, 8)).toBe(63);
  });

  it('returns null outside the grid (past the right/bottom edge)', () => {
    expect(cellIndexAt(320, 0, 20, 16, 16)).toBeNull(); // col 16 (past 0..15)
    expect(cellIndexAt(0, 320, 20, 16, 16)).toBeNull();
  });

  it('returns null for negative coords and degenerate sizes', () => {
    expect(cellIndexAt(-1, 0, 20, 16, 16)).toBeNull();
    expect(cellIndexAt(0, -1, 20, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, 0, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, -5, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, 20, 0, 0)).toBeNull();
  });
});

// Regression: the chunk/block canvases carry a 1px border (styles.gridCanvas),
// and getBoundingClientRect() reports the BORDER box while canvas drawing coords
// start at the CONTENT box. Every composer tab used to hit-test with a bare
// `clientX - rect.left`, so every read was one CSS px right/down of the cursor —
// the tile drawn sat off from the crosshair. These pin the corrected mapping.
//
// THIS FIXTURE IS SYNTHETIC, not a live tab's geometry. It replays the Tile
// tab's RETIRED shape — an 8x8 grid at 26px/pixel → a 208px backing store,
// rendered 1:1, inside a 1px border, positioned at viewport (100, 50), so the
// drawing-space origin is client (101, 51). That tab now draws through
// PixelViewport at `artStore.zoom` and never calls this module (H1.3/H1.6); the
// numbers are kept only because they exercise the mapping at a cell size that
// divides the canvas evenly, which the live callers (chunk 20px/320, block
// 64px/128) also do. Nothing here needs updating when a tab's px changes.
const TILE_GEOM: CanvasGeom = {
  left: 100, top: 50,
  borderLeft: 1, borderTop: 1,
  cssWidth: 208, cssHeight: 208,
  width: 208, height: 208,
};

describe('canvasLocalPoint (border/scale correction)', () => {
  it('subtracts the border, so the content origin maps to (0,0)', () => {
    expect(canvasLocalPoint(101, 51, TILE_GEOM)).toEqual({ x: 0, y: 0 });
  });

  it('reports a point left/above the content box as negative (cellIndexAt rejects it)', () => {
    // Client (100,50) is ON the border, outside the drawing surface. The old
    // math called this (0,0) — a paint on pixel 0 from a click that missed.
    expect(canvasLocalPoint(100, 50, TILE_GEOM)).toEqual({ x: -1, y: -1 });
  });

  it('applies the css-size vs backing-store scale when they differ', () => {
    // A 208-unit backing store rendered into 104 CSS px → 2 drawing units per px.
    const scaled: CanvasGeom = { ...TILE_GEOM, cssWidth: 104, cssHeight: 104 };
    expect(canvasLocalPoint(111, 61, scaled)).toEqual({ x: 20, y: 20 });
  });

  it('falls back to scale 1 on degenerate (zero-size / detached) geometry', () => {
    const dead: CanvasGeom = { ...TILE_GEOM, cssWidth: 0, cssHeight: 0 };
    // Must stay finite — NaN/Infinity would sail through cellIndexAt's guards.
    expect(canvasLocalPoint(111, 61, dead)).toEqual({ x: 10, y: 10 });
  });
});

describe('canvasCellIndexAt (the composer tabs\' hit-test)', () => {
  const at = (cx: number, cy: number) => canvasCellIndexAt(cx, cy, TILE_GEOM, 26, 8, 8);

  it('maps the origin cell', () => {
    expect(at(101, 51)).toBe(0); // first drawing pixel
    expect(at(126, 76)).toBe(0); // last client px still inside cell (0,0)
  });

  it('maps the last cell, including its final pixel', () => {
    expect(at(101 + 26 * 7, 51 + 26 * 7)).toBe(63); // first px of cell (7,7)
    // The bottom-right-most drawing pixel (207,207). The old math read this as
    // 208 → out of range, making the canvas's last row/column dead.
    expect(at(101 + 207, 51 + 207)).toBe(63);
  });

  it('pins each side of a cell boundary', () => {
    // Cell 0 ends at drawing x=25, cell 1 begins at x=26.
    expect(at(101 + 25, 51)).toBe(0);
    expect(at(101 + 26, 51)).toBe(1);
    // Same on the row axis: row 1 begins at drawing y=26 → index 8.
    expect(at(101, 51 + 25)).toBe(0);
    expect(at(101, 51 + 26)).toBe(8);
  });

  it('returns null outside the canvas rather than clamping to an edge cell', () => {
    expect(at(100, 51)).toBeNull();          // on the left border
    expect(at(101, 50)).toBeNull();          // on the top border
    expect(at(101 + 208, 51)).toBeNull();    // past the right edge
    expect(at(101, 51 + 208)).toBeNull();    // past the bottom edge
    expect(at(0, 0)).toBeNull();             // far outside
  });
});

// ---------------------------------------------------------------------------
// fitCellSize — the Chunk/Block tiers' answer to "the composer does not fill
// the canvas it is given" (H3.1). The tabs measure their box with a
// ResizeObserver and hand the numbers here; everything about WHICH size is
// chosen is decided in this function, so it is the part that can be executed.
// ---------------------------------------------------------------------------
describe('fitCellSize', () => {
  it('picks the largest whole-pixel cell that fits, on the binding axis', () => {
    // 16x16 chunk grid: 496px of width is 31px per cell; a taller box does not
    // make the cell any bigger, because the grid is square.
    expect(fitCellSize(496, 660, 16, 16, 20, 48)).toBe(31);
    expect(fitCellSize(660, 496, 16, 16, 20, 48)).toBe(31);
    // 2x2 block grid: 285px is 142px per cell.
    expect(fitCellSize(285, 700, 2, 2, 64, 192)).toBe(142);
  });

  it('floors at the size the tab shipped with, so a fit can never SHRINK it', () => {
    // The whole point of the floor: a narrow window must leave the chunk grid
    // at 320px (cell 20) and hand the overflow to the dock's scrollbar, not
    // quietly draw a 16x16 grid of 8px cells.
    expect(fitCellSize(140, 140, 16, 16, 20, 48)).toBe(20);
    expect(fitCellSize(0, 0, 16, 16, 20, 48)).toBe(20);       // not yet measured
    expect(fitCellSize(-50, 900, 2, 2, 64, 192)).toBe(64);    // detached box
  });

  it('caps at the maximum, so a huge window does not draw a 2000px grid', () => {
    expect(fitCellSize(4000, 4000, 16, 16, 20, 48)).toBe(48);
    expect(fitCellSize(4000, 4000, 2, 2, 64, 192)).toBe(192);
  });

  it('returns a whole number for any input, including fractional box sizes', () => {
    // getBoundingClientRect-derived sizes are fractional in a flex layout, and
    // a fractional cell is the fractional CSS scale this function exists to
    // avoid: the canvas is `cell * cols` and must be an integer bitmap.
    for (const w of [383.5, 496.34, 549.328125, 700.99]) {
      const cell = fitCellSize(w, 900, 16, 16, 20, 48);
      expect(Number.isInteger(cell), `cell ${cell} from width ${w}`).toBe(true);
      expect(cell * 16, `a ${cell}px cell must fit in ${w}px`).toBeLessThanOrEqual(Math.ceil(w));
    }
  });

  it('never returns a size the grid does not fit in, once above the floor', () => {
    for (let w = 320; w <= 800; w += 7) {
      const cell = fitCellSize(w, 10000, 16, 16, 20, 48);
      expect(cell * 16, `cell ${cell} overflows a ${w}px box`).toBeLessThanOrEqual(Math.max(w, 320));
    }
  });

  it('degenerate grids and an inverted clamp fall back to the floor', () => {
    expect(fitCellSize(500, 500, 0, 16, 20, 48)).toBe(20);
    expect(fitCellSize(500, 500, 16, 0, 20, 48)).toBe(20);
    expect(fitCellSize(500, 500, 16, 16, 48, 20)).toBe(48); // max < min
    expect(fitCellSize(Number.NaN, 500, 16, 16, 20, 48)).toBe(20);
    // A non-finite box is a broken measurement, not a very large one — the
    // floor is the safe answer, and it is the one the max clamp would NOT give.
    expect(fitCellSize(Infinity, Infinity, 16, 16, 20, 48)).toBe(20);
  });
});
