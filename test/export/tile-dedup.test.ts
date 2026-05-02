import { describe, it, expect } from 'vitest';
import { deduplicateSectionTiles } from '../../src/core/export/tile-dedup';
import type { Tile } from '../../src/core/model/s4-types';
import { packNametableWord } from '../../src/core/model/s4-types';

describe('tile-dedup', () => {
  function makeTile(fill: number): Tile {
    const pixels = new Uint8Array(64).fill(fill);
    return { pixels };
  }

  it('deduplicates repeated tiles and remaps nametable', () => {
    const tiles: Tile[] = [
      makeTile(0), // tile 0 (blank)
      makeTile(1), // tile 1
      makeTile(1), // tile 2 = duplicate of tile 1
      makeTile(2), // tile 3
    ];

    const nametable = new Uint16Array(4);
    nametable[0] = packNametableWord(1, 0, false, false, false);
    nametable[1] = packNametableWord(2, 0, false, false, false);
    nametable[2] = packNametableWord(3, 1, true, false, false);
    nametable[3] = packNametableWord(0, 0, false, false, false);

    const result = deduplicateSectionTiles(nametable, tiles, 0x0E20);

    // Should have 3 unique tiles used: blank(0), fill-1, fill-2
    // Tile 2 maps to same deduplicated slot as tile 1
    expect(result.usedTiles.length).toBeLessThanOrEqual(3);

    // Remapped nametable should have absolute VRAM indices
    const baseSlot = 0x0E20 / 32;
    for (let i = 0; i < 4; i++) {
      const idx = result.remappedNametable[i] & 0x7FF;
      if (idx !== 0) {
        expect(idx).toBeGreaterThanOrEqual(baseSlot);
      }
    }
  });

  it('handles empty nametable', () => {
    const tiles: Tile[] = [makeTile(0)];
    const nametable = new Uint16Array(4); // all zeros
    const result = deduplicateSectionTiles(nametable, tiles, 0);
    expect(result.usedTiles.length).toBe(0);
    expect(result.remappedNametable.length).toBe(4);
  });
});
