// src/core/art/palette-suggest.ts
//
// AN IMAGE -> A PALETTE LINE IT COULD BE DRAWN WITH. Median-cut quantization to
// 15 colours plus transparent (ROADMAP §4.9).
//
// WHY 15 AND NOT 16. Entry 0 of a Genesis palette line never draws — it is the
// transparent index in every line (canvas-doc.ts's `CANVAS_TRANSPARENT`), so a
// suggestion that spent it on a colour would be proposing a palette one of
// whose swatches the hardware refuses to show.
//
// WHY THE QUANTIZER WORKS IN 3-BIT SPACE RATHER THAN CONVERTING AT THE END.
// The hardware has eight levels per channel and the suggestion is a proposal
// about hardware colours, so the boxes are cut over the colours the hardware
// can actually hold. Quantizing in 8-bit and rounding afterwards asks the wrong
// question twice over: it spends splits separating colours that are the SAME
// Genesis colour (a 24-bit gradient across one 3-bit step is one swatch, not
// fifteen), and it lets two boxes chosen to be far apart in 8-bit collapse onto
// one word on the way out — which is how a "15-colour" suggestion arrives with
// nine visible colours in it. Levels come from `genesisLevel`, the same
// rounding `encodeGenesisColor` uses, so a colour this proposes is exactly the
// colour `png-import.ts` will later look for.
//
// It suggests; it does not apply. Nothing here writes a document.
//
// Pure core — no store, no fs, no React, no DOM.

import { CANVAS_LINE_LENGTH } from './canvas-doc';
import { paletteLuminance } from './canvas-default-palette';
import { genesisLevel, genesisWordFromLevels } from '../formats/palette';
import { OPAQUE_ALPHA_MIN } from './sheet-slice';
import type { SheetImage } from './sheet-slice';

/** Colours a line can hold besides the transparent entry 0. */
export const SUGGESTABLE_COLOURS = CANVAS_LINE_LENGTH - 1;

export interface SuggestedPalette {
  /** `CANVAS_LINE_LENGTH` CRAM words. Entry 0 is 0 (transparent); entries
   *  1..`colours` carry the suggestion, darkest first; any entry past that is
   *  0 and means "unused", not "black". */
  line: number[];
  /** How many of entries 1.. are real. Below 15 only when the image did not
   *  contain 15 distinguishable Genesis colours. */
  colours: number;
  /** Distinct Genesis colours in the source, after 3-bit snapping. This is the
   *  number the suggestion is a reduction OF — a caller showing "15 colours"
   *  without it cannot say whether anything was lost. */
  distinctColours: number;
  /** Opaque pixels the quantizer saw. 0 means the image was fully transparent
   *  and there is no suggestion — `colours` is 0 and a caller must say so
   *  rather than showing an all-black line. */
  opaquePixels: number;
}

/** A colour's index in the 512-entry 3-bit histogram. */
const keyOf = (r: number, g: number, b: number) => (b << 6) | (g << 3) | r;
const rOf = (k: number) => k & 7;
const gOf = (k: number) => (k >> 3) & 7;
const bOf = (k: number) => (k >> 6) & 7;
const CHANNEL = [rOf, gOf, bOf] as const;

interface Box {
  /** Histogram keys in this box, ascending. */
  keys: number[];
  /** Pixels across those keys. */
  count: number;
}

/**
 * Propose a palette line for `image`.
 *
 * Pixels below `OPAQUE_ALPHA_MIN` are ignored: they will be drawn with entry 0,
 * which the suggestion is not allowed to spend anyway. A fully transparent
 * image therefore yields `colours: 0` rather than an arbitrary line.
 */
export function suggestPaletteLine(image: SheetImage): SuggestedPalette {
  const histogram = new Uint32Array(512);
  let opaquePixels = 0;
  const { data } = image;
  const pixels = image.width * image.height;
  for (let p = 0; p < pixels; p++) {
    const o = p * 4;
    if (data[o + 3] < OPAQUE_ALPHA_MIN) continue;
    opaquePixels++;
    histogram[keyOf(genesisLevel(data[o]), genesisLevel(data[o + 1]), genesisLevel(data[o + 2]))]++;
  }

  const keys: number[] = [];
  for (let k = 0; k < histogram.length; k++) if (histogram[k] > 0) keys.push(k);

  const words = pickRepresentatives(splitBoxes(keys, histogram), histogram);
  words.sort((a, b) => (paletteLuminance(a) - paletteLuminance(b)) || (a - b));

  const line = new Array<number>(CANVAS_LINE_LENGTH).fill(0);
  for (let i = 0; i < words.length; i++) line[i + 1] = words[i];

  return { line, colours: words.length, distinctColours: keys.length, opaquePixels };
}

