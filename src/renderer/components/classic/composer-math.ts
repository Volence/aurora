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
 *     start at the CONTENT box. The composer canvases carry a 1px border
 *     (`styles.gridCanvas`), so every hit-test read one CSS pixel further right
 *     and down than the cursor really was — a CONSTANT offset that put the
 *     painted pixel one off whenever the cursor sat within 1px of a cell's
 *     leading edge, and made the last 1px column/row of the canvas dead.
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
 * point for all three composer tabs.
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

// ---------------------------------------------------------------------------
// 4bpp tile pixel <-> byte packing (the composer's Tile-tab pencil path)
// ---------------------------------------------------------------------------
// A Mega Drive 8x8 tile is 32 bytes: 4 bytes/row, 2 pixels/byte. The HIGH nibble
// is the LEFT (even-x) pixel, the low nibble the right — cross-checked against
// the decoder in src/core/formats/tiles.ts (high nybble → col*2, low → col*2+1)
// and the core renderer. These are the SOLE pencil→bytes path, so the nibble
// order is pinned by unit tests: a swap would silently corrupt every art edit.

const TILE_BYTES = 32;

/** Read one 8x8 tile's 64 palette indices (row-major) from a tile-pool blob. */
export function readTilePixels(tiles: Uint8Array, tileIndex: number): Uint8Array {
  const px = new Uint8Array(64);
  const base = tileIndex * TILE_BYTES;
  if (base < 0 || base + TILE_BYTES > tiles.length) return px;
  for (let i = 0; i < 64; i++) {
    const byte = tiles[base + (i >> 1)];
    px[i] = (i & 1) === 0 ? (byte >> 4) & 0xf : byte & 0xf;
  }
  return px;
}

/** Pack 64 palette indices back into one tile's 32 bytes (inverse of readTilePixels). */
export function packTilePixels(px: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE_BYTES);
  for (let i = 0; i < 64; i++) {
    const b = i >> 1;
    if ((i & 1) === 0) out[b] = (out[b] & 0x0f) | ((px[i] & 0xf) << 4);
    else out[b] = (out[b] & 0xf0) | (px[i] & 0xf);
  }
  return out;
}

/**
 * 4-connected flood fill over an 8x8 tile's 64 palette indices (row-major).
 * Returns pixel index → color — the same Map shape as a pencil stroke, so the
 * Tile tab commits both through the identical endStroke path. Empty when the
 * start is out of range or the region is already the fill color (a no-op fill
 * must not produce an undo step).
 */
export function floodFillTile(px: Uint8Array, start: number, color: number): Map<number, number> {
  const out = new Map<number, number>();
  if (px.length !== 64 || start < 0 || start >= 64) return out;
  const target = px[start];
  if (target === (color & 0xf)) return out;
  const stack = [start];
  const seen = new Set<number>(stack);
  while (stack.length) {
    const i = stack.pop()!;
    if (px[i] !== target) continue;
    out.set(i, color & 0xf);
    const x = i % 8;
    const nbrs = [x > 0 ? i - 1 : -1, x < 7 ? i + 1 : -1, i - 8, i + 8];
    for (const n of nbrs) {
      if (n >= 0 && n < 64 && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return out;
}
