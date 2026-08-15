// src/renderer/state/__tests__/canvas-file.test.ts
//
// R12 runs through most of this file: a load that could not read or parse its
// sidecar must say so (`sidecarRejected`, `warnings`) without refusing to open
// the picture, and a save that knows the sidecar was unreadable must not
// overwrite it with a freshly-guessed one — nor may it silently pretend that
// omission never happened (`sidecarWritten`), nor destroy the sidecar's own
// mtime baseline in the process. See canvas-file.ts's header and
// canvas-file-format.ts's for the full data-loss chain this closes.
//
// The `../../s1.asm`-shaped tests below pin the ENFORCEMENT of
// `canvasNameIsSafe`, not just the predicate — see canvas-file.ts's header on
// why the read path in particular has no other guard.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CANVAS_DIR, canvasPngPath, canvasSidecarPath, canvasNameIsSafe,
  listCanvasNames, loadCanvasFile, saveCanvasFile, type GuardedWriteApi,
} from '../canvas-file';
import { blankCanvasDoc, canvasIndex } from '../../../core/art/canvas-doc';
import { encodeCanvasFiles } from '../../../core/art/canvas-file-format';
import type { GuardedWriteResult } from '../../../shared/ipc-types';

const DIR = '/home/user/s1disasm';

type Written = { relPath: string; bytes: Uint8Array; expectedMtimeMs: number | null };

// Typed against the real preload surface (ElectronAPI), not inferred: a fake
// whose shape is only checked against itself stays green through a real
// signature change (a renamed `conflicts` field, a new required
// GuardedWriteResult variant). Typing it here is what makes that drift a
// compile error instead of a silently-stale test.
function fakeApi(files: Map<string, Uint8Array>) {
  const written: Written[] = [];
  const api = {
    listDir: vi.fn(async (_dir: string, rel: string) =>
      [...files.keys()].filter((k) => k.startsWith(`${rel}/`)).map((k) => k.slice(rel.length + 1))),
    readBinaryFile: vi.fn(async (_dir: string, rel: string) => {
      const f = files.get(rel);
      if (!f) throw new Error(`ENOENT: ${rel}`);
      return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    }),
    fileMtime: vi.fn(async (_dir: string, rel: string) => (files.has(rel) ? 1000 : null)),
    writeGuarded: vi.fn(async (_dir: string, batch: Written[]): Promise<GuardedWriteResult> => {
      written.push(...batch);
      for (const f of batch) files.set(f.relPath, f.bytes);
      return { written: batch.map((f) => f.relPath), newMtimes: Object.fromEntries(batch.map((f) => [f.relPath, 2000])) };
    }),
  };
  (globalThis as { window?: unknown }).window = { api };
  return { api, written };
}

/** A `GuardedWriteApi` fake typed against the real interface, for tests that
 *  drive `saveCanvasFile`'s injected write path directly rather than through
 *  `window.api` (the conflict/partial/channel-error cases don't need a full
 *  fake filesystem). */
function fakeWriteApi(impl: GuardedWriteApi['writeGuarded']): GuardedWriteApi {
  return { writeGuarded: vi.fn(impl) };
}

beforeEach(() => { delete (globalThis as { window?: unknown }).window; });

describe('canvas file paths', () => {
  it('puts both files under the project sidecar dir', () => {
    expect(CANVAS_DIR).toBe('.aurora/canvas');
    expect(canvasPngPath('sky')).toBe('.aurora/canvas/sky.png');
    expect(canvasSidecarPath('sky')).toBe('.aurora/canvas/sky.canvas.json');
  });

  it('rejects a name that would escape the sidecar dir', () => {
    // A canvas name reaches a path. `../../s1.asm` must never become a write
    // target, and the check lives here rather than at the write.
    expect(canvasNameIsSafe('sky-tiles_2')).toBe(true);
    expect(canvasNameIsSafe('../escape')).toBe(false);
    expect(canvasNameIsSafe('a/b')).toBe(false);
    expect(canvasNameIsSafe('')).toBe(false);
    expect(canvasNameIsSafe('has space')).toBe(false);
  });
});

