import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveClassicWriteResult,
  saveClassicProject,
  collectDirtyLevels,
  domainFilePaths,
  domainsToClear,
  type GuardedWriteApi,
  type DirtyLevel,
} from '../classic-save';
import type { WriteResult, ProjectHandle, ZoneActRef, LevelDoc } from '../../../core/project/adapter';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';
import { useClassicProjectStore } from '../classicProjectStore';
import { useClassicLevelStore } from '../classicLevelStore';
import { useToastStore } from '../toastStore';

// ---------------------------------------------------------------------------
// The pure save pipe: consumes WriteResult.files (NOT .written) and drives the
// guarded-write api. Store-free — the api is injected.
// ---------------------------------------------------------------------------

function fakeApi(impl: (dir: string, files: GuardedWriteFile[]) => GuardedWriteResult): GuardedWriteApi & {
  calls: { dir: string; files: GuardedWriteFile[] }[];
} {
  const calls: { dir: string; files: GuardedWriteFile[] }[] = [];
  return {
    calls,
    async writeGuarded(dir, files) {
      calls.push({ dir, files });
      return impl(dir, files);
    },
  };
}

const okResult = (written: string[], newMtimes: Record<string, number>): GuardedWriteResult => ({ written, newMtimes });

describe('saveClassicWriteResult', () => {
  it('sends files from WriteResult.files with expected mtimes, returns saved', async () => {
    const result: WriteResult = {
      written: ['IGNORED: display metadata only'],
      skipped: [],
      errors: [],
      files: [
        { path: 'artnem/a.nem', bytes: new Uint8Array([1, 2]) },
        { path: 'map16/b.eni', bytes: new Uint8Array([3]) },
      ],
      fileMtimes: { 'artnem/a.nem': 111, /* b.eni intentionally absent → null */ },
    };
    const api = fakeApi(() => okResult(['artnem/a.nem', 'map16/b.eni'], { 'artnem/a.nem': 900, 'map16/b.eni': 901 }));

    const out = await saveClassicWriteResult('/proj', result, api);
    expect(out).toEqual({ kind: 'saved', written: ['artnem/a.nem', 'map16/b.eni'], newMtimes: { 'artnem/a.nem': 900, 'map16/b.eni': 901 } });

    // Payload derived from files (bytes) + fileMtimes (expected); missing → null.
    expect(api.calls[0].dir).toBe('/proj');
    expect(api.calls[0].files).toEqual([
      { relPath: 'artnem/a.nem', bytes: new Uint8Array([1, 2]), expectedMtimeMs: 111 },
      { relPath: 'map16/b.eni', bytes: new Uint8Array([3]), expectedMtimeMs: null },
    ]);
  });

  it('returns conflict and reports the list when main reports a conflict', async () => {
    const result: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [{ path: 'x.bin', bytes: new Uint8Array([0]) }],
      fileMtimes: { 'x.bin': 5 },
    };
    const api = fakeApi(() => ({ conflicts: [{ relPath: 'x.bin', cause: 'deleted' as const, reason: null }] }));
    const out = await saveClassicWriteResult('/proj', result, api);
    // The CAUSE survives the hop from main into the renderer's own variant. It
    // used to be dropped here (`conflicts: string[]`), which is why the toast
    // below could only ever say one thing.
    expect(out).toEqual({
      kind: 'conflict',
      conflicts: [{ relPath: 'x.bin', cause: 'deleted', reason: null }],
    });
  });

  it('returns nothing (and never calls the api) when there are no files', async () => {
    const result: WriteResult = { written: [], skipped: [], errors: [], files: [] };
    const api = fakeApi(() => okResult([], {}));
    const out = await saveClassicWriteResult('/proj', result, api);
    expect(out).toEqual({ kind: 'nothing' });
    expect(api.calls).toHaveLength(0);
  });

  it('returns error and writes nothing when the WriteResult carries self-check errors', async () => {
    const result: WriteResult = {
      written: [], skipped: [],
      errors: [{ path: 'artnem/a.nem', message: 'self-check failed' }],
      files: [{ path: 'map16/b.eni', bytes: new Uint8Array([1]) }],
      fileMtimes: {},
    };
    const api = fakeApi(() => okResult(['map16/b.eni'], {}));
    const out = await saveClassicWriteResult('/proj', result, api);
    expect(out).toEqual({ kind: 'error', errors: [{ path: 'artnem/a.nem', message: 'self-check failed' }] });
    expect(api.calls).toHaveLength(0);
  });

  it('missing fileMtimes map entirely → all expected null', async () => {
    const result: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [{ path: 'x.bin', bytes: new Uint8Array([0]) }],
      // no fileMtimes
    };
    const api = fakeApi(() => okResult(['x.bin'], { 'x.bin': 1 }));
    await saveClassicWriteResult('/proj', result, api);
    expect(api.calls[0].files[0].expectedMtimeMs).toBeNull();
  });

  it('partial batch from main → { partial } carrying failed/unwritten', async () => {
    const result: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [
        { path: 'a.bin', bytes: new Uint8Array([1]) },
        { path: 'b.bin', bytes: new Uint8Array([2]) },
      ],
      fileMtimes: {},
    };
    const api = fakeApi(() => ({
      written: ['a.bin'],
      newMtimes: { 'a.bin': 700 },
      failed: { path: 'b.bin', message: 'EISDIR' },
      unwritten: [],
    }));
    const out = await saveClassicWriteResult('/proj', result, api);
    expect(out).toEqual({
      kind: 'partial',
      written: ['a.bin'],
      newMtimes: { 'a.bin': 700 },
      failed: { path: 'b.bin', message: 'EISDIR' },
      unwritten: [],
    });
  });

  it('a rejecting channel → { channel-error } (never an unhandled rejection)', async () => {
    const result: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [{ path: 'x.bin', bytes: new Uint8Array([0]) }],
      fileMtimes: {},
    };
    const api: GuardedWriteApi = {
      async writeGuarded() {
        throw new Error('ipc gone');
      },
    };
    const out = await saveClassicWriteResult('/proj', result, api);
    expect(out).toEqual({ kind: 'channel-error', message: 'ipc gone' });
  });
});

