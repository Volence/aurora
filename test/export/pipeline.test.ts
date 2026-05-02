import { describe, it, expect } from 'vitest';
import { exportAct, type ExportResult } from '../../src/core/export/index';
import { createSection, type Act, type Tileset, type Tile, type Palette, type ObjectDef } from '../../src/core/model/s4-types';

describe('export pipeline', () => {
  function makeTile(fill: number): Tile {
    return { pixels: new Uint8Array(64).fill(fill) };
  }

  function makeTestAct(): { act: Act; tileset: Tileset; palette: Palette; objectLibrary: ObjectDef[] } {
    const sec0 = createSection(0, 'Sec0');
    sec0.tileGrid.nametable[0] = 0x0001; // tile 1, no flags
    sec0.rings.push({ x: 128, y: 96 });
    sec0.objects.push({ x: 256, y: 100, typeId: 'spring', subtype: 0 });

    const act: Act = {
      id: 'act1',
      gridWidth: 2,
      gridHeight: 1,
      sections: [sec0, null],
      startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
      bgLayout: null,
      bgTiles: null,
      parallaxRef: null,
    };

    const tileset: Tileset = {
      tiles: [makeTile(0), makeTile(1)],
      collisionTypes: new Uint8Array([0, 5]),
    };

    const palette: Palette = { lines: [{ colors: Array(16).fill({ r: 0, g: 0, b: 0, a: 255 }) }] };
    const objectLibrary: ObjectDef[] = [
      { id: 'spring', name: 'Spring', codeLabel: 'Obj_Spring', defaultSubtype: 0, properties: {} },
    ];

    return { act, tileset, palette, objectLibrary };
  }

  it('produces expected output files', () => {
    const { act, tileset, palette, objectLibrary } = makeTestAct();
    const result = exportAct('OJZ', act, tileset, objectLibrary);

    expect(result.actDescriptorAsm).toContain('OJZ_act1_Descriptor:');
    expect(result.entityDataAsm).toContain('OJZ_Sec0_Rings:');
    expect(result.entityDataAsm).toContain('OJZ_Sec0_Objects:');
    expect(result.vramBasesAsm).toContain('OJZ_SEC0_VRAM');
    expect(result.sectionBinaries.length).toBe(1); // only sec0 is active
    expect(result.sectionBinaries[0].nametable.length).toBe(131072);
    expect(result.sectionBinaries[0].collision.length).toBe(65536);
    expect(result.sectionBinaries[0].tileArt.length).toBeGreaterThan(0);
  });

  it('skips null sections in binary output', () => {
    const { act, tileset, palette, objectLibrary } = makeTestAct();
    const result = exportAct('OJZ', act, tileset, objectLibrary);
    expect(result.sectionBinaries.length).toBe(1);
    expect(result.sectionBinaries[0].index).toBe(0);
  });
});
