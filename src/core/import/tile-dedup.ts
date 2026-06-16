import type { Tile, TileRef } from '../model/types';

/**
 * Generate all 4 flip variants of a tile's pixel data.
 */
export function flipTile(pixels: Uint8Array, xFlip: boolean, yFlip: boolean): Uint8Array {
  const out = new Uint8Array(64);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const srcRow = yFlip ? 7 - row : row;
      const srcCol = xFlip ? 7 - col : col;
      out[row * 8 + col] = pixels[srcRow * 8 + srcCol];
    }
  }
  return out;
}

function tileHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) {
    s += pixels[i].toString(16);
  }
  return s;
}

export class TileDeduplicator {
  private tiles: Tile[] = [];
  private hashMap = new Map<string, { tileIndex: number; xFlip: boolean; yFlip: boolean }>();

  constructor() {
    // Pre-seed tile 0 as blank
    const blank = new Uint8Array(64);
    this.tiles.push({ pixels: blank });
    this.hashMap.set(tileHash(blank), { tileIndex: 0, xFlip: false, yFlip: false });
  }

  /**
   * Add a tile or find its deduplicated match (checking all flip variants).
   * Returns the TileRef (with tileIndex, xFlip, yFlip, palette, priority).
   */
  add(pixels: Uint8Array, paletteLine: number): TileRef {
    const flips: Array<{ xFlip: boolean; yFlip: boolean }> = [
      { xFlip: false, yFlip: false },
      { xFlip: true, yFlip: false },
      { xFlip: false, yFlip: true },
      { xFlip: true, yFlip: true },
    ];

    for (const flip of flips) {
      const flipped = flipTile(pixels, flip.xFlip, flip.yFlip);
      const hash = tileHash(flipped);
      const existing = this.hashMap.get(hash);
      if (existing) {
        return {
          tileIndex: existing.tileIndex,
          xFlip: flip.xFlip !== existing.xFlip,
          yFlip: flip.yFlip !== existing.yFlip,
          palette: paletteLine,
          priority: false,
        };
      }
    }

    // New unique tile
    const idx = this.tiles.length;
    this.tiles.push({ pixels: new Uint8Array(pixels) });
    this.hashMap.set(tileHash(pixels), { tileIndex: idx, xFlip: false, yFlip: false });

    return {
      tileIndex: idx,
      xFlip: false,
      yFlip: false,
      palette: paletteLine,
      priority: false,
    };
  }

  getTiles(): Tile[] {
    return this.tiles;
  }

  get count(): number {
    return this.tiles.length;
  }
}
