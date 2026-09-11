// UX SEAT A's F3 AT THE SAVE DOOR (ledger A-F3-ART-SAVE-WIDTH, packet
// docs/reviews/2026-09-11-a-f3-art-save-width.md).
//
// The writer (core/level-classic/s1-io.ts) now leaves an art file alone when its
// content did not change and something else is being written, and REPORTS it as
// `unchanged`. That rule lives or dies at this door, for two reasons:
//
//   * `domainsToClear` clears a domain only when EVERY file of it landed. GHZ's
//     `tiles` owns two files, so a save that writes one of them would never clear
//     `tiles` unless the skipped one counts. It does: its content is already the
//     document's.
//   * a write with NO files makes `saveClassicWriteResult` answer `nothing`, and
//     the orchestrator's `nothing` arm clears nothing. That contract is not this
//     parcel's to change (option (a) of docs/reviews/2026-09-09-uxpair-findings.md
//     §4), so the writer emits unchanged art itself whenever it would otherwise
//     emit nothing. The rows below drive that through the REAL writer.
//
// THE HANDLE BELOW WRAPS `writeS1Level` DIRECTLY rather than the S1 adapter,
// because the adapter needs a profile-shaped disk. Its mapping (files, errors,
// unchanged, and `updateMtimes` recording what landed) is three lines and is the
// adapter's own; that half is pinned against the real adapter and real files in
// test/main/classic-save-integration.test.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import { saveClassicProject, type GuardedWriteApi } from '../classic-save';
import { useClassicLevelStore, classicEditTiles, zoneArtDocIdForCurrentZone } from '../classicLevelStore';
import { useClassicProjectStore } from '../classicProjectStore';
import { useToastStore } from '../toastStore';
import { documentHistoryHub } from '../history-hub';
import { openReady, REF } from './helpers/classic-fixture';
import type { FileAccess, ProjectHandle, WriteResult } from '../../../core/project/adapter';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';
import type { LevelAct } from '../../../core/project/profiles/s1';
import { readS1Level, writeS1Level, type ResolvedLevelPaths, type S1LevelState } from '../../../core/level-classic/s1-io';
import { nemesisCompress } from '../../../core/compress/nemesis';
import { enigmaCompress } from '../../../core/formats/classic/enigma';
import { kosinskiCompress } from '../../../core/formats/kosinski';

// ---------------------------------------------------------------------------
// A two-file act shaped like GHZ, read through the real reader.
// ---------------------------------------------------------------------------

const NEM_A = 'artnem/split-a.nem';
const NEM_B = 'artnem/split-b.nem';

function beBytes(words: number[]): Uint8Array {
  const out = new Uint8Array(words.length * 2);
  words.forEach((w, i) => { out[i * 2] = (w >> 8) & 0xff; out[i * 2 + 1] = w & 0xff; });
  return out;
}

function memFs(files: Record<string, Uint8Array>): FileAccess {
  const map = new Map(Object.entries(files));
  return {
    async exists(rel) { return map.has(rel); },
    async read(rel) {
      const b = map.get(rel);
      if (!b) throw new Error(`no such file: ${rel}`);
      return b;
    },
    async list() { return []; },
  };
}

