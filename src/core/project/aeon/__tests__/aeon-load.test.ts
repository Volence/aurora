import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject, dominantPaletteLine } from '../load';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeSectionMeta } from '../../../formats/section-meta';
import { serializeCollAttr } from '../../../formats/s4-collattr';
import { STRIP_ROWS, STRIP_COLS, WIDE_STRIP_SIZE } from '../../../formats/s4-strips';
import { packCollisionCell } from '../../../collision/collision-cell-word';
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
      bgLayout: '', bgTiles: '', sceneRef: null,
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
const META_REFS = { bgLayoutRef: 'bg-cave', paletteRef: 'pal-dusk', sceneRef: null };
const WELL_FORMED_META = serializeSectionMeta(META_REFS)!;
// Truncated hand-edit: two bytes, not one — the well-formed text ends in the
// canonical `}\n` (§8), and dropping only the newline leaves valid JSON.
const MALFORMED_META = WELL_FORMED_META.slice(0, -2);

// A sidecar as some OTHER writer leaves it — aeon's generator, or a hand edit —
// carrying the effects-arc scene assignment. Hand-written rather than built by
// serializeSectionMeta: a serializer that dropped sceneRef would drop it from
// the fixture too, and the test would pass while proving nothing.
const SCENE_META_ON_DISK = [
  '{',
  '  "bgLayoutRef": "bg-cave",',
  '  "paletteRef": "pal-dusk",',
  '  "sceneRef": "canopy_dusk"',
  '}',
].join('\n');

// ── Editable collision-plane fixture ────────────────────────────────────────
// The editable planes are only read when the act declares strip source, which
// the base fixture does not — hence a second project.json. Strip path A and
// path B are seeded with DIFFERENT bytes so the two baselines are
// distinguishable and no test can pass by inspecting the wrong twin.
const STRIP_PROJECT_JSON = {
  ...PROJECT_JSON,
  zones: [{
    ...PROJECT_JSON.zones[0],
    acts: [{ ...PROJECT_JSON.zones[0].acts[0], stripPath: 'data/ojz/act1/', stripPrefix: 'sec' }],
  }],
};

const COLL_A_PATH = 'data/ojz/act1/section_0.collattr.bin';
const COLL_B_PATH = 'data/ojz/act1/section_0.collattrb.bin';
/** The section's authoritative plane length in cells — the same figure the
 *  loader's own fallback uses (`engineColl.length`, one byte per section cell). */
const PLANE_CELLS = SECTION_TILES_WIDE * SECTION_TILES_HIGH;

function stripBytes(): Uint8Array {
  const NT_BYTES = STRIP_ROWS * 2;    // per column, ahead of the collision cells
  const COLL_CELLS = STRIP_ROWS / 2;  // one collision byte per 16px cell
  const buf = new Uint8Array(STRIP_COLS * WIDE_STRIP_SIZE);
  const word = (2 << 13) | 1;         // the tile the .tiles.bin fixture also uses
  buf[0] = word >> 8; buf[1] = word & 0xFF;
  buf[NT_BYTES] = 0x05;               // column 0, cell 0, path A
  buf[NT_BYTES + COLL_CELLS] = 0x06;  // ... path B — deliberately not A's byte
  return buf;
}

function stripFixtureFiles(): Map<string, Uint8Array> {
  const files = fixtureFiles();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(STRIP_PROJECT_JSON)));
  files.set('data/ojz/act1/sec0_strips_source.bin', stripBytes());
  return files;
}

/** An authored plane: air except hand-set cells at both ends, so a plane
 *  truncated anywhere loses one of them. `seed` distinguishes A from B. */
function authoredPlane(seed: number): Uint16Array {
  const w = new Uint16Array(PLANE_CELLS);
  w[0] = packCollisionCell({ shape: seed, xFlip: true, yFlip: false, solidity: 'top' });
  w[PLANE_CELLS - 1] = packCollisionCell({ shape: seed + 1, xFlip: false, yFlip: true, solidity: 'all' });
  return w;
}
const AUTHORED_A = authoredPlane(0x111);
const AUTHORED_B = authoredPlane(0x222);

/** memFa in which `denied` paths EXIST but cannot be read — a host fs error
 *  (EACCES), which is not the same fact as absence. */
