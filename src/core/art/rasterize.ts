// Shared tile/chunk rasterization for BOTH engines.
//
// Pure core: no canvas, no DOM, no ImageData, no stores. Everything returns (or
// fills) a plain `Uint8ClampedArray` of RGBA bytes; callers wrap that in an
// ImageData / OffscreenCanvas themselves. That is what makes this fully
// node-testable in a suite with no jsdom (see __tests__/rasterize.test.ts,
// which proves byte-identity against the four implementations this replaces).
//
// WHY ONE MODULE FOR TWO ENGINES
// ------------------------------
// Classic (S1) and aeon store art differently at every level:
//
//                     classic                     aeon
//   tile pixels       4bpp packed, 32 B/tile      one byte per pixel, 64 B/tile
//   palette           raw Genesis CRAM words      `Color` objects with alpha
//   chunk             cell -> block -> 4 tiles    flat nametable of tile words
//   index 0           always transparent          whatever colour 0 says
//
// What they share is the innermost loop: "64 palette indices + one palette line
// + two flip bits -> 256 RGBA bytes", and "copy an RGBA rect, optionally
// mirrored". Those two primitives are here; each engine's own shape is adapted
// to them at its own boundary.
//
// PALETTES ARE NOT SHARED, DELIBERATELY
// -------------------------------------
// Classic CRAM words and aeon `Color`s are lossy in BOTH directions:
// `decodeGenesisColor` reads only bits 1-3/5-7/9-11 and drops the rest, and
// `Color.a` has no CRAM representation at all. Classic's save path re-emits the
// raw file words (with a recompose self-check), so round-tripping classic CRAM
// through `Color` would break byte-identity with the source files. So each
// engine converts its OWN palette representation straight to an RGBA lookup
// table here, at the last step before pixels — and the two builders differ
// exactly where the engines do:
//
//   lutFromCramWords  index 0 -> (0,0,0,0). The word's RGB is never read; the
//                     old classic path simply skipped those pixels, leaving a
//                     zeroed buffer, and any level palette's colour 0 decodes
//                     to a real, usually non-black, triple.
//   lutFromColors     index 0 -> the colour's own RGBA, alpha included. Aeon's
//                     thumbnails wrote colour 0's bytes; a missing entry fell
//                     back to opaque black.

import type { ChunkDef, Color, Palette, Tile } from '../model/s4-types';
import { unpackNametableWord } from '../model/s4-types';
import { decodeGenesisColor } from '../formats/palette';

export const TILE_PX = 8;
/** Palette indices in one 8x8 tile. */
export const TILE_PIXELS = TILE_PX * TILE_PX;
/** Bytes in one rasterized 8x8 RGBA tile. */
export const TILE_RGBA_BYTES = TILE_PIXELS * 4;

/** Bytes per packed 4bpp tile (classic's pool). */
const PACKED_TILE_BYTES = 32;
/** Bytes per packed 4bpp tile row (8 px at 2 px per byte). */
const PACKED_ROW_BYTES = 4;

/**
 * RGBA lookup for one palette line, as a flat byte array.
 *
 * 256 entries, not 16, so that ANY byte read out of a tile's pixel array is in
 * range and the per-pixel loop needs no bounds branch. Entries past the palette
 * line hold the engines' shared out-of-palette fallback (opaque black), which
 * is what `palette[i] ?? 0` (classic) and `pal[i] ?? {r:0,g:0,b:0,a:255}`
 * (aeon) both produced.
 */
export type PaletteLut = Uint8ClampedArray;

const LUT_ENTRIES = 256;
export const PALETTE_LUT_BYTES = LUT_ENTRIES * 4;
/** Index used for a missing (ragged-array) pixel — the out-of-palette slot. */
const OUT_OF_PALETTE = LUT_ENTRIES - 1;

/** A fresh LUT with every entry set to the out-of-palette fallback. */
function blankLut(): PaletteLut {
  const lut = new Uint8ClampedArray(PALETTE_LUT_BYTES);
  for (let i = 3; i < PALETTE_LUT_BYTES; i += 4) lut[i] = 255; // opaque black
  return lut;
}

