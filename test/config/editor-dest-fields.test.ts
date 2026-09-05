// The editor-destination contract, end to end: project.json text →
// loadAeonProject → buildAeonSavePlan → the planned bytes.
//
// Two things are pinned here that only a real round-trip can pin:
//
//   1. RAW-VERBATIM PRESERVATION. loadS4Config keeps the parsed project.json as
//      config.raw and the save re-stringifies THAT, so keys the editor does not
//      model survive at every nesting depth. Previously only asserted against a
//      hand-written JSON.stringify standing in for the save; here the actual
//      save plan is the subject.
//   2. WHO OWNS THE DESTINATION. With editorTilesetPath / editorBgLayout /
//      editorBgTiles absent, Aurora derives the path and retargets the pointer
//      (the historical behaviour); with one declared, the bytes go there and
//      that pointer is never rewritten.
//
// The absent-field expectations below are a capture of the plan this fixture
// produced BEFORE the mechanism existed — path list, order, byte lengths and
// the project.json text verbatim — so the no-op claim is measured, not argued.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { buildAeonSavePlan } from '../../src/core/project/aeon/save';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeBgTiles, BG_WIDTH } from '../../src/core/formats/bg-tiles';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';

// Fixture helpers are duplicated rather than imported: tests must not import
// each other (the convention aeon-save.test.ts states in its own header).
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

type Json = Record<string, any>;

/** The base project: post-split layout, art pointed at the engine's regenerated
 *  tree, and one unmodelled key at each of the three nesting levels. */
