// THE SAVE'S REMOVAL STEP — what a Ctrl+S is allowed to DELETE.
//
// ═══ THE DEFECT ═══════════════════════════════════════════════════════════
//
// `buildAeonSavePlan` used to push a write for every document IN a library and
// have no removal step at all, so `Delete scene` dropped the scene from the
// session, the save left its file on disk, and the scene was back on the next
// open. Reported as finding 2 of docs/reviews/2026-09-05-sec7-ui-reauthor.md and
// then MEASURED end to end in the real app (`npm run harness:deleted-scene-returns`,
// rows [1e]/[1h]; the raster presets share the shape, [2d]/[2f]).
//
// ⚠ THE ROWS BELOW CANNOT SEE A FILE SYSTEM, AND THAT IS THE POINT OF SAYING
// SO. They judge the PLAN. The claim "the byte on disk actually went away" is
// not in this file's reach at all and is made by the CDP harness named above,
// which asserts `existsSync` and inode/mtime either side of a real Ctrl+S. A
// suite row asserting only that the library dropped the scene would have passed
// against the bug on the day it was reported.
//
// ═══ WHAT THIS FILE IS REALLY GUARDING ════════════════════════════════════
//
// Not "does it delete" — "does it delete ONLY what it may". A save plan that
// deletes is more dangerous than one that does not, so most of these rows are
// about the files that must SURVIVE: a document Aurora never loaded, a `.json`
// its parser refused, a project opened and saved with nothing changed.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan, removalsFor } from '../save';
import { noteEffectsScenesPersisted } from '../../../formats/effects/scene';
import { noteEffectsPresetsPersisted } from '../../../formats/effects/preset';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

/**
 * A FileAccess that REALLY LISTS — the neighbouring aeon-load/aeon-save suites
 * share one whose `list()` returns `[]`, and a scene library is loaded BY
 * listing a directory, so a test written against that adapter would report "no
 * scenes" for every fixture and pass whether the caller was wired or not.
 * (aeon-effects-scenes.test.ts states the same rule and carries its own copy.)
 */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel)
      || (rel.endsWith('/') && [...files.keys()].some((k) => k.startsWith(rel))),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async (relDir) => {
      const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
      const out = new Set<string>();
      for (const k of files.keys()) {
        if (!k.startsWith(dir)) continue;
        out.add(k.slice(dir.length).split('/')[0]);
      }
      return [...out];
    },
  };
}

