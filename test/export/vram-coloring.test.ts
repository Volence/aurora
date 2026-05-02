import { describe, it, expect } from 'vitest';
import { computeVramBases } from '../../src/core/export/vram-coloring';

describe('vram-coloring', () => {
  it('assigns different bases to horizontally adjacent sections', () => {
    const bases = computeVramBases(3, 1, [true, true, true]);
    expect(bases[0]).not.toBe(bases[1]);
  });

  it('assigns different bases to vertically adjacent sections', () => {
    const bases = computeVramBases(1, 3, [true, true, true]);
    expect(bases[0]).not.toBe(bases[1]);
    expect(bases[1]).not.toBe(bases[2]);
  });

  it('checkerboards a 3x3 grid', () => {
    const bases = computeVramBases(3, 3, Array(9).fill(true));
    expect(bases[0]).not.toBe(bases[1]); // (0,0) vs (1,0)
    expect(bases[0]).not.toBe(bases[3]); // (0,0) vs (0,1)
    expect(bases[0]).toBe(bases[4]); // (0,0) vs (1,1) — checkerboard
  });

  it('null sections get base 0', () => {
    const bases = computeVramBases(2, 1, [true, false]);
    expect(bases[1]).toBe(0);
  });

  it('returns values that are multiples of 32 (byte addresses)', () => {
    const bases = computeVramBases(4, 3, Array(12).fill(true));
    for (const base of bases) {
      expect(base % 32).toBe(0);
    }
  });
});