// ---------------------------------------------------------------------------
// The store-driven orchestrator: per-act loop, mtime refresh on success, and
// the failure notices. `collect` is injected so we can exercise it before the
// editing store exists.
// ---------------------------------------------------------------------------

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

function openStoreWithHandle(handle: ProjectHandle): void {
  useClassicProjectStore.setState({ status: 'open', dir: '/proj', handle } as never);
}

function handleWith(
  write: (ref: ZoneActRef) => Promise<WriteResult>,
  updateMtimes: (ref: ZoneActRef, m: Record<string, number>) => void,
): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy',
      sprites: true,
      objects: 'objpos',
      build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [REF],
      read: async () => { throw new Error('not used'); },
      write,
      updateMtimes,
    },
  };
}

const dirtyDoc = { game: 's1' } as unknown as DirtyLevel['doc'];
// `gen` was ADDED here by the SAVE-GEN-OPTIONAL fix, and this line is that
// finding's whole evidence: an injected collector is a second producer of
// DirtyLevel that costs nobody a new call site, and this one had existed for as
// long as the guard had, silently switching it off for every case that used it.
// `{}` is honest for a store with no recorded edits, and it is the safe value
// besides: it compares unequal to any counter that has moved.
const oneDirty = (): DirtyLevel[] => [{ ref: REF, doc: dirtyDoc, dirty: { start: true }, gen: {} }];

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useToastStore.setState({ toasts: [] });
});

