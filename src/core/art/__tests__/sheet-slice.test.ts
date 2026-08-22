// src/core/art/__tests__/sheet-slice.test.ts
//
// Properties, not fixtures: every expectation here is either derived from the
// spec the call was made with, or recomputed from the image the call was given.
// A rect list is checked against the geometry that produced it, and every
// auto-bounds box is re-verified as TIGHT against the pixels — which is the one
// assertion that cannot pass on a blank sheet.

import { describe, it, expect } from 'vitest';
import {
  sliceGrid, sliceAutoBounds, OPAQUE_ALPHA_MIN, DEFAULT_MAX_REGIONS,
} from '../sheet-slice';
import type { SheetImage, FrameRect, GridSpec } from '../sheet-slice';

function blank(width: number, height: number): SheetImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function paint(img: SheetImage, x: number, y: number, rgba: [number, number, number, number]): void {
  const o = (y * img.width + x) * 4;
  img.data[o] = rgba[0];
  img.data[o + 1] = rgba[1];
  img.data[o + 2] = rgba[2];
  img.data[o + 3] = rgba[3];
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];

function fill(img: SheetImage, r: FrameRect, rgba: [number, number, number, number] = WHITE): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) paint(img, x, y, rgba);
}

const isLit = (img: SheetImage, x: number, y: number) =>
  img.data[(y * img.width + x) * 4 + 3] >= OPAQUE_ALPHA_MIN;

/** All four edges of `r` carry at least one lit pixel — i.e. the box cannot be
 *  shrunk on any side. Recomputed from the sheet, not from the slicer. */
function isTight(img: SheetImage, r: FrameRect): boolean {
  const rowLit = (y: number) => {
    for (let x = r.x; x < r.x + r.w; x++) if (isLit(img, x, y)) return true;
    return false;
  };
  const colLit = (x: number) => {
    for (let y = r.y; y < r.y + r.h; y++) if (isLit(img, x, y)) return true;
    return false;
  };
  return rowLit(r.y) && rowLit(r.y + r.h - 1) && colLit(r.x) && colLit(r.x + r.w - 1);
}

const unwrapGrid = (img: SheetImage, spec: GridSpec) => {
  const res = sliceGrid(img, spec);
  if (!res.ok) throw new Error(`expected a grid, got ${res.refusal.kind}: ${res.refusal.detail}`);
  return res.value;
};

const unwrapAuto = (img: SheetImage, spec = {}) => {
  const res = sliceAutoBounds(img, spec);
  if (!res.ok) throw new Error(`expected frames, got ${res.refusal.kind}: ${res.refusal.detail}`);
  return res.value;
};

