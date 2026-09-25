// Donor-page pixel composition: canvas-free, so the node suite can test it.
//
// Two pictures come out of here, both through ONE loop:
//   * a DONOR ZONE: one tileset, one palette, every cell keyed to it;
//   * the TARGET CLIP ACT as aeon's bake composed it: several tilesets, and a
//     per-cell ZONE KEY (`section_N.zonekey.bin`, a signed byte per cell, -1 =
//     VOID) saying which one each cell's 11-bit index means. Two zones both
//     start their indices at 0, so drawing the act through one tileset would
//     draw half of it in the other zone's art: the key is the whole point
//     (aeon `tools/clip_manifest.py`, "WHAT THIS FILE IS FOR").
//
// Cells are blitted through `blitTile8` (compose-nametable.ts), the same flip
// handling the act renderer uses, so a flipped donor cell cannot be drawn one
// flip out of step with how the map draws it.
//
// COLOUR 0 IS TRANSPARENT here, unlike TileRenderer, which draws it opaque: on
// the hardware colour 0 of every line shows the backdrop, and a donor clip laid
// over nothing should read as its shapes, not as a slab of line colour.
//
// LINE 0 is the character palette in aeon (a zone palette is lines 1..3), so a
// donor cell on line 0 is drawn from `line0` when the caller has it
// (art/palettes/SonicAndTails.bin, the file the engine loads there) and from a
// grey ramp otherwise. aeon's converter counts those cells
// (`cram_line0_painted_cells`); the page says how many.

import type { Tile } from '../../core/model/types';
import { decodeGenesisColor } from '../../core/formats/palette';
import { blitTile8, TILE_RGBA_BYTES } from './compose-nametable';

/** Four CRAM lines of 16 RGBA colours; colour 0 of each line is transparent. */
export type RgbaLines = Uint8ClampedArray[];

/**
 * Build four RGBA lines from a zone palette (`firstLine`..3, 16 big-endian words
 * each) and an optional line-0 source. A short palette leaves its missing lines
 * grey rather than throwing: the loader has already refused a palette of the
 * wrong size, so this only ever sees a well-formed one.
 */
export function rgbaLines(palette: Uint8Array, firstLine: number, line0: Uint8Array | null): RgbaLines {
  const lines: RgbaLines = [];
  for (let line = 0; line < 4; line++) {
    const out = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i++) {
      let word: number | null = null;
      if (line >= firstLine) {
        const off = ((line - firstLine) * 16 + i) * 2;
        if (off + 1 < palette.length) word = (palette[off] << 8) | palette[off + 1];
      } else if (line === 0 && line0 && line0.length >= 32) {
        word = (line0[i * 2] << 8) | line0[i * 2 + 1];
      }
      const c = word === null ? { r: i * 16, g: i * 16, b: i * 16 } : decodeGenesisColor(word);
      out[i * 4] = c.r;
      out[i * 4 + 1] = c.g;
      out[i * 4 + 2] = c.b;
      out[i * 4 + 3] = i === 0 ? 0 : 255;
    }
    lines.push(out);
  }
  return lines;
}

/** Resolves (tile, line) to 256 RGBA bytes, or null for a tile the set lacks. */
export type TileRgbaLookup = (tileIndex: number, line: number) => Uint8ClampedArray | null;

/** A lazily-filled lookup over one tileset and its four lines. */
export function tileRgbaLookup(tiles: readonly Tile[], lines: RgbaLines): TileRgbaLookup {
  const cache = new Map<number, Uint8ClampedArray>();
  return (tileIndex, line) => {
    if (tileIndex >= tiles.length) return null;
    const key = tileIndex * 4 + line;
    let px = cache.get(key);
    if (!px) {
      px = new Uint8ClampedArray(TILE_RGBA_BYTES);
      const pal = lines[line];
      const src = tiles[tileIndex].pixels;
      for (let i = 0; i < 64; i++) {
        const ci = src[i] * 4;
        px[i * 4] = pal[ci];
        px[i * 4 + 1] = pal[ci + 1];
        px[i * 4 + 2] = pal[ci + 2];
        px[i * 4 + 3] = pal[ci + 3];
      }
      cache.set(key, px);
    }
    return px;
  };
}

/** A cell window of a grid, in cells. */
export interface CellWindow { c0: number; r0: number; w: number; h: number }

/**
 * Compose `win` of a (`cols`-wide) word grid into a fresh RGBA buffer of
 * `win.w * 8` by `win.h * 8` pixels.
 *
 * `keys` null means every cell uses `lookups[0]`. Otherwise `keys[i]` picks the
 * lookup, and a negative key is VOID (aeon's -1): drawn as nothing, never as
 * zone 0, because a void cell that claimed zone 0 would draw zone 0's tile 0.
 */
export function composeWindow(
  words: Uint16Array,
  cols: number,
  win: CellWindow,
  lookups: readonly TileRgbaLookup[],
  keys: Int8Array | null = null,
): Uint8ClampedArray<ArrayBuffer> {
  const pw = win.w * 8;
  const dest = new Uint8ClampedArray(pw * win.h * 8 * 4);
  const rowBytes = pw * 4;
  for (let r = 0; r < win.h; r++) {
    const gr = win.r0 + r;
    for (let c = 0; c < win.w; c++) {
      const i = gr * cols + win.c0 + c;
      const word = words[i];
      if (word === 0) continue;
      const k = keys ? keys[i] : 0;
      if (k < 0) continue;
      const lookup = lookups[k];
      if (!lookup) continue;
      const src = lookup(word & 0x7ff, (word >> 13) & 3);
      if (!src) continue;
      blitTile8(dest, rowBytes, c * 8, r * 8, src, (word & 0x0800) !== 0, (word & 0x1000) !== 0);
    }
  }
  return dest;
}

/** Count the pixels a composed buffer actually drew (alpha != 0). */
export function drawnPixels(rgba: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) n++;
  return n;
}