const PROJECT_JSON = {
  name: 'Test Project', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone', tileset: 'data/ojz_tiles.bin', palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1, dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

/** `dataPath: 'data/ojz/act1/'` → dataRoot `data/` → these directories (§2). */
const SCENE_DIR = 'data/editor/effects/';
const PRESET_DIR = 'data/editor/effects/presets/';

/** A scene as a hand edit would leave it — NOT produced by the writer under test. */
const sceneDoc = (id: string) => [
  '{',
  '  "schema": 1,',
  `  "id": ${JSON.stringify(id)},`,
  '  "layers": [{ "world_y": 0, "fa": "FACTOR_1", "fb": "FACTOR_1_2" }],',
  '  "v_factor": 2',
  '}',
].join('\n');

/** A ramp preset, copied in shape from aeon's own committed `ramp_probe.json`. */
const presetDoc = (id: string) => [
  '{',
  '  "schema": 1,',
  `  "id": ${JSON.stringify(id)},`,
  '  "ramp": {',
  '    "top": 128,',
  '    "lines": 64,',
  '    "target": { "vsram": { "addr": 2 } },',
  '    "start": { "whole": 0, "frac256": 0 },',
  '    "step": { "whole": 1, "frac256": 128 }',
  '  }',
  '}',
].join('\n');

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const enc = (s: string) => new TextEncoder().encode(s);
  files.set('project.json', enc(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0e; pal[i * 2 + 1] = 0xee; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/objects.json', enc('[]'));
  files.set(`${SCENE_DIR}keeper.json`, enc(sceneDoc('keeper')));
  files.set(`${SCENE_DIR}victim.json`, enc(sceneDoc('victim')));
  files.set(`${PRESET_DIR}keeper_p.json`, enc(presetDoc('keeper_p')));
  files.set(`${PRESET_DIR}victim_p.json`, enc(presetDoc('victim_p')));
  return files;
}

async function openFixture(files: Map<string, Uint8Array>) {
  const r = await loadAeonProject(memFa(files), '/proj');
  return r;
}
const planFor = (r: Awaited<ReturnType<typeof openFixture>>, files: Map<string, Uint8Array>) =>
  buildAeonSavePlan(memFa(files), r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: false });

describe('the load records WHICH files it actually read', () => {
  it('puts every parsed document in loadedPaths, and nothing else', async () => {
    const files = fixtureFiles();
    // The premise, derived from the fixture rather than typed twice.
    const onDisk = [...files.keys()].filter((k) => k.startsWith(SCENE_DIR) && k.endsWith('.json')
      && !k.startsWith(PRESET_DIR)).sort();
    const r = await openFixture(files);
    expect(r.project.effectsScenes.loadedPaths.slice().sort()).toEqual(onDisk);
    expect(r.project.effectsPresets.loadedPaths.slice().sort())
      .toEqual([`${PRESET_DIR}keeper_p.json`, `${PRESET_DIR}victim_p.json`]);
  });

  it('keeps a file it could NOT parse out of loadedPaths: the loader will not overwrite it '
    + 'and the save must not delete it either', async () => {
    const files = fixtureFiles();
    files.set(`${SCENE_DIR}broken.json`, new TextEncoder().encode('{ "schema": 1, "id": "broken"'));
    const r = await openFixture(files);
    expect(r.project.effectsScenes.unreadable.map((u) => u.path)).toEqual([`${SCENE_DIR}broken.json`]);
    expect(r.project.effectsScenes.loadedPaths).not.toContain(`${SCENE_DIR}broken.json`);
  });

  it('keeps a file that is not a document of this kind out of loadedPaths', async () => {
    const files = fixtureFiles();
    files.set(`${SCENE_DIR}wobble.bin`, new Uint8Array(256));
    const r = await openFixture(files);
    expect(r.project.effectsScenes.loadedPaths.some((p) => p.endsWith('.bin'))).toBe(false);
  });
});

describe('buildAeonSavePlan: removals', () => {
  it('plans NO removal for a project that was opened and is being saved unchanged', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);
    const plan = await planFor(r, files);
    // ⚠ THE ROW THAT STOPS THE FIX BECOMING A SCYTHE. "Open a project, press
    // Ctrl+S" is what every author does dozens of times a day, and it must
    // delete nothing whatsoever.
    expect(plan.removals).toEqual([]);
  });

  it('plans the removal of a scene the session dropped, and ONLY that one', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);
    const lib = r.project.effectsScenes;
    // What the panel's Delete does to the model.
    lib.scenes = lib.scenes.filter((s) => s.id !== 'victim');

    const plan = await planFor(r, files);

    expect(plan.removals.map((x) => x.path)).toEqual([`${SCENE_DIR}victim.json`]);
    // The message an author reads names the document, not just a path.
    expect(plan.removals[0].what).toBe('scene "victim"');
    // And the survivor is still WRITTEN, from the same plan.
    expect(plan.files.some((f) => f.path === `${SCENE_DIR}keeper.json`)).toBe(true);
  });

  it('plans the removal of a raster preset the session dropped: the identical loop, '
    + 'measured rather than assumed', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);
    const lib = r.project.effectsPresets;
    lib.presets = lib.presets.filter((p) => p.id !== 'victim_p');

    const plan = await planFor(r, files);

    expect(plan.removals.map((x) => x.path)).toEqual([`${PRESET_DIR}victim_p.json`]);
    expect(plan.removals[0].what).toBe('raster preset "victim_p"');
  });

  it('NEVER removes a document this session did not load, however absent it is from the '
    + 'library', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);
    // A checkout Aurora has not opened, reduced to its essence: the files are on
    // disk and the ledger is empty. This is the shape that would turn "open a
    // project and save it" into a scythe, so it is asserted directly rather than
    // inferred from the loader's behaviour.
    r.project.effectsScenes.loadedPaths = [];
    r.project.effectsScenes.scenes = [];
    r.project.effectsPresets.loadedPaths = [];
    r.project.effectsPresets.presets = [];

    const plan = await planFor(r, files);

    expect(plan.removals).toEqual([]);
    // …and the files are still there to be lost, so the row is not vacuous.
    expect(files.has(`${SCENE_DIR}victim.json`)).toBe(true);
  });

  it('never plans a path as BOTH a write and a removal', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);
    r.project.effectsScenes.scenes = r.project.effectsScenes.scenes.filter((s) => s.id !== 'victim');
    const plan = await planFor(r, files);
    const writes = new Set(plan.files.map((f) => f.path));
    expect(plan.removals.filter((x) => writes.has(x.path))).toEqual([]);
  });

  it('reports the ledger a completed save should adopt: exactly the documents that survive',
    async () => {
      const files = fixtureFiles();
      const r = await openFixture(files);
      r.project.effectsScenes.scenes = r.project.effectsScenes.scenes.filter((s) => s.id !== 'victim');
      const plan = await planFor(r, files);
      expect(plan.ledgers.scenePaths).toEqual([`${SCENE_DIR}keeper.json`]);
      expect(plan.ledgers.presetPaths.slice().sort())
        .toEqual([`${PRESET_DIR}keeper_p.json`, `${PRESET_DIR}victim_p.json`]);
    });
});