function memFaDenying(files: Map<string, Uint8Array>, denied: Set<string>): FileAccess {
  const base = memFa(files);
  return {
    ...base,
    read: async (rel) => {
      if (denied.has(rel)) throw new Error(`EACCES: permission denied, open '${rel}'`);
      return base.read(rel);
    },
  };
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
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/objects\.json exists but could not be read/);
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
   * The effects-arc assignment ref (empyrean docs/AURORA_EFFECTS_SCHEMA.md §3 at
   * 1326ceb; aeon tools/EFFECTS_CONSUMER_CONTRACT.md §2.2 at 00607dd5): a string
   * scene id or null, loaded exactly like its two siblings.
   */
  it('loads sceneRef from the sidecar alongside the other refs', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(SCENE_META_ON_DISK));
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.sceneRef).toBe('canopy_dusk');
    expect(section.bgLayoutRef).toBe('bg-cave');   // siblings unaffected
    expect(section.paletteRef).toBe('pal-dusk');
    expect(section.unreadable).toBeUndefined();
    expect(r.notices).toEqual([]);
  });

  it('loads a sidecar whose only ref is sceneRef', async () => {
    const files = fixtureFiles();
    const onlyScene = serializeSectionMeta({ bgLayoutRef: null, paletteRef: null, sceneRef: 'canopy_dusk' })!;
    expect(onlyScene).toContain('canopy_dusk');   // anti-vacuous: really written
    files.set(META_PATH, new TextEncoder().encode(onlyScene));
    const r = await loadAeonProject(memFa(files), '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.sceneRef).toBe('canopy_dusk');
    expect(section.bgLayoutRef).toBeNull();
    expect(section.paletteRef).toBeNull();
    expect(section.unreadable).toBeUndefined();
  });

  it('leaves sceneRef null for a section with no sidecar', async () => {
    const files = fixtureFiles();
    expect(files.has(META_PATH)).toBe(false);
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(r.project.zones[0].acts[0].sections[0]!.sceneRef).toBeNull();
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
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/meta\.json exists but could not be read/);
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
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/tiles\.bin exists but could not be read/);
    if (section) expect(section.unreadable).toContain('tiles.bin');
  });

  it('rejects a non-s4 project.json with the loader error (validation is NOT weakened)', async () => {
    const files = fixtureFiles();
    files.set('project.json', new TextEncoder().encode(JSON.stringify({ ...PROJECT_JSON, engine: 'nope' })));
    await expect(loadAeonProject(memFa(files), '/proj')).rejects.toThrow(/expected engine "s4"/i);
  });
});

/**
 * R7 for the editable collision planes — the last two section artifacts that
 * were gated by neither markUnreadable() nor understood().
 *
 * Two distinct failures reach the same place. A read that THROWS (EACCES on a
 * present file) hit a bare catch that substituted the baked strip baseline with
 * no notice; and a read that SUCCEEDS on a truncated file never reached the
 * catch at all, because parseCollAttr does no length checking — it returns a
 * SHORT plane, which serializeCollAttr then writes back short.
 */
