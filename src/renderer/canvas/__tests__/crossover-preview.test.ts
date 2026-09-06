// ═══════════════════════════════════════════════════════════════════════════
// THE HOVER PREVIEW'S CROSSOVER FOOTPRINT.
//
// THE ROW THIS CLOSES: docs/reviews/2026-09-04-loops-two-way-mark.md §8 row 2 —
// "the hover preview does not depict the half". It depicted the stroke's
// GEOMETRY (cell-wide, and correctly so) and nothing at all about the MARK, so
// an author at "Half (8px)" saw a 16px outline for a write about to touch one
// 8px sub-column of it.
//
// ⚠ THE FAILURE MODE THESE ROWS EXIST TO CATCH IS "RIGHT FOR THE WRONG
// REASON", and it looks correct in every screenshot. So:
//
//   • no `8` and no `16` is typed as an expectation. Widths come from
//     `CROSSOVER_SUBTILE_PX` (the crossover LENS's unit) and counts from
//     `CELL_SUBTILE_COLS` / `CELL_SUBTILE_ROWS`;
//   • the SIDE rows derive the expected x from the SUB-COLUMN AIMED AT, not
//     from the span, so a footprint that always drew the left half — or one
//     whose parity is inverted relative to the cursor — fails at d = 1;
//   • the rows are exhaustive over a cell's sub-columns rather than two
//     examples, so a CELL_SUBTILE_COLS > 2 world does not quietly pass.
//
// ⚠ WHAT THIS FILE CANNOT ESTABLISH. That MapViewport actually calls this, and
// that the span it passes is the one `paintCollisionCell` commits, are claims
// about a React component drawing on a canvas. They are measured by
// `npm run harness:loops-hover-half` (a CDP run that hovers, reads the preview
// canvas's own pixels, then clicks the SAME integer client pixel and compares
// the marked sub-tiles to the footprint). NOTHING IN `npm test` RUNS THAT, so a
// regression in the wiring — as opposed to in this geometry — is not caught by
// the suite. Said plainly here rather than left to be discovered.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { crossoverPreviewRects } from '../crossover-preview';
import { CROSSOVER_SUBTILE_PX } from '../crossover-lens';
import {
  CELL_SUBTILE_COLS, CELL_SUBTILE_ROWS, crossoverSpanForCursor, crossoverMarkIndices,
} from '../../../core/collision/collision-cell';

const W = 64;                      // stride in 8px sub-tiles; the maths is stride-agnostic
const S = CROSSOVER_SUBTILE_PX;
const CC = 9, CR = 3;              // an unremarkable cell
const OX = 512, OY = 256;          // a non-zero section origin, so a dropped offset shows

const one = [{ cellCol: CC, cellRow: CR }];
const rectsFor = (span: Parameters<typeof crossoverPreviewRects>[0]['span']) =>
  crossoverPreviewRects({ targets: one, span, width: W, offsetX: OX, offsetY: OY });

/** The footprint's horizontal extent — what an author actually sees as "how
 *  wide is the thing I am about to mark". */
function extentX(rects: { x: number; w: number }[]): { left: number; width: number } {
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  return { left, width: right - left };
}