/**
 * Build a LUT from a classic palette line: 16 raw Genesis CRAM words.
 *
 * Colour index 0 is fully transparent (0,0,0,0) — the CRAM word at index 0 is
 * never decoded into pixels. Missing words decode as 0, matching the old
 * `palette[index] ?? 0`.
 */
export function lutFromCramWords(words: ArrayLike<number> | null | undefined): PaletteLut {
  const lut = blankLut();
  // Entry 0: transparent black. blankLut left it opaque.
  lut[3] = 0;
  for (let i = 1; i < 16; i++) {
    const c = decodeGenesisColor(words?.[i] ?? 0);
    const o = i * 4;
    lut[o] = c.r;
    lut[o + 1] = c.g;
    lut[o + 2] = c.b;
    lut[o + 3] = 255;
  }
  return lut;
}

/**
 * Build a LUT from an aeon palette line's `Color` objects. Colour 0 is included
 * verbatim, alpha and all; entries past the supplied array stay opaque black.
 */
export function lutFromColors(colors: ArrayLike<Color> | null | undefined): PaletteLut {
  const lut = blankLut();
  const n = Math.min(colors?.length ?? 0, LUT_ENTRIES);
  for (let i = 0; i < n; i++) {
    const c = colors![i];
    if (!c) continue;
    const o = i * 4;
    lut[o] = c.r;
    lut[o + 1] = c.g;
    lut[o + 2] = c.b;
    lut[o + 3] = c.a;
  }
  return lut;
}

/**
 * Resolve an aeon palette line to a LUT, with the fallback chain every aeon
 * thumbnail path used: the requested line, else line 0, else an empty line
 * (which is all opaque black).
 */
export function lutForPaletteLine(palette: Palette, line: number): PaletteLut {
  return lutFromColors(palette.lines[line]?.colors ?? palette.lines[0]?.colors ?? []);
}

/**
 * Expand one 4bpp packed tile into 64 palette indices (row-major, high nibble =
 * left pixel). Returns null when the tile does not fit inside the pool — the
 * caller then leaves the cell transparent rather than throwing, which is what
 * the renderers need during transient invalid edit state.
 */
export function unpack4bppTile(
  packed: Uint8Array,
  tileIndex: number,
  out?: Uint8Array,
): Uint8Array | null {
  const base = tileIndex * PACKED_TILE_BYTES;
  if (tileIndex < 0 || base + PACKED_TILE_BYTES > packed.length) return null;
  const dest = out ?? new Uint8Array(TILE_PIXELS);
  for (let y = 0; y < TILE_PX; y++) {
    const row = base + y * PACKED_ROW_BYTES;
    for (let b = 0; b < PACKED_ROW_BYTES; b++) {
      const byte = packed[row + b];
      const o = y * TILE_PX + b * 2;
      dest[o] = (byte >> 4) & 0xf;
      dest[o + 1] = byte & 0xf;
    }
  }
  return dest;
}

/**
 * Paint one 8x8 tile into `dest` at pixel (destX, destY). `indices` is 64
 * palette indices; `xf`/`yf` mirror the tile's pixels. Every destination pixel
 * is written (the LUT carries transparency), so the caller never has to clear
 * first.
 */
export function drawTileInto(
  dest: Uint8ClampedArray,
  destWidthPx: number,
  destX: number,
  destY: number,
  indices: ArrayLike<number>,
  lut: PaletteLut,
  xf: boolean,
  yf: boolean,
): void {
  const rowBytes = destWidthPx * 4;
  for (let y = 0; y < TILE_PX; y++) {
    const sy = yf ? TILE_PX - 1 - y : y;
    let d = (destY + y) * rowBytes + destX * 4;
    for (let x = 0; x < TILE_PX; x++) {
      const sx = xf ? TILE_PX - 1 - x : x;
      // A short/ragged index array is malformed data; treat a missing index as
      // out-of-palette so it lands on the same opaque-black fallback the
      // per-pixel implementations used, not on colour 0.
      const ci = indices[sy * TILE_PX + sx] ?? OUT_OF_PALETTE;
      const s = ci * 4;
      dest[d] = lut[s];
      dest[d + 1] = lut[s + 1];
      dest[d + 2] = lut[s + 2];
      dest[d + 3] = lut[s + 3];
      d += 4;
    }
  }
}

