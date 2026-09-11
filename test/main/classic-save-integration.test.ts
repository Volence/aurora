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
import { nemesisDecompress } from '../../src/core/compress/nemesis';
import { referencePath, S1_PINNED } from '../support/fixture-tree';
import { whenS1Act } from '../support/s1-checkout';

// ---------------------------------------------------------------------------
// End-to-end guarded-save cycle over a TEMP COPY of real s1disasm files (never
// mutates the real disasm). Skips when the reference tree is absent.
// ---------------------------------------------------------------------------

const S1DIR = referencePath(S1_PINNED);

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-classic-save-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/**
 * Resolve one act's paths against the real disasm (REV/exists fallback).
 *
 * THE LAST LINE USED TO BE `return v.path` — a path known not to exist, handed
 * onward as if it did. `copyInto` then skipped the absent source silently and
 * `readS1Level` died as
 * `ENOENT: no such file or directory, open '/tmp/aurora-classic-save-XXXX/map256/GHZ.kos'`,
 * pointing a reader at a TEMP DIRECTORY that `afterEach` had already deleted,
 * for a file that was missing in s1disasm all along (measured 2026-08-30,
 * docs/reviews/2026-08-30-incomplete-checkout-rows.md). The `whenS1Act` guard on
 * both rows below should reach every gating entry first; this is the backstop
 * that makes a hole in it audible instead of misdirecting.
 */
