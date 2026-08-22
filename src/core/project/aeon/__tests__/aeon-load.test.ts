import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject, dominantPaletteLine } from '../load';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeSectionMeta } from '../../../formats/section-meta';
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

// Meta-sidecar fixture. The well-formed text comes from the serializer rather
// than being spelled out, so it stays the exact shape a save would have left.
const META_PATH = 'data/ojz/act1/section_0.meta.json';
const META_REFS = { bgLayoutRef: 'bg-cave', paletteRef: 'pal-dusk' };
const WELL_FORMED_META = serializeSectionMeta(META_REFS)!;
const MALFORMED_META = WELL_FORMED_META.slice(0, -1);  // truncated hand-edit

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

  /**
   * R7. Absent and unreadable are not the same fact. The bare catch conflated
   * ENOENT, EACCES and a JSON SyntaxError: all three yielded `objects = []`
   * with no notice, so a truncated hand-edit or a merge-conflict marker opened
   * the project with zero objects in that section — and the next save wrote
   * `[]` over every placement.
   */
  it('flags a present-but-unparseable objects.json instead of loading it as empty', async () => {
    const files = fixtureFiles();
    files.set('data/ojz/act1/section_0.objects.json',
      new TextEncoder().encode('[{"id":"o1",<<<<<<< HEAD'));
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.objects).toEqual([]);                    // nothing to show
    expect(section.unreadable).toContain('objects.json');   // but not "nothing there"
    expect(r.notices.join(' ')).toMatch(/objects\.json exists but could not be read/);
  });

  it('says nothing about a section file that is simply absent', async () => {
    // The ordinary case: a section with no objects has no objects file.
    const files = fixtureFiles();
    files.delete('data/ojz/act1/section_0.objects.json');
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.objects).toEqual([]);
    expect(section.unreadable).toBeUndefined();
    expect(r.notices).toEqual([]);
  });

  it('loads the meta sidecar refs when it parses', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(WELL_FORMED_META));
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.bgLayoutRef).toBe(META_REFS.bgLayoutRef);
    expect(section.paletteRef).toBe(META_REFS.paletteRef);
    expect(section.unreadable).toBeUndefined();
    expect(r.notices).toEqual([]);
  });

  /**
   * R7 for the meta sidecar. A malformed sidecar was indistinguishable from an
   * absent one: both refs fell back to their createSection defaults with no
   * notice, and all-null is exactly the state that makes save.ts overwrite the
   * file with `{bgLayoutRef: null, paletteRef: null}`.
   */
  it('flags a present-but-unparseable meta.json instead of loading it as defaults', async () => {
    const files = fixtureFiles();
    // The instrument really is malformed, and really does carry the refs it is
    // about to lose — a test over an all-null sidecar would prove nothing.
    expect(() => JSON.parse(MALFORMED_META)).toThrow();
    expect(MALFORMED_META).toContain(META_REFS.bgLayoutRef);
    expect(MALFORMED_META).toContain(META_REFS.paletteRef);
    files.set(META_PATH, new TextEncoder().encode(MALFORMED_META));

    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.bgLayoutRef).toBeNull();               // nothing to show
    expect(section.paletteRef).toBeNull();
    expect(section.unreadable).toContain('meta.json');    // but not "nothing there"
    expect(r.notices.join(' ')).toMatch(/meta\.json exists but could not be read/);
  });

  it('says nothing about a section with no meta sidecar', async () => {
    // The ordinary case: an all-default section has no sidecar at all.
    const files = fixtureFiles();
    expect(files.has(META_PATH)).toBe(false);
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.bgLayoutRef).toBeNull();
    expect(section.paletteRef).toBeNull();
    expect(section.unreadable).toBeUndefined();
    expect(r.notices).toEqual([]);
  });

  it('flags an unreadable .tiles.bin rather than silently reseeding from strips', async () => {
    const files = fixtureFiles();
    files.set('data/ojz/act1/section_0.tiles.bin', new Uint8Array([1, 2, 3])); // wrong length
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0];
    // No strips in this fixture, so the section is dropped — but the notice is
    // the point: the file is there and Aurora did not understand it.
    expect(r.notices.join(' ')).toMatch(/tiles\.bin exists but could not be read/);
    if (section) expect(section.unreadable).toContain('tiles.bin');
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
