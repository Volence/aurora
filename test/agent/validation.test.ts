import { describe, it, expect } from 'vitest';
import {
  validateGenesisColor, validatePaletteLine, validateTilePixels, validatePaintRegion,
} from '../../src/core/agent/validation';

describe('validateGenesisColor', () => {
  it('accepts valid 9-bit even-channel words', () => {
    expect(validateGenesisColor(0x0000)).toBeNull();
    expect(validateGenesisColor(0x0EEE)).toBeNull();
    expect(validateGenesisColor(0x0A42)).toBeNull();
  });
  it('rejects odd channel values and out-of-range bits', () => {
    expect(validateGenesisColor(0x0001)).toMatch(/even/i);
    expect(validateGenesisColor(0x0010)).toMatch(/even/i);
    expect(validateGenesisColor(0x1000)).toMatch(/even|range/i);
    expect(validateGenesisColor(0xF000)).toMatch(/even|range/i);
  });
});

describe('validatePaletteLine', () => {
  it('rejects line 0 (sprite-reserved) and out-of-range lines', () => {
    expect(validatePaletteLine(0, Array(16).fill(0))).toMatch(/line 0|reserved/i);
    expect(validatePaletteLine(4, Array(16).fill(0))).toMatch(/line/i);
  });
  it('requires exactly 16 valid colors', () => {
    expect(validatePaletteLine(1, Array(15).fill(0))).toMatch(/16/);
    expect(validatePaletteLine(1, Array(16).fill(0))).toBeNull();
    expect(validatePaletteLine(2, [...Array(15).fill(0), 0x0003])).toMatch(/even/i);
  });
});

describe('validateTilePixels', () => {
  it('requires 64 pixels valued 0-15', () => {
    expect(validateTilePixels(Array(63).fill(0))).toMatch(/64/);
    expect(validateTilePixels([...Array(63).fill(0), 16])).toMatch(/0-15/);
    expect(validateTilePixels(Array(64).fill(15))).toBeNull();
  });
});

describe('validatePaintRegion', () => {
  const opts = { sectionCount: 9, tilesetSize: 100 };
  it('accepts an in-bounds region with matching entries', () => {
    const entries = Array(6).fill({ tile: 1, pal: 1 });
    expect(validatePaintRegion(0, 10, 20, 3, 2, entries, opts)).toBeNull();
  });
  it('rejects out-of-bounds regions', () => {
    expect(validatePaintRegion(0, 250, 0, 10, 1, Array(10).fill({ tile: 1, pal: 1 }), opts)).toMatch(/bounds/i);
    expect(validatePaintRegion(9, 0, 0, 1, 1, [{ tile: 1, pal: 1 }], opts)).toMatch(/section/i);
  });
  it('rejects entry count mismatch and bad entries', () => {
    expect(validatePaintRegion(0, 0, 0, 2, 2, Array(3).fill({ tile: 1, pal: 1 }), opts)).toMatch(/entries/i);
    expect(validatePaintRegion(0, 0, 0, 1, 1, [{ tile: 100, pal: 1 }], opts)).toMatch(/tile/i);
    expect(validatePaintRegion(0, 0, 0, 1, 1, [{ tile: 1, pal: 4 }], opts)).toMatch(/palette/i);
    expect(validatePaintRegion(0, 0, 0, 1, 1, [{ tile: 1, pal: 1, coll: 256 }], opts)).toMatch(/collision/i);
  });
});
