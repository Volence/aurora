// THE SIZING RULE FOR THE SONIC 1 LEVEL CANVAS, AS A PURE FUNCTION (ROADMAP row 194).
//
// `classicBackingStore(rectWidth, rectHeight, dpr)` is what `ClassicLevelViewport`'s
// `measure()` writes: a backing store of floor(CSS box x dpr) DEVICE pixels, and a CSS
// box of exactly that over dpr. These rows state the properties rather than a table,
// so no row encodes this machine's display scale.
//
// RED-FIRST: written before the function existed (a missing export), then proved by
// planted mutations on the implementation, recorded in
// docs/reviews/2026-09-28-classic-canvas-dpr-194.md.

import { describe, it, expect } from 'vitest';
import { classicBackingStore } from '../viewport-math';

const RECTS: Array<[number, number]> = [[640.5, 480.25], [856, 742], [576, 542], [1, 1], [333.33, 99.9]];
const FACTORS = [1, 1.25, 1.35, 1.5, 2, 3];

describe('classicBackingStore: device-sized store, CSS box derived back from it', () => {
  for (const [rw, rh] of RECTS) {
    for (const dpr of FACTORS) {
      it(`${rw}x${rh} at ${dpr}`, () => {
        const s = classicBackingStore(rw, rh, dpr);
        // Whole device pixels: an unsigned long attribute can hold nothing else.
        expect(Number.isInteger(s.deviceWidth) && Number.isInteger(s.deviceHeight)).toBe(true);
        expect(s.deviceWidth).toBe(Math.max(1, Math.floor(rw * dpr)));
        expect(s.deviceHeight).toBe(Math.max(1, Math.floor(rh * dpr)));
        // THE CSS BOX IS THE STORE OVER THE FACTOR, EXACTLY, so the transform
        // `setTransform(dpr, ...)` maps the CSS box onto the whole store and the
        // browser composites it 1:1 with no resample.
        expect(s.cssWidth * dpr).toBeCloseTo(s.deviceWidth, 9);
        expect(s.cssHeight * dpr).toBeCloseTo(s.deviceHeight, 9);
        // Never larger than the container (it would overflow a hidden box), and
        // short of it by less than one device pixel.
        expect(s.cssWidth).toBeLessThanOrEqual(Math.max(rw, 1 / dpr));
        expect(rw - s.cssWidth).toBeLessThan(1 / dpr);
        expect(s.dpr).toBe(dpr);
      });
    }
  }

  it('at a factor of 1 it is exactly the pre-fix floor(rect), so a 100% display is unchanged', () => {
    for (const [rw, rh] of RECTS) {
      const s = classicBackingStore(rw, rh, 1);
      expect([s.deviceWidth, s.deviceHeight, s.cssWidth, s.cssHeight])
        .toEqual([Math.max(1, Math.floor(rw)), Math.max(1, Math.floor(rh)),
          Math.max(1, Math.floor(rw)), Math.max(1, Math.floor(rh))]);
    }
  });

  it('a zero or collapsed box still yields a one-pixel store, never zero', () => {
    const s = classicBackingStore(0, 0, 1.5);
    expect([s.deviceWidth, s.deviceHeight]).toEqual([1, 1]);
  });
});
