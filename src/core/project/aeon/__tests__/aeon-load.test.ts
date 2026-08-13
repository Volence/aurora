import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject, dominantPaletteLine } from '../load';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

const PROJECT_JSON = {
  name: 'Test Project',
  engine: 's4',
  objectLibrary: 'data/objects.json',
  chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone',
    tileset: 'data/ojz_tiles.bin',
    palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1,
      dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', parallax: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  // Palette: 48 words (3 CRAM lines) of Genesis 0x0EEE-style colors.
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  // One saved section: nametable referencing tile 1 on palette line 2.
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/ojz/act1/section_0.objects.json',
    new TextEncoder().encode(JSON.stringify([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }])));
  files.set('data/objects.json',
    new TextEncoder().encode(JSON.stringify([
      { id: 'ring-monitor', name: 'Ring Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ])));
  return files;
}

describe('loadAeonProject', () => {
  it('loads config, zones, sections, objects and the object library from FileAccess', async () => {
    const r = await loadAeonProject(memFa(fixtureFiles()), '/proj');
    expect(r.config.name).toBe('Test Project');
    expect(r.config.basePath).toBe('/proj');
    expect(r.project.zones).toHaveLength(1);
    const act = r.project.zones[0].acts[0];
    expect(act.sections).toHaveLength(1);
    expect(act.sections[0]?.tileGrid.nametable[0]).toBe((2 << 13) | 1);
    expect(act.sections[0]?.objects).toEqual([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }]);
    expect(r.project.objectLibrary).toHaveLength(1);
    expect(r.project.zones[0].tileset.tiles).toHaveLength(2);
    expect(r.collisionProfiles).toBeNull();       // no collision tables in fixture
    expect(r.legacyAtlasMerged).toBe(false);      // no chunk library configured
    expect(r.notices).toEqual([]);
  });

  it('yields a null section for a grid slot with no data files', async () => {
    const files = fixtureFiles();
    files.delete('data/ojz/act1/section_0.tiles.bin');
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(r.project.zones[0].acts[0].sections[0]).toBeNull();
  });

  it('rejects a non-s4 project.json with the loader error (validation is NOT weakened)', async () => {
    const files = fixtureFiles();
    files.set('project.json', new TextEncoder().encode(JSON.stringify({ ...PROJECT_JSON, engine: 'nope' })));
    await expect(loadAeonProject(memFa(files), '/proj')).rejects.toThrow(/expected engine "s4"/i);
  });
});

describe('dominantPaletteLine', () => {
  it('picks the most-used palette line of the first non-null section (ignoring blank tiles)', async () => {
    const r = await loadAeonProject(memFa(fixtureFiles()), '/proj');
    expect(dominantPaletteLine(r.project)).toBe(2);
  });

  it('falls back to 0 with no sections', async () => {
    const files = fixtureFiles();
    files.delete('data/ojz/act1/section_0.tiles.bin');
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(dominantPaletteLine(r.project)).toBe(0);
  });
});