async function readTwoFileAct(): Promise<S1LevelState> {
  const files: Record<string, Uint8Array> = {
    [NEM_A]: nemesisCompress(new Uint8Array(4 * 32).map((_, i) => (i * 7) & 0x0f)),
    [NEM_B]: nemesisCompress(new Uint8Array(4 * 32).map((_, i) => (i * 11) & 0x0f)),
    // Block words point INSIDE the 8-tile pool: the store's commands run
    // `validateLevelDoc`, which refuses a block naming a tile that does not exist.
    'map16/syn.eni': enigmaCompress(beBytes([0, 0x800 | 1, 0x1000 | 2, 0x2000 | 3, 4, 5, 6, 7])),
    'map256/syn.kos': kosinskiCompress(beBytes(new Array(256).fill(0).map((_, i) => (i % 3) | ((i % 4) << 13)))),
    'levels/syn_fg.bin': new Uint8Array([1, 0, 0, 1]),
    'levels/syn_bg.bin': new Uint8Array([0, 0, 0]),
    'objpos/syn.bin': new Uint8Array([0, 0x10, 0x02, 0x20, 0x05, 0x03, 0xff, 0xff, 0, 0, 0, 0]),
    'startpos/syn.bin': new Uint8Array([0x01, 0x00, 0x02, 0x00]),
    'collide/syn.bin': new Uint8Array([0, 1]),
    'palette/Sonic.bin': beBytes(new Array(16).fill(0).map((_, i) => 0x100 + i)),
    'palette/Zone.bin': beBytes(new Array(48).fill(0).map((_, i) => 0x200 + i)),
    'collide/normal.bin': new Uint8Array(4096).map((_, i) => i & 0xff),
    'collide/angle.bin': new Uint8Array(256).map((_, i) => i & 0xff),
  };
  const act: LevelAct = {
    act: 1, name: 'Two-file synthetic',
    tiles: [NEM_A, NEM_B],
    blocks: { path: 'map16/syn.eni' },
    chunks: { path: 'map256/syn.kos' },
    colind: { path: 'collide/syn.bin' },
    fgLayout: { path: 'levels/syn_fg.bin' },
    bgLayout: { path: 'levels/syn_bg.bin' },
    objpos: { path: 'objpos/syn.bin' },
    startpos: { path: 'startpos/syn.bin' },
    palette: [
      { file: 'palette/Sonic.bin', srcOffset: 0, destOffset: 0, length: 16 },
      { file: 'palette/Zone.bin', srcOffset: 0, destOffset: 16, length: 48 },
    ],
    animatedArt: [],
  };
  const paths: ResolvedLevelPaths = {
    tiles: [NEM_A, NEM_B],
    blocks: 'map16/syn.eni', chunks: 'map256/syn.kos', colind: 'collide/syn.bin',
    fg: 'levels/syn_fg.bin', bg: 'levels/syn_bg.bin',
    objpos: 'objpos/syn.bin', startpos: 'startpos/syn.bin',
    palette: ['palette/Sonic.bin', 'palette/Zone.bin'],
    animatedArt: [],
    collisionNormal: 'collide/normal.bin', collisionAngleMap: 'collide/angle.bin',
  };
  return readS1Level(act, paths, memFs(files));
}

// ---------------------------------------------------------------------------
// The session: both classic stores open over that doc, a handle whose write is
// the real writer, and a guarded channel that lands whatever it is given.
// ---------------------------------------------------------------------------

interface Session {
  state: S1LevelState;
  /** Every WriteResult the handle produced, in order. */
  writes: WriteResult[];
}

async function openSession(): Promise<Session> {
  const state = await readTwoFileAct();
  const writes: WriteResult[] = [];
  const baseTileCount = state.read.pristineTileFiles.reduce((n, f) => n + f.tileCount, 0);
  const handle: ProjectHandle = {
    type: 's1',
    capabilities: { levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false, facets: ['layout', 'art', 'objects'] },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [REF],
      read: async () => state.doc,
      write: async (_ref, doc, dirty) => {
        const r = writeS1Level({ doc, read: state.read }, dirty);
        const out: WriteResult = {
          written: r.files.map((f) => f.path), skipped: [], errors: r.errors,
          files: r.files, fileMtimes: {}, unchanged: r.unchanged,
        };
        writes.push(out);
        return out;
      },
      updateMtimes: (_ref, m) => { for (const p of Object.keys(m)) state.read.writtenSinceRead.add(p); },
      editableTileRange: () => ({ baseTileCount, animRanges: [] }),
    },
  };
  openReady(state.doc);
  useClassicProjectStore.setState({ status: 'open', dir: '/p', handle } as never);
  useClassicLevelStore.setState({ domainGen: {} });
  return { state, writes };
}

function landingApi(): GuardedWriteApi & { calls: GuardedWriteFile[][] } {
  const calls: GuardedWriteFile[][] = [];
  return {
    calls,
    async writeGuarded(_dir, files): Promise<GuardedWriteResult> {
      calls.push(files);
      return { written: files.map((f) => f.relPath), newMtimes: Object.fromEntries(files.map((f, i) => [f.relPath, 1000 + i])) };
    },
  };
}

/** Pool tile `t`'s 32 bytes with one nibble flipped, and the bytes it had. */
function paintedTile(doc: { tiles: Uint8Array }, t: number): { painted: Uint8Array; original: Uint8Array } {
  const original = doc.tiles.slice(t * 32, t * 32 + 32);
  const painted = original.slice();
  painted[0] = (painted[0] ^ 0x0f) & 0xff;
  return { painted, original };
}

