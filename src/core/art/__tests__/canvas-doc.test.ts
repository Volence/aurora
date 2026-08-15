// src/core/art/__tests__/canvas-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
  CANVAS_LINES, CANVAS_LINE_LENGTH, CANVAS_COLORS,
  canvasIndex, paletteLineOf, paletteEntryOf, isTransparent,
  normalizeTransparent, blankCanvasPalette, blankCanvasDoc,
} from '../canvas-doc';
import { createBuffer } from '../pixel-ops';

describe('canvas pixel encoding', () => {
  it('packs line and entry into one 0..63 index', () => {
    expect(canvasIndex(0, 1)).toBe(1);
    expect(canvasIndex(1, 1)).toBe(17);
    expect(canvasIndex(3, 15)).toBe(63);
    expect(paletteLineOf(63)).toBe(3);
    expect(paletteEntryOf(63)).toBe(15);
    expect(paletteLineOf(17)).toBe(1);
    expect(paletteEntryOf(17)).toBe(1);
  });

  it('collapses every line-0 entry to the single transparent index', () => {
    // 0, 16, 32 and 48 would all draw the backdrop. Four spellings of one
    // colour is the bug this prevents.
    expect(canvasIndex(1, 0)).toBe(0);
    expect(canvasIndex(2, 0)).toBe(0);
    expect(canvasIndex(3, 0)).toBe(0);
    for (const v of [0, 16, 32, 48]) expect(isTransparent(v)).toBe(true);
    expect(isTransparent(1)).toBe(false);
  });

  it('normalizeTransparent rewrites foreign spellings and nothing else', () => {
    const buf = createBuffer(4, 1);
    buf.data.set([0, 16, 48, 17]);
    const out = normalizeTransparent(buf);
    expect(Array.from(out.data)).toEqual([0, 0, 0, 17]);
  });

  it('normalizeTransparent returns the SAME buffer when nothing needed fixing', () => {
    // Identity matters: the store compares by reference to decide whether an
    // edit happened at all.
    const buf = createBuffer(4, 1);
    buf.data.set([0, 1, 17, 63]);
    expect(normalizeTransparent(buf)).toBe(buf);
  });

  it('a blank palette is 64 words and a blank doc is all-transparent', () => {
    expect(CANVAS_LINES).toBe(4);
    expect(CANVAS_LINE_LENGTH).toBe(16);
    expect(CANVAS_COLORS).toBe(64);
    expect(blankCanvasPalette()).toHaveLength(64);
    const doc = blankCanvasDoc({ name: 'Test', width: 24, height: 16, profileId: 'genesis-level-art' });
    expect(doc.pixels.width).toBe(24);
    expect(doc.pixels.height).toBe(16);
    expect(doc.pixels.data.every((v) => v === 0)).toBe(true);
    expect(doc.palette).toHaveLength(64);
    expect(doc.grid).toEqual({ originX: 0, originY: 0 });
  });

  it('a blank doc clamps a nonsense size instead of producing a 0-pixel buffer', () => {
    const doc = blankCanvasDoc({ name: 'T', width: 0, height: -5, profileId: 'none' });
    expect(doc.pixels.width).toBeGreaterThanOrEqual(8);
    expect(doc.pixels.height).toBeGreaterThanOrEqual(8);
  });
});
