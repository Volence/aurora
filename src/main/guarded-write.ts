// guarded-write — the main-process core of Task 10's atomic, mtime-guarded
// classic save (spec §2.6: atomic per-file, refuse on external mtime change, no
// silent clobber, conflict list for the UI). Extracted from ipc-handlers so the
// whole cycle is unit-testable headlessly (no Electron): the handler is a thin
// `ipcMain.handle` wrapper over `performGuardedWrite`.
//
// Flow:
//   1. Guard EVERY relPath with isRelPathSafe. This is a NEW channel with no
//      legacy absolute-path exception (unlike file:read-binary), so an unsafe
//      path is a hard failure — we throw and write NOTHING.
//   2. Stat every target's CURRENT mtime, then ask the pure planGuardedWrite
//      (core/save-guard) whether it is safe. The CONFLICT CHECK is all-or-
//      nothing: if ANY file conflicts → return the conflict list and write
//      nothing. (This is the only all-or-nothing guarantee.)
//   3. Otherwise write each file atomically: a sibling `.tmp` in the SAME dir,
//      then rename into place (a same-directory rename is atomic on POSIX, so a
//      crash mid-write can never leave a half-written target). Return the new
//      on-disk mtimes so the renderer can refresh its captured baseline WITHOUT
//      re-reading (the next save then expects these).
//
// Atomicity scope (honest): per-FILE rename atomicity holds — a target is never
// half-written. BATCH atomicity does NOT — if an fs error hits file N mid-batch,
// files 1..N-1 are already committed. We do NOT roll them back (we have no
// pre-image); instead we unlink N's orphaned `.tmp` (best effort), stop, and
// RETURN a structured partial result ({written, newMtimes, failed, unwritten})
// rather than rejecting, so the renderer can report exactly what did/didn't land.
//
// Note on the stat→write window: another process could change a file between the
// conflict stat and the rename. That race is inherent to any mtime guard and is
// accepted here; the atomic rename still guarantees each target is never partial.

import { stat, writeFile, rename, mkdir, unlink } from 'fs/promises';
import { resolve, dirname } from 'path';
import { isRelPathSafe } from '../shared/rel-path';
import type { GuardedWriteFile, GuardedWriteResult } from '../shared/ipc-types';
import { planGuardedWrite, type GuardedFileSpec } from '../core/project/save-guard';

async function currentMtime(fullPath: string): Promise<number | null> {
  try {
    return (await stat(fullPath)).mtimeMs;
  } catch {
    return null; // missing (ENOENT) or otherwise unstattable → treated as absent
  }
}

/**
 * Perform an mtime-guarded multi-file write rooted at `basePath`. Rejects
 * (throws) ONLY for an unsafe relPath. Returns `{ conflicts }` (writing nothing)
 * when the conflict check fails. Otherwise writes each file atomically and
 * returns `{ written, newMtimes }`; if an fs error interrupts the batch it
 * returns a PARTIAL result carrying `failed` (the erroring file) and `unwritten`
 * (files after it, never attempted) alongside what did land.
 */
export async function performGuardedWrite(
  basePath: string,
  files: GuardedWriteFile[],
): Promise<GuardedWriteResult> {
  // 1. Full main-side rel-path guard — one unsafe path aborts the whole write.
  for (const f of files) {
    if (!isRelPathSafe(f.relPath)) {
      throw new Error(`unsafe project-relative path (escapes root): '${f.relPath}'`);
    }
  }

  // 2. Conflict check across ALL files, up front, before any write (the sole
  //    all-or-nothing guarantee).
  const currentMtimes: Record<string, number | null> = {};
  await Promise.all(
    files.map(async (f) => {
      currentMtimes[f.relPath] = await currentMtime(resolve(basePath, f.relPath));
    }),
  );
  const specs: GuardedFileSpec[] = files.map((f) => ({
    relPath: f.relPath,
    expectedMtimeMs: f.expectedMtimeMs,
  }));
  const plan = planGuardedWrite(specs, currentMtimes);
  if (!plan.ok) return { conflicts: plan.conflicts };

  // 3. Atomic per-file writes (tmp in same dir + rename), then read back new
  //    mtimes. On an fs error we stop, clean up the orphaned tmp, and report a
  //    partial batch — files already renamed stay committed (no pre-image to
  //    roll back), which the caller surfaces via `failed`/`unwritten`.
  const written: string[] = [];
  const newMtimes: Record<string, number> = {};
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fullPath = resolve(basePath, f.relPath);
    const tmpPath = `${fullPath}.tmp`;
    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(tmpPath, f.bytes);
      await rename(tmpPath, fullPath);
      written.push(f.relPath);
      newMtimes[f.relPath] = (await stat(fullPath)).mtimeMs;
    } catch (e) {
      await unlink(tmpPath).catch(() => {}); // best-effort orphan cleanup
      return {
        written,
        newMtimes,
        failed: { path: f.relPath, message: (e as Error).message },
        unwritten: files.slice(i + 1).map((x) => x.relPath),
      };
    }
  }
  return { written, newMtimes };
}