describe('saveClassicProject orchestrator', () => {
  it('returns { nothing } when no classic project is open', async () => {
    const api = fakeApi(() => okResult([], {}));
    expect(await saveClassicProject(api, oneDirty)).toEqual({ kind: 'nothing' });
  });

  it('on success: refreshes captured mtimes via updateMtimes and toasts saved', async () => {
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [{ path: 'startpos/ghz1.bin', bytes: new Uint8Array([1]) }],
      fileMtimes: { 'startpos/ghz1.bin': 10 },
    };
    const updateMtimes = vi.fn();
    openStoreWithHandle(handleWith(async () => writeResult, updateMtimes));
    const api = fakeApi(() => okResult(['startpos/ghz1.bin'], { 'startpos/ghz1.bin': 999 }));

    const out = await saveClassicProject(api, oneDirty);
    expect(out).toEqual({ kind: 'saved', count: 1 });
    // updateMtimes-on-success contract: called with the FRESH on-disk mtimes.
    expect(updateMtimes).toHaveBeenCalledWith(REF, { 'startpos/ghz1.bin': 999 });
    expect(useToastStore.getState().toasts.some((t) => t.type === 'success' && /Saved 1/.test(t.message))).toBe(true);
  });

  // d-38, "a save says so briefly on screen": the success line NAMES what
  // landed. UX seat A's F3 (docs/reviews/2026-09-07-lens-ux/uxa-walk.md) was 14
  // pixels rewriting two .nem files unannounced, and the paths were in hand the
  // whole time -- they are the guarded channel's own `written` report.
  //
  // THIS ROW IS THE WIRING, not the sentence. `savedFilesSentence` is exercised
  // directly in shell/__tests__/save-surface-vocabulary.test.ts; what only this
  // fixture can reach is whether the loop actually carries `outcome.written` out
  // to it. The path asserted is the one the fake api reports as LANDED, not the
  // one the doc offered, because those are different sets on a partial write.
  it('and the success line names the files that landed', async () => {
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [
        { path: 'startpos/ghz1.bin', bytes: new Uint8Array([1]) },
        { path: 'artnem/8x8 - GHZ1.nem', bytes: new Uint8Array([2]) },
      ],
      fileMtimes: {},
    };
    openStoreWithHandle(handleWith(async () => writeResult, vi.fn()));
    const landed = ['startpos/ghz1.bin', 'artnem/8x8 - GHZ1.nem'];
    const api = fakeApi(() => okResult(landed, {}));

    await saveClassicProject(api, oneDirty);

    const toast = useToastStore.getState().toasts.find((t) => t.type === 'success')!;
    for (const p of landed) expect(toast.message, p).toContain(p);
    expect(toast.message).toContain(`${landed.length} files`);
  });

  it('on partial batch: refreshes the landed mtimes, toasts the failed path, returns partial', async () => {
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [
        { path: 'a.bin', bytes: new Uint8Array([1]) },
        { path: 'b.bin', bytes: new Uint8Array([2]) },
      ],
      fileMtimes: {},
    };
    const updateMtimes = vi.fn();
    openStoreWithHandle(handleWith(async () => writeResult, updateMtimes));
    const api = fakeApi(() => ({
      written: ['a.bin'],
      newMtimes: { 'a.bin': 42 },
      failed: { path: 'b.bin', message: 'EISDIR' },
      unwritten: [],
    }));

    const out = await saveClassicProject(api, oneDirty);
    expect(out).toEqual({ kind: 'partial', failed: { path: 'b.bin', message: 'EISDIR' }, unwritten: [] });
    // Landed file's baseline still refreshed so a retry doesn't false-conflict on it.
    expect(updateMtimes).toHaveBeenCalledWith(REF, { 'a.bin': 42 });
    const toast = useToastStore.getState().toasts.find((t) => t.type === 'error');
    expect(toast?.message).toMatch(/b\.bin/);
  });

  it('on conflict: posts the conflict notice and does not refresh mtimes', async () => {
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [{ path: 'a.bin', bytes: new Uint8Array([1]) }],
      fileMtimes: { 'a.bin': 5 },
    };
    const updateMtimes = vi.fn();
    openStoreWithHandle(handleWith(async () => writeResult, updateMtimes));
    const api = fakeApi(() => ({ conflicts: [{ relPath: 'a.bin', cause: 'deleted' as const, reason: null }] }));

    const out = await saveClassicProject(api, oneDirty);
    expect(out).toEqual({
      kind: 'conflict',
      conflicts: [{ relPath: 'a.bin', cause: 'deleted', reason: null }],
    });
    expect(updateMtimes).not.toHaveBeenCalled();

    // ⚠ THIS ROW USED TO ASSERT `/changed on disk/` ON A DELETED FILE AND PASS,
    // which is ONE-MESSAGE-FOUR-CAUSES in one line: the toast said "N file(s)
    // changed on disk since open ... Reload project to pick up external changes"
    // whatever the guard had found. A deleted file did not change, and reloading
    // does not bring it back. Keying on `/changed on disk/` here is worse than
    // vacuous: it PINNED the wrong sentence.
    const msg = useToastStore.getState().toasts.map((t) => t.message).join('\n');
    expect(msg).toContain('a.bin');
    expect(msg).toMatch(/was deleted on disk/);
    expect(msg).not.toMatch(/changed on disk/);
    // And no instruction to reload, because reloading is not the fix for this one.
    expect(msg).not.toMatch(/Reload the project/);
  });

  it("CONTROL: a genuinely CHANGED file still gets the reload advice, so the row above is not just 'advice deleted'", async () => {
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [{ path: 'a.bin', bytes: new Uint8Array([1]) }],
      fileMtimes: { 'a.bin': 5 },
    };
    openStoreWithHandle(handleWith(async () => writeResult, vi.fn()));
    const api = fakeApi(() => ({ conflicts: [{ relPath: 'a.bin', cause: 'changed' as const, reason: null }] }));

    await saveClassicProject(api, oneDirty);
    const msg = useToastStore.getState().toasts.map((t) => t.message).join('\n');
    expect(msg).toMatch(/changed on disk/);
    expect(msg).toContain('Reload the project to pick up the external changes.');
  });
});

