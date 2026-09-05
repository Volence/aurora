// src/core/art/__tests__/palette-suggest.test.ts
//
// Every expectation is derived from the image the call was given or from the
// palette constants, never from a run of the quantizer. Nothing here pins a
// CRAM word the implementation happened to choose: what is asserted is that the
// word is LEGAL (a Genesis colour), that it is one the image could have
// produced, and that the line obeys the 15-plus-transparent shape.

import { describe, it, expect } from 'vitest';
import { suggestPaletteLine, SUGGESTABLE_COLOURS } from '../palette-suggest';
import { CANVAS_LINE_LENGTH, CANVAS_TRANSPARENT } from '../canvas-doc';
import {
  encodeGenesisColor, decodeGenesisColor, genesisLevel, genesisWordFromLevels, GENESIS_WORD_MASK,
} from '../../formats/palette';
import type { SheetImage } from '../sheet-slice';

/** An image whose pixels cycle through `colours`, opaque, plus `transparent`
 *  fully clear pixels the quantizer must ignore. */
function imageOf(colours: [number, number, number][], transparent = 0): SheetImage {
  const total = colours.length + transparent;
  const data = new Uint8ClampedArray(total * 4);
  colours.forEach((c, i) => {
    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = 255;
  });
  return { width: total, height: 1, data };
}

/** The distinct Genesis words an image's opaque pixels snap to. */
function wordsOf(colours: [number, number, number][]): Set<number> {
  return new Set(colours.map((c) => encodeGenesisColor({ r: c[0], g: c[1], b: c[2] })));
}

/** N distinct 3-bit colours, spread over the cube deterministically. */
function distinctLevels(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let k = 0; out.length < n && k < 512; k++) {
    const c = decodeGenesisColor(genesisWordFromLevels(k & 7, (k >> 3) & 7, (k >> 6) & 7));
    out.push([c.r, c.g, c.b]);
  }
  return out;
}

