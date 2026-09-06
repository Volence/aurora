# LOOPS-AUDIT-COORDS — the crossover audit names a place

**2026-09-06.** Branch `parcel/loops-audit-coords`, project LOOPS-P.
Closes `docs/reviews/2026-09-04-loops-two-way-mark.md` **§8 row 4**, for every
class at once as that row asks.

Instruments: `test/collision/crossover-locus.test.ts` (21 rows) and the CDP
harness `scratchpad/audit-coords-harness.mjs` (`npm run harness:audit-coords`,
**9/9**). `npm test` **513 files / 7 463 passed, 9 skipped, 0 failed**, exit 0.

---

## 1. What it said, and what it says now

A real example, from the running app (harness row `[n1]`, screenshot
`docs/captures/2026-09-06-audit-coords/n1-note-names-a-cell.png`): a plane-A
word carrying `XOVER_TO_A` at sub-tile index 10320 of section 0.

**Before** (the sentence master composes for the same document):

> 1 SELF-MARK (first at index 10320): a plane whose word sends you to the plane
> you are already on. It can never fire, and aeon's bake refuses it (rule R2).

**Now:**

> 1 SELF-MARK (first at **section 0, cell (col 40, row 20), left half (8px
> column 80, index 10320)**): a plane whose word sends you to the plane you are
> already on. It can never fire, and aeon's bake refuses it (rule R2).

Four things are in that fragment and each earns its place:

| part | why it is there |
|---|---|
| `section 0` | not derivable from the arrays at all; see §3 |
| `cell (col 40, row 20)` | the 16px cell an author paints, and the SAME units `paint_collision`'s `x`/`y` take (`editor-methods.ts`: *"cell col (16px units, 0-127)"*), so an agent can paint the fix without decoding anything |
| `left half` | the 8px engine trigger column, in the vocabulary of the map brush's own mark-width control |
| `8px column 80, index 10320` | `80` is aeon's `col` in the bake's rule-R2 error (`sec {sec_id} plane {plane_name} col {col} row {cr}`), so the two messages line up; the index is kept because the debug hooks, four harnesses and two landed packets already quote it |

All four classes go through one formatter: `reserved`, `selfMarks`, `cancelling`
and `oneWay`. Doing one now and the rest later is what §8 row 4 warned against,
and four sentences each composing their own coordinate is four chances to spell
it differently — and four chances for the refusal to be worded differently
enough that a reader learns to skim it.

---

## 2. The sub-tile <-> cell derivation, and where it comes from

**Not from the audit's docblock.** That docblock says *"all four sub-tiles of a
16px cell"*, which is prose and would make a 4 the obvious thing to type. The
source of truth is `src/core/collision/collision-cell.ts`, which names the ratio
once for exactly this reason:

```ts
export const CELL_SUBTILE_COLS = 2;   // 8px sub-tile columns per 16px cell
export const CELL_SUBTILE_ROWS = 2;   // 8px sub-tile rows per 16px cell
```

and spells the FORWARD direction once, in `cellTileIndices`:

```ts
const tc = cellCol * CELL_SUBTILE_COLS, tr = cellRow * CELL_SUBTILE_ROWS;
for (let r = 0; r < CELL_SUBTILE_ROWS; r++)
  for (let c = 0; c < CELL_SUBTILE_COLS; c++) out.push((tr + r) * width + tc + c);
```

So `index = (cellRow * ROWS + r) * stride + (cellCol * COLS + c)`, and
`crossoverLocus` is its inverse reading the same two constants:
`subRow = index / stride`, `subCol = index % stride`, `cellCol = subCol / COLS`,
`cellRow = subRow / ROWS`. **Nothing in the implementation or in the tests types
a 2 or a 4.** The round-trip row generates its expectations by calling
`cellTileIndices` and asserting every index it produced decodes back to the cell
it was asked for, at five spread cells.

`half` is **`spanForTileCol(subCol)` literally**, not a reimplementation of the
parity. That function is the one rule turning the 8px column under the cursor
into a mark width, so the half a message reports and the half an author aims at
cannot drift. Its return type is narrowed to `Exclude<CrossoverSpan, 'cell'>` —
a value it could never return — so the locus can carry it without a cast.

**Why 8px in X is the interesting axis at all** is the previous parcel's §1 and
is not re-derived here: `COLL_CELL_W` = 8 px, `COLL_CELL_H` = 16 px, the trigger
fires once per 8px column entered, and `test/collision/crossover-span.test.ts`
parses aeon's constants rather than quoting them.

