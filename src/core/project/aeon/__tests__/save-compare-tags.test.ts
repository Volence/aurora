// THE `compare` TAGS ON THE PLAN'S PUSH SITES.
//
// ⚠ THIS FILE EXISTS BECAUSE A PLANT CAME BACK GREEN. `planFileNeedsWrite` is
// unit-tested exhaustively (save-skip.test.ts) and the save glue is tested end
// to end (renderer/state/__tests__/aeon-save.test.ts), and BOTH stayed green
// when the preset push site in save.ts was re-tagged from `'json'` to
// `'section-meta'` — a mutation that would let a preset's `cycles: null` be
// mistaken for an absent `cycles` and the write silently skipped. Nothing
// observed the tags themselves: the predicate's tests supply their own tag, and
// the glue fixture has no preset in it.
//
// So this file asserts the seam between the two: which rule each planned write
// is actually filed under. The rows are DERIVED from the format's own
// three-state rule rather than from a list of expected strings, so a re-tag is
// caught by what it would DO and not by a name it would change.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { planFileNeedsWrite } from '../save-skip';
import { effectsPresetPath, serializeEffectsPreset, type EffectsPreset } from '../../../formats/effects/preset';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

const PROJECT_JSON = {
  name: 'Tags', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone', tileset: 'data/ojz_tiles.bin', palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1, dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

/** In-memory FileAccess that really lists — the preset/scene libraries load by
 *  walking a directory, so a `list()` that always returns [] would report an
 *  empty library and make every row below true for the wrong reason. */
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
  return files;
}

async function planFor(files: Map<string, Uint8Array>, mutate?: (r: Awaited<ReturnType<typeof loadAeonProject>>) => void) {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  mutate?.(r);
  const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
    { legacyAtlasMerged: r.legacyAtlasMerged });
  return { r, plan };
}

describe('the plan tags every write with the rule it must be compared under', () => {
  /**
   * ONLY WITNESS FOR: a binary is never parsed. `compare` left off means byte
   * identity, and a `.bin` that happened to be tagged `'json'` would have its
   * bytes compared as text — a nametable that decodes to invalid UTF-8 would
   * then be written every time (noisy), and one that decoded to the same JSON
   * value would be skipped when it HAD changed (destructive).
   */
  it('leaves every non-JSON write untagged', async () => {
    const { plan } = await planFor(fixtureFiles());
    const tagged = plan.files.filter((f) => !f.path.endsWith('.json') && f.compare !== undefined);
    expect(tagged.map((f) => `${f.path}:${f.compare}`)).toEqual([]);
    // The floor: the plan really did contain binaries, or the row above is
    // true of an empty list.
    expect(plan.files.filter((f) => !f.path.endsWith('.json')).length).toBeGreaterThan(0);
  });

  /**
   * ONLY WITNESS FOR: no JSON write was left on byte identity. An untagged JSON
   * file is SAFE (it just writes more), but it is also the whole defect — every
   * one of the 23 noise files was an untagged JSON write.
   */
  it('tags every JSON write, and only ever as section-meta for a .meta.json', async () => {
    const files = fixtureFiles();
    const { plan } = await planFor(files, (r) => {
      // Force the sidecar and the chunk-links branches into the plan.
      r.project.zones[0].acts[0].sections[0]!.sceneRef = 'ojz_act1_depth';
    });
    const json = plan.files.filter((f) => f.path.endsWith('.json'));
    expect(json.length).toBeGreaterThan(2);
    expect(json.filter((f) => f.compare === undefined).map((f) => f.path)).toEqual([]);
    // The sidecar relaxation is scoped BY PATH as well as by tag: nothing else
    // may claim it.
    expect(json.filter((f) => f.compare === 'section-meta').map((f) => f.path))
      .toEqual(['data/ojz/act1/section_0.meta.json']);
  });

  /**
   * ONLY WITNESS FOR: the preset document keeps `null` and absent DISTINCT
   * through the tag the plan actually filed it under.
   *
   * `cycles` absent = keep the section's hand-authored cycle; `cycles: null` =
   * cycling OFF, which lowers to the Pal_Cycle_None sentinel
   * (formats/effects/preset.ts). They are different engine output. This row
   * takes the tag OFF the plan — never a literal — and asks the real predicate
   * whether a disk body with `cycles` absent still has to be rewritten when the
   * session set it to null. It must.
   */
  it('files a preset under a rule that still writes when cycles goes null', async () => {
    const files = fixtureFiles();
    const preset: EffectsPreset = {
      schema: 1, id: 'ojz_probe',
      bands: [{ top: 96, bot: 112, sh: false, on: { cram: { addr: 0x80, colours: [0x0e2] } } }],
      cycles: null,
    };
    const { plan } = await planFor(files, (r) => {
      r.project.effectsPresets.presets.push(preset);
    });
    const path = effectsPresetPath('data/', 'ojz_probe');
    const file = plan.files.find((f) => f.path === path);
    expect(file, `the preset was not planned at ${path}`).toBeDefined();

    // The body as it would sit on disk with the key simply ABSENT — the state
    // that means "keep the hand-authored cycle".
    const onDisk = JSON.parse(dec(file!.bytes)) as Record<string, unknown>;
    expect(onDisk.cycles, 'the writer did not emit the null this row is about').toBeNull();
    delete onDisk.cycles;

    expect(
      planFileNeedsWrite(file!.compare, enc(`${JSON.stringify(onDisk, null, 2)}\n`), file!.bytes),
      'a preset turning cycling OFF was mistaken for one that never mentioned it',
    ).toBe(true);
  });

  /**
   * ONLY WITNESS FOR: the sidecar's relaxation really is reachable through the
   * tag the plan filed — the positive half of the row above, so a tag scheme
   * that simply refused every skip could not pass both.
   */
  it('files a sidecar under a rule that skips an absent-vs-null rasterRef', async () => {
    const files = fixtureFiles();
    const { plan } = await planFor(files, (r) => {
      r.project.zones[0].acts[0].sections[0]!.sceneRef = 'ojz_act1_depth';
    });
    const file = plan.files.find((f) => f.path === 'data/ojz/act1/section_0.meta.json')!;
    const onDisk = JSON.parse(dec(file.bytes)) as Record<string, unknown>;
    expect(onDisk).toHaveProperty('rasterRef', null);
    delete onDisk.rasterRef;

    expect(
      planFileNeedsWrite(file.compare, enc(JSON.stringify(onDisk, null, 2)), file.bytes),
      'the sidecar was still rewritten just to spell out an absent ref',
    ).toBe(false);
  });

  it('round-trips a serialized preset unchanged, so the row above is not about formatting', async () => {
    const preset: EffectsPreset = {
      schema: 1, id: 'ojz_probe',
      bands: [{ top: 96, bot: 112, sh: false, on: { cram: { addr: 0x80, colours: [0x0e2] } } }],
      cycles: null,
    };
    const { plan } = await planFor(fixtureFiles(), (r) => {
      r.project.effectsPresets.presets.push(preset);
    });
    const file = plan.files.find((f) => f.path.endsWith('ojz_probe.json'))!;
    expect(planFileNeedsWrite(file.compare, enc(serializeEffectsPreset(preset)), file.bytes))
      .toBe(false);
  });
});
