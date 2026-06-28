import { describe, it, expect } from 'vitest';
import { cellTileIndices } from '../../src/core/collision/collision-cell';

describe('cellTileIndices', () => {
  it('returns the 4 tile indices of a 16px cell (2x2 tiles), row-major', () => {
    // cell (0,0) in a 256-wide grid -> tiles (0,0),(1,0),(0,1),(1,1)
    expect(cellTileIndices(0, 0, 256)).toEqual([0, 1, 256, 257]);
    // cell (3,5): tileCol=6, tileRow=10 -> 10*256+6=2566, +1, +256, +257
    expect(cellTileIndices(3, 5, 256)).toEqual([2566, 2567, 2822, 2823]);
  });
});
