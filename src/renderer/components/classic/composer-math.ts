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
