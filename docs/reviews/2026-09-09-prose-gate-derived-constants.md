# The prose gate could not see a derived constant, and derived constants are the ones whose values move

**Row:** `BUDGET-PAGE-UNIT`'s named open follow-up (`docs/lens-findings.jsonl`)
**Branch:** `parcel/prose-gate-derived-constants`, cut from `master` at `d9fbf105`
**Date:** 2026-09-09

`scripts/check-prose-constants.mjs` is this repo's gate against a constant being
re-typed as a literal in author-facing prose. It is wired into `npm test`. It
could not see a **derived** constant, and it said so nowhere.

---

## 1. The false green, reproduced before anything was changed

The brief handed me last night's measurement and told me not to trust it. Run at
`d9fbf105`, with the mutation applied **on disk**:

```
-      + `${FG_PAGE_FRAMES} fixed ${FG_PAGE_TILES}-tile frames, and a half-full page still `
+      + `12 fixed ${FG_PAGE_TILES}-tile frames, and a half-full page still `
```

`git diff --stat` → `src/main/editor-methods.ts | 2 +-`. Then:

```
$ node scripts/check-prose-constants.mjs
check-prose-constants: 523 of 523 enumerated source files parsed, 135 named
numeric constants, 0 re-typed in author-facing prose.
rc=0
```

Reproduced exactly. The `description:` key **is** in the gate's population, so
the site looked covered. The constant simply was not in the table:
`FG_PAGE_FRAMES` is declared as a **call**
(`deriveFgPageFrames(FG_TILE_LIMIT, FG_PAGE_TILES)`), and `numericInit` folded a
numeric literal or `constant('X')` and nothing else. Restored from the committed
baseline before any work began.

**The general shape is worse than the site.** The constants that fold excluded
are exactly the DERIVED ones, and a derived constant is precisely the kind whose
value moves. The blind half of the table was the half most worth watching.

---

## 2. What I measured before choosing a design

The brief's warning — that a wider fold produces more values to match and a gate
that cries wolf is retired by its readers — is the reason the whole census came
first, in a throwaway probe that mirrored the gate's own scan so the two counts
would be comparable.

**Population.** 767 exported `const` declarations across the 523 enumerated
source files. Their initialisers, by shape: 173 string literals, 121 numeric
literals, 92 `Object.freeze(...)`, 46 object literals, 32 `+` chains (nearly all
prose assembly), 17 `constant('X')`, 13 `*`, 8 `/`, 5 `-`, 5 `<<`, 2 `&`, and a
long tail of schema-reading helper calls and IIFEs.

