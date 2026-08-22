import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeSectionMeta, parseSectionMeta } from '../../../formats/section-meta';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

// Fixture helpers copied VERBATIM from aeon-load.test.ts (tests must not import
// each other).
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

// Meta-sidecar fixture, as in aeon-load.test.ts: the well-formed text comes from
// the serializer so it is the exact shape a previous save would have left.
const META_PATH = 'data/ojz/act1/section_0.meta.json';
const META_REFS = { bgLayoutRef: 'bg-cave', paletteRef: 'pal-dusk' };
const WELL_FORMED_META = serializeSectionMeta(META_REFS)!;
const MALFORMED_META = WELL_FORMED_META.slice(0, -1);  // truncated hand-edit

/** Load `files`, plan a save, and apply the plan — the resulting on-disk map. */
async function loadSaveApply(files: Map<string, Uint8Array>): Promise<Map<string, Uint8Array>> {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
    { legacyAtlasMerged: r.legacyAtlasMerged });
  const out = new Map(files);
  for (const f of plan.files) out.set(f.path, f.bytes);
  return out;
}

function text(bytes: Uint8Array | undefined): string | undefined {
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

describe('buildAeonSavePlan', () => {
  it('emits the per-section files, the editor-owned tileset, and a retargeted project.json', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('data/ojz/act1/section_0.objects.json');
    expect(paths).toContain('data/ojz/act1/section_0.rings.json');
    // Tileset is retargeted to the editor-owned path and project.json rewritten to match.
    expect(paths).toContain('data/editor/ojz_tiles.bin');
    expect(plan.configChanged).toBe(true);
    expect(paths).toContain('project.json');
    const projJson = JSON.parse(new TextDecoder().decode(plan.files.find((f) => f.path === 'project.json')!.bytes));
    expect(projJson.zones[0].tileset).toBe('data/editor/ojz_tiles.bin');
  });

  it('round-trips: loading the planned bytes reproduces the section nametable', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    // Apply the plan to a fresh in-memory project dir and re-load.
    const files2 = fixtureFiles();
    for (const f of plan.files) files2.set(f.path, f.bytes);
    const r2 = await loadAeonProject(memFa(files2), '/proj');
    expect(Array.from(r2.project.zones[0].acts[0].sections[0]!.tileGrid.nametable))
      .toEqual(Array.from(r.project.zones[0].acts[0].sections[0]!.tileGrid.nametable));
  });

  it('never truncates the legacy atlas when it aliases a live tileset or migration did not run', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    // No chunkLibraryPath in the fixture AND merge didn't run → no zero-length truncation write.
    expect(plan.files.some((f) => f.bytes.length === 0)).toBe(false);
  });

  /**
   * R7, the other half. A file the load could not read holds a PLACEHOLDER in
   * memory, not the user's data. Writing it back is how a truncated hand-edit
   * or a merge-conflict marker in objects.json becomes a permanent loss of
   * every placement in the section — the plan must leave that file alone.
   */
  it('omits a file the load could not understand, and still writes the rest', async () => {
    const files = fixtureFiles();
    files.set('data/ojz/act1/section_0.objects.json',
      new TextEncoder().encode('[{"id":"o1",<<<<<<< HEAD'));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    expect(r.project.zones[0].acts[0].sections[0]!.unreadable).toContain('objects.json');

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const paths = plan.files.map((f) => f.path);
    expect(paths).not.toContain('data/ojz/act1/section_0.objects.json');
    // The section's other files are unaffected — this is one file, not a veto.
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('data/ojz/act1/section_0.rings.json');
  });

  /**
   * R7 for the meta sidecar, measured where it hurts: the bytes on disk. Two
   * ways to the same destination from one starting fixture — a well-formed
   * sidecar (known good) and a malformed one (under test) — then diff. The
   * known-good path is also run against itself: that difference must be zero,
   * or the comparison is measuring nondeterminism rather than damage.
   */
  it('leaves an unreadable meta sidecar byte-identical, as a well-formed one is', async () => {
    const good = fixtureFiles();
    good.set(META_PATH, new TextEncoder().encode(WELL_FORMED_META));
    const bad = fixtureFiles();
    bad.set(META_PATH, new TextEncoder().encode(MALFORMED_META));
    // Anti-vacuous: both starting states really carry the refs, on disk, and the
    // one under test really is unparseable.
    expect(text(bad.get(META_PATH))).toContain(META_REFS.bgLayoutRef);
    expect(text(bad.get(META_PATH))).toContain(META_REFS.paletteRef);
    expect(() => JSON.parse(MALFORMED_META)).toThrow();

    const goodOut = await loadSaveApply(good);
    const goodOutAgain = await loadSaveApply(good);
    const badOut = await loadSaveApply(bad);

    expect(text(goodOutAgain.get(META_PATH))).toBe(text(goodOut.get(META_PATH)));
    expect(text(goodOut.get(META_PATH))).toBe(WELL_FORMED_META);
    expect(text(badOut.get(META_PATH))).toBe(MALFORMED_META);
  });

  it('omits an unparseable meta sidecar from the plan, and still writes the rest', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(MALFORMED_META));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    expect(r.project.zones[0].acts[0].sections[0]!.unreadable).toContain('meta.json');

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const paths = plan.files.map((f) => f.path);
    expect(paths).not.toContain(META_PATH);
    // One file, not a veto.
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('data/ojz/act1/section_0.rings.json');
  });

  it('still clears an understood sidecar whose refs were cleared in-session', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(WELL_FORMED_META));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.bgLayoutRef).toBe(META_REFS.bgLayoutRef);   // the load understood it
    section.bgLayoutRef = null;
    section.paletteRef = null;

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(parseSectionMeta(text(written!.bytes)!)).toEqual({ bgLayoutRef: null, paletteRef: null });
  });

  it('creates no sidecar for the ordinary all-default section', async () => {
    const files = fixtureFiles();
    expect(files.has(META_PATH)).toBe(false);
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');  // anti-vacuous
    expect(paths).not.toContain(META_PATH);
  });

  // The export step was retired 2026-08-19 (ROADMAP §4.2): it emitted
  // `{dataPath}export/` outputs — act_descriptor.asm, entity_data.asm,
  // vram_bases.asm, section_N.{tiles,art}.bin — that nothing in aeon reads.
  // The two tests this replaces asserted the failure REPORTING of that step
  // (exportError null on success, "VRAM overflow" on a >1024-tile union).
  //
  // This guards the retirement in the direction that can regress: a save plan
  // that starts emitting engine assembly again. The path prefix is derived from
  // the act's own dataPath rather than pinned, so moving the act moves the guard.
  it('writes editor files only — no engine assembly, nothing under export/', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const paths = plan.files.map((f) => f.path);

    // Anti-vacuous: a plan that wrote nothing would pass every assertion below.
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('project.json');

    const dataPath = r.config.zones.find((z) => z.id === 'ojz')!
      .acts.find((a) => a.id === 'act1')!.dataPath;
    expect(paths.filter((p) => p.startsWith(`${dataPath}export/`))).toEqual([]);
    expect(paths.filter((p) => p.endsWith('.asm'))).toEqual([]);
    expect(paths.filter((p) => p.endsWith('.art.bin'))).toEqual([]);
  });
});
