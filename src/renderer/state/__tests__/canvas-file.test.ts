// src/renderer/state/__tests__/canvas-file.test.ts
//
// R12 runs through every test here: a load that could not parse its sidecar
// must say so (`sidecarRejected`, `warnings`) without refusing to open the
// picture, and a save that knows the sidecar was unreadable must not
// overwrite it with a freshly-guessed one. See canvas-file.ts's header and
// canvas-file-format.ts's for the full data-loss chain this closes.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CANVAS_DIR, canvasPngPath, canvasSidecarPath, canvasNameIsSafe,
  listCanvasNames, loadCanvasFile, saveCanvasFile,
} from '../canvas-file';
import { blankCanvasDoc, canvasIndex } from '../../../core/art/canvas-doc';
import { encodeCanvasFiles } from '../../../core/art/canvas-file-format';

const DIR = '/home/user/s1disasm';

type Written = { relPath: string; bytes: Uint8Array; expectedMtimeMs: number | null };

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
    writeGuarded: vi.fn(async (_dir: string, batch: Written[]) => {
      written.push(...batch);
      for (const f of batch) files.set(f.relPath, f.bytes);
      return { written: batch.map((f) => f.relPath), newMtimes: Object.fromEntries(batch.map((f) => [f.relPath, 2000])) };
    }),
  };
  (globalThis as { window?: unknown }).window = { api };
  return { api, written };
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

describe('listCanvasNames', () => {
  it('lists PNG stems and ignores the sidecars', async () => {
    fakeApi(new Map([
      ['.aurora/canvas/sky.png', new Uint8Array()],
      ['.aurora/canvas/sky.canvas.json', new Uint8Array()],
      ['.aurora/canvas/rock.png', new Uint8Array()],
      ['.aurora/canvas/notes.txt', new Uint8Array()],
    ]));
    expect((await listCanvasNames(DIR)).sort()).toEqual(['rock', 'sky']);
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
    if (res.ok) expect(res.pngMtimeMs).toBe(2000);
  });

  it('passes the mtime baselines through as the conflict check', async () => {
    const { written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 111, sidecarMtimeMs: 222 });
    expect(written.map((w) => w.expectedMtimeMs)).toEqual([111, 222]);
  });

  it('reports a conflict without claiming a save', async () => {
    fakeApi(new Map());
    (window as unknown as { api: { writeGuarded: unknown } }).api.writeGuarded =
      vi.fn(async () => ({ conflicts: ['.aurora/canvas/sky.png'] }));
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 1, sidecarMtimeMs: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/changed on disk/i);
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
  });

  it('loads a PNG that has no sidecar, and absence is NOT a rejection', async () => {
    // The distinction R12 says is easiest to get backwards: a MISSING sidecar
    // is what opening a plain Aseprite export looks like — normal, not an
    // error — while an UNPARSEABLE sidecar (below) is the rejection case.
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'foreign', width: 8, height: 8, profileId: 'genesis-level-art' });
    const { png } = await encodeCanvasFiles(doc);
    files.set('.aurora/canvas/foreign.png', png);
    const loaded = await loadCanvasFile(DIR, 'foreign');
    expect(loaded.doc.profileId).toBe('none');
    expect(loaded.source.sidecarMtimeMs).toBeNull();
    expect(loaded.sidecarRejected).toBe(false);
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
    expect(loaded.sidecarRejected).toBe(true);
    expect(loaded.warnings.length).toBeGreaterThan(0);
    // Refusing to open art because its metadata rotted would lose the
    // artist's work for the sake of the annotation about it — so the pixel
    // the artist actually drew must still be there.
    expect(loaded.doc.pixels.data[0]).toBe(canvasIndex(1, 3));
  });

  it('R12: a save that knows the sidecar was rejected writes ONLY the PNG', async () => {
    // This is the guard the whole R12 chain hinges on: the mtime baseline
    // cannot protect a file Aurora never managed to read in the first place,
    // so `sidecarRejected` has to make saveCanvasFile leave it alone.
    const { api, written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'genesis-level-art' });
    const res = await saveCanvasFile(
      DIR, 'sky', doc,
      { pngMtimeMs: 1000, sidecarMtimeMs: null },
      /* sidecarRejected */ true,
    );
    expect(res.ok).toBe(true);
    expect(api.writeGuarded).toHaveBeenCalledTimes(1);
    expect(written).toHaveLength(1);
    expect(written.map((w) => w.relPath)).toEqual(['.aurora/canvas/sky.png']);
    expect(written.some((w) => w.relPath.endsWith('.canvas.json'))).toBe(false);
  });
});
