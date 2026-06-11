import type { Tile } from '../model/types';

/**
 * Parse 4bpp Genesis tile data into Tile objects.
 * Each tile is 32 bytes: 8 rows of 4 bytes, each byte = 2 nybble pixel indices.
 */
export function parseTiles(data: Uint8Array): Tile[] {
  const TILE_BYTES = 32; // 8x8 pixels at 4bpp = 32 bytes
  const tileCount = Math.floor(data.length / TILE_BYTES);
  const tiles: Tile[] = [];

  for (let t = 0; t < tileCount; t++) {
    const pixels = new Uint8Array(64);
    const baseOffset = t * TILE_BYTES;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const byte = data[baseOffset + row * 4 + col];
        pixels[row * 8 + col * 2] = (byte >> 4) & 0xF;     // high nybble
        pixels[row * 8 + col * 2 + 1] = byte & 0xF;         // low nybble
      }
    }

    tiles.push({ pixels });
  }

  return tiles;
}
