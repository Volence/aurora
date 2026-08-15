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
import { CANVAS_LINES, paletteLineOf, isTransparent } from './canvas-doc';
import type { CanvasGridOrigin } from './canvas-doc';

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
