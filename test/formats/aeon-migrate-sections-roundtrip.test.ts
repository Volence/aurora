// MIGRATE SECTIONS, END TO END — editor spec §4's own acceptance test, through
// the real `loadAeonProject` -> command -> `buildAeonSavePlan` -> disk ->
// `loadAeonProject` cycle.
//
// §4: "C §6 risk 4's test is the acceptance test: migrate, undo, assert every
// sidecar ref restored and no `regions.json` in the plan; redo, assert the
// reverse."
//
// ═══ THE VACUITY THE SPEC NAMES, AND WHERE IT IS CLOSED ════════════════════
//
// §7's note (added 2026-09-16) names THIS row as one of three whose verification
// column is ABSENCE-SHAPED: "migrate act 1, assert nine or ten regions and every
// sidecar nulled" passes identically on a fixture whose sidecars were never
// populated, because "all null" is what an empty fixture and a correct migration
// both produce. So every row below that asserts a null FIRST asserts the
// non-null, from the same fixture, in the same row — and not by counting: the
// exact tuple each section carried is read out of the loaded model and compared
// field for field, so a fixture that silently stopped carrying refs reddens here
// rather than passing quietly.
//
// The same discipline reaches the SAVE PLAN, which is the half a model-only test
// cannot see: a sidecar is only really cleared when the plan writes an all-null
// body over the file on disk, and the bytes of that body are asserted, not its
// presence.
//
// The pattern — in-memory FileAccess, fixtures built in this file, nothing read
// from a peer repo — is `aeon-regions-roundtrip.test.ts`'s, one command over.
// The act-1 reading against aeon's own bytes is `regions-migrate-act1.test.ts`.

import { describe, it, expect } from 'vitest';

import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { buildAeonSavePlan, type AeonSavePlan } from '../../src/core/project/aeon/save';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import { planActMigration } from '../../src/renderer/providers/regions-migrate';
import type { Tile, Section } from '../../src/core/model/s4-types';
import { parseSectionMeta } from '../../src/core/formats/section-meta';

const DATA = 'games/sonic4/data/editor/ojz/act1/';
const DESC_PATH = 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp';
const LIB_PATH = 'games/sonic4/data/effects/ojz_effects.emp';
const REGIONS_PATH = `${DATA}regions.json`;
const metaPath = (i: number) => `${DATA}section_${i}.meta.json`;

/** A 2x2 act: four sections, 4096 x 4096 world pixels. Every number below derives from these. */
const GRID_W = 2;
const GRID_H = 2;
const ACT_W = GRID_W * SECTION_PIXEL_SIZE;

/**
 * The key-less row's edges, off the section grid on BOTH sides and straddling
 * the vertical section line — aeon's night region in miniature. A row inside one
 * section would not exercise the carve across two runs, which is the case §4's
 * "appended after" sentence got wrong.
 */
const NIGHT_X0 = SECTION_PIXEL_SIZE - 248;
const NIGHT_X1 = SECTION_PIXEL_SIZE + 451;

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

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

/**
 * The act descriptor, in aeon's own syntax: four keyed region rows and ONE
 * key-less row whose x edges are NAMED CONSTANTS.
 *
 * The constants are the point rather than decoration. aeon's real table writes
 * `x0: OJZ_NIGHT_X0`, not a number, so a reader that only understood literals
 * would find no rectangle on the one row whose rectangle cannot be derived from
 * the section grid — and the migration would then have had to invent it.
 */
