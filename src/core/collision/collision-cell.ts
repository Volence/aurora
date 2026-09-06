// THE CELL ↔ SUB-TILE ARITHMETIC, AND THE ONE PLACE THE RATIO IS SPELLED.
//
// Aurora paints collision in 16px CELLS. The file it saves
// (`section_N.collattr.bin`) is per-8px SUB-TILE, so one cell is a 2x2 block of
// sub-tiles and every writer that means "a cell" writes all four indices.
//
// ⚠ THE RATIO IS LOAD-BEARING AND IT IS NOT SYMMETRIC ONCE THE ENGINE READS IT.
// aeon's loop-crossover trigger keys on a packed cell id masked $FFF8FFF0 —
// `COLL_CELL_W` = 8px in X, `COLL_CELL_H` = 16px in Y
// (aeon engine/system/constants.emp, and its bake
// `apply_editor_collision_overlay` indexes this file's SUB-TILE COLUMN directly:
// `o = (cr * 2) * W + col`, one output per 8px column per 16px row).
//
// So in X the engine reads this file twice as finely as Aurora's cell, and a
// mark painted across a whole cell is TWO trigger cells wide. That is why
// `cellCrossoverIndices` exists: see layer-transition.ts's CrossoverSpan block
// for the parity argument and docs/reviews/2026-09-04-loops-two-way-mark.md.

import { crossoverSpanIsHalf } from './layer-transition';
import type { CrossoverSpan, CrossoverSpanMode } from './layer-transition';

/** 8px sub-tile columns per 16px collision cell. Named once and USED by
 *  `cellTileIndices` below, so the expansion and anything that reasons about
 *  the expansion cannot drift apart. */
export const CELL_SUBTILE_COLS = 2;
/** 8px sub-tile rows per 16px collision cell. Same rule. */
export const CELL_SUBTILE_ROWS = 2;

// A 16px collision cell = the 2x2 block of 8px tiles. Both tiles of each axis
// carry the same engine attr byte, so painting a cell writes all four indices.
//
// ORDER IS PART OF THE CONTRACT: [top-left, top-right, bottom-left,
// bottom-right]. Callers destructure it (`const [tl, tr, bl, br] = ...`) and
// the crossover lens and the audit both take a cell's canonical word from
// index 0, its TOP-LEFT sub-tile.
export function cellTileIndices(cellCol: number, cellRow: number, width: number): number[] {
  const tc = cellCol * CELL_SUBTILE_COLS, tr = cellRow * CELL_SUBTILE_ROWS;
  const out: number[] = [];
  for (let r = 0; r < CELL_SUBTILE_ROWS; r++) {
    for (let c = 0; c < CELL_SUBTILE_COLS; c++) out.push((tr + r) * width + tc + c);
  }
  return out;
}

/**
 * The sub-tile indices of ONE cell that a crossover mark of `span` covers.
 *
 * `'cell'` is every index `cellTileIndices` names — today's behaviour and the
 * default everywhere, so nothing changes for a caller that does not ask.
 *
 * `'left'` / `'right'` name ONE 8px sub-tile COLUMN of the cell (both of its
 * rows, because the engine's cell is 16px tall and a mark on only the bottom
 * row is never read: the bake samples the cell's TOP sub-tile row). That is one
 * engine trigger cell in X, which is the only width at which a two-way
 * crossover pair nets to a flip.
 *
 * It is derived from `cellTileIndices` rather than recomputed, so the two can
 * never disagree about which sub-tiles a cell covers.
 */
export function cellCrossoverIndices(
  cellCol: number, cellRow: number, width: number, span: CrossoverSpan,
): number[] {
  const all = cellTileIndices(cellCol, cellRow, width);
  if (span === 'cell') return all;
  const tc = cellCol * CELL_SUBTILE_COLS;
  const want = span === 'left' ? tc : tc + CELL_SUBTILE_COLS - 1;
  return all.filter((index) => index % width === want);
}

/** Which half of a cell an 8px TILE column falls in — how the map brush turns
 *  "where the cursor is" into a span. `tileCol` is the 8px column under the
 *  cursor (`hoverInfo.col`), not the 16px cell column.
 *
 *  THE RETURN TYPE EXCLUDES `'cell'` because this function cannot produce it:
 *  a column is in one half or the other. Narrowed 2026-09-06 so the audit's
 *  `CrossoverLocus.half` can BE this value rather than re-deriving the parity
 *  beside it; every existing caller wants a `CrossoverSpan` and a narrower
 *  return is assignable to one. */
export function spanForTileCol(tileCol: number): Exclude<CrossoverSpan, 'cell'> {
  return tileCol % CELL_SUBTILE_COLS === 0 ? 'left' : 'right';
}

/**
 * THE SPAN A GESTURE AT `tileCol` AUTHORS UNDER MARK-WIDTH `mode`. ONE RULE.
 *
 * ⚠ THIS EXISTS SO THE HOVER PREVIEW AND THE COMMIT PATH CANNOT DRIFT. Both
 * ask the same question — "if the author clicked HERE, right now, which
 * sub-columns get the mark?" — and before 2026-09-06 only the commit path
 * could answer it, so the preview depicted no mark at all and a half-width
 * stroke looked exactly like a cell-wide one under the cursor
 * (docs/reviews/2026-09-04-loops-two-way-mark.md §8 row 2).
 *
 * A preview that re-derived the parity beside the brush would be RIGHT TODAY
 * and wrong the first time this rule moves — and it would look correct in
 * every screenshot, which is why the rule is a call and not a comment.
 */
export function crossoverSpanForCursor(mode: CrossoverSpanMode, tileCol: number): CrossoverSpan {
  return crossoverSpanIsHalf(mode) ? spanForTileCol(tileCol) : 'cell';
}

/**
 * Every sub-tile index a stroke over `targets` would MARK at `span`.
 *
 * The commit path's mark set and the hover preview's footprint are THIS, so
 * "what the preview draws" and "what the click writes" are one array built
 * once rather than two loops that agree by inspection. `cell` is included: the
 * caller that needs "the default write, not a set that happens to be complete"
 * distinguishes the span itself (see MapViewport's `crossoverAt`).
 */
export function crossoverMarkIndices(
  targets: Iterable<{ cellCol: number; cellRow: number }>, width: number, span: CrossoverSpan,
): number[] {
  const out: number[] = [];
  for (const t of targets) out.push(...cellCrossoverIndices(t.cellCol, t.cellRow, width, span));
  return out;
}