function baseProject(): Json {
  return {
    name: 'Sonic 4',
    engine: 's4',
    unknownTopKey: { keep: true },
    zones: [{
      id: 'ojz',
      name: 'Oracle Jungle Zone',
      tileset: 'games/sonic4/data/generated/ojz/act1/ojz_tiles.bin',
      palette: 'games/sonic4/data/generated/ojz/act1/ojz_palette.bin',
      unknownZoneKey: 'zone-scoped',
      acts: [{
        id: 'act1',
        gridWidth: 1,
        gridHeight: 1,
        dataPath: 'games/sonic4/data/editor/ojz/act1/',
        bgLayout: 'games/sonic4/data/generated/ojz/act1/ojz_bg.bin',
        bgTiles: 'games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin',
        // DELIBERATELY the key aeon DELETED (`7bff8488` replaced `parallax`
        // with `sceneRef`; empyrean AURORA_EFFECTS_SCHEMA.md §4). This fixture
        // is a pre-change project.json, so keeping it here is what proves one
        // still loads and that its now-unmodelled key round-trips like any
        // other. The sceneRef-carrying project is a separate fixture, below.
        parallax: null,
        unknownActKey: [1, 2, 3],
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
    objectLibrary: 'games/sonic4/data/objdefs/objects.json',
    chunkLibrary: '',
  };
}

/** Fixture dir. `edit` mutates the project object before it is serialized;
 *  `trailingNewline` controls the one byte the churn rider is about. */
function fixtureFiles(opts: { edit?: (p: Json) => void; trailingNewline?: boolean } = {}): Map<string, Uint8Array> {
  const proj = baseProject();
  opts.edit?.(proj);
  const text = JSON.stringify(proj, null, 2) + (opts.trailingNewline ? '\n' : '');

  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(text));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('games/sonic4/data/generated/ojz/act1/ojz_palette.bin', pal);
  const bg = new Uint16Array(BG_WIDTH * 2);
  bg[0] = 1; bg[1] = 2;
  files.set('games/sonic4/data/generated/ojz/act1/ojz_bg.bin', serializeNametable(bg));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin', serializeBgTiles([tile(2), tile(3)]));
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('games/sonic4/data/editor/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('games/sonic4/data/editor/ojz/act1/section_0.objects.json',
    new TextEncoder().encode(JSON.stringify([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }])));
  files.set('games/sonic4/data/objdefs/objects.json',
    new TextEncoder().encode(JSON.stringify([
      { id: 'ring-monitor', name: 'Ring Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ])));
  return files;
}

async function plan(
  files: Map<string, Uint8Array>,
  opts: { legacyAtlasMerged?: boolean; afterLoad?: (r: Awaited<ReturnType<typeof loadAeonProject>>) => void } = {},
) {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  opts.afterLoad?.(r);
  const p = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1', {
    legacyAtlasMerged: opts.legacyAtlasMerged ?? r.legacyAtlasMerged,
  });
  return p;
}

function textOf(p: { files: { path: string; bytes: Uint8Array }[] }, path: string): string {
  const f = p.files.find(x => x.path === path);
  if (!f) throw new Error(`plan has no ${path} (has: ${p.files.map(x => x.path).join(', ')})`);
  return new TextDecoder().decode(f.bytes);
}

const EDITOR_TILESET = 'games/sonic4/data/editor/ojz_tiles.bin';
const EDITOR_BG_LAYOUT = 'games/sonic4/data/editor/ojz_act1_bg.bin';
const EDITOR_BG_TILES = 'games/sonic4/data/editor/ojz_act1_bg_tiles.bin';

/** Captured from this fixture before the mechanism existed: every planned write,
 *  in order, with its byte length. */
const BASELINE_PLAN: [string, number][] = [
  ['games/sonic4/data/editor/ojz/act1/section_0.tiles.bin', 131072],
  // The three JSON sizes are each one byte over the original capture: the
  // canonical trailing newline (§8, 2026-08-26). Nothing else moved.
  ['games/sonic4/data/editor/ojz/act1/section_0.objects.json', 81],
  ['games/sonic4/data/editor/ojz/act1/section_0.rings.json', 3],
  ['games/sonic4/data/editor/ojz_tiles.bin', 64],
  ['games/sonic4/data/editor/ojz_act1_bg.bin', 256],
  ['games/sonic4/data/editor/ojz_act1_bg_tiles.bin', 66],
  ['project.json', 994],
  // The capture also ended with five `export/` writes — act_descriptor.asm,
  // entity_data.asm, vram_bases.asm and section_0.{tiles,art}.bin. The export
  // step was retired 2026-08-19 (ROADMAP §4.2); a save is editor files only
  // now, and the tail of this baseline went with it. Everything above is
  // unchanged from the original capture.
];

/** The project.json text that same capture produced, verbatim — plus the one
 *  canonical trailing newline the §8 rule added on 2026-08-26. */
const BASELINE_PROJECT_JSON = `{
  "name": "Sonic 4",
  "engine": "s4",
  "unknownTopKey": {
    "keep": true
  },
  "zones": [
    {
      "id": "ojz",
      "name": "Oracle Jungle Zone",
      "tileset": "games/sonic4/data/editor/ojz_tiles.bin",
      "palette": "games/sonic4/data/generated/ojz/act1/ojz_palette.bin",
      "unknownZoneKey": "zone-scoped",
      "acts": [
        {
          "id": "act1",
          "gridWidth": 1,
          "gridHeight": 1,
          "dataPath": "games/sonic4/data/editor/ojz/act1/",
          "bgLayout": "games/sonic4/data/editor/ojz_act1_bg.bin",
          "bgTiles": "games/sonic4/data/editor/ojz_act1_bg_tiles.bin",
          "parallax": null,
          "unknownActKey": [
            1,
            2,
            3
          ],
          "startPosition": {
            "secX": 0,
            "secY": 0,
            "localX": 64,
            "localY": 64
          }
        }
      ]
    }
  ],
  "objectLibrary": "games/sonic4/data/objdefs/objects.json",
  "chunkLibrary": ""
}
`;

describe('raw-verbatim preservation (load → buildAeonSavePlan → parse)', () => {
  it('carries unmodelled keys through at top, zone and act level', async () => {
    const p = await plan(fixtureFiles());
    const out = JSON.parse(textOf(p, 'project.json'));
    expect(out.unknownTopKey).toEqual({ keep: true });
    expect(out.zones[0].unknownZoneKey).toBe('zone-scoped');
    expect(out.zones[0].acts[0].unknownActKey).toEqual([1, 2, 3]);
    // ...alongside the modelled keys the save exists to rewrite.
    expect(out.zones[0].tileset).toBe(EDITOR_TILESET);
  });

  it('writes project.json at a 2-space indent (untouched lines re-serialize identically)', async () => {
    const p = await plan(fixtureFiles());
    // Newline-agnostic on purpose: the trailing byte is the churn rider's
    // subject and has its own tests; this one is about the indent.
    const body = textOf(p, 'project.json').replace(/\n$/, '');
    expect(body).toBe(JSON.stringify(JSON.parse(body), null, 2));
    expect(body.split('\n')[1]).toBe('  "name": "Sonic 4",');
  });
});

describe('project.json trailing newline (the §8 canonical form supersedes the churn rider)', () => {
  // Until 2026-08-26 the save reproduced the source file's own trailing-newline
  // state. The ruling (empyrean AURORA_EFFECTS_SCHEMA.md §8, generalised the
  // same day) is that EVERY JSON file Aurora writes into aeon's tree ends in
  // exactly one newline — so a source without the byte gains it, once.
  it('lands on exactly one newline for a source file that ended with one', async () => {
    const p = await plan(fixtureFiles({ trailingNewline: true }));
    const text = textOf(p, 'project.json');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('lands on exactly one newline for a source file that had none', async () => {
    const p = await plan(fixtureFiles({ trailingNewline: false }));
    const text = textOf(p, 'project.json');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});

describe('editor destinations absent: Aurora owns the path (unchanged behaviour)', () => {
  it('plans exactly the captured writes, in order, at the captured sizes', async () => {
    const p = await plan(fixtureFiles());
    expect(p.files.map(f => [f.path, f.bytes.length])).toEqual(BASELINE_PLAN);
    expect(p.configChanged).toBe(true);
  });

  it('emits the captured project.json byte-for-byte', async () => {
    const p = await plan(fixtureFiles());
    expect(textOf(p, 'project.json')).toBe(BASELINE_PROJECT_JSON);
  });
});

describe('editor destinations declared: the repo owns the path', () => {
  it('writes tile bytes to editorTilesetPath and leaves the tileset pointer alone', async () => {
    const p = await plan(fixtureFiles({
      edit: (proj) => { proj.zones[0].editorTilesetPath = 'games/sonic4/data/editor/repo_owned_tiles.bin'; },
    }));
    const paths = p.files.map(f => f.path);
    expect(paths).toContain('games/sonic4/data/editor/repo_owned_tiles.bin');
    expect(paths).not.toContain(EDITOR_TILESET);
    // Same bytes as the derived path would have received.
    const bytes = p.files.find(f => f.path === 'games/sonic4/data/editor/repo_owned_tiles.bin')!.bytes;
    expect(bytes.length).toBe(64);

    const out = JSON.parse(textOf(p, 'project.json'));
    expect(out.zones[0].tileset).toBe('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin');
    expect(out.zones[0].editorTilesetPath).toBe('games/sonic4/data/editor/repo_owned_tiles.bin');
  });

  it('writes BG bytes to editorBgLayout/editorBgTiles and leaves both pointers alone', async () => {
    const p = await plan(fixtureFiles({
      edit: (proj) => {
        proj.zones[0].acts[0].editorBgLayout = 'games/sonic4/data/editor/repo_bg.bin';
        proj.zones[0].acts[0].editorBgTiles = 'games/sonic4/data/editor/repo_bg_tiles.bin';
      },
    }));
    const paths = p.files.map(f => f.path);
    expect(paths).toContain('games/sonic4/data/editor/repo_bg.bin');
    expect(paths).toContain('games/sonic4/data/editor/repo_bg_tiles.bin');
    expect(paths).not.toContain(EDITOR_BG_LAYOUT);
    expect(paths).not.toContain(EDITOR_BG_TILES);

    const out = JSON.parse(textOf(p, 'project.json'));
    expect(out.zones[0].acts[0].bgLayout).toBe('games/sonic4/data/generated/ojz/act1/ojz_bg.bin');
    expect(out.zones[0].acts[0].bgTiles).toBe('games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin');
  });

  it('is per field: a declared bgLayout does not freeze bgTiles', async () => {
    const p = await plan(fixtureFiles({
      edit: (proj) => { proj.zones[0].acts[0].editorBgLayout = 'games/sonic4/data/editor/repo_bg.bin'; },
    }));
    const paths = p.files.map(f => f.path);
    expect(paths).toContain('games/sonic4/data/editor/repo_bg.bin');
    expect(paths).toContain(EDITOR_BG_TILES);

    const out = JSON.parse(textOf(p, 'project.json'));
    expect(out.zones[0].acts[0].bgLayout).toBe('games/sonic4/data/generated/ojz/act1/ojz_bg.bin');
    expect(out.zones[0].acts[0].bgTiles).toBe(EDITOR_BG_TILES);
  });

  it('declaring every field for an otherwise-unchanged project writes no project.json at all', async () => {
    const p = await plan(fixtureFiles({
      edit: (proj) => {
        proj.zones[0].editorTilesetPath = 'games/sonic4/data/editor/repo_owned_tiles.bin';
        proj.zones[0].acts[0].editorBgLayout = 'games/sonic4/data/editor/repo_bg.bin';
        proj.zones[0].acts[0].editorBgTiles = 'games/sonic4/data/editor/repo_bg_tiles.bin';
      },
    }));
    expect(p.configChanged).toBe(false);
    expect(p.files.map(f => f.path)).not.toContain('project.json');
  });
});

describe('legacy-atlas truncation guard', () => {
  // chunks.json → chunks_tiles.bin is the atlas path the guard protects.
  const CHUNK_LIB = 'games/sonic4/data/editor/ojz/chunks.json';
  const ATLAS = 'games/sonic4/data/editor/ojz/chunks_tiles.bin';

  it('truncates when the atlas is nobody\'s live zone art (control)', async () => {
    const p = await plan(fixtureFiles({
      edit: (proj) => { proj.chunkLibrary = CHUNK_LIB; },
    }), { legacyAtlasMerged: true });
    const trunc = p.files.find(f => f.path === ATLAS);
    expect(trunc).toBeDefined();
    expect(trunc!.bytes.length).toBe(0);
  });

  it('spares the atlas when a zone pointer still names it', async () => {
    // The pointer branch, in the only shape that reaches it while Aurora owns
    // the field: a raw zone the save loop never visits (absent from the project
    // model), so its `tileset` is not retargeted away from the atlas.
    const files = fixtureFiles({
      edit: (proj) => {
        proj.chunkLibrary = CHUNK_LIB;
        proj.zones.push({ id: 'other', name: 'Other', tileset: ATLAS, palette: 'p.bin', acts: [] });
      },
    });
    files.set(ATLAS, serializeTiles([tile(4)]));
    files.set('p.bin', new Uint8Array(96));
    const p = await plan(files, {
      legacyAtlasMerged: true,
      afterLoad: (r) => { r.project.zones = r.project.zones.filter(z => z.id !== 'other'); },
    });
    expect(p.files.some(f => f.path === ATLAS)).toBe(false);
  });

  it('spares the atlas when it is a repo-declared editorTilesetPath', async () => {
    const p = await plan(fixtureFiles({
      edit: (proj) => {
        proj.chunkLibrary = CHUNK_LIB;
        // The bytes land on the atlas path; the pointer stays in data/generated.
        // Only editorTilesetPath names the live art here.
        proj.zones[0].editorTilesetPath = ATLAS;
      },
    }), { legacyAtlasMerged: true });
    expect(p.files.some(f => f.path === ATLAS && f.bytes.length === 0)).toBe(false);
    // ...and the tile bytes really were written there.
    expect(p.files.find(f => f.path === ATLAS)!.bytes.length).toBe(64);
  });
});

// ── Act-level sceneRef (empyrean AURORA_EFFECTS_SCHEMA.md §4) ────────────────
//
// aeon deleted the act entry's `parallax` key and replaced it with `sceneRef`
// (a scene id, or an explicit null) in one edit — aeon `7bff8488`, merged at
// `98100905`. Two halves are pinned here:
//
//   READ  — `Act.sceneRef` comes from the act entry's `sceneRef`, with null and
//           ABSENT collapsed to one value, because §4 gives them one meaning
//           ("the hand-authored engine default stands").
//   WRITE — nothing. The save re-serialises `LoadedS4Config.raw`, so the key
//           survives untouched and no `parallax` key is reintroduced. That is
//           the whole reason a cross-repo key change needed no save-side edit,
//           and it earns a gate precisely BECAUSE it is invisible: a save
//           rewritten as a hand-enumerated literal would pass every other test
//           in this repo while silently deleting sceneRef on first save.

/** Act entry in aeon's post-`7bff8488` shape: no `parallax`, a real `sceneRef`. */
function sceneRefFixture(sceneRef: string | null | undefined): Map<string, Uint8Array> {
  return fixtureFiles({
    edit: (proj) => {
      const act = proj.zones[0].acts[0];
      delete act.parallax;
      if (sceneRef === undefined) delete act.sceneRef;
      else act.sceneRef = sceneRef;
    },
  });
}

async function loadedAct(files: Map<string, Uint8Array>) {
  const r = await loadAeonProject(memFa(files), '/proj');
  const act = r.project.zones[0].acts[0];
  // The instrument must have seen its subject: a real act off a real project.
  // Without this, "sceneRef is null" is equally true of a project that never
  // loaded at all.
  expect(act.id).toBe('act1');
  expect(act.gridWidth).toBe(1);
  return act;
}

describe('act-level sceneRef: the reader (schema §4)', () => {
  it('reads the act entry sceneRef into Act.sceneRef', async () => {
    expect((await loadedAct(sceneRefFixture('canopy_dusk'))).sceneRef).toBe('canopy_dusk');
  });

  it('collapses an explicit null to null', async () => {
    expect((await loadedAct(sceneRefFixture(null))).sceneRef).toBeNull();
  });

  it('collapses an ABSENT key to the same null, not undefined', async () => {
    const act = await loadedAct(sceneRefFixture(undefined));
    // toBeNull and not toBeFalsy: the declared type is `string | null`, and an
    // undefined sitting in it is exactly the typed lie this re-point closed.
    expect(act.sceneRef).toBeNull();
  });

  it('gives a pre-change project.json (parallax, no sceneRef) that same null', async () => {
    // The `parallax` value is a PATH. If any reader were still wired to that
    // key this would come back as 'games/...' — a path where a scene id
    // belongs, which is the confusion §4 renamed the key to make impossible.
    const files = fixtureFiles({
      edit: (proj) => {
        proj.zones[0].acts[0].parallax = 'games/sonic4/data/parallax/ojz_default.asm';
      },
    });
    expect((await loadedAct(files)).sceneRef).toBeNull();
  });
});

describe('act-level sceneRef: the save round-trip (raw re-serialisation)', () => {
  /** The act keys buildAeonSavePlan is documented to OWN and may rewrite. */
  const SAVE_OWNED_ACT_KEYS = ['bgLayout', 'bgTiles'];

  function omitOwned(act: Json): Json {
    const out: Json = {};
    for (const k of Object.keys(act)) if (!SAVE_OWNED_ACT_KEYS.includes(k)) out[k] = act[k];
    return out;
  }

  it('writes sceneRef back exactly as it found it, and reintroduces no parallax key', async () => {
    const p = await plan(sceneRefFixture('canopy_dusk'), {
      afterLoad: (r) => {
        // Subject check: the model really carries the id, so the assertion
        // below is about a round trip and not two unrelated nulls agreeing.
        expect(r.project.zones[0].acts[0].sceneRef).toBe('canopy_dusk');
      },
    });
    const outAct = JSON.parse(textOf(p, 'project.json')).zones[0].acts[0];
    expect(outAct.sceneRef).toBe('canopy_dusk');
    expect('parallax' in outAct).toBe(false);
  });

  it('preserves an explicit null as a PRESENT key, not a dropped one', async () => {
    // aeon spells the empty case `"sceneRef": null` rather than omitting it,
    // deliberately (`7bff8488`: an explicit null is discoverable to Aurora's
    // reader). A save that dropped the key would still be "correct" under §4's
    // null==absent rule while quietly undoing that choice.
    const p = await plan(sceneRefFixture(null));
    const outAct = JSON.parse(textOf(p, 'project.json')).zones[0].acts[0];
    expect('sceneRef' in outAct).toBe(true);
    expect(outAct.sceneRef).toBeNull();
  });

  /**
   * The general claim, stated so it cannot be satisfied by remembering to
   * enumerate one more key: EVERY act key the save does not own comes back
   * unchanged. Derived from the input object rather than a copied literal, so
   * it grows with the fixture — and it is what fails if `save.ts` is ever
   * rewritten to reconstruct project.json from the model.
   */
  it('returns every act key it does not own, unchanged', async () => {
    const inProj = baseProject();
    delete inProj.zones[0].acts[0].parallax;
    inProj.zones[0].acts[0].sceneRef = 'canopy_dusk';

    const p = await plan(sceneRefFixture('canopy_dusk'));
    const outAct = JSON.parse(textOf(p, 'project.json')).zones[0].acts[0];

    const expected = omitOwned(inProj.zones[0].acts[0]);
    // Subject check: the comparison covers a non-trivial key set that really
    // includes the contract key. An empty `expected` would pass vacuously.
    expect(Object.keys(expected)).toContain('sceneRef');
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(7);
    expect(omitOwned(outAct)).toEqual(expected);
  });
});
