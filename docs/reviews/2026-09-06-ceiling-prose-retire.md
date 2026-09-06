# Retiring a claim that was true for one morning, and re-opening the conclusion it justified

**Branch** `parcel/ceiling-prose-retire` · **2026-09-06**

`docs/reviews/2026-09-06-bganim-section-ceiling.md` found that the `ojz_bg_anim`
section budget — six constants Aurora vendors — had **exactly one authority**,
`aeon tools/inject_editor_bg.py`, and **no row in aeon's own
`tools/EFFECTS_CONSUMER_CONTRACT.md`**. That was measured, correct, and worth
raising. It was raised, and **aeon answered it the same day**. Three places in
this tree went on asserting the old state in the present tense, and one of them
was the *reason* a check had been left single-authority.

Two halves here, and the second is the one that matters: **retire the claim**,
then **re-open the conclusion the claim was propping up**.

---

## 1. aeon's table, at a revision, confirmed reachable

`AEON_DIR` resolved through this repo's own resolver, printed rather than typed:

```
$ node -e "import('./test/support/sibling-root.mjs').then(m => { … })"
root:   /home/volence/sonic_hacks/aeon
source: step 3: git rev-parse --git-common-dir from
        …/aurora/.claude/worktrees/agent-aa9540aff378c0fa3 → …/aurora/.git
```

Everything below was read with `git -C "$AEON_DIR" show <rev>:<path>` after a
`fetch`. **Nothing was read from aeon's working tree and nothing was written to
aeon.**

* **`fe4fabf88c98e9741990df02bb88574d2abd5441`** — 2026-09-06 08:55:27 -0400,
  *"contract(section budget): six constants whose only authority was our own
  tool's source"*, `tools/EFFECTS_CONSUMER_CONTRACT.md | 34 ++++++`