// ---------------------------------------------------------------------------
// collectDirtyLevels wiring + domain→file mapping + partial-save retention.
// ---------------------------------------------------------------------------

function docWithRefs(): LevelDoc {
  return {
    sourceRefs: {
      'tiles.0': 'artnem/t.nem',
      blocks: 'map16/b.eni',
      'palette.0': 'palette/p0.bin',
      'palette.1': 'palette/p1.bin',
      start: 'startpos/s.bin',
    },
  } as unknown as LevelDoc;
}

describe('collectDirtyLevels', () => {
  beforeEach(() => {
    useClassicLevelStore.getState().reset();
  });

  it('returns [] when no level is open / no domain is dirty', () => {
    expect(collectDirtyLevels({} as ProjectHandle)).toEqual([]);
    useClassicLevelStore.setState({ ref: REF, doc: docWithRefs(), status: 'ready', dirty: {} });
    expect(collectDirtyLevels({} as ProjectHandle)).toEqual([]);
  });

  it('returns the open act with its dirty domains + doc', () => {
    const doc = docWithRefs();
    useClassicLevelStore.setState({ ref: REF, doc, status: 'ready', dirty: { blocks: true, start: true } });
    const out = collectDirtyLevels({} as ProjectHandle);
    expect(out).toHaveLength(1);
    expect(out[0].ref).toBe(REF);
    expect(out[0].doc).toBe(doc);
    expect(out[0].dirty).toEqual({ blocks: true, start: true });
  });
});

describe('domainFilePaths + domainsToClear', () => {
  it('maps multi-file domains (tiles, palette) and single-file domains from sourceRefs', () => {
    const paths = domainFilePaths(docWithRefs());
    expect(paths.tiles).toEqual(['artnem/t.nem']);
    expect(paths.blocks).toEqual(['map16/b.eni']);
    expect(paths.palette).toEqual(['palette/p0.bin', 'palette/p1.bin']);
    expect(paths.start).toEqual(['startpos/s.bin']);
    expect(paths.chunks).toEqual([]); // not present in sourceRefs
  });

  it('clears a domain only when ALL its files landed (partial-save retention)', () => {
    const doc = docWithRefs();
    const dirty = { blocks: true, palette: true, start: true };
    // palette has two files; only one landed → palette stays dirty.
    const cleared = domainsToClear(doc, dirty, ['map16/b.eni', 'palette/p0.bin']);
    expect(cleared.sort()).toEqual(['blocks']);
  });

  it('clears every fully-landed domain', () => {
    const doc = docWithRefs();
    const dirty = { blocks: true, palette: true, start: true };
    const cleared = domainsToClear(doc, dirty, ['map16/b.eni', 'palette/p0.bin', 'palette/p1.bin', 'startpos/s.bin']);
    expect(cleared.sort()).toEqual(['blocks', 'palette', 'start']);
  });
});

describe('saveClassicProject clears dirty flags on success', () => {
  it('clears the fully-written domains of the open act', async () => {
    const doc = docWithRefs();
    useClassicLevelStore.setState({ ref: REF, doc, status: 'ready', dirty: { blocks: true, start: true } });
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [
        { path: 'map16/b.eni', bytes: new Uint8Array([1]) },
        { path: 'startpos/s.bin', bytes: new Uint8Array([2]) },
      ],
      fileMtimes: {},
    };
    openStoreWithHandle(handleWith(async () => writeResult, vi.fn()));
    const api = fakeApi(() => okResult(['map16/b.eni', 'startpos/s.bin'], {}));

    // Use the real store-backed collector for this end-to-end clear check.
    const out = await saveClassicProject(api);
    expect(out).toEqual({ kind: 'saved', count: 1 });
    expect(useClassicLevelStore.getState().dirty).toEqual({});
  });

  /**
   * R4. The save snapshots the doc, awaits real IPC, and then clears what it
   * wrote. An edit committed while that write was in flight is not in the bytes
   * that landed — so clearing its flag loses it in silence: no tab dot, no
   * close prompt, and the next Ctrl+S answers "nothing to save".
   *
   * The sprite path has re-read after its await since it was written; this is
   * that discipline at the classic door, via the per-domain edit counters.
   */
  it('leaves a domain dirty when an edit lands DURING the write', async () => {
    const doc = docWithRefs();
    useClassicLevelStore.setState({
      ref: REF, doc, status: 'ready', dirty: { blocks: true, start: true }, domainGen: {},
    });
    const writeResult: WriteResult = {
      written: [], skipped: [], errors: [],
      files: [
        { path: 'map16/b.eni', bytes: new Uint8Array([1]) },
        { path: 'startpos/s.bin', bytes: new Uint8Array([2]) },
      ],
      fileMtimes: {},
    };
    openStoreWithHandle(handleWith(async () => writeResult, vi.fn()));
    // The artist paints a block while the guarded write is in flight.
    const api = fakeApi(() => {
      const s = useClassicLevelStore.getState();
      useClassicLevelStore.setState({
        dirty: { ...s.dirty, blocks: true },
        domainGen: { ...s.domainGen, blocks: (s.domainGen.blocks ?? 0) + 1 },
      });
      return okResult(['map16/b.eni', 'startpos/s.bin'], {});
    });

    const out = await saveClassicProject(api);
    expect(out).toEqual({ kind: 'saved', count: 1 });
    // `start` landed and was not touched again; `blocks` is the newer edit.
    expect(useClassicLevelStore.getState().dirty).toEqual({ blocks: true });
  });
});

