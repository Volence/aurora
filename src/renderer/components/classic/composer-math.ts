// Pure grid-hit math for the composer dock (Task B3). The two HAND-ROLLED tabs
// map a local pixel coordinate inside a fixed-scale canvas to a row-major cell
// index:
//   • chunk tab — 16x16 block cells at 20px
//   • block tab — 2x2 tile cells at 64px
// Kept pure + unit-tested; the GUI stays a thin caller.
//
// THE TILE TAB IS NOT ONE OF THEM ANY MORE. It moved onto the shared pixel
// substrate in H1.3 (PixelViewport + PixelEditController), which does its own
// zoom-aware hit-testing in core/art/viewport-coords — so nothing here is on a
// tile-editing path, and the 4bpp packing helpers that used to live below (the
// old pencil's `readTilePixels`/`packTilePixels` re-export and its
// `floodFillTile`) went with it in H1.7. The packing itself is unchanged and
// lives in core/art/classic-tile-buffer.ts.

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

/**
 * The bit of a canvas's box geometry needed to turn a viewport (client) point
 * into a point in the canvas's own DRAWING coordinates. Read off a live element
 * by `canvasGeom()` in composer-shared; kept as plain numbers so the mapping
 * below stays pure and node-testable.
 */
export interface CanvasGeom {
  /** `getBoundingClientRect()` origin — note this is the BORDER box. */
  left: number;
  top: number;
  /** Left/top border widths (`canvas.clientLeft` / `clientTop`), in CSS px. */
  borderLeft: number;
  borderTop: number;
  /** Rendered content size (`canvas.clientWidth` / `clientHeight`), in CSS px. */
  cssWidth: number;
  cssHeight: number;
  /** Backing-store size (`canvas.width` / `canvas.height`), in drawing units. */
  width: number;
  height: number;
}

/**
 * Map a viewport point to the canvas's drawing coordinates — the space
 * `ctx.fillRect` and friends use, and therefore the space the on-screen grid is
 * actually drawn in.
 *
 * TWO corrections, both of which the composer used to skip by doing the naive
 * `clientX - rect.left`:
 *
 *  1. `getBoundingClientRect()` returns the BORDER box, but drawing coordinates
 *     start at the CONTENT box. The chunk/block canvases carry a 1px border
 *     (`styles.gridCanvas`), so every hit-test read one CSS pixel further right
 *     and down than the cursor really was — a CONSTANT offset that put the
 *     painted pixel one off whenever the cursor sat within 1px of a cell's
 *     leading edge, and made the last 1px column/row of the canvas dead.
 *     (The tile canvas takes the same `styles.gridCanvas` but overrides
 *     `border: 'none'`, because PixelViewport's own hit-test does NOT make this
 *     correction — see the note at TileTab's `canvasStyle`.)
 *  2. CSS content size vs backing-store size. These are 1:1 for the composer
 *     today (the canvases are sized by their width/height attributes with no CSS
 *     width), so this term is the identity — but deriving it rather than
 *     assuming it means a later CSS-sized or DPR-scaled canvas cannot silently
 *     reintroduce a SCALE-dependent version of the same bug.
 *
 * Degenerate geometry (a zero-size or detached canvas) falls back to scale 1
 * rather than producing NaN/Infinity, which `cellIndexAt` would not reject.
 */
export function canvasLocalPoint(
  clientX: number,
  clientY: number,
  g: CanvasGeom,
): { x: number; y: number } {
  const scaleX = g.cssWidth > 0 ? g.width / g.cssWidth : 1;
  const scaleY = g.cssHeight > 0 ? g.height / g.cssHeight : 1;
  return {
    x: (clientX - g.left - g.borderLeft) * scaleX,
    y: (clientY - g.top - g.borderTop) * scaleY,
  };
}

/**
 * `cellIndexAt` for a viewport point: correct the canvas box geometry first, so
 * the cell returned is the one drawn under the cursor. The single hit-test entry
 * point for the chunk and block tabs.
 */
export function canvasCellIndexAt(
  clientX: number,
  clientY: number,
  g: CanvasGeom,
  cellPx: number,
  cols: number,
  rows: number,
): number | null {
  const { x, y } = canvasLocalPoint(clientX, clientY, g);
  return cellIndexAt(x, y, cellPx, cols, rows);
}

