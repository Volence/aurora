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
// `entry === 0` is TRANSPARENT in every line for plane and sprite pixels —
// hardware, not a convention (see TRANSPARENT_INDEX in
// src/renderer/components/art-shared/palette-grid-model.ts). The backdrop
// colour proper is a separately selected CRAM entry (VDP register 7); what
// matters for this module is only that entry 0 never draws, in any of the four
// lines — so 0, 16, 32 and 48 would all be the same transparent pixel, and any
// value above 63 is simply corrupt (the encoding is 6 bits wide, full stop). A
// document that holds two spellings of one colour breaks every downstream
// comparison in a way that looks plausible: `diffWrites` reports edits that
// changed nothing, a per-cell palette-line scan (2B) sees a clash between two
// lines where the artist drew only transparency, and tile dedup (2C) misses
// byte-identical tiles. So the document holds ONE spelling per colour, and
// `normalizeCanvasPixels` is the choke point every path that can introduce a
// foreign value must pass through: a decoded PNG, a paste, a fill seeded from a
// picked value. An out-of-range value should never arrive in practice — the
// file-format layer refuses an over-large palette before this point — but it is
// folded into the space rather than trusted, same as any other hostile input.
//
// Pure core — no store, no fs, no React.

import type { PixelBuffer } from './pixel-ops';
import { createBuffer, clonePixelBuffer } from './pixel-ops';
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

/** The stored index for a (line, entry) pair — the ONE constructor. Masks both
 *  fields, so it is also the fold for anything outside the 6-bit domain, and
 *  entry 0 collapses to CANVAS_TRANSPARENT whatever line it came from. */
export function canvasIndex(line: number, entry: number): number {
  const e = entry & (CANVAS_LINE_LENGTH - 1);
  if (e === 0) return CANVAS_TRANSPARENT;
  return ((line & (CANVAS_LINES - 1)) << 4) | e;
}

/**
 * Rewrite every pixel to its canonical spelling by routing it back through
 * `canvasIndex` — the ONE constructor (see its doc comment) — rather than
 * special-casing the transparent spellings alone. That closes the whole 6-bit
 * domain in one pass: foreign transparent spellings (16/32/48 -> 0) and any
 * value above 63 (corrupt input, e.g. a raw PNG index) are the same bug through
 * two different doors, so they get the same fix. Returns the SAME buffer when
 * nothing needed fixing, to skip the copy on the common clean path — most
 * strokes are already canonical, and paying for an allocation on every one of
 * them just to re-check that would be wasted work — and never mutates the
 * input, which the store relies on for undo.
 */
export function normalizeCanvasPixels(buf: PixelBuffer): PixelBuffer {
  // One definition of "canonical", used by both passes below, so the scan and
  // the rewrite can never quietly disagree about what they are checking for.
  const canonical = (v: number): number => canvasIndex(paletteLineOf(v), paletteEntryOf(v));

  let dirty = false;
  for (let i = 0; i < buf.data.length; i++) {
    if (canonical(buf.data[i]) !== buf.data[i]) { dirty = true; break; }
  }
  if (!dirty) return buf;

  const data = new Uint8Array(buf.data.length);
  for (let i = 0; i < data.length; i++) data[i] = canonical(buf.data[i]);
  return { width: buf.width, height: buf.height, data };
}

/** 64 CRAM words, all black — the sprite editor's blankStandalonePalette (which
 *  returns Color[] with alpha, not CRAM words — same idea, different
 *  representation) at canvas scale. A canvas created inside an open zone is
 *  seeded from that zone's palette instead (canvasStore.newCanvas); this is
 *  the fallback. */
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
  /** 64 CRAM words, line-major: palette[line * 16 + entry]. A third shape
   *  alongside the sprite editor's Color[] (r/g/b/a) and LevelDoc's
   *  Uint16Array[] (palettes) — flat number[] because that is what the
   *  canvas's JSON sidecar stores a palette as. */
  palette: number[];
  profileId: ConstraintProfileId;
  /** Where the profile's grids start, so guides can align to the art rather
   *  than to the canvas corner. */
  gridOrigin: { originX: number; originY: number };
}

const MIN_SIDE = 8;
// Snapshot cost, not anything about the art, sets this ceiling: the canvas's
// undo history (CanvasDocHistory, a later task — not built yet) keeps 40
// whole-buffer snapshots. 1024x1024 is ~1 MB per snapshot and ~40 MB of
// history — already a lot to hold across 40 undo steps; there is no reason for
// a single free-size canvas to need to go further than that.
const MAX_SIDE = 1024;

export function blankCanvasDoc(input: {
  name: string; width: number; height: number;
  profileId: ConstraintProfileId; palette?: number[];
}): CanvasDoc {
  const width = Math.min(MAX_SIDE, Math.max(MIN_SIDE, input.width | 0));
  const height = Math.min(MAX_SIDE, Math.max(MIN_SIDE, input.height | 0));
  const palette = input.palette && input.palette.length === CANVAS_COLORS
    ? input.palette.slice()
    : blankCanvasPalette();
  return {
    name: input.name,
    pixels: createBuffer(width, height),
    palette,
    profileId: input.profileId,
    gridOrigin: { originX: 0, originY: 0 },
  };
}

/** Deep copy — the store's document clone needs one. */
export function cloneCanvasDoc(d: CanvasDoc): CanvasDoc {
  return {
    name: d.name,
    pixels: clonePixelBuffer(d.pixels),
    palette: d.palette.slice(),
    profileId: d.profileId,
    gridOrigin: { ...d.gridOrigin },
  };
}
