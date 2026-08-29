# Two parcels grew one tool in different directions — what the combinations mean

**Branch** `reconcile-paint-collision` · **base** master `4463331` · **merged** `lp2-loop-paint` `636d8ff`
**Merge commit** `bbc86d1` · **Project** LOOPS-P
**Sides** `docs/reviews/2026-08-29-collision-read.md` (A, on master) · `docs/reviews/2026-08-29-loop-paint.md` (B)
**Instruments** `npm run harness:collision-read` (A, 32 rows) · `npm run harness:loop-paint` (B, 45 rows)
**New rows** `test/agent/paint-collision-reconcile.test.ts` (25) · `src/renderer/agent/__tests__/agent-handler.collision-reconcile.test.ts` (16)

---

## 1. The three axes, and the one that is not an axis

After the merge `paint_collision` has **three independent axes** and
`get_collision_region` has **none of the third**:

| axis | values | from |
|---|---|---|
| **FORM** | `word` (fill the rectangle) **XOR** `words` (one packed word per cell, row-major, `null` = leave that cell alone) | side A |
| **PLANE** | `'a'` · `'b'` · `'both'` — `'both'` is a **MODE**, not a third plane | side B |
| **CROSSOVER** | absent = `keep` · `keep` · `clear` · `hand-off` | side B |

`get_collision_region` takes FORM (n/a — it is a read) and PLANE, and **its
PLANE is `'a' | 'b'` only**. That asymmetry is the parcel's one refusal and §4
argues it.

---

## 2. THE COMBINATION MATRIX

**FORM × PLANE × CROSSOVER on `paint_collision` — 18 cells, all legal.**
`absent` and `keep` are the same request by construction (`req.crossover ?? 'keep'`),
so the table lists `keep` once and the absent case is proven separately by `[h2k]`.

| # | form | plane | crossover | verdict | why it is forced, not chosen | row |
|---|---|---|---|---|---|---|
| 1 | `word` | a / b | keep | **works** — side B, unchanged | the original fill | side B `[b*]`, harness `[w5]` |
| 2 | `word` | a / b | clear / hand-off | **works** — side B, unchanged | | side B `[x*]`, harness `[w1]` |
| 3 | `word` | both | keep | **works** — side B, unchanged | | side B, harness `[w2]` `[w3]` |
| 4 | `word` | both | clear / hand-off | **works** — side B, unchanged | the two-way pair | harness `[w1]` |
| 5 | `words` | a / b | keep | **works** — side A, unchanged | the read's round trip | side A `[r1]` `[r2]` |
| 6 | `words` | **both** | keep | **WORKS, IMPLEMENTED** | Neither rule changes. `'both'` already means "each cell merged against its OWN plane's word"; `words` already means "one brush word per cell instead of one per rectangle". The cell plan is built **once** and handed to **each plane's own merge**, exactly as the fill form hands one index list to each plane's own merge. There is no third behaviour available for it to have. | `[m1]`, `[h1]` |
| 7 | `words` | a / b | **clear / hand-off** | **WORKS, IMPLEMENTED** | The tri-state applies to **every cell the call WRITES and to no cell it skips**. That is not a new rule: `null` means "leave this cell alone", which is a statement about the CELL, so it outranks the crossover axis — a skipped cell keeps its crossover **even under `clear`**. | `[m2]`, `[h2]` |
| 8 | `words` | **both** | **clear / hand-off** | **WORKS, IMPLEMENTED** | The composition of 6 and 7, with side B's rule intact: the other plane gets `crossoverFor(brush, otherPlane(aimed))`, **never a copy** — so `hand-off` is the two-way pair per written cell and a self-mark stays unreachable. | `[m3]`, `[h3]` |
| 9 | either | any | any, but **both `word` and `words`** | **REFUSED** (pre-existing, re-proven under the new axes) | two answers, and this layer would be picking one silently | `[m6]`, `[h4]` |
| 10 | **neither** `word` nor `words` | any | any | **REFUSED** — *a crossover alone is not a paint* | `crossover: 'hand-off'` with no word names no picture; accepting it would make the tool a crossover-only writer nobody designed | `[m6]`, `[h4]` |