describe('loadAeonProject — editable collision planes', () => {
  async function loadSection(fa: FileAccess) {
    const r = await loadAeonProject(fa, '/proj');
    return { r, section: r.project.zones[0].acts[0].sections[0]! };
  }

  it('seeds both planes from the strips when no .collattr.bin exists, silently', async () => {
    const files = stripFixtureFiles();
    expect(files.has(COLL_A_PATH)).toBe(false);
    expect(files.has(COLL_B_PATH)).toBe(false);

    const { r, section } = await loadSection(memFa(files));
    expect(section.collisionEdit!.length).toBe(PLANE_CELLS);
    expect(section.collisionEditB!.length).toBe(PLANE_CELLS);
    // The strips really seeded something, and the two planes really differ —
    // otherwise every A/B assertion below would be vacuous.
    expect(section.collisionEdit![0]).not.toBe(0);
    expect(section.collisionEdit![0]).not.toBe(section.collisionEditB![0]);
    expect(section.unreadable).toBeUndefined();
    expect(r.notices).toEqual([]);
  });

  it('has authored fixtures that are genuinely not the baseline, and not each other', async () => {
    const { section } = await loadSection(memFa(stripFixtureFiles()));
    expect(AUTHORED_A).not.toEqual(section.collisionEdit!);
    expect(AUTHORED_B).not.toEqual(section.collisionEditB!);
    expect(AUTHORED_A).not.toEqual(AUTHORED_B);
    expect(serializeCollAttr(AUTHORED_A).length).toBe(PLANE_CELLS * 2);
  });

  it('loads well-formed authored planes over the strip baseline', async () => {
    const files = stripFixtureFiles();
    files.set(COLL_A_PATH, serializeCollAttr(AUTHORED_A));
    files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));

    const { r, section } = await loadSection(memFa(files));
    expect(section.collisionEdit!).toEqual(AUTHORED_A);
    expect(section.collisionEditB!).toEqual(AUTHORED_B);
    expect(section.unreadable).toBeUndefined();
    expect(r.notices).toEqual([]);
  });

  it('flags a .collattr.bin it could not read instead of substituting the baseline', async () => {
    const files = stripFixtureFiles();
    files.set(COLL_A_PATH, serializeCollAttr(AUTHORED_A));
    files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));

    const { r, section } = await loadSection(memFaDenying(files, new Set([COLL_A_PATH])));
    expect(section.unreadable).toContain('collattr.bin');
    expect(section.unreadable).not.toContain('collattrb.bin');  // the twin was fine
    expect(section.collisionEditB!).toEqual(AUTHORED_B);        // ... and still loaded
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/section_0\.collattr\.bin exists but could not be read/);
    // The editor still needs something to draw.
    expect(section.collisionEdit!.length).toBe(PLANE_CELLS);
  });

  it('flags a .collattrb.bin it could not read instead of substituting the baseline', async () => {
    const files = stripFixtureFiles();
    files.set(COLL_A_PATH, serializeCollAttr(AUTHORED_A));
    files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));

    const { r, section } = await loadSection(memFaDenying(files, new Set([COLL_B_PATH])));
    expect(section.unreadable).toContain('collattrb.bin');
    expect(section.unreadable).not.toContain('collattr.bin');
    expect(section.collisionEdit!).toEqual(AUTHORED_A);
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/section_0\.collattrb\.bin exists but could not be read/);
    expect(section.collisionEditB!.length).toBe(PLANE_CELLS);
  });

  it('flags a truncated .collattr.bin rather than accepting a short plane', async () => {
    const files = stripFixtureFiles();
    const full = serializeCollAttr(AUTHORED_A);
    const truncated = full.slice(0, full.length - 128);   // 64 whole cells lost
    expect(truncated.length).toBeLessThan(PLANE_CELLS * 2);
    files.set(COLL_A_PATH, truncated);
    files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));

    const { r, section } = await loadSection(memFa(files));
    expect(section.unreadable).toContain('collattr.bin');
    expect(section.unreadable).not.toContain('collattrb.bin');
    expect(section.collisionEditB!).toEqual(AUTHORED_B);
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/section_0\.collattr\.bin exists but could not be read/);
    // Never a short plane in memory: a short plane is what the save writes back.
    expect(section.collisionEdit!.length).toBe(PLANE_CELLS);
  });

  it('flags a truncated .collattrb.bin rather than accepting a short plane', async () => {
    const files = stripFixtureFiles();
    const full = serializeCollAttr(AUTHORED_B);
    const truncated = full.slice(0, full.length - 128);
    expect(truncated.length).toBeLessThan(PLANE_CELLS * 2);
    files.set(COLL_A_PATH, serializeCollAttr(AUTHORED_A));
    files.set(COLL_B_PATH, truncated);

    const { r, section } = await loadSection(memFa(files));
    expect(section.unreadable).toContain('collattrb.bin');
    expect(section.unreadable).not.toContain('collattr.bin');
    expect(section.collisionEdit!).toEqual(AUTHORED_A);
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/section_0\.collattrb\.bin exists but could not be read/);
    expect(section.collisionEditB!.length).toBe(PLANE_CELLS);
  });

  it('flags an odd-length .collattr.bin, whose trailing byte the word loop drops', async () => {
    const files = stripFixtureFiles();
    const odd = serializeCollAttr(AUTHORED_A).slice(0, PLANE_CELLS * 2 - 129);
    expect(odd.length % 2).toBe(1);
    files.set(COLL_A_PATH, odd);

    const { r, section } = await loadSection(memFa(files));
    expect(section.unreadable).toContain('collattr.bin');
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/section_0\.collattr\.bin exists but could not be read/);
    expect(section.collisionEdit!.length).toBe(PLANE_CELLS);
  });

  it('flags an over-long .collattr.bin rather than silently dropping the tail', async () => {
    const files = stripFixtureFiles();
    const long = new Uint8Array(PLANE_CELLS * 2 + 64);
    long.set(serializeCollAttr(AUTHORED_A));
    long[PLANE_CELLS * 2] = 0xAB;   // a cell this section has no room for
    files.set(COLL_A_PATH, long);

    const { r, section } = await loadSection(memFa(files));
    expect(section.unreadable).toContain('collattr.bin');
    expect(r.notices.map((x) => x.message).join(' ')).toMatch(/section_0\.collattr\.bin exists but could not be read/);
    expect(section.collisionEdit!.length).toBe(PLANE_CELLS);
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