/**
 * ═══ THE GUARD ON THE GUARD, AT THE TWO EFFECTS CALL SITES ════════════════
 *
 * `buildAeonSavePlan` calls `removalsFor` three times and every call subtracts
 * the refused paths a SECOND time — the loader has already kept them out of
 * `loadedPaths`, so on any reachable load the third argument changes nothing.
 * That is what makes it deletable: replacing `[...unreadableScenePaths]` and
 * `[...unreadablePresetPaths]` with `[]` left the WHOLE suite green (measured
 * by deletion, `SWEEP-SUBTRACTION-UNGUARDED-EFFECTS-SITES` in
 * docs/lens-findings.jsonl), which is precedent **O20**: a gate resting on its
 * neighbour is discovered the day the neighbour moves. The section-file site
 * got its row first (grid-resize-roundtrip.test.ts); these are the other two.
 *
 * ⚠ THESE ROWS ARE PHRASED AGAINST THE SUBTRACTION, NOT THE FEATURE. The row
 * "a document the parser refused is not deleted" already exists above and it
 * stays GREEN with the subtraction gone, because it passes through the LOAD
 * side. What discriminates is the FUTURE-LOADER state: a refused path
 * deliberately present in `loadedPaths`, which no code path produces today and
 * which each row injects in one statement. So these are evidence about the
 * guard, and no evidence at all about a live data-loss bug.
 *
 * Each row carries the same three anti-vacuity assertions as the section-file
 * row it is modelled on: the injection reached the plan builder, the refused
 * path is NOT in `plan.files` (so the FIRST subtraction, `keep`, demonstrably
 * is not what saves it), and a genuinely removable document IS removed in the
 * same save (so the row cannot pass on an empty removable set).
 *
 * NO SEAM WAS NEEDED, unlike the section-file row's `afterLoad`. These two
 * libraries hang off `project`, which `buildAeonSavePlan` takes as an argument
 * and which the rows above already mutate between the real load and the real
 * plan build. Nothing in `save.ts` changed for these rows.
 */
describe('the refused subtraction is load-bearing at the effects call sites', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  /** An interrupted write, not a stub: a real document cut off part-way. */
  const truncated = (doc: string) => enc(doc.slice(0, Math.floor(doc.length * 0.6)));

  it('SCENES: a loader that admitted a refused path to loadedPaths still does not get it '
    + 'deleted', async () => {
    const files = fixtureFiles();
    const refusedPath = `${SCENE_DIR}broken.json`;
    files.set(refusedPath, truncated(sceneDoc('broken')));

    const r = await openFixture(files);
    const lib = r.project.effectsScenes;
    // The premise, asserted rather than assumed: TODAY the loader refuses it and
    // keeps it out of the ledger, which is why the subtraction cannot fire.
    expect(lib.unreadable.map((u) => u.path)).toContain(refusedPath);
    expect(lib.loadedPaths).not.toContain(refusedPath);

    // THE FUTURE LOADER, in one statement — the only state in which the second
    // subtraction is the thing standing between this file and an unlink.
    lib.loadedPaths = [...lib.loadedPaths, refusedPath];
    // …and a genuinely removable document in the SAME save.
    lib.scenes = lib.scenes.filter((s) => s.id !== 'victim');

    const plan = await planFor(r, files);

    // The injection reached the plan builder. Without this, a push that failed
    // to land and a property that holds are the same artifact.
    expect(r.project.effectsScenes.loadedPaths).toContain(refusedPath);
    expect(r.project.effectsScenes.unreadable.map((u) => u.path)).toContain(refusedPath);
    // ANTI-VACUITY: it is not WRITTEN either, so it is not in `keep`, so the
    // first subtraction is demonstrably not what is saving it.
    expect(plan.files.map((f) => f.path)).not.toContain(refusedPath);
    // ANTI-VACUITY: the sweep really ran in this save.
    expect(plan.removals.map((x) => x.path)).toContain(`${SCENE_DIR}victim.json`);
    // THE PROPERTY.
    expect(plan.removals.map((x) => x.path)).not.toContain(refusedPath);
  });

  it('RASTER PRESETS: a loader that admitted a refused path to loadedPaths still does not '
    + 'get it deleted', async () => {
    const files = fixtureFiles();
    const refusedPath = `${PRESET_DIR}broken_p.json`;
    files.set(refusedPath, truncated(presetDoc('broken_p')));

    const r = await openFixture(files);
    const lib = r.project.effectsPresets;
    expect(lib.unreadable.map((u) => u.path)).toContain(refusedPath);
    expect(lib.loadedPaths).not.toContain(refusedPath);

    lib.loadedPaths = [...lib.loadedPaths, refusedPath];
    lib.presets = lib.presets.filter((p) => p.id !== 'victim_p');

    const plan = await planFor(r, files);

    expect(r.project.effectsPresets.loadedPaths).toContain(refusedPath);
    expect(r.project.effectsPresets.unreadable.map((u) => u.path)).toContain(refusedPath);
    expect(plan.files.map((f) => f.path)).not.toContain(refusedPath);
    expect(plan.removals.map((x) => x.path)).toContain(`${PRESET_DIR}victim_p.json`);
    expect(plan.removals.map((x) => x.path)).not.toContain(refusedPath);
  });
});