describe('the name guard is actually ENFORCED at both call sites', () => {
  // The predicate above being correct proves nothing on its own — it has to
  // be consulted. These drive the real functions with an escaping name and
  // check that NO IO was attempted, not just that an error came back.
  it('loadCanvasFile refuses an escaping name before touching disk', async () => {
    const { api } = fakeApi(new Map());
    await expect(loadCanvasFile(DIR, '../../s1.asm')).rejects.toThrow(/not a valid canvas name/);
    expect(api.readBinaryFile).not.toHaveBeenCalled();
  });

  it('saveCanvasFile refuses an escaping name before writing', async () => {
    const { api } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    const res = await saveCanvasFile(DIR, '../../s1.asm', doc, { pngMtimeMs: null, sidecarMtimeMs: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe('invalid-name');
    expect(api.writeGuarded).not.toHaveBeenCalled();
  });
});

describe('listCanvasNames', () => {
  it('lists PNG stems and ignores the sidecars', async () => {
    fakeApi(new Map([
      ['.aurora/canvas/sky.png', new Uint8Array()],
      ['.aurora/canvas/sky.canvas.json', new Uint8Array()],
      ['.aurora/canvas/rock.png', new Uint8Array()],
      ['.aurora/canvas/notes.txt', new Uint8Array()],
    ]));
    const { names, skipped } = await listCanvasNames(DIR);
    expect(names).toEqual(['rock', 'sky']); // sorted, not readdir order
    expect(skipped).toEqual([]);
  });

  it('lists a missing directory as empty rather than throwing', async () => {
    // listDir already resolves [] for a missing dir (main/file-io.ts); this
    // pins that this module actually relies on that tolerance rather than
    // assuming the directory always exists.
    fakeApi(new Map());
    expect(await listCanvasNames(DIR)).toEqual({ names: [], skipped: [] });
  });

  it('reports an unsafe stem as skipped, not silently dropped', async () => {
    // A directory users are EXPECTED to hand-populate (dropping an Aseprite
    // export in is the documented workflow) — a file that vanishes with no
    // explanation is indistinguishable from data loss.
    fakeApi(new Map([
      ['.aurora/canvas/my art.png', new Uint8Array()],
      ['.aurora/canvas/sky.png', new Uint8Array()],
    ]));
    const { names, skipped } = await listCanvasNames(DIR);
    expect(names).toEqual(['sky']);
    expect(skipped).toEqual(['my art.png']);
  });

  it('does not recognise a differently-cased extension as a canvas', async () => {
    // Aurora only ever WRITES lowercase `.png` (canvasPngPath). Listing
    // `sky.PNG` as `sky` would make loadCanvasFile('sky') look for
    // `.aurora/canvas/sky.png` — a different file on a case-sensitive
    // filesystem — so it is excluded outright rather than reconstructed with
    // a guessed extension.
    fakeApi(new Map([['.aurora/canvas/sky.PNG', new Uint8Array()]]));
    const { names, skipped } = await listCanvasNames(DIR);
    expect(names).toEqual([]);
    expect(skipped).toEqual([]); // not a recognised candidate either way
  });
});

describe('save and load', () => {
  it('writes both files in ONE guarded batch', async () => {
    // One batch, because the conflict check is per batch: writing the PNG and
    // then failing the sidecar would leave art whose metadata describes the
    // previous version.
    const { api, written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'genesis-level-art' });
    doc.pixels.data[0] = canvasIndex(1, 3);
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: null, sidecarMtimeMs: null });
    expect(res.ok).toBe(true);
    expect(api.writeGuarded).toHaveBeenCalledTimes(1);
    expect(written.map((w) => w.relPath)).toEqual(['.aurora/canvas/sky.png', '.aurora/canvas/sky.canvas.json']);
    if (res.ok) {
      expect(res.pngMtimeMs).toBe(2000);
      expect(res.sidecarMtimeMs).toBe(2000);
      expect(res.sidecarWritten).toBe(true);
    }
  });

  it('passes the mtime baselines through as the conflict check', async () => {
    const { written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 111, sidecarMtimeMs: 222 });
    expect(written.map((w) => w.expectedMtimeMs)).toEqual([111, 222]);
  });

  it('reports a conflict without claiming a save', async () => {
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    const api = fakeWriteApi(async () => ({ conflicts: ['.aurora/canvas/sky.png'] }));
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 1, sidecarMtimeMs: 1 }, false, api);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('conflict');
      expect(res.error).toMatch(/changed on disk/i);
      expect(res.conflicts).toEqual(['.aurora/canvas/sky.png']);
    }
  });

  it('round-trips a saved canvas back through load', async () => {
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 4, profileId: 'genesis-level-art' });
    doc.pixels.data[5] = canvasIndex(2, 9);
    await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: null, sidecarMtimeMs: null });
    const loaded = await loadCanvasFile(DIR, 'sky');
    expect(loaded.doc.pixels.data[5]).toBe(canvasIndex(2, 9));
    expect(loaded.doc.profileId).toBe('genesis-level-art');
    expect(loaded.source.pngPath).toBe('.aurora/canvas/sky.png');
    expect(loaded.source.sidecarRejected).toBe(false);
  });

  it('loads a PNG that has no sidecar, and absence is NOT a rejection', async () => {
    // The distinction R12 says is easiest to get backwards: a MISSING sidecar
    // is what opening a plain Aseprite export looks like — normal, not an
    // error — while an UNPARSEABLE or UNREADABLE sidecar (below) is the
    // rejection case.
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'foreign', width: 8, height: 8, profileId: 'genesis-level-art' });
    const { png } = await encodeCanvasFiles(doc);
    files.set('.aurora/canvas/foreign.png', png);
    const loaded = await loadCanvasFile(DIR, 'foreign');
    expect(loaded.doc.profileId).toBe('none');
    expect(loaded.source.sidecarMtimeMs).toBeNull();
    expect(loaded.source.sidecarRejected).toBe(false);
    expect(loaded.warnings).toEqual([]);
  });

  it('R12: an unparseable sidecar is rejected but the art still opens', async () => {
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'genesis-level-art' });
    doc.pixels.data[0] = canvasIndex(1, 3);
    const { png } = await encodeCanvasFiles(doc);
    files.set('.aurora/canvas/sky.png', png);
    // A hand-edit that leaves a trailing comma — R12's opening move.
    files.set('.aurora/canvas/sky.canvas.json', new TextEncoder().encode('{ "version": 1, "palette": [1,2,], }'));

    const loaded = await loadCanvasFile(DIR, 'sky');
    expect(loaded.source.sidecarRejected).toBe(true);
    expect(loaded.warnings.length).toBeGreaterThan(0);
    // Refusing to open art because its metadata rotted would lose the
    // artist's work for the sake of the annotation about it — so the pixel
    // the artist actually drew must still be there.
    expect(loaded.doc.pixels.data[0]).toBe(canvasIndex(1, 3));
  });

  it('R12 (13b): a sidecar that exists but cannot be READ (e.g. locked) is also rejected', async () => {
    // The bare-catch version of this loader treats every readBinaryFile
    // failure as "no sidecar" — indistinguishable from the normal, harmless
    // "plain Aseprite export" case. That silently degrades a LOCKED sidecar
    // (the settings are still on disk) to "unconstrained", and the next save
    // would then overwrite it — R12's data-loss chain through a second door.
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'genesis-level-art' });
    const { png } = await encodeCanvasFiles(doc);
    files.set('.aurora/canvas/sky.png', png);
    (window as unknown as { api: { readBinaryFile: unknown } }).api.readBinaryFile =
      vi.fn(async (_dir: string, rel: string) => {
        if (rel === '.aurora/canvas/sky.canvas.json') throw new Error('EACCES: permission denied');
        return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
      });

    const loaded = await loadCanvasFile(DIR, 'sky');
    expect(loaded.source.sidecarRejected).toBe(true);
    expect(loaded.warnings.some((w) => /could not be read/.test(w))).toBe(true);
  });

  it('R12: a save that knows the sidecar was rejected writes ONLY the PNG', async () => {
    // This is the guard the whole R12 chain hinges on: the mtime baseline
    // cannot protect a file Aurora never managed to read in the first place,
    // so `sidecarRejected` has to make saveCanvasFile leave it alone.
    const { api, written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'genesis-level-art' });
    const res = await saveCanvasFile(
      DIR, 'sky', doc,
      { pngMtimeMs: 1000, sidecarMtimeMs: 4242 },
      /* sidecarRejected */ true,
    );
    expect(res.ok).toBe(true);
    expect(api.writeGuarded).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(1);
    expect(written.map((w) => w.relPath)).toEqual(['.aurora/canvas/sky.png']);
    expect(written.some((w) => w.relPath.endsWith('.canvas.json'))).toBe(false);
    if (res.ok) {
      expect(res.sidecarWritten).toBe(false);
      // The sidecar's mtime baseline must survive UNCHANGED — it was never
      // sent, so nothing on disk moved. Returning null here (issue 3) would
      // read as "did not exist at read" per save-guard.ts's conflict table,
      // and turn the artist's next REAL sidecar save into a false "appeared
      // externally" conflict.
      expect(res.sidecarMtimeMs).toBe(4242);
    }
  });

  it('a partial write preserves the baseline of files that were never attempted', async () => {
    // Some fs error hits the sidecar write after the PNG already landed.
    // guarded-write.ts's own partial semantics: written/newMtimes cover what
    // DID land, failed/unwritten cover what didn't.
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    const api = fakeWriteApi(async (_dir, batch) => ({
      written: [batch[0].relPath],
      newMtimes: { [batch[0].relPath]: 9000 },
      failed: { path: batch[1].relPath, message: 'ENOSPC: disk full' },
      unwritten: [],
    }));
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 100, sidecarMtimeMs: 200 }, false, api);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('partial');
      expect(res.partial?.pngMtimeMs).toBe(9000); // landed — fresh stamp
      expect(res.partial?.sidecarMtimeMs).toBe(200); // never landed — unchanged
      expect(res.partial?.sidecarWritten).toBe(false);
      expect(res.partial?.failed.path).toBe('.aurora/canvas/sky.canvas.json');
    }
  });

  it('the write channel itself failing returns a result rather than rejecting', async () => {
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    const api = fakeWriteApi(async () => { throw new Error('IPC channel closed'); });
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: null, sidecarMtimeMs: null }, false, api);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('channel-error');
      expect(res.error).toMatch(/IPC channel closed/);
    }
  });
});
