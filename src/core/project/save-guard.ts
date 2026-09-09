// save-guard — the pure decision table for the mtime-guarded classic save
// (Task 10 of the disasm-project abstraction, spec §2.6: "refuse on external
// mtime change, no silent clobber"). The main-process guarded-write handler
// (src/main/guarded-write.ts) probes every target file's current state, then asks
// `planGuardedWrite` whether it is safe to proceed. Kept fs-free and in core so
// the whole decision table is unit-tested without touching disk.
//
// ═══ ONE-MESSAGE-FOUR-CAUSES (lens sweep HIGH, fixed 2026-09-08) ═════════════
//
// This module used to compute the cause and throw it away one line later:
// `isConflict()` returned a BOOLEAN and the loop pushed `f.relPath`. Everything
// downstream therefore had a list of paths and no reason, and all five author-
// facing surfaces (enumerated in ./conflict-message.ts) said the same thing:
//
//     "N file(s) changed on disk since open ... Reload project to pick up
//      external changes."
//
// That sentence is CORRECT FOR ONE OF FOUR ROWS. A file deleted under the author
// did not change, and reloading does not bring it back. A file that APPEARED did
// not change either, and reloading would discard the document being created
// rather than recover anything. And a file Aurora could not STAT is not a claim
// about the disk at all.
//
// THE FOURTH ROW WAS NOT IN THIS TABLE. It was in guarded-write.ts's stat helper,
// whose `catch { return null }` carried the comment "missing (ENOENT) or otherwise
// unstattable → treated as absent". An EACCES/EIO/ELOOP on stat therefore entered
// this table as `current = null` and came out as DELETED EXTERNALLY, a false
// statement about a file that may be sitting there intact. Same family as
// PathProbe and ReadOutcome: "I could not look" and "I looked and there is
// nothing" must not be one value. So the input is now a `CurrentMtime` SENTINEL
// with three states rather than `number | null`, which is what makes the fourth
// cause sayable at all.
//
// ---------------------------------------------------------------------------
// Conflict semantics (documented exactly; the unit test pins every row)
// ---------------------------------------------------------------------------
// Each file carries `expectedMtimeMs`: the mtime captured when Aurora last READ
// (or last wrote) that file, or `null` if the file did NOT exist at read time.
// `current[relPath]` is a CurrentMtime: present with an mtime, absent, or unknown.
//
//   expected = number, current present, EQUAL      → OK (unchanged since read)
//   expected = number, current present, DIFFERENT  → CONFLICT 'changed'
//   expected = number, current absent              → CONFLICT 'deleted'
//   expected = number, current unknown             → CONFLICT 'unknown'
//   expected = null,   current absent              → OK (still absent, we create it)
//   expected = null,   current present             → CONFLICT 'appeared'
//   expected = null,   current unknown             → CONFLICT 'unknown'
//
// The null/exists rule is the simple, documented one from the task: an expected-
// null file that now exists is a conflict regardless of its contents (we did not
// see it at read, so writing would clobber a file we never knew about).
//
// A relPath MISSING from `current` is 'unknown', NOT absent. Nothing said anything
// about that file, and the old `?? null` turned that silence into "it was deleted".
// guarded-write.ts fills every path it is given, so in production this is
// unreachable; it is the tests and any future caller that this protects.
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

/**
 * What the writer found when it looked at a target file, in THREE answers.
 *
 * 'unknown' is the one that had to exist, and its absence was half of
 * ONE-MESSAGE-FOUR-CAUSES: a `number | null` input cannot distinguish "stat says
 * nothing is there" from "stat failed and I have no idea", so an unstattable file
 * was reported to the author as deleted. Callers construct it from their own probe
 * (see `currentMtime` in main/guarded-write.ts); `reason` is REQUIRED on 'unknown'
 * so the message can say what went wrong, on PathProbe's rule.
 */
export type CurrentMtime =
  | { state: 'present'; mtimeMs: number }
  | { state: 'absent' }
  | { state: 'unknown'; reason: string };

/**
 * Why one file blocked the save. The value this module used to compute and drop.
 *
 *   'changed'   it was there when Aurora read it, it is there now, and its mtime
 *               moved. THE ONLY CAUSE FOR WHICH RELOADING IS THE RIGHT ADVICE.
 *   'deleted'   it was there when Aurora read it and is not there now.
 *   'appeared'  it was NOT there when Aurora read it and is there now, so writing
 *               would clobber a file Aurora never saw.
 *   'unknown'   Aurora could not determine its state, so it declined to write over
 *               it. Not a claim about the file.
 */
export type ConflictCause = 'changed' | 'deleted' | 'appeared' | 'unknown';

/** One blocking file and WHY. `reason` carries the probe's text for 'unknown'
 *  (null for the three causes that need no explaining). */
export interface GuardConflict {
  relPath: string;
  cause: ConflictCause;
  reason: string | null;
}

export type GuardPlan = { ok: true } | { ok: false; conflicts: GuardConflict[] };

/**
 * Decide whether a guarded write may proceed. `current` maps each file's relPath
 * to what the writer found on disk right now. Returns `{ ok: true }` only when
 * every file is safe to write; otherwise the conflicts (order-preserving, deduped
 * by relPath) with `ok: false`, EACH CARRYING ITS CAUSE.
 */
export function planGuardedWrite(
  files: GuardedFileSpec[],
  current: Record<string, CurrentMtime>,
): GuardPlan {
  const conflicts: GuardConflict[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.relPath)) continue;
    // A path nobody reported on is UNKNOWN, not absent: see the header.
    const found: CurrentMtime = current[f.relPath]
      ?? { state: 'unknown', reason: `the writer reported no state for '${f.relPath}'` };
    const cause = conflictCause(f.expectedMtimeMs, found);
    if (cause === null) continue;
    seen.add(f.relPath);
    conflicts.push({
      relPath: f.relPath,
      cause,
      reason: found.state === 'unknown' ? found.reason : null,
    });
  }
  return conflicts.length === 0 ? { ok: true } : { ok: false, conflicts };
}

/** The cause, or null when this file is safe to write. */
function conflictCause(expected: number | null, found: CurrentMtime): ConflictCause | null {
  // Could not look. Safe to write is not a conclusion available from here, for
  // EITHER value of `expected`: the file may be present and intact.
  if (found.state === 'unknown') return 'unknown';
  if (expected === null) {
    // Didn't exist at read: safe only if still absent.
    return found.state === 'absent' ? null : 'appeared';
  }
  // Existed at read: safe only if still present with the same mtime.
  if (found.state === 'absent') return 'deleted';
  return found.mtimeMs === expected ? null : 'changed';
}