/**
 * Median cut, down to at most `SUGGESTABLE_COLOURS` boxes.
 *
 * The box split next is the most POPULOUS splittable one, so the colours the
 * image actually spends its pixels on get the resolution — a 4-pixel specular
 * dot does not earn the same share of a 15-colour line as the sky behind it.
 * Ties go to the box holding the lowest key, and the cut runs along the box's
 * longest axis (ties in axis order r, g, b) at the population median. Every
 * rule here has a stated tie-break because the whole function must be a
 * function of the histogram alone.
 */
function splitBoxes(keys: number[], histogram: Uint32Array): Box[] {
  if (keys.length === 0) return [];
  const total = keys.reduce((n, k) => n + histogram[k], 0);
  const boxes: Box[] = [{ keys, count: total }];

  while (boxes.length < SUGGESTABLE_COLOURS) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].keys.length < 2) continue;
      if (pick < 0 || boxes[i].count > boxes[pick].count) pick = i;
    }
    if (pick < 0) break;

    const box = boxes[pick];
    const axis = longestAxis(box.keys);
    const at = CHANNEL[axis];
    const sorted = box.keys.slice().sort((a, b) => (at(a) - at(b)) || (a - b));

    // Cut where the running population first reaches half. The first key is
    // always consumed and the last never is, so both halves are non-empty even
    // when one colour holds nearly every pixel — otherwise a box with a
    // dominant colour would split into itself and spin.
    let running = 0;
    let k = 0;
    while (k < sorted.length - 1 && running * 2 < box.count) running += histogram[sorted[k++]];

    const lower = sorted.slice(0, k);
    const upper = sorted.slice(k);
    boxes.splice(pick, 1,
      { keys: lower.sort((a, b) => a - b), count: lower.reduce((n, x) => n + histogram[x], 0) },
      { keys: upper.sort((a, b) => a - b), count: upper.reduce((n, x) => n + histogram[x], 0) });
  }
  return boxes;
}

/** The channel with the widest spread across `keys`; r, then g, then b on a tie. */
function longestAxis(keys: number[]): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  let bestSpread = -1;
  for (const axis of [0, 1, 2] as const) {
    let lo = 7;
    let hi = 0;
    for (const k of keys) {
      const v = CHANNEL[axis](k);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo > bestSpread) { bestSpread = hi - lo; best = axis; }
  }
  return best;
}

/**
 * One CRAM word per box: the population-weighted mean of its colours, rounded
 * back onto the 3-bit grid — which is inside the box by construction.
 *
 * COLLISIONS ARE REPAIRED, NOT EMITTED. Two adjacent boxes can round to the
 * same word, and a line with two identical swatches is two squares in the
 * palette grid the artist cannot tell apart and one wasted entry (the same
 * failure `canvas-default-palette.ts` hue-shifts its ramps to avoid). A
 * colliding box falls back to its own most-populous colour that nothing has
 * claimed yet; if every colour it holds is taken, the box really is a duplicate
 * of one already emitted and is dropped — which is why `colours` can come back
 * below 15 for an image with more than 15 distinct colours in it.
 */
function pickRepresentatives(boxes: Box[], histogram: Uint32Array): number[] {
  const taken = new Set<number>();
  const out: number[] = [];
  for (const box of boxes) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const k of box.keys) {
      const n = histogram[k];
      r += rOf(k) * n;
      g += gOf(k) * n;
      b += bOf(k) * n;
    }
    let word = genesisWordFromLevels(
      Math.round(r / box.count), Math.round(g / box.count), Math.round(b / box.count));

    if (taken.has(word)) {
      const fallback = box.keys.slice()
        .sort((x, y) => (histogram[y] - histogram[x]) || (x - y))
        .map((k) => genesisWordFromLevels(rOf(k), gOf(k), bOf(k)))
        .find((w) => !taken.has(w));
      if (fallback === undefined) continue;
      word = fallback;
    }
    taken.add(word);
    out.push(word);
  }
  return out;
}
