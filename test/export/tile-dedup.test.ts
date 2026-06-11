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
    // first-seen: blank (reserved), tile2, tile1, tile3 — tile1 not duplicated
    expect(unions[0].tiles.length).toBe(4);
  });

  it('identical pixel content across different indices dedupes', () => {
    const tiles: Tile[] = [tile(0), tile(5), tile(5)];
    const nt = new Uint16Array(2);
    nt[0] = packNametableWord(1, 0, false, false, false);
    nt[1] = packNametableWord(2, 0, false, false, false);
    const unions = buildGroupUnions([{ nametable: nt, tiles, color: 0 }], 1);
    expect(unions[0].tiles.length).toBe(2); // blank (reserved slot 0) + one deduplicated tile(5)
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
    expect(remapped[1]).toBe(packNametableWord(113 + 1, 2, true, false, true));
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

describe('buildGroupUnions blank-slot reservation', () => {
  it('reserves slot 0 of group 0 for a blank tile', () => {
    const tiles: Tile[] = [tile(0), tile(9)];
    const nt = new Uint16Array(1);
    nt[0] = packNametableWord(1, 0, false, false, false);
    const unions = buildGroupUnions([{ nametable: nt, tiles, color: 0 }], 2);
    expect(unions[0].tiles.length).toBe(2); // blank + tile(9)
    expect(Array.from(unions[0].tiles[0].pixels).every(p => p === 0)).toBe(true);
    // blank-content tiles painted explicitly reuse slot 0 rather than duplicating
    expect(unions[0].slotByHash.get('0'.repeat(64))).toBe(0);
    // group 1 is NOT padded
    expect(unions[1].tiles.length).toBe(0);
  });
});

describe('exportAct group blobs', () => {
  it('same-color sections share an identical tileArt blob with blank slot 0', async () => {
    const { exportAct } = await import('../../src/core/export/index');
    const { createSection } = await import('../../src/core/model/s4-types');
    const tiles: Tile[] = [tile(0), tile(3), tile(6)];
    const secA = createSection(0, 'A');
    secA.tileGrid.nametable[0] = packNametableWord(1, 0, false, false, false);
    const secB = createSection(2, 'B'); // grid (2,0) in 3x1 -> same color as (0,0)
    secB.tileGrid.nametable[0] = packNametableWord(2, 0, false, false, false);
    const result = exportAct('TST', {
      id: 'act1', gridWidth: 3, gridHeight: 1,
      sections: [secA, null, secB],
      startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
      bgLayout: null, bgTiles: null, parallaxRef: null,
    }, { tiles, collisionTypes: new Uint8Array(0) }, []);
    const [binA, binB] = result.sectionBinaries;
    expect(binA.tileArt).toEqual(binB.tileArt);
    // slot 0 blank (first 32 bytes zero), then the two used tiles
    expect(binA.tileArt.length).toBe(3 * 32);
    expect(Array.from(binA.tileArt.slice(0, 32)).every(b => b === 0)).toBe(true);
    // nametable words remapped to slots 1 and 2 (blank occupies 0)
    expect(result.vramBasesAsm).toContain('TST_SEC0_VRAM = 0 * 32');
    expect(result.vramBasesAsm).toContain('TST_SEC1_VRAM = 0 * 32');   // inactive
    expect(result.vramBasesAsm).toContain('TST_SEC2_VRAM = 0 * 32');   // same color as sec0
  });
});
