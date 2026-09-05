// A load that fails N times produces ONE notice, not N.
//
// THE DEFECT. Moving genuine read failures onto the ERROR channel was right, and
// `dwellMs('error')` is ten seconds for a good reason (a message that has to be
// acted on needs time to be read). But `markUnreadable` pushed one notice per
// call and is called for SEVEN files per section — tiles.bin, collattr.bin,
// collattrb.bin, objects.json, rings.json, meta.json, chunklinks.json. A 3x3 act
// (OJZ act 1's shape) whose sections are all corrupt therefore produced 63 error
// notices, i.e. 63 ten-second toasts in a stack with no cap: a wall over the
// editor, and the pressure that makes someone turn the channel off.
//
// The two effects LIBRARIES are worse in kind, not degree: their loops run over
// a DIRECTORY LISTING, so the count is whatever the tree holds and no fix at the
// section loader bounds them.
//
// WHAT THESE ROWS PIN, and what they deliberately do not:
//   • The fold happens and is total — one notice for a whole flood.
//   • The COUNT in that notice is the real one. Derived here from the load's own
//     `section.unreadable` bookkeeping, never from a literal: a summary that
//     says a number it did not measure is the inversion this row exists to
//     prevent, and "63" hard-coded would go stale the day an eighth sidecar
//     appears and would never go red.
//   • Coalescing changed the COUNT and not the CHANNEL. Still 'error'.
//   • A SINGLE failure keeps the message it always had, word for word. One
//     hand-edit gone wrong is the common case and naming the file outright is
//     already the right answer; a fix that made the common case worse to make
//     the rare case better would not be a fix.
//
// They do NOT pin how many toasts the STACK paints — that is
// renderer/state/__tests__/toast-stack.test.ts, and the two halves are separate
// on purpose: coalescing bounds one producer, the cap bounds the screen.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FileAccess } from '../../adapter';
import { NAMED_IN_SUMMARY } from '../../notice';
import { loadAeonProject } from '../load';
import { loadEffectsSceneLibrary } from '../../../formats/effects/scene';
import { loadEffectsPresetLibrary } from '../../../formats/effects/preset';
import { serializeTiles } from '../../../export/tile-dedup';
import { STRIP_COLS, WIDE_STRIP_SIZE } from '../../../formats/s4-strips';
import type { Tile } from '../../../model/s4-types';

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
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

/** Present, and no reader in the tree will accept it: not JSON, too short for a
 *  nametable, wrong length for a collision plane. One buffer breaks all seven. */
const CORRUPT = new TextEncoder().encode('{ this is not valid');

const GRID = 3; // OJZ act 1's shape