/**
 * SAVE-GEN-OPTIONAL. The guard the test above proves was reachable only when the
 * caller CHOSE to arm it: `markDomainsClean`'s third parameter was optional and
 * read `if (atGen && ...)`, so a `collect` that returned no counters got the
 * pre-guard behaviour in full, and marked the artist's in-flight edit saved.
 *
 * That is now a compile error at every producer the compiler can see, and this
 * file's own `oneDirty` was the one it found. These two cases are about the arm
 * the compiler cannot see -- an untyped JS caller, standing in for here as a
 * cast -- and about the control that keeps the first case honest.
 *
 * `mid` below is the SAME mid-save edit the R4 test above stages, so the two
 * differ in exactly one thing: whether the collector supplied `gen`.
 */
describe('saveClassicProject: the mid-save guard cannot be switched off', () => {
  const bothFiles: WriteResult = {
    written: [], skipped: [], errors: [],
    files: [
      { path: 'map16/b.eni', bytes: new Uint8Array([1]) },
      { path: 'startpos/s.bin', bytes: new Uint8Array([2]) },
    ],
    fileMtimes: {},
  };

  /** An api whose in-flight window paints a block, as the artist would. */
  const paintsDuringWrite = () => fakeApi(() => {
    const s = useClassicLevelStore.getState();
    useClassicLevelStore.setState({
      dirty: { ...s.dirty, blocks: true },
      domainGen: { ...s.domainGen, blocks: (s.domainGen.blocks ?? 0) + 1 },
    });
    return okResult(['map16/b.eni', 'startpos/s.bin'], {});
  });

  function readyWithBothDirty(): LevelDoc {
    const doc = docWithRefs();
    useClassicLevelStore.setState({
      ref: REF, doc, status: 'ready', dirty: { blocks: true, start: true }, domainGen: {},
    });
    openStoreWithHandle(handleWith(async () => bothFiles, vi.fn()));
    return doc;
  }

  beforeEach(() => {
    useClassicLevelStore.getState().reset();
  });

  it('clears NOTHING for a collector that supplies no counters, and reports it', async () => {
    const doc = readyWithBothDirty();
    // The shape an untyped producer has: no `gen`. Before the fix this cleared
    // both domains, `blocks` included -- the edit made during the write, gone
    // with no dot and no prompt.
    const noCounters = () => [
      { ref: REF, doc, dirty: { blocks: true, start: true } } as unknown as DirtyLevel,
    ];

    const out = await saveClassicProject(paintsDuringWrite(), noCounters);
    expect(out).toEqual({ kind: 'saved', count: 1 });
    expect(useClassicLevelStore.getState().dirty).toEqual({ blocks: true, start: true });

    // And the author is TOLD, rather than the flags quietly standing: the same
    // withheld-domains toast the counter-carrying path uses. Matched on the
    // wording only this notice uses, and on both domain names being in it.
    const notices = useToastStore.getState().toasts.map((t) => t.message);
    const withheld = notices.filter((m) => /edits made during the save are still unsaved/.test(m));
    expect(withheld).toHaveLength(1);
    expect(withheld[0]).toMatch(/blocks/);
    expect(withheld[0]).toMatch(/start/);
  });

  it('CONTROL: the same collector WITH counters clears the domain nothing touched', async () => {
    const doc = readyWithBothDirty();
    const withCounters = (): DirtyLevel[] => [
      { ref: REF, doc, dirty: { blocks: true, start: true }, gen: {} },
    ];

    const out = await saveClassicProject(paintsDuringWrite(), withCounters);
    expect(out).toEqual({ kind: 'saved', count: 1 });
    // `start`'s counter never moved, so it clears; only the painted domain stays.
    expect(useClassicLevelStore.getState().dirty).toEqual({ blocks: true });
  });
});
