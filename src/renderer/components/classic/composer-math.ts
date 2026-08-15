// Pure grid math for the composer dock (Task B3). The two HAND-ROLLED tabs map a
// local pixel coordinate inside a grid canvas to a row-major cell index, and
// (since H3.1) size that canvas to the room they are given:
//   • chunk tab — 16x16 block cells, 20px..48px
//   • block tab — 2x2 tile cells, 64px..192px
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
 * The largest WHOLE-PIXEL cell size at which a `cols`x`rows` grid fits inside an
 * `availW`x`availH` box, clamped to `[min, max]`.
 *
 * WHY A CELL SIZE AND NOT A CSS SCALE. The chunk and block canvases are
 * `imageRendering: pixelated` bitmaps whose backing store is `cell * cols` — the
 * grid lines, the solidity tint rects and the hit-test (`cellIndexAt` above) are
 * all in cell units. Stretching the CSS box instead resamples an already-drawn
 * bitmap at a fractional ratio, which is what the composer was doing before
 * H3.1: a 320px chunk canvas presented in a 385px box, and a 128px block canvas
 * in a 340px one, because both are direct children of a `flexDirection: column`
 * flex container and were being align-stretched to its width. Changing the CELL
 * keeps one pixel of backing store per pixel on screen.
 *
 * WHOLE PIXELS, NOT WHOLE ART PIXELS, and that is a compromise worth naming. A
 * chunk cell is 16 art px, so the only cell sizes with a whole-number ART scale
 * are 16/32/48 — i.e. the whole grid may only be 256, 512 or 768 wide, and the
 * editor column is ~500px, so the choice would be "smaller than it is today" or
 * "wider than the column". Whole CSS pixels is the achievable rung: the cell
 * boundaries the user actually interacts with are exact, and the residual is the
 * uneven art-pixel width the 20px cell already had (20/16 = 1.25).
 *
 * `min` is today's size and acts as a floor, so a box too small to measure — or
 * not yet measured, where `availW`/`availH` are 0 on the first render — yields
 * the size the tab has always had rather than a degenerate one.
 */
export function fitCellSize(
  availW: number,
  availH: number,
  cols: number,
  rows: number,
  min: number,
  max: number,
): number {
  if (!(cols > 0) || !(rows > 0) || !(max >= min)) return min;
  const fit = Math.min(Math.floor(availW / cols), Math.floor(availH / rows));
  if (!Number.isFinite(fit)) return min;
  return Math.max(min, Math.min(max, fit));
}

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
 *  2. CSS content size vs backing-store size. This term was believed to be the
 *     identity ("the canvases are sized by their width/height attributes with no
 *     CSS width") and MEASURED NOT TO BE: until H3.1 the chunk canvas drew 320
 *     backing px into a 385px box and the block canvas 128 into 340, because
 *     both are direct children of a column flex container and were being
 *     align-stretched to its width. Deriving the term rather than assuming it is
 *     the only reason the hit-test stayed correct through that. It is the
 *     identity again now (the fit box centres rather than stretches — see
 *     `fitCellSize`), and this correction is what will keep the next accidental
 *     stretch from also being a mis-click.
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

