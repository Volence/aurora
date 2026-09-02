// SAVE-ADDS-RASTERREF-NULL — the measurement, pinned (2026-09-02).
//
// The suite hub reported (2026-08-30) that a full-project save from Aurora left
// aeon sidecars modified, each having GAINED `"rasterRef": null` where the
// source file carried no `rasterRef` key. This file measures exactly that, on
// the exact code path a full-project save takes for an untouched section
// (loadAeonProject -> buildAeonSavePlan, the pair state/aeon-save.ts drives),
// over the real bytes of aeon's committed sidecars.
//
// MEASURED: YES, the writer adds the key. The path is
//   load.ts     `parseSectionMeta(...)` -> section.rasterRef        (absent -> null,
//               section-meta.ts `typeof raw?.rasterRef === 'string' ? ... : null`)
//   save.ts     `serializeSectionMeta({... rasterRef: section.rasterRef ...})`
//               (emits the four-key body through canonicalJsonPretty)
// so the model never holds "absent" — `Section.rasterRef` is `string | null`
// (s4-types.ts) — and the writer emits the canonical four-key body whatever
// the file spelled. The first cut of this file asserted byte identity and was
// RED with exactly `+ "rasterRef": null,` on both fixtures (packet
// docs/reviews/2026-09-02-rasterref-absent-save.md carries the diff).
//
// NOT FIXED, BY THE CONTRACT'S OWN WORDS (empyrean docs/AURORA_EFFECTS_SCHEMA.md
// at origin/main e7e5a51, read via git show, never a working tree):
//   §3.1: "`null` / absent = 'this section keeps its hand-authored raster
//         channel.' Absent and explicit-null are the same state, exactly as
//         for `sceneRef`."
//   §3.1: "Canonical form is unchanged (§8): sort_keys=True, indent=2, exactly
//         one trailing \n." — and §3.1's own example body carries all four keys.
//   §3:   "Write condition (explicit-null semantics, matching the existing
//         refs exactly ...)"
// So the sidecar is a TWO-state key. preset.ts's three-state rule ("this codec
// must never normalise an absent key to null") is scoped to `cycles`/`variants`
// INSIDE a preset document, where absent and null lower to DIFFERENT engine
// values; it is not the sidecar's rule. Preserving absence here would give
// `Section.rasterRef` a third state the contract says does not exist, through
// every one of the thirteen ref-set sites, and would change what an explicit
// unbind writes for a file that never had the key — a contract question, not
// this parcel's call. Precedent: `paletteRef: null` sits in every one of
// aeon's committed sidecars for the same reason, and the §8 trailing-newline
// ruling accepted a one-byte no-edit flip as the writer migrating a file to
// canonical form.
//
// WHAT THESE ROWS PIN, so a change in EITHER direction is loud: the no-edit
// save of a pre-`rasterRef` sidecar emits the input with EXACTLY ONE line
// inserted (`"rasterRef": null` in sorted position, plus the §8 tail when the
// file lacked it), the parsed STATE is unchanged, and nothing else is added.
// If the contract is later ruled to preserve absence, the first two rows go
// red and the fix lands against them; if the writer ever starts adding a
// second key or dropping one, the key-set row goes red.
//
// The on-disk bodies below are VERBATIM copies of aeon's files at their
// `origin/master` `d78f9090` (2026-09-02), read through git objects:
//   games/sonic4/data/editor/ojz/act1/section_0.meta.json
//     sha256 3b375c4e884e2ea97a0392f26fa5a5833deab2606c98040ecf08b373ee8227b9
//     (three keys, NO trailing newline)
//   games/sonic4/data/editor/ojz/act1/section_4.meta.json
//     sha256 f16ce9cb5d895cd8a89ef453034730b2bdedc7566010a8eebdc5c85d72522bdd
//     (three keys, one trailing newline — the §8 canonical tail)
// Only THREE sidecars have ever existed on any aeon ref (`git log --all
// --diff-filter=A -- '*.meta.json'`), and section_5 already carries the key,
// so at most these two tracked files can gain it on a full save.
//
// Hand-written on purpose (aeon-save.test.ts's rule): a fixture built by the
// serializer would carry whatever the serializer emits and the comparison
// would pass while the writer was changing the file.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { parseSectionMeta } from '../../../formats/section-meta';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