describe('sliceGrid', () => {
  it('cuts a sheet that divides exactly into columns*rows cells, row-major', () => {
    const img = blank(32, 48);
    const spec = { cellWidth: 16, cellHeight: 16 };
    const g = unwrapGrid(img, spec);

    expect(g.columns).toBe(img.width / spec.cellWidth);
    expect(g.rows).toBe(img.height / spec.cellHeight);
    expect(g.frames).toHaveLength(g.columns * g.rows);
    // Row-major: index i sits at column i%columns, row floor(i/columns).
    g.frames.forEach((f, i) => {
      expect(f).toEqual({
        x: (i % g.columns) * spec.cellWidth,
        y: Math.floor(i / g.columns) * spec.cellHeight,
        w: spec.cellWidth,
        h: spec.cellHeight,
      });
    });
    expect(g.remainderX).toBe(0);
    expect(g.remainderY).toBe(0);
  });

  it('honours margin, spacing and offset in the cell origins', () => {
    const spec = { cellWidth: 8, cellHeight: 8, margin: 3, spacing: 2, offsetX: 1, offsetY: 4 };
    const img = blank(60, 60);
    const g = unwrapGrid(img, spec);

    expect(g.columns).toBeGreaterThan(1);
    expect(g.rows).toBeGreaterThan(1);
    const left = spec.margin + spec.offsetX;
    const top = spec.margin + spec.offsetY;
    for (const f of g.frames) {
      expect((f.x - left) % (spec.cellWidth + spec.spacing)).toBe(0);
      expect((f.y - top) % (spec.cellHeight + spec.spacing)).toBe(0);
      // Nothing crosses the margin on the far side either.
      expect(f.x + f.w).toBeLessThanOrEqual(img.width - spec.margin);
      expect(f.y + f.h).toBeLessThanOrEqual(img.height - spec.margin);
    }
  });

  it('DROPS a partial trailing cell and reports it as the remainder', () => {
    const spec = { cellWidth: 16, cellHeight: 16 };
    const exact = blank(32, 32);
    const ragged = { ...blank(32 + 7, 32 + 3) };

    const a = unwrapGrid(exact, spec);
    const b = unwrapGrid(ragged, spec);

    // The extra 7x3 of sheet buys no extra cell...
    expect(b.columns).toBe(a.columns);
    expect(b.rows).toBe(a.rows);
    expect(b.frames).toHaveLength(a.frames.length);
    // ...and is reported rather than swallowed.
    expect(b.remainderX).toBe(ragged.width - b.columns * spec.cellWidth);
    expect(b.remainderY).toBe(ragged.height - b.rows * spec.cellHeight);
    expect(b.remainderX).toBeGreaterThan(0);
    expect(b.remainderY).toBeGreaterThan(0);
    // Every emitted cell is the full declared size.
    for (const f of b.frames) {
      expect(f.w).toBe(spec.cellWidth);
      expect(f.h).toBe(spec.cellHeight);
      expect(f.x + f.w).toBeLessThanOrEqual(ragged.width);
      expect(f.y + f.h).toBeLessThanOrEqual(ragged.height);
    }
  });

  it('fits one more column exactly when the sheet grows by cell+spacing', () => {
    const spec = { cellWidth: 16, cellHeight: 16, spacing: 2 };
    const narrow = unwrapGrid(blank(34, 16), spec);
    const wider = unwrapGrid(blank(34 + spec.cellWidth + spec.spacing, 16), spec);
    expect(wider.columns).toBe(narrow.columns + 1);
    // One pixel short of that and the extra column is gone again.
    const short = unwrapGrid(blank(34 + spec.cellWidth + spec.spacing - 1, 16), spec);
    expect(short.columns).toBe(narrow.columns);
  });

  it('refuses a cell bigger than the sheet rather than returning zero frames', () => {
    const img = blank(16, 16);
    const res = sliceGrid(img, { cellWidth: 17, cellHeight: 16 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.refusal.kind).toBe('grid-empty');
    expect(res.refusal.detail).toContain('17x16');
  });

  it('refuses non-integer and non-positive geometry', () => {
    const img = blank(16, 16);
    for (const spec of [
      { cellWidth: 0, cellHeight: 8 },
      { cellWidth: 8, cellHeight: -8 },
      { cellWidth: 8.5, cellHeight: 8 },
      { cellWidth: 8, cellHeight: 8, margin: -1 },
      { cellWidth: 8, cellHeight: 8, spacing: 1.5 },
      { cellWidth: 8, cellHeight: 8, offsetX: -2 },
    ]) {
      const res = sliceGrid(img, spec);
      expect(res.ok, JSON.stringify(spec)).toBe(false);
      if (!res.ok) expect(res.refusal.kind).toBe('bad-geometry');
    }
  });
});

describe('sliceAutoBounds', () => {
  it('finds one tight box per separated blob, and sees the pixels it reports', () => {
    const img = blank(40, 40);
    const drawn: FrameRect[] = [
      { x: 2, y: 3, w: 5, h: 4 },
      { x: 20, y: 3, w: 7, h: 2 },
      { x: 10, y: 25, w: 3, h: 9 },
    ];
    for (const r of drawn) fill(img, r);

    const out = unwrapAuto(img);
    expect(out.frames).toHaveLength(drawn.length);
    expect(out.litPixels).toBe(drawn.reduce((n, r) => n + r.w * r.h, 0));
    for (const f of out.frames) {
      expect(isTight(img, f)).toBe(true);
      expect(f.pixels).toBe(f.w * f.h);
    }
    // Each drawn rect is present exactly once.
    for (const r of drawn) {
      expect(out.frames.filter((f) => f.x === r.x && f.y === r.y && f.w === r.w && f.h === r.h))
        .toHaveLength(1);
    }
  });

  it('orders frames top-to-bottom then left-to-right, and repeats that order', () => {
    const img = blank(64, 64);
    // Painted out of reading order on purpose.
    for (const r of [
      { x: 40, y: 40, w: 4, h: 4 },
      { x: 4, y: 40, w: 4, h: 4 },
      { x: 40, y: 4, w: 4, h: 4 },
      { x: 4, y: 4, w: 4, h: 4 },
      { x: 22, y: 4, w: 4, h: 4 },
    ]) fill(img, r);

    const first = unwrapAuto(img).frames;
    expect(first.length).toBe(5);
    for (let i = 1; i < first.length; i++) {
      const a = first[i - 1];
      const b = first[i];
      expect(a.y <= b.y).toBe(true);
      if (a.y === b.y) expect(a.x).toBeLessThan(b.x);
    }
    // Same input, same answer — the order is a function of the sheet.
    expect(unwrapAuto(img).frames).toEqual(first);
  });

  it('joins a diagonal touch under 8-connectivity and separates it under 4', () => {
    const img = blank(8, 8);
    paint(img, 2, 2, WHITE);
    paint(img, 3, 3, WHITE);

    const eight = unwrapAuto(img, { connectivity: 8, mergeOverlapping: false });
    expect(eight.frames).toHaveLength(1);
    expect(eight.frames[0]).toMatchObject({ x: 2, y: 2, w: 2, h: 2, pixels: 2 });

    const four = unwrapAuto(img, { connectivity: 4, mergeOverlapping: false });
    expect(four.frames).toHaveLength(2);
    expect(four.frames.every((f) => f.w === 1 && f.h === 1 && f.pixels === 1)).toBe(true);
  });

  it('folds a detached blob inside another blob\'s box into one frame', () => {
    const img = blank(32, 32);
    // A hollow ring and a dot floating in its hole: two components, one frame.
    const ring = { x: 4, y: 4, w: 12, h: 12 };
    fill(img, ring);
    fill(img, { x: 6, y: 6, w: 8, h: 8 }, [0, 0, 0, 0]);
    fill(img, { x: 9, y: 9, w: 2, h: 2 });

    const unmerged = unwrapAuto(img, { mergeOverlapping: false });
    expect(unmerged.frames).toHaveLength(2);

    const merged = unwrapAuto(img);
    expect(merged.frames).toHaveLength(1);
    expect(merged.frames[0]).toMatchObject(ring);
    expect(merged.frames[0].pixels).toBe(unmerged.frames.reduce((n, f) => n + f.pixels, 0));
    expect(isTight(img, merged.frames[0])).toBe(true);
  });

  it('treats a keyed background colour as background, and opaque art as art', () => {
    const img = blank(16, 16);
    const MAGENTA: [number, number, number, number] = [255, 0, 255, 255];
    fill(img, { x: 0, y: 0, w: 16, h: 16 }, MAGENTA);
    fill(img, { x: 5, y: 6, w: 3, h: 2 });

    // Under the alpha rule the whole sheet is one opaque blob...
    const byAlpha = unwrapAuto(img);
    expect(byAlpha.frames).toHaveLength(1);
    expect(byAlpha.frames[0]).toMatchObject({ x: 0, y: 0, w: 16, h: 16 });

    // ...and under the colour key only the art survives.
    const byKey = unwrapAuto(img, { background: { kind: 'colour', r: 255, g: 0, b: 255 } });
    expect(byKey.frames).toHaveLength(1);
    expect(byKey.frames[0]).toMatchObject({ x: 5, y: 6, w: 3, h: 2, pixels: 6 });
    expect(byKey.litPixels).toBe(6);
  });

  it('reports a blank sheet as zero lit pixels rather than as a frame', () => {
    const out = unwrapAuto(blank(16, 16));
    expect(out.frames).toEqual([]);
    expect(out.litPixels).toBe(0);
  });

  it('refuses a sheet with more separate regions than the cap', () => {
    // A checkerboard of single pixels under 4-connectivity: every lit pixel is
    // its own region, so the count is derived from the image, not guessed.
    const side = 128;
    const img = blank(side, side);
    let lit = 0;
    for (let y = 0; y < side; y += 2) for (let x = 0; x < side; x += 2) { paint(img, x, y, WHITE); lit++; }
    expect(lit).toBeGreaterThan(DEFAULT_MAX_REGIONS);

    const res = sliceAutoBounds(img, { connectivity: 4, mergeOverlapping: false });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal.kind).toBe('too-many-regions');
      expect(res.refusal.detail).toContain(String(DEFAULT_MAX_REGIONS));
    }

    // The same sheet under a cap it does fit in comes back with exactly that
    // many frames — so the refusal is about the cap, not about the sheet.
    const roomy = sliceAutoBounds(img, { connectivity: 4, mergeOverlapping: false, maxRegions: lit });
    expect(roomy.ok).toBe(true);
    if (roomy.ok) expect(roomy.value.frames).toHaveLength(lit);
  });

  it('refuses an RGBA buffer too short for the stated dimensions', () => {
    const res = sliceAutoBounds({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4 - 1) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.refusal.kind).toBe('bad-geometry');
      expect(res.refusal.detail).toContain(String(8 * 8 * 4));
    }
  });

  it('ignores pixels below the opacity threshold and keeps those at it', () => {
    const img = blank(8, 8);
    paint(img, 1, 1, [255, 255, 255, OPAQUE_ALPHA_MIN - 1]);
    expect(unwrapAuto(img).litPixels).toBe(0);
    paint(img, 1, 1, [255, 255, 255, OPAQUE_ALPHA_MIN]);
    const out = unwrapAuto(img);
    expect(out.litPixels).toBe(1);
    expect(out.frames).toEqual([{ x: 1, y: 1, w: 1, h: 1, pixels: 1 }]);
  });
});
