# HARNESS-ROWS-VANISH-ON-UNSET-GATE — the refusing arm now names every row it suppresses

Branch `parcel/harness-suppressed-rows`. Subject:
`scratchpad/cdp-sweep-panels-harness.mjs`.

---

## 1. The finding, and where its count was wrong

The ledger row (`docs/lens-findings.jsonl`, `2026-09-10T09:23:08Z`) said **four**
rows disappear when `CLASSIC_DIR` is unset, and that the remedy moves the totals
line **14 -> 18**.

Both numbers are wrong, and the finding **undercounts**. Derived from the
harness source and reconciled against the two committed logs in
`docs/captures/2026-09-10-save-surface-verdicts/`:

| | rows | ids in the classic block |
|---|---|---|
| `panels-harness-classic-unset.log` | `13/14 PASS · 0 FAIL · 1 UNMEASURABLE` | `S3` |
| `panels-harness-with-classic.log` | `20/20 PASS · 0 FAIL · 0 UNMEASURABLE` | `S3a S3b S2a1 S2a2 S2a3 S2b S3c` |

**SEVEN ids are reachable only through the gate's measuring branch. SIX
questions were lost.**

* The finding named the four `S2*` ids and **missed `S3a` and `S3b`**.
* The seventh, `S3c`, *was* represented: the refusing arm's single `S3` carried
  `S3c`'s exact row name ("a classic save's success toast NAMES the files it
  wrote"), so it stood in for `S3c` **under a different id**. That is why two
  logs of the same build could not be diffed by id at all.
* `20 - 14 = 6`, so the remedy line is short by two.

**The target is 14 -> 20**: the *same* total in both configurations, with the
difference visible as `UNMEASURABLE` rather than as arithmetic.

### A correction to the controller's own reconciliation

The overseer's foreground control (two fresh runs, 2026-09-10) reproduced the
captured logs exactly and independently arrived at "six rows, not four", which
this parcel agrees with. One number in that message is off by one: it named the
expected AFTER as *"20/20 rows with six UNMEASURABLEs"*. It is **seven**. The
non-classic block contributes exactly 13 rows, so `20 - 13 = 7` — the `S3`/`S3c`
row was always one of the unmeasurables and stays one; it just stops being the
only one. The expected totals line is

```
════ 13/20 rows PASS · 0 FAIL · 7 UNMEASURABLE · <secs>s ════
```

That holds under either design (keep `S3` and add six, or emit all seven), so
the correction is about the arithmetic, not about which design was taken.

---

## 2. A second instance of the same defect, one level in

Found while enumerating, not looked for. The
`if (!ps || ps.status !== 'open')` arm inside the measuring branch:

* emitted **`S3b` alone** and dropped `S2a1`, `S2a2`, `S2a3`, `S2b`, `S3c` —
  **five rows**, the identical shape; and
* emitted that `S3b` **under `S3c`'s question** ("a classic save's success toast
  NAMES the files it wrote") rather than `S3b`'s own ("an act is open on the
  classic side"). One id carried two different questions depending on which path
  reached it, so a reader could not tell from a log which question `S3b`
  answered.

Both are fixed here, by the same table.

Two further arms inside the measuring branch — `openedAct !== 'ok'` and
`dirtyNow !== true` — were checked and are **already complete**: each emits
every id downstream of it, with row-specific prose. They are left untouched on
purpose.

---

## 3. What changed

| file | what |
|---|---|
| `scratchpad/lib/classic-gated-rows.mjs` | NEW. One enumeration of the seven classic-gated rows, consumed by both refusing arms. |
| `scratchpad/lib/classic-gated-rows.d.mts` | NEW. Signature only, so `tsc --noEmit` can see it with `allowJs` off (the `fixture-provenance.d.mts` pattern). |
| `scratchpad/cdp-sweep-panels-harness.mjs` | Both refusing arms now route through `refuseClassicRows(...)`. |
| `test/harness-classic-gated-rows.test.ts` | NEW. The anti-drift gate. |

### The shape that prevents drift

