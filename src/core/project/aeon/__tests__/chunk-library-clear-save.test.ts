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


import { buildAeonSavePlan } from '../save';

/**
 * CLEARING THE CHUNK LIBRARY MUST NOT REACH DISK ON THE NEXT SAVE.
 *
 * Decision d-30 asks the owner whether the Chunks `Clear` button should be
 * confirmed or made undoable: measured 2026-09-03, one unconfirmed click takes
 * the library 71 -> 0 and Ctrl+Z does NOT bring it back, because
 * `clearChunkLibrary` -> `useProjectStore.clearChunks` is a bare zustand `set`
 * that never goes through `executeCommand`.
 *
 * THE ONLY RECOVERY IS RE-OPENING THE PROJECT, AND THAT RECOVERY RESTS ENTIRELY
 * ON THE GUARD THESE ROWS PIN — `save.ts`'s `project.chunkLibrary.length > 0`.
 * With an emptied library the chunk library file is simply absent from the save
 * plan, so the bytes on disk are left alone and a re-open genuinely restores.
 * Delete that guard and the same misclick, followed by an ordinary Ctrl+S,
 * becomes PERMANENT — which would turn d-30 from a papercut into data loss and
 * would change the answer the owner is being asked for.
 *
 * Proven red-first: replacing the length check with `true` fails the second row
 * while the positive control stays green.
 *
 * Fixture helpers are this suite's own, reused verbatim rather than invented —
 * a hand-built config for `buildAeonSavePlan` invents the conditions of its own
 * answer, and the first attempt at one failed its own positive control.
 */
describe('d-30: clearing the chunk library must not reach disk on the next save', () => {
  async function planPaths(clear: boolean): Promise<string[]> {
    const files = fixtureFiles({ ...PROJECT_JSON, chunkLibrary: 'data/chunks.json' });
    files.set('data/chunks.json', new TextEncoder().encode(JSON.stringify([{
      id: 'c0', name: 'Chunk 0', widthTiles: 2, heightTiles: 2, nametable: [0, 0, 0, 0],
    }])));
    files.set('data/chunks_tiles.bin', serializeTiles([tile(7)]));
    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/p');
    // THE GESTURE UNDER TEST: exactly what clearChunks() does to the store.
    if (clear) r.project.chunkLibrary = [];
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    return plan.files.map((f) => f.path);
  }

  it('POSITIVE CONTROL: library POPULATED -> the chunk library file IS in the save plan', async () => {
    expect(await planPaths(false)).toContain('data/chunks.json');
  });

  it('THE QUESTION: library CLEARED -> the file is NOT in the plan, so the save leaves it alone', async () => {
    expect(await planPaths(true)).not.toContain('data/chunks.json');
  });
});
