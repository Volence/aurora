import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeBgLibraryIndex, parseBgLibraryIndex } from '../../../formats/bg-library';
import { serializeBgTiles, BG_WIDTH } from '../../../formats/bg-tiles';
import { serializeTiles } from '../../../export/tile-dedup';
import { serializeSectionMeta, parseSectionMeta } from '../../../formats/section-meta';
import { serializeCollAttr, parseCollAttr } from '../../../formats/s4-collattr';
import { cellTileIndices, cellCrossoverIndices } from '../../../collision/collision-cell';
import { withCrossover, readCrossover } from '../../../collision/layer-transition';
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

// Meta-sidecar fixture, as in aeon-load.test.ts: the well-formed text comes from
// the serializer so it is the exact shape a previous save would have left.
const META_PATH = 'data/ojz/act1/section_0.meta.json';
const META_REFS = { bgLayoutRef: 'bg-cave', paletteRef: 'pal-dusk', rasterRef: null, sceneRef: null };
const WELL_FORMED_META = serializeSectionMeta(META_REFS)!;
// Truncated hand-edit: two bytes, not one — the well-formed text ends in the
// canonical `}\n` (§8), and dropping only the newline leaves valid JSON.
const MALFORMED_META = WELL_FORMED_META.slice(0, -2);

// A sidecar as the OTHER writer really leaves it: the VERBATIM bytes of aeon's
//   games/sonic4/data/editor/ojz/act1/section_0.meta.json
// at aeon `origin/master` `d78f9090` (2026-09-02), read through git objects
// (`git show d78f9090:<path> | cat -A`), never a checkout — 108 bytes,
// sha256 3b375c4e884e2ea97a0392f26fa5a5833deab2606c98040ecf08b373ee8227b9.
//
// THREE keys, and no trailing newline. **aeon's writer does not emit
// `rasterRef`**: of the only three sidecars that have ever existed on any aeon
// ref, two (section_0, section_4) LACK the key entirely and one (section_5)
// carries a string; NONE carries an explicit `"rasterRef": null`
// (docs/reviews/2026-09-02-rasterref-absent-save.md §1, and the pin in
// aeon-save.rasterref-absent.test.ts). This fixture used to be a hand-invented
// body that was widened at `3674d85a` to carry `"rasterRef": null` while still
// claiming to be "the contract's example body (§3 at 1326ceb)" — it was neither:
// §3's example body at 1326ceb has three keys and no `rasterRef`, and no other
// writer emits that spelling. section_0 is the file that body was drawn from
// (its `bgLayoutRef` is §3's example value, verbatim), so the lineage survives
// re-origination.
//
// Why section_0 and not section_4: both lack `rasterRef` and carry a non-null
// `sceneRef`, but section_0 is the only real body with a non-null SIBLING ref,
// so the round-trip below keeps proving that `sceneRef` survives ALONGSIDE
// another ref rather than as a lone key — and META_PATH below is literally
// `section_0.meta.json`, so fixture and path now name the same real file. Its
// price is the second, already-ruled canonicalisation (the §8 trailing newline),
// which `canonicalisedByAurora` derives rather than types.
//
// Still not built by serializeSectionMeta: a fixture the writer under test
// produces drops whatever that writer drops, and the byte comparison would pass
// while the key was being erased.
const SCENE_META_ON_DISK = [
  '{',
  '  "bgLayoutRef": "ingame-forest-v15-1786630615596",',
  '  "paletteRef": null,',
  '  "sceneRef": "ojz_act1_start"',
  '}',
].join('\n');

/** The anchor the inserted key sorts after, and the line Aurora's writer adds. */
const PALETTE_NULL_LINE = '  "paletteRef": null,\n';
const RASTER_NULL_LINE = '  "rasterRef": null,\n';

