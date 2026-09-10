// THE RASTER PRESET LIBRARY'S WRITE-SIDE REFUSAL, through buildAeonSavePlan.
//
// ═══ WHY THIS FILE EXISTS ═════════════════════════════════════════════════
//
// `buildAeonSavePlan` (src/core/project/aeon/save.ts) refuses the whole save
// when an authored document's id would land on a file the LOAD could not parse,
// because writing there would destroy an author's file that they cannot even
// see in the UI list. It states that rule TWICE, once per library: once for
// effects scenes and once, in the same shape and with a message of its own, for
// raster presets.
//
// The SCENE half has had a row since it was written
// (aeon-effects-scenes.test.ts, "refuses the whole save when an authored scene
// id collides with an unreadable file"). The PRESET half had none. That was
// filed as the lead PRESET-WRITE-THROW-MAYBE-UNHELD in docs/lens-findings.jsonl
// and settled here by DELETION, which is the only thing that settles it: the
// preset throw was cut from `save.ts` on disk and the entire suite stayed green,
// while the identical cut at the scene site reddened exactly one row. See
// docs/reviews/2026-09-10-preset-write-throw.md for both runs.
//
// ═══ WHAT THE ROW BELOW IS PHRASED AGAINST ════════════════════════════════
//
// The INSTRUMENT'S DISCRIMINATION, not the defect. "the save plan refused" is
// not enough: `buildAeonSavePlan` rejects for several unrelated reasons, and a
// row that only asserts a rejection stays green when this particular guard is
// deleted and some neighbouring refusal fires instead. So the row pins down
// WHICH guard answered, and rules out each neighbour that could have:
//
//   • the SCENE write-side throw at the same rule: this fixture has NO
//     unreadable scene at all, asserted, so that guard has nothing to fire on,
//     and the message is asserted not to speak of a scene;
//   • schema validation of the authored document: the preset being authored is
//     a real parsed document that re-serializes, asserted, so the "invalid
//     document in memory" refusal cannot be what answered;
//   • the mere PRESENCE of an unreadable file in the library: the control row
//     builds a plan over the same broken file with no id colliding on it and
//     gets a plan, not a rejection. What throws is the COLLISION.
//
// A row phrased against the defect ("the file is not destroyed") would go green
// forever the moment anybody made the write path safe some other way. This one
// goes red exactly when the preset guard in `save.ts` stops answering.
//
// ═══ THE ADAPTER ══════════════════════════════════════════════════════════
//
// Its own `memFa`, one that REALLY LISTS, for the reason the two neighbouring
// files both state: the aeon-load/aeon-save adapter's `list()` returns nothing
// unconditionally, and a preset library is loaded BY listing a directory, so a
// row written against that adapter would report "no presets" for every fixture
// and pass whether the caller was wired or not.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import {
  parseEffectsPreset, serializeEffectsPreset, effectsPresetPath,
} from '../../../formats/effects/preset';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

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

/**
 * `dataPath: 'data/ojz/act1/'` gives dataRoot `data/`, so every preset path in
 * this file is DERIVED through the production helper rather than typed out: a
 * path spelled by hand here would keep agreeing with itself after the writer
 * moved its directory.
 */
const DATA_ROOT = 'data/';
const BROKEN_ID = 'broken_p';
const KEEPER_ID = 'keeper_p';
const brokenPath = effectsPresetPath(DATA_ROOT, BROKEN_ID);

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

const enc = (s: string) => new TextEncoder().encode(s);

/** An interrupted write, not a stub: a real document cut off part-way. */
const truncated = (doc: string) => enc(doc.slice(0, Math.floor(doc.length * 0.6)));

/**
 * The fixture, with ONE unreadable preset on disk and no unreadable scene
 * anywhere. The scene half of the same rule therefore has nothing to fire on,
 * which is what lets the row below attribute a rejection to the preset guard.
 */
function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', enc(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0e; pal[i * 2 + 1] = 0xee; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/objects.json', enc('[]'));
  files.set(effectsPresetPath(DATA_ROOT, KEEPER_ID), enc(presetDoc(KEEPER_ID)));
  files.set(brokenPath, truncated(presetDoc(BROKEN_ID)));
  return files;
}

async function openFixture(files: Map<string, Uint8Array>) {
  return loadAeonProject(memFa(files), '/proj');
}
const planFor = (r: Awaited<ReturnType<typeof openFixture>>, files: Map<string, Uint8Array>) =>
  buildAeonSavePlan(memFa(files), r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: false });

describe('buildAeonSavePlan: the raster-preset write-side refusal', () => {
  it('refuses the save when an authored preset id collides with an unreadable preset file, '
    + 'and it is the RASTER PRESET guard that answers', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);

    // ── PREMISE 1: the load really saw the file and really refused it, and the
    // author cannot see it in any list, which is what makes the collision easy
    // to author by accident.
    expect(r.project.effectsPresets.unreadable.map((u) => u.path)).toContain(brokenPath);
    expect(r.project.effectsPresets.presets.map((p) => p.id)).not.toContain(BROKEN_ID);

    // ── PREMISE 2, and the first neighbour ruled out: there is NO unreadable
    // scene in this fixture, so the scene half of the same rule cannot be what
    // throws below.
    expect(r.project.effectsScenes.unreadable).toEqual([]);

    // ── PREMISE 3, the second neighbour ruled out: the document being authored
    // is a real, schema-valid preset that re-serializes, so the separate
    // "invalid document in memory" refusal has nothing to complain about.
    const authored = parseEffectsPreset(presetDoc(BROKEN_ID), BROKEN_ID);
    expect(() => serializeEffectsPreset(authored)).not.toThrow();
    expect(parseEffectsPreset(serializeEffectsPreset(authored), BROKEN_ID)).toEqual(authored);

    r.project.effectsPresets.presets.push(authored);

    // ── THE PROPERTY. Not "it rejected" but "the raster-preset write guard is
    // what rejected": the message names THIS file and says what kind of
    // document it failed to read it as.
    await expect(planFor(r, files)).rejects
      .toThrow(new RegExp(`refusing to save preset "${BROKEN_ID}": `
        + `${brokenPath.replace(/[.]/g, '\\.')} exists and could not be read as a raster preset`));

    // ── ...and it is not the SCENE guard's message wearing the same words.
    await expect(planFor(r, files)).rejects.not.toThrow(/could not be read as an effects scene/);
  });

  it('CONTROL: the same unreadable preset file plans a normal save when no authored id '
    + 'collides with it, so the refusal above is caused by the COLLISION', async () => {
    const files = fixtureFiles();
    const r = await openFixture(files);

    const authored = parseEffectsPreset(presetDoc('fresh_p'), 'fresh_p');
    r.project.effectsPresets.presets.push(authored);

    const plan = await planFor(r, files);

    // The authored preset is planned, at the path its id names.
    expect(plan.files.map((f) => f.path)).toContain(effectsPresetPath(DATA_ROOT, 'fresh_p'));
    // The broken file is neither written over nor deleted: its presence alone
    // is harmless, which is what makes the rejection above attributable.
    expect(plan.files.map((f) => f.path)).not.toContain(brokenPath);
    expect(plan.removals.map((x) => x.path)).not.toContain(brokenPath);
  });
});
