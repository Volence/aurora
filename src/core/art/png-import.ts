// src/core/art/png-import.ts
//
// A FOREIGN PNG -> CANVAS INDEX SPACE, against an act's palette.
//
// This is the import path's one hard problem, and it is NOT a lookup. A pixel's
// stored value is `(line << 4) | entry`, and the hardware rule is that all 64
// pixels of an 8x8 cell must draw from ONE line. Real act palettes repeat
// colours across lines — black and white especially, but also greys and the
// shared ramp ends — so a colour does not determine a line. Choosing per COLOUR
// (first match wins) assigns lines that contradict each other inside a cell and
// manufactures clashes in artwork that is perfectly legal. The assignment is
// therefore solved PER CELL: find the lines that can express everything in the
// cell, and pick one.
//
// SonLVL solves the same problem per tile on the way in. So do we.
//
// WHY THIS DOES NOT PRODUCE A CanvasDoc. `decodeCanvasFiles` refuses images over
// CANVAS_MAX_SIDE because a canvas document keeps 40 whole-buffer undo
// snapshots (canvas-file-format.ts:249). An import has no undo history, so it
// has no such cap — and lifting the cap is the entire reason a layout-sized
// sheet can be imported at all. The output here goes straight to the commit
// planner as pixels.
//
// Pure core — no store, no fs, no React.

import type { PixelBuffer } from './pixel-ops';
import type { DecodedIndexedPng } from './indexed-png';
import { encodeGenesisColor } from '../formats/palette';
import { canvasIndex, CANVAS_LINES, CANVAS_LINE_LENGTH } from './canvas-doc';
import { CELL } from './tile-canon';

export interface PngImportRefusal {
  kind: 'colour-not-in-act' | 'cell-needs-two-lines';
  /** For 'colour-not-in-act': the snapped CRAM words with no home. */
  colours?: number[];
  /** For 'cell-needs-two-lines': the offending cells, in pixel coordinates. */
  cells?: { x: number; y: number }[];
}

export interface PngImport {
  pixels: PixelBuffer;
  /** Palette lines the mapping actually used, ascending. */
  usedLines: number[];
  /** PNG palette entries whose colour was not exactly a Genesis colour and was
   *  snapped to the 3-bit-per-channel space on the way in. */
  snappedColours: number;
}

export type PngImportResult =
  | { ok: true; result: PngImport }
  | { ok: false; refusal: PngImportRefusal };

/** Where a PNG colour can live in the act palette. Entry 0 is excluded: it never
 *  draws, so an opaque pixel can never be spelled with it. */
interface Candidate { line: number; entry: number }

/**
 * Map a decoded indexed PNG onto an act's palette.
 *
 * `transparentIndex` is the PNG's own tRNS-declared transparent entry, or null.
 * It maps to canvas index 0, which is transparent in every line — so a
 * transparent pixel constrains nothing and a cell of one colour on transparency
 * stays a one-line cell.
 */