function resolveVariant(v: { path: string; rev00Path?: string }): string {
  if (fs.existsSync(path.join(S1DIR, v.path))) return v.path;
  if (v.rev00Path && fs.existsSync(path.join(S1DIR, v.rev00Path))) return v.rev00Path;
  const tried = [v.path, ...(v.rev00Path ? [v.rev00Path] : [])]
    .map((p) => path.join(S1DIR, p))
    .join(' nor ');
  throw new Error(
    `${tried} is missing: this checkout has the top-level markers but not this file, so the `
    + 'row below cannot measure anything. It is an INCOMPLETE s1disasm checkout, not an Aurora '
    + 'defect.',
  );
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
      `${path.join(S1DIR, p)} is missing: this checkout has the top-level markers but not `
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
    whenS1Act('ghz', 1),
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
      // The cause, not just the path: an externally TOUCHED file is 'changed',
      // and this is the one cause for which the reload advice is honest.
      expect(second).toEqual({ conflicts: [{ relPath: victim, cause: 'changed', reason: null }] });

      // Nothing was written on the conflicting attempt (mtime bump aside).
      for (const [rel, bytes] of before) {
        const now = new Uint8Array(fs.readFileSync(path.join(tmp, rel)));
        expect(Buffer.from(now).equals(Buffer.from(bytes)), `${rel} content unchanged`).toBe(true);
      }
    },
  );

  it(
    'adapter write() exposes fileMtimes; updateMtimes refreshes the baseline for the next save',
    whenS1Act('ghz', 1),
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

// ---------------------------------------------------------------------------
// UX seat A's F3, option (b), on the real files and the real adapter: one tile
// painted in GHZ1 no longer rewrites GHZ2 (ledger A-F3-ART-SAVE-WIDTH, packet
// docs/reviews/2026-09-11-a-f3-art-save-width.md). The writer's rule is pinned
// on a synthetic act in src/core/level-classic/__tests__/s1-art-save-width.test.ts;
// what only this file can reach is the ADAPTER's half (the `unchanged` it hands
// the saver, and `updateMtimes` recording what landed) and the bytes on a disk.
// ---------------------------------------------------------------------------

describe('F3 (b): a GHZ save writes only the art file that changed (temp copy of real s1disasm)', () => {
  /** Tile $30 is the tile seat A painted. Its file is DERIVED from the read below. */
  const SEAT_A_TILE = 0x30;

  async function openGhz1() {
    const act = s1Profile.zones[0].acts[0]; // GHZ1
    const paths = realPaths(act);
    copyInto([
      ...paths.tiles,
      paths.blocks, paths.chunks, paths.colind, paths.fg, paths.bg,
      paths.objpos, paths.startpos, ...paths.palette,
      ...paths.animatedArt.filter((p): p is string => p !== undefined),
      paths.collisionNormal, paths.collisionAngleMap,
    ]);
    fs.writeFileSync(path.join(tmp, 'sonic.asm'), 'x');
    const handle = await s1Adapter.open(realFs(tmp));
    const levels = handle.levels!;
    const ref = { zone: s1Profile.zones[0].id, act: 1, label: act.name, available: true };
    const doc = await levels.read(ref);
    return { paths, levels, ref, doc };
  }

  const persist = (res: { files?: { path: string; bytes: Uint8Array }[]; fileMtimes?: Record<string, number> }) =>
    performGuardedWrite(tmp, (res.files ?? []).map((f) => ({
      relPath: f.path, bytes: f.bytes, expectedMtimeMs: res.fileMtimes?.[f.path] ?? null,
    })));

  it("seat A's case: tile $30 painted writes GHZ1 alone, and GHZ2 on disk is untouched", whenS1Act('ghz', 1), async () => {
    const { paths, levels, ref, doc } = await openGhz1();
    // Which file holds the tile, from the files rather than the report: the pool
    // is GHZ1 then GHZ2, so the tile is in GHZ1 iff it is below GHZ1's count.
    const ghz1Tiles = nemesisDecompress(new Uint8Array(fs.readFileSync(path.join(tmp, paths.tiles[0])))).length / 32;
    expect(SEAT_A_TILE).toBeLessThan(ghz1Tiles);
    const [ghz1, ghz2] = paths.tiles;
    const ghz2Before = new Uint8Array(fs.readFileSync(path.join(tmp, ghz2)));
    const ghz2MtimeBefore = fs.statSync(path.join(tmp, ghz2)).mtimeMs;
    const ghz1SizeBefore = fs.statSync(path.join(tmp, ghz1)).size;

    doc.tiles[SEAT_A_TILE * 32] = (doc.tiles[SEAT_A_TILE * 32] ^ 0x0f) & 0xff;
    const result = await levels.write(ref, doc, { tiles: true });
    expect(result.errors).toEqual([]);
    expect(result.files!.map((f) => f.path)).toEqual([ghz1]);
    expect(result.unchanged).toEqual([ghz2]);

    const landed = await persist(result);
    if (!('written' in landed)) throw new Error('expected the guarded write to land');
    expect(landed.written).toEqual([ghz1]);
    // Option (c): the guarded channel reports GHZ1's size on both sides, read by
    // stat on this disk, and reports nothing for GHZ2, which it never touched.
    expect(landed.sizes?.[ghz1]).toEqual({ before: ghz1SizeBefore, after: fs.statSync(path.join(tmp, ghz1)).size });
    expect(landed.sizes?.[ghz2]).toBeUndefined();
    // GHZ2 was not rewritten: same bytes, same mtime. Before 2026-09-11 this file
    // came back 5193 bytes with no edit in it.
    expect(Buffer.from(fs.readFileSync(path.join(tmp, ghz2))).equals(Buffer.from(ghz2Before))).toBe(true);
    expect(fs.statSync(path.join(tmp, ghz2)).mtimeMs).toBe(ghz2MtimeBefore);
  });

  it('a file an earlier save rewrote is written again when the document returns to its read-time content', whenS1Act('ghz', 1), async () => {
    const { paths, levels, ref, doc } = await openGhz1();
    const [ghz1, ghz2] = paths.tiles;
    const original = doc.tiles[SEAT_A_TILE * 32];

    // Paint and save: GHZ1 lands with the paint in it.
    doc.tiles[SEAT_A_TILE * 32] = (original ^ 0x0f) & 0xff;
    const first = await levels.write(ref, doc, { tiles: true });
    const landed = await persist(first);
    if (!('newMtimes' in landed)) throw new Error('expected the guarded write to land');
    levels.updateMtimes!(ref, landed.newMtimes); // what the saver does on success

    // Undo past the save: the document is back to READ-time content for GHZ1,
    // and disk is not. Something else is dirty too, so the zero-diff fallback
    // cannot be what emits GHZ1; only `writtenSinceRead` can.
    doc.tiles[SEAT_A_TILE * 32] = original;
    const second = await levels.write(ref, doc, { tiles: true, start: true });
    expect(second.errors).toEqual([]);
    const art = second.files!.filter((f) => paths.tiles.includes(f.path));
    expect(art.map((f) => f.path)).toEqual([ghz1]);
    expect(nemesisDecompress(art[0].bytes)[SEAT_A_TILE * 32]).toBe(original);
    // CONTROL: GHZ2 was never written, so it is still skipped.
    expect(second.unchanged).toEqual([ghz2]);
  });
});