**`get_collision_region` × PLANE:**

| # | plane | verdict | row |
|---|---|---|---|
| 11 | `'a'` / `'b'` | **works** — side A, unchanged | side A's 32 rows |
| 12 | **`'both'`** | **REFUSED, in prose, at two independent gates** (§4) | `[m5]`, `[m7]`, `[h4]` |

**The sharp edge the merge created, which is not a combination but is the thing
an agent will get wrong:**

| # | | verdict | row |
|---|---|---|---|
| 13 | bits 15:14 **inside** a `words[i]` value | **IGNORED** — masked off like every unowned bit; the destination keeps its own. A `words` round trip **over itself** is exact; the same `words` written **somewhere else** moves the picture and **not** the crossover. Author it there with the `crossover` parameter. | `[m4]`, `[h5]` |

### Nothing else was invented

Every cell of the matrix above is either an existing behaviour or a
composition in which **neither side's rule changed**. Where a combination
would have required inventing a third behaviour — the read's `'both'` — it is
refused. No cell was made up to complete the merge.

---

## 3. Reconciled beyond the union: the merge made a true statement false

Side A's `get_collision_region` description said, correctly on the day it
landed:

> `"word"` is all 16 raw bits including 15:14, **which no Aurora field owns**
> and which a paint preserves

Side B gave those bits a name **hours later**. After the merge that sentence is
false, and worse than false: it leaves an agent able to **write** a crossover by
name and unable to **see** one, on the surface whose entire purpose is verifying
what a write did. So three things changed on the read, all additive:

- each uniform cell carries **`crossover`** — `none` / `to-a` / `to-b` /
  **`reserved`** — read through `layer-transition.ts`, the only module allowed
  to know a bit number. `reserved` (the illegal 3 aeon's bake hard-errors on) is
  **reported, never normalised away**, for the reason `readCrossover` states.
- the reply carries **`crossoverCells`** beside `cellsWithUnownedBits`. **The
  duplication is deliberate**: the two are computed from independent constants
  and agree today only because `COLLISION_CELL_UNOWNED_MASK === CROSSOVER_BITS`,
  a coincidence `layer-transition.test.ts` asserts. The day `packCollisionCell`
  grows into bit 14 they part company, and an agent seeing them disagree has
  learned something true that one number would have hidden. Row
  `[m8]` asserts the coincidence rather than relying on it.
- the descriptions of **both** methods now state that a crossover does not
  travel inside `words`.

A mixed cell has **no** `crossover` field, like every other unpacked field —
but it still **counts** toward `crossoverCells` if any sub-tile carries one,
because a cell whose sub-tiles disagree about a loop handoff is the most, not
the least, worth surfacing (`[m8m]`).

**This is the one place I went past a mechanical union, and it is reversible.**
The alternative was to fix only the prose and leave the read reporting raw bits
for a field the write authors by name.

---

## 4. ⚠ The refusal: `get_collision_region` has no `plane: "both"`

An agent that has just used `plane: "both"` on the write **will** reach for it
on the read. The read cannot honour it, and the reason is the one this very
method already committed to one level down:

- **MERGING the two planes into one grid** is exactly the flattening
  `readCollisionCell` refuses for a cell whose four 8px sub-tiles disagree —
  there it reports `{word: null, mixed: true}` rather than sampling one of the
  four, on the argument that *an instrument which averages away disagreement
  cannot report the one thing it was built to catch*. **Two planes disagreeing
  is the same disagreement one level up, and the same answer applies.** It is
  also the disagreement the whole loop feature is about: side B's crossover lens
  exists because "marked on one plane only" is invisible.
- **RETURNING TWO GRIDS** makes the reply's **shape depend on a parameter**, and
  leaves `words` — whose entire purpose is to feed straight back into
  `paint_collision` as one array — with no single value.

Two calls express it exactly and cost an agent one round trip. So the read
refuses, **in prose**, at two independent gates:

| gate | what it does | proven red-first by |
|---|---|---|
| `z.enum(['a','b'])` in `editor-methods.ts`, with the whole argument on the param's `.describe()` | the MCP schema never advertises a value that always fails, and the reason is in the text an agent reads **before** it calls | `[m7]` — the schema row stayed GREEN under plant P4, because the two gates are genuinely independent |
| `validateCollisionReadPlane` in the handler | any road that reaches `handleAgentRequest` without passing that schema still gets the prose, not a bare enum error | `[m5]`, `[h4]` — 2 red under P4 |

A bare `Invalid enum value. Expected 'a' | 'b', received 'both'` would teach an
agent that the read is **unfinished** rather than that the asymmetry is
deliberate. That gap — the method description being the only documentation an
agent gets — cost this repo a parcel two days ago
(`2026-08-29-agent-paint-priority.md` §4), and both sides' packets open on it.

---

## 5. Red-first — eight plants, each restored, the tree verified clean

Run over the reconciliation rows **plus both parcels' own collision suites**
(`paint-collision-cells`, `collision-region-read`, `both-planes-paint`,
`layer-transition`, `crossover-audit`, and the two new files) — **136 rows
green** before and after every plant.

| # | plant | red | which rows |
|---|---|---|---|
| P1 | the per-cell both-planes builder merges the other plane against the **AIMED** plane's words | **3** | `[m1]` main, `[h1]` main, **and `[h1u]` the undo row** |
| P2 | the other plane gets a **copy** of the aimed plane's crossover value | **3** | `[m3]`, `[m3=]` (fill/cell agreement), `[h3]` |
| P3 | the single-plane per-cell form **drops** the crossover axis | **4** | `[m2-a]` `[m2-b]` `[m2c]` `[m4x]` — and **no handler row**, because the handler reaches the both-planes builder instead. Stated, not glossed: P3 alone does not prove the handler carries the axis, which is what P3b is for |
| P3b | the **both-planes** per-cell road drops the crossover axis | **6** | `[m3]` + all four `[h2]`/`[h3]` handler rows |
| P4 | `validateCollisionReadPlane` quietly accepts `'both'` | **2** | `[m5]`, `[h4]` — **`[m7]` stayed green**, which is what proves the zod gate and the handler gate are two gates and not one |
| P5 | the per-cell form becomes a **TRANSFER** (words written whole, 15:14 riding along) | **18** | including **three of side A's own preservation rows** — the decider/transfer distinction is shared ground and the plant reds both parcels |
| P6 | the read reports every cell as `crossover: 'none'` | **5** | `[m8]`, `[m8=]`, `[m4=]` (its anti-vacuous guard), `[h4]`, `[h5]` |
| P7 | `plane: "both"` emits **two commands** instead of one | **1** | **only `[h1u]`** — every byte still lands, so every "the bytes are right" row stays green. This is the plant that shows the undo row is not decoration |
| P8 | `skipped` counted once **per plane** | **2** | `[m1n]`, `[h1n]` |

After each: `git checkout -- <file>`, `git status --short` empty, `npx tsc
--noEmit` clean, 136/136 restored.

### Rows that do NOT discriminate, named

- **`[m6]`** (`word` XOR `words` still refused) is side A's rule re-asserted
  under the new axes. It is a **regression guard on shared ground**, green on
  master too, and is not evidence of anything this parcel added.
- Side A's harness names `r5b` and `r6`; side B's names `w6`. Both harnesses
  print their own non-discriminating rows at the end of every run, unchanged.
- **`[m1] CONTROL`**, **`[h1] CONTROL`**, **`[h3c]`** and the `not.toBe`
  anti-vacuous guards are converse controls by design: they exist so a "wrote
  nothing" or "wrote everything" bug cannot pass the row beside them.

### The anti-vacuity problem, and how every row escapes it

Bits 15:14 are **zero in all 18 shipped plane files, all 65,536 cells each**
(aeon `fde35b2f`, quoted in side B's packet). So a row that paints over default
data **cannot tell** "each plane merged against its own cell" from "one merged
word broadcast to both". Every row above therefore **seeds its destination with
a non-zero, per-plane-DIFFERENT crossover** (plane A `to-b`, plane B `to-a`)
before it paints, and **asserts the seed landed** before the paint. Two zeros
could not tell a pair from a copy.

---

## 6. Proof

### Node — **5,614 passed / 0 failed / 7 skipped**, `tsc --noEmit` clean

Aggregate read whole from one run, never a tail.

| | rows | source |
|---|---|---|
| master `4463331` | 5,504 | the overseer's figure, and it reproduced |
| **merged, before any new row** | **5,573** | measured on this branch at the merge resolution — **exactly** master + side B's 69 |
| + this parcel's 41 rows | **5,614** | 25 core/schema + 16 handler |

The predicted ~5,573 was right for the merge itself, and the arithmetic closes
in both directions: side B's own base was 5,468 and its packet reports 5,537,
so side A contributed 5,504 − 5,468 = **36** and side B **69**; 5,504 + 69 =
5,573. Nothing was lost in the merge.

### The running app — both harnesses, **unchanged**, on build `bbc86d1`

Built `VITE_AURORA_DEBUG=1 npm run build` from a clean tree at merge commit
`bbc86d1`; both runs are against **that** build.

| harness | result | notes |
|---|---|---|
| `npm run harness:collision-read` (side A) | **32/32**, wall clock 4.1s | non-discriminating: `r5b`, `r6`. `[z1]` restored 360 sub-tiles, 0 still differ |
| `npm run harness:loop-paint` (side B) | **45/45** | non-discriminating: `w6`. `[r1]` restored 56/56 cells; `[r2]` asserts the section carries no crossover at exit |

**No row of either harness was edited.** Side B's `[w1]` reply now prints
`"skipped":0` — the field the merge added to the fill road so `skipped` means
the same thing on both forms — and no row was sensitive to it.

Both harnesses restore the shared discovery file and refuse a port they do not
own; that machinery was not touched. Neither run issued a save, and the app has
no autosave, so nothing either run did reached the owner's files.

---

## 7. What changed

| file | why |
|---|---|
| `src/shared/agent-protocol.ts` | the union: three axes on `paint-collision`, `'a' \| 'b'` on `get-collision-region` with the refusal argued in place |
| `src/main/editor-methods.ts` | the schema and **the descriptions**, which are the deliverable — every combination stated, because an agent cannot read the source |
| `src/renderer/agent/agent-handler.ts` | the dispatch: FORM picks the builder, PLANE and CROSSOVER pass through to the same merge under either one; the read's prose refusal; `skipped` on both roads |
| `src/core/collision/both-planes-paint.ts` | `buildPlaneCellEntries` + `buildBothPlanesCellEntries` — the per-cell form of the two rules, **inherited by calling** `buildPlaneEntries` and `otherPlane`, never by restating them |
| `src/core/collision/collision-paint.ts` | `collisionRectCells`, `paintCollisionCellsBothPlanes`; the auto-merge had left `paintCollisionCellEntries` calling an import side B had removed |
| `src/core/collision/collision-region-read.ts` | per-cell `crossover`, `crossoverCells` (§3) |
| `src/core/agent/validation.ts` | `validateCollisionReadPlane` — the refusal, with the argument in the docblock |
| `package.json` | one line: both harness scripts kept |

---

## 8. Open, and tagged

- **TAGGED for foreground follow-up — no runtime/emulator work was done or
  attempted.** Nothing here touched `mcp__oracle__*`. Whether a painted
  crossover reaches a built ROM is unchanged from side B's §8 and still
  unanswerable until aeon's read site exists.
- **Side B's §7 hold stands unchanged.** `tools/repaint_ojz_collision.py`
  discards bits 15:14, so no crossover may be written into the owner's real OJZ
  files until aeon's preservation fix lands. This parcel adds a **second** way
  to author one (`words` + `crossover`), which widens the surface the hold
  covers without changing the hold.
- **Side B's §7 asks to aeon are unchanged and still owed**, including the
  `{TO_B, TO_B}` contradiction in anchor §3.3.
- **The human road did not grow a per-cell form** and deliberately: `words` is
  an agent affordance (the read's round trip), and there is no gesture on the
  canvas that means "one word per cell over a rectangle". The A+B and crossover
  chips are unchanged.
- **`crossoverCells` is reported for the READ only.** The paint reply already
  carries the whole-section `crossoverAudit`, which is the stronger number for a
  writer; adding a per-rectangle count beside it would be two numbers about
  different scopes on one reply.