function descriptor(): string {
  const rows = [
    `    ojz_region(x0:    0, x1: ${SECTION_PIXEL_SIZE - 1}, y0:    0, y1: ${SECTION_PIXEL_SIZE - 1}, effects: OJZ_Preset_Sec0, parallax: ojz_act1_sec_scene(sec: 0)),`,
    `    ojz_region(x0: ${SECTION_PIXEL_SIZE}, x1: ${ACT_W - 1}, y0:    0, y1: ${SECTION_PIXEL_SIZE - 1}, effects: OJZ_Preset_Sec1, parallax: ojz_act1_sec_scene(sec: 1)),`,
    `    ojz_region(x0:    0, x1: ${SECTION_PIXEL_SIZE - 1}, y0: ${SECTION_PIXEL_SIZE}, y1: ${2 * SECTION_PIXEL_SIZE - 1}, effects: OJZ_Preset_Sec2, parallax: ojz_act1_sec_scene(sec: 2)),`,
    `    ojz_region(x0: ${SECTION_PIXEL_SIZE}, x1: ${ACT_W - 1}, y0: ${SECTION_PIXEL_SIZE}, y1: ${2 * SECTION_PIXEL_SIZE - 1}, effects: OJZ_Preset_Sec3, parallax: ojz_act1_sec_scene(sec: 3)),`,
    `    // the night region: no parallax:, therefore no sec:, therefore no key`,
    `    ojz_region(x0: OJZ_NIGHT_X0, x1: OJZ_NIGHT_X1, y0: 0, y1: ${SECTION_PIXEL_SIZE - 1}, effects: OJZ_Preset_Night),`,
  ];
  return [
    `const OJZ_NIGHT_X0 = ${NIGHT_X0}                 // inclusive left edge, world px`,
    `const OJZ_NIGHT_X1 = ${NIGHT_X1}                 // inclusive right edge`,
    'comptime fn ojz_region(x0: int, x1: int, y0: int, y1: int, effects: Label, parallax: Label = 0) -> Region {',
    '    ensure(effects != 0, "a null binding")',
    '}',
    'const OJZ_ACT1_REGION_ROWS: [Region; 5] = [',
    ...rows,
    ']',
    '',
  ].join('\n');
}

/**
 * What each section's sidecar carries BEFORE the migration. Three of the four
 * carry something; section 3 carries nothing, so the fixture also covers the
 * section the migration has no file to overwrite.
 */
const SIDECARS: Record<number, Record<string, string | null>> = {
  0: { bgLayoutRef: 'forest-v15', paletteRef: null, rasterRef: null, sceneRef: 'ojz_act1_start' },
  1: { bgLayoutRef: null, paletteRef: null, rasterRef: 'ojz_sec1_showcase', sceneRef: null },
  2: { bgLayoutRef: null, paletteRef: 'pal_two', rasterRef: null, sceneRef: 'ojz_act1_depth' },
};

