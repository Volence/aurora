// guarded-write — the main-process core of Task 10's atomic, mtime-guarded
// classic save (spec §2.6: atomic per-file, refuse on external mtime change, no
// silent clobber, conflict list for the UI). Extracted from ipc-handlers so the
// whole cycle is unit-testable headlessly (no Electron): the handler is a thin
// `ipcMain.handle` wrapper over `performGuardedWrite`.
//
// Flow (all-or-nothing):
//   1. Guard EVERY relPath with isRelPathSafe. This is a NEW channel with no
//      legacy absolute-path exception (unlike file:read-binary), so an unsafe
//      path is a hard failure — we throw and write NOTHING.
//   2. Stat every target's CURRENT mtime, then ask the pure planGuardedWrite
//      (core/save-guard) whether it is safe. If ANY file conflicts → return the
//      conflict list and write nothing.
//   3. Otherwise write each file atomically: a sibling `.tmp` in the SAME dir,
//      then rename into place (a same-directory rename is atomic on POSIX, so a
//      crash mid-write can never leave a half-written target). Return the new
//      on-disk mtimes so the renderer can refresh its captured baseline WITHOUT
//      re-reading (the next save then expects these).
//
// Note on the stat→write window: another process could change a file between the
// conflict stat and the rename. That race is inherent to any mtime guard and is
// accepted here; the atomic rename still guarantees each target is never partial.

import { stat, writeFile, rename, mkdir } from 'fs/promises';
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
 * Perform an atomic, mtime-guarded multi-file write rooted at `basePath`.
 * Rejects (throws) if any relPath is unsafe. Returns `{ conflicts }` and writes
 * nothing if any file's on-disk mtime disagrees with its expected value;
 * otherwise writes every file atomically and returns `{ written, newMtimes }`.
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

  // 2. Conflict check across ALL files, up front, before any write.
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

  // 3. Atomic writes (tmp in same dir + rename), then read back new mtimes.
  const written: string[] = [];
  const newMtimes: Record<string, number> = {};
  for (const f of files) {
    const fullPath = resolve(basePath, f.relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    const tmpPath = `${fullPath}.tmp`;
    await writeFile(tmpPath, f.bytes);
    await rename(tmpPath, fullPath);
    written.push(f.relPath);
    newMtimes[f.relPath] = (await stat(fullPath)).mtimeMs;
  }
  return { written, newMtimes };
}
