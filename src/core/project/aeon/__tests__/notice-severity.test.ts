// Every load notice carries the severity the PRODUCER knows, not the one the
// toast site guesses.
//
// The defect this pins: `notices` was `string[]`, and aeon-open.ts toasted the
// whole channel `'success'` — so markUnreadable's "exists but could not be read
// … fix it by hand and reopen" arrived GREEN, on the 2.2s success dwell, and
// read as confirmation that something worked.
//
// The rows below assert severity at the SITE THAT KNOWS, one per producer, and
// they deliberately include the one genuine SUCCESS (atlas unification). Without
// that row the honest fix and the inversion — painting every notice a warning,
// which trains people to ignore the channel — are indistinguishable to the
// suite.
//
// Classification is never inferred from the message text: a matcher over prose
// stops matching the moment someone rewords a message, and nothing goes red.
// The severity is a required field of `Notice`, so tsc refuses a push site that
// does not name one.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import type { Notice, NoticeSeverity } from '../../notice';
import { loadAeonProject } from '../load';
import { loadEffectsSceneLibrary } from '../../../formats/effects/scene';
import { loadEffectsPresetLibrary } from '../../../formats/effects/preset';
import { loadBgOverride } from '../../../formats/bg-override/bg-override-io';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    // A key match OR a directory prefix — the effects loaders probe the
    // directory before listing it.
    exists: async (rel) => files.has(rel) || [...files.keys()].some((k) => k.startsWith(rel)),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async (dir) => {
      const out = new Set<string>();
      for (const k of files.keys()) {
        if (!k.startsWith(dir)) continue;
        const rest = k.slice(dir.length);
        if (rest.length === 0) continue;
        out.add(rest.split('/')[0]);
      }
      return [...out];
    },
  };
}

const PROJECT_JSON = {
  name: 'Notice Severity Project',
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

function fixtureFiles(config: Record<string, unknown> = PROJECT_JSON): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(config)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  return files;
}

/** The severities present on the notices whose message names `needle`. */
function severitiesFor(notices: readonly Notice[], needle: string): NoticeSeverity[] {
  return notices.filter((n) => n.message.includes(needle)).map((n) => n.severity);
}

describe('load notices carry a producer-assigned severity', () => {
  it('markUnreadable — a section file that exists and will not read is NOT a success', async () => {
    const files = fixtureFiles();
    // Valid JSON syntax, wrong shape for the objects reader — a truncated hand
    // edit, which is exactly the case markUnreadable was written for.
    files.set('data/ojz/act1/section_0.objects.json', new TextEncoder().encode('{"not": "an array"'));
    const r = await loadAeonProject(memFa(files), '/p');

    expect(severitiesFor(r.notices, 'section_0.objects.json')).toEqual(['error']);
    // ANTI-VACUOUS: the row above would also pass on an empty list.
    expect(r.notices.some((n) => n.message.includes('section_0.objects.json'))).toBe(true);
  });

  it('atlas unification — the one genuine SUCCESS stays on the success channel', async () => {
    // Guards the inversion: a fix that paints every notice a warning is the same
    // defect wearing the other colour.
    const files = fixtureFiles({ ...PROJECT_JSON, chunkLibrary: 'data/chunks.json' });
    files.set('data/chunks.json', new TextEncoder().encode(JSON.stringify([{
      id: 'c0', name: 'Chunk 0', widthTiles: 2, heightTiles: 2, nametable: [0, 0, 0, 0],
    }])));
    files.set('data/chunks_tiles.bin', serializeTiles([tile(7)]));
    const r = await loadAeonProject(memFa(files), '/p');

    expect(severitiesFor(r.notices, 'Tile atlases unified')).toEqual(['success']);
    expect(r.legacyAtlasMerged).toBe(true);
  });

  it('a project with nothing to report produces no notices at all', async () => {
    const r = await loadAeonProject(memFa(fixtureFiles()), '/p');
    expect(r.notices).toEqual([]);
  });
});

describe('the format libraries classify their own notices', () => {
  const DATA_ROOT = 'data/';

  it('an effects scene that will not parse is an error, not a success', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('data/editor/effects/broken.json', new TextEncoder().encode('{ nope'));
    const lib = await loadEffectsSceneLibrary(memFa(files), DATA_ROOT);
    expect(severitiesFor(lib.notices, 'broken.json')).toEqual(['error']);
  });

  it('a raster preset that will not parse is an error, not a success', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('data/editor/effects/presets/broken.json', new TextEncoder().encode('{ nope'));
    const lib = await loadEffectsPresetLibrary(memFa(files), DATA_ROOT);
    expect(severitiesFor(lib.notices, 'broken.json')).toEqual(['error']);
  });

  it('a BG override that will not parse is an error, not a success', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('data/editor_bg_override.json', new TextEncoder().encode('{ nope'));
    const state = await loadBgOverride(memFa(files), DATA_ROOT);
    expect(severitiesFor(state.notices, 'editor_bg_override.json')).toEqual(['error']);
  });

  // The parser's own two advisory notices (the legacy `anim` upgrade and the
  // empty-`anims` drop) are 'warning', and they are pinned where their fixtures
  // already live: test/formats/bg-override.test.ts.
});