function fixtureFiles(extra: Record<string, Uint8Array> = {}): Map<string, Uint8Array> {
  const proj = {
    name: 'Sonic 4',
    engine: 's4',
    zones: [{
      id: 'ojz',
      name: 'Oracle Jungle Zone',
      tileset: 'games/sonic4/data/generated/ojz/act1/ojz_tiles.bin',
      palette: 'games/sonic4/data/generated/ojz/act1/ojz_palette.bin',
      acts: [{
        id: 'act1',
        gridWidth: GRID_W,
        gridHeight: GRID_H,
        dataPath: DATA,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
    objectLibrary: 'games/sonic4/data/objdefs/objects.json',
    chunkLibrary: '',
  };
  const files = new Map<string, Uint8Array>();
  files.set('project.json', enc(JSON.stringify(proj, null, 2)));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('games/sonic4/data/generated/ojz/act1/ojz_palette.bin', pal);
  for (let i = 0; i < GRID_W * GRID_H; i++) {
    files.set(`${DATA}section_${i}.tiles.bin`,
      serializeNametable(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH)));
    files.set(`${DATA}section_${i}.objects.json`, enc('[]'));
    files.set(`${DATA}section_${i}.rings.json`, enc('[]'));
    const meta = SIDECARS[i];
    if (meta) files.set(metaPath(i), enc(`${JSON.stringify(meta, null, 2)}\n`));
  }
  files.set(DESC_PATH, enc(descriptor()));
  files.set(LIB_PATH, enc('// no chooser calls in this fixture\n'));
  files.set('games/sonic4/data/objdefs/objects.json', enc('[]'));
  for (const [k, v] of Object.entries(extra)) files.set(k, v);
  return files;
}

async function open(files: Map<string, Uint8Array>) {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  const act = r.project.zones[0].acts[0];
  const level = { sections: act.sections, act } as unknown as S4Level;
  const plan = async (): Promise<AeonSavePlan> => buildAeonSavePlan(
    fa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: r.legacyAtlasMerged },
  );
  return { loaded: r, act, level, plan };
}

/** Apply a plan the way the renderer's writer does: every write, THEN every removal. */
function applyPlan(files: Map<string, Uint8Array>, plan: AeonSavePlan): Map<string, Uint8Array> {
  const next = new Map(files);
  for (const f of plan.files) next.set(f.path, f.bytes);
  for (const rm of plan.removals) next.delete(rm.path);
  return next;
}

const paths = (plan: AeonSavePlan) => plan.files.map(f => f.path);

/** The four refs of one section, as the model holds them. */
function refs(section: Section | null) {
  return section === null ? null : {
    bgLayoutRef: section.bgLayoutRef,
    paletteRef: section.paletteRef,
    rasterRef: section.rasterRef,
    sceneRef: section.sceneRef,
  };
}

const allRefs = (act: { sections: (Section | null)[] }) => act.sections.map(refs);

const NULLS = { bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null };

describe('migrate-sections, end to end', () => {
  it('THE FIXTURE CARRIES REFS BEFORE ANYTHING RUNS, without which every row below is vacuous', async () => {
    const { act } = await open(fixtureFiles());
    // Field for field, not a count: the exact tuples the fixture wrote.
    expect(allRefs(act)).toEqual([
      { bgLayoutRef: 'forest-v15', paletteRef: null, rasterRef: null, sceneRef: 'ojz_act1_start' },
      { bgLayoutRef: null, paletteRef: null, rasterRef: 'ojz_sec1_showcase', sceneRef: null },
      { bgLayoutRef: null, paletteRef: 'pal_two', rasterRef: null, sceneRef: 'ojz_act1_depth' },
      NULLS,
    ]);
    // And the act has no regions yet, which is the state migration is for.
    expect(act.regions.document).toBeNull();
  });

  it('MIGRATE, UNDO, REDO: §4\'s acceptance test, with the before-picture asserted first', async () => {
    const files = fixtureFiles();
    const { act, level, plan } = await open(files);

    // ── BEFORE ────────────────────────────────────────────────────────────
    const before = allRefs(act);
    expect(before.filter((r) => r !== null && Object.values(r).some((v) => v !== null)).length,
      'the fixture carries no sidecar refs at all, so "every sidecar nulled" would prove nothing')
      .toBe(Object.keys(SIDECARS).length);
    const planBefore = await plan();
    expect(paths(planBefore), 'the act must start with no regions.json to write')
      .not.toContain(REGIONS_PATH);

    // ── MIGRATE ───────────────────────────────────────────────────────────
    const offer = planActMigration(act, 'ojz', act.rasterWiring!);
    expect(offer.plan.refusals, offer.plan.refusals.join('; ')).toEqual([]);
    const history = new EditHistory();
    history.execute(offer.command!, level);

    const doc = act.regions.document!;
    // DERIVED: one region per distinct section tuple (four distinct presets
    // here) plus one per key-less descriptor row.
    const keyed = Object.keys(act.rasterWiring!.bindings).length;
    const unkeyed = (act.rasterWiring!.unkeyedRows ?? []).length;
    expect(keyed, 'the descriptor bound no sections, so this fixture measures nothing').toBe(4);
    expect(unkeyed, 'the descriptor carried no key-less row').toBe(1);
    expect(doc.regions).toHaveLength(keyed + unkeyed);
    expect(doc.act).toBe('ojz_act1');

    // Every sidecar null, all four refs, every section.
    expect(allRefs(act)).toEqual([NULLS, NULLS, NULLS, NULLS]);

    // The refs are not gone: they are on the regions now.
    expect(doc.regions.find((r) => r.id === 'sec_0')!.sceneRef).toBe('ojz_act1_start');
    expect(doc.regions.find((r) => r.id === 'sec_1')!.rasterRef).toBe('ojz_sec1_showcase');
    expect(doc.regions.find((r) => r.id === 'sec_2')!.sceneRef).toBe('ojz_act1_depth');

    // The key-less row carved the two runs it crosses, and is a region itself.
    expect(doc.regions.find((r) => r.id === 'sec_0')!.rect)
      .toEqual({ x: 0, y: 0, w: NIGHT_X0, h: SECTION_PIXEL_SIZE });
    expect(doc.regions[doc.regions.length - 1].preset).toBe('OJZ_Preset_Night');

    // ── THE PLAN, WHICH IS WHERE A CLEARED SIDECAR ACTUALLY HAPPENS ───────
    const planAfter = await plan();
    expect(paths(planAfter)).toContain(REGIONS_PATH);
    for (const i of Object.keys(SIDECARS).map(Number)) {
      const file = planAfter.files.find((f) => f.path === metaPath(i));
      expect(file, `section ${i}'s sidecar exists on disk and must be overwritten with nulls`)
        .toBeDefined();
      expect(parseSectionMeta(dec(file!.bytes)), `section ${i}'s planned sidecar body`)
        .toEqual(NULLS);
    }
    // Section 3 had no sidecar on disk and gets none: the all-null overwrite is
    // gated on the file existing, so migration creates no new files.
    expect(paths(planAfter)).not.toContain(metaPath(3));

    // ── UNDO ──────────────────────────────────────────────────────────────
    history.undo(level);
    expect(allRefs(act), 'undo must restore every sidecar tuple, all four refs')
      .toEqual(before);
    expect(act.regions.document, 'undo must take the regions document away again').toBeNull();
    const planUndone = await plan();
    expect(paths(planUndone), '§4: undo removes regions.json from the plan')
      .not.toContain(REGIONS_PATH);
    // And the sidecars are planned with their ORIGINAL bodies, not nulls.
    expect(parseSectionMeta(dec(planUndone.files.find((f) => f.path === metaPath(0))!.bytes)))
      .toEqual(before[0]);

    // ── REDO ──────────────────────────────────────────────────────────────
    history.redo(level);
    expect(allRefs(act)).toEqual([NULLS, NULLS, NULLS, NULLS]);
    expect(act.regions.document!.regions).toHaveLength(keyed + unkeyed);
    expect(paths(await plan())).toContain(REGIONS_PATH);
  });

  it('THE MIGRATION REACHES DISK: reopening finds the regions and the cleared sidecars', async () => {
    const files = fixtureFiles();
    const { act, level, plan } = await open(files);
    const offer = planActMigration(act, 'ojz', act.rasterWiring!);
    expect(offer.plan.refusals, offer.plan.refusals.join('; ')).toEqual([]);
    new EditHistory().execute(offer.command!, level);
    const onDisk = applyPlan(files, await plan());

    // The sidecar files are still there and now say null — the state that makes
    // the generator's rule 5 pass rather than the state that hides it.
    expect(onDisk.has(metaPath(0)), 'the sidecar must be overwritten, not deleted').toBe(true);
    expect(parseSectionMeta(dec(onDisk.get(metaPath(0))!))).toEqual(NULLS);

    const reopened = await open(onDisk);
    expect(allRefs(reopened.act)).toEqual([NULLS, NULLS, NULLS, NULLS]);
    expect(reopened.act.regions.document).toEqual(act.regions.document);
    expect(reopened.act.regions.loadedPath).toBe(REGIONS_PATH);
  });

  it('A SECOND MIGRATION REFUSES rather than overwrite the regions the first one made', async () => {
    const files = fixtureFiles();
    const { act, level } = await open(files);
    const first = planActMigration(act, 'ojz', act.rasterWiring!);
    new EditHistory().execute(first.command!, level);

    const second = planActMigration(act, 'ojz', act.rasterWiring!);
    expect(second.command).toBeNull();
    expect(second.plan.document).toBeNull();
    expect(second.plan.refusals.join('\n')).toMatch(/already has \d+ regions/);
    // And it changed nothing: the document the first migration made is intact.
    expect(act.regions.document!.regions).toHaveLength(5);
  });

  it('A DESCRIPTOR AURORA COULD NOT READ REFUSES, and clears no sidecar', async () => {
    // "I could not look" is never "there are no bindings". The sidecars must
    // still carry their refs afterwards — a migration that cleared them and then
    // wrote no document is the half state the generator refuses.
    const files = fixtureFiles({ [DESC_PATH]: enc('// nothing this reader can key\n') });
    const { act } = await open(files);
    const offer = planActMigration(act, 'ojz', act.rasterWiring!);
    expect(offer.command).toBeNull();
    expect(offer.plan.refusals.join('\n')).toMatch(/act descriptor could not be read/);
    expect(offer.plan.sidecars).toEqual([]);
    expect(allRefs(act)[0]).toEqual(
      { bgLayoutRef: 'forest-v15', paletteRef: null, rasterRef: null, sceneRef: 'ojz_act1_start' },
    );
  });
});
