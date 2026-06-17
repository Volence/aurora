import { describe, it, expect } from 'vitest';
import {
  createBuffer, floodFill, drawLine, drawRect, flipH, flipV, rotate90,
  wrapShift, ditherValue, mirrorPoints,
} from '../../src/core/art/pixel-ops';

function buf(w: number, h: number, fill = 0) {
  const b = createBuffer(w, h);
  b.data.fill(fill);
  return b;
}

describe('createBuffer', () => {
  it('makes a zeroed w*h buffer', () => {
    const b = createBuffer(8, 8);
    expect(b.width).toBe(8);
    expect(b.height).toBe(8);
    expect(b.data.length).toBe(64);
    expect(b.data.every(v => v === 0)).toBe(true);
  });
});

describe('floodFill', () => {
  it('fills a connected region only', () => {
    const b = buf(4, 4, 0);
    // vertical wall at x=2
    for (let y = 0; y < 4; y++) b.data[y * 4 + 2] = 5;
    const out = floodFill(b, 0, 0, 7);
    expect(out.data[0]).toBe(7);
    expect(out.data[1]).toBe(7);          // left side filled
    expect(out.data[2]).toBe(5);          // wall untouched
    expect(out.data[3]).toBe(0);          // right of wall untouched
    expect(b.data[0]).toBe(0);            // input not mutated
  });
  it('no-ops when target equals fill value', () => {
    const b = buf(2, 2, 3);
    const out = floodFill(b, 0, 0, 3);
    expect(Array.from(out.data)).toEqual([3, 3, 3, 3]);
  });
  it('ignores out-of-bounds seeds (x === width must not wrap-fill the next row)', () => {
    const b = buf(4, 4, 0);
    const out = floodFill(b, 4, 0, 7); // row-major index would wrap to (0,1)
    expect(out.data.every(v => v === 0)).toBe(true);
    expect(floodFill(b, -1, 0, 7).data.every(v => v === 0)).toBe(true);
    expect(floodFill(b, 0, 4, 7).data.every(v => v === 0)).toBe(true);
  });
});

describe('drawLine', () => {
  it('draws a Bresenham diagonal', () => {
    const out = drawLine(buf(4, 4), 0, 0, 3, 3, 9);
    for (let i = 0; i < 4; i++) expect(out.data[i * 4 + i]).toBe(9);
  });
  it('draws horizontal and vertical lines', () => {
    const h = drawLine(buf(4, 4), 0, 1, 3, 1, 2);
    expect([h.data[4], h.data[5], h.data[6], h.data[7]]).toEqual([2, 2, 2, 2]);
    const v = drawLine(buf(4, 4), 2, 0, 2, 3, 2);
    for (let y = 0; y < 4; y++) expect(v.data[y * 4 + 2]).toBe(2);
  });
});

describe('drawRect', () => {
  it('outlines when not filled', () => {
    const out = drawRect(buf(4, 4), 0, 0, 3, 3, 6, false);
    expect(out.data[0]).toBe(6);          // corner
    expect(out.data[1 * 4 + 1]).toBe(0);  // interior empty
  });
  it('fills when filled', () => {
    const out = drawRect(buf(4, 4), 1, 1, 2, 2, 6, true);
    expect(out.data[1 * 4 + 1]).toBe(6);
    expect(out.data[2 * 4 + 2]).toBe(6);
    expect(out.data[0]).toBe(0);
  });
});

describe('transforms', () => {
  it('flipH mirrors columns', () => {
    const b = buf(2, 1); b.data[0] = 1; b.data[1] = 2;
    expect(Array.from(flipH(b).data)).toEqual([2, 1]);
  });
  it('flipV mirrors rows', () => {
    const b = buf(1, 2); b.data[0] = 1; b.data[1] = 2;
    expect(Array.from(flipV(b).data)).toEqual([2, 1]);
  });
  it('rotate90 rotates clockwise and rejects non-square', () => {
    const b = buf(2, 2); b.data.set([1, 2, 3, 4]);
    expect(Array.from(rotate90(b).data)).toEqual([3, 1, 4, 2]);
    expect(() => rotate90(buf(2, 1))).toThrow(/square/i);
  });
  it('wrapShift wraps around edges', () => {
    const b = buf(2, 2); b.data.set([1, 2, 3, 4]);
    expect(Array.from(wrapShift(b, 1, 0).data)).toEqual([2, 1, 4, 3]);
    expect(Array.from(wrapShift(b, 0, 1).data)).toEqual([3, 4, 1, 2]);
    expect(Array.from(wrapShift(b, -1, -1).data)).toEqual([4, 3, 2, 1]);
  });
});

describe('ditherValue', () => {
  it('checker alternates two values at 50%', () => {
    expect(ditherValue('checker', 0, 0, 1, 2)).toBe(1);
    expect(ditherValue('checker', 1, 0, 1, 2)).toBe(2);
    expect(ditherValue('checker', 1, 1, 1, 2)).toBe(1);
  });
  it('sparse25 places primary on 1 of 4 cells', () => {
    const hits = [0, 1, 2, 3].flatMap(y => [0, 1, 2, 3].map(x => ditherValue('sparse25', x, y, 1, 0)))
      .filter(v => v === 1).length;
    expect(hits).toBe(4); // 4 of 16
  });
});

describe('mirrorPoints', () => {
  it('h mode mirrors across the vertical axis', () => {
    expect(mirrorPoints(8, 8, 1, 3, 'h')).toEqual(
      expect.arrayContaining([{ x: 1, y: 3 }, { x: 6, y: 3 }]));
  });
  it('both mode yields 4 points (deduped at center)', () => {
    expect(mirrorPoints(8, 8, 1, 1, 'both').length).toBe(4);
    expect(mirrorPoints(8, 7, 4, 3, 'v').length).toBe(1); // center row on odd height: dedup
  });
});

import { isLCorner } from '../../src/core/art/pixel-ops';

describe('isLCorner (pixel-perfect)', () => {
  it('flags the middle of an L-corner', () => {
    expect(isLCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBe(true);
    expect(isLCorner({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(true);
  });
  it('does not flag a straight run', () => {
    expect(isLCorner({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
  it('does not flag a pure diagonal (no orthogonal middle)', () => {
    expect(isLCorner({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
  });
});
