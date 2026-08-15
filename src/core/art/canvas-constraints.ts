// src/core/art/canvas-constraints.ts
//
// THE RULES, EVALUATED — spec §4.3. Pure: no store, no React, no palette.
//
// The palette is deliberately not an input. Every rule here is about which LINE
// a pixel draws from and which ENTRY it uses, never about what colour that entry
// holds — so recolouring a document cannot change any answer in this file, and
// the cache in canvas-constraints-cache.ts is free to ignore palette identity.
//
// NEVER PREVENT (spec §4.3). Nothing here refuses, clamps or rewrites a pixel.
// It reports; the pane decides how loudly to say so.

import type { PixelBuffer } from './pixel-ops';
import {
  CANVAS_LINES, CANVAS_LINE_LENGTH, paletteLineOf, paletteEntryOf, isTransparent,
} from './canvas-doc';
import type { CanvasGridOrigin } from './canvas-doc';
import type { ConstraintProfile } from './canvas-profiles';

/** A Genesis tile is 8x8. The 16 and 256 grids are guides; this one is a rule. */
export const CELL = 8;

export interface CanvasCell {
  x: number; y: number; w: number; h: number;
  /** A full 8x8 cell can become a tile. A clipped one cannot — see
   *  `pixelsOutsideGrid` in the tile count, which reports them rather than
   *  rounding them either way. */
  full: boolean;
}

/**
 * Every cell the document's grid cuts it into, row-major, covering each pixel
 * exactly once.
 *
 * The origin is taken MODULO the cell: the grid repeats every 8px, so an origin
 * of 8 and an origin of 0 describe the same grid, and a negative origin folds
 * into the same 0..7 phase rather than shifting the whole plane off the canvas.
 * (`((n % 8) + 8) % 8`, not `n % 8` — JavaScript's `%` keeps the sign of the
 * dividend, so `-3 % 8` is `-3` and a bare remainder would emit cells at
 * negative coordinates.)
 */
export function canvasCells(width: number, height: number, origin: CanvasGridOrigin): CanvasCell[] {
  const phase = (n: number) => ((n % CELL) + CELL) % CELL;
  const bands = (span: number, ph: number): [number, number][] => {
    const out: [number, number][] = [];
    if (ph > 0) out.push([0, Math.min(ph, span)]);
    for (let s = ph; s < span; s += CELL) out.push([s, Math.min(CELL, span - s)]);
    return out;
  };
  const cols = bands(width, phase(origin.originX));
  const rows = bands(height, phase(origin.originY));
  const cells: CanvasCell[] = [];
  for (const [y, h] of rows) {
    for (const [x, w] of cols) {
      cells.push({ x, y, w, h, full: w === CELL && h === CELL });
    }
  }
  return cells;
}

export type CellClashKind = 'multi-line' | 'line-out-of-range';

export interface CanvasCellClash extends CanvasCell {
  kind: CellClashKind;
  /** The lines the cell actually draws from, ascending. */
  lines: number[];
}

/**
 * Cells that violate the per-8x8 palette-line rule, in two flavours:
 *
 *   multi-line        — the cell draws from more than one line. No block or
 *                       sprite attribute can express that; the hardware picks
 *                       ONE line per tile.
 *   line-out-of-range — the cell draws from a line this profile does not have
 *                       (a genesis-sprite canvas has one line, not four).
 *
 * Multi-line wins when a cell is both, because it is the one the artist has to
 * fix by redrawing rather than by re-assigning.
 *
 * TRANSPARENT PIXELS HAVE NO LINE. `canvasIndex` folds every entry-0 spelling
 * to 0 (canvas-doc.ts), so a cell of line-3 art sitting on transparency is
 * legal — and a rule that read the high nibble raw would call that a clash
 * between line 0 and line 3, flagging every sprite ever drawn.
 */
