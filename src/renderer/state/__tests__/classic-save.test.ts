import { describe, it, expect, vi } from 'vitest';
import { saveClassicWriteResult, type GuardedWriteApi } from '../classic-save';
import type { WriteResult } from '../../../core/project/adapter';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';

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
});