/**
 * What the contract rules Aurora's writer may change about an aeon sidecar,
 * DERIVED from the fixture text — never typed as a second golden, which would
 * agree with a broken writer the moment someone updated it to match.
 *
 * Exactly two canonicalisations, both already adjudicated and measured:
 *   1. `"rasterRef": null` inserted in sorted position, because the model has no
 *      "absent" (`section-meta.ts` folds absent -> null on load) and schema §3.1
 *      rules absent and explicit-null THE SAME STATE. Measured in
 *      docs/reviews/2026-09-02-rasterref-absent-save.md §2 and pinned in
 *      aeon-save.rasterref-absent.test.ts.
 *   2. the §8 canonical trailing newline, if the file lacked it.
 * Anything else the writer does to these bytes is a defect and goes red here.
 */
function canonicalisedByAurora(onDisk: string): string {
  // Anti-vacuous: the anchor really is there exactly once, and there really is
  // nothing to canonicalise twice.
  expect(onDisk.split(PALETTE_NULL_LINE)).toHaveLength(2);
  expect(onDisk).not.toContain('"rasterRef"');
  const body = onDisk.replace(PALETTE_NULL_LINE, PALETTE_NULL_LINE + RASTER_NULL_LINE);
  return body.endsWith('\n') ? body : body + '\n';
}

