import { describe, it, expect } from 'vitest';
import { blankStandalonePalette, resolveDisplayPalette } from '../../src/core/art/sprite-palette';
import type { PaletteLine } from '../../src/core/model/s4-types';

describe('sprite-palette', () => {
  it('blankStandalonePalette is 16 colors, index 0 transparent, rest opaque black', () => {
    const p = blankStandalonePalette();
    expect(p).toHaveLength(16);
    expect(p[0]).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(p[1]).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
  it('resolveDisplayPalette: zone mode returns the bound zone line', () => {
    const lines: PaletteLine[] = [
      { colors: [{ r: 1, g: 1, b: 1, a: 255 }] },
      { colors: [{ r: 2, g: 2, b: 2, a: 255 }] },
    ];
    expect(resolveDisplayPalette('zone', 1, [], lines)).toBe(lines[1].colors);
  });
  it('resolveDisplayPalette: standalone mode returns the standalone palette', () => {
    const sp = blankStandalonePalette();
    expect(resolveDisplayPalette('standalone', 0, sp, [])).toBe(sp);
  });
  it('resolveDisplayPalette: zone mode with an out-of-range line returns []', () => {
    expect(resolveDisplayPalette('zone', 3, [], [])).toEqual([]);
  });
});
