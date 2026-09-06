# The hover preview draws the mark at the width the click will author

LOOPS-P, 2026-09-06. Branch `parcel/loops-hover-half`.

Closes `docs/reviews/2026-09-04-loops-two-way-mark.md` §8 row 2, taken as the
separable improvement that row describes and not widened.

---

## 1. What was actually wrong, which is not quite what the row says

The row says the preview "does not depict the half". Read literally that suggests
the preview drew a half-width mark as a whole cell. It did not. **It drew no mark
at all.**

What the collision hover preview draws is the stroke's **geometry** footprint:
one 16px outline per cell the stroke would reshape, plus the shape ghost at the
cursor cell. That is correct and is unchanged by this parcel — a stroke reshapes
the whole 16px cell whatever the mark width says, and `paintCollisionCell`'s own
`[h3]` row in `scratchpad/two-way-mark-harness.mjs` pins exactly that.

The **mark** is the field whose consumer reads Aurora's saved plane more finely
than a cell (aeon's trigger fires once per 8px column). It had no depiction
before the click. So at "Half (8px)" the whole picture under the cursor was a
16px outline for a write about to touch one 8px sub-column of it, and the author
could not see *which* sub-column, or that it was a half at all.

The fix is therefore to *add* the mark's footprint, at its true width — not to
narrow anything that was there.

## 2. Which function decides the width

`crossoverSpanForCursor(mode, tileCol)`, new in
`src/core/collision/collision-cell.ts` beside `spanForTileCol`:

```ts
export function crossoverSpanForCursor(mode: CrossoverSpanMode, tileCol: number): CrossoverSpan {
  return crossoverSpanIsHalf(mode) ? spanForTileCol(tileCol) : 'cell';
}
```

It is the **only** place either road turns a cursor column into a
`CrossoverSpan`. Both call sites are in `src/renderer/components/MapViewport.tsx`
and there are exactly two of them:

| road | call | argument for the column |
| --- | --- | --- |
| commit | `paintCollisionCell` | `info.col` — the 8px tile column from the canvas hit test |
| preview | `drawCollisionPreview` | `hover.col` — the same hit test's column, now carried on `previewHoverRef` |

`grep -n "crossoverSpanForCursor\|spanForTileCol" src/renderer` returns those two
plus the definition; nothing else in the renderer computes the parity.

The **footprint itself** shares one step further down. The commit path builds its
mark set as `crossoverMarkIndices(targets, SECTION_TILES_WIDE, crossoverSpan)`
and the preview turns *that same call* into rects
(`src/renderer/canvas/crossover-preview.ts`). So the shared thing is not merely
the width: it is the array of sub-tile indices, built once, from one function,
with one set of arguments.

Two structural properties that make a duplicate hard to reintroduce:

* `crossoverPreviewRects` **cannot** compute a span even if someone tried — it is
  handed a resolved `CrossoverSpan` and never sees a cursor column.
* the rect width is `CROSSOVER_SUBTILE_PX`, the crossover **lens's** own unit
  (`BOTH_PLANES_CELL_PX / CELL_SUBTILE_COLS`), so the thing shown before the
  click and the thing shown after it are drawn at one scale. No `8` is typed.

### 2.1 The redraw trigger, which is the same lesson the drag cache learned

Moving from one half of a cell to the other is "the same cell" by the
`cellCol`/`cellRow`/`alt` test the preview's cheapness guard used to make. Left
alone, the preview would have kept drawing the **first** half while the click
marked the second — this parcel's own defect, reintroduced by the optimisation,
and exactly the shape `lastPaintedCell`'s `cellKey` had to grow a span for in the
2026-09-04 parcel. The trigger now compares the resolved span too. In `cell`
mode the span is constant, so the redraw cadence is byte-for-byte what it was.

## 3. What is verified, and by which instrument

### 3.1 `npm test` — geometry only

`src/renderer/canvas/__tests__/crossover-preview.test.ts`, 6 rows. Nothing typed:
widths from `CROSSOVER_SUBTILE_PX`, counts from `CELL_SUBTILE_COLS` /
`CELL_SUBTILE_ROWS`, and the side row derives the expected x from the **sub-column
aimed at** rather than from the span, exhaustively over a cell's columns.

Whole suite, this branch, main run: **514 files passed / 3 skipped, 7469 tests
passed / 9 skipped**, exit 0. Every skip named its reason (the 9 are
pre-existing: absent `s4_engine` fixtures, the linked-worktree `sibling-root`
row, and the opt-in `compose-bench`).

### 3.2 `npm run harness:loops-hover-half` — the wiring, and the seam

`scratchpad/loops-hover-half-harness.mjs`, new. 16 rows.

It reads **the ghost's own canvas** (`#map-preview-canvas`, an id added for this)
via `getImageData`, not a screenshot of the composite. And it does not look for a
colour: it latches the ghost with the crossover brush at `keep` (which authors
nothing, so no mark is drawn), arms `hand-off`, re-hovers, and **diffs**. Nothing
else in `drawCollisionPreview` reads the crossover brush, so the changed pixels
*are* the mark's footprint — with no colour constant copied into the harness, and
the rows survive the mark being restyled.

The rows that matter:

* `[c1]` arming the crossover brush changes the picture under the cursor at all.
  On master it changed it **not at all**; this is the row the old behaviour fails
  outright.
* `[w1]`/`[w2]`/`[w3]` the band is one sub-column wide and sits on the sub-column
  the cursor is in, left and right measured separately.
* `[w5]` the control: the same hover at Cell width is `CELL_SUBTILE_COLS`x wider,
  so `[w1]` is about the mark width and not about the ghost being small.
* `[s1-left]`/`[s1-right]` **the seam.** Measure the footprint at an integer
  client pixel, then click *that pixel*, read which sub-tiles carry a crossover,
  convert the written sub-columns back into backing px, and compare.
* `[m1]`/`[m2]` one mouse move across a cell's own midline, no parking and no
  leaving the cell: the redraw trigger.

### 3.3 dpr, and the numbers beside the claims

`devicePixelRatio` has been seen at 1 and at 1.35 on this box hours apart, and
this is an 8px-wide feature. Two defences:

1. every aim is an **integer client pixel**, verified by inverting the transform
   and checking it lands in the 8px sub-tile that was meant (`aimAtTile`, taken
   from `scratchpad/two-way-mark-harness.mjs`); a miss is a thrown refusal, not a
   red feature row;
2. dpr never enters the pixel arithmetic at all — MapViewport sizes the ghost's
   backing store from the container's **CSS** rect
   (`pcv.width = Math.floor(rect.width)`), so the diff box is in CSS px.

Measured every run and printed beside the geometric rows rather than assumed:

```
preview canvas: backing 876x774 · css rect (284,74) 876x774
                · css→backing scale=1 · devicePixelRatio=1
[w1] got x0=240 w=32 · want x0=240 w=32 · scale=1 dpr=1 · aimed integer client (540,330)
[w3] got x0=272 w=32 · want x0=272 w=32 · aimed integer client (572,330) vs left (540,330)
[w5] cell x0=240 w=64 · want x0=240 w=64 · half was 32
```

At zoom 4 a sub-tile is 32 backing px and a cell is 64. Both derived from
`BOTH_PLANES_CELL_PX` and `CELL_SUBTILE_COLS` parsed out of source; nothing typed.

**Run count: three green runs of the restored tree** (16/16 each), plus four
planted runs below. Environment identical across all seven: xvfb-run
`-screen 0 1600x1000x24`, Electron from
`/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`, `AEON_DIR` a fresh
`git archive origin/master` copy of aeon (never the live tree), dpr 1, css→backing
scale 1, zoom 4, port 9437.

## 4. The plant proofs

Every mutation was applied to a **committed** baseline, quoted from disk via
`git diff`, run red, then restored with `git checkout <path>` and run green.

### 4.1 Unit level: a footprint that always draws a full cell

Mutation (`git diff -U1 src/renderer/canvas/crossover-preview.ts`):

```
-  return crossoverMarkIndices(targets, width, span).map((index) => {
+  return crossoverMarkIndices(targets, width, 'cell').map((index) => {
```

RED: `Tests 5 failed | 1 passed (6)` —

```
× ⚠ a HALF mark is drawn one sub-column wide, NOT a whole cell
× every rect is exactly one sub-tile, and a half covers BOTH sub-tile rows
× ⚠ the footprint sits on the sub-column the CURSOR is in, for every column of the cell
× a multi-cell stroke marks its span in EVERY target, not just the cursor cell
× the rects ARE the commit path's mark indices, in world px
  AssertionError: expected 16 to be 8
```

Restored (`git checkout`, tree clean): `Tests 6 passed (6)`.

### 4.2 Unit level: the shared parity rule moves

Mutation (`git diff -U1 src/core/collision/collision-cell.ts`):

```
 export function spanForTileCol(tileCol: number): Exclude<CrossoverSpan, 'cell'> {
-  return tileCol % CELL_SUBTILE_COLS === 0 ? 'left' : 'right';
+  return tileCol % CELL_SUBTILE_COLS === 0 ? 'right' : 'left';
```

RED, and exactly one row: the side row, which ties the drawn x to the aimed
column and not to the span —
`AssertionError: expected { d: +0, left: 664, width: 8 } to deeply equal { d: +0, left: 656, width: 8 }`.
Restored: 6/6.

### 4.3 App level: PLANT-1, a preview that always draws a full cell

`src/renderer/components/MapViewport.tsx`:

```
     if (crossoverBrushAuthors(xoBrush)) {
-      const span = crossoverSpanForCursor(
-        useEditorStore.getState().collisionCrossoverSpanMode, hover.col);
+      const span = 'cell' as CrossoverSpan;   // PLANT-1: always a whole cell
```

Rebuilt with `VITE_AURORA_DEBUG=1 npm run build`, harness re-run: **9/16**, seven
rows red — `[w1] [w3] [w5] [s1-left] [s1-right] [m1] [m2]`. (`[m1]` goes red for
its own reason and it is the right one: at cell width, moving across the midline
changes nothing, so the diff is empty — which is precisely what a preview that
cannot see the half looks like.)

### 4.4 App level: PLANT-2, a preview that computes its own span

This is the failure the brief names, and it is the one that "looks correct in
every screenshot". It needs a **differential**, because a duplicate that agrees
with today's rule is by construction invisible. Three runs, same rule mutation as
§4.2, same harness:

| run | preview's span comes from | `spanForTileCol` | result |
| --- | --- | --- | --- |
| 2a | its own parity, `hover.col % 2 === 0 ? 'left' : 'right'` | unchanged | **16/16 green** |
| 2b | its own parity (same duplicate) | inverted | **14/16** — `[s1-left]`, `[s1-right]` red; every `[w]` row green |
| 2c | `crossoverSpanForCursor` (the committed code) | inverted | **14/16** — `[w2]`, `[w3]` red; both `[s1]` rows **green** |

Read 2b against 2c: the *same* mutation to the shared rule produces **opposite
failure signatures**. With the duplicate, the ghost and the write disagree and
only the seam rows can see it. With the shared call, the ghost follows the write
(seam green) and what fails instead is the rule-versus-cursor row. That is what
establishes that `[s1]` measures *sharing* and `[w2]`/`[w3]` measure *the rule* —
neither is a restatement of the other.

Run 2a is the honest limit, stated rather than hidden: **a duplicate that is
correct today passes all 16 rows.** No instrument in this repo can distinguish
"asks the shared function" from "happens to agree" without moving the function.
The protection against 2a is structural (one call site each, and
`crossoverPreviewRects` cannot see a cursor column), not behavioural.

Restored: `git checkout` both files, tree clean at the committed tip, rebuilt,
three green 16/16 runs.

## 5. What I did NOT establish

* **Nothing in `npm test` runs any `harness:*` script.** If the MapViewport
  *wiring* regresses — the preview stops calling the function, or stops being
  drawn — the suite stays green. Only `crossover-preview.test.ts`'s geometry is
  covered by the suite. Said in the harness header and in the test file too.
* **A correct duplicate is undetectable** (§4.4 run 2a).
* **Nothing about the engine.** No emulator was touched. Whether the marks these
  gestures author make `Sst.layer` flip is a foreground run and is not claimed
  here. `[TAG-FOREGROUND]` in the harness output says so.
* **Colour and legibility are not measured.** The mark is drawn in the crossover
  lens's fill/edge (and `COLLISION_PREVIEW_ERASE` for the `clear` brush) so that
  the picture before the click and the picture after it read as the same thing.
  Whether that reads well over the shape ghost at low zoom is an aesthetic call
  nobody has looked at on a real display; the harness only measures *where* the
  pixels changed, never *what colour* they are.
* **One machine, one dpr.** All seven runs reported `devicePixelRatio=1` and
  `scale=1`. The arithmetic is dpr-independent by construction (§3.3) but that
  claim has not been *observed* at 1.35.
* **`brush > 1` and Alt-propagate are covered by a unit row only.** The preview
  draws the mark on every target because `crossoverMarkIndices` is given the
  whole target set, and `crossover-preview.test.ts` pins it; no harness row
  hovers with a 3x3 brush.

## 6. Files

| file | what |
| --- | --- |
| `src/core/collision/collision-cell.ts` | `crossoverSpanForCursor`, `crossoverMarkIndices` |
| `src/renderer/canvas/crossover-preview.ts` | the footprint, index set to world rects |
| `src/renderer/components/MapViewport.tsx` | the preview draws it; the commit path and the redraw trigger use the shared calls; `id="map-preview-canvas"` |
| `src/renderer/canvas/__tests__/crossover-preview.test.ts` | 6 rows |
| `scratchpad/loops-hover-half-harness.mjs` | 16 rows |
| `package.json` | `harness:loops-hover-half` |
