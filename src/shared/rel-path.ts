// Rel-path safety: the PREDICATE, and nothing else.
//
// ⚠ THIS HEADER USED TO STATE THE INVARIANT AS THOUGH THIS FILE HELD IT.
// It said the module was "shared by the main-process file IO and the renderer
// FileAccess bridge" and that "a path must never escape the project root. We
// reject absolute paths and any `..` segment outright" — a flat claim about the
// app, written in a file that is one pure function and enforces nothing. A
// predicate can be perfectly correct at every call it is never made from, and
// while that sentence stood the read channel had no guard at all. Three separate
// defects in one night existed because a caller trusted a guarantee the code did
// not make, so what this header says now is where the claim is actually held and
// what checks it, rather than the claim itself.
//
// ═══ WHERE THE INVARIANT LIVES, RE-DERIVED 2026-09-08 ═══
//
// IN THE MAIN PROCESS, and that is now the whole of it. Every `ipcMain.handle`
// in `src/main/ipc-handlers.ts` that takes a project-relative path routes it
// through a primitive in `src/main/file-io.ts`, or through
// `performGuardedWrite` in `src/main/guarded-write.ts` for the batched channel,
// and each of those applies `isRelPathSafe` before touching the filesystem. The
// one export of `file-io.ts` that does not is `listProjectFiles`, which has no
// relative-path argument to guard and instead has to CONTAIN: it composes its
// own paths while walking. This was NOT true until 2026-09-08 — `readBinaryFile`
// carried a written exception and no guard — and the sentence above is a claim
// about today that a reader should re-derive rather than inherit:
//
//   grep -n "ipcMain.handle" src/main/ipc-handlers.ts     the channels
//   grep -n "isRelPathSafe" src/main/file-io.ts src/main/guarded-write.ts
//
// The dialog channels (SELECT_FILES, SAVE_FILE, SELECT_DIRECTORY) are outside
// that population on purpose: the path is the one the user picked, and there is
// no project root for it to escape.
//
// ⚠ AND IT IS CHECKED, WHICH IS THE HALF A HEADER CANNOT DO.
// `src/main/__tests__/file-io-guards.test.ts` drives every primitive with an
// escaping path whose target REALLY EXISTS, beside a control reaching that same
// target legally, so a refusal cannot be an ENOENT wearing the guard's costume;
// and its last row derives the population from `file-io.ts`'s own text, so a new
// export nobody classified fails rather than passing unnoticed. Read that file
// before trusting this one. It is in the `npm test` chain.
//
// ═══ WHAT THE RENDERER SIDE IS, AND IS NOT ═══
//
// `src/renderer/state/classic-file-access.ts` re-checks with `assertSafe` before
// it reaches IPC. It is the ONLY renderer caller of the file surface that does,
// and there are many more that do not — the sprite exporter alone accounts for
// most of them, and it feeds a FREE-TYPED name in as a path segment. That is no
// longer a gap, because main refuses whatever arrives; it is why the renderer
// check is defense in depth and must never be described as the enforcement.
// A guard on one caller of a channel is not a guard on the channel.
//
// ═══ WHY REJECTING EVERY `..` IS SAFE HERE ═══
//
// The bundled profiles are pre-normalized (the s1 profile flattens the INI's
// `../../foo` to `foo`), so no legitimate project path contains `..`; rejecting
// all of them is the safe superset. A read genuinely outside the project passes
// its absolute path in the BASE argument with `''` as the relative one, which
// this predicate calls safe and the guards therefore do not touch.

/**
 * True when `rel` is a safe project-relative path that cannot escape the root:
 * not absolute (no leading `/`, no drive letter, no UNC), and containing no
 * `..` segment. The empty string / `.` denotes the root itself and is safe.
 */
export function isRelPathSafe(rel: string): boolean {
  if (rel === '' || rel === '.') return true;
  // Absolute POSIX, Windows drive (C:\…), or UNC (\\host) paths escape the root.
  if (rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) return false;
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '..') return false;
  }
  return true;
}
