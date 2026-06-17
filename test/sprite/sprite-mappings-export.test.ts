import { describe, it, expect } from 'vitest';
import { computeFrameBbox } from '../../src/core/export/sprite-mappings-export';
import type { SpritePiece } from '../../src/core/model/sprite-types';

function piece(p: Partial<SpritePiece>): SpritePiece {
  return {
    xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0,
    palette: 0, priority: false, xFlip: false, yFlip: false, ...p,
  };
}

describe('computeFrameBbox', () => {
  it('is exact for a symmetric frame (matches test_mappings F0)', () => {
    const bbox = computeFrameBbox([piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2 })]);
    expect(bbox).toEqual({ xMin: -8, xMax: 8, yMin: -8, yMax: 8 });
  });
  it('symmetrizes an asymmetric frame so one box covers all 4 flips', () => {
    const bbox = computeFrameBbox([piece({ xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1 })]);
    expect(bbox.xMin).toBe(-8);
    expect(bbox.xMax).toBe(8);
    expect(bbox.yMin).toBe(-8);
    expect(bbox.yMax).toBe(8);
  });
  it('unions multiple pieces before symmetrizing', () => {
    const bbox = computeFrameBbox([
      piece({ xOffset: -16, yOffset: -8, widthCells: 1, heightCells: 1 }),
      piece({ xOffset: 8, yOffset: 0, widthCells: 2, heightCells: 1 }),
    ]);
    expect(bbox.xMin).toBe(-24);
    expect(bbox.xMax).toBe(24);
  });
  it('hard-fails when an extent exceeds signed byte range', () => {
    expect(() => computeFrameBbox([piece({ xOffset: 120, widthCells: 4, heightCells: 1 })]))
      .toThrow(/signed byte/);
  });
});
