# LOOPS-TWO-WAY-MARK — a two-way crossover can be drawn from the editor

**2026-09-04.** Branch `feat/loops-two-way-mark`, project LOOPS-P.
Closes `docs/reviews/2026-09-04-loops-test-loop-witness.md` **§6** and its §8 row 3.

Instruments: `test/collision/crossover-span.test.ts` (15 rows), one new row in
`src/core/project/aeon/__tests__/aeon-save.test.ts`, updated rows in
`test/collision/crossover-audit.test.ts` and
`src/renderer/canvas/__tests__/loop-lens-wiring.test.ts`, and the CDP harness
`scratchpad/two-way-mark-harness.mjs` (`npm run harness:two-way-mark`, **25/25**).

---

## 1. The gap, re-derived from source on both sides

The witness packet's §6 is correct in every particular. Restated with the
derivation, because this parcel's whole shape falls out of it:

| fact | where it comes from |
|---|---|
| `COLL_CELL_W` = **8 px** | aeon `engine/system/constants.emp` @ `a2ba03d7`: `BLOCK_TILE_SIZE`(16) `* 8 /` `BLOCK_COLL_COLS`(16) |
| `COLL_CELL_H` = **16 px** | same file: `... / BLOCK_COLL_ROWS`(8) |
| the trigger keys on `$FFF8FFF0` and fires **once per 8 px column entered** | `Player_LoopCrossover`, and measured frame-by-frame in `docs/reviews/2026-09-04-loops-driven.md` §3a |
| it reads the mark from **the plane the player is currently on** | `Collision_GetType(x, y, layer)`; this is what makes a pair behave as a toggle |
| Aurora's cell is 16 px = **2 trigger columns** | `cellTileIndices`, `tc = cellCol * CELL_SUBTILE_COLS` |
| the player **cannot skip a column** | top speed 6 px/frame < 8 px |

So a two-way pair — `hand-off` on A where `hand-off` is also on B — flips the
layer once per column crossed:

```
1 column  → 1 flip   ✓  a two-way crossover
2 columns → 2 flips  ✗  NETS TO NOTHING
```

A mark spanning a whole cell is 2 columns. **Every two-way pair authorable
before this parcel netted to nothing.** One-way marks are idempotent — firing
twice is firing once — which is exactly why the first real loop (§6's two
separated one-way marks) worked and nothing ever surfaced this.

None of the numbers above are typed anywhere in this parcel's gates.
`test/collision/crossover-span.test.ts` **parses aeon's constants at
`a2ba03d7`** and evaluates the expressions, so a change to `BLOCK_COLL_COLS`
reddens the row rather than silently invalidating a comment.

---

## 2. ⚠ WAS THIS AURORA'S ALONE? — the claim, and what actually settles it

**Aeon's `docs/DEFERRED_WORK.md` booked this as contract-shaped:** *"a mismatch
between two tools' grids, and neither lane can close it alone."* **That booking
was wrong, and it is now withdrawn** — aeon reached the same conclusion
independently during this parcel and corrected it.

Here is what I derived myself, before that arrived, because the packet and the
booking are both going to be read by someone.

### 2.1 Aeon's side does not collapse a sub-tile — read from their bake

`tools/ojz_strip_gen.py` `apply_editor_collision_overlay`, at `a2ba03d7`:

```python
for col in range(len(coll_a)):
    if col < W:
        for cr in range(COLLISION_ROWS_PER_STRIP):
            o = (cr * 2) * W + col           # top tile row of the 16px cell
            wa = word(a, o)
```

`col` indexes **Aurora's saved 8 px sub-tile column directly** — un-multiplied —
and `cr` indexes 16 px rows, sampling the cell's top sub-tile row. One output per
`(8 px column, 16 px row)`, which is exactly `COLL_CELL_W` × `COLL_CELL_H`.
**Their bake already discriminates the two halves of Aurora's cell.** There is no
contract surface here: the file format did not change, the encoding did not
change, and the bake needs no amendment.

This is asserted, not narrated: `crossover-span.test.ts` matches
`o = (cr * 2) * W + col` and the `for col in range(len(coll_a))` loop out of the
peer blob, and **fails loudly** (`COULD NOT MEASURE`) when aeon cannot be read —
verified live by pointing `AEON_DIR` at an empty directory.

### 2.2 ⚠ But that was NOT the whole question, and the rest was genuinely open

**Aeon's storage being 8 px granular does not establish that AURORA preserves a
sub-cell write.** Every writer in this editor had, until today, written all four
of a cell's sub-tiles identically — so a normalising step anywhere in
load → save (a resolve, a baseline fill, an `understood` fallback) would have
been invisible for the entire history of the format, and would have shipped a
feature that **works in the editor and is gone from the file**: the worst
possible outcome, because the editor would say it worked.

