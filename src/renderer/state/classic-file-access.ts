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
// assertSafe below. exists/list use the file:path-probe / file:list-dir
// channels added for this bridge, which ARE guarded on the main side too — so
// those are rejected on both ends.

import type { FileAccess, ReadManyValue } from '../../core/project/adapter';
import { isRelPathSafe } from '../../shared/rel-path';
import type { ReadOutcome } from '../../shared/ipc-types';

/** The four `ReadOutcome`s, as a runtime set: this bridge validates what comes
 *  back over IPC, which no type can do for it. Derived from the type by the
 *  `satisfies` below, so a fifth outcome added to ReadOutcome and not added here
 *  fails to compile. */
const READ_OUTCOMES = new Set(['read', 'absent', 'unreadable', 'refused'] satisfies ReadOutcome[]);

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
    // The absolute root this bridge is rooted at. aeon open records it as
    // config.basePath (via loadS4Config), which the renderer later uses as the
    // root for real IPC file IO — a missing rootDir would silently resolve
    // paths against the main-process cwd (see FileAccess.rootDir in adapter.ts).
    rootDir: dir,
    /**
     * FALSE MEANS KNOWN ABSENT. A probe that could not determine the answer
     * THROWS here rather than answering false, because a caller cannot tell those
     * apart and one of them is safe while the other destroys data.
     *
     * This is the layer the whole MARKUNREADABLE-DEFEATED defect lived in.
     * main's probe used to answer a bare `false` for an EACCES on a parent
     * directory, an ELOOP or an EIO, and this method passed that straight to
     * core, where aeon's markUnreadable reads it as "the file is simply not
     * there", skips marking the section, and lets the next save write an empty
     * placeholder over a file that is present and intact. The three-way probe
     * (PathProbe) is what makes the difference sayable; this throw is what makes
     * it unignorable, since `exists(): Promise<boolean>` has no third value to
     * return and a caller that means to WRITE must not read a guess as a fact.
     */
    async exists(rel: string): Promise<boolean> {
      assertSafe(rel);
      const probe = await window.api.probePath(dir, rel);
      if (probe.presence === 'unknown') {
        throw new Error(`cannot determine whether '${rel}' exists: ${probe.reason ?? 'unknown reason'}`);
      }
      return probe.presence === 'present';
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
    // path; s1-io calls this to collapse that to one. An entry that produced no
    // bytes resolves with bytes null (the caller decides whether that is fatal)
    // AND CARRIES main's `outcome` VERBATIM, which is the field that separates
    // absence from a permissions failure from a refusal. Dropping it here was
    // half of FABRICATED-ENOENT: see ReadOutcome in shared/ipc-types.
    //
    // Note the `assertSafe` loop above pre-empts main's own 'refused' answer for
    // callers of THIS bridge (it throws before the IPC), so 'refused' arrives here
    // only if that guard is ever relaxed. It is still carried and still rendered,
    // because a value whose producer can emit it and whose consumer cannot say it
    // is how the first version of this went wrong.
    async readMany(rels: string[]): Promise<Map<string, ReadManyValue>> {
      for (const rel of rels) assertSafe(rel);
      const entries = await window.api.readManyFiles(dir, rels);
      const out = new Map<string, ReadManyValue>();
      for (const e of entries) {
        // LOUD ABOUT AN ENTRY WITH NO VERDICT, because the compiler cannot be
        // here. `window.api` is injected, so a test double or an out-of-date
        // preload that still returns the pre-2026-09-08 `{relPath, bytes,
        // mtimeMs}` shape typechecks fine and would arrive with `outcome`
        // undefined — which would fall into the failure branch and render a
        // sentence for a cause nobody stated. That is the same class of silence
        // the whole fix is about, so it fails here by name instead.
        if (!READ_OUTCOMES.has(e.outcome)) {
          throw new Error(
            `file:read-many returned an entry for '${e.relPath}' with no outcome `
            + `(got ${JSON.stringify(e.outcome)}). Expected one of `
            + `${[...READ_OUTCOMES].join(', ')}; see ReadOutcome in shared/ipc-types.`,
          );
        }
        // Branched, not spread: the union is discriminated on `outcome`, so an
        // object literal carrying a nullable `bytes` fits neither member. The
        // friction is the feature (it is what a consumer inherits).
        out.set(e.relPath, e.outcome === 'read'
          ? { bytes: new Uint8Array(e.bytes), mtime: e.mtimeMs, outcome: 'read', reason: null }
          : { bytes: null, mtime: null, outcome: e.outcome, reason: e.reason });
      }
      return out;
    },
  };
  return fa;
}
