// read-failure — THE ONE PLACE a batch read with no bytes becomes a sentence.
//
// ═══ WHAT THIS EXISTS TO STOP (FABRICATED-ENOENT, lens sweep HIGH, 2026-09-08) ═══
//
// Two consumers of `FileAccess.readMany` had each typed this out by hand:
//
//     throw new Error(`ENOENT: no such file or directory, open '${p}'`)
//
// (`readBytes` in core/level-classic/s1-io.ts, `readOne` in
// renderer/state/classicObjectArtStore.ts). The value they were reacting to was a
// bare `bytes: null` produced by main/file-io.ts's `readManyFiles`, whose
// `catch { return ... null }` folded together an ENOENT, an EACCES, an EISDIR, an
// EIO and a path Aurora had REFUSED to resolve. So a level whose tile file the
// author could not read, and a path that escaped the project root, both told the
// author the file did not exist. One of those sends someone looking for a missing
// file that is sitting right there.
//
// Both sites had copied the sentence from `unwrapBinaryRead` in shared/ipc-types,
// where it is CORRECT: main/ipc-handlers.ts only produces the marker it unwraps
// under `if (e?.code === 'ENOENT')`. The copies took the message and left the gate
// behind. That is the whole defect, in one line, twice.
//
// ═══ WHY A FUNCTION AND NOT A COMMENT ═══
//
// The fix that lasts is the one a forgetful caller cannot skip. `outcome` is a
// REQUIRED field on the producer's value (ReadOutcome, shared/ipc-types), so the
// dangerous default is no longer reachable by omission; and this function's
// parameter is `ReadFailureOutcome`, which does not include 'read', so a caller
// has to have established that there are no bytes before it can ask for a message.
// A third consumer of readMany gets the right sentence by calling this, and cannot
// get the wrong one by copying a string.
//
// ═══ THE ONE TRUE ENOENT ═══
//
// 'absent' still emits the ENOENT sentence, unchanged and deliberately: that is a
// real ENOENT, callers (and their tests) match on it, and Node's own wording is
// what an author pasting the message into a search engine wants. The fix is not
// "stop saying ENOENT"; it is "say it only when it is true".
//
// Kept fs-free and in core because both consumers are on opposite sides of the
// renderer seam and neither should own the wording.

import type { ReadFailureOutcome } from '../../shared/ipc-types';

/**
 * The message for a project-relative path that produced no bytes. `outcome` is
 * the producer's required verdict; `reason` its errno/refusal text (null when
 * there is nothing to add).
 *
 * Each of the three says something only it says, which is also what makes a test
 * of one of them non-vacuous:
 *   absent      "ENOENT: no such file or directory"  (a true ENOENT)
 *   unreadable  "could not be read"                  + the errno
 *   refused     "refused to read"                    + the refusal
 */
export function readFailureMessage(
  relPath: string, outcome: ReadFailureOutcome, reason: string | null,
): string {
  const because = reason ? `: ${reason}` : '';
  switch (outcome) {
    case 'absent':
      // The genuine article. Node's own spelling, so it reads like every other
      // missing-file error in the app and in the terminal.
      return `ENOENT: no such file or directory, open '${relPath}'`;
    case 'unreadable':
      // IT IS (OR MAY BE) THERE. Never the ENOENT sentence: this is the case that
      // sent an author hunting for a file that had not moved.
      return `'${relPath}' could not be read${because}`;
    case 'refused':
      // Aurora declined to resolve the path at all, which is not a claim about
      // what is on disk. Matches the refusal vocabulary main/file-io.ts already
      // uses for the write and delete channels.
      return `refused to read '${relPath}'${because}`;
  }
}

/** `readFailureMessage` as a thrown Error, for the two call sites that throw. */
export function readFailureError(
  relPath: string, outcome: ReadFailureOutcome, reason: string | null,
): Error {
  return new Error(readFailureMessage(relPath, outcome, reason));
}
