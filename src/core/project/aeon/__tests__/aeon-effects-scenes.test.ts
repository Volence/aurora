// The effects-scene library through the AEON PROJECT: loaded by loadAeonProject,
// written by buildAeonSavePlan.
//
// A SEPARATE FILE from aeon-load/aeon-save on purpose. Both of those share a
// `memFa` whose `list()` returns `[]` unconditionally — a directory listing was
// never needed there — and a scene library is loaded BY listing a directory. A
// test written against that adapter would report "no scenes" for every fixture
// and pass whether or not the caller was wired at all. So this file brings its
// own adapter, one that actually lists.
//
// WHAT EACH GROUP IS FOR:
//   • absent-directory: the NORMAL case today. `games/sonic4/data/editor/effects/`
//     does not exist in the aeon tree, so "no scenes, no error, no notice" is the
//     answer every real open gets, and it is the one that has to be right.
//   • present-directory: the caller is wired — proven against a scene the codec
//     alone could not have produced.
//   • identity: `handle.scenes` and `project.effectsScenes` are ONE object.
//   • save: authored scenes reach disk, unreadable ones are never overwritten.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { parseEffectsScene, serializeEffectsScene, type EffectsScene } from '../../../formats/effects/scene';
import { EFFECTS_V_FACTOR_LOCK } from '../../../formats/effects/scene-ui';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/**
 * In-memory FileAccess that REALLY LISTS: `list(dir)` returns the immediate
 * entry names under `dir`, which is what loadEffectsSceneLibrary walks. `exists`
 * answers for directories too (any key with that prefix), because the library
 * load asks `exists(dir)` first and a Map has no directories in it.
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

/** `dataPath: 'data/ojz/act1/'` → dataRoot `data/` → this directory (schema §2). */
const EFFECTS_DIR = 'data/editor/effects/';

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/objects.json', new TextEncoder().encode(JSON.stringify([])));
  return files;
}

/**
 * A scene document as a HAND EDIT or aeon's generator would leave it, spelled
 * out rather than produced by `serializeEffectsScene`.
 *
 * The reason is the fixture rule this repo learned the hard way (aeon-load's
 * SCENE_META_ON_DISK carries the same note): a fixture built by the writer under
 * test agrees with that writer by construction, so a reader/writer pair that
 * shared one wrong assumption would round-trip it happily. It also carries
 * `budget_class` and a CUSTOM PACKED FACTOR, neither of which the wave-1 UI
 * edits — so the round-trip below is a real test of "keep what you do not
 * understand" rather than of the fields a form happens to touch.
 */
const CANOPY_ON_DISK = [
  '{',
  '  "schema": 1,',
  '  "id": "canopy_dusk",',
  '  "name": "Canopy at dusk",',
  '  "layers": [',
  '    {',
  '      "world_y": 0,',
  '      "fa": "FACTOR_1_2",',
  '      "fb": { "s1": 2, "s2": 4, "op": 1 }',
  '    },',
  '    {',
  '      "world_y": 96,',
  '      "fa": "FACTOR_1",',
  '      "fb": "FACTOR_3_4",',
  '      "enabled": false',
  '    }',
  '  ],',
  '  "v_factor": 2,',
  '  "v_center": 112,',
  // `precision` sat here until ROADMAP row 59 retired it from the contract
  // (empyrean 0bd4753). It could not simply be dropped and left at that: this
  // constant's JOB is to be a scene carrying fields the wave-1 UI cannot edit,
  // so the coverage has to be REPLACED, not deleted. `v_factor_fg` is the right
  // substitute and the contrast row 59 turns on — it is the field that stays
  // RESERVED in the schema because the runtime will read it, where `precision`
  // was deleted outright because the engine dropped the storage.
  '  "v_factor_fg": 3,',
  '  "budget_class": "heavy"',
  '}',
].join('\n');

function withScenes(extra: Record<string, string> = {}): Map<string, Uint8Array> {
  const files = fixtureFiles();
  files.set(`${EFFECTS_DIR}canopy_dusk.json`, new TextEncoder().encode(CANOPY_ON_DISK));
  for (const [name, body] of Object.entries(extra)) {
    files.set(`${EFFECTS_DIR}${name}`, new TextEncoder().encode(body));
  }
  return files;
}

const decode = (b: Uint8Array | undefined) => b === undefined ? undefined : new TextDecoder().decode(b);

