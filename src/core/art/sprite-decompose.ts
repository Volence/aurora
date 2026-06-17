import type { Tile } from '../model/s4-types';

export const CELL = 8; // px per tile cell

/** Extract the 8x8 tile at grid cell (gx,gy). Out-of-bounds pixels pad to 0 (transparent). */
export function extractTile(pixels: Uint8Array, width: number, height: number, gx: number, gy: number): Tile {
  const out = new Uint8Array(64);
  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      const sx = gx * CELL + px;
      const sy = gy * CELL + py;
      out[py * CELL + px] = sx < width && sy < height ? pixels[sy * width + sx] : 0;
    }
  }
  return { pixels: out };
}

export function tileIsEmpty(tile: Tile): boolean {
  for (let i = 0; i < tile.pixels.length; i++) if (tile.pixels[i] !== 0) return false;
  return true;
}
