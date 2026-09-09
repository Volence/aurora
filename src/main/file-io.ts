import { readFile, readdir, stat, unlink } from 'fs/promises';
import { mkdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { isRelPathSafe } from '../shared/rel-path';
import type { DeleteOutcome, PathProbe, ReadManyEntry, WriteOutcome } from '../shared/ipc-types';

/**
 * Write ONE project-relative file, atomically. The only writing primitive behind
 * the `file:write-binary` channel.
 *
 * IT LIVES HERE, NOT IN THE IPC HANDLER, for the reason guarded-write.ts gives
 * for the same move: a guard inside an `ipcMain.handle` closure cannot be
 * imported, so it cannot be tested without Electron, and this one was tested by
 * nothing at all. `src/main/__tests__/file-io-guards.test.ts` now drives it
 * directly against a real temp tree.
 *
 * REFUSAL IS A VALUE, NOT A THROW, and the value carries its reason: see the
 * WriteOutcome docblock in shared/ipc-types.ts for the whole argument, including
 * why the preload turns that value back into an exception. Every other failure
 * mode (EACCES, ENOSPC, EISDIR) still throws, which is what the caller's
 * existing try/catch was already built for.
 *
 * ATOMICITY. A sibling `.tmp` in the SAME directory, then rename into place. On
 * POSIX a same-directory rename is atomic, so a crash mid-write cannot leave a
 * half-written target -- critical for project.json, which bricks the project if
 * partially written.
 */
export async function writeProjectFile(
  basePath: string, relativePath: string, data: ArrayBuffer | Uint8Array,
): Promise<WriteOutcome> {
  // THE ONE WRITE CHANNEL THAT HAD NO GUARD until 2026-08, while file-io and
  // guarded-write had carried one since they were written. `resolve` happily
  // walks out of the project on a `..` segment or an absolute path, and the
  // sprite exporter feeds this a FREE-TYPED name as a path segment, so a sprite
  // called `../../.ssh/authorized_keys` was a write outside the project the user
  // opened.
  if (!isRelPathSafe(relativePath)) {
    const reason = `refused write to unsafe project-relative path (escapes root): '${relativePath}'`;
    console.error(`[file-io] ${reason}`);
    return { ok: false, reason };
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const fullPath = resolve(basePath, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.tmp`;
  writeFileSync(tmpPath, bytes);
  renameSync(tmpPath, fullPath);
  return { ok: true };
}

/**
 * Remove ONE project-relative file. The only deleting primitive in the app.
 *
 * ⚠ WHAT THIS DOES NOT DO, all on purpose. No recursion, no directories, no
 * globs, one path per call — so the blast radius of a caller's mistake is one
 * file. `isRelPathSafe` is a HARD refusal here rather than the tolerant `false`
 * the read probes use, and there is no absolute-path exception of the kind
 * `file:read-binary` still carries for legacy callers: this channel is new, so
 * it starts closed.
 *
 * `deleted: false` means the path was ALREADY gone (ENOENT), which is the
 * caller's desired end state and is reported rather than raised — a save that
 * removes a document somebody else has already removed has not failed. Every
 * other fs error (EISDIR, EPERM, EBUSY) comes back as `ok: false` WITH ITS
 * MESSAGE, because the caller's ledger has to keep that path so the next save
 * retries it (see state/aeon-save.ts).
 */
export async function deleteProjectFile(
  basePath: string, relativePath: string,
): Promise<DeleteOutcome> {
  if (!isRelPathSafe(relativePath)) {
    return { ok: false, reason: `unsafe project-relative path (escapes root): '${relativePath}'` };
  }
  try {
    await unlink(resolve(basePath, relativePath));
    return { ok: true, deleted: true };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') return { ok: true, deleted: false };
    return { ok: false, reason: e?.message ?? String(err) };
  }
}

export async function readBinaryFile(basePath: string, relativePath: string): Promise<Buffer> {
  const fullPath = resolve(basePath, relativePath);
  return readFile(fullPath);
}

/**
 * Batch-read many project-relative files in one call, returning each file's bytes
 * and read-time mtime. Reads run concurrently (fs is async), so the caller pays
 * one IPC round-trip instead of one per file — the classic act-load read fans out
 * ~18 mandatory files whose sequential round-trips otherwise dominate load
 * latency. Rel-path-safe per entry: an escaping/missing path yields
 * `bytes: null` (never rejects), matching the tolerant probePath/fileMtime
 * probes. Aligned by index to `relativePaths`.
 *
 * ⚠ A NULL SAYS WHY IT IS NULL. `outcome` (required, see ReadOutcome in
 * shared/ipc-types) separates 'absent' from 'unreadable' from 'refused', because
 * until 2026-09-08 this function's `catch { return ... null }` was the whole
 * distinction and two consumers turned it into a hand-typed
 * "ENOENT: no such file or directory" for all of them. `probePath` above had the
 * same defect and the same fix; this is the batch-read half of it. ONLY 'absent'
 * licenses the ENOENT sentence.
 */
export async function readManyFiles(
  basePath: string,
  relativePaths: string[],
): Promise<ReadManyEntry[]> {
  return Promise.all(
    relativePaths.map(async (relPath): Promise<ReadManyEntry> => {
      if (!isRelPathSafe(relPath)) {
        return {
          relPath, bytes: null, mtimeMs: null, outcome: 'refused',
          reason: `unsafe project-relative path (escapes root): '${relPath}'`,
        };
      }
      const full = resolve(basePath, relPath);
      try {
        const [bytes, st] = await Promise.all([readFile(full), stat(full)]);
        return { relPath, bytes, mtimeMs: st.mtimeMs, outcome: 'read', reason: null };
      } catch (err) {
        // ENOENT and ENOTDIR are the two errnos that really do mean "not there":
        // nothing at the path, or a non-directory above it so nothing can be.
        // Same cut probePath makes, for the same reason.
        const e = err as NodeJS.ErrnoException;
        if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') {
          return { relPath, bytes: null, mtimeMs: null, outcome: 'absent', reason: null };
        }
        return {
          relPath, bytes: null, mtimeMs: null, outcome: 'unreadable',
          reason: e?.message ?? String(err),
        };
      }
    }),
  );
}

/**
 * Whether a project-relative path exists under `basePath` — in THREE answers, not
 * two. See PathProbe (shared/ipc-types) for the whole reason; in short:
 *
 * This used to be `pathExists(): Promise<boolean>` whose `catch { return false }`
 * reported "not there" for an ENOENT, for an EACCES on a parent directory, for an
 * ELOOP and for an EIO alike — while its own docblock named permissions as a
 * cause. One layer up, aeon's markUnreadable asks this exact question to tell
 * "absent" from "there and unreadable", and the second answer is the one that
 * stops the save path writing an empty placeholder over the user's file. So a
 * failure Aurora cannot attribute to absence is now 'unknown', and it is the
 * caller's job to decide — which, for a would-be writer, means "assume the file is
 * there and leave it alone".
 *
 * STILL NEVER REJECTS. The renderer bridge (Task 9) probes optional files, and the
 * point of not throwing was to keep those out of the main-process error log
 * (consistent with the read-binary missing-file marker); that is preserved. What
 * changed is only that the tolerant answer stopped lying about which failure it was.
 *
 * ENOENT and ENOTDIR are the two errnos that really do mean "not there": nothing
 * at the path, or a path component above it that is not a directory, so nothing
 * can be at the path either. Everything else is 'unknown' WITH ITS REASON.
 *
 * An escaping (`..`/absolute) path is 'unknown', not 'absent': the probe REFUSED
 * TO LOOK, which is not a statement about what is on the filesystem. Callers that
 * are about to write treat it exactly as they treat any other "cannot tell".
 */
export async function probePath(basePath: string, relativePath: string): Promise<PathProbe> {
  if (!isRelPathSafe(relativePath)) {
    return { presence: 'unknown', reason: `unsafe project-relative path (escapes root): '${relativePath}'` };
  }
  try {
    await stat(resolve(basePath, relativePath));
    return { presence: 'present', reason: null };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') return { presence: 'absent', reason: null };
    return { presence: 'unknown', reason: e?.message ?? String(err) };
  }
}

/**
 * The last-modified time (fs.stat `mtimeMs`, float ms) of a project-relative
 * file, or null when it is missing / the path escapes the root / any stat error.
 * Rel-path-safe and never rejects — the guarded-save baseline (Task 10, spec
 * §2.6) probes optional files the same tolerant way as probePath, keeping the
 * main error log clean (consistent with the 39d90e2 no-log-spam pattern).
 */
export async function fileMtime(basePath: string, relativePath: string): Promise<number | null> {
  if (!isRelPathSafe(relativePath)) return null;
  try {
    return (await stat(resolve(basePath, relativePath))).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * List the immediate entry names under a project-relative directory. Rel-path-
 * safe; a missing dir / non-directory / escaping path resolves to `[]` (never
 * rejects), matching the FileAccess.list contract's tolerant callers
 * (s1Adapter.detect's dirHasEntries catches emptiness, not throws).
 */
export async function listDir(basePath: string, relativeDir: string): Promise<string[]> {
  if (!isRelPathSafe(relativeDir)) return [];
  try {
    return await readdir(resolve(basePath, relativeDir));
  } catch {
    return [];
  }
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'comfy-env', 'build_tools', 'dist', '.venv']);
const KEEP_EXT = new Set(['.asm', '.bin', '.nem']);
const MAX_FILES = 50000;
const MAX_DEPTH = 10;

/**
 * Recursively list project-relative paths of sprite-relevant files (.asm/.bin/.nem)
 * under `basePath`, skipping VCS/build/vendor dirs. Bounded by depth and count so a
 * huge tree can't hang the UI. Used by the disassembly-project sprite scan (6c).
 */
export async function listProjectFiles(basePath: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(resolve(dir, e.name), childRel, depth + 1);
      } else if (e.isFile()) {
        const dot = e.name.lastIndexOf('.');
        if (dot !== -1 && KEEP_EXT.has(e.name.slice(dot).toLowerCase())) out.push(childRel);
      }
    }
  }
  await walk(basePath, '', 0);
  return out;
}