describe('loadAeonProject — the effects-scene library', () => {
  it('reports an EMPTY library, no error and no notice when editor/effects/ is absent', async () => {
    const files = fixtureFiles();
    // The premise, asserted rather than assumed: nothing in this fixture lives
    // under the effects directory. Without this the row would pass on a fixture
    // that happened to have scenes and a load that happened to drop them.
    expect([...files.keys()].filter((k) => k.startsWith(EFFECTS_DIR))).toEqual([]);

    const r = await loadAeonProject(memFa(files), '/proj');

    expect(r.scenes.scenes).toEqual([]);
    expect(r.scenes.unreadable).toEqual([]);
    // Silent, not merely non-fatal: §2 makes an absent directory the ordinary
    // "this project has no editor scenes yet", so a toast about it would be noise
    // on every single aeon open the tree can currently produce.
    expect(r.notices.filter((n) => n.message.includes('effects'))).toEqual([]);
    expect(r.project.effectsScenes.scenes).toEqual([]);
  });

  it('loads every scene in editor/effects/, keeping fields the wave-1 UI does not edit', async () => {
    const r = await loadAeonProject(memFa(withScenes()), '/proj');

    expect(r.scenes.scenes.map((s) => s.id)).toEqual(['canopy_dusk']);
    const scene = r.scenes.scenes[0];
    expect(scene.name).toBe('Canopy at dusk');
    expect(scene.layers).toHaveLength(2);
    // Derived from CANOPY_ON_DISK, which is the file the loader read — not from
    // a default, and not from anything the UI writes.
    expect(scene.layers[0].fb).toEqual({ s1: 2, s2: 4, op: 1 });
    expect(scene.budget_class).toBe('heavy');
    expect(r.scenes.unreadable).toEqual([]);
  });

  it('ignores non-.json entries in the directory (deform .bin tables live there too)', async () => {
    const files = withScenes();
    files.set(`${EFFECTS_DIR}wobble.bin`, new Uint8Array(256));
    const r = await loadAeonProject(memFa(files), '/proj');
    expect(r.scenes.scenes.map((s) => s.id)).toEqual(['canopy_dusk']);
    expect(r.scenes.unreadable).toEqual([]);
  });

  it('records an unreadable scene file loudly and does NOT return it as a scene', async () => {
    const r = await loadAeonProject(
      memFa(withScenes({ 'broken.json': '{ "schema": 1, "id": "broken"' })), '/proj');

    expect(r.scenes.scenes.map((s) => s.id)).toEqual(['canopy_dusk']);
    expect(r.scenes.unreadable.map((u) => u.path)).toEqual([`${EFFECTS_DIR}broken.json`]);
    expect(r.notices.some((n) => n.message.includes(`${EFFECTS_DIR}broken.json`))).toBe(true);
  });

  it('names handle.scenes and project.effectsScenes as ONE object, not two copies', async () => {
    const r = await loadAeonProject(memFa(withScenes()), '/proj');
    // `toBe`, not `toEqual`: two structurally-equal copies would satisfy toEqual
    // and then drift apart the first time anything mutated either one.
    expect(r.scenes).toBe(r.project.effectsScenes);
  });
});

describe('buildAeonSavePlan — the effects-scene library', () => {
  async function planPaths(files: Map<string, Uint8Array>) {
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    return { r, plan, paths: plan.files.map((f) => f.path) };
  }

  it('writes nothing under editor/effects/ for a project with no scenes', async () => {
    const { paths } = await planPaths(fixtureFiles());
    expect(paths.filter((p) => p.startsWith(EFFECTS_DIR))).toEqual([]);
  });

  it('round-trips an authored scene through load -> save with every field intact', async () => {
    const { plan, paths } = await planPaths(withScenes());
    const path = `${EFFECTS_DIR}canopy_dusk.json`;
    expect(paths).toContain(path);

    // Compare through the READER, not by string equality: the writer canonicalises
    // key order from the schema, so byte-comparing against a hand-authored fixture
    // would assert the fixture's formatting rather than the data's survival.
    const written = decode(plan.files.find((f) => f.path === path)!.bytes)!;
    expect(parseEffectsScene(written, 'canopy_dusk'))
      .toEqual(parseEffectsScene(CANOPY_ON_DISK, 'canopy_dusk'));
  });

  it('writes a scene the session ADDED, at the path its id names', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const added: EffectsScene = {
      schema: 1, id: 'new_scene', layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_2' }],
      v_factor: EFFECTS_V_FACTOR_LOCK,
    };
    r.project.effectsScenes.scenes.push(added);

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    const file = plan.files.find((f) => f.path === `${EFFECTS_DIR}new_scene.json`);
    expect(file, 'the added scene was not planned').toBeDefined();
    expect(decode(file!.bytes)).toBe(serializeEffectsScene(added));
  });

  it('plans no write for an unreadable scene file, and still saves the good one beside it', async () => {
    const files = withScenes({ 'broken.json': '{ "schema": 1, "id": "broken"' });
    const { r, paths } = await planPaths(files);

    // The premise: the load really did see it and really did refuse it. Without
    // this the row would pass for a load that never looked at the file at all.
    expect(r.scenes.unreadable.map((u) => u.path)).toEqual([`${EFFECTS_DIR}broken.json`]);
    expect(paths).not.toContain(`${EFFECTS_DIR}broken.json`);
    expect(paths).toContain(`${EFFECTS_DIR}canopy_dusk.json`);
  });

  /**
   * THE ROW THE PREVIOUS ONE CANNOT COVER, and the reason the refusal is a throw
   * rather than a skip.
   *
   * An unparsable file yields no id, so on a straight load→save nothing ever aims
   * at its path — a by-path skip there would be a guard that can never fire. The
   * reachable collision is a scene AUTHORED THIS SESSION under the broken file's
   * stem, which is easy to do by accident because the broken scene does not
   * appear in any list the author can see.
   */
  it('refuses the whole save when an authored scene id collides with an unreadable file', async () => {
    const fa = memFa(withScenes({ 'broken.json': '{ "schema": 1, "id": "broken"' }));
    const r = await loadAeonProject(fa, '/proj');
    expect(r.scenes.scenes.map((s) => s.id), 'broken must not be visible as a scene')
      .not.toContain('broken');

    r.project.effectsScenes.scenes.push({
      schema: 1, id: 'broken', layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' }],
      v_factor: EFFECTS_V_FACTOR_LOCK,
    });

    await expect(buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged }))
      .rejects.toThrow(/broken\.json exists and could not be read/);
  });

  it('refuses to plan a save at all when a scene in memory is invalid', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    // `layers` is required with minItems 1 (schema `required` + `minItems`).
    r.project.effectsScenes.scenes.push(
      { schema: 1, id: 'empty_scene', layers: [], v_factor: EFFECTS_V_FACTOR_LOCK } as EffectsScene);

    await expect(buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged })).rejects.toThrow(/empty_scene/);
  });
});
