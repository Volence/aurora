// Renderer-side FileAccess for the classic (disasm) project layer — bridges the
// core's fs-free FileAccess interface (src/core/project/adapter) over per-file
// IPC to the main process.
//
// WHY RENDERER-SIDE (architecture decision, mirrored in classicProjectStore's
// header): Aurora's existing aeon project load runs entirely in the renderer
// (useProject.ts imports the core parsers and reads files via
// window.api.readBinaryFile; the main process only performs raw file IO). Task 9
// matches that seam: detect/open run in the renderer against this FileAccess, so
// the resulting ProjectHandle (with its levels.read/write closures + read-state
// cache) lives in the renderer store — no ProjectHandle serialization across
// IPC, and the aeon open path is left 100% untouched.
//
// The heavy fs work runs in the main process. `read` reuses the existing
// file:read-binary channel (whose missing-file marker keeps optional probes out
// of the main error log; the preload unwraps it back into a thrown ENOENT) —
// that channel has NO main-side rel-path guard (adding one would break aeon's
// absolute-path chunk import), so read is rel-path-safe RENDERER-SIDE ONLY, via
// assertSafe below. exists/list use the file:path-exists / file:list-dir
// channels added for this bridge, which ARE guarded on the main side too — so
// those are rejected on both ends.

import type { FileAccess } from '../../core/project/adapter';
import { isRelPathSafe } from '../../shared/rel-path';

function assertSafe(rel: string): void {
  if (!isRelPathSafe(rel)) {
    throw new Error(`unsafe project-relative path (escapes root): '${rel}'`);
  }
}

/**
 * Build a FileAccess rooted at an absolute project directory. Every path is
 * project-relative POSIX; `assertSafe` rejects any that would escape the root
 * before it reaches IPC (defense-in-depth: main also guards).
 */
export function createIpcFileAccess(dir: string): FileAccess {
  const fa: FileAccess = {
    async exists(rel: string): Promise<boolean> {
      assertSafe(rel);
      return window.api.pathExists(dir, rel);
    },
    async read(rel: string): Promise<Uint8Array> {
      assertSafe(rel);
      // readBinaryFile throws ENOENT for a genuine miss (the preload unwraps the
      // main-process missing-file marker), matching the FileAccess.read contract.
      const buf = await window.api.readBinaryFile(dir, rel);
      return new Uint8Array(buf);
    },
    async list(relDir: string): Promise<string[]> {
      assertSafe(relDir);
      return window.api.listDir(dir, relDir);
    },
    async mtime(rel: string): Promise<number | null> {
      assertSafe(rel);
      // Read-time baseline for the guarded save (Task 10). Main returns null for
      // a miss (rel-path-safe, no error-log spam) — matching FileAccess.mtime.
      return window.api.fileMtime(dir, rel);
    },
    // Batch read: one round-trip returns bytes + read-time mtime for many files.
    // The classic level read fans out ~18 mandatory files whose per-file awaits
    // are otherwise ~18 serial renderer→main round-trips on the act-load critical
    // path; s1-io calls this to collapse that to one. A missing/unsafe entry
    // resolves with bytes null (the caller decides whether that is fatal).
    async readMany(rels: string[]): Promise<Map<string, { bytes: Uint8Array | null; mtime: number | null }>> {
      for (const rel of rels) assertSafe(rel);
      const entries = await window.api.readManyFiles(dir, rels);
      const out = new Map<string, { bytes: Uint8Array | null; mtime: number | null }>();
      for (const e of entries) {
        out.set(e.relPath, { bytes: e.bytes ? new Uint8Array(e.bytes) : null, mtime: e.mtimeMs });
      }
      return out;
    },
  };
  return fa;
}