* **Reachability, checked not relayed:**
  `git merge-base --is-ancestor fe4fabf8 origin/master` → **exit 0**. aeon
  `origin/master` at the time of reading is
  `3d414618e68a717cabdc70d9cc25548778748afe` (*"board: drop the cancelled ceiling
  spend…"*, 2026-09-06 12:14:07 -0400).

The table, quoted at `origin/master` (identical at `fe4fabf8`), lines **97-104**
of `tools/EFFECTS_CONSUMER_CONTRACT.md`:

```
#### THE SECTION BUDGET — six constants a consumer must model, and until now their ONLY authority was our tool's source (added 2026-09-06T12:55:09Z)

| Constant | Value | Authority |
|---|---|---|
| `BGANIM_SECTION_CEILING` | 20480 | `inject_editor_bg.py`, the `min` over the per-shape table — **an expression, not a literal**: re-derive it, and it refuses if any shape's row stops naming the ruled figure |
| `BGANIM_COUNT_BYTES` | 2 | the section's leading `u16` band count |
| `BGANIM_RECORD_BYTES` | 44 | one band record (6 `u16` header fields + an 8-entry pointer array) |
| `BGANIM_BYTES_PER_SLOT` | 256 | **a PRODUCT** (`BGANIM_PHASES * BGANIM_TILE_BYTES`), not the `256` in the comment beside it |
| `BGANIM_VIEW_COUNT` | 3 | the DEBUG view twins (H / V / T) |
| `BGANIM_VIEW_DERIVED_PERIOD_PX` | 64 | the period `BGANIM_VIEW_V_RATE_SHIFT` was derived against |
```

All six values equal what this repo already vendors. **No constant moved.** The
prose intro credits the raise to this lane and states the same fact the retired
claim did, in the past tense: *"until now their ONLY authority was our tool's
source"*.

**A measurement that shaped the instrument below:**
`git diff fe4fabf8 origin/master -- tools/EFFECTS_CONSUMER_CONTRACT.md` is **not
empty** — aeon rewrote the `default_off` row, the shape-distinction paragraph
(with a correction to their own claim about Aurora's arithmetic) and the entire
"two writer obligations" subsection — **and touched none of the six table rows.**
The table is the stable part of a churning page.

---

## 2. The enumerated sites, and how each was treated

Both greps were run, neither being a superset of the other: identifier
(`notInAeonProse`, `EFFECTS_CONSUMER_CONTRACT`) and quoted string (`no row in`,
`only authority`, `nothing to corroborate`, `lives only in the consumer`,
`contract doc's silence`, `raising with aeon`, `no .emp declaration`), across
`src`, `test`, `docs`, `scratchpad`. `nothing to corroborate` returned **exit 1**
— the brief's quote is a paraphrase; the literal text in the tree is *"There is
nothing to corroborate against"*, found by the `no .emp declaration` grep.

| # | Site | Kind | Treatment |
|---|---|---|---|
| 1 | `src/core/formats/bg-override/bganim-consumer-contract.json` — `constants.BGANIM_SECTION_CEILING.notInAeonProse` | **present-tense claim** | CORRECTED IN PLACE. Renamed `aeonProse` and rewritten. The KEY NAME was half the false claim, so leaving it would have retired the sentence and kept the label. |
| 2 | same file — `amendments[section-ceiling].notALL`, last sentence | **dated record** (a read at `78c99423`) | ANNOTATED, in the shape this file already uses for its `axis` amendment: the sentence now says it was true at `78c99423` and names the superseding amendment. Not rewritten. |
| 3 | same file — `amendments[section-ceiling].documents[0]`, *"THE CONSUMER and the ONLY authority for any of this"* | **dated record** | LEFT AS WRITTEN, covered by #2's supersession pointer, which says so explicitly. Editing a dated `documents` list would falsify what that amendment read. |
| 4 | same file — new `amendments[section-budget-in-prose]` | — | ADDED. Names `fe4fabf8`, records the ancestry check, that no constant moved, and the derived-as-literal trap. |
| 5 | `test/formats/bg-override-contract-currency.test.ts` — the comment above `BGANIM_SECTION_CEILING` | **present-tense claim, and a live premise** | REPLACED, and its conclusion re-opened. See §3. |
| 6 | `docs/reviews/2026-09-06-bganim-section-ceiling.md` §1 | **dated packet** | DATED CORRECTION ADDED inside §1, retiring *"Worth raising with aeon"* as **done, by aeon, because of this packet**. The finding is not rewritten into never having existed. |
| 7 | `docs/lane-log.jsonl:341` — *"the ceiling has no row in aeon's own contract"* | **append-only dated log** | LEFT UNTOUCHED, deliberately. The ledger is a record of what was reported at `2026-09-06T12:52:50Z`; editing a past entry to make it right is exactly the laundering this repo's own bookkeeping lesson warns about. The retirement belongs in a NEW entry at landing, never in an edit to that one. |
| 8 | `docs/reviews/2026-09-06-default-off-switch.md:60` | **no false claim** | NO CHANGE NEEDED, but worth recording: that packet **read `fe4fabf8` itself** and even quotes its subject line — *"contract(section budget): six constants whose only authority was our own tool's source"* — while looking at the `default_off` subsection. It read the right commit for a different question and did not notice the table two screens up. A citation carries only what you read. |
| 9 | `scratchpad/bganim-section-budget-harness.mjs` | — | Checked and clean; carries no claim of this class. |

`src/renderer/agent/agent-handler.ts` reaches this contract only transitively
(`src/core/formats/bg-override/bg-override.ts` is the one module that reads the
JSON, and the agent path consumes its exports). No field corrected here is
rendered into agent-facing text, so nothing downstream needed a change — but #1
is the agent path's authority document and is why it was corrected rather than
annotated.

---

## 3. THE RULING: yes, the currency gate gains a second authority

The retired comment's argument was: *one authority, so **there is nothing to
corroborate against, so a second row here would be decoration**.* The premise
died; the conclusion does not survive it on its own merits.

**Ruled YES. All six section-budget constants gain a doc row beside their source
row** in `test/formats/bg-override-contract-currency.test.ts` (**28 → 34 rows**).
The full argument is written into the file as the comment replacing the false
one; in short:

**What the second row buys, and it is NOT a second opinion about the value.**
The source row answers *did aeon move the number*. The doc row answers a
different question this file could not previously ask: **has aeon's own prose
drifted from aeon's own code**. A single-authority check is structurally blind to
it, because the copy and the source are only ever compared through a person.
This file's own header records the class biting for real: aeon shipped a refusal
telling a blocked author *"the limit is 12 KiB"* for two days after the ceiling
was raised to 20480.

**And this doc is the copy most likely to rot** — no generator, no aeon-side
gate (unlike `vram.toml`, whose mirrors `test_generated_artifacts_are_in_sync`
holds together), its own Authority column pointing back at the source, and **two
of the six rows printing a DERIVED value as a literal**, flagged as such in the
cells themselves:

* `BGANIM_SECTION_CEILING` is `min(BGANIM_SECTION_CEILINGS.values())`. `20480` is
  right only while every shape's row names `BGANIM_SECTION_CEILING_RULED`.
* `BGANIM_BYTES_PER_SLOT` is `BGANIM_PHASES * BGANIM_TILE_BYTES`, not the `256`
  in the comment beside it.

A doc row is exactly where an expression silently becomes a stale number.

### The three arguments against, weighed

1. **"Prose is unstable to pattern-match."** Answered structurally: the row
   matches the whole **table** (its header `| Constant | Value | Authority |` is
   unique in the document, checked at both revisions) rather than hunting a
   constant's name — `BGANIM_VIEW_DERIVED_PERIOD_PX` also appears in prose ~130
   lines further down, and a name-hunting pattern would have let that answer for
   a table row. And measured: aeon rewrote three passages *around* this table
   between `fe4fabf8` and `origin/master` without touching a row of it.
2. **"A red because a PEER'S DOCUMENTATION drifted is noise."** Not in this
   repo: that page is the document Aurora is *told to consume*, so a wrong figure
   in it is a wrong figure handed to the next Aurora lane. Every failure here
   already opens `NOT AN AURORA REGRESSION` and names the revision.
3. **"A consumer looser than the producer ends up blaming the producer."** That
   standing finding cuts the other way here. *Looser* is the hazard; this is
   strictly **tighter**, and tighter about aeon's **internal agreement** rather
   than about what Aurora will accept. **No document Aurora writes becomes legal
   or illegal because of these six rows.**

### The bound, stated

A doc row may **never** become the thing a value is re-vendored *from*. The
source rows still re-derive both expressions from aeon's own operands; the doc's
literals are corroboration only. Re-vendoring off the table would import exactly
the staleness the table is watched for.

### What would overturn this ruling

* aeon adopting a **generator or a gate** tying the table to
  `inject_editor_bg.py` — the drift becomes unrepresentable and these rows become
  decoration.
* aeon **deleting the table** — one authority again, and the block reverts to the
  old comment's shape (with the date it stopped being two).
* A run of reds caused by aeon **reformatting** rather than mis-stating would
  argue for matching the table more loosely. It would not argue for dropping the
  rows.

---

## 4. Red-first, with the mutation shown on disk

Poisoned against a **plausible drift**, not by deleting the input. The baseline
was **committed first** (`3bcf3a3e`), so the tree was clean, the plant was the
only dirt, and the restore came off that committed baseline.

### Plant A — aeon's prose says 45 where aeon's source says 44

`git diff --stat` → `test/formats/bg-override-contract-currency.test.ts | 7 ++++++-`

```diff
-        const at = readAtRev(aeon, tip, ex.path);
+        const at0 = readAtRev(aeon, tip, ex.path);
+        // TEMPORARY RED-FIRST PLANT, NOT TO BE COMMITTED. A plausible drift:
+        // aeon's prose table says 45 where aeon's source still says 44.
+        const at = at0.ok && ex.path === AEON_CONTRACT_DOC
+          ? { ...at0, text: at0.text.replace('| `BGANIM_RECORD_BYTES` | 44 |', '| `BGANIM_RECORD_BYTES` | 45 |') }
+          : at0;
```

**`Tests 1 failed | 33 passed (34)`** — and the discriminating half is *which*
one:

```
FAIL … BGANIM_RECORD_BYTES matches tools/EFFECTS_CONSUMER_CONTRACT.md at aeon origin/master
AssertionError: NOT AN AURORA REGRESSION: the vendored aeon contract is stale.
  BGANIM_RECORD_BYTES is vendored as 44 in
  src/core/formats/bg-override/bganim-consumer-contract.json,
  but aeon origin/master (3d414618e68a717cabdc70d9cc25548778748afe) declares a
  different value in tools/EFFECTS_CONSUMER_CONTRACT.md
  (the section-budget table's row for `BGANIM_RECORD_BYTES`, its Value cell …)
  expected 45 to be 44
```

The **source** row for the same constant stayed green, which is the whole point:
this is a drift no single-authority check can see.

### Plant B — aeon drops a row from the table (loud on unmeasurable)

```diff
+          ? { ...at0, text: at0.text.replace(/^\| `BGANIM_RECORD_BYTES` \| 44 \|.*\n/m, '') }
```

**`Tests 6 failed | 28 passed (34)`** — all six doc rows, none of the source rows:

```
Error: aeon's section-budget table has 5 constant row(s) at this revision, not
the six it was added with (found: BGANIM_SECTION_CEILING, BGANIM_COUNT_BYTES,
BGANIM_BYTES_PER_SLOT, BGANIM_VIEW_COUNT, BGANIM_VIEW_DERIVED_PERIOD_PX).
Re-read the table: aeon either split it or dropped rows from it.
```

### Plant C — aeon reshapes the table header

```diff
+          ? { ...at0, text: at0.text.replace('| Constant | Value | Authority |', '| Name | Bytes | Source |') }
```

**`Tests 6 failed | 28 passed (34)`**, through the file's existing
*matched NOTHING* expectation:

```
BGANIM_SECTION_CEILING: the extractor for tools/EFFECTS_CONSUMER_CONTRACT.md
matched NOTHING at aeon 3d414618e68a717cabdc70d9cc25548778748afe.
```

So the row **fails saying so** in all three unmeasurable shapes and never renders
"couldn't measure" as agreement.

### Restore

`git checkout -- test/formats/bg-override-contract-currency.test.ts` from the
committed baseline `3bcf3a3e`; `git status --short` empty, `git diff HEAD --stat`
empty; the file back to **`Tests 34 passed (34)`**.

---

## 5. Verification

| | Test files | Tests |
|---|---|---|
| before (master `cadcc135`, 12:23) | 521 passed, 3 skipped (524) | 7613 passed, 9 skipped (7622) |
| after (12:33) | **1 failed**, 520 passed, 3 skipped (524) | **1 failed**, 7618 passed, 9 skipped (7628) |

### ⚠ THE ONE RED IS NOT THIS PARCEL, and it is quoted rather than summarised

```
FAIL test/formats/effects-schema-drift.test.ts > CURRENCY: is the vendored
     schema still what empyrean publishes? > matches
     contract/schema/aurora-effects-scene.schema.json at empyrean origin/main
AssertionError: NOT AN AURORA REGRESSION: the vendored effects contract schema is stale.
  pinned at empyrean 60d9f6a4… (blob 7d70b3fa…)
  empyrean origin/main is now 83f52907… (blob 5bff4f76…)
```

**It went red between the two runs above, and the cause is timestamped:**

```
$ git -C …/empyrean reflog show origin/main --date=iso -3
83f5290 refs/remotes/origin/main@{2026-09-06 12:32:33 -0400}: update by push
```

The baseline ran at 12:23, the push landed at 12:32:33, the re-run started at
12:33. `test/support/peer-repo.ts` never fetches, so the moving part was the
local checkout's remote-tracking ref, updated by another lane. This branch
touches five files — `bganim-consumer-contract.json`, the two `bg-override-*`
test files and two `docs/reviews/` pages — and **none of them is in that row's
population** (`git diff master...HEAD --name-only | grep -c effects` → 0). It is
an empyrean re-vendor for whoever owns that contract, with its own coverage and
golden sweeps to run after; it is **left open, not fixed here**, because
re-vendoring a schema is not a thing to smuggle into a prose-retirement parcel.

**Every other row is green, and the delta is exactly the six new rows**, each
named in the runner as
`<CONSTANT> matches tools/EFFECTS_CONSUMER_CONTRACT.md at aeon origin/master`.
No row was lost. The nine skips are the same nine as before, each naming its
reason (three foreground-gate rows, one opt-in bench, two live-emulator rows, two
absent `s4_engine` fixtures, one main-checkout-only resolver row).

`npm test` runs the whole gate chain, including `check-test-dashes`
(542 files clean, its planted canary live), `check-doc-citations`,
`check-cited-paths` and `npx tsc --noEmit`.

`bg-override-contract-drift.test.ts` re-pinned
`df8fc461…` → `8f1c9e28…`; its 16 rows pass and **no constant, export or
invariant changed** — the re-pin is prose only.

---

## 6. Left open

* **The lane-log entry (`docs/lane-log.jsonl:341`) still carries the retired
  sentence**, on purpose. A landing entry states the retirement; the past entry
  is not edited.
* **NO RUNTIME CONFIRMATION, and none was attempted.** No emulator tool was
  touched. Nothing in this parcel changes a byte that reaches a ROM: the six
  values are unchanged, `bganimSectionBytes` is untouched, and the panel's
  arithmetic is not in the diff. **Tagged for the overseer only if a foreground
  lane wants it double-checked; nothing here asks for it.**
* **Line numbers are still uninstrumented**, as this file's own header says. The
  `authorities` entries cite `inject_editor_bg.py:202/207/214/215/218/287/323`
  and nothing reads them; aeon's commit message states they re-checked and all
  still resolve at `fe4fabf8`, which is a peer's claim, not a measurement of
  mine.
* **`test/formats/effects-schema-drift.test.ts` is RED and not mine** — empyrean
  `origin/main` moved by a push at 12:32:33 mid-session. See §5. Someone owns the
  re-vendor of `aurora-effects-scene.schema.json`; it is not this branch.
* **aeon's table is not gated at aeon's end.** The doc rows added here are
  Aurora's own coverage of that gap, from the outside. Whether aeon wants a
  generator or a test tying the table to `inject_editor_bg.py` is aeon's call —
  worth mentioning to them, and unlike the last one this is a suggestion rather
  than a missing contract row.
