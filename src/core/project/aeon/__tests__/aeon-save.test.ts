import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeSectionMeta, parseSectionMeta } from '../../../formats/section-meta';
import { serializeCollAttr } from '../../../formats/s4-collattr';
import { STRIP_ROWS, STRIP_COLS, WIDE_STRIP_SIZE } from '../../../formats/s4-strips';
import { packCollisionCell } from '../../../collision/collision-cell-word';
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
const META_REFS = { bgLayoutRef: 'bg-cave', paletteRef: 'pal-dusk', sceneRef: null };
const WELL_FORMED_META = serializeSectionMeta(META_REFS)!;
const MALFORMED_META = WELL_FORMED_META.slice(0, -1);  // truncated hand-edit

// A sidecar as some OTHER writer leaves it — aeon's generator, or a hand edit —
// carrying the effects-arc scene assignment. Hand-written rather than built by
// serializeSectionMeta: a serializer that dropped sceneRef would drop it from
// the fixture too, and a byte comparison against that fixture would pass while
// the key was being erased. This text is the contract's example body
// (empyrean docs/AURORA_EFFECTS_SCHEMA.md §3 at 1326ceb).
const SCENE_META_ON_DISK = [
  '{',
  '  "bgLayoutRef": "bg-cave",',
  '  "paletteRef": "pal-dusk",',
  '  "sceneRef": "canopy_dusk"',
  '}',
].join('\n');

// ── Editable collision-plane fixture, as in aeon-load.test.ts ───────────────
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

/** A strip fixture carrying both authored planes, well-formed. */
function authoredFixture(): Map<string, Uint8Array> {
  const files = stripFixtureFiles();
  files.set(COLL_A_PATH, serializeCollAttr(AUTHORED_A));
  files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));
  return files;
}

/** As loadSaveApply, but over a caller-supplied adapter, so a test can make a
 *  present file unreadable without changing what is on disk. */
async function loadSaveApplyVia(
  fa: FileAccess,
  files: Map<string, Uint8Array>,
): Promise<Map<string, Uint8Array>> {
  const r = await loadAeonProject(fa, '/proj');
  const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
    { legacyAtlasMerged: r.legacyAtlasMerged });
  const out = new Map(files);
  for (const f of plan.files) out.set(f.path, f.bytes);
  return out;
}

