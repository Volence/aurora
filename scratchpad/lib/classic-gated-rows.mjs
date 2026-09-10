// ═══════════════════════════════════════════════════════════════════════════
// THE CLASSIC-GATED ROWS — one enumeration, consumed by BOTH arms of the gate
// ═══════════════════════════════════════════════════════════════════════════
//
// HARNESS-ROWS-VANISH-ON-UNSET-GATE (docs/lens-findings.jsonl, 2026-09-10):
//
//     "rows disappear entirely when CLASSIC_DIR is unset, and the run reports
//      13/14 PASS - 1 UNMEASURABLE, so a reader concludes every question was
//      asked."
//
// The finding said FOUR rows. SEVEN ids are reachable only through the gate's
// measuring branch, and SIX QUESTIONS are lost. Read off the two captured logs
// in `docs/captures/2026-09-10-save-surface-verdicts/`, which are the same
// build run twice: `panels-harness-with-classic.log` prints
//
//     S3a  S3b  S2a1  S2a2  S2a3  S2b  S3c
//
// and `panels-harness-classic-unset.log` prints ONE row, `S3`. The finding
// counted the four `S2*` ids and missed `S3a` and `S3b`. The seventh id, `S3c`,
// WAS represented: the refusing arm's `S3` carried the identical row name, so
// it stood in for `S3c` under a different id, which is why two logs of the same
// build could not be diffed by id. 20 - 14 = 6 questions lost; the finding's
// remedy line ("the totals move from 14 to 18") is short by two.
//
// THE TARGET IS 14 -> 20: the SAME total in both configurations, the difference
// visible as UNMEASURABLE rather than as arithmetic. That is 13 PASS and SEVEN
// UNMEASURABLE, not six: the S3/S3c row was always one of the unmeasurables and
// stays one, it just stops being the only one.
//
// `S3a` AND `S3b` GET THEIR OWN REFUSAL TEXT rather than sheltering under the
// `S3` sentence, because the measuring branch asks them as separate questions
// with separate verdicts, and a reader diffing two runs has to see the same id
// set on both sides or the diff is not a diff.
//
// ═══ WHY THE LIST LIVES HERE AND NOT IN THE HARNESS ═══════════════════════
//
// The hazard being fixed is not "four rows were missed once". It is that the
// two arms of one `if` each carry their own idea of which rows exist, so they
// drift the moment somebody adds a row to the measuring arm. A list in this
// module is consumed by the refusing arms AND read by
// `test/harness-classic-gated-rows.test.ts`, which extracts every `check('id'`
// literal from the measuring branch's own source and asserts set equality. Add
// a row to the harness without adding it here and that test goes red naming
// the id; the gate is derived from the source it guards, never from a belief
// about it.
//
// ⚠ WHAT THE GATE STILL CANNOT SEE. It reads ids and names out of SOURCE. It
// cannot tell whether a row's reason is TRUE, and it cannot run the harness
// (Electron under xvfb-run over CDP, which is foreground work). A row whose
// `cannot` sentence describes the wrong inability would pass every assertion
// in this repo.

/**
 * Every row the CLASSIC_DIR gate's measuring branch can emit, in the order the
 * measuring branch emits them.
 *
 *   `id`     the row id, identical on both arms so two logs diff cleanly.
 *   `name`   the QUESTION. Must be the measuring branch's own name for this id,
 *            or a prefix of it (the test asserts that; `S2b` is measured under
 *            a longer name on its live path).
 *   `cannot` a standalone clause saying what THIS row could not ask. Composed
 *            after the arm's own `because`, so it must read as a consequence.
 *   `whenNoClassicDir` an extra sentence only the CLASSIC_DIR arm appends. It
 *            exists to carry the trap prose the original `S3` row was praised
 *            for, which is about CLASSIC_DIR specifically and would be a
 *            non-sequitur on the two inner arms.
 */
export const CLASSIC_GATED_ROWS = [
  {
    id: 'S3a',
    name: 'the COPIED classic project is open',
    cannot: 'there was no classic project directory to open, so this row could not ask '
      + 'whether one opened.',
  },
  {
    id: 'S3b',
    name: 'an act is open on the classic side (the subject for the save)',
    cannot: 'no act could be opened on the classic side, so the save had no subject.',
  },
  {
    id: 'S2a1',
    name: 'the debug door made a real LEVEL edit through the app\'s own commit path',
    cannot: 'there was no classic document for the debug door to edit through the app\'s own '
      + 'commit path.',
  },
  {
    id: 'S2a2',
    name: 'ANTI-VACUOUS: a real BYTE changed in the document, read back out of it',
    cannot: 'nothing could be dirtied, so no changed byte could be read back out of a classic '
      + 'document.',
  },
  {
    id: 'S2a3',
    name: 'and the APP agrees on screen: the chip\'s tooltip flips to the Ctrl+S one',
    cannot: 'no classic level header was on screen, so its Save chip\'s tooltip could not be '
      + 'read before or after.',
  },
  {
    id: 'S2b',
    name: 'Ctrl+S on a dirty level tab flashes `Saved!` ON THE CHIP',
    cannot: 'there was no dirty classic level document, so Ctrl+S had nothing to save and the '
      + 'chip had no reason to flash.',
  },
  {
    id: 'S3c',
    name: 'a classic save\'s success toast NAMES the files it wrote',
    cannot: 'no classic save was raised, so the toast that would name the files it wrote never '
      + 'appeared. This is a limit of the harness\'s reach, NOT evidence about the toast.',
    whenNoClassicDir: 'Without a classic project there is no classic toast to raise at all, and '
      + 'a green from the aeon toast would be about a different sentence (`Project saved`, which '
      + 'deliberately names no files).',
  },
];

/** The ids, in emission order. */
export const CLASSIC_GATED_IDS = CLASSIC_GATED_ROWS.map((r) => r.id);

/**
 * The `because` clause for the CLASSIC_DIR arm, naming the variable and which
 * of its two failure modes fired. `dir` is the raw env value or null/''.
 */
export function classicDirClause(dir) {
  return `CLASSIC_DIR ${dir ? `(${dir}) does not exist` : 'is unset'}`;
}

/**
 * Build the UNMEASURABLE rows one refusing arm owes its reader.
 *
 * @param because  what went wrong, as a clause. The CLASSIC_DIR arm passes
 *                 `classicDirClause(...)` so every reason NAMES the variable.
 * @param only     ids this arm suppresses, when it is not all of them. THROWS
 *                 on an id not in the table rather than quietly emitting fewer
 *                 rows, which is the defect this module exists to end.
 * @param dirTail  append each row's `whenNoClassicDir`. Only the CLASSIC_DIR
 *                 arm passes true.
 */
export function classicGatedRefusals(because, { only = null, dirTail = false } = {}) {
  if (typeof because !== 'string' || because.trim() === '') {
    throw new Error('classicGatedRefusals: a refusal with no reason is the defect, not the fix');
  }
  if (only) {
    const unknown = only.filter((id) => !CLASSIC_GATED_IDS.includes(id));
    if (unknown.length) {
      throw new Error(`classicGatedRefusals: unknown row id(s) ${unknown.join(', ')} — `
        + `the table has ${CLASSIC_GATED_IDS.join(', ')}`);
    }
  }
  return CLASSIC_GATED_ROWS
    .filter((r) => !only || only.includes(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      detail: `${because} — ${r.cannot}`
        + (dirTail && r.whenNoClassicDir ? ` ${r.whenNoClassicDir}` : ''),
    }));
}