describe('suggestPaletteLine', () => {
  it('emits a full-length line whose entry 0 is transparent', () => {
    const s = suggestPaletteLine(imageOf(distinctLevels(40)));
    expect(s.line).toHaveLength(CANVAS_LINE_LENGTH);
    expect(s.line[CANVAS_TRANSPARENT]).toBe(0);
    expect(s.colours).toBe(SUGGESTABLE_COLOURS);
    expect(SUGGESTABLE_COLOURS).toBe(CANVAS_LINE_LENGTH - 1);
  });

  it('every suggested word is a legal Genesis colour: no dead bits set', () => {
    const s = suggestPaletteLine(imageOf(distinctLevels(200)));
    expect(s.colours).toBeGreaterThan(0);
    for (const w of s.line) {
      expect(w & ~GENESIS_WORD_MASK).toBe(0);
      // The bit-level round trip is what "already in the hardware space" means:
      // a word that had to be snapped on the way out would fail here.
      expect(encodeGenesisColor(decodeGenesisColor(w))).toBe(w);
    }
  });

  it('returns an image\'s own colours unchanged when it holds 15 or fewer', () => {
    const colours = distinctLevels(SUGGESTABLE_COLOURS);
    const s = suggestPaletteLine(imageOf(colours));
    expect(s.distinctColours).toBe(SUGGESTABLE_COLOURS);
    expect(s.colours).toBe(SUGGESTABLE_COLOURS);
    expect(new Set(s.line.slice(1))).toEqual(wordsOf(colours));
  });

  it('counts a 24-bit gradient inside one 3-bit step as ONE colour', () => {
    // Eight 8-bit reds that all snap to the same Genesis level: quantizing in
    // 8-bit would spend eight of fifteen entries here.
    const level = 3;
    const shades: [number, number, number][] = [];
    for (let v = 0; v < 256 && shades.length < 8; v++) {
      if (genesisLevel(v) === level) shades.push([v, 0, 0]);
    }
    expect(shades.length).toBeGreaterThan(1);
    const s = suggestPaletteLine(imageOf(shades));
    expect(s.distinctColours).toBe(1);
    expect(s.colours).toBe(1);
    expect(s.line[1]).toBe(genesisWordFromLevels(level, 0, 0));
    expect(s.line.slice(2).every((w) => w === 0)).toBe(true);
  });

  it('reduces a many-colour image to exactly 15 distinct entries', () => {
    const colours = distinctLevels(512);
    const s = suggestPaletteLine(imageOf(colours));
    expect(s.distinctColours).toBe(512);
    expect(s.colours).toBe(SUGGESTABLE_COLOURS);
    const used = s.line.slice(1, 1 + s.colours);
    expect(new Set(used).size).toBe(s.colours);
  });

  it('never emits the same swatch twice, on an image whose boxes DO collide', () => {
    // A tight cluster — 3 red levels x 4 green x 5 blue, cycling — is where two
    // median-cut boxes round to one word. Measured: with the collision repair in
    // `pickRepresentatives` removed, 820 of 4000 random clusters emit a
    // duplicate, and this fixture is one of the smallest deterministic cases.
    const px: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) {
      const c = decodeGenesisColor(genesisWordFromLevels(i % 3, i % 4, i % 5));
      px.push([c.r, c.g, c.b]);
    }
    const s = suggestPaletteLine(imageOf(px));
    expect(s.distinctColours).toBeGreaterThan(SUGGESTABLE_COLOURS);
    expect(s.colours).toBe(SUGGESTABLE_COLOURS);
    const used = s.line.slice(1, 1 + s.colours);
    expect(new Set(used).size).toBe(used.length);
  });

  it('orders the line darkest first, the way the default ramp reads', () => {
    const s = suggestPaletteLine(imageOf(distinctLevels(300)));
    const lum = (w: number) => {
      const c = decodeGenesisColor(w);
      return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    };
    for (let i = 2; i <= s.colours; i++) expect(lum(s.line[i])).toBeGreaterThanOrEqual(lum(s.line[i - 1]));
  });

  it('spends its entries where the pixels are, not where the colours are', () => {
    // The two families are deliberately arranged so the two candidate split
    // rules disagree: the reds are the larger family BY COLOUR COUNT, the blues
    // by a wide margin in PIXELS. Splitting the box with the most colours would
    // hand most of the line to the 40 reds the image spends 40 pixels on.
    const rgbOf = (r: number, g: number, b: number): [number, number, number] => {
      const c = decodeGenesisColor(genesisWordFromLevels(r, g, b));
      return [c.r, c.g, c.b];
    };
    const blueFamily: [number, number, number][] = [];
    for (let g = 0; g < 8; g++) for (const b of [6, 7]) blueFamily.push(rgbOf(0, g, b));
    const redFamily: [number, number, number][] = [];
    for (const r of [5, 6, 7]) for (let g = 0; g < 8; g++) for (const b of [0, 1]) redFamily.push(rgbOf(r, g, b));
    expect(redFamily.length).toBeGreaterThan(blueFamily.length);

    const pixels: [number, number, number][] = [];
    for (let rep = 0; rep < 100; rep++) pixels.push(...blueFamily);
    pixels.push(...redFamily);
    expect(pixels.length - redFamily.length).toBeGreaterThan(redFamily.length * 10);

    const s = suggestPaletteLine(imageOf(pixels));
    expect(s.distinctColours).toBe(blueFamily.length + redFamily.length);
    expect(s.colours).toBe(SUGGESTABLE_COLOURS);

    const isBlue = (w: number) => decodeGenesisColor(w).b > decodeGenesisColor(w).r;
    const blueEntries = s.line.slice(1, 1 + s.colours).filter(isBlue).length;
    expect(blueEntries).toBeGreaterThan(s.colours - blueEntries);
  });

  it('ignores transparent pixels entirely', () => {
    const colours = distinctLevels(5);
    const opaqueOnly = suggestPaletteLine(imageOf(colours));
    const padded = suggestPaletteLine(imageOf(colours, 500));
    expect(padded.opaquePixels).toBe(colours.length);
    expect(padded.line).toEqual(opaqueOnly.line);
    expect(padded.distinctColours).toBe(opaqueOnly.distinctColours);
  });

  it('says nothing rather than proposing black for a fully transparent image', () => {
    const s = suggestPaletteLine({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) });
    expect(s.opaquePixels).toBe(0);
    expect(s.distinctColours).toBe(0);
    expect(s.colours).toBe(0);
    expect(s.line).toEqual(new Array(CANVAS_LINE_LENGTH).fill(0));
  });

  it('is a function of the image alone: same pixels, same line', () => {
    const colours = distinctLevels(120);
    const a = suggestPaletteLine(imageOf(colours));
    const b = suggestPaletteLine(imageOf(colours));
    expect(b.line).toEqual(a.line);
    expect(a.colours).toBe(SUGGESTABLE_COLOURS);
  });
});