That is measured, on both roads, and it is the load-bearing half of §2:

- **node** — `aeon-save.test.ts` drives the real `loadAeonProject` +
  `buildAeonSavePlan` over a plane whose two sub-tile columns **disagree**, and
  asserts the disagreement on the far side with the geometry intact. Proven
  red-first by making the save normalise each cell to its top-left word (poison
  M3, below).
- **CDP** — the harness's `[s1]`/`[s2]` do a real **Ctrl+S** into a writable
  aeon copy and read the bytes back **off disk**:

  ```
  [s1] 10321: A=to-b B=to-a · 10577: A=to-b B=to-a      ← the RIGHT sub-column
  [s2] 10320: A=none B=none · 10576: A=none B=none      ← the LEFT one, same cell
  ```

**Verdict: Aurora's alone, and closed.** No contract change, no aeon change, and
nothing waiting on them.

### 2.3 The lead that did not pan out, stated because someone will follow it again

The dispatch's strongest lead was that 8 px addressing might already exist on
the **agent** surface and be missing only from the human brush. **It does not.**
`paint_collision`'s `x/y/w/h` are 16 px cells on *both* its forms (`word` and
`words`), both expand through `cellTileIndices`, and `validatePaintCollisionRect`
bounds them with `cellsW = SECTION_TILES_WIDE / 2`. The `crossover` form is a
*value* axis, not an *addressing* one. There was nothing to expose, and both
roads needed the parameter added.

---

## 3. The design, and why it is shaped this way

**One rule: a crossover mark is addressed in 8 px sub-columns, because that is
the granularity its consumer reads.** Everything else follows.

### `CrossoverSpan` — `'cell' | 'left' | 'right'`

It lives in `core/collision/layer-transition.ts`, the module that already owns
the bit numbers, with the parity argument written beside them. It narrows **the
mark only** — a stroke still reshapes the whole 16 px cell — because the brief's
constraint is right: *do not change the 16 px cell as the general painting unit.*

`'cell'` is the default everywhere and produces a **byte-identical plane** to a
call with no span parameter at all (asserted, not claimed): the narrowed path
returns `null` rather than a complete index set, so the default path never
builds one and takes the merge it always took.

### The control is invisible until it is needed

The mark-width chips render **only while `crossoverBrushAuthors(brush)`** — the
same rule-wired condition that surfaces the crossover lens. The crossover brush
defaults to `keep`, so:

- a collision painter who never touches a loop **never sees this control**;
- there is no mode to leave — disarming back to `Keep` removes it (`[v3]`);
- it is one control, inside a flow that exists for exactly this purpose.

The owner's standing note that the effects tooling is already *"confusing and
convoluted"* is what ruled out the alternative — an always-on fourth axis on the
collision brush that every painter would have to learn.

### The author aims at a half; the agent names one

At `half` the mark lands on the sub-column **under the cursor**
(`spanForTileCol(info.col)` — `info.col` is already the 8 px tile column). So the
human road and the agent road reach **one parameter**: the agent names
`crossoverSpan: 'left' | 'right'`, the human points at it. Two forms of one tool
must not be two rules, and they are not.

### What else had to move, and why each was not optional

| change | what would have been wrong without it |
|---|---|
| the drag cache keys on the span | dragging across a cell's own midline is *"same cursor cell — skip"*, so the second half is **unmarkable in one stroke**. Caught only by `[d1]`. |
| the Alt-propagate no-op guard tests the crossover **each index would actually get** | a guard assuming the whole cell got the mark answers *"already done"* for a cell whose other half is marked — this parcel's own defect, wearing the guard's hat |
| the **lens draws 8 px sub-tiles** | it sampled the cell's top-left, so a left-half mark drew as a full cell and a **right-half mark drew as NOTHING**. An author could paint the only width that works and see no veil — the "two bits nothing depicts" state that lens exists to end. |

---

## 4. The audit now asks whether the mark actually flips the layer

`scanCancellingRuns` walks each maximal run of marked 8 px columns **exactly as
the engine would** — one column at a time, reading the mark from the plane the
player is currently on — and reports a run that contains a two-way pair yet
returns the player to the path he entered on.

**It is not the fitted traversal model the audit's docblock refuses.** That
refusal is about deciding whether a region *is a loop*, which needs surfaces,
speeds and directions the encoding does not carry. This asks a strictly smaller
question that needs none of them, from three derived facts: fire per 8 px
column, read the current plane, cannot skip a column.

- **A run with no pair is never reported.** Two separated one-way marks — the
  shape §6 actually shipped — are runs that deliberately do nothing in one
  direction. A parity-only check would fire on the correct answer.
- **`stride` is required, and its absence is loud.** `cancelling: 0` beside a
  real `pairs` count reads as an all-clear, so without a stride the audit sets
  `cancellingMeasured: false` and **says in words** that the check did not run.