const artStack = () => documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);
const dirty = () => useClassicLevelStore.getState().dirty;

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  documentHistoryHub.clearAll();
  useToastStore.setState({ toasts: [] });
});

// ---------------------------------------------------------------------------
// §1 the skipped file counts as landed, and only it does
// ---------------------------------------------------------------------------

describe('§1 a GHZ-shaped tile save writes one art file and still clears `tiles`', () => {
  it('a tile painted in A sends A alone to disk, and the save clears `tiles`', async () => {
    const { state, writes } = await openSession();
    const a = state.read.pristineTileFiles[0];
    expect(classicEditTiles([{ tileIndex: a.tileStart, data: paintedTile(state.doc, a.tileStart).painted }])).toEqual({ ok: true });
    expect(dirty().tiles).toBe(true);

    const api = landingApi();
    expect(await saveClassicProject(api)).toEqual({ kind: 'saved', count: 1 });

    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].map((f) => f.relPath)).toEqual([NEM_A]);
    expect(writes[0].unchanged).toEqual([NEM_B]);
    // THE ROW'S POINT: B did not land and `tiles` cleared anyway, because B was
    // reported unchanged. Without that the dot would stay up after every save.
    expect(dirty().tiles).toBeUndefined();
  });

  it('CONTROL: when A FAILS to land, `tiles` stays dirty even though B is unchanged', async () => {
    const { state } = await openSession();
    const a = state.read.pristineTileFiles[0];
    classicEditTiles([{ tileIndex: a.tileStart, data: paintedTile(state.doc, a.tileStart).painted }]);

    const failing: GuardedWriteApi = {
      async writeGuarded(_dir, files) {
        return { written: [], newMtimes: {}, failed: { path: files[0].relPath, message: 'EISDIR' }, unwritten: [] };
      },
    };
    const out = await saveClassicProject(failing);
    expect(out.kind).toBe('partial');
    // "Unchanged" is a statement about B, never about the domain: A's edit is not
    // on disk, so the dot must stay.
    expect(dirty().tiles).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §2 THE ZERO-DIFF SAVE CONTRACT: behaves exactly as it did before 2026-09-11
// ---------------------------------------------------------------------------

describe('§2 the zero-diff save is unchanged by the unchanged-art rule', () => {
  /**
   * The literal gesture the brief names: paint, undo, Ctrl+S. The classic art
   * undo restores the dirty flags it snapshotted, so `tiles` is clean again and
   * the save never reaches the writer at all. This held before the rule and must
   * hold after it; the packet records this row run against the pre-change code.
   */
  it('paint, undo, save: the undo cleans `tiles`, the writer is never called, nothing is written', async () => {
    const { state, writes } = await openSession();
    const t = state.read.pristineTileFiles[1].tileStart;
    const { painted, original } = paintedTile(state.doc, t);
    classicEditTiles([{ tileIndex: t, data: painted }]);
    expect(dirty().tiles).toBe(true);
    artStack().undo();
    expect(useClassicLevelStore.getState().doc!.tiles.slice(t * 32, t * 32 + 32)).toEqual(original);

    const api = landingApi();
    expect(await saveClassicProject(api)).toEqual({ kind: 'nothing' });
    expect(writes).toHaveLength(0);
    expect(api.calls).toHaveLength(0);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  /**
   * The zero-diff save that DOES reach the writer: a tile painted and then
   * painted back by hand is two recorded edits, so `tiles` stays dirty with not
   * one byte differing. Nothing else is dirty, so the writer emits BOTH art files
   * exactly as it always did, the save lands them and clears `tiles`. If the
   * writer skipped them here the write would carry no files, the saver would
   * answer `nothing`, and the dot would stay up with nothing said.
   */
  it('paint, paint back, save: `tiles` is dirty with no diff, and both art files are written as before', async () => {
    const { state, writes } = await openSession();
    const t = state.read.pristineTileFiles[0].tileStart;
    const { painted, original } = paintedTile(state.doc, t);
    classicEditTiles([{ tileIndex: t, data: painted }]);
    classicEditTiles([{ tileIndex: t, data: original }]);
    expect(dirty().tiles).toBe(true);

    const api = landingApi();
    expect(await saveClassicProject(api)).toEqual({ kind: 'saved', count: 1 });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].map((f) => f.relPath).sort()).toEqual([NEM_A, NEM_B].sort());
    expect(writes[0].unchanged).toEqual([]);
    expect(dirty().tiles).toBeUndefined();
  });
});
