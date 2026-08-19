import { describe, it, expect } from 'vitest';
// `assignVramBases` and `generateVramBasesAsm` were deleted with the export path
// (2026-08-19, ROADMAP §4.2); their describes went with them. What remains is the
// coloring the budget readout still depends on.
import { computeVramColoring } from '../../src/core/export/vram-coloring';

describe('computeVramColoring', () => {
  it('checkerboards active sections and marks inactive as -1', () => {
    const colors = computeVramColoring(3, 1, [true, false, true]);
    expect(colors).toEqual([0, -1, 0]);
  });

  it('horizontal and vertical neighbors differ', () => {
    const colors = computeVramColoring(3, 3, Array(9).fill(true));
    expect(colors[0]).not.toBe(colors[1]);
    expect(colors[0]).not.toBe(colors[3]);
    expect(colors[0]).toBe(colors[4]); // diagonal shares
  });
});
