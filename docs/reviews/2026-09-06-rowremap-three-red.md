# Three red rows: one demanded a falsehood, two mistook a fold for a deletion

`parcel/rowremap-three-red` · branched from master `06d91872` · 2026-09-06

The previous parcel (`docs/reviews/2026-09-06-rowremap-seed-attribution.md`) took
`harness:row-remap-control` from 18/25 to **23/26** and left three rows red **on
purpose**, arguing each rather than relaxing it. This parcel closes all three.

**No file under `src/` is changed by this branch.** Two app files were mutated
temporarily as red-first plants and restored from the committed baseline; the
proofs are below and `git status` is clean of them.

Final: **26/27**, one red, and that one is an **app finding left red on purpose**
with the fix booked out of scope.

---

## 0. First, an instrument fault that invalidated my own first three runs

The harness prints its run root and I did not read it:

```
root: /home/volence/sonic_hacks/aurora  BORROWED — this script lives in
      <worktree>, which has no built app, so the app under test is
      /home/volence/sonic_hacks/aurora's build
```

`resolveRunRoot` calls a tree runnable only if it has **both**
`node_modules/.bin/electron` and `dist/main/index.mjs`. An agent worktree has no
`node_modules`, so it fails the first half and the walk borrows the main
checkout — and `ELECTRON_BIN` does not prevent this, because it overrides only
the **binary**, after the walk has already chosen the **tree**.

So `VITE_AURORA_DEBUG=1 npm run build` in the worktree built a `dist/` that
nothing then ran. This was invisible until the `[5b]` plant: the app painted the
**unmutated** sentence and the row stayed green — the "applied-and-still-green
means the runner is not executing what you patched" signature, caught only
because a plant was run at all.

The missing half is `AURORA_BUILT_TREE`, which pins the tree and **bypasses the
runnable check** (`resolveRunRoot` returns the pin before walking). Every run
reported below uses:

```
AURORA_BUILT_TREE=<worktree> ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron
```

⚠ **For the next worktree agent:** the brief handed me `ELECTRON_BIN` alone, and
`docs/OVERSEER.md` documents that one as *the* worktree override. Alone it
produces a run that looks completely normal and measures another tree's build.
Booked as a doc/brief gap, not fixed here.

---

## 1. `[5b]` — the expectation was FALSE, so it was rewritten, never relaxed

The row required the painted refusal to call Aurora's bound the
`ONLY ENFORCEMENT` of the `plane_y` ceiling. That stopped being true: aeon landed
an engine-side `< 512` guard (aeon `d593070a`) and aurora correctly retired the
claim. **The row was demanding a falsehood in front of an author** — the one
repair a red row must never get is the app changed to satisfy it.

The vendored contract (`src/core/formats/effects/aurora-effects-scene.schema.json`,
from empyrean **`2e5046e`** — which supersedes the `83f5290` cited upstream and
carries the same clause) says under `plane_y`:

> THIS SCHEMA IS THE ONE OF TWO ENFORCEMENTS OF THE 511 CEILING (this schema, and
> aeon's engine-side `< 512` guard landed at aeon `d593070a` the same night; keep
> both, a reader trimming the aeon ensure on this schema's authority would delete
> the only build-time guard a hand-authored scene has).

### The expected phrase is DERIVED, not typed — that is the whole repair

A literal is what went stale. Both halves now come out of that description, in
this process, from the vendored bytes:

| what | rule | today |
|---|---|---|
| the count | `/ONE OF (\w+) ENFORCEMENTS?/i` | `ONE OF TWO ENFORCEMENTS` |
| the other enforcer's **owner** | the possessive in the list's second member | `aeon` |
| the other enforcer's **place** | the hyphenated qualifier in that member | `engine-side` |

The list is the parenthetical up to its first `;` (what follows is the keep-both
warning, not a member), split on `, and `; `this schema` is the enforcement the
app **is**, and the last member is the one it must tell the author about.

So if a third enforcer lands and the contract says `ONE OF THREE`, the needle
says THREE and the row stays red until the sentence does too; and if the second
enforcer became, say, a link-time check in sigil, both needles move with it.
Each derivation **throws** rather than degrading to no check — an
`undefined` needle that quietly matches everything is the false-zero this file's
`SHIFTS` loop was already rebuilt once to avoid.

The row now asks **strictly more** than before: the sentence must still carry the
ceiling (`511`), and must now also name the second enforcer. An app that quietly
drops the second enforcer reddens it.

### Red-first, plant shown on disk

Planted the app saying the OLD sentence — the plausible poison, not a deletion —
in `src/core/formats/effects/scene-ui.ts`:

```
git diff --stat → src/core/formats/effects/scene-ui.ts | 7 +++----
```
```ts
    return `${planeY} is outside the Plane-B line range ${min}..${max}. This bound is the `
      + 'CONTRACT\'S ONLY ENFORCEMENT of the ceiling; aeon checks the floor and not the '
      + 'ceiling, so a larger value builds clean and emits a window pointing nowhere.';
```
```
FAIL  [5b] … {"leaf":false,"candidates":0}        25/27
```

Restored with `git checkout HEAD -- src/core/formats/effects/scene-ui.ts` and
rebuilt. (This is the plant that exposed §0: run unpinned, it printed **PASS**.)

---

## 2. `[6a]` / `[6b]` — the fold is HOUSE STYLE, and the ruling is a measurement

`73fc44bf` split each precondition into `{diagnosis, mechanism}` and put the
mechanism behind a collapsed *"Why this happens"*. The rows read the visible text
for `MUST declare anchor` and `at most ONE layer`, which are in the mechanism.

**Ruling: house style. The rows learn to click.** Both sides, honestly:

**For degradation** — a precondition is not a mechanism, and an author who never
clicks never learns why their remap does nothing.

**For house style, and this is what decided it:**

1. **The argument's premise is false, by measurement.** The precondition an
   author acts on is on screen with nothing clicked. `[6a]`'s own first
   measurement, unclicked, inside its scroller, hit-testable, after the control:

   > `this scene declares no anchor, and the remap takes its channel from the
   > scene's own anchor rather than from the strip.`

   and on the other card, `strip 0 also carries a row remap.` What is folded is
   aeon's **verbatim wording** — the mechanism — not the fact, not which input is
   missing, and not which strips are guilty.
2. **Unfolding it re-creates a measured defect.** `Advisory`'s docblock
   (EW-LAYER-CARD-SCROLLER) records these two blocks at **165px in a box whose
   floor is 129px** — "a paragraph no scroll position shows whole". One click
   beats a paragraph that cannot be read at all.
3. **O15's actual rule is respected.** It forbids folding a **remedy**. A
   precondition has no separate remedy — "the control that supplies it is a row in
   this same card" — so the half behind the disclosure is the *why*, which is
   exactly what O15 says may go there.
4. This repo already holds the standing finding that a wall of caveats in front
   of a control is itself a defect.

### The repair is a discriminating pair across the click, not "expand and read"

Expanding must not turn a row into one that passes because it found a container.
Each row now asserts, in one pass:

* the clause is **NOT painted** while the disclosure is shut;
* the disclosure actually opened (`aria-expanded`, read back **after** the
  re-render);
* the clause **IS painted** after, in the contract's own words.

⚠ **The shut half is not `leaf === false`, and that matters.** `innerText` on a
`display:none` node **falls back to `textContent`** per spec, so the folded
sentence is findable *by text* while invisible. Measured, shut:

```
{"leaf":true,"text":"The contract: \"the scene MUST declare anchor\"",
 "rect":{"top":0,"bottom":0},"insideScroller":false,"hitInside":false,
 "visible":false,"rects":0}
```

The gate is therefore `hitInside` + rect-against-scroller — which is what
`Advisory`'s own docblock demands of every check on this disclosure.

Both needles are now **derived from the schema's `REFUSALS THIS SCHEMA DOES NOT
ENCODE` clause** rather than typed, for §1's reason.

### Red-first, two plants, both shown on disk

**Plant B1 — the disclosure stuck shut** (`column-layout.tsx:361`,
`display: open ? 'block' : 'none'` → `display: 'none'`). This is the exact
vacuity the rows must refuse, and the result is the proof:

```
(3) disclosure: {"cards":1,"buttons":1,"clicked":1,"expanded":["true"],"allOpen":true}
    clause OPEN: {"leaf":true,"text":"The contract: \"the scene MUST declare anchor\"",
                  "rect":{"top":0,"bottom":0},"hitInside":false,"visible":false,"rects":0}