export function findCellClashes(
  pixels: PixelBuffer, origin: CanvasGridOrigin, profileLines: number,
): CanvasCellClash[] {
  const out: CanvasCellClash[] = [];
  for (const cell of canvasCells(pixels.width, pixels.height, origin)) {
    let mask = 0;
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      const row = y * pixels.width;
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        const v = pixels.data[row + x];
        if (isTransparent(v)) continue;
        mask |= 1 << paletteLineOf(v);
      }
    }
    if (mask === 0) continue;
    const lines: number[] = [];
    for (let l = 0; l < CANVAS_LINES; l++) if (mask & (1 << l)) lines.push(l);
    if (lines.length > 1) out.push({ ...cell, kind: 'multi-line', lines });
    else if (lines[0] >= profileLines) out.push({ ...cell, kind: 'line-out-of-range', lines });
  }
  return out;
}

/**
 * Distinct non-transparent entries used in each palette line, indexed by line.
 * A line can hold 15 paintable colours (entry 0 is transparency in every line),
 * which is the denominator the readout shows.
 */
export function colorsPerLine(pixels: PixelBuffer): number[] {
  const masks = new Array<number>(CANVAS_LINES).fill(0);
  for (let i = 0; i < pixels.data.length; i++) {
    const v = pixels.data[i];
    if (isTransparent(v)) continue;
    masks[paletteLineOf(v)] |= 1 << paletteEntryOf(v);
  }
  // Popcount over the WHOLE 16-bit mask, starting at 0. "Entry 0 is not a
  // colour" is enforced in exactly one place — the `isTransparent` skip above —
  // and starting this loop at 1 would enforce it a second time. That is not
  // belt-and-braces, it is a rule no test can falsify: with both in place,
  // deleting either one changes nothing, so neither is covered. (Found by
  // planting exactly that deletion, which broke nothing.) One mechanism, one
  // guard, one thing to get wrong.
  //
  // They are a SET, not a running counter, so a colour used a thousand times
  // still counts once.
  return masks.map((m) => {
    let n = 0;
    for (let b = 0; b < CANVAS_LINE_LENGTH; b++) if (m & (1 << b)) n++;
    return n;
  });
}

export interface UniqueTileCount {
  /** Distinct tiles, counting the four flip orientations as one. */
  unique: number;
  /** Full cells scanned — the denominator `unique` came out of. */
  fullCells: number;
  /** Pixels in clipped cells. They cannot become a tile, so they are neither
   *  counted nor silently dropped. */
  pixelsOutsideGrid: number;
}

/**
 * Flip-aware unique 8x8 tile count.
 *
 * KEYED ON ENTRIES, NOT ON CANVAS INDICES. A Genesis tile holds 4-bit entries;
 * which palette LINE those entries resolve against comes from the block or
 * sprite attribute that references the tile, not from the tile itself. So the
 * same shape drawn in line 0 and in line 3 is ONE tile referenced twice — which
 * is how the shipped data is built, heavily. Keying on the full 0..63 index
 * would over-count, and would do it in the direction that makes the budget look
 * tighter, so the number would never look suspicious enough to question.
 *
 * FLIPS ARE X, Y AND XY ONLY. The VDP has an H bit and a V bit. It has no
 * transpose, so a rotated tile is a different tile and folding rotations in here
 * would have 2C emit art that draws wrong.
 *
 * The canonical form is the lexicographically smallest of the four
 * orientations, chosen WITHOUT materialising all four: the loop walks the 64
 * positions once, keeping the set of orientations still tied for smallest, so
 * the common case (an early byte decides it) costs a handful of comparisons.
 * Only the winner is turned into a string, which is what goes in the Set.
 */
