import { describe, it, expect } from 'vitest';
import { cellIndexAt } from '../composer-math';

describe('cellIndexAt', () => {
  it('maps coords to a row-major index in a 16x16 chunk grid', () => {
    expect(cellIndexAt(0, 0, 20, 16, 16)).toBe(0);
    expect(cellIndexAt(25, 0, 20, 16, 16)).toBe(1); // col 1, row 0
    expect(cellIndexAt(0, 25, 20, 16, 16)).toBe(16); // col 0, row 1
    expect(cellIndexAt(319, 319, 20, 16, 16)).toBe(255); // last cell (col15,row15)
  });

  it('works for a 2x2 block grid', () => {
    expect(cellIndexAt(0, 0, 64, 2, 2)).toBe(0); // TL
    expect(cellIndexAt(70, 0, 64, 2, 2)).toBe(1); // TR
    expect(cellIndexAt(0, 70, 64, 2, 2)).toBe(2); // BL
    expect(cellIndexAt(70, 70, 64, 2, 2)).toBe(3); // BR
  });

  it('works for an 8x8 pixel grid', () => {
    expect(cellIndexAt(0, 0, 28, 8, 8)).toBe(0);
    expect(cellIndexAt(28 * 7 + 1, 28 * 7 + 1, 28, 8, 8)).toBe(63);
  });

  it('returns null outside the grid (past the right/bottom edge)', () => {
    expect(cellIndexAt(320, 0, 20, 16, 16)).toBeNull(); // col 16 (past 0..15)
    expect(cellIndexAt(0, 320, 20, 16, 16)).toBeNull();
  });

  it('returns null for negative coords and degenerate sizes', () => {
    expect(cellIndexAt(-1, 0, 20, 16, 16)).toBeNull();
    expect(cellIndexAt(0, -1, 20, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, 0, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, -5, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, 20, 0, 0)).toBeNull();
  });
});
