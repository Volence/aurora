import { describe, it, expect } from 'vitest';
import {
  computeVramColoring, assignVramBases, generateVramBasesAsm, FG_TILE_LIMIT,
} from '../../src/core/export/vram-coloring';

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

describe('assignVramBases', () => {
  it('gives cumulative tile-slot bases from union counts', () => {
    const { colorBases, bases } = assignVramBases([0, 1, 0], [113, 87]);
    expect(colorBases).toEqual([0, 113]);
    // per-section byte addresses
    expect(bases).toEqual([0 * 32, 113 * 32, 0 * 32]);
  });

  it('inactive sections get base 0', () => {
    const { bases } = assignVramBases([0, -1], [50]);
    expect(bases[1]).toBe(0);
  });

  it('throws when groups exceed the FG pool', () => {
    expect(() => assignVramBases([0, 1], [800, FG_TILE_LIMIT - 800 + 1]))
      .toThrow(/VRAM/i);
  });
});

describe('generateVramBasesAsm', () => {
  it('emits one equate per section as slot * 32', () => {
    const asm = generateVramBasesAsm('OJZ', [0, 113 * 32]);
    expect(asm).toContain('OJZ_SEC0_VRAM = 0 * 32');
    expect(asm).toContain('OJZ_SEC1_VRAM = 113 * 32');
  });
});
