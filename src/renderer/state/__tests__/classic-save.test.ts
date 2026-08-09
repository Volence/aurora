import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveClassicWriteResult,
  saveClassicProject,
  type GuardedWriteApi,
  type DirtyLevel,
} from '../classic-save';
import type { WriteResult, ProjectHandle, ZoneActRef } from '../../../core/project/adapter';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';
import { useClassicProjectStore } from '../classicProjectStore';
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
      written: ['IGNORED — display metadata only'],
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
    const api = fakeApi(() => ({ conflicts: ['x.bin'] }));
    const out = await saveClassicWriteResult('/proj', result, api);
    expect(out).toEqual({ kind: 'conflict', conflicts: ['x.bin'] });
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
    capabilities: { levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false },
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
const oneDirty = (): DirtyLevel[] => [{ ref: REF, doc: dirtyDoc, dirty: { start: true } }];

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
    const api = fakeApi(() => ({ conflicts: ['a.bin'] }));

    const out = await saveClassicProject(api, oneDirty);
    expect(out).toEqual({ kind: 'conflict', conflicts: ['a.bin'] });
    expect(updateMtimes).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.some((t) => /changed on disk/.test(t.message))).toBe(true);
  });
});