// The same document with the raster-preset binding SET — schema §3.1's example
// body VERBATIM (all four values, adjudicated 2026-08-30 at empyrean
// `da91abce`), re-sorted into the canonical key order §3.1's own last bullet
// mandates ("§8: sort_keys=True, indent=2, exactly one trailing \n"); the
// example in the prose is written sceneRef-before-rasterRef. It said `bg-cave`
// here until 2026-09-02, which made the "§3.1's own example body" citation
// false in the same small way the sceneRef fixture's §3 citation was.
//
// NOT re-originated from aeon like SCENE_META_ON_DISK above, deliberately.
// aeon's one real rasterRef body is section_5.meta.json at origin/master
// d78f9090 — {bgLayoutRef: null, paletteRef: null, rasterRef:
// "ojz_sec5_showcase", sceneRef: null} — and adopting it would DELETE the
// sibling assertions below (`section.sceneRef === 'canopy_dusk'`, "did not eat
// its sibling"), which are the whole reason a rasterRef fixture exists: nothing
// in Aurora authors this key, so a drop is invisible everywhere else. There is
// also nothing stale to correct — section_5 is already the four-key canonical
// form, so unlike the sceneRef fixture this one does not claim a spelling no
// writer produces.
//
// Hand-written for the same reason as the one above: a serializer that dropped
// `rasterRef` would drop it from a serializer-built fixture too, and the byte
// comparison would pass while the key was being erased.
const RASTER_META_ON_DISK = [
  '{',
  '  "bgLayoutRef": "ingame-forest-v15-1786630615596",',
  '  "paletteRef": null,',
  '  "rasterRef": "canopy_tint",',
  '  "sceneRef": "canopy_dusk"',
  '}',
  '',
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

/** Put `onDisk` at META_PATH, load, plan a save with NO edit, and return the
 *  sidecar bytes the plan would write — the exact pair state/aeon-save.ts drives
 *  for an untouched section. Throws if the plan writes no sidecar at all. */
async function savedSidecarFrom(onDisk: string): Promise<string> {
  const files = fixtureFiles();
  files.set(META_PATH, new TextEncoder().encode(onDisk));
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
    { legacyAtlasMerged: r.legacyAtlasMerged });
  const written = plan.files.filter((f) => f.path === META_PATH);
  expect(written).toHaveLength(1);
  return new TextDecoder().decode(written[0]!.bytes);
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
    expect(parseSectionMeta(text(written!.bytes)!))
      .toEqual({ bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null });
  });

  // ---- sceneRef: the effects-arc assignment ref ----------------------------

  /**
   * THE contract property, measured on bytes on disk: a sidecar carrying
   * sceneRef survives load -> save with the ref intact and nothing else touched
   * but the two ruled canonicalisations. Named as a requirement rather than an
   * implementation detail in both halves — empyrean
   * docs/AURORA_EFFECTS_SCHEMA.md §3/§6/§8 at 1326ceb ("parse->serialize must
   * preserve `sceneRef`") and aeon tools/EFFECTS_CONSUMER_CONTRACT.md §2.2 at
   * 00607dd5 — because parse builds a fresh object from keys it enumerates and
   * serialize emits only what it enumerates, so a key either side misses is
   * erased on the next save with no error anywhere.
   *
   * The expectation is DERIVED from the on-disk bytes by `canonicalisedByAurora`
   * (one inserted line, plus the §8 tail), so a serializer that dropped
   * `sceneRef`, dropped `rasterRef`, or added a fourth key all go red here.
   */
  it('round-trips a sceneRef sidecar through load -> save, changing only the ruled canonicalisation', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(SCENE_META_ON_DISK));
    // Anti-vacuous on disk: the subject really is present, and really non-null.
    expect(text(files.get(META_PATH))).toContain('"sceneRef": "ojz_act1_start"');

    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    // Anti-vacuous in memory: the load understood the file AND carries the ref,
    // so the save below is exercising a preserved value, not a re-emitted null.
    expect(section.unreadable).toBeUndefined();
    expect(section.sceneRef).toBe('ojz_act1_start');

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(text(written!.bytes)).toBe(canonicalisedByAurora(SCENE_META_ON_DISK));
  });

  /**
   * The half that makes "one-time canonicalisation" (§8's own words for the
   * trailing-newline flip) TRUE rather than a hopeful adjective: saving the
   * canonical output again is a byte no-op. Without this row a writer that
   * churned the file on every save — inserting a line, reordering keys, adding
   * or removing the tail each time — would still satisfy the row above, and
   * aeon's tree would gain a diff on every no-edit save forever.
   */
  it('canonicalises exactly once — re-saving the canonical body is a byte no-op', async () => {
    const first = await savedSidecarFrom(SCENE_META_ON_DISK);
    expect(first).toBe(canonicalisedByAurora(SCENE_META_ON_DISK));   // the one-time step
    expect(first).not.toBe(SCENE_META_ON_DISK);                      // anti-vacuous: it really moved
    const second = await savedSidecarFrom(first);
    expect(second).toBe(first);                                      // ...and then stops
    expect(second).toContain('"sceneRef": "ojz_act1_start"');         // still carrying the subject
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
      bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: 'canopy_dusk',
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
    expect(section.sceneRef).toBe('ojz_act1_start');   // there was something to clear
    section.bgLayoutRef = null;
    section.paletteRef = null;
    section.sceneRef = null;

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(text(written!.bytes)).toContain('"sceneRef"');
    expect(JSON.parse(text(written!.bytes)!)).toEqual({
      bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null,
    });
  });

  // ---- rasterRef: the per-section raster-preset binding (schema §3.1) -------
  // The same three properties as sceneRef above, and they need their OWN rows
  // rather than a widened fixture: NOTHING IN AURORA AUTHORS `rasterRef`, so
  // every guard on it has to construct the value itself. That is exactly the
  // condition under which a ref gets dropped and no one notices — the hazard
  // §6 item 1 names, and the reason aeon's lane is blocked on this landing.

  /**
   * THE contract property for the new key, measured on bytes on disk: a sidecar
   * carrying `rasterRef` survives load -> save unchanged, alongside `sceneRef`
   * and `bgLayoutRef` (empyrean docs/AURORA_EFFECTS_SCHEMA.md §3.1 at
   * `da91abce`; the aeon half of the §8 amend is NOT landed yet — `rasterRef`
   * appears zero times in tools/EFFECTS_CONSUMER_CONTRACT.md at aeon
   * origin/master `8f670d5f`, which is the sequencing precondition working).
   */
  it('round-trips a rasterRef sidecar byte-for-byte through load -> save', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(RASTER_META_ON_DISK));
    // Anti-vacuous on disk: the subject really is present, and really non-null.
    expect(text(files.get(META_PATH))).toContain('"rasterRef": "canopy_tint"');

    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    // Anti-vacuous in memory: the load understood the file AND carries the ref,
    // so the save below preserves a value rather than re-emitting a null.
    expect(section.unreadable).toBeUndefined();
    expect(section.rasterRef).toBe('canopy_tint');
    expect(section.sceneRef).toBe('canopy_dusk');   // and did not eat its sibling

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(text(written!.bytes)).toBe(RASTER_META_ON_DISK);
  });

  /**
   * THE WIDENED WRITE CONDITION (§3.1): a section whose ONLY non-null ref is
   * `rasterRef` MUST get a file. The four-ref document above stays byte-stable
   * even with the write-condition site unaware of `rasterRef`, because the
   * other refs keep it non-empty; this one does not — the sidecar simply stops
   * being written, and aeon's binding vanishes with no error on any path.
   */
  it('writes a sidecar for a section whose only ref is rasterRef', async () => {
    const files = fixtureFiles();
    expect(files.has(META_PATH)).toBe(false);       // no sidecar to start from
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.bgLayoutRef).toBeNull();         // genuinely all-default...
    expect(section.paletteRef).toBeNull();
    expect(section.sceneRef).toBeNull();
    section.rasterRef = 'canopy_tint';              // ...but for this one ref

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(JSON.parse(text(written!.bytes)!)).toEqual({
      bgLayoutRef: null, paletteRef: null, rasterRef: 'canopy_tint', sceneRef: null,
    });
  });

  /**
   * THE EXPLICIT-NULL CLEAR (§3.1). The cleared-overwrite body is its own
   * hardcoded literal, separate from the serializer, and a ref missing from it
   * resurrects on the next load — so an author who cleared a `rasterRef` would
   * find it back.
   */
  it('names rasterRef in the cleared-overwrite body', async () => {
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(RASTER_META_ON_DISK));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.rasterRef).toBe('canopy_tint');  // there was something to clear
    section.bgLayoutRef = null;
    section.paletteRef = null;
    section.sceneRef = null;
    section.rasterRef = null;

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    const written = plan.files.find((f) => f.path === META_PATH);
    expect(written).toBeDefined();
    expect(text(written!.bytes)).toContain('"rasterRef"');
    expect(JSON.parse(text(written!.bytes)!)).toEqual({
      bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null,
    });
  });

  /**
   * The understood('meta.json') gate from a88db05 still holds with three refs:
   * a sidecar Aurora could not parse is left exactly as the user left it, scene
   * assignment included.
   */
  it('leaves an unreadable sidecar carrying a sceneRef byte-identical', async () => {
    // Truncated hand-edit. section_0's real bytes end `"\n}` with no §8 tail, so
    // dropping the last two characters takes the closing brace with them.
    const malformed = SCENE_META_ON_DISK.slice(0, -2);
    const files = fixtureFiles();
    files.set(META_PATH, new TextEncoder().encode(malformed));
    // Anti-vacuous: really unparseable, and really carrying the ref it would lose.
    expect(() => JSON.parse(malformed)).toThrow();
    expect(malformed).toContain('ojz_act1_start');

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

  // ═══════════════════════════════════════════════════════════════════════
  // ⚠ THE SUB-CELL ROUND TRIP — the question LOOPS-TWO-WAY-MARK could not
  // answer from anywhere else.
  //
  // Aurora paints collision in 16px cells and every writer had, until
  // 2026-09-04, written all four of a cell's 8px sub-tiles IDENTICALLY. The
  // loop crossover breaks that on purpose: aeon's trigger fires once per 8px
  // COLUMN, so a two-way mark must occupy ONE sub-tile column or it flips the
  // player twice and nets to nothing (core/collision/layer-transition.ts).
  //
  // Everything upstream of here was already known to be 8px granular — aeon's
  // bake indexes the sub-tile column directly, and the file is one word per
  // sub-tile. NEITHER OF THOSE ESTABLISHES THE ROUND TRIP. If Aurora's own
  // load→save normalised a cell to a single word anywhere — a resolve, a
  // baseline fill, a `understood` fallback — a half-cell mark would work in the
  // editor and be gone from the file, which is a feature that does nothing in
  // the game and says nothing about it.
  //
  // So this drives the REAL load and the REAL save plan over a plane whose two
  // sub-tile columns DISAGREE, and asserts the disagreement on the far side.
  it('⚠ preserves a mark on ONE 8px sub-column of a cell — load, save, and the byte that differs', async () => {
    const files = authoredFixture();
    // Build the half-cell mark with the SAME function the brush uses, so the
    // fixture cannot drift from what an author can actually paint.
    const a = Uint16Array.from(AUTHORED_A);
    const b = Uint16Array.from(AUTHORED_B);
    const CELL_COL = 11, CELL_ROW = 7;
    const all = cellTileIndices(CELL_COL, CELL_ROW, SECTION_TILES_WIDE);
    const marked = cellCrossoverIndices(CELL_COL, CELL_ROW, SECTION_TILES_WIDE, 'right');
    const base = packCollisionCell({ shape: 0x11, xFlip: false, yFlip: false, solidity: 'all' });
    for (const i of all) { a[i] = base; b[i] = base; }
    for (const i of marked) {
      a[i] = withCrossover(base, 'to-b');     // plane A hands you to B
      b[i] = withCrossover(base, 'to-a');     // plane B hands you back
    }
    files.set(COLL_A_PATH, serializeCollAttr(a));
    files.set(COLL_B_PATH, serializeCollAttr(b));

    // ANTI-VACUOUS, and this is the row that could actually have failed: the
    // cell's sub-tiles genuinely disagree going IN. A fixture whose four
    // sub-tiles were equal would round-trip under a normalising save too.
    const unmarked = all.filter((i) => !marked.includes(i));
    expect(marked.length).toBeGreaterThan(0);
    expect(unmarked.length).toBeGreaterThan(0);
    expect(new Set(marked.map((i) => i % SECTION_TILES_WIDE)).size).toBe(1);
    expect(a[marked[0]!]).not.toBe(a[unmarked[0]!]);

    const out = await loadSaveApply(files);
    const backA = parseCollAttr(out.get(COLL_A_PATH)!);
    const backB = parseCollAttr(out.get(COLL_B_PATH)!);
    // The mark survived on exactly the sub-tiles it was written to, on BOTH
    // planes, with the correct per-plane value — and NOT on the other half.
    for (const i of marked) {
      expect(readCrossover(backA[i])).toBe('to-b');
      expect(readCrossover(backB[i])).toBe('to-a');
    }
    for (const i of unmarked) {
      expect(readCrossover(backA[i])).toBe('none');
      expect(readCrossover(backB[i])).toBe('none');
    }
    // And nothing else moved: the geometry is intact across the whole cell.
    for (const i of all) {
      expect(backA[i]! & ~(3 << 14)).toBe(base);
      expect(backB[i]! & ~(3 << 14)).toBe(base);
    }
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

// ── O31: a manifest that names more backgrounds than the checkout holds ─────
//
// Measured in aeon 2026-08-30: `games/sonic4/data/editor/ojz_bglib.json` is
// TRACKED and names 17 entries; every one of the 34 body files it implies
// (`ojz_bg_<id>.bin` + `..._tiles.bin`) is UNTRACKED, swept up by a `.gitignore`
// rule whose comment aims at "dead timestamped bg experiments". A clean clone
// therefore reads the manifest and opens none of it, while the authoring
// machine resolves all 17 — the failure is invisible to the one person who
// could fix it. These rows run the real load and the real save plan over that
// exact shape, at two entries rather than seventeen.
describe('a bglib manifest naming entries whose bodies are absent', () => {
  const IDX = 'data/editor/ojz_bglib.json';
  const PRESENT = 'here-1781210552117';
  const ABSENT = 'ingame-forest-v15-1786630615596';   // the id aeon's tracked sidecar points at

  /** A layout body one row tall — the smallest the loader accepts. */
  const bgLayoutBytes = (): Uint8Array => serializeNametable(new Uint16Array(BG_WIDTH));

  function bgFixture(): Map<string, Uint8Array> {
    const files = fixtureFiles();
    files.set(IDX, new TextEncoder().encode(serializeBgLibraryIndex([
      { id: PRESENT, name: 'Here' },
      { id: ABSENT, name: 'In-game forest (engine v15)' },
    ])));
    // ONLY the first entry's bodies. The second is the clean-clone case.
    files.set(`data/editor/ojz_bg_${PRESENT}.bin`, bgLayoutBytes());
    files.set(`data/editor/ojz_bg_${PRESENT}_tiles.bin`, serializeBgTiles([tile(3)]));
    return files;
  }

  it('load separates what it opened from what the manifest merely named', async () => {
    const r = await loadAeonProject(memFa(bgFixture()), '/proj');
    // ANTI-VACUOUS: the resolvable entry really did load, with its bytes — a
    // loader that had failed on both would satisfy the second assertion alone.
    expect(r.project.bgLibrary.map((b) => b.id)).toEqual([PRESENT]);
    expect(r.project.bgLibrary[0].tiles.length).toBe(1);
    expect(r.project.bgLibraryUnresolved)
      .toEqual([{ id: ABSENT, name: 'In-game forest (engine v15)' }]);
  });

  it('a whole checkout reports NOTHING unresolved — empty is the ordinary answer', async () => {
    const files = bgFixture();
    files.set(`data/editor/ojz_bg_${ABSENT}.bin`, bgLayoutBytes());
    files.set(`data/editor/ojz_bg_${ABSENT}_tiles.bin`, serializeBgTiles([tile(4)]));
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(r.project.bgLibrary.map((b) => b.id)).toEqual([PRESENT, ABSENT]);
    expect(r.project.bgLibraryUnresolved).toEqual([]);
  });

  it('a body PRESENT but too short to hold a row is unresolved, not silently dropped', async () => {
    const files = bgFixture();
    // Half a row. `Math.floor(len / (BG_WIDTH*2))` is 0, which the loader used
    // to `continue` past — indistinguishable downstream from an absent file,
    // and that is the point: it takes the same road.
    files.set(`data/editor/ojz_bg_${ABSENT}.bin`, new Uint8Array(BG_WIDTH));
    files.set(`data/editor/ojz_bg_${ABSENT}_tiles.bin`, serializeBgTiles([tile(4)]));
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(r.project.bgLibrary.map((b) => b.id)).toEqual([PRESENT]);
    expect(r.project.bgLibraryUnresolved.map((e) => e.id)).toEqual([ABSENT]);
  });

  /**
   * THE ERASURE THIS EXISTS TO STOP. The save plan used to write the index from
   * `project.bgLibrary` — the entries that RESOLVED — so a checkout that opened
   * one of two would replace a two-name manifest with one name, and on aeon's
   * real tree that is sixteen tracked names gone, their untracked bodies left as
   * orphans nothing points at. Same shape as the section-meta sidecars: a
   * reader that could not understand a file must not become a writer that
   * replaces it.
   */
  it('save keeps the names it could not open, and writes bodies only for the ones it has', async () => {
    const fa = memFa(bgFixture());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });

    const idx = plan.files.find((f) => f.path === IDX);
    expect(idx, 'the manifest was not written at all').toBeDefined();
    expect(parseBgLibraryIndex(new TextDecoder().decode(idx!.bytes))).toEqual([
      { id: ABSENT, name: 'In-game forest (engine v15)' },
      { id: PRESENT, name: 'Here' },
    ]);

    // The absent entry keeps its NAME and gets no bytes: overwriting its
    // binaries with a placeholder would be the same erasure one layer down.
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain(`data/editor/ojz_bg_${PRESENT}.bin`);
    expect(paths).not.toContain(`data/editor/ojz_bg_${ABSENT}.bin`);
    expect(paths).not.toContain(`data/editor/ojz_bg_${ABSENT}_tiles.bin`);
  });

  it('a manifest whose entries ALL failed is still re-emitted whole', async () => {
    const files = fixtureFiles();
    files.set(IDX, new TextEncoder().encode(serializeBgLibraryIndex([
      { id: ABSENT, name: 'In-game forest (engine v15)' },
    ])));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    // This is aeon's actual situation, at one entry: nothing loaded, so the old
    // `bgLibrary.length > 0` gate skipped the write — which LOOKED safe and was,
    // right up until the author added one background and the gate opened.
    expect(r.project.bgLibrary).toEqual([]);
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    const idx = plan.files.find((f) => f.path === IDX);
    expect(parseBgLibraryIndex(new TextDecoder().decode(idx!.bytes)))
      .toEqual([{ id: ABSENT, name: 'In-game forest (engine v15)' }]);
  });
});
