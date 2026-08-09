// save-guard — the pure decision table for the mtime-guarded classic save
// (Task 10 of the disasm-project abstraction, spec §2.6: "refuse on external
// mtime change, no silent clobber"). The main-process guarded-write handler
// (src/main/guarded-write.ts) stats every target file to build `currentMtimes`,
// then asks `planGuardedWrite` whether it is safe to proceed. Kept fs-free and
// in core so the whole decision table is unit-tested without touching disk.
//
// ---------------------------------------------------------------------------
// Conflict semantics (documented exactly; the unit test pins every row)
// ---------------------------------------------------------------------------
// Each file carries `expectedMtimeMs`: the mtime captured when Aurora last READ
// (or last wrote) that file, or `null` if the file did NOT exist at read time.
// `currentMtimes[relPath]` is the file's mtime on disk right now, or `null` when
// it does not currently exist.
//
//   expected = number, current = number, EQUAL      → OK (unchanged since read)
//   expected = number, current = number, DIFFERENT  → CONFLICT (edited externally)
//   expected = number, current = null               → CONFLICT (deleted externally)
//   expected = null,   current = null               → OK (still absent — we create it)
//   expected = null,   current = number             → CONFLICT (appeared externally)
//
// The null/exists rule is the simple, documented one from the task: an expected-
// null file that now exists is a conflict regardless of its contents (we did not
// see it at read, so writing would clobber a file we never knew about).
//
// mtimeMs is a floating-point millisecond stamp; comparison is exact equality.
// Because both sides originate from `fs.stat().mtimeMs` on the same file, an
// untouched file compares equal; any real modification bumps it. `newMtimes`
// returned by a successful write become the next save's `expectedMtimeMs`, so a
// save→save with no external change never spuriously conflicts.
//
// ---------------------------------------------------------------------------
// Conflict check is all-or-nothing (writing is not)
// ---------------------------------------------------------------------------
// The plan is computed across ALL files before any write. If ANY file conflicts
// the caller writes NOTHING and reports the conflict list. This all-or-nothing
// guarantee covers the CONFLICT CHECK only — once the plan is `ok` and writing
// begins, a mid-batch fs error can leave a PARTIAL batch (per-file rename
// atomicity holds; batch atomicity does not). The writer (main/guarded-write.ts)
// reports that partial outcome via `failed`/`unwritten`, not this module.

export interface GuardedFileSpec {
  relPath: string;
  expectedMtimeMs: number | null;
}

export type GuardPlan = { ok: true } | { ok: false; conflicts: string[] };

/**
 * Decide whether a guarded write may proceed. `currentMtimes` maps each file's
 * relPath to its on-disk mtimeMs right now, or null when the file is absent.
 * Returns `{ ok: true }` only when every file is safe to write; otherwise the
 * list of conflicting relPaths (order-preserving, deduped) with `ok: false`.
 */
export function planGuardedWrite(
  files: GuardedFileSpec[],
  currentMtimes: Record<string, number | null>,
): GuardPlan {
  const conflicts: string[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const current = currentMtimes[f.relPath] ?? null;
    if (isConflict(f.expectedMtimeMs, current) && !seen.has(f.relPath)) {
      seen.add(f.relPath);
      conflicts.push(f.relPath);
    }
  }
  return conflicts.length === 0 ? { ok: true } : { ok: false, conflicts };
}

function isConflict(expected: number | null, current: number | null): boolean {
  if (expected === null) {
    // Didn't exist at read: safe only if still absent.
    return current !== null;
  }
  // Existed at read: safe only if still present with the same mtime.
  return current !== expected;
}