**The §6 request to revisit the one-way warning's wording is done.** It used to
call a one-way mark *"the single most likely authoring mistake"* and tell the
reader to add the pair — advice that, at the only mark width that existed,
**produces this defect**. It now says what a one-way mark *is* (legal, and often
correct: an anchor, or half of a working two-mark loop) and names the one case
that is a mistake.

---

## 5. Which rows discriminate, and which do not

### The node suite

| row | catches |
|---|---|
| `'cell'` equals `cellTileIndices` exactly | any change that made the default narrow something |
| the two halves partition the cell; each is one column, full height, adjacent | a `right` that returned the next cell's column; a half missing its bottom row (which aeon's bake would never read) |
| the stroke marks one half and **the other half is `none`** | ⚠ **the only observation the old and new implementations disagree about** |
| the `words` form equals the `word` form | the two forms drifting into two rules |
| `'cell'` produces a byte-identical plane to no-span-at-all | a back-compat break |
| cell-width pair → `cancelling: 1`, both directions net no flip | the defect itself |
| half-width pair → `cancelling: 0`, **plus a control that widens it by one column and requires the scan to find it** | a scanner that returns `[]` for everything — without that control the half rows are vacuous |
| odd run (3) flips, even run (4) does not | that the check models the traversal rather than testing `width % 2` against a cell size it happens to know |
| two separated one-way marks do **not** fire it | a check that reddens the correct answer |
| aeon's constants and bake, parsed at a pinned revision | the ownership claim in §2, and any drift in either |
| the save round trip over disagreeing sub-tiles | ⚠ §2.2 — a normalising save |

### The CDP harness — `25/25`, exit 0

Four rows are labelled `[DOES NOT DISCRIMINATE]` **in the harness's own output**,
not only here: `v0`, `h0-left`, `h0-right`, `x0`. They rule out "the palette is
missing", "the click missed the canvas" and "cell width means what it always
meant" — each of which would make a neighbouring row vacuous — and are green on
master.

The rows that decide it: `[v1]/[v2]/[v3]` the control is invisible, revealed and
removable; `[h1]/[h2]` × left,right the mark lands on the aimed column and the
other half is clean; `[h3]` the geometry still fills the cell; `[h4]` the app's
own audit says the pair does not cancel; `[h5]` the two halves were **two
different pixels on the same screen** (540 vs 572 at zoom 4, viewport `x=580`
both times, `dx = TILE_PX * zoom = 32`); `[x1]` the identical gesture at cell
width reports `pairs=4 cancelling=1 severity=warn`; `[d1]` a real drag marks
both halves; `[s1]/[s2]` the bytes on disk.

`[geom]` cross-checks the running build's encoding against the source the
harness parsed — the only row that can catch a stale `dist/`.

### The poisons — six, all shown applied on disk, all red, all restored from a committed tip

| id | mutation | result |
|---|---|---|
| M1 | `cellCrossoverIndices` stops narrowing (`return all;` before the filter) | **10 rows red** across all three node files |
| M2 | `buildPlaneEntries` ignores `crossoverAt` | **5 rows red** |
| M3 | the aeon save normalises each cell to its top-left word | **5 rows red**, incl. the §2.2 round-trip row |
| M4 | the lens samples the cell's top-left again (`ty & ~1`, `tx & ~1`) | **2 rows red** — exactly the half-mark rows |
| M5 | `scanCancellingRuns` always returns `[]` | **4 rows red** — including the half-width rows, which is the control working |
| H1 | **CDP:** the brush ignores the mark width | **5 harness rows red**: `h2-left h4-left h2-right h4-right s2` |
| H2 | **CDP:** the drag cache drops the span from its key | **exactly `[d1]` red** (`10320:to-b 10321:none …`) — the only thing that justifies that row's cost |

---

## 6. Verification

| what | result |
|---|---|
| `npx vitest run` | **7 140 passed · 9 skipped · 2 failed** (501 files) |
| the 2 failures | `test/formats/aeon-fixture-currency.test.ts` and `test/formats/effects-channel-bands-drift.test.ts`, both printing their own **"NOT AN AURORA REGRESSION — a vendored aeon fixture is stale"**: aeon `origin/master` moved `a2ba03d7` → `3a247c92` during this session. Neither touches collision. **Not fixed here** — re-vendoring another parcel's effects fixtures from a branch about loops is how a fixture gets updated to match a broken writer. |
| `npx tsc --noEmit` | clean, exit 0 |
| `npm run check:harness-guards` | **214 clean / 214 classified · 0 failures · 0 unmeasurable** |
| `node scripts/check-peer-path-literals.mjs` | OK (1 291 files, 5 rules, all fired on canaries) |
| `npm run harness:two-way-mark` | **25/25, exit 0**, against a fresh `git archive origin/master` copy of aeon |
| `git -C ../aeon status --porcelain` | untouched — the harness refuses the live tree by construction (compared against `siblingDefaultPath`, so the guard is not comparing the override to itself) |

