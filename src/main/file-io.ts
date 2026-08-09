import { readFile, readdir, stat } from 'fs/promises';
import { resolve } from 'path';
import { isRelPathSafe } from '../shared/rel-path';

export async function readBinaryFile(basePath: string, relativePath: string): Promise<Buffer> {
  const fullPath = resolve(basePath, relativePath);
  return readFile(fullPath);
}

/**
 * Whether a project-relative path exists under `basePath`. Rel-path-safe: an
 * escaping (`..`/absolute) path never touches the fs and reports false. Any fs
 * error (ENOENT/ENOTDIR/permissions) resolves false rather than rejecting, so
 * the renderer FileAccess bridge (Task 9) can probe optional files without
 * spamming the main process error log — consistent with the read-binary
 * missing-file marker (see MissingFileMarker in shared/ipc-types).
 */
export async function pathExists(basePath: string, relativePath: string): Promise<boolean> {
  if (!isRelPathSafe(relativePath)) return false;
  try {
    await stat(resolve(basePath, relativePath));
    return true;
  } catch {
    return false;
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
