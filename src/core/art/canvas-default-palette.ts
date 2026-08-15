// src/core/art/canvas-default-palette.ts
//
// The 64 colours a canvas gets when it is created with NO ZONE OPEN, plus the
// rule that picks which of a palette's entries the brush arms with.
//
// WHY THIS EXISTS (R18). `blankCanvasPalette()` returns 64 zero words — every
// colour black — and `canvasStore.paintIndex` defaults to `canvasIndex(0, 1)`,
// which in that palette is also black. So creating a canvas outside a zone used
// to hand the artist an invisible brush on an invisible surface, with nothing on
// screen to say why their strokes did not appear. Task 12's `closeAll` reset
// makes it likelier still: the paint index now returns to entry 1 on every
// project switch rather than possibly carrying a colour the artist had edited.
//
// WHY NOT FIX `blankCanvasPalette` INSTEAD. That function is also what pads a
// short PLTE on load, where "surplus entries are black" is a decision Task 5's
// review deliberately upheld: a `CanvasDoc` has no "unset" slot, so a magenta
// sentinel becomes indistinguishable from a chosen colour the first time the
// document round-trips through its own files. The visible default therefore
// lives here, with exactly one caller — the create flow, when there is no zone
// palette to seed from.
//
// WHAT THE RAMP IS. Four lines, each a 15-step shading ramp running dark
// shadow → mid tone → light highlight, interpolated in the Genesis' own 3-bit
// channel space and rounded to it (so every word is already canonical: no
// `encodeGenesisColor(decodeGenesisColor(w)) !== w` surprises for the PNG
// writer, which treats such a disagreement as evidence another tool rewrote the
// file).
//
// FIFTEEN STEPS MEANS FIFTEEN DIFFERENT COLOURS, and at 3 bits per channel that
// is a constraint on the anchors, not a free consequence of interpolating. A
// channel has eight levels, so a ramp whose three channels move in step
// delivers eight colours and seven duplicate swatches — two identical squares
// side by side in the palette grid that an artist clicks and cannot tell apart.
// The anchors below therefore HUE-SHIFT along the ramp (the shadows are tinted
// away from the highlights) so the channels cross their level boundaries at
// different steps, which is also what a hand-authored pixel-art ramp does for
// its own reasons. An earlier set looked reasonable and produced three
// duplicate adjacent pairs; the test asserts all fifteen are distinct AND that
// no two neighbours are equal, because "15 distinct" alone would accept a
// duplicate pair next to a compensating extra shade elsewhere.
//
// THE RAMP-PER-LINE SHAPE IS THE POINT, not decoration:
//
//   • The default profile is `genesis-level-art`, whose `cellPaletteRule` says
//     every 8x8 cell must draw from ONE palette line. A default palette laid out
//     as "16 assorted colours per line" would make the very first thing an
//     artist draws illegal under the profile the dialog defaults to. Here each
//     LINE on its own is a complete value ramp, so a whole cell — shadow,
//     midtone, highlight — can be drawn from one line and pass 2B's check.
//   • Value, not hue, is what pixel art is built out of. A ramp is what you
//     block a shape in with; a swatch grid of unrelated hues is not.
//   • Four families (neutral, warm, cool, foliage) cover the common Sonic-zone
//     subjects (rock/metal, earth/fire, sky/water, grass) well enough to start
//     drawing before anyone opens the palette editor — which is all a DEFAULT
//     has to do. It is a starting point, not a proposal about the artist's zone.
//
// Pure core — no store, no fs, no React.

import { CANVAS_COLORS, CANVAS_LINE_LENGTH, canvasIndex, paletteEntryOf } from './canvas-doc';
import { decodeGenesisColor } from '../formats/palette';

/** One channel triple in the Genesis' 3-bit-per-channel space (0..7 each). */
type Rgb3 = readonly [number, number, number];

interface LineRamp {
  /** Named so the reasoning survives a later edit to the numbers. */
  family: string;
  shadow: Rgb3;
  mid: Rgb3;
  highlight: Rgb3;
}

/**
 * The four lines, in the order they appear in the palette grid.
 *
 * Line 0 is the neutral one and is deliberately the one the brush arms from
 * (see `mostVisiblePaintIndex`): its highlight is pure white, which is the
 * strongest possible contrast against both the transparent checkerboard the
 * viewport draws and any dark art placed on it.
 *
 * The shadows are tinted rather than pure black (except line 0's, which IS the
 * black an outline needs) because an untinted shadow ramp reads as dirty at
 * 3 bits per channel — there are only eight levels per channel, so a shadow
 * that shares its hue with the midtone has nowhere to go.
 */
