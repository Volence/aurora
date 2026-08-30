import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FileAccess } from '../../src/core/project/adapter';
import { s1Profile, type LevelAct } from '../../src/core/project/profiles/s1';
import { readS1Level, writeS1Level, type ResolvedLevelPaths } from '../../src/core/level-classic/s1-io';
import { s1Adapter } from '../../src/core/project/s1/index';
import { performGuardedWrite } from '../../src/main/guarded-write';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../support/fixture-tree';

// ---------------------------------------------------------------------------
// End-to-end guarded-save cycle over a TEMP COPY of real s1disasm files (never
// mutates the real disasm). Skips when the reference tree is absent.
// ---------------------------------------------------------------------------

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');
const S1_PRESENT = referenceCheckout('s1disasm');

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-classic-save-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Resolve one act's paths against the real disasm (REV/exists fallback). */
function resolveVariant(v: { path: string; rev00Path?: string }): string {
  if (fs.existsSync(path.join(S1DIR, v.path))) return v.path;
  if (v.rev00Path && fs.existsSync(path.join(S1DIR, v.rev00Path))) return v.rev00Path;
  return v.path;
}
function resolveSingle(p: string): string | undefined {
  return fs.existsSync(path.join(S1DIR, p)) ? p : undefined;
}
/**
 * The REQUIRED files, failing in this file's own words rather than four frames
 * down inside `path.join`. `resolveSingle(t)!` asserted a fact the guard above
 * does not establish, and on an INCOMPLETE checkout it produced
 * `TypeError: The "path" argument must be of type string. Received undefined` —
 * a message naming no file, no directory and no checkout (measured 2026-08-30).
 */
function requireSingle(p: string): string {
  const r = resolveSingle(p);
  if (r === undefined) {
    throw new Error(
      `${path.join(S1DIR, p)} is missing — this checkout has the top-level markers but not `
      + 'this file, so the row below cannot measure anything. It is an INCOMPLETE s1disasm '
      + 'checkout, not an Aurora defect.',
    );
  }
  return r;
}
function realPaths(act: LevelAct): ResolvedLevelPaths {
  return {
    tiles: act.tiles.map((t) => requireSingle(t)),
    blocks: resolveVariant(act.blocks),
    chunks: resolveVariant(act.chunks),
    colind: resolveVariant(act.colind),
    fg: resolveVariant(act.fgLayout),
    bg: resolveVariant(act.bgLayout),
    objpos: resolveVariant(act.objpos),
    startpos: resolveVariant(act.startpos),
    palette: act.palette.map((c) => requireSingle(c.file)),
    animatedArt: act.animatedArt.map((a) => resolveSingle(a.file)),
    collisionNormal: s1Profile.collision.normal,
    collisionAngleMap: s1Profile.collision.angleMap,
  };
}

