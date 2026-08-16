// src/core/art/tile-canon.ts
//
// THE CANONICAL FORM OF AN 8x8 TILE, stated once.
//
// Two callers need to answer "are these the same tile, allowing for flips": 2B's
// unique-tile readout (canvas-constraints.ts) and 2C's commit dedup. That readout
// promises commit can never claim more slots than the number it shows, and the
// promise is only PROVABLE if both sides share one definition of sameness — two
// copies would drift, and the drift direction that over-counts makes the budget
// look tighter, so the number would never look wrong enough to question.
//
// KEYED ON ENTRIES, NOT ON CANVAS INDICES. A Genesis tile holds 4-bit entries;
// which palette LINE they resolve against comes from the block or sprite
// attribute referencing the tile, not from the tile itself. The same shape drawn
// in line 0 and in line 3 is ONE tile referenced twice, which is how the shipped
// data is built, heavily.
//
// FLIPS ARE X, Y AND XY ONLY. The VDP has an H bit and a V bit and no transpose,
// so a rotated tile is a different tile; folding rotations in here would have 2C
// emit art that draws wrong.
//
// Pure core — no store, no React, no document types.

import type { PixelBuffer } from './pixel-ops';
import { paletteEntryOf } from './canvas-doc';

/** A Genesis tile is 8x8. Hardware. */
export const CELL = 8;
/** Entries in one tile. */
export const TILE_ENTRIES = CELL * CELL;

export interface CanonicalTile {
  /** Equal for two cells that are the same tile under some flip. */
  key: string;
  /**
   * The orientation relating this cell to its canonical form. Flips are
   * involutions, so this maps the cell TO canonical and canonical BACK to the
   * cell — which is why a block cell storing these bits renders the drawn cell.
   */
  xf: boolean;
  yf: boolean;
}

/**
 * The 8x8 cell at (x0, y0), as 64 palette ENTRIES.
 *
 * `out` is an optional scratch buffer: this runs once per cell and a max-size
 * canvas holds 16 384 of them, so the caller is given a way to avoid 16 384
 * allocations. Not required — omit it and get a fresh array.
 */
export function readCellEntries(
  pixels: PixelBuffer, x0: number, y0: number, out?: Uint8Array,
): Uint8Array {
  const dst = out ?? new Uint8Array(TILE_ENTRIES);
  for (let y = 0; y < CELL; y++) {
    const src = (y0 + y) * pixels.width + x0;
    for (let x = 0; x < CELL; x++) dst[y * CELL + x] = paletteEntryOf(pixels.data[src + x]);
  }
  return dst;
}

/**
 * The canonical orientation: the lexicographically smallest of the four.
 *
 * Chosen WITHOUT materialising all four — the loop walks the 64 positions once,
 * keeping the set of orientations still tied for smallest, so the common case
 * (an early entry decides it) costs a handful of comparisons.
 *
 * TIES PREFER THE IDENTITY. A fully symmetric tile is equal in all four
 * orientations, and `tied[0]` is orientation 0 because the candidate list starts
 * ascending — so a tile that needs no flip is never reported as needing one.
 * Ties produce identical bytes, so this can only ever affect the reported
 * orientation, never the key.
 */
export function canonicalTile(entries: Uint8Array): CanonicalTile {
  // Orientation as two bits — bit 0 flips x, bit 1 flips y — rather than four
  // closures returning [sx, sy]: this runs up to 64 x 4 times per cell, and a
  // two-element array per read would be millions of allocations per scan.
  const at = (o: number, i: number): number => {
    const cx = i % CELL, cy = (i / CELL) | 0;
    const sx = (o & 1) ? CELL - 1 - cx : cx;
    const sy = (o & 2) ? CELL - 1 - cy : cy;
    return entries[sy * CELL + sx];
  };

  let tied = [0, 1, 2, 3];
  for (let i = 0; i < TILE_ENTRIES && tied.length > 1; i++) {
    let min = 16;
    for (const o of tied) { const v = at(o, i); if (v < min) min = v; }
    tied = tied.filter((o) => at(o, i) === min);
  }
  const winner = tied[0];
  const scratch = new Uint8Array(TILE_ENTRIES);
  for (let i = 0; i < TILE_ENTRIES; i++) scratch[i] = at(winner, i);
  return {
    key: String.fromCharCode(...scratch),
    xf: (winner & 1) !== 0,
    yf: (winner & 2) !== 0,
  };
}
