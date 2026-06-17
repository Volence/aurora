import { describe, it, expect } from 'vitest';
import { extractTile, tileIsEmpty } from '../../src/core/art/sprite-decompose';

// 16x16 bitmap (2x2 tiles). Fill the top-left 8x8 tile with color 1, rest 0.
function bitmap16(): Uint8Array {
  const px = new Uint8Array(16 * 16);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 16 + x] = 1;
  return px;
}

describe('extractTile', () => {
  it('extracts the 8x8 tile at a grid cell', () => {
    const t = extractTile(bitmap16(), 16, 16, 0, 0);
    expect(t.pixels.length).toBe(64);
    expect(Array.from(t.pixels).every((v) => v === 1)).toBe(true);
  });
  it('returns transparent (0) for an empty cell', () => {
    const t = extractTile(bitmap16(), 16, 16, 1, 1);
    expect(Array.from(t.pixels).every((v) => v === 0)).toBe(true);
  });
  it('pads out-of-bounds pixels with 0 (frame not a multiple of 8)', () => {
    // 4x4 bitmap, all color 2; tile 0,0 should have the 4x4 filled, rest 0.
    const px = new Uint8Array(4 * 4).fill(2);
    const t = extractTile(px, 4, 4, 0, 0);
    expect(t.pixels[0]).toBe(2);          // (0,0) in bounds
    expect(t.pixels[5 * 8 + 5]).toBe(0);  // (5,5) out of bounds → 0
  });
});

describe('tileIsEmpty', () => {
  it('is true for an all-zero tile and false otherwise', () => {
    expect(tileIsEmpty({ pixels: new Uint8Array(64) })).toBe(true);
    const t = new Uint8Array(64); t[10] = 3;
    expect(tileIsEmpty({ pixels: t })).toBe(false);
  });
});