/** Rasterize one 8x8 tile to its own 256-byte RGBA buffer. */
export function rasterizeTile(
  indices: ArrayLike<number>,
  lut: PaletteLut,
  xf = false,
  yf = false,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(TILE_RGBA_BYTES);
  drawTileInto(out, TILE_PX, 0, 0, indices, lut, xf, yf);
  return out;
}

/**
 * Copy an RGBA source rect into `dest` at (dx, dy), optionally mirroring the
 * source horizontally/vertically. Straight overwrite — the grid callers tile
 * disjoint regions, so no compositing is needed.
 */
export function blitRgba(
  dest: Uint8ClampedArray,
  destW: number,
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  xf: boolean,
  yf: boolean,
): void {
  for (let y = 0; y < srcH; y++) {
    const sy = yf ? srcH - 1 - y : y;
    for (let x = 0; x < srcW; x++) {
      const sx = xf ? srcW - 1 - x : x;
      const so = (sy * srcW + sx) * 4;
      const doff = ((dy + y) * destW + (dx + x)) * 4;
      dest[doff] = src[so];
      dest[doff + 1] = src[so + 1];
      dest[doff + 2] = src[so + 2];
      dest[doff + 3] = src[so + 3];
    }
  }
}

/**
 * Rasterize an aeon chunk (a flat nametable of tile words) into a fresh RGBA
 * buffer of `destWidthPx * destHeightPx` pixels.
 *
 * Two things that look like bugs and are not:
 *
 *  - **Word 0 is NOT skipped.** It unpacks to tile 0 / palette line 0 / no
 *    flips, and aeon's tile 0 is a real (conventionally blank) tile. The chunk
 *    thumbnails have always drawn it, and a palette whose colour 0 is opaque
 *    would show it. `renderer/canvas/compose-nametable.ts` DOES skip word 0 —
 *    that is a section-viewport optimisation, not this contract.
 *  - **A missing tile leaves the cell untouched**, i.e. transparent, matching
 *    the old `if (!tile) continue`.
 *
 * Cells that would fall outside the destination are clipped. The pre-extraction
 * code computed `(destY * CHUNK_PX + destX) * 4` with no bound check, so an
 * oversized chunk wrapped into the following rows; nothing produces one today
 * (importChunks is 16x16) and clipping is the honest behaviour.
 */
export function rasterizeNametableChunk(
  chunk: Pick<ChunkDef, 'nametable' | 'widthTiles' | 'heightTiles'>,
  tiles: readonly Tile[],
  palette: Palette,
  destWidthPx: number,
  destHeightPx: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(destWidthPx * destHeightPx * 4);
  const maxCol = Math.floor(destWidthPx / TILE_PX);
  const maxRow = Math.floor(destHeightPx / TILE_PX);

  // One LUT per palette line actually referenced — the old path rebuilt the
  // colour lookup for every one of the 256 cells.
  const luts: (PaletteLut | undefined)[] = [];

  for (let tileRow = 0; tileRow < chunk.heightTiles && tileRow < maxRow; tileRow++) {
    for (let tileCol = 0; tileCol < chunk.widthTiles && tileCol < maxCol; tileCol++) {
      const entry = unpackNametableWord(chunk.nametable[tileRow * chunk.widthTiles + tileCol] ?? 0);
      const tile = tiles[entry.tileIndex];
      if (!tile) continue; // no bitmap: transparent, as the old `continue`

      let lut = luts[entry.palette];
      if (lut === undefined) {
        lut = lutForPaletteLine(palette, entry.palette);
        luts[entry.palette] = lut;
      }
      drawTileInto(out, destWidthPx, tileCol * TILE_PX, tileRow * TILE_PX, tile.pixels, lut, entry.hFlip, entry.vFlip);
    }
  }
  return out;
}