export function countUniqueTiles(pixels: PixelBuffer, origin: CanvasGridOrigin): UniqueTileCount {
  const seen = new Set<string>();
  let fullCells = 0, pixelsOutsideGrid = 0;
  const scratch = new Uint8Array(CELL * CELL);

  for (const cell of canvasCells(pixels.width, pixels.height, origin)) {
    if (!cell.full) { pixelsOutsideGrid += cell.w * cell.h; continue; }
    fullCells++;

    // Orientation as two bits — bit 0 flips x, bit 1 flips y — rather than four
    // closures returning [sx, sy]. This runs up to 64 x 4 times per cell and
    // 16 384 cells fit in a max-size canvas, so a two-element array per read
    // would be four million allocations per scan.
    const at = (o: number, i: number): number => {
      const cx = i % CELL, cy = (i / CELL) | 0;
      const sx = (o & 1) ? CELL - 1 - cx : cx;
      const sy = (o & 2) ? CELL - 1 - cy : cy;
      return paletteEntryOf(pixels.data[(cell.y + sy) * pixels.width + (cell.x + sx)]);
    };

    let tied = [0, 1, 2, 3];
    for (let i = 0; i < CELL * CELL && tied.length > 1; i++) {
      let min = CANVAS_LINE_LENGTH;
      for (const o of tied) { const v = at(o, i); if (v < min) min = v; }
      tied = tied.filter((o) => at(o, i) === min);
    }
    for (let i = 0; i < CELL * CELL; i++) scratch[i] = at(tied[0], i);
    seen.add(String.fromCharCode(...scratch));
  }
  return { unique: seen.size, fullCells, pixelsOutsideGrid };
}

export interface CanvasFrameSize {
  tilesWide: number; tilesHigh: number;
  /** The sprite hardware's per-frame bound, in tiles on a side. */
  maxTiles: number;
  overBound: boolean;
}

export interface CanvasConstraintReport {
  /** Empty when the profile's cell rule is off — NOT "unknown". */
  clashes: CanvasCellClash[];
  colorsPerLine: number[];
  /** Paintable entries per line — the readout's denominator. Entry 0 is
   *  transparency in every line, so it is 15 rather than lineLength. */
  colorsPerLineMax: number;
  tiles: UniqueTileCount;
  /** Null unless the profile carries sprite limits. */
  frame: CanvasFrameSize | null;
}

/** The sprite hardware's per-frame bound, in tiles on a side. */
const SPRITE_MAX_TILES = 4;

/**
 * THE ONE ENTRY POINT. Profile gating lives here and nowhere else: a pane that
 * decides for itself whether `cellPaletteRule` applies is a second answer to a
 * question the profile already answers, and the two will drift.
 *
 * Counting is not gated. "How many unique tiles is this drawing" is a fair
 * question to ask of any canvas, including one whose profile checks nothing —
 * so `none` still gets its numbers, it just gets no clashes and no bound.
 *
 * SPRITE LIMITS, HONESTLY (spec §4.2 departure, owner-confirmed 2026-08-15).
 * Of the sprite rules, only the 4x4-tile frame bound is knowable from one
 * indexed image; 20 sprites and 320px per scanline are properties of an
 * assembled frame with mappings, and belong to sprite commit. So this reports a
 * size against the bound and evaluates nothing else sprite-shaped. It is a
 * READOUT rather than a violation because a canvas is a legitimate place to
 * draw a whole sheet of frames, and a rule that flags every sheet is a rule the
 * artist switches off — after which it protects nothing.
 */
export function evaluateCanvasConstraints(input: {
  pixels: PixelBuffer; profile: ConstraintProfile; origin: CanvasGridOrigin;
}): CanvasConstraintReport {
  const { pixels, profile, origin } = input;
  // Rounded UP: a drawing 20px wide occupies three tiles, two of them part
  // empty. Rounding down would report a frame that cannot hold the art.
  const ceil8 = (n: number) => Math.ceil(n / CELL);
  const tilesWide = ceil8(pixels.width), tilesHigh = ceil8(pixels.height);
  return {
    clashes: profile.cellPaletteRule
      ? findCellClashes(pixels, origin, profile.paletteLines)
      : [],
    colorsPerLine: colorsPerLine(pixels),
    colorsPerLineMax: profile.lineLength - 1,
    tiles: countUniqueTiles(pixels, origin),
    frame: profile.spriteLimits
      ? {
        tilesWide, tilesHigh,
        maxTiles: SPRITE_MAX_TILES,
        overBound: tilesWide > SPRITE_MAX_TILES || tilesHigh > SPRITE_MAX_TILES,
      }
      : null,
  };
}
