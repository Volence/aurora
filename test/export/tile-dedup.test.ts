import { describe, it, expect } from 'vitest';
import { buildGroupUnions, remapNametableToGroup, serializeTiles } from '../../src/core/export/tile-dedup';
import { packNametableWord } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill & 0xF) };
}

describe('buildGroupUnions', () => {
  it('unions tiles across sections of the same color, first-seen order', () => {
    const tiles: Tile[] = [tile(0), tile(1), tile(2), tile(3)];
    const ntA = new Uint16Array(4);
    ntA[0] = packNametableWord(2, 0, false, false, false);
    ntA[1] = packNametableWord(1, 0, false, false, false);
    const ntB = new Uint16Array(4);
    ntB[0] = packNametableWord(3, 0, false, false, false);
    ntB[1] = packNametableWord(1, 0, false, false, false); // shared with A

    const unions = buildGroupUnions(
      [
        { nametable: ntA, tiles, color: 0 },
        { nametable: ntB, tiles, color: 0 },
      ],
      1,
    );
    // first-seen: tile2, tile1, tile3 — tile1 not duplicated
    expect(unions[0].tiles.length).toBe(3);
  });

  it('identical pixel content across different indices dedupes', () => {
    const tiles: Tile[] = [tile(0), tile(5), tile(5)];
    const nt = new Uint16Array(2);
    nt[0] = packNametableWord(1, 0, false, false, false);
    nt[1] = packNametableWord(2, 0, false, false, false);
    const unions = buildGroupUnions([{ nametable: nt, tiles, color: 0 }], 1);
    expect(unions[0].tiles.length).toBe(1);
  });
});

describe('remapNametableToGroup', () => {
  it('remaps indices to base + union slot, preserving flags; empty words stay 0', () => {
    const tiles: Tile[] = [tile(0), tile(7)];
    const nt = new Uint16Array(2);
    nt[0] = 0;
    nt[1] = packNametableWord(1, 2, true, false, true);
    const unions = buildGroupUnions([{ nametable: nt, tiles, color: 0 }], 1);
    const remapped = remapNametableToGroup(nt, tiles, unions[0], 113);
    expect(remapped[0]).toBe(0);
    expect(remapped[1]).toBe(packNametableWord(113 + 0, 2, true, false, true));
  });
});

describe('serializeTiles', () => {
  it('packs 2 pixels per byte, 32 bytes per tile', () => {
    const t = tile(0);
    t.pixels[0] = 0xA; t.pixels[1] = 0x3;
    const bytes = serializeTiles([t]);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0xA3);
  });
});
