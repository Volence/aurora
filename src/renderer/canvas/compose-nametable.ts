import { unpackNametableWord } from '../../core/model/s4-types';

/**
 * Pure nametable -> RGBA composition.
 *
 * WHY THIS EXISTS
 * ---------------
 * The old renderer drew one 8x8 cell at a time straight onto the section's
 * OffscreenCanvas: `putImageData` for an unflipped tile, `clearRect` +
 * `drawImage` for a flipped one, `clearRect` for an empty cell. On a
 * GPU-backed canvas (the app default — see src/main/index.ts, which only
 * disables the GPU under AURORA_NO_GPU=1) every `putImageData` costs roughly
 * 50us because it round-trips the accelerated backing store. A real Oracle
 * Jungle Zone section is a 256x256 nametable (65,536 cells) at ~17% occupancy,
 * so one section is ~11,300 `putImageData` calls; a 9-section act is ~85,700,
 * which measured at ~3.9s of hard main-thread stall on every palette commit.
 *
 * The fix is to do the compositing in plain JS against one big RGBA byte
 * buffer and hand the finished frame to the canvas with a SINGLE
 * `putImageData`. The per-cell work becomes eight 32-byte `set()` copies
 * (or a per-pixel loop for a flipped tile), which is memory bandwidth the CPU
 * is very good at, and the expensive canvas upload happens once per section
 * rather than once per tile.
 *
 * This module is deliberately canvas-free so it can be unit-tested in the
 * node-only renderer suite (no jsdom, no real ImageData) against a reference
 * implementation that mirrors the old per-tile canvas semantics exactly.
 *
 * EQUIVALENCE WITH THE OLD PER-TILE PATH
 * --------------------------------------
 *  - empty word (0), or a tile index / palette line with no prerendered
 *    bitmap  -> old code called `clearRect(px, py, 8, 8)`, i.e. the cell
 *    becomes transparent black. Here the whole buffer starts zeroed and the
 *    cell is simply skipped, which is the same result.
 *  - unflipped tile -> old code called `putImageData`, which REPLACES the
 *    destination pixels (it does not blend). Copying the source bytes over the
 *    destination rows is exactly that.
 *  - flipped tile -> old code called `clearRect` then `drawImage` of the tile
 *    through a +-1 scale, i.e. source-over onto a fully transparent
 *    destination. Palette colours in this project only ever carry alpha 0 or
 *    255 (see src/core/formats/palette.ts and the `{r,g,b,a:255}` fallbacks),
 *    and source-over onto transparent with an opaque source yields the source
 *    unchanged, while a fully transparent source leaves transparency. So a
 *    straight flipped copy of the source bytes is the same result.
 *  - the priority bit is not consulted, matching the old renderer (sections
 *    are drawn as a single plane; priority is an export-time concern).
 */

/**
 * Resolves a prerendered 8x8 tile to its 256 RGBA bytes (row-major, 4 bytes
 * per pixel), or null when that tile/palette combination has no bitmap — the
 * caller then leaves the cell transparent, matching the old `clearRect`.
 */
export type TilePixelLookup = (tileIndex: number, palette: number) => Uint8ClampedArray | null;

/** Bytes in one prerendered 8x8 RGBA tile. */
export const TILE_RGBA_BYTES = 8 * 8 * 4;
/** Bytes in one row of a prerendered 8x8 RGBA tile. */
const TILE_ROW_BYTES = 8 * 4;

/**
 * Compose `nametable` into `dest` (an RGBA byte buffer of
 * `destPixelWidth * destPixelHeight * 4` bytes), replacing its entire
 * contents.
 *
 * `tilesWide` is the nametable's stride in cells; cells that would fall
 * outside the destination are skipped rather than wrapping.
 */
export function composeNametable(
  dest: Uint8ClampedArray,
  destPixelWidth: number,
  destPixelHeight: number,
  nametable: Uint16Array,
  tilesWide: number,
  lookup: TilePixelLookup,
): void {
  dest.fill(0);

  const rowBytes = destPixelWidth * 4;
  const maxCol = Math.floor(destPixelWidth / 8);
  const maxRow = Math.floor(destPixelHeight / 8);
  const count = nametable.length;

  for (let i = 0; i < count; i++) {
    const word = nametable[i];
    if (word === 0) continue; // empty cell: already transparent

    const col = i % tilesWide;
    const row = (i / tilesWide) | 0;
    if (col >= maxCol || row >= maxRow) continue; // off-canvas cell

    const nt = unpackNametableWord(word);
    const src = lookup(nt.tileIndex, nt.palette);
    if (!src) continue; // no bitmap: transparent, as the old clearRect

    const px = col * 8;
    const py = row * 8;
    const baseByte = py * rowBytes + px * 4;

    if (!nt.hFlip && !nt.vFlip) {
      for (let r = 0; r < 8; r++) {
        const s = r * TILE_ROW_BYTES;
        dest.set(src.subarray(s, s + TILE_ROW_BYTES), baseByte + r * rowBytes);
      }
      continue;
    }

    if (!nt.hFlip) {
      // Vertical flip only: whole rows still copy contiguously, just reversed.
      for (let r = 0; r < 8; r++) {
        const s = (7 - r) * TILE_ROW_BYTES;
        dest.set(src.subarray(s, s + TILE_ROW_BYTES), baseByte + r * rowBytes);
      }
      continue;
    }

    // Horizontal flip (with or without vertical): per-pixel.
    for (let r = 0; r < 8; r++) {
      const srcRow = nt.vFlip ? 7 - r : r;
      let d = baseByte + r * rowBytes;
      for (let c = 7; c >= 0; c--) {
        const s = (srcRow * 8 + c) * 4;
        dest[d] = src[s];
        dest[d + 1] = src[s + 1];
        dest[d + 2] = src[s + 2];
        dest[d + 3] = src[s + 3];
        d += 4;
      }
    }
  }
}
