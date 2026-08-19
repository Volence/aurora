// src/core/art/__tests__/sheet-import.test.ts
//
// The half of sheet import that has no dialog in it. Everything here used to sit
// inside `loadSheetForAct`, behind `window.api.selectFile` — which is exactly why
// none of it had a test.

import { describe, it, expect } from 'vitest';
import { flattenActPalette, sheetFromBytes, explainSheetRefusal } from '../sheet-import';
import { encodeIndexedPngForTest } from './helpers/indexed-png-fixture';
import type { LevelDoc } from '../../level-classic/model';

/** A LevelDoc carrying only what sheet import reads: four palette lines. */
function docWithPalette(words: number[]): LevelDoc {
  const palettes = [0, 1, 2, 3].map((l) => Uint16Array.from(words.slice(l * 16, l * 16 + 16)));
  return { palettes } as unknown as LevelDoc;
}

const BLACK = 0x0000;
const RED = 0x000e;
const GREEN = 0x00e0;

describe('flattenActPalette', () => {
  it('flattens four lines line-major into 64 words', () => {
    const words = Array.from({ length: 64 }, (_, i) => i);
    expect(flattenActPalette(docWithPalette(words))).toEqual(words);
  });

  it('fills a short or missing line with 0 rather than undefined', () => {
    const doc = { palettes: [Uint16Array.from([1, 2])] } as unknown as LevelDoc;
    const flat = flattenActPalette(doc);
    expect(flat).toHaveLength(64);
    expect(flat[0]).toBe(1);
    expect(flat[2]).toBe(0);
    expect(flat[63]).toBe(0);
  });
});

describe('sheetFromBytes', () => {
  it('maps an indexed PNG whose colours are all in the act', async () => {
    const words = Array.from({ length: 64 }, (_, i) => (i === 1 ? RED : BLACK));
    const png = encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }],
      indices: new Uint8Array(64).fill(1),
    });
    const res = await sheetFromBytes(docWithPalette(words), png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sheet.pixels.width).toBe(8);
    expect(res.sheet.palette).toHaveLength(64);
    expect(res.sheet.usedLines).toEqual([0]);
  });

  it('refuses a colour the act does not have, naming the colour', async () => {
    const png = encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }],
      indices: new Uint8Array(64).fill(1),
    });
    const res = await sheetFromBytes(docWithPalette(new Array(64).fill(BLACK)), png);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.refusal.kind).toBe('colour-not-in-act');
    expect(explainSheetRefusal(res.refusal)).toMatch(/colours the act does not have/);
  });

  it('refuses an 8x8 cell that mixes colours from two palette lines', async () => {
    // PLANTED: two colours that exist, but only in DIFFERENT lines, inside one
    // cell. Line 0 entry 1 is red; line 1 entry 1 is green; no line holds both.
    const words = new Array(64).fill(BLACK);
    words[1] = RED;        // line 0, entry 1
    words[16 + 1] = GREEN; // line 1, entry 1
    const indices = new Uint8Array(64).fill(1);
    indices[0] = 2;        // one pixel of the other colour, same 8x8 cell
    const png = encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }, { r: 0, g: 0xee, b: 0 }],
      indices,
    });
    const res = await sheetFromBytes(docWithPalette(words), png);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.refusal.kind).toBe('cell-needs-two-lines');
    expect(explainSheetRefusal(res.refusal)).toMatch(/one line/);
  });

  it('throws, rather than refusing, on bytes that are not a PNG', async () => {
    await expect(sheetFromBytes(docWithPalette(new Array(64).fill(BLACK)), new Uint8Array([1, 2, 3])))
      .rejects.toThrow(/INDEXED/);
  });
});