### 2.1 The row aeon never reads, found while deriving the above

aeon `tools/ojz_strip_gen.py` `apply_editor_collision_overlay`, at aeon
`origin/master` **290f4aa8** (read through the suite resolver, at a committed
revision, never from the live working tree):

```python
for cr in range(COLLISION_ROWS_PER_STRIP):
    o = (cr * 2) * W + col           # top tile row of the 16px cell
```

Only the cell's TOP sub-tile row is ever read. A crossover mark sitting alone on
a bottom sub-tile row is authored, audited, and **never baked**. Aurora's own
writers fill all four sub-tiles (`cellTileIndices`), so a bottom-only mark can
only have arrived from a paste, an import, an agent call or a poke — exactly the
population the ERROR tier exists for. The locus carries `rowHalf` and the
message says so in words:

> ... left half (8px column 24, index 1816), **and on the cell's BOTTOM sub-tile
> row, which aeon's bake never reads**

---

## 3. What the coordinate REFUSES to say, and when

Two different absences, handled differently, because they are not the same
question.

### 3.1 No stride: no cell, and it says so

A cell coordinate needs the row stride for the same reason the cancellation scan
does — a flat index carries no adjacency. `crossoverLocus` returns **null**, and
every class's line degrades to `index 10320, NO CELL COORDINATE`, with one
trailing sentence:

> (No cell coordinates above: this audit was called without a row stride, so a
> flat sub-tile index cannot be turned into a cell. The numbers are indices into
> the plane arrays, counting across each row of 8px sub-tiles.)

**A null, not a second `…Measured` flag, and the reason is stated because the
file's own precedent points the other way.** `cancellingMeasured` is a boolean,
so a `locationMeasured` boolean was the obvious move. It was rejected: it would
be `stride !== null` spelled a second time — two things to keep in step for one
fact — and **a flag is ignorable where a null is not**. Every TypeScript caller
has to answer for the null; nobody has to read a boolean. The record carries
`stride: number | null`, which is the same fact in the form a caller can use,
and is what a harness reading the record as JSON sees.

The trailing sentence fires only when a class actually had a sample to place, so
a stride-less audit of a clean pair still says only its existing *"the
cancellation check did NOT run"* line. Two refusals about the same missing
number, printed together every time, would teach a reader to skip both.

### 3.2 No section: the message leaves it out, and never guesses

Which section two flat word arrays belong to **is not in them**. It is a new
optional parameter. All three call sites in Aurora know their section index and
now pass it; a caller that does not gets `cell (col 12, row 3), left half` with
no section named at all.

Omission, not invention: `cell (col 12, row 3)` is a true statement about
whatever section the caller handed over, whereas `section 0` would be a
confidently wrong location painted next to a real defect — strictly worse than
the index it replaced, because an index at least looks like an index. Section 0
is a real section, so a sentinel-shaped default is exactly the wrong thing here.

### 3.3 A fractional stride, which used to be measured

Found on the way. The cancellation gate read `if (stride && stride > 0)`, which
admits `2.5`: the scan would then walk rows that are not rows, and a coordinate
computed from the same number would name a cell that does not exist. Both the
scan and the coordinate now gate on one validated `out.stride`
(`Number.isInteger`, `> 0`), so a stride is usable for both questions or for
neither. No caller in the tree passed a fractional stride; the row exists so the
two gates cannot drift apart later.

### 3.4 What a coordinate here is NOT

**It is not a world pixel.** Placing a section in its act needs `Act.gridWidth`,
which the audit is not given and which is a different repository of truth
(`s4-types.ts`). A caller with the act in hand can compose it
(`worldX = (index % gridWidth) * SECTION_PIXEL_SIZE + subCol * 8`); this file
will not guess it. §8 row 4 asked for `(section, cell, half)` and that is
exactly what shipped.

---

## 4. Every consumer, and how they were enumerated

Enumerated by **what touches the data**, in three passes, not by what defines
it — the previous sweep in this repo counted 8 sites where there were 13, and
the misses were copiers outside the owning module.

