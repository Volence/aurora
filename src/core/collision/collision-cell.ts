// THE CELL ↔ SUB-TILE ARITHMETIC, AND THE ONE PLACE THE RATIO IS SPELLED.
//
// Aurora paints collision in 16px CELLS. The file it saves
// (`section_N.collattr.bin`) is per-8px SUB-TILE, so one cell is a 2x2 block of
// sub-tiles and every writer that means "a cell" writes all four indices.
//
// aeon's bake reads the file at that same 8px sub-tile resolution
// (`apply_editor_collision_overlay` indexes the SUB-TILE COLUMN directly), so a
// cell is four sub-tile words and a reader that means "a cell" reads all four.
// (Until 2026-09-26 this file also carried the 8px "mark width" arithmetic for
// the painted loop crossover. The marks are retired; see reserved-bits.ts.)

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
// take a cell's canonical word from index 0, its TOP-LEFT sub-tile.
export function cellTileIndices(cellCol: number, cellRow: number, width: number): number[] {
  const tc = cellCol * CELL_SUBTILE_COLS, tr = cellRow * CELL_SUBTILE_ROWS;
  const out: number[] = [];
  for (let r = 0; r < CELL_SUBTILE_ROWS; r++) {
    for (let c = 0; c < CELL_SUBTILE_COLS; c++) out.push((tr + r) * width + tc + c);
  }
  return out;
}