**Cost of each arm, measured over the whole tree, as candidate findings before
exemptions** (the baseline gate reports 0 findings against 9 exemption rows, so
10 raw candidates is today's green):

| arms | table size | raw candidate findings |
|---|---|---|
| none (baseline) | 135 | 10 |
| alias only | 140 | 10 |
| arithmetic only | 140 | 10 |
| arithmetic + alias | 167 | 10 |
| arithmetic + alias + pure helper call | 168 | **12** |

**So the entire false-positive bill of the widening is two rows**, and both
arrive with the arm that reaches `FG_PAGE_FRAMES`. Both are in
`src/main/editor-methods.ts` and both are about the value 12:

* `"...solidity 13:12); 0 = air"` — a **bit position** in the packed collision
  word. Same quantity class as the existing `bits 15:14` exemption.
* `"...(\"section 3, cell (col 12, row 40), left half\")"` — an **illustrative
  coordinate** inside a worked example of the reply format. The neighbouring 3
  and 40 are equally invented.

Both are adjudicated in `EXEMPT` with written verdicts. **A fold that made the
gate unusable would have been reported and constrained rather than shipped;
this one costs two rows over 523 files, so it shipped.**

---

## 3. The design, and what I rejected

### 3.1 The fold reaches three shapes and stops

* **Arithmetic** over names already in the table: `+ - * / % ** << >> >>> & | ^`
  and unary `- + ~`. `+` folds only when both sides are numbers, so the 32
  exported string-concatenation constants fall out without a special case.
* **Alias**: `export const A = B` where `B` is known.
* **One call shape**, deliberately the narrowest that reaches a real derivation:
  a `function` declaration whose body ends in its **only** `return`, whose
  returned expression is arithmetic, and **every identifier in which is one of
  its own parameters**.

That last clause is what keeps this from being an interpreter. A body that could
reach module scope would need the *defining* module's names rather than the
calling one's, and resolving that against the caller's table would **invent** a
value rather than decline to have one. `deriveFgPageFrames` is exactly this
shape: two guards that throw, then `return tiles / tilesPerPage`. Skipping the
guards is sound — a guard that fired would mean the module never loaded, so
there is no value for prose to re-type.

**The table is now built to a fixpoint.** A single pass is order-dependent:
`TILE_RGBA_BYTES = TILE_PIXELS * 4` folds only once `TILE_PIXELS` is known, and
`git ls-files` order is not dependency order. Iterating until the table stops
growing takes file order out of the answer entirely.

### 3.2 Rejected: fold only, with the remainder silent

This is what the old gate did, and it is this repo's sharpest recorded defect
shape: a guard whose "I could not look" and "I looked and found nothing" are the
same output. Whatever the fold's reach, the constants outside it must announce
themselves or the summary line is a coverage claim nobody earned.

### 3.3 Rejected: refuse only, and fold nothing

Naming the unfoldable constants without widening the fold would have made the
blindness visible and left it in place. It also cannot be done well without a
fold: the predicate for "this ought to have folded" is only meaningful relative
to what the fold attempts. A first cut that accepted **any** single-return helper
call named **118** constants as blind spots — `mapFacet(...)`,
`presetFieldTitle(...)`, `boundsAt(...)` — most of them returning objects and
strings. That is noise, and a ledger of 118 rows would be read the way a
118-line lint warning is read.

### 3.4 Shipped: fold, and announce the remainder in two tiers

**NEAR MISS — hard, adjudicated, 4 today.** The fold *attempted* this
initialiser (it is arithmetic, a `constant('X')` lookup, or a call to a helper
the fold recognises) and abandoned it. A small change of shape would bring it in,
so an author is asked to fold it or write down why not. An unadjudicated one
**fails the run**, and a stale `UNFOLDABLE` row fails too, on the same rule
`EXEMPT` already lives by:

| constant | why the fold cannot reach it |
|---|---|
| `COLLISION_CELL_UNOWNED_MASK` | `(~COLLISION_CELL_OWNED_MASK) & 0xFFFF`, over a `packCollisionCell({...})` object-argument call |
| `CROSSOVER_OVERLAP_WITH_PACKED_FIELDS` | same operand |
| `ANCHOR_TICK_HZ` | element access into an array of object literals, then two property reads |
| `RAMP_RATE_UNIT` | operand is a property read off a range derived from the vendored effects JSON schema at module load |

`ANCHOR_TICK_HZ` is the one worth knowing about rather than worth folding: it
exists *precisely* so `60` is not typed, and its own comment says so, so a typed
`60` beside it is the exact defect this gate is for and would not be caught.

**DECLARED NUMERIC — counted, 33 today.** The author annotated `: number`, or
called a function declared `: number`, and nothing static evaluates it. Nearly
all read the vendored effects JSON schema at module load. **These are counted,
not adjudicated**, and the reason is the brief's own: demanding a written verdict
per constant would redden the build on ordinary work in that lane, and a gate
that fires on correct landings is a gate that gets switched off.

Both counts ride on the **green** line, which now opens `NOT FULL COVERAGE`:

```
check-prose-constants: 523 of 523 enumerated source files parsed, 168 named
numeric constants, 0 re-typed in author-facing prose. NOT FULL COVERAGE: 4
adjudicated near miss(es) and 33 declared-numeric constant(s) could not be
folded, so a re-typed twin of any of them would match nothing here (--blind
names them).
```

**Neither tier claims to be the whole blind set,** and the header says so. A
constant built by a shape neither predicate recognises is invisible to this
census too. What this gate can state is *what it noticed it could not do*, never
*everything it cannot do*.

### 3.5 Found by building it: the same defect one level down

The first working version of the ledger named
`MARK_BOX_MARGIN = NORMAL_LEN / 16` as a blind spot. It is not one — the fold
evaluates it perfectly to `0.40625`. The table had been dropping non-integers, so
"I could not evaluate it" and "I evaluated it and it has no digit-run twin to
look for" arrived as the same `null`. **The integer filter now lives at the prose
match**, which is where the gate's stated non-integer bound actually is, and the
table keeps `6.5`. That was three rows of noise removed and one real distinction
restored, and only planting the ledger surfaced it.

### 3.6 The fold now lives in its own module

`scripts/prose-constant-fold.mjs` (with a `.d.mts` sidecar, on the pattern of
`failure-class-reporter.d.mts`). One reason: **the fold is the half that can be
wrong silently.** The scan half fails loudly — break it and it stops printing
findings — but a fold that quietly stops resolving a name only shrinks the table,
and a smaller table matches fewer prose numbers and still prints a clean summary.
A unit nobody can call is a unit nobody can plant a defect in.

---

## 4. Red-first evidence

`test/config/prose-constant-fold.test.ts`, **18 rows**, collected by `vitest run`
inside `npm test`. Every mutation below was applied **on disk** (each diff shown)
and restored from the **committed** baseline afterwards; the tree was verified
clean between plants.

| # | mutation | on disk | result |
|---|---|---|---|
| M0 | typed `12` over `${FG_PAGE_FRAMES}` in `editor-methods.ts`, **before the fix** | `- ...${FG_PAGE_FRAMES} fixed...` / `+ ...12 fixed...` | **rc 0**, "0 re-typed in author-facing prose" — the reproduced false green |
| M0b | the same plant, **after the fix** | same diff | **rc 1**, "types 12, which this module already has as FG_PAGE_FRAMES" |
| M1 | helper-call arm neutered (`if (true) return null;` above the `fns.get` use) | `+ if (true) return null;` | **RED, 4 of 18**: the helper-call row, the real-gate rc-0 row, the `--table` row ("has the DERIVED FG_PAGE_FRAMES in its table"), and the summary-line row |
| M2 | fixpoint removed (`pass < 8` → `pass < 1`) | `- for (let pass = 0; pass < 8; pass++) {` | **RED, 1 of 18**: "resolves in dependency order, not file order" |
| M3 | non-integers dropped from the table again (`Number.isFinite` → `Number.isSafeInteger`) | `- return v !== null && Number.isFinite(v) ? v : null;` | **RED, 4 of 18**, including "keeps a non-integer in the table rather than reporting a hole" |
| M4 | near-miss tier silenced (`if (attemptedNumeric(...))` → `if (false)`) | `- if (attemptedNumeric(d.initializer, fns)) nearMiss.push(row);` | **RED, 4 of 18**, including "NEAR MISS: an attempted-and-abandoned arithmetic constant is named" |
| M5 | `NOT FULL COVERAGE` removed from the passing line | `- + \`NOT FULL COVERAGE: ${nearMiss.length} adjudicated near miss(es) and \`` | **RED, 1 of 18**: "says on its PASSING line that it is not full coverage, with both counts" |
| M6 | the gate unwired from `package.json`'s `test` chain | `package.json \| 2 +-` | **RED, 1 of 18**: "`npm test` runs the gate, before vitest" |

**Two of my own rows were wrong, and the first run said so.** I expected a call
to an *unrecognised* `: number` helper in the NEAR MISS tier; it is in the
DECLARED tier, which is correct — the fold never recognised the helper, so it
never attempted the call, and demanding a verdict for a shape it never claimed is
how a ledger fills with rows nobody can act on. And my `--blind` tally assertion
read the last stdout line, which is the gate's own pass line. Both are fixed and
both now assert the thing they meant to.

**Expectations are derived, not pinned.** The synthetic rows compute their own
arithmetic. The whole-repo row imports `FG_TILE_LIMIT`, `FG_PAGE_TILES` and
`FG_PAGE_FRAMES` from `src/core/export/vram-coloring` and asks whether the gate's
`--table` output resolved the same values. A typed `12` in the test would go
stale the day aeon resizes its FG art pool, which is the defect the constant
exists to prevent — and, one turn earlier in this parcel's own history, a mistake
a sibling row in `budget.test.ts` already made once.

---

## 5. Suite

Aggregates, whole, both ends. Not a tail excerpt.

| | Test Files | Tests | exit |
|---|---|---|---|
| baseline, `d9fbf105` (detached, this worktree) | 567 passed / 3 skipped (570) | 8463 passed / 9 skipped (8472) | 0 |
| after, branch tip | 568 passed / 3 skipped (571) | 8481 passed / 9 skipped (8490) | 0 |

`+1` file and `+18` tests, no new skips.

**One flake, named rather than folded into the green.** The first `npm test` on
the branch reported one failure, `facet-modules.test.ts > covers all six built
facets`, `Error: Test timed out in 5000ms` — classified TIMEOUT by the suite's
own reporter, on a box that was also running this parcel's probes. It did not
recur on either of the two subsequent full runs (both rc 0) or on the baseline
run. It touches nothing in this parcel. Recorded here because a failure that
happens once is not a failure that did not happen.

---

## 6. What is left open

1. **The blind census is not the blind set.** Both tiers are defined by
   predicates over syntax, and a constant built by a shape neither recognises is
   counted in neither. `--blind` names 37 constants; the true number of
   constants this gate cannot police is at least that.
2. **The declared-numeric tier is unpinned on purpose.** Its count can drift
   upward without anything going red. Pinning it would redden the effects lane's
   ordinary work; leaving it invisible is what this parcel fixed. Printing it on
   every summary is the middle, and it is a middle, not an answer.
3. **The repo-wide name table is still flat.** Two modules exporting the same
   name with different values collide, last write wins. No such collision exists
   today (the probe checked, and reported none), so this is an unexercised
   hazard rather than a live defect, but the fold makes it reachable in more
   ways than the literal-only table did.
4. **`ANCHOR_TICK_HZ` is a live blind spot with a real target.** It exists so
   `60` is not typed; a typed `60` beside it would not be caught. Folding it
   needs element access and property reads, which is the interpreter this parcel
   declined to write. Named in `UNFOLDABLE`, not fixed.
5. **The offset restatements** the header already lists ("banks 1 to 7" beside a
   count of 8) are untouched and still uncaught. The fold does not help with
   them; they are a different predicate entirely.

**No emulator was touched, and nothing here wanted one.**
