// src/core/art/__tests__/canvas-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
  CANVAS_LINES, CANVAS_LINE_LENGTH, CANVAS_COLORS,
  canvasIndex, paletteLineOf, paletteEntryOf, isTransparent,
  normalizeCanvasPixels, blankCanvasPalette, blankCanvasDoc, cloneCanvasDoc,
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

  it('normalizeCanvasPixels rewrites foreign spellings and nothing else', () => {
    const buf = createBuffer(4, 1);
    buf.data.set([0, 16, 48, 17]);
    const out = normalizeCanvasPixels(buf);
    expect(Array.from(out.data)).toEqual([0, 0, 0, 17]);
    // The input itself is untouched — the store holds the previous buffer for
    // undo, so an in-place rewrite here would corrupt it.
    expect(Array.from(buf.data)).toEqual([0, 16, 48, 17]);
  });

  it('normalizeCanvasPixels folds a value outside the 6-bit domain', () => {
    // The encoding is 6 bits (2 line bits x 4 entry bits). 200 and 8 render
    // identically once masked but would store as different values if this
    // held open — the same "two spellings of one colour" bug the header
    // describes, entering through a different door (e.g. a raw PNG index).
    const buf = createBuffer(2, 1);
    buf.data.set([200, 8]);
    const out = normalizeCanvasPixels(buf);
    expect(Array.from(out.data)).toEqual([8, 8]);
  });

  it('normalizeCanvasPixels returns the SAME buffer when nothing needed fixing', () => {
    // Pins the allocation-avoidance path: an already-canonical buffer (the
    // common case — most strokes never touch a foreign spelling) must not pay
    // for a copy just to discover that.
    const buf = createBuffer(4, 1);
    buf.data.set([0, 1, 17, 63]);
    expect(normalizeCanvasPixels(buf)).toBe(buf);
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
    expect(doc.gridOrigin).toEqual({ originX: 0, originY: 0 });
  });

  it('a blank doc clamps a nonsense size instead of producing a 0-pixel buffer', () => {
    const doc = blankCanvasDoc({ name: 'T', width: 0, height: -5, profileId: 'none' });
    expect(doc.pixels.width).toBe(8);
    expect(doc.pixels.height).toBe(8);
  });

  it('a blank doc clamps an oversize request too: snapshot cost, not the art, sets the ceiling', () => {
    const doc = blankCanvasDoc({ name: 'T', width: 5000, height: 5000, profileId: 'none' });
    expect(doc.pixels.width).toBe(1024);
    expect(doc.pixels.height).toBe(1024);
  });

  it('does not alias the caller-supplied palette array', () => {
    const palette = blankCanvasPalette();
    const doc = blankCanvasDoc({ name: 'T', width: 8, height: 8, profileId: 'none', palette });
    palette[0] = 999;
    expect(doc.palette[0]).toBe(0);
  });
});

describe('cloneCanvasDoc', () => {
  it('is a deep copy: mutating every mutable field of the original leaves the clone unchanged', () => {
    const original = blankCanvasDoc({ name: 'T', width: 8, height: 8, profileId: 'none' });
    const clone = cloneCanvasDoc(original);

    original.pixels.data[0] = 42;
    original.palette[0] = 42;
    original.gridOrigin.originX = 42;

    expect(clone.pixels.data[0]).toBe(0);
    expect(clone.palette[0]).toBe(0);
    expect(clone.gridOrigin.originX).toBe(0);
  });
});
