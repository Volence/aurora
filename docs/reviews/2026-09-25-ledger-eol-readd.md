# LEDGER-EOL-READD: a same-commit identical re-add is not an appearance

Branch `parcel/ledger-eol-readd`, based on master `7fbe3a68`. The pending lane-log commit
`769aafb2` (`pending/lane-log-art-brush`) is NOT on this branch. It was only checked out,
detached, to reproduce the defect and to prove the fix.

## Defect

`62bfcd6d` appended the lane-log entry `"at": "2026-09-19T01:32:37Z"` without a trailing
newline. At `7fbe3a68` the last byte of `docs/lane-log.jsonl` is `}` (0x7d), not `\n`.
Any later append then shows that untouched line as `-L` / `\ No newline at end of file` /
`+L` in its diff. `scratchpad/ledger-timestamp-audit.py` read every `+` line as an
appearance, so the 09-19 entry counted as a second in-scope appearance of its own stamp.

Red on `769aafb2` with the audit as it stood (`npm run check:ledger-timestamps`, exit 1):

```
  2026-09-19T01:32:37Z  first 62bfcd6d  again 769aafb2  Our own test gate was reporting on another lane's work, and it is now fe [BOTH APPEARANCES IN SCOPE]
TWO IN-SCOPE ENTRIES SHARE ONE STAMP (1) ...
  2026-09-19T01:32:37Z  62bfcd6d then 769aafb2  Our own test gate was reporting on another lane's work, and it is now fe
check-ledger-timestamps: FAIL: 1 of 2 ledger(s) did not pass:
  docs/lane-log.jsonl: exit 1: see the sections above.
```

## Fix

In `collect()`, each commit's diff is read twice. The first pass builds a multiset of `-`
line contents. In the second pass, a `+` line whose exact content (diff marker stripped) is
still in that multiset uses up one copy and is skipped as a re-add rather than an
appearance.

- **One-to-one, not a set.** If one commit turns one L into two, the extra copy still
  counts as an appearance and still collides (K8d). Pairing by set would cancel both copies
  and pass silently, which was measured (M2 below).
- **Never across commits.** The multiset is rebuilt for every commit. A line removed in
  one commit and restored in a LATER one is still an appearance, so K6h stays red
  (measured, M4 below).
- **Only whole-line equality pairs.** An in-place edit that changes any byte, including
  `at`, pairs with nothing and is judged as before (K8c, and K6c already).
- **Counted on every run.** Every run prints a `SAME-COMMIT RE-ADDS: N ... NOT treated as
  appearances; M of them in scope` line per ledger, including when N is 0. On aurora's full
  history the count is 0 at master and 1 at `769aafb2`, the 09-19 line. No earlier
  commit in either ledger held such a pair, so no historical verdict moves.
- The audit's LIMITS section records the rule.

Side effect, stated: a pure move of a line inside one commit is also no longer booked as a
duplicate. Before this change, a move of an in-scope line would have failed as "TWO
IN-SCOPE ENTRIES" even though no stamp was new. It is the same category of false alarm.

## Canaries (`scripts/check-ledger-timestamps.mjs`)

The bed gained `noEol: true`, which writes a commit's file without its trailing newline.
There are four new cases and one new exercised rule, `same-commit-readd`. The runner now
has 21 cases covering 9 rules, up from 17 and 8.

| case | shape | expect |
|---|---|---|
| K8a | bare-EOF entry, then one honest append | exit 0, `2 entries IN SCOPE`, `SAME-COMMIT RE-ADDS: 1` |
| K8b | same, appended entry stamped 20 min early | exit 1, OVER THRESHOLD naming it |
| K8c | bare-EOF entry edited in place to a remembered stamp | exit 1, OVER THRESHOLD, `RE-ADDS: 0` |
| K8d | bare-EOF line kept AND a byte-identical copy appended | exit 1, `TWO IN-SCOPE ENTRIES SHARE ONE STAMP (1)` |

## Red-first (invariant 8)

The baseline is committed at `8c8fc4e8`. Each mutation was planted on disk, and `git diff`
was shown before the run. Each run went through `npm run check:ledger-timestamps`. After
each run the files were restored with `git show HEAD:<path> > <path>` and `git status
--short` was confirmed empty.

- **M1: the pre-fix audit.** Planted with `git show 7fbe3a68:scratchpad/ledger-timestamp-audit.py`.
  K8a goes red: `exit 1, expected 0; missing "SAME-COMMIT RE-ADDS: 1 "; ... must not
  contain "TWO IN-SCOPE ...`, and the bed prints `first 5fdc5a70 again ed3e3986 canary entry
  no-eol [BOTH APPEARANCES IN SCOPE]`. That is the real defect, reproduced in the bed.
- **M1 plus K8a removed from CASES** (a second plant, in the mjs). K8b goes red:
  `missing "SAME-COMMIT RE-ADDS: 1 "; must not contain "TWO IN-SCOPE ENTRIES SHARE ONE STAMP"`.
- **M2: pairing by set.** The line `removed[...] -= 1` is deleted. K8d goes red with
  `exit 0, expected 1`, a silent green, while K1-K8c pass ahead of it.
- **M3: pairing keyed on the headline.** Existing K6c goes red first, so this mutation does
  not isolate K8c.
- **M3b: the naive positional EOF fix.** The first `+` after a `-` line followed by a `\`
  marker counts as its re-add, whatever its content. K8c goes red with `exit 0, expected
  1; missing "OVER THRESHOLD (1)"`, while K6c and K8a/K8b pass ahead of it. K8c
  therefore catches a mutation K6c cannot.
- **M4: the multiset is not reset per commit** (cross-commit pairing). K6h goes red:
  `missing "TWO IN-SCOPE ENTRIES SHARE ONE STAMP (2)"`. K6h still guards the behaviour the
  header keeps.

Green after restore: 21 canaries, exit 0.

## The pending content, with the fix

`769aafb2` was checked out detached, with the audit and gate from `8c8fc4e8` laid over it.
`npm run check:ledger-timestamps` then exits 0 with `SAME-COMMIT RE-ADDS: 1 ...; 1 of them
in scope` and `Nothing wrong with the 385 entries in scope`. The master tree has 384 in
scope, so the new 09-25 entry is judged, not swallowed. No line of `docs/lane-log.jsonl`
or `docs/decisions.jsonl` was edited.

## `npm test` on `8c8fc4e8`

```
check-ledger-timestamps: 21 canary case(s) ran first, ... covering 9 failure rule(s) ...
 Test Files  654 passed | 3 skipped (657)
      Tests  10296 passed | 9 skipped (10305)
```

Exit 0. The first full run was red: 233 failures in 12 files, all `Cannot read properties
of null (reading 'useCallback')`. I caused that myself: a doubled `cp -al` had nested
`node_modules/node_modules` inside the worktree, which gave the tests two copies of React.
The same two files failed the same way on master `7fbe3a68` in this worktree (169 of 177).
After removing the nested copy they passed on master (177 of 177), and the full run above
followed.

## Open

- The bare EOF in `docs/lane-log.jsonl` stays in place. Appending restores a trailing
  newline only if the writer adds one. Whatever appends should write `\n` after each entry,
  but nothing enforces that, and after this fix nothing needs to.
- The audit still skips `\ No newline` marker lines only because they do not start with `+`
  or `-`, which is the unchanged behaviour.