Each row carries a `cannot` clause saying what **that row** could not ask; the
arm supplies the `because`. So the `CLASSIC_DIR` arm composes
`CLASSIC_DIR is unset — <cannot>`, and **every reason names the variable**,
while the inner arm composes `the classic project did not open — <cannot>` from
the same table.

`classicGatedRefusals` **throws** on an unknown id and on an empty reason,
rather than emitting fewer rows — a builder that silently skipped an id would
reintroduce the finding inside the fix.

### Prose that was deliberately preserved

The `S3` row's trap sentence — *a green from the aeon toast would be about a
different sentence (`Project saved`, which deliberately names no files)* — is
kept verbatim as `S3c`'s `whenNoClassicDir` tail, appended **only** by the
`CLASSIC_DIR` arm, where it is not a non-sequitur. The test asserts it survives
and that it appears on exactly one row (pasting it onto six siblings would make
the reasons interchangeable, which is the thing being fixed).

### The one thing a log-diffing reader will notice

**The refusing arm's id changed from `S3` to `S3c`.** It is the same question
the measuring branch asks under `S3c`, and two ids for one question is what made
the two logs undiffable. The alternative — keep `S3` and add six siblings —
gives the identical totals but leaves the two id sets permanently different.

### Judgement taken on `S3a`/`S3b`

The controller flagged as open whether `S3a`/`S3b` deserve their own refusal
text or should shelter under the existing `S3` sentence. **They get their own.**
The measuring branch asks them as separate questions with separate verdicts, and
a reader diffing two runs has to see the same id set on both sides or the diff
is not a diff.

---

## 4. The gate, and the four plants that reddened it

`test/harness-classic-gated-rows.test.ts`, run by **`vitest run` inside
`npm test`**. It brace-matches the `CLASSIC_DIR` gate out of the harness source
with a scanner that understands `'`, `"`, template literals including nested
`${}`, and both comment forms; extracts every `check('id'` literal from the
**measuring** branch; and asserts set equality against the table. Seven rows:

1. both arms of the gate can be bracketed, and the measuring branch is
   non-trivial (loud on unmeasurable: an empty branch would make rows 2 to 4
   vacuously true);
2. the measuring branch's ids are **exactly** the enumerated ones;
3. the refusing arm hand-rolls no `check(` of its own;
4. every table `name` is a prefix of the measuring branch's own name for that id
   (prefix, because `S2b` is measured under a longer name on its live path);
5. every `CLASSIC_DIR` refusal names the variable, and the trap sentence lives
   on exactly one row;
6. the builder throws on an unknown id and on an empty reason;
7. ANTI-VACUOUS: an extra row planted into a mutated copy of the source is
   reported, and the unplanted source is clean.

### Red-first, each restored from the committed baseline `07da15bd`

| plant | mutation, quoted from disk | result |
|---|---|---|
| 1 | `check('S2c', 'a planted eighth question nobody enumerated', true);` at `:515`, inside the else | **2 failed / 5 passed**. Row 2 red: `+ "S2c"` |
| 2 | `check('S3c', 'a hand-rolled row that drifted', 'UNMEASURABLE', 'no reason');` at `:510`, inside the refusing arm | **1 failed / 6 passed**. Row 3 red: `expected [ 'S3c' ] to deeply equal []` |
| 3 | `check('S3a', 'the classic project opened somewhere', ...)` at `:515` | **1 failed / 6 passed**. Row 4 red: `S3a: source says "the classic project opened somewhere", table says "the COPIED classic project is open"` |
| 4 | the `S3b` entry deleted from the table in `classic-gated-rows.mjs` | **3 failed / 4 passed**, including `Error: classicGatedRefusals: unknown row id(s) S3b` — the harness itself would crash loudly rather than emit six rows |

None went green-and-applied. Plant 4 covers the drift direction plants 1 to 3 do
not: a row removed from the **table** rather than added to the **source**.

### The extractor's one named hazard

It does not understand regular-expression literals, so a future regex containing
an unbalanced brace inside the gate would break the bracketing. That failure is
**loud** (the test goes red saying it could not bracket the block), never a
silent green. That is the only property that matters for a gate, and it is
stated in the test's own header rather than left for a reader to discover.

---

## 5. ⚠ WHICH CLAIMS NEVER OBSERVED THE HARNESS RUN