| pass | query | what it added |
|---|---|---|
| A | the type and every exported function (`CrossoverAudit`, `auditCrossovers`, `crossoverAuditMessage`, `crossoverAuditSeverity`, `scanCancellingRuns`, `AUDIT_SAMPLE_CAP`) over `src/ test/ scratchpad/ scripts/ docs/` | the three call sites, three test files, three harnesses |
| B | every FIELD NAME of the record (`selfMarkAt`, `reservedAt`, `oneWayAt`, `cancellingAt`, `cancellingMeasured`, `marksA`, `marksB`, `solidBoth`, `divergent`) over the same tree | `src/main/editor-methods.ts` — prose, which pass A cannot see; plus 8 false positives on the English word *divergent* (`classic-surface-plan.ts`, `adapter.ts`, `warp-tearing-harness.mjs`), read and dismissed |
| C | `crossoverAudit:` — object literals that COPY a record rather than pass it | the agent reply copier in `agent-handler.ts`, and its two test-side shapes |

**The list, with what each needed:**

| consumer | kind | what changed |
|---|---|---|
| `src/renderer/components/CollisionPalette.tsx` | the screen. Renders the message on the map variant | passes `activeSection`; the note div gained `data-testid="crossover-audit-note"` so a harness can read it without matching on its own text |
| `src/renderer/debug-hooks.ts` `crossoverAudit(sectionIndex)` | returns `{...audit, severity}` to harnesses | passes `sectionIndex`; the two new record fields ride the spread |
| `src/renderer/agent/agent-handler.ts` | COPIER: rebuilds a narrower `crossoverAudit` object for the agent reply | passes `req.section`; the copy keeps its existing field list and its `note` now carries the coordinate |
| `src/main/editor-methods.ts` | PROSE: the `paint_collision` method description an agent reads | now says the note names a place, and that it is in the same 16px cell units as this method's own `x`/`y` |
| `test/collision/crossover-audit.test.ts` | 15 existing rows | unchanged and still green; its `/index 1/` assertions still match |
| `test/collision/crossover-span.test.ts` | 15 existing rows | unchanged and still green |
| `src/renderer/agent/__tests__/agent-handler.collision-reconcile.test.ts` | asserts the reply's audit counts | unchanged; the copier's field list did not shrink |
| `scratchpad/loop-paint-harness.mjs`, `loop-witness-harness.mjs`, `two-way-mark-harness.mjs` | read the record through the debug hook | unchanged and unbroken: every field they read is still there, and `oneWayAt[0]` / `selfMarkAt[0]` still hold indices |

Nothing was removed from any shape. The change is additive on the record and
additive inside each sentence.

---

## 5. Red-first: seven mutations on disk, each shown and each red

Applied to the **committed** tip, one at a time, and restored with
`git checkout HEAD -- <path>` from a clean tree. Control before: 51/51 green
across the three collision test files. Control after every restore: 51/51 and
`git status --short` empty.

| # | mutation (the line as read back from disk) | rows reddened |
|---|---|---|
| 1 | `... || stride <= 0) stride = 1;` — the invented origin, this parcel's own worst case | 3, incl. **⚠ NAMES NO CELL AT ALL WITHOUT A STRIDE** |
| 2 | `half: 'left',` — the half stops coming from the brush's rule | 3 |
| 3 | `cellCol: Math.floor(subCol / 4),` — the ratio typed instead of read | **9**, incl. all four class-naming rows |
| 4 | `+ \`(first at index ${a.oneWayAt[0]}): ...\`` — ONE class keeps the old bare index | exactly **1** |
| 5 | `section: null,` — the section the caller supplied is dropped | 6 |
| 6 | `if (stride && stride > 0) {` — two stride gates again | 1 |
| 7 | `rowHalf: 'top',` — the row the bake never reads stops being distinguishable | 3 |

Mutation **3** is the one that proves the parcel's shape: it reddens the naming
row of **all four classes at once**, which is what says every class goes through
the one formatter. Mutation **4** is its complement — it isolates a single class,
so the four rows are not one row wearing four names.

**The failing-row names, in full, are in the run log; every restore was verified
by `git status --short` returning empty before the next mutation.**

### 5.1 And one mutation only the harness can catch

```
-  ? auditCrossovers(..., SECTION_TILES_WIDE, activeSection)
+  ? auditCrossovers(..., SECTION_TILES_WIDE)
```

The panel stops telling the audit which section it is looking at.

* the whole node collision suite under the mutation: **19 files / 199 tests, all
  green.** It cannot see this.
* `npm run harness:audit-coords` under the same mutation: **7/9**, red on `[n1]`
  and `[n3]` — the two rows that assert the section named on screen.
