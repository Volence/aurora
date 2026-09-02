# The Python resolver twin has no test file at all — booked, not built

*Written 2026-09-02T09:56:54Z by the aurora overseer while O74 (the main-checkout step-3 row)
was in flight. This is a **booking with a measurement**, not a parcel. It exists as a
committed artifact because the commitment it records was also made in cross-lane mail, and
mail does not survive a `/clear` (shared protocol bar 20, sending-side half).*

## The measurement

Aurora resolves a sibling suite checkout through **two** twins:

- `test/support/sibling-root.mjs` — the JavaScript one. 38 rows in
  `test/support/sibling-root.test.ts`, plus the worktree-bed step-3 proof (O68) and the
  main-checkout proof (O74, in flight as this is written).
- `scratchpad/lib/suite_paths.py` — the Python one, used by the `scratchpad/*.py`
  instruments.

**The Python twin has no test file.** Enumerated over the whole tree rather than by
guessing a filename — every path mentioning `suite_paths` outside `node_modules`, `.git`
and the agent worktrees:

```
.gitignore
scratchpad/dump-region.py
scratchpad/bg-override-live-shape-refusal-probe.py
scratchpad/find-curved-slope.py
scratchpad/bganim-promoted-vs-aeon-injector.py
scratchpad/lib/suite_paths.py
scratchpad/handover/aeon-section-fit.py
scratchpad/handover/aeon-banks-move.py
docs/OVERSEER.md
docs/lane-log.jsonl
docs/ROADMAP.md
scripts/check-peer-path-literals.mjs
```

Six consumers, the module itself, three docs, one gate. **No test, in any language, at any
path.** So it has a step-3 row in neither configuration — not the linked-worktree one, not
the main-checkout one.

## Why this is not urgent, and why it is still a hole

`suite_paths.py:211` already passes `--path-format=absolute`, so the twin is **immune to
the cause** of sigil's defect (a lexically-trimmed `--git-common-dir`, which returns three
different shapes depending on whether you ask from a main-checkout root, a main-checkout
subdirectory, or a linked worktree). That immunity was measured by the hub across the suite
and holds here.

**But immunity measured by reading is not immunity a change can be tested against.** The
flag is one edit from being dropped, and nothing in this repo would go red — the JS twin's
rows do not execute a line of Python.

## The shape it belongs to, which is the reason to write it down

Four lanes hit **the same disjoint-population failure** on 2026-09-02, inside about one
hour:

1. **sigil** — both branch sweeps green because agents run in worktrees, so the failing
   configuration was in no sweep's population; the merged tree went red.
2. **aurora** (this lane) — 38/38 resolver rows green with a mutation planted that produced
   the same observable, because the step-3 row asserted the source-string **prefix** and
   never the result.
3. **aeon** — their walk row measured against **no bed at all** (the runner's own
   directory), so both depths passed with neither actually chosen.
4. **this file** — the flattest instance of the four: the population is **empty**. There is
   no row to be blind, no bed to be wrong, and nothing announces it, because a module with
   no test contributes no skip, no failure and no line to any suite total.

Instances 1-3 all produce a green artifact that looks like coverage. This one produces no
artifact at all, which is bar 16(d)'s absence surface: *a failing command and an empty
world produce the same output.*

## What would close it

A Python test bed that builds its own scratch checkout the way
`sibling-root.test.ts`'s step-3 rows build theirs — the bed **chosen by the row**, the
expectation **derived from the bed**, and a red-first plant that drops
`--path-format=absolute` from `suite_paths.py:211` and requires red. Held out of O74 on
scope: after a night of merge seams, land a small verified thing rather than a large one.

⚠ **Do not describe that plant as "sigil's bug" — it is not, and calling it that is a
mistake this lane made in a dispatch brief and had corrected by the hub within minutes.**
Sigil's defect was resolving git's **relative** output against the process cwd instead of
against the directory git ran in. Dropping the flag is a **different mechanism producing
the same class of observable**. The distinction has teeth at exactly the moment it matters:
if such a plant comes back GREEN, one live reading is that *the mutation was harmless
because this resolver never had that defect* — a reading absent from the usual three
blind-row causes, and one that would otherwise send someone to "fix" a row that was already
right. It is discriminating in the JS twin only because `sibling-root.mjs:487` derives the
root with a purely lexical `dirname(dirname(common))` and resolves the string against
nothing, so a relative `common` can only ever yield a relative root (`.git` → `.`;
`../../.git` → `..`). Verify the Python twin's arithmetic the same way before assuming the
plant discriminates there too.

**Related and separate:** the two twins also disagree on which environment aliases they
accept — `sibling-root.mjs:190` takes `AEON_ROOT`, `suite_paths.py:103` does not — so a JS
instrument handed that variable resolves and a Python one refuses. Booked separately (O73);
whichever way it is settled it needs a row that fails when the two lists diverge, and that
row has nowhere to live in Python until this one exists.

## The commitment this file discharges

Sent to the hub in the same minutes: the row name and merge SHA for O74 when it lands, and
this gap booked rather than left in mail.
