import { describe, it, expect } from 'vitest';
import { migrateChunkTilesIntoTileset } from '../../src/core/art/atlas-migration';
import { packNametableWord, unpackNametableWord, createSection, createChunkDef } from '../../src/core/model/s4-types';
import type { Tile, Section, ChunkDef } from '../../src/core/model/s4-types';

function tileFromRow(row: number[]): Tile {
  const pixels = new Uint8Array(64);
  row.forEach((v, c) => { pixels[c] = v; });
  return { pixels };
}

describe('migrateChunkTilesIntoTileset', () => {
  it('appends unknown tiles, reuses identical and flipped ones, remaps chunks and pinned sections', () => {
    const zoneTiles: Tile[] = [
      { pixels: new Uint8Array(64) },                 // 0 blank
      tileFromRow([1, 2, 3, 4, 5, 6, 7, 8]),          // 1
    ];
    const chunkTiles: Tile[] = [
      { pixels: new Uint8Array(64) },                 // c0 = dup of zone 0
      tileFromRow([8, 7, 6, 5, 4, 3, 2, 1]),          // c1 = hflip of zone 1
      tileFromRow([9, 9, 9, 0, 0, 0, 0, 0]),          // c2 = genuinely new
    ];
    const chunk: ChunkDef = createChunkDef('c', 'C', 2, 1);
    chunk.nametable[0] = packNametableWord(1, 2, false, false, false); // c1
    chunk.nametable[1] = packNametableWord(2, 1, true, false, true);   // c2 with flags

    const section: Section = createSection(0, 'S');
    section.tiles = chunkTiles; // pinned
    section.tileGrid.nametable[0] = packNametableWord(1, 3, false, true, false); // c1, vflipped

    const result = migrateChunkTilesIntoTileset(zoneTiles, chunkTiles, [chunk], [section]);

    // c2 appended; c0/c1 reused -> tileset grows by exactly 1
    expect(zoneTiles.length).toBe(3);
    expect(result.appended).toBe(1);
    expect(result.remapped).toBeGreaterThan(0);

    // chunk entry 0: c1 -> zone tile 1 with hflip compensation
    const e0 = unpackNametableWord(chunk.nametable[0]);
    expect(e0.tileIndex).toBe(1);
    expect(e0.hFlip).toBe(true);   // false XOR flip-compensation(true)
    expect(e0.palette).toBe(2);    // flags preserved

    // chunk entry 1: c2 -> appended index 2, original flags intact
    const e1 = unpackNametableWord(chunk.nametable[1]);
    expect(e1.tileIndex).toBe(2);
    expect(e1.priority).toBe(true);
    expect(e1.hFlip).toBe(true);

    // pinned section remapped the same way and unpinned
    const s0 = unpackNametableWord(section.tileGrid.nametable[0]);
    expect(s0.tileIndex).toBe(1);
    expect(s0.hFlip).toBe(true);   // compensated
    expect(s0.vFlip).toBe(true);   // original flag preserved
    expect(section.tiles).toBeNull();
  });

  it('does not remap sections that are not pinned to chunkTiles', () => {
    const zoneTiles: Tile[] = [{ pixels: new Uint8Array(64) }, tileFromRow([1, 1, 1, 1, 0, 0, 0, 0])];
    const section: Section = createSection(0, 'S');
    section.tileGrid.nametable[0] = packNametableWord(1, 1, false, false, false);
    migrateChunkTilesIntoTileset(zoneTiles, [tileFromRow([2, 2, 0, 0, 0, 0, 0, 0])], [], [section]);
    expect(unpackNametableWord(section.tileGrid.nametable[0]).tileIndex).toBe(1); // untouched
  });

  it('throws if the merge would exceed 2048 tiles, before mutating anything', () => {
    const zoneTiles: Tile[] = Array.from({ length: 2048 }, (_, i) => {
      const p = new Uint8Array(64); p[0] = i & 0xF; p[1] = (i >> 4) & 0xF; p[2] = (i >> 8) & 0xF;
      return { pixels: p };
    });
    const fresh = tileFromRow([3, 1, 4, 1, 5, 9, 2, 6]);
    expect(() => migrateChunkTilesIntoTileset(zoneTiles, [fresh], [], [])).toThrow(/2048/);
    expect(zoneTiles.length).toBe(2048);
  });
});