* restored and rebuilt: **9/9**.

That is the row this harness exists for. A binding between a store value and a
sentence has no unit test that can fail.

---

## 6. The harness, and the instrument defect it found

`scratchpad/audit-coords-harness.mjs`, registered as
`npm run harness:audit-coords` **in the same change** (an unregistered harness
in this repo sat red for six days once).

* `[n1]` reads the note off the DOM **by `data-testid`**. Locating it by its own
  text would be circular: the text is the claim.
* `[n2]` compares the note's rect **to its scrolling ancestor's box**, not to
  `checkVisibility()` — which answers green for an element scrolled thousands of
  pixels out of view. Measured: rect `(1161,256) 224x242` inside scroller
  `top 74 / bottom 848`, colour `rgb(248,113,113)` (the error tier).
* `[n3]` pokes a defect into **two different sections at two different cells**
  and switches the active section between them; the coordinate must move with
  the switch, and `[n3b]` requires the old cell to be gone.
* `[n4]` clears the defect and requires the note to vanish, so `[n1]` cannot be
  reading a leftover. `[c0]` and `[n1b]` are declared NON-DISCRIMINATING in the
  run's own output.
* It refuses to run at all if the act has fewer than two sections, because
  `[n3]` could not then tell *"names the active section"* from *"names 0"*.
* It runs against a `git archive` copy of aeon `origin/master` **290f4aa8** and
  refuses the live checkout by identity, though it never saves.

**⚠ THE INSTRUMENT DEFECT, WHICH IS NOT THE FEATURE'S.**
`__dbg.aeon.collisionPoke` writes the plane word in place and does **not** bump
`editorStore.liveEditVersion` — the audit memo's only other dependency, and the
app's own *"something changed"* signal. So a poked defect sits in the document
with the panel never told. On the first run `[n1]` and `[n4]` were red for that
reason alone while `[n3]` passed, because a section switch changes the memo's
OTHER dependency. The harness now forces the repaint by looking at another
section and back, labelled at the call site. **It is left open, not fixed** (§8
row 1): the hook is shared with three other harnesses in this repo, and changing
what a poke does mid-parcel is a change to somebody else's instrument.

---

## 7. What I did NOT establish

1. **No emulator, by invariant.** Nothing here was driven. Nothing here needs to
   be: every claim is about text an editor shows a person. The engine-side facts
   the coordinate is phrased against (`COLL_CELL_W` = 8, the bake's `o = (cr *
   2) * W + col`) are asserted against aeon's **source** at a named revision,
   not observed running.
2. **The bottom-sub-tile-row claim is read, not run.** *"aeon's bake never reads
   it"* comes from `apply_editor_collision_overlay` at 290f4aa8. I did not bake a
   section with a bottom-only mark and diff the output.
3. **No world pixel** (§3.4), and no act-level coordinate of any kind.
4. **The other three harnesses were not re-run.** They read fields that still
   exist and are untouched by this change; that is an argument, not a
   measurement.
5. **Only one screen shows this message.** `CollisionPalette`'s map variant. I
   did not survey whether the Art facet's composer collision road should report
   the same thing — it uses a different writer (`paintDocCollision`) and does not
   call the audit at all today.
6. **The agent reply's copier still drops the sample-index arrays** (and now the
   new `stride`/`section` fields). An agent gets the coordinate in the `note`
   sentence only. Widening that copy was not required by §8 row 4 and would be a
   change to an agent-facing shape with no caller asking for it.
7. **No claim about how the message reads at length.** With several classes
   present the note is now long enough to fill the panel column (visible in the
   `[n1]` capture). Whether that wants a summary line or a collapse is a design
   question this parcel did not open.

---

## 8. What is open

| # | what | why |
|---|---|---|
| 1 | `__dbg.aeon.collisionPoke` does not bump `liveEditVersion`, so a poke is invisible to every live lens until something else re-renders. | §6. Three other harnesses use this hook; a fix belongs in a parcel that can re-run them. The one-line fix is `bumpLiveEdit()` in the hook. |
| 2 | The 8px-column number in the message (`8px column 80`) is asserted to equal aeon's `col` **by construction**, not against a bake that actually errored. | A section that fails aeon's R2 with a known cell, baked, and the two strings compared, would close it. Needs a build, which is a foreground run. |
| 3 | §8 rows 1, 2, 3 and 5 of the two-way-mark packet remain open exactly as they were. | Untouched by this parcel. |