describe('removalsFor: the rule itself, with the loader out of the way', () => {
  const describePath = (p: string) => `thing ${p}`;

  it('removes a known path the library no longer claims', () => {
    expect(removalsFor(['a.json', 'b.json'], ['a.json'], [], describePath))
      .toEqual([{ path: 'b.json', what: 'thing b.json' }]);
  });

  it('removes nothing that is not KNOWN, whatever else is true of it', () => {
    // The set is a subtraction FROM `known`, so a path nobody loaded cannot
    // appear however absent it is from `keep`.
    expect(removalsFor([], ['a.json'], [], describePath)).toEqual([]);
  });

  /**
   * ⚠ THE ROW THAT ASSERTS SOMETHING THE LOADER ALREADY MAKES TRUE, ON PURPOSE.
   *
   * Today `loadedPaths` and `unreadable` are disjoint by construction, so the
   * `refused` subtraction inside `removalsFor` cannot fire on a real load and a
   * test that only opened a project would leave it entirely unexercised — a
   * guard asserting nothing, which is this repo's dominant defect class. Here
   * the same path is fed to BOTH arguments: delete the subtraction and this row
   * reddens, which is what makes it a guard rather than a comment.
   */
  it('refuses a path that is unreadable EVEN IF it also appears as known', () => {
    expect(removalsFor(['broken.json'], [], ['broken.json'], describePath)).toEqual([]);
  });
});

describe('the persisted-paths ledger update', () => {
  it('adopts exactly the paths given, deduped and ordered', () => {
    const lib = { scenes: [], unreadable: [], notices: [], loadedPaths: ['old.json'] };
    noteEffectsScenesPersisted(lib, ['b.json', 'a.json', 'b.json']);
    expect(lib.loadedPaths).toEqual(['a.json', 'b.json']);
  });

  it('closes create-save-delete: a document written this session becomes removable', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);
    const lib = r.project.effectsScenes;
    // Born in the session: in `scenes`, in no ledger, so nothing to remove yet.
    lib.scenes = [...lib.scenes, {
      schema: 1, id: 'born', v_factor: 2,
      layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_2' }],
    } as never];
    expect((await planFor(r, files)).removals).toEqual([]);

    // The save writes it; the glue then adopts the plan's ledger.
    const afterSave = await planFor(r, files);
    noteEffectsScenesPersisted(lib, afterSave.ledgers.scenePaths);
    expect(lib.loadedPaths).toContain(`${SCENE_DIR}born.json`);

    // Now delete it. Without the ledger update this file would be orphaned for ever.
    lib.scenes = lib.scenes.filter((s) => s.id !== 'born');
    expect((await planFor(r, files)).removals.map((x) => x.path))
      .toEqual([`${SCENE_DIR}born.json`]);
  });

  it('the preset ledger behaves identically', () => {
    const lib = { presets: [], unreadable: [], notices: [], loadedPaths: ['old.json'] };
    noteEffectsPresetsPersisted(lib, ['z.json', 'a.json']);
    expect(lib.loadedPaths).toEqual(['a.json', 'z.json']);
  });
});
