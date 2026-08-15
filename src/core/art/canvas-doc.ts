// src/core/art/canvas-doc.ts
//
// The origination canvas document (spec §4.1): a free-size indexed image whose
// pixels index the WHOLE Genesis colour space — 4 palette lines x 16 colours —
// rather than one 16-colour line. That is the single thing that makes it a place
// to ORIGINATE art rather than a second sprite editor.
//
// THE PIXEL ENCODING, stated once.  A pixel is `(line << 4) | entry`, 0..63:
//     line  = v >> 4   (0..3)   which palette line it draws from
//     entry = v & 15   (0..15)  the colour within that line
//
// `entry === 0` is the BACKDROP in every line — hardware, not a convention (see
// TRANSPARENT_INDEX in components/art-shared/palette-grid-model.ts) — so 0, 16,
// 32 and 48 would all be the same transparent pixel. A document that holds four
// spellings of one colour breaks every downstream comparison in a way that looks
// plausible: `diffWrites` reports edits that changed nothing, a per-cell palette-
// line scan (2B) sees a clash between two lines where the artist drew only
// transparency, and tile dedup (2C) misses byte-identical tiles. So the document
// holds ONE spelling — 0 — and `normalizeTransparent` is the choke point every
// path that can introduce a foreign value must pass through: a decoded PNG, a
// paste, a fill seeded from a picked value.
//
// Pure core — no store, no fs, no React.

import type { PixelBuffer } from './pixel-ops';
import { createBuffer } from './pixel-ops';
import type { ConstraintProfileId } from './canvas-profiles';

/** Palette lines in the Genesis colour space. Hardware. */
export const CANVAS_LINES = 4;
/** Colours per line. Hardware. (Restated rather than imported: the existing
 *  LINE_LENGTH lives in a renderer component module, and core must not import
 *  the renderer.) */
export const CANVAS_LINE_LENGTH = 16;
export const CANVAS_COLORS = CANVAS_LINES * CANVAS_LINE_LENGTH; // 64

/** The one transparent index (see the header). */
export const CANVAS_TRANSPARENT = 0;

export function paletteLineOf(v: number): number { return (v >> 4) & (CANVAS_LINES - 1); }
export function paletteEntryOf(v: number): number { return v & (CANVAS_LINE_LENGTH - 1); }
export function isTransparent(v: number): boolean { return paletteEntryOf(v) === 0; }

/** The stored index for a (line, entry) pair — the ONE constructor. Entry 0
 *  collapses to CANVAS_TRANSPARENT whatever line it came from. */
export function canvasIndex(line: number, entry: number): number {
  const e = entry & (CANVAS_LINE_LENGTH - 1);
  if (e === 0) return CANVAS_TRANSPARENT;
  return ((line & (CANVAS_LINES - 1)) << 4) | e;
}

/**
 * Rewrite foreign spellings of transparency (16/32/48) to 0. Returns the SAME
 * buffer when nothing needed fixing — callers compare by reference to decide
 * whether anything actually changed.
 */
export function normalizeTransparent(buf: PixelBuffer): PixelBuffer {
  let dirty = false;
  for (let i = 0; i < buf.data.length; i++) {
    if (buf.data[i] !== 0 && isTransparent(buf.data[i])) { dirty = true; break; }
  }
  if (!dirty) return buf;
  const data = new Uint8Array(buf.data);
  for (let i = 0; i < data.length; i++) if (isTransparent(data[i])) data[i] = CANVAS_TRANSPARENT;
  return { width: buf.width, height: buf.height, data };
}

/** 64 CRAM words, all black — the sprite editor's blankStandalonePalette at
 *  canvas scale. A canvas created inside an open zone is seeded from that zone's
 *  palette instead (canvasStore.newCanvas); this is the fallback. */
export function blankCanvasPalette(): number[] {
  return new Array(CANVAS_COLORS).fill(0);
}

/**
 * ONE canvas document. Everything here belongs to a particular canvas. Tool/view
 * state (tool, zoom, brush) is NOT here — it belongs to the editor, which shows
 * one document at a time (same split as SpriteDoc).
 */
export interface CanvasDoc {
  name: string;
  /** Indices 0..63, normalized (see the header). */
  pixels: PixelBuffer;
  /** 64 CRAM words, line-major: palette[line * 16 + entry]. */
  palette: number[];
  profileId: ConstraintProfileId;
  /** Where the profile's grids start, so guides can align to the art rather
   *  than to the canvas corner. */
  grid: { originX: number; originY: number };
}

const MIN_SIDE = 8;

export function blankCanvasDoc(input: {
  name: string; width: number; height: number;
  profileId: ConstraintProfileId; palette?: number[];
}): CanvasDoc {
  const width = Math.max(MIN_SIDE, input.width | 0);
  const height = Math.max(MIN_SIDE, input.height | 0);
  const palette = input.palette && input.palette.length === CANVAS_COLORS
    ? input.palette.slice()
    : blankCanvasPalette();
  return {
    name: input.name,
    pixels: createBuffer(width, height),
    palette,
    profileId: input.profileId,
    grid: { originX: 0, originY: 0 },
  };
}

/** Deep copy — the undo snapshot and the store's document clone both need one. */
export function cloneCanvasDoc(d: CanvasDoc): CanvasDoc {
  return {
    name: d.name,
    pixels: { width: d.pixels.width, height: d.pixels.height, data: new Uint8Array(d.pixels.data) },
    palette: d.palette.slice(),
    profileId: d.profileId,
    grid: { ...d.grid },
  };
}