/** Load `files`, plan a save, and apply the plan — the resulting on-disk map. */
async function loadSaveApply(files: Map<string, Uint8Array>): Promise<Map<string, Uint8Array>> {
  return loadSaveApplyVia(memFa(files), files);
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
    expect(parseSectionMeta(text(written!.bytes)!)).toEqual({ bgLayoutRef: null, paletteRef: null, sceneRef: null });
  });

  // ---- sceneRef: the effects-arc assignment ref ----------------------------

  /**
   * THE contract property, measured on bytes on disk: a sidecar carrying
   * sceneRef survives load -> save unchanged. Named as a requirement rather
   * than an implementation detail in both halves — empyrean
   * docs/AURORA_EFFECTS_SCHEMA.md §3/§6/§8 at 1326ceb ("parse->serialize must
   * preserve `sceneRef`") and aeon tools/EFFECTS_CONSUMER_CONTRACT.md §2.2 at
   * 00607dd5 — because parse builds a fresh object from keys it enumerates and
   * serialize emits only what it enumerates, so a key either side misses is
   * erased on the next save with no error anywhere.
   */
  it('round-trips a sceneRef sidecar byte-for-byte through load -> save', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(SCENE_META_ON_DISK));
    // Anti-vacuous on disk: the subject really is present, and really non-null.
    expect(text(files.get(META_PATH))).toContain('"sceneRef": "canopy_dusk"');

    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    // Anti-vacuous in memory: the load understood the file AND carries the ref,
    // so the save below is exercising a preserved value, not a re-emitted null.
    expect(section.unreadable).toBeUndefined();
    expect(section.sceneRef).toBe('canopy_dusk');

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(text(written!.bytes)).toBe(SCENE_META_ON_DISK);
  });

  /**
   * The same property where the other two refs cannot carry it. A three-ref
   * document stays a non-empty, byte-stable file even if the sceneRef arm is
   * broken at the write-condition site; a sceneRef-only section does not — with
   * that site unaware of sceneRef the whole sidecar stops being written.
   */
  it('writes a sidecar for a section whose only ref is sceneRef', async () => {
    const files = fixtureFiles();
    expect(files.has(META_PATH)).toBe(false);       // no sidecar to start from
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.bgLayoutRef).toBeNull();         // genuinely all-default...
    expect(section.paletteRef).toBeNull();
    section.sceneRef = 'canopy_dusk';               // ...but for this one ref

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(JSON.parse(text(written!.bytes)!)).toEqual({
      bgLayoutRef: null, paletteRef: null, sceneRef: 'canopy_dusk',
    });
  });

  /**
   * The cleared-overwrite body is its own hardcoded literal, separate from the
   * serializer, and a third ref missing from it resurrects on the next load.
   */
  it('names sceneRef in the cleared-overwrite body', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(SCENE_META_ON_DISK));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.sceneRef).toBe('canopy_dusk');   // there was something to clear
    section.bgLayoutRef = null;
    section.paletteRef = null;
    section.sceneRef = null;

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(text(written!.bytes)).toContain('"sceneRef"');
    expect(JSON.parse(text(written!.bytes)!)).toEqual({
      bgLayoutRef: null, paletteRef: null, sceneRef: null,
    });
  });

  /**
   * The understood('meta.json') gate from a88db05 still holds with three refs:
   * a sidecar Aurora could not parse is left exactly as the user left it, scene
   * assignment included.
   */
  it('leaves an unreadable sidecar carrying a sceneRef byte-identical', async () => {
    const malformed = SCENE_META_ON_DISK.slice(0, -1);   // truncated hand-edit
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(malformed));
    // Anti-vacuous: really unparseable, and really carrying the ref it would lose.
    expect(() => JSON.parse(malformed)).toThrow();
    expect(malformed).toContain('canopy_dusk');

    const out = await loadSaveApply(files);
    expect(text(out.get(META_PATH))).toBe(malformed);
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

/**
 * R7 for the editable collision planes, measured where it hurts: the bytes on
 * disk after a load→save round trip.
 *
 * Both writes were gated on `section.collisionEdit` / `collisionEditB` alone,
 * and the load's catch assigns a real Uint16Array — so those gates are ALWAYS
 * truthy and an authored plane Aurora could not read was overwritten with the
 * baked strip baseline. Truncation is worse still: it never reaches the catch,
 * so the short plane is written back short and certified as the section's.
 */
describe('buildAeonSavePlan — editable collision planes', () => {
  /** The baseline bytes a section with no authored planes saves — precisely what
   *  an unreadable plane must NOT be replaced by. */
  async function baselineBytes(path: string): Promise<Uint8Array> {
    const out = await loadSaveApply(stripFixtureFiles());
    return out.get(path)!;
  }

  it('writes a well-formed pair back byte-identical, twice over', async () => {
    const files = authoredFixture();
    const before = files.get(COLL_A_PATH)!;
    // Anti-vacuous: the authored planes are really on disk and really are not
    // the baseline the save would otherwise emit.
    expect(before.length).toBe(PLANE_CELLS * 2);
    expect(before).not.toEqual(await baselineBytes(COLL_A_PATH));

    const out = await loadSaveApply(files);
    const outAgain = await loadSaveApply(files);
    expect(outAgain.get(COLL_A_PATH)!).toEqual(out.get(COLL_A_PATH)!);   // zero, or we
    expect(outAgain.get(COLL_B_PATH)!).toEqual(out.get(COLL_B_PATH)!);   // measure noise
    expect(out.get(COLL_A_PATH)!).toEqual(serializeCollAttr(AUTHORED_A));
    expect(out.get(COLL_B_PATH)!).toEqual(serializeCollAttr(AUTHORED_B));
  });

  it('leaves a .collattr.bin it could not read byte-identical, as a well-formed one is', async () => {
    const good = authoredFixture();
    const bad = authoredFixture();
    const authoredABytes = bad.get(COLL_A_PATH)!;
    const baselineA = await baselineBytes(COLL_A_PATH);
    expect(authoredABytes).not.toEqual(baselineA);   // there is something to lose

    const goodOut = await loadSaveApply(good);
    const goodOutAgain = await loadSaveApply(good);
    const badOut = await loadSaveApplyVia(memFaDenying(bad, new Set([COLL_A_PATH])), bad);

    // Known-good path against itself first: zero difference, or the comparison
    // below is measuring nondeterminism rather than damage.
    expect(goodOutAgain.get(COLL_A_PATH)!).toEqual(goodOut.get(COLL_A_PATH)!);
    expect(goodOut.get(COLL_A_PATH)!).toEqual(authoredABytes);
    // The damaged path: untouched, NOT replaced by the strip baseline.
    expect(badOut.get(COLL_A_PATH)!).toEqual(authoredABytes);
    // ... and its twin, which read fine, still saves normally.
    expect(badOut.get(COLL_B_PATH)!).toEqual(serializeCollAttr(AUTHORED_B));
  });

  it('leaves a .collattrb.bin it could not read byte-identical, as a well-formed one is', async () => {
    const good = authoredFixture();
    const bad = authoredFixture();
    const authoredBBytes = bad.get(COLL_B_PATH)!;
    const baselineB = await baselineBytes(COLL_B_PATH);
    expect(authoredBBytes).not.toEqual(baselineB);

    const goodOut = await loadSaveApply(good);
    const goodOutAgain = await loadSaveApply(good);
    const badOut = await loadSaveApplyVia(memFaDenying(bad, new Set([COLL_B_PATH])), bad);

    expect(goodOutAgain.get(COLL_B_PATH)!).toEqual(goodOut.get(COLL_B_PATH)!);
    expect(goodOut.get(COLL_B_PATH)!).toEqual(authoredBBytes);
    expect(badOut.get(COLL_B_PATH)!).toEqual(authoredBBytes);
    expect(badOut.get(COLL_A_PATH)!).toEqual(serializeCollAttr(AUTHORED_A));
  });

  it('does not shave a byte off an odd-length .collattr.bin on the way past', async () => {
    // The byte-visible half of the truncation defect: `data.length >> 1` drops
    // the trailing byte, and the save writes `words.length * 2` back — so the
    // file on disk comes out ONE BYTE SHORTER than Aurora found it.
    const files = stripFixtureFiles();
    const odd = serializeCollAttr(AUTHORED_A).slice(0, PLANE_CELLS * 2 - 129);
    expect(odd.length % 2).toBe(1);
    files.set(COLL_A_PATH, odd);
    files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));

    const out = await loadSaveApply(files);
    expect(out.get(COLL_A_PATH)!.length).toBe(odd.length);
    expect(out.get(COLL_A_PATH)!).toEqual(odd);
    expect(out.get(COLL_B_PATH)!).toEqual(serializeCollAttr(AUTHORED_B));  // twin unharmed
  });

  it('never writes back a .collattr.bin that is not the section plane length', async () => {
    const files = stripFixtureFiles();
    const truncated = serializeCollAttr(AUTHORED_A).slice(0, PLANE_CELLS * 2 - 128);
    files.set(COLL_A_PATH, truncated);
    files.set(COLL_B_PATH, serializeCollAttr(AUTHORED_B));

    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.unreadable).toContain('collattr.bin');

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    expect(plan.files.find((f) => f.path === COLL_A_PATH)).toBeUndefined();
    // One file, not a veto: the twin and the rest of the section still write.
    const b = plan.files.find((f) => f.path === COLL_B_PATH);
    expect(b!.bytes).toEqual(serializeCollAttr(AUTHORED_B));
    expect(plan.files.map((f) => f.path)).toContain('data/ojz/act1/section_0.tiles.bin');
  });

  it('never writes back a .collattrb.bin that is not the section plane length', async () => {
    const files = stripFixtureFiles();
    const truncated = serializeCollAttr(AUTHORED_B).slice(0, PLANE_CELLS * 2 - 128);
    files.set(COLL_A_PATH, serializeCollAttr(AUTHORED_A));
    files.set(COLL_B_PATH, truncated);

    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.unreadable).toContain('collattrb.bin');

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    expect(plan.files.find((f) => f.path === COLL_B_PATH)).toBeUndefined();
    const a = plan.files.find((f) => f.path === COLL_A_PATH);
    expect(a!.bytes).toEqual(serializeCollAttr(AUTHORED_A));
    expect(plan.files.map((f) => f.path)).toContain('data/ojz/act1/section_0.tiles.bin');
  });

  it('still saves the strip-seeded planes for a section that never had a .collattr.bin', async () => {
    const files = stripFixtureFiles();
    expect(files.has(COLL_A_PATH)).toBe(false);
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    expect(r.project.zones[0].acts[0].sections[0]!.unreadable).toBeUndefined();

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    const a = plan.files.find((f) => f.path === COLL_A_PATH);
    const b = plan.files.find((f) => f.path === COLL_B_PATH);
    expect(a!.bytes.length).toBe(PLANE_CELLS * 2);
    expect(b!.bytes.length).toBe(PLANE_CELLS * 2);
    expect(a!.bytes).not.toEqual(b!.bytes);   // the two planes really are distinct
  });
});