// Fixture helpers copied VERBATIM from aeon-save.test.ts (tests must not import
// each other).
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
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
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

const META_PATH = 'data/ojz/act1/section_0.meta.json';

/** aeon origin/master d78f9090 section_0.meta.json, byte for byte. */
const AEON_SECTION_0_META = [
  '{',
  '  "bgLayoutRef": "ingame-forest-v15-1786630615596",',
  '  "paletteRef": null,',
  '  "sceneRef": "ojz_act1_start"',
  '}',
].join('\n');

/** aeon origin/master d78f9090 section_4.meta.json, byte for byte. */
const AEON_SECTION_4_META = [
  '{',
  '  "bgLayoutRef": null,',
  '  "paletteRef": null,',
  '  "sceneRef": "ojz_act1_depth"',
  '}',
  '',
].join('\n');

/** The one line the writer inserts, in its sorted position (after paletteRef). */
const PALETTE_LINE = '  "paletteRef": null,\n';
const INSERTED_LINE = '  "rasterRef": null,\n';

/** The expectation DERIVED from the input bytes: the same text with exactly
 *  one line inserted after `paletteRef`, and the §8 tail if it was missing. */
function withKeyInserted(onDisk: string): string {
  expect(onDisk.split(PALETTE_LINE)).toHaveLength(2); // the anchor is present once
  const body = onDisk.replace(PALETTE_LINE, PALETTE_LINE + INSERTED_LINE);
  return body.endsWith('\n') ? body : body + '\n';
}

/** Load, plan a full save of the act with NO edit, return the sidecar's bytes. */
async function untouchedSaveOf(onDisk: string): Promise<{ input: string; output: string }> {
  const files = fixtureFiles();
  files.set(META_PATH, new TextEncoder().encode(onDisk));
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
    { legacyAtlasMerged: r.legacyAtlasMerged });
  const written = plan.files.filter(f => f.path === META_PATH);
  expect(written).toHaveLength(1);
  return { input: onDisk, output: new TextDecoder().decode(written[0]!.bytes) };
}

describe('SAVE-ADDS-RASTERREF-NULL — a no-edit save of a sidecar that has no rasterRef key', () => {
  it('aeon section_4 (canonical tail): emits the input with exactly `"rasterRef": null` inserted', async () => {
    const { input, output } = await untouchedSaveOf(AEON_SECTION_4_META);
    expect(output).not.toBe(input);            // the hub's report, reproduced
    expect(output).toBe(withKeyInserted(input));
  });

  it('aeon section_0 (no trailing newline): the same insertion plus the §8 tail, nothing else', async () => {
    const { input, output } = await untouchedSaveOf(AEON_SECTION_0_META);
    expect(output).not.toBe(input);
    expect(output).toBe(withKeyInserted(input));
  });

  it('the parsed STATE is unchanged — absent and null are one state (schema §3.1)', async () => {
    for (const body of [AEON_SECTION_0_META, AEON_SECTION_4_META]) {
      const { input, output } = await untouchedSaveOf(body);
      expect(parseSectionMeta(output)).toEqual(parseSectionMeta(input));
      expect(parseSectionMeta(output).rasterRef).toBeNull();
    }
  });

  it('adds `rasterRef` and no other key, and drops none', async () => {
    const { input, output } = await untouchedSaveOf(AEON_SECTION_4_META);
    const inKeys = Object.keys(JSON.parse(input) as object).sort();
    const outKeys = Object.keys(JSON.parse(output) as object).sort();
    expect(outKeys).toEqual([...inKeys, 'rasterRef'].sort());
  });
});
