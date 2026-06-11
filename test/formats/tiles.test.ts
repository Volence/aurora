import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseTiles } from '../../src/core/formats/tiles';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('Tile parsing', () => {
  it('parses decompressed OJZ tile data into correct number of tiles', () => {
    const data = new Uint8Array(readFileSync(resolve(FIXTURES, 'OJZ_tiles.dec.bin')));
    const tiles = parseTiles(data);
    // 29408 bytes / 32 bytes per tile = 919 tiles
    expect(tiles.length).toBe(919);
  });

  it('each tile has 64 pixel indices', () => {
    const data = new Uint8Array(readFileSync(resolve(FIXTURES, 'OJZ_tiles.dec.bin')));
    const tiles = parseTiles(data);
    for (const tile of tiles) {
      expect(tile.pixels.length).toBe(64);
    }
  });

  it('all pixel values are 0-15 (4bpp)', () => {
    const data = new Uint8Array(readFileSync(resolve(FIXTURES, 'OJZ_tiles.dec.bin')));
    const tiles = parseTiles(data);
    for (const tile of tiles) {
      for (const pixel of tile.pixels) {
        expect(pixel).toBeGreaterThanOrEqual(0);
        expect(pixel).toBeLessThanOrEqual(15);
      }
    }
  });

  it('first tile (blank) should be all zeros', () => {
    const data = new Uint8Array(readFileSync(resolve(FIXTURES, 'OJZ_tiles.dec.bin')));
    const tiles = parseTiles(data);
    // First tile is typically blank
    for (const pixel of tiles[0].pixels) {
      expect(pixel).toBe(0);
    }
  });
});