describe('crossoverPreviewRects — the footprint under the cursor', () => {
  it('⚠ a HALF mark is drawn one sub-column wide, NOT a whole cell', () => {
    // THE ROW. A preview that draws a cell regardless passes nothing here: the
    // cell-mode extent is the control and it is CELL_SUBTILE_COLS times wider.
    const cell = extentX(rectsFor('cell'));
    const left = extentX(rectsFor('left'));
    const right = extentX(rectsFor('right'));
    expect(cell.width).toBe(CELL_SUBTILE_COLS * S);
    expect(left.width).toBe(S);
    expect(right.width).toBe(S);
    expect(cell.width / left.width).toBe(CELL_SUBTILE_COLS);
  });

  it('every rect is exactly one sub-tile, and a half covers BOTH sub-tile rows', () => {
    // Height matters as much as width: the engine's trigger cell is 16px TALL,
    // so a mark on the top sub-row only would be a different (and wrong)
    // picture of the same span. See cellCrossoverIndices' docblock.
    for (const span of ['cell', 'left', 'right'] as const) {
      for (const r of rectsFor(span)) { expect(r.w).toBe(S); expect(r.h).toBe(S); }
    }
    expect(rectsFor('left')).toHaveLength(CELL_SUBTILE_ROWS);
    expect(rectsFor('right')).toHaveLength(CELL_SUBTILE_ROWS);
    expect(rectsFor('cell')).toHaveLength(CELL_SUBTILE_ROWS * CELL_SUBTILE_COLS);
    const ys = new Set(rectsFor('left').map((r) => r.y));
    expect(ys).toEqual(new Set(
      Array.from({ length: CELL_SUBTILE_ROWS }, (_, r) => OY + (CR * CELL_SUBTILE_ROWS + r) * S)));
  });

  it('⚠ the footprint sits on the sub-column the CURSOR is in, for every column of the cell', () => {
    // The expectation is derived from `d` — the sub-column aimed at — and NOT
    // from the span, so a footprint that always drew `left`, or one whose
    // parity is inverted with respect to the cursor, fails here. The span comes
    // from the production rule the commit path also calls.
    for (let d = 0; d < CELL_SUBTILE_COLS; d++) {
      const tileCol = CC * CELL_SUBTILE_COLS + d;
      const span = crossoverSpanForCursor('half', tileCol);
      const { left, width } = extentX(rectsFor(span));
      expect({ d, left, width }).toEqual({ d, left: OX + tileCol * S, width: S });
    }
  });

  it('mark width `cell` leaves the picture the whole 16px cell it has always been', () => {
    const { left, width } = extentX(rectsFor('cell'));
    expect(left).toBe(OX + CC * CELL_SUBTILE_COLS * S);
    expect(width).toBe(CELL_SUBTILE_COLS * S);
    // And `cell` mode ignores where in the cell the cursor is — exhaustively.
    for (let d = 0; d < CELL_SUBTILE_COLS; d++) {
      expect(crossoverSpanForCursor('cell', CC * CELL_SUBTILE_COLS + d)).toBe('cell');
    }
  });

  it('a multi-cell stroke marks its span in EVERY target, not just the cursor cell', () => {
    // The brush-size / propagate case: `crossoverAt` in paintCollisionCell is
    // built over every target, so the preview must be too. A footprint drawn
    // only at the primary cell would understate a 3x3 brush by eight cells.
    const targets = [{ cellCol: CC, cellRow: CR }, { cellCol: CC + 1, cellRow: CR },
      { cellCol: CC, cellRow: CR + 1 }];
    const rects = crossoverPreviewRects({
      targets, span: 'right', width: W, offsetX: OX, offsetY: OY });
    expect(rects).toHaveLength(targets.length * CELL_SUBTILE_ROWS);
    expect(new Set(rects.map((r) => r.x))).toEqual(new Set(
      targets.map((t) => OX + (t.cellCol * CELL_SUBTILE_COLS + CELL_SUBTILE_COLS - 1) * S)));
  });

  it('the rects ARE the commit path\'s mark indices, in world px', () => {
    // Not a reimplementation: `crossoverMarkIndices` is the array
    // paintCollisionCell turns into `crossoverAt`. This row states the
    // conversion (index -> rect) is lossless and offset-correct; it does NOT
    // establish that MapViewport passes the same arguments, which is the
    // harness's job.
    const targets = [{ cellCol: CC, cellRow: CR }, { cellCol: CC + 4, cellRow: CR + 2 }];
    for (const span of ['cell', 'left', 'right'] as const) {
      const rects = crossoverPreviewRects({ targets, span, width: W, offsetX: OX, offsetY: OY });
      const back = rects.map((r) => ((r.y - OY) / S) * W + (r.x - OX) / S);
      expect(back.slice().sort((a, b) => a - b))
        .toEqual(crossoverMarkIndices(targets, W, span).slice().sort((a, b) => a - b));
    }
  });
});