const LINE_RAMPS: readonly LineRamp[] = [
  // Neutral: black → mid grey → white. Outline, rock, metal, and the ramp you
  // reach for when you do not yet know what you are drawing.
  { family: 'neutral', shadow: [0, 0, 0], mid: [3, 3, 4], highlight: [7, 7, 7] },
  // Warm: earth, brick, fire, skin.
  { family: 'warm', shadow: [2, 0, 1], mid: [6, 3, 1], highlight: [7, 7, 4] },
  // Cool: sky, water, shadowed metal.
  { family: 'cool', shadow: [0, 0, 1], mid: [2, 4, 6], highlight: [6, 7, 7] },
  // Foliage: grass, leaves, moss.
  { family: 'foliage', shadow: [0, 1, 0], mid: [3, 6, 3], highlight: [7, 7, 6] },
];

function clamp3(v: number): number {
  return Math.max(0, Math.min(7, Math.round(v)));
}

function lerp3(a: Rgb3, b: Rgb3, t: number): Rgb3 {
  return [
    clamp3(a[0] + (b[0] - a[0]) * t),
    clamp3(a[1] + (b[1] - a[1]) * t),
    clamp3(a[2] + (b[2] - a[2]) * t),
  ];
}

/** A 3-bit triple as a CRAM word (0000 BBB0 GGG0 RRR0), the same layout
 *  `encodeGenesisColor` writes — built directly from 3-bit levels so no
 *  8-bit round trip can introduce an off-by-one. */
function cramWord(c: Rgb3): number {
  return (c[2] << 9) | (c[1] << 5) | (c[0] << 1);
}

/**
 * 64 CRAM words: four 15-step ramps, one per palette line.
 *
 * Entry 0 of every line is left at 0. It is the transparent index in all four
 * lines (hardware — see canvas-doc.ts), so it is never drawn and its word never
 * shows; writing anything else there would only invite someone to read the
 * swatch as a colour they can paint with.
 */
export function defaultCanvasPalette(): number[] {
  const palette = new Array<number>(CANVAS_COLORS).fill(0);
  for (let line = 0; line < LINE_RAMPS.length; line++) {
    const ramp = LINE_RAMPS[line];
    for (let entry = 1; entry < CANVAS_LINE_LENGTH; entry++) {
      // t runs 0..1 across entries 1..15; the mid anchor sits at t = 0.5, so the
      // two halves each get the same number of steps.
      const t = (entry - 1) / (CANVAS_LINE_LENGTH - 2);
      const c = t <= 0.5
        ? lerp3(ramp.shadow, ramp.mid, t * 2)
        : lerp3(ramp.mid, ramp.highlight, t * 2 - 1);
      palette[line * CANVAS_LINE_LENGTH + entry] = cramWord(c);
    }
  }
  return palette;
}

/** Perceived brightness of a CRAM word, 0..255. Rec. 601 weights — the same
 *  luma the eye uses to rank two colours, which is the question being asked
 *  here ("which of these would an artist actually SEE on this surface?"). */
export function paletteLuminance(word: number): number {
  const c = decodeGenesisColor(word);
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/**
 * TRUE when a palette has at least one non-transparent entry that is not black.
 *
 * The create flow's test for "can I seed from this?": a zone whose palettes are
 * all zero words (a level document mid-load, or a profile that resolved no
 * palette file) would otherwise reintroduce the exact black-on-black canvas
 * R18 exists to prevent, through the zone door rather than the blank-palette
 * one. Entry 0 of each line is excluded because it never draws.
 */
export function paletteHasVisibleColour(palette: readonly number[]): boolean {
  for (let i = 0; i < palette.length && i < CANVAS_COLORS; i++) {
    if (paletteEntryOf(i) === 0) continue;
    if (paletteLuminance(palette[i] ?? 0) > 0) return true;
  }
  return false;
}

/**
 * The brightest paintable entry of a palette — the index a NEWLY CREATED canvas
 * arms its brush with.
 *
 * "Brightest" rather than "entry 1" is the whole fix, and it is deliberately a
 * rule about the palette in hand rather than a constant: it lands on white in
 * the default ramp AND on something visible in a zone palette whose entry 1
 * happens to be black — which is common, since a zone's line 0 usually opens on
 * its darkest shades. A constant would only have moved R18's trap from the
 * fallback path onto the zone path.
 *
 * Index i IS `canvasIndex(line, entry)` because the palette is line-major
 * (canvas-doc.ts), so the loop counter can be returned directly. Entry 0 of each
 * line is skipped — arming it would arm the ERASER, which is the other half of
 * the same "the first stroke does nothing visible" bug.
 *
 * Falls back to `canvasIndex(0, 1)` — the store's own default — for a palette
 * with nothing visible in it at all, so the function is total.
 */
export function mostVisiblePaintIndex(palette: readonly number[]): number {
  let best = -1;
  let bestLuminance = -1;
  for (let i = 0; i < palette.length && i < CANVAS_COLORS; i++) {
    if (paletteEntryOf(i) === 0) continue;
    const lum = paletteLuminance(palette[i] ?? 0);
    if (lum > bestLuminance) { bestLuminance = lum; best = i; }
  }
  return best < 0 ? canvasIndex(0, 1) : best;
}