/** Copy the given rel paths from S1DIR into `tmp`, preserving structure. */
function copyInto(rels: string[]): void {
  for (const rel of rels) {
    const src = path.join(S1DIR, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

/** Real fs-backed FileAccess (with mtime) rooted at `root`. */
function realFs(root: string): FileAccess {
  return {
    async exists(rel) {
      return fs.existsSync(path.join(root, rel));
    },
    async read(rel) {
      return new Uint8Array(fs.readFileSync(path.join(root, rel)));
    },
    async list(rel) {
      return fs.readdirSync(path.join(root, rel));
    },
    async mtime(rel) {
      try {
        return fs.statSync(path.join(root, rel)).mtimeMs;
      } catch {
        return null;
      }
    },
  };
}

const ALL_DIRTY = {
  tiles: true, blocks: true, chunks: true, fg: true, bg: true,
  objects: true, palette: true, colind: true, start: true,
} as const;

describe('classic save integration (temp copy of real s1disasm)', () => {
  it(
    'read → guarded write → refresh mtimes → external touch → second write conflicts, writes nothing',
    { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } },
    async () => {
      const act = s1Profile.zones[0].acts[0]; // GHZ1
      const paths = realPaths(act);
      // Copy exactly the files this act reads (writable ones; collision tables
      // are read-only and never written, so they need not be present for write).
      const readPaths = new Set<string>([
        ...paths.tiles,
        paths.blocks, paths.chunks, paths.colind, paths.fg, paths.bg,
        paths.objpos, paths.startpos, ...paths.palette,
        ...paths.animatedArt.filter((p): p is string => p !== undefined),
        paths.collisionNormal, paths.collisionAngleMap,
      ]);
      copyInto([...readPaths]);

      const fa = realFs(tmp);
      const state = await readS1Level(act, paths, fa);
      // Every writable file got a captured read-time mtime.
      expect(Object.keys(state.read.fileMtimes).length).toBeGreaterThan(5);

      // Zero-edit write: buffers are decode-identical, self-check passes.
      const result = writeS1Level(state, ALL_DIRTY);
      expect(result.errors).toEqual([]);

      const payload = result.files.map((f) => ({
        relPath: f.path,
        bytes: f.bytes,
        expectedMtimeMs: state.read.fileMtimes[f.path] ?? null,
      }));
      const first = await performGuardedWrite(tmp, payload);
      expect('newMtimes' in first).toBe(true);
      if (!('newMtimes' in first)) throw new Error('unreachable');
      expect(first.written.length).toBe(payload.length);

      // Refresh captured mtimes (what the adapter's updateMtimes does).
      for (const [p, m] of Object.entries(first.newMtimes)) state.read.fileMtimes[p] = m;

      // Externally touch one written file to bump its mtime past the baseline.
      const victim = result.files[0].path;
      const bumped = first.newMtimes[victim] + 5000;
      await fsp.utimes(path.join(tmp, victim), new Date(bumped), new Date(bumped));

      // Snapshot all written files, then attempt a second guarded write.
      const before = new Map(result.files.map((f) => [f.path, new Uint8Array(fs.readFileSync(path.join(tmp, f.path)))]));
      const payload2 = result.files.map((f) => ({
        relPath: f.path,
        bytes: f.bytes,
        expectedMtimeMs: state.read.fileMtimes[f.path] ?? null,
      }));
      const second = await performGuardedWrite(tmp, payload2);
      expect(second).toEqual({ conflicts: [victim] });

      // Nothing was written on the conflicting attempt (mtime bump aside).
      for (const [rel, bytes] of before) {
        const now = new Uint8Array(fs.readFileSync(path.join(tmp, rel)));
        expect(Buffer.from(now).equals(Buffer.from(bytes)), `${rel} content unchanged`).toBe(true);
      }
    },
  );

  it(
    'adapter write() exposes fileMtimes; updateMtimes refreshes the baseline for the next save',
    { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } },
    async () => {
      const act = s1Profile.zones[0].acts[0]; // GHZ1
      const zoneId = s1Profile.zones[0].id;
      const paths = realPaths(act);
      const readPaths = new Set<string>([
        ...paths.tiles,
        paths.blocks, paths.chunks, paths.colind, paths.fg, paths.bg,
        paths.objpos, paths.startpos, ...paths.palette,
        ...paths.animatedArt.filter((p): p is string => p !== undefined),
        paths.collisionNormal, paths.collisionAngleMap,
      ]);
      copyInto([...readPaths]);
      // detect() also probes sonic.asm + the data dirs; open() doesn't need it,
      // but a stub keeps this closer to the real open flow.
      fs.writeFileSync(path.join(tmp, 'sonic.asm'), 'x');

      const handle = await s1Adapter.open(realFs(tmp));
      expect(handle.levels).not.toBeNull();
      const levels = handle.levels!;
      const ref = { zone: zoneId, act: 1, label: act.name, available: true };

      const doc = await levels.read(ref);
      // Write a single dirty domain (start) — the WriteResult should carry an
      // expected mtime for the startpos file it emits.
      const result = await levels.write(ref, doc, { start: true });
      expect(result.errors).toEqual([]);
      expect(result.files && result.files.length).toBeGreaterThan(0);
      const startPath = result.files![0].path;
      expect(result.fileMtimes && result.fileMtimes[startPath]).toBeTypeOf('number');

      // Persist, refresh via updateMtimes, then a second write must expect the
      // NEW mtime (not the stale read-time one).
      const first = await performGuardedWrite(tmp, result.files!.map((f) => ({
        relPath: f.path, bytes: f.bytes, expectedMtimeMs: result.fileMtimes![f.path] ?? null,
      })));
      if (!('newMtimes' in first)) throw new Error('expected a successful first write');
      expect(levels.updateMtimes).toBeTypeOf('function');
      levels.updateMtimes!(ref, first.newMtimes);

      const result2 = await levels.write(ref, doc, { start: true });
      expect(result2.fileMtimes![startPath]).toBe(first.newMtimes[startPath]);
    },
  );
});