⚠ **`npm test` does not reach vitest in a linked worktree** and it is not this
branch: the chain stops at `check-cited-paths` with `COULD NOT MEASURE`, because
a linked worktree symlinks `node_modules` and `git check-ignore` refuses any path
beyond a symlink. Same environmental cause the witness packet recorded. The
aggregate above was taken with `npx vitest run`.

### Three of my own defects, caught by these gates and reported rather than hidden

1. The aeon-constants parser captured `[^/\n]+` to strip the comment — which
   **truncates `BLOCK_TILE_SIZE * 8 / BLOCK_COLL_COLS` at the DIVISION** and
   reads `COLL_CELL_W` as 128. It failed loudly *because the expectation was
   derived*; a typed `expect(cellW).toBe(8)` would have been a parse bug wearing
   a green tick.
2. The node fixture planes were four sub-tile rows tall, so a cell-row-2 write
   fell off the end and `Uint16Array` **dropped it silently** — a green "nothing
   was marked" that looks exactly like a working narrowing. Caught by the
   anti-vacuous assertion in the row itself.
3. The harness's `[h0]` control demanded that **every** sub-tile change, which is
   precisely what a half-cell mark does not do: the control went red while the
   feature rows it protects went green. A control that fails when the feature
   works is worse than no control — it invites someone to "fix" the feature.
   Also `[r1]` correctly caught the harness recording the same cell once per
   phase and replaying a poked word last.

---

## 7. ⚠ [TAG-FOREGROUND] — the emulator run this parcel cannot do

**No emulator was touched, by invariant.** Everything above is bytes: what an
author can now author, and what reaches the file aeon's bake reads.

**What is unproven:** that `Sst.layer` flips **exactly once** through a
half-width two-way pair, and **twice (net zero)** through a cell-width one.

### The cheapest decisive check

The witness packet's §7 is the whole driving recipe and it still applies. The
addition here is that the fixture must be **built two ways**:

1. Take the §6 loop layout, but replace the two separated one-way marks with a
   **single two-way pair** at the apex-adjacent column — authored through the
   editor at **`Half (8px)`** mark width, `A+B` on, `hand-off` armed.
2. Build a second tree with the **identical gesture at `Cell (16px)`** width.
   This is the control, and it is the good kind: the two inputs differ in
   **exactly one 8 px column of two words per plane**.

Drive both ROMs with the same input, rightward, real physics (`debug_flag`
`$FF9036` must read `0x00`), and sample **`Sst.layer` at `Player_1+$2D`**
across contiguous frames — never a screenshot; this lane has a 0-of-27 result on
screenshot evidence.

| ROM | what confirms the parcel | what refutes it |
|---|---|---|
| **half-width pair** | `layer` goes `0 → 1` on entering the marked column **and stays 1** | it flips and flips back within a frame or two |
| **cell-width pair** (control) | `layer` returns to `0` — the defect, reproduced | it stays 1, which would mean the parity model is wrong and §1 needs re-deriving |

Also worth one glance while there: `PlayerBlock.xover_cell` at `$FFFFE93A`
should show **one** id change inside the half-width mark and **two** inside the
cell-width one. That is the mechanism, directly.

⚠ Resolve every address from **that build's own listing**, matched on the name.
The addresses in the witness packet are true for its pair of ROMs and move with
the build.

---

## 8. What is open

| # | what | why |
|---|---|---|
| 1 | **Nobody has driven it.** | §7. No emulator from a background agent — invariant, not an oversight. |
| 2 | The hover **preview** does not depict the half. | The lens does (`[h1]`/`[h2]` and the `w: 8` rects), and the lens is the thing that shows what is *authored*. A half-width hover preview is a small, separable improvement and is deliberately not smuggled in here. |
| 3 | Aeon's anchor `docs/LOOP_CROSSOVER_ENCODING.md` **§3.3 still has no parity constraint**, and its worked example is still the one the witness packet's §8 row 3 flagged. | aeon's document to amend. §1 of this packet is the derivation they need; nothing in Aurora is blocked on it. |
| 4 | The audit reports a cancelling run but **cannot name a world coordinate** — only a sub-tile index. | Same shape as the existing `oneWayAt`/`selfMarkAt` samples. Worth a follow-up that turns an index into `(section, cell, half)` for every class at once, rather than one class at a time. |
| 5 | `crossoverSpan` accepts `left`/`right`, not an arbitrary odd width. | Three-column pairs work (asserted), but nothing can author one in a single gesture. No use for it has been named; adding it before one exists would be a control with no reader. |