**All of them.** Not one assertion in this parcel has seen
`cdp-sweep-panels-harness.mjs` execute. It launches Electron under `xvfb-run`
over CDP, which is the controller's foreground work and a hard constraint on
this seat. Every claim above is either a **source scan** or a **pure function
call**.

Specifically **NOT PROVEN from here**:

* that the totals line actually reads `13/20 rows PASS · 0 FAIL · 7 UNMEASURABLE`
  with `CLASSIC_DIR` unset;
* that the seven `UNMS` lines print in the order the table declares;
* that the refactor did not break the measuring branch — the with-`CLASSIC_DIR`
  path is untouched by this parcel except for the inner arm it never enters when
  the project opens, but **untouched is an argument, not a run**;
* that `classicDirClause` renders correctly against a real path in the
  `CLASSIC_DIR`-set-but-missing case (the second of its two failure modes has
  been exercised only as a unit call, never as a run).

The BEFORE numbers are **not** re-derived here. They are cited from
`docs/captures/2026-09-10-save-surface-verdicts/` and independently reproduced
by the controller's two foreground runs on master.

---

## 6. TAG FOR THE FOREGROUND — exact commands and expected difference

Two complete runs, nothing stitched, on this branch's tree after a build.

```bash
# build first, as the harness header requires
VITE_AURORA_DEBUG=1 npx electron-vite build

# RUN A — the gate refusing
AEON_DIR=<writable copy of an aeon project> \
AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<an electron> \
node scratchpad/cdp-sweep-panels-harness.mjs

# RUN B — the control, the gate measuring
AEON_DIR=<writable copy of an aeon project> \
CLASSIC_DIR=<writable copy of a classic project> \
AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<an electron> \
node scratchpad/cdp-sweep-panels-harness.mjs
```

### Expected

**RUN A** (`CLASSIC_DIR` unset), exit 0:

```
════ 13/20 rows PASS · 0 FAIL · 7 UNMEASURABLE · <secs>s ════
```

ids, in order:

```
0a 0b P4a P4b P4c P5a P5b S1 P6a P6b P7a P7b P7c   <- 13 PASS, unchanged
S3a S3b S2a1 S2a2 S2a3 S2b S3c                      <- 7 UNMS, all new but S3c
```

`S3` **must not appear.** Every one of the seven `UNMS` details must contain the
string `CLASSIC_DIR`.

**RUN B** (`CLASSIC_DIR` set), exit 0: **unchanged from the committed BEFORE** —

```
════ 20/20 rows PASS · 0 FAIL · 0 UNMEASURABLE · <secs>s ════
0a 0b P4a P4b P4c P5a P5b S1 P6a P6b P7a P7b P7c S3a S3b S2a1 S2a2 S2a3 S2b S3c
```

Run B is the row that matters most: it is the control proving the refactor did
not disturb the measuring path.

### The difference, stated as one sentence

**The row count stops moving.** Before: 14 vs 20. After: 20 vs 20, with the six
lost questions visible as `UNMEASURABLE` and the seventh (`S3c`) finally
carrying the same id on both sides.

**If the foreground produces a different number, that is a finding, not a
mistake — it should be reported against this packet rather than reconciled to
it.**

---

## 7. Left open

* **The foreground confirmation above.** Outstanding; the ledger line closing
  this row says so.
* **Name drift is guarded by prefix, not equality.** `S2b` is deliberately
  measured under a longer name on its live path, so a future row that *shortens*
  a measured name below the table's would go red correctly, but a row that
  *lengthens* it silently passes. Equality was rejected rather than forcing the
  two `S2b` names to match, which would have flattened a deliberate distinction.
* **The gate cannot tell whether a reason is TRUE.** A `cannot` sentence
  describing the wrong inability passes every assertion in this repo. Only a
  reader can catch that.
* **Every other harness in `scratchpad/` is unaudited for this shape.** This
  parcel fixed the two arms in one file. `check-harness-guards.mjs` classifies
  267 files and has no rule for "a refusing arm that emits fewer rows than its
  sibling". Whether that generalises into a G-rule is a separate decision and is
  **not** claimed here.
