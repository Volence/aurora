// test/art/pixel-clipboard.test.ts
import { describe, it, expect } from 'vitest';
import { copyRegion, clearRegion, pasteRegion } from '../../src/core/art/pixel-clipboard';
import type { PixelBuffer } from '../../src/core/art/pixel-ops';

function buf(width: number, height: number, fill: (x: number, y: number) => number): PixelBuffer {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  return { width, height, data };
}

describe('copyRegion', () => {
  it('extracts the selection rectangle of indices', () => {
    const b = buf(4, 4, (x, y) => x + y * 4); // 0..15
    const r = copyRegion(b, { x: 1, y: 1, w: 2, h: 2 });
    expect(r).not.toBeNull();
    expect(r!.w).toBe(2); expect(r!.h).toBe(2);
    expect(Array.from(r!.data)).toEqual([5, 6, 9, 10]);
  });
  it('clamps a selection that overruns the buffer', () => {
    const b = buf(3, 3, () => 7);
    const r = copyRegion(b, { x: 2, y: 2, w: 5, h: 5 });
    expect(r!.w).toBe(1); expect(r!.h).toBe(1);
    expect(Array.from(r!.data)).toEqual([7]);
  });
  it('returns null for an empty/offscreen selection', () => {
    const b = buf(3, 3, () => 1);
    expect(copyRegion(b, { x: 5, y: 5, w: 2, h: 2 })).toBeNull();
    expect(copyRegion(b, { x: 0, y: 0, w: 0, h: 0 })).toBeNull();
  });
});

describe('clearRegion', () => {
  it('zeroes the selection rect, leaving the rest and the original intact', () => {
    const b = buf(3, 3, () => 9);
    const out = clearRegion(b, { x: 1, y: 0, w: 2, h: 2 });
    expect(out).not.toBe(b);
    expect(b.data[1]).toBe(9); // original untouched
    expect(out.data[0]).toBe(9); // outside the rect
    expect(out.data[1]).toBe(0); expect(out.data[2]).toBe(0); // row 0, x=1..2
    expect(out.data[4]).toBe(0); expect(out.data[5]).toBe(0); // row 1, x=1..2
  });
});

describe('pasteRegion', () => {
  it('stamps non-zero indices at (px,py), skipping clip index 0 (transparency-aware)', () => {
    const dest = buf(4, 4, () => 3);
    const clip = { w: 2, h: 2, data: new Uint8Array([0, 5, 6, 0]) };
    const out = pasteRegion(dest, clip, 1, 1);
    expect(out).not.toBe(dest);
    expect(out.data[1 * 4 + 1]).toBe(3); // clip(0,0)=0 → skipped, dest kept
    expect(out.data[1 * 4 + 2]).toBe(5); // clip(1,0)=5 → stamped
    expect(out.data[2 * 4 + 1]).toBe(6); // clip(0,1)=6 → stamped
    expect(out.data[2 * 4 + 2]).toBe(3); // clip(1,1)=0 → skipped
  });
  it('clips overflow beyond the destination bounds', () => {
    const dest = buf(2, 2, () => 0);
    const clip = { w: 2, h: 2, data: new Uint8Array([1, 1, 1, 1]) };
    const out = pasteRegion(dest, clip, 1, 1); // only (1,1) lands in-bounds
    expect(Array.from(out.data)).toEqual([0, 0, 0, 1]);
  });
});
