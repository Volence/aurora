// Pure grid-hit math for the composer dock (Task B3). The three tabs all map a
// local pixel coordinate inside a fixed-scale canvas to a row-major cell index:
//   • chunk tab — 16x16 block cells
//   • block tab — 2x2 tile cells
//   • tile tab  — 8x8 pixels
// Kept pure + unit-tested; the GUI stays a thin caller.

/**
 * Map a local pixel coordinate (relative to a grid canvas's top-left) to a
 * row-major cell index in a `cols`x`rows` grid whose cells are `cellPx` square,
 * or null when the point falls outside the grid. Negative/degenerate cellPx and
 * out-of-range coordinates all yield null (never throws, never a wrapped index).
 */
export function cellIndexAt(
  localX: number,
  localY: number,
  cellPx: number,
  cols: number,
  rows: number,
): number | null {
  if (!(cellPx > 0) || cols <= 0 || rows <= 0) return null;
  if (localX < 0 || localY < 0) return null;
  const col = Math.floor(localX / cellPx);
  const row = Math.floor(localY / cellPx);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  return row * cols + col;
}
