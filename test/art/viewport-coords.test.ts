import { describe, it, expect } from 'vitest';
import { pixelAt } from '../../src/core/art/viewport-coords';

describe('pixelAt', () => {
  it('maps canvas-local coords to a pixel at the given zoom', () => {
    expect(pixelAt(0, 0, 4, 8, 8)).toEqual({ x: 0, y: 0 });
    expect(pixelAt(13, 27, 4, 8, 8)).toEqual({ x: 3, y: 6 });   // floor(13/4)=3, floor(27/4)=6
  });
  it('returns null outside the buffer bounds', () => {
    expect(pixelAt(-1, 5, 4, 8, 8)).toBeNull();
    expect(pixelAt(32, 5, 4, 8, 8)).toBeNull();                  // x=8 == width → out
    expect(pixelAt(5, 40, 4, 8, 8)).toBeNull();                  // y=10 → out
  });
  it('handles the last in-bounds pixel', () => {
    expect(pixelAt(31, 31, 4, 8, 8)).toEqual({ x: 7, y: 7 });
  });
});