function corruptActFiles(): Map<string, Uint8Array> {
  const config = {
    name: 'Coalescing Project', engine: 's4',
    objectLibrary: 'data/objects.json', chunkLibrary: '',
    zones: [{
      id: 'ojz', name: 'OJ Zone',
      tileset: 'data/ojz_tiles.bin', palette: 'data/ojz_pal.bin',
      acts: [{
        id: 'act1', gridWidth: GRID, gridHeight: GRID,
        dataPath: 'data/ojz/act1/',
        // The strip source has to LOAD for the collision-plane sidecars to be
        // reached at all — that is the branch the two extra markUnreadable calls
        // live behind, and the branch the dispatch figure of "five files" missed.
        stripPath: 'gen/ojz/act1/', stripPrefix: 'sec',
        bgLayout: '', bgTiles: '', sceneRef: null,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
  };
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(config)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);

  for (let i = 0; i < GRID * GRID; i++) {
    const prefix = `data/ojz/act1/section_${i}`;
    files.set(`gen/ojz/act1/sec${i}_strips_source.bin`, new Uint8Array(STRIP_COLS * WIDE_STRIP_SIZE));
    for (const suffix of [
      'tiles.bin', 'collattr.bin', 'collattrb.bin',
      'objects.json', 'rings.json', 'meta.json', 'chunklinks.json',
    ]) files.set(`${prefix}.${suffix}`, CORRUPT);
  }
  return files;
}

/** The load's OWN count of files it refused, summed over every section. This is
 *  the figure the summary has to agree with, and it is read out of the project
 *  rather than assumed — an eighth sidecar would move both together. */
function unreadableTotal(project: { zones: { acts: { sections: ({ unreadable?: string[] } | null)[] }[] }[] }): number {
  let n = 0;
  for (const z of project.zones) {
    for (const a of z.acts) {
      for (const s of a.sections) n += s?.unreadable?.length ?? 0;
    }
  }
  return n;
}

// The producers write each individual reason to the console — that is where the
// items a summary does not NAME remain reachable — so the console is silenced
// here and asserted on in its own row.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warnSpy.mockRestore(); });

describe('a flood of section-file failures is ONE notice', () => {
  it('folds every failure in a 3x3 act into a single error notice', async () => {
    const r = await loadAeonProject(memFa(corruptActFiles()), '/p');
    const failures = unreadableTotal(r.project);

    // ANTI-VACUOUS, and the row that makes the rest mean anything: the fixture
    // really does produce a flood. 7 sidecars x 9 sections.
    expect(failures).toBe(7 * GRID * GRID);
    expect(failures).toBeGreaterThan(1);

    const errors = r.notices.filter((n) => n.severity === 'error');
    expect(errors).toHaveLength(1);
    // And nothing else snuck onto another channel to make up the difference.
    expect(r.notices).toHaveLength(1);
  });

  it('states the REAL count, taken from the load and not from a literal', async () => {
    const r = await loadAeonProject(memFa(corruptActFiles()), '/p');
    const failures = unreadableTotal(r.project);
    const summary = r.notices.find((n) => n.severity === 'error')!.message;

    // The count leads the sentence. Asserting the number the LOAD measured, so a
    // summary that reported a constant — or reported zero because it could not
    // tell — goes red here rather than reading as calm.
    expect(summary.startsWith(`${failures} section files`)).toBe(true);
  });

  it('names the first few and counts the rest, and every named path is real', async () => {
    const r = await loadAeonProject(memFa(corruptActFiles()), '/p');
    const failures = unreadableTotal(r.project);
    const summary = r.notices.find((n) => n.severity === 'error')!.message;

    expect(summary).toContain(`+${failures - NAMED_IN_SUMMARY} more`);
    // The named ones are paths the reader can actually go and open — not a
    // truncated prefix or an id nobody can find on disk.
    const named = summary.split('read: ')[1].split('. ')[0].split(', ').slice(0, NAMED_IN_SUMMARY);
    expect(named).toHaveLength(NAMED_IN_SUMMARY);
    for (const p of named) expect(p.startsWith('data/ojz/act1/section_')).toBe(true);
  });

  it('keeps the channel it was moved onto: coalescing is not a downgrade', async () => {
    // The inversion guard. A "fix" that quietened the wall by demoting it to a
    // warning, or to the 2.2s success dwell, would undo the whole point of
    // taking these off the success channel in the first place.
    const r = await loadAeonProject(memFa(corruptActFiles()), '/p');
    expect(r.notices.map((n) => n.severity)).toEqual(['error']);
  });

  it('leaves every unnamed failure reachable, with its own reason, in the console', async () => {
    const r = await loadAeonProject(memFa(corruptActFiles()), '/p');
    const failures = unreadableTotal(r.project);
    const lines = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const loadLines = lines.filter((l: string) => l.startsWith('[load] data/ojz/act1/'));
    // One line per failure — the summary names three, the console holds all 63.
    expect(loadLines).toHaveLength(failures);
    // And each carries WHY, which is the repair hint a count cannot give.
    expect(loadLines.every((l: string) => l.includes('could not be read: '))).toBe(true);
  });

  it('a SINGLE failure still names the file and the reason, exactly as before', async () => {
    const files = corruptActFiles();
    // Repair everything except one sidecar.
    for (const key of [...files.keys()]) {
      if (key.endsWith('.objects.json') && key !== 'data/ojz/act1/section_0.objects.json') files.delete(key);
      else if (/\.(rings|meta|chunklinks)\.json$/.test(key)) files.delete(key);
      else if (/\.collattrb?\.bin$/.test(key)) files.delete(key);
      else if (key.endsWith('.tiles.bin')) files.delete(key);
    }
    const r = await loadAeonProject(memFa(files), '/p');
    expect(unreadableTotal(r.project)).toBe(1);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0].severity).toBe('error');
    expect(r.notices[0].message).toContain('data/ojz/act1/section_0.objects.json exists but could not be read (');
    expect(r.notices[0].message).toContain('fix it by hand and reopen');
    // No summary vocabulary leaked into the single-failure message.
    expect(r.notices[0].message).not.toContain('more');
  });
});

describe('the effects libraries coalesce on the same terms', () => {
  const DATA_ROOT = 'data/';
  const BROKEN = 5;

  it('a directory of unreadable scenes is one error notice that counts them', async () => {
    const files = new Map<string, Uint8Array>();
    for (let i = 0; i < BROKEN; i++) {
      files.set(`data/editor/effects/broken${i}.json`, new TextEncoder().encode('{ nope'));
    }
    const lib = await loadEffectsSceneLibrary(memFa(files), DATA_ROOT);

    // ANTI-VACUOUS: the fixture really broke five files.
    expect(lib.unreadable).toHaveLength(BROKEN);
    expect(lib.notices).toHaveLength(1);
    expect(lib.notices[0].severity).toBe('error');
    expect(lib.notices[0].message.startsWith(`${lib.unreadable.length} files in `)).toBe(true);
    expect(lib.notices[0].message).toContain(`+${BROKEN - NAMED_IN_SUMMARY} more`);
  });

  it('a directory of unreadable presets is one error notice that counts them', async () => {
    const files = new Map<string, Uint8Array>();
    for (let i = 0; i < BROKEN; i++) {
      files.set(`data/editor/effects/presets/broken${i}.json`, new TextEncoder().encode('{ nope'));
    }
    const lib = await loadEffectsPresetLibrary(memFa(files), DATA_ROOT);

    expect(lib.unreadable).toHaveLength(BROKEN);
    expect(lib.notices).toHaveLength(1);
    expect(lib.notices[0].severity).toBe('error');
    expect(lib.notices[0].message.startsWith(`${lib.unreadable.length} files in `)).toBe(true);
  });

  it('one broken scene keeps its own message: the common case did not get worse', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('data/editor/effects/broken.json', new TextEncoder().encode('{ nope'));
    const lib = await loadEffectsSceneLibrary(memFa(files), DATA_ROOT);
    expect(lib.notices).toHaveLength(1);
    expect(lib.notices[0].message)
      .toContain('data/editor/effects/broken.json exists but could not be read as an effects scene (');
  });
});
