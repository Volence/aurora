import { describe, it, expect } from 'vitest';
import { cellIndexAt, readTilePixels, packTilePixels } from '../composer-math';

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

describe('readTilePixels / packTilePixels (4bpp nibble packing)', () => {
  it('reads the HIGH nibble as the LEFT (even-x) pixel', () => {
    // One tile, first byte 0x1F → left pixel = 1 (high nibble), right pixel = F.
    const tiles = new Uint8Array(32);
    tiles[0] = 0x1f;
    const px = readTilePixels(tiles, 0);
    expect(px[0]).toBe(0x1); // even x → high nibble
    expect(px[1]).toBe(0xf); // odd x  → low nibble
  });

  it('pins a known byte pattern across a full row', () => {
    // Row 0 bytes 0x12 0x34 0x56 0x78 → pixels 1 2 3 4 5 6 7 8.
    const tiles = new Uint8Array(32);
    tiles.set([0x12, 0x34, 0x56, 0x78], 0);
    const px = readTilePixels(tiles, 0);
    expect(Array.from(px.slice(0, 8))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('packTilePixels is the exact inverse of readTilePixels (round-trip)', () => {
    const tiles = new Uint8Array(64);
    for (let i = 0; i < 64; i++) tiles[i] = (i * 37) & 0xff; // two tiles of varied bytes
    for (const t of [0, 1]) {
      const px = readTilePixels(tiles, t);
      const bytes = packTilePixels(px);
      expect(Array.from(bytes)).toEqual(Array.from(tiles.slice(t * 32, t * 32 + 32)));
    }
  });

  it('round-trips an arbitrary pixel array back to itself', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 64; i++) px[i] = (i * 7) & 0xf;
    const bytes = packTilePixels(px);
    const back = readTilePixels(bytes, 0);
    expect(Array.from(back)).toEqual(Array.from(px));
  });

  it('returns all-zero pixels for an out-of-range tile index (no throw)', () => {
    const tiles = new Uint8Array(32);
    expect(Array.from(readTilePixels(tiles, 5))).toEqual(Array(64).fill(0));
  });
});
