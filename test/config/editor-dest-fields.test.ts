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
  ['games/sonic4/data/editor/ojz/act1/section_0.objects.json', 80],
  ['games/sonic4/data/editor/ojz/act1/section_0.rings.json', 2],
  ['games/sonic4/data/editor/ojz_tiles.bin', 64],
  ['games/sonic4/data/editor/ojz_act1_bg.bin', 256],
  ['games/sonic4/data/editor/ojz_act1_bg_tiles.bin', 66],
  ['project.json', 993],
  // The capture also ended with five `export/` writes — act_descriptor.asm,
  // entity_data.asm, vram_bases.asm and section_0.{tiles,art}.bin. The export
  // step was retired 2026-08-19 (ROADMAP §4.2); a save is editor files only
  // now, and the tail of this baseline went with it. Everything above is
  // unchanged from the original capture.
];

/** The project.json text that same capture produced, verbatim. */
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
}`;

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

describe('project.json trailing newline (churn rider)', () => {
  it('reproduces a source file that ended with a newline', async () => {
    const p = await plan(fixtureFiles({ trailingNewline: true }));
    expect(textOf(p, 'project.json').endsWith('\n')).toBe(true);
  });

  it('does not invent one for a source file that did not', async () => {
    const p = await plan(fixtureFiles({ trailingNewline: false }));
    expect(textOf(p, 'project.json').endsWith('\n')).toBe(false);
  });
});

describe('editor destinations absent — Aurora owns the path (unchanged behaviour)', () => {
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

describe('editor destinations declared — the repo owns the path', () => {
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