export function importPngAgainstPalette(
  png: DecodedIndexedPng, actPalette: number[],
): PngImportResult {
  const { width, height, indices, palette, transparentIndex } = png;

  // 1 · Snap every PNG colour into the Genesis 3-bit space, then find every
  //     (line, entry) that holds it.
  const candidates: Candidate[][] = [];
  const snappedWords: number[] = [];
  let snappedColours = 0;
  for (let i = 0; i < palette.length; i++) {
    const word = encodeGenesisColor(palette[i]);
    snappedWords.push(word);
    // A colour is "snapped" when the 3-bit round trip moved it — worth counting
    // because it is the difference between the artist's colour and the one the
    // hardware can hold, and they should be told rather than surprised.
    const rt = encodeGenesisColor(genesisRgb(word));
    if (rt !== word || !isExactGenesis(palette[i])) snappedColours++;
    const found: Candidate[] = [];
    for (let line = 0; line < CANVAS_LINES; line++) {
      for (let entry = 1; entry < CANVAS_LINE_LENGTH; entry++) {
        if (actPalette[line * CANVAS_LINE_LENGTH + entry] === word) found.push({ line, entry });
      }
    }
    candidates.push(found);
  }

  // 2 · Which PNG colours are actually USED? A palette entry nothing draws with
  //     must not be able to refuse the import — plenty of exports carry a full
  //     256-entry PLTE for a picture using nine colours.
  const used = new Set<number>();
  for (let i = 0; i < indices.length; i++) used.add(indices[i]);

  const homeless: number[] = [];
  for (const idx of used) {
    if (idx === transparentIndex) continue;
    if (idx >= palette.length) continue; // out-of-range index; folded to 0 below
    if (candidates[idx].length === 0) homeless.push(snappedWords[idx]);
  }
  if (homeless.length) {
    return { ok: false, refusal: { kind: 'colour-not-in-act', colours: [...new Set(homeless)].sort((a, b) => a - b) } };
  }

  // 3 · Per 8x8 cell, the lines that can express EVERYTHING in it.
  const data = new Uint8Array(width * height);
  const bad: { x: number; y: number }[] = [];
  const cellLine = new Map<number, number>();
  const lineDemand = new Array<number>(CANVAS_LINES).fill(0);

  const cellsWide = Math.ceil(width / CELL), cellsHigh = Math.ceil(height / CELL);
  const viableOf: (number[] | null)[] = new Array(cellsWide * cellsHigh).fill(null);

  const isDrawn = (idx: number) => idx !== transparentIndex && idx < palette.length;

  for (let cy = 0; cy < cellsHigh; cy++) {
    for (let cx = 0; cx < cellsWide; cx++) {
      let mask = (1 << CANVAS_LINES) - 1;
      let any = false;
      for (let y = cy * CELL; y < Math.min((cy + 1) * CELL, height); y++) {
        for (let x = cx * CELL; x < Math.min((cx + 1) * CELL, width); x++) {
          const idx = indices[y * width + x];
          if (!isDrawn(idx)) continue;
          any = true;
          let m = 0;
          for (const c of candidates[idx]) m |= 1 << c.line;
          mask &= m;
        }
      }
      const viable: number[] = [];
      if (any) { for (let l = 0; l < CANVAS_LINES; l++) if (mask & (1 << l)) viable.push(l); }
      else viable.push(...Array.from({ length: CANVAS_LINES }, (_, l) => l)); // blank cell: any line
      if (viable.length === 0) { bad.push({ x: cx * CELL, y: cy * CELL }); continue; }
      viableOf[cy * cellsWide + cx] = viable;
      for (const l of viable) lineDemand[l]++;
    }
  }
  if (bad.length) return { ok: false, refusal: { kind: 'cell-needs-two-lines', cells: bad } };

  // 4 · Choose. Among a cell's viable lines take the one viable for the MOST
  //     cells overall, ties to the lowest index. Deterministic, and it pulls the
  //     whole sheet toward one line where the palette allows — which keeps the
  //     block count down, since a block cell's line is part of its identity.
  for (let i = 0; i < viableOf.length; i++) {
    const viable = viableOf[i];
    if (!viable) continue;
    let best = viable[0];
    for (const l of viable) if (lineDemand[l] > lineDemand[best]) best = l;
    cellLine.set(i, best);
  }

  // 5 · Emit canvas index space.
  const usedLines = new Set<number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = indices[y * width + x];
      if (!isDrawn(idx)) { data[y * width + x] = 0; continue; }
      const line = cellLine.get(Math.floor(y / CELL) * cellsWide + Math.floor(x / CELL)) ?? 0;
      // Lowest entry in the chosen line holding this colour. A colour repeated
      // inside one line is the same pixel either way, so the lowest is as good
      // as any and makes the mapping reproducible.
      let entry = 0;
      for (const c of candidates[idx]) {
        if (c.line !== line) continue;
        if (entry === 0 || c.entry < entry) entry = c.entry;
      }
      data[y * width + x] = canvasIndex(line, entry);
      if (entry !== 0) usedLines.add(line);
    }
  }

  return {
    ok: true,
    result: {
      pixels: { width, height, data },
      usedLines: [...usedLines].sort((a, b) => a - b),
      snappedColours,
    },
  };
}

/** The RGB a CRAM word renders as — the inverse of encodeGenesisColor's 3-bit
 *  quantisation, used only to detect whether a colour moved. */
function genesisRgb(word: number): { r: number; g: number; b: number } {
  const to8 = (v: number) => Math.round(v * 255 / 7);
  return {
    r: to8((word >> 1) & 0x7),
    g: to8((word >> 5) & 0x7),
    b: to8((word >> 9) & 0x7),
  };
}

/** Whether a colour already sits exactly on the Genesis 3-bit grid. */
function isExactGenesis(c: { r: number; g: number; b: number }): boolean {
  const on = (v: number) => Math.round(v * 7 / 255) * 255 / 7 === v;
  return on(c.r) && on(c.g) && on(c.b);
}