FAIL [6a]  FAIL [6b]                              24/27
```

`aria-expanded` said **true**, the clause was **findable by text**, and both rows
still went red. A row reading `textContent`, or satisfied by a button count,
would have passed here.

**Plant B2 — the app paraphrases instead of quoting** (`effects-aeon.ts:716,729`,
`The contract: "${…REFUSALS.anchor}"` → `The contract: the scene has to name an
anchor before a remap can run.`, and likewise for `single`):

```
FAIL [6a]  FAIL [6b]                              24/27
```

Both restored with `git checkout HEAD -- <path>` and rebuilt.

---

## 3. `[5b2]` — new row, and an APP finding left red

`[5b]` went red for **two** reasons at once and the run could not tell them
apart. Strict containment was one clause among five, so when the block grew
taller than its own box the row read as "the sentence is wrong". It is not.

```
leaf 280px in a scroller 129px tall ({"top":489,"bottom":769} vs {"top":565,"bottom":694})
```

"Is this on screen" and "does this FIT IN ITS BOX" are two questions, and strict
containment answers both at once. `PAINTED_LEAF` now returns
`centreInScroller` / `tallerThanScroller` beside `insideScroller`; `[5b]` gates
on the on-screen half (the leaf's **centre** in the scroller's box **and**
`elementFromPoint` hitting the leaf — which defeats the 2,635px-outside hazard
containment was added for, at any block height), and `[5b2]` owns the shape.

**It is over the app's own bar.** EW-LAYER-CARD-SCROLLER converts a layer-card
prose block taller than the section's 129px floor; this is 280px. A static census
would not have seen it — it is composed **at refusal time** by `NumberField`,
which appends the ALREADY-MOVED warning to the provider's refusal, and **every**
refusal here carries that tail, because every prefix of a number past the ceiling
is itself a legal plane line and commits on the way.

Recorded once before and never booked: the previous packet's footnote saw it at
`f872db04` as rect 504–735 in a scroller 545–694.

**Diagnostic, so the app lane knows what it is not:** re-run at a 1680x**2200**
screen the scroller still measured **129px** and the block still 280px — it is
not a small-screen artifact. Whether a hand-resized window can grow that box past
280px was **not** measured.

**Fixing it is an app change and is out of this parcel.** Left red, named, and
its message sends the reader to `[5b]` for the words.

*(Not "always red": the same predicate reads `insideScroller: true` on other
leaves in the same run — `[6a]`'s diagnosis and `[6d]`'s capability note.)*

---

## 4. Two defects found in my own instrument on the way

* **`aria-expanded` read in the click's own pass reports the pre-render state.**
  Every button came back `"false"` while the folded sentence was demonstrably
  painted in the very next measurement — a disclosure gate that fails on a
  working app. The click and the read-back are now two evaluations
  (`EXPAND_WHYS` / `WHY_STATE`).
* **`[5a]`'s printed detail still told a reader "aeon would NOT catch 512: its
  ensure tests >= 0 only"** — false since `d593070a`, printed to a person on a
  PASSING row. Now states the contract's two enforcements and that Aurora's is
  the one an author meets. The file header carried the same stale claim and says
  so explicitly rather than being silently corrected.
* **`[5b2]` narrated its neighbour's colour** ("[5b] above … is green") — printed
  verbatim beside a red `[5b]` under the plant. Fixed in `3a5c4cad`.

---

## 5. Final count: **26/27**, every failure named

| row | state | classification |
|---|---|---|
| `[5b]` | **PASS** | expectation rewritten to the true fact, derived from the contract |
| `[5b2]` | **FAIL** | **APP FINDING, left red on purpose** — 280px block in a 129px box; over EW-LAYER-CARD-SCROLLER's bar; app change, out of scope |
| `[6a]` | **PASS** | reads the fold as a discriminating pair; fold ruled house style |
| `[6b]` | **PASS** | same |
| `[4a]` | not run | pre-existing: empty population under a contract admitting only buildable shifts; `[4b-retired]` runs instead |

**NOT MEASURED HERE, still tagged:** that a band visibly compresses toward a
surface. That needs a built ROM in an emulator, and aeon's generator half (9b)
does not exist, so no ROM can be built through this path. **No emulator was
touched.**

### Numbers

| | harness | `npm test` |
|---|---|---|
| before (master `06d91872`) | 23/26 | 7624 passed \| 8 skipped (7632) |
| after (`3a5c4cad`) | **26/27** | 7623 passed \| 9 skipped (7632) |

⚠ **The `npm test` difference is the worktree, not this branch.** Totals match at
7632; the moved test is `test/support/sibling-root.test.ts` step 3, which skips
itself in a linked worktree and says so in its own skip note ("Run the suite from
the main checkout to close this"). No test changed state otherwise, and this
branch touches no `src/` and no `test/`.

---

## What this cost, in one line each

- **A typed literal of a FACT ages into a demand for a falsehood.** `[5b]` did not
  break; the world moved and the row kept asking. Derive the sentence from the
  contract and the next amendment moves the row instead of aging it.
- **A fold is not a deletion, and the argument has to be measured, not preferred.**
  What settled it was reading what is on screen **unclicked** — the premise "an
  author never learns why" was simply false.
- **`innerText` on a hidden node returns `textContent`.** A disclosure row that
  reads text passes on a permanently hidden paragraph; only rect + hit-test tell
  a working fold from a broken one — and a plant that stuck the fold shut proved
  it while `aria-expanded` cheerfully said `true`.
- **A red row with five clauses reports one reason.** `[5b]` was red for its
  words *and* its shape; nobody could tell, and the shape half went unbooked
  through two parcels.
- **`ELECTRON_BIN` alone silently measures another tree's build.** The run root is
  printed on every run. I read it only after a plant failed to redden.
