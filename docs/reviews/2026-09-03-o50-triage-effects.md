# O50 triage — the effects-panel and editor-surface cluster, ten instruments

**Branch** `test/o50-triage-effects`, nine commits (SHAs in §7).
**Parcel** triage of ten of O50's 28 RED instruments
(`docs/reviews/2026-09-03-harness-red-sweep.md`, a count made at 04:54Z and
explicitly not a diagnosis).
**Started** 2026-09-03T08:13Z, uptime 8 days 20:02 · **finished** 09:16Z, uptime
8 days 21:05.

**Environment, printed beside every figure below.** Every run is against **this
worktree's own** `VITE_AURORA_DEBUG=1 npx electron-vite build`, pinned with
`AURORA_BUILT_TREE=<worktree>` so nothing borrowed the main checkout's `dist/`;
the electron binary is the main checkout's
(`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron` —
a worktree has none), under `xvfb-run` at 1680×1050. Every run got a **fresh
`git archive` extract of aeon `origin/master` `73b07a4f`** as `AEON_DIR`; the
live aeon tree was never opened and never written to. **No emulator was touched.**
`devicePixelRatio` read **1** on every run that printed it; box load ranged
5.2–20.6 across the session and is printed per run in the harness output.

---

## 1. The answer, up front

| # | file | verdict | my measured tally (before → after) | one line |
|---|---|---|---|---|
| 1 | `numberfield-empty-harness` | **STALE HARNESS** | `0b` red, run aborted → **13/13** | looked for `v_center`/`v_offset` on the Effects tab; they are two doors away since d-26b |
| 2 | `section-header-action-harness` | **STALE HARNESS** ×3 | `[1a]` unmeasurable → **31/31** | heading pattern, a ceiling literal of 8, and a card counter reading 0 for every card drawn |
| 3 | `chunkgrid-hint-harness` | **STALE HARNESS** ×2 | 19/20 → **20/20** | its anti-vacuous row asserted the *click call*, not the selection; and the cell was 3,617px off screen |
| 4 | `camera-preview-harness` | **STALE HARNESS** | 25/26 → **26/26** | required the composite to disclaim curve ramps it now draws |
| 5 | `curve-editor-harness` | **STALE HARNESS** | 28/29 → **30/30** | the `v_offset` sweep wrote nothing: the Scene form arrives collapsed |
| 6 | `layer-bound-harness` | **STALE HARNESS** | 28/46 → **47/47** | same collapsed Scene form; all 18 reds were downstream of one unwritten field |
| 7 | `effects-deform-harness` | **STALE HARNESS** | 37/38 → **38/38** | red because the app got *better*: `period` became a picker, the row counted only `INPUT`s |
| 8 | `screen-frame-guides-harness` | **STALE HARNESS** ×3 | 27/33 → **33/33** | five wave-1 renames, plus one row holding a rule the app lists under **STILL REJECTED** |
| 9 | `effects-scene-harness` | **STALE HARNESS** + **ENVIRONMENT** | 22/39 → **42/42** | its fixture premise ("aeon has no `editor/effects/`") expired; plus five stale finders |
| 10 | `effects-column-harness` | **STALE HARNESS** ×4 + **⚠ LIVE APP DEFECT** | 19/25 gated → **23/25** | four sub-tab rows repaired; **`[L2]`/`[L2b]` stay red and they are right** |

**Nine of ten were the instrument. One found a real defect** — and it took
repairing that instrument's *aim* to be sure of it, because the arm that was
red was measuring the wrong quantity and reached the right verdict by luck.

**My figures agree with the sweep's on every file that printed a tally**
(28/46, 22/39, 27/33, 25/26, 19/20, 28/29, 37/38). The one disagreement is
`effects-column`: the sweep's prose lists six failing rows, which matches me,
but its comparison table also carries *"17 PASS / 9 FAIL"* and *"19 PASS / 7
FAIL — HEAD is better"*. My instrument reports **19/25 gated rows (11 reports)**
on arrival with six named failures. I did not reproduce either of the other two
pairs; the sweep does not say which build produced them.

---

## 2. ⚠ LIVE APP DEFECTS — the section the owner cares about

### D-1. Two labels wrap to two lines in every layer card of the Effects column

**One defect, and it is small, visual, and real.** It is *not* fixed here.

`Plane B curve to` and `Plane B split at` do not fit the effects column's label
column and wrap at their spaces, on **every layer card** — ten rows on the
shipped `ojz_act1_start` scene (five layers × two rows).

Measured, on this branch's build, three runs, dpr 1:

```
Plane B curve to   needs 84px unwrapped, in a 64px column, 2 line boxes
Plane B split at   needs 77px unwrapped, in a 64px column, 2 line boxes
```

**Why this is a defect and not a design choice.** `whiteSpace: 'normal'` is
deliberate — `src/renderer/components/effects/column-layout.tsx` chose a fixed
width that *wraps* over a `minWidth` floor that *widens*, because one long label
widening a shared column is what broke alignment in parcel D. But the same
docblock is explicit that wrapping is the chosen **failure** mode, not the
intended state: it lists every label it measured, ending

> `Transition 52 · Banks 1-7 53 · Blank band 55`
> The widest is 55px, so **64 leaves 9px of headroom**.

Both `Plane B …` rows are parcel H's (`curve.to` / `vsplit.at`) and are **not in
that list**. The column has drifted 20px past its own stated headroom.

**Reproduction (foreground, ~90s, no emulator):**

```bash
cd <aurora>            # any checkout with a VITE_AURORA_DEBUG=1 build
AEON_DIR=<a COPY of aeon>  \
ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
  node scratchpad/effects-column-harness.mjs
```

Read rows `[L2]`, `[L2b]` and report `[r4]`. Or open the app, Effects facet,
Parallax tab, and look at any layer card's last two rows.

**What a fix costs, which is why I did not make one.** `LABEL_W = 64 → 100`
takes the file to **25/25** (`43 labels all fit; widest text "Plane B curve to"
= 84px in a 100px column`) — I ran it as the red-first inverse. But `LABEL_W` is
a ruled value with knock-ons to `[L1]` (control-column alignment), to the
column-width rows `[H1]`–`[H3]`, and to four other facets that share these
primitives. Shorter labels are the other option and are a wording call. **This
is the controller's decision and deserves its own row.**

### D-2 (not a defect, flagged for the same owner) — the instrument `LABEL_W` is derived from could not see this

`column-layout.tsx` says, in as many words:

> `LABEL_W` was picked by measuring every label in the rendered column with a
> DOM Range (`scratchpad/effects-column-harness.mjs`, **row r4**)

A `Range` over a **wrapped** label returns the union of its line boxes, which is
**bounded by the column**. So a label too wide to fit printed as one that fills
it exactly — `Plane B curve to` reported **42px** — and any re-derivation of
`LABEL_W` from that list would have confirmed the width that caused the wrap.
**A measurement that cannot see the condition it exists to prevent.** `[r4]` now
prints both numbers and names the unwrapped one as the one the column must fit.
This is an instrument repair and is landed here.

**No other live app defect was found in the other nine files.** Everything else
was the instrument.

---

## 3. Per file — the failing rows, the evidence, and what changed

### 3.1 `numberfield-empty-harness` — STALE

Red row: `[0b] ANTI-VACUOUS: found the v_center and v_offset boxes on screen`
(`{}`), then the run threw `fields not on screen`.

It clicked **Effects** and looked straight for `input[type=number]` titled
`v_center`/`v_offset`. Since d-26b the Effects tab is three sub-tabs and those
boxes live in `aeon.effects.scene` on **Parallax**, which arrives
`defaultCollapsed`. Sections are **UNMOUNTED, never `display:none`**, so the
boxes were genuinely not in the DOM.

Changed: two idempotent doors, each with its own INSTRUMENT row so the run says
which one it had to open — `[0c2]` the Parallax sub-tab, `[0c3]` the Scene form.
**13/13.** The app is fine: `[2b]` (clearing a box holding 128 writes no 0) and
`[3b]` (a lone `-` commits nothing) — the rows the parcel exists for — both pass.

### 3.2 `section-header-action-harness` — STALE, three times over

The sweep booked "1 failing row". That row was an **abort**, not a tally, and it
hid two more faults.

- `[1a]` — `/^Layers \(\d+\/\d+\)$/` against a heading the panel composes as
  `Layers (n/EFFECTS_LAYER_COUNT.max per scene)`. It correctly reported
  `COULD NOT MEASURE` and threw, so nothing below it ran.
- the ceiling — the growth loop and `[4a]`/`[4b]` pinned **8**; `maxItems` went
  8 → 16 at empyrean `277bc15`, recorded in the schema's own provenance file.
- **the card counter**, which is the interesting one. It matched
  `/^Layer \d+ world_y/` on the top spinner's title. That title is
  `Layer i <top.label> (…)` and `top.label` is `world_y` **only on an UNLOCKED
  scene** — `layerTopBounds` returns `'Screen line'` when
  `layerTopSpace(scene) === 'screen'`, which is what this file's own fixture
  scene is. It read **0 cards for every card the app drew**. Its old comment
  argued the spinner's title "moves only if the field does"; the title carries a
  **value**, not just a name.

Changed: heading and ceiling **read from
`aurora-effects-scene.schema.json`** and printed in the run banner; cards counted
by their own `Remove layer N` `aria-label`, which no scene state rewrites; and
the expression **returns the artifact** (bordered boxes, spinner count, sample
titles) so a `0` can never again be ambiguous between "no cards drawn" and "the
finder moved" (`docs/OVERSEER.md` bar 2d(iii)).

Staged: `[1a]` unmeasurable → finder only **23/31** (8 rows red, every one
card-dependent) → all three **31/31**.

Red-first: `Remove layer ${i}` → `ZZplantZZ layer ${i}` gives **23/31**, red at
exactly `[1a] [2c] [2e] [2g] [3b.1] [3b.2] [3b.3] [4b]`.

### 3.3 `chunkgrid-hint-harness` — STALE, and its anti-vacuous row was vacuous

Red row: `[7t] the selected-state hint is the two-clause sentence`, reading
`"Click a chunk to select"`. The copy is unchanged
(`providers/chunk-grid-aeon.ts:169`) — **no chunk was ever selected**, and the
row above it said otherwise.

- `[6t]` asserted `picked === true`, which its expression returns whenever *some
  element matched* — true even when the click lands on nothing. An anti-vacuous
  row that could not fail for the reason the row below it fails.
- its finder was every `[title]` matching `/chunk/i`, last in document order. An
  aeon cell's title is the chunk's **name** (`aeonChunkTitle`), so "chunk"
  appears in it only for a blank chunk's warning; the population was mostly other
  controls that say "chunk" (`Stamp Chunk` among them).
- and once the finder was repaired **structurally** (a `<button>` holding a
  `<canvas>`, which is what `ChunkGrid`'s Cell renders) it aimed correctly and
  **still** failed: `71 cells, aimed at "OJZ $46" @1209,3617` in an 872px window.
  A hit-tested click there lands on nothing.

Changed: `scrollIntoView` first, **re-measure**, and refuse a point still outside
the window rather than dispatching into space (a non-zero rect is not evidence of
being on screen, and neither is `checkVisibility()`); `[6t]` now asserts the
app's own selected rendering — `styles.cellSel`, a 2px solid outline — is on
exactly one cell having been on none, and prints the counts, aim, rect and window.

19/20 → **20/20, three runs**. Red-first against the app: `ChunkGrid`'s
`onClick={() => select(id)}` → a no-op gives **18/20**, red at exactly
`[6t]` and `[7t]`.

### 3.4 `camera-preview-harness` — STALE; the row was red because the feature SHIPPED

Red row: `[6b] the composite SAYS it does not draw the curve ramps this scene
carries`.

It does not say that any more, on purpose. `cameraPreviewAbsences`
(`renderer/canvas/camera-preview.ts`) carries, where the line used to be:

> ⚠ NO `curve` LINE HERE ANY MORE, and its removal is the parcel. Ramps are
> composed per line by `curveRampRuns` … A stale absence is worse than none.

**And `[6c]` could not simply be kept.** "the flat scene reports NO curve
absence" is now true of *every* scene, so its success and failure states emit the
same artifact and it could only ever return green (bar 2e). Keeping it beside a
repaired `[6b]` would have *looked* like an anti-vacuous pair.

Changed: both re-pointed at the quantity the parcel added —
`CameraPreviewBand.ramp`, the `CurveRun[]` composed by `curveRampRuns`. `[6b]`
requires the curve-carrying scene to compose at least one band whose scroll
really **varies down its own rows**; `[6c]` requires the curveless scene to
compose none.

25/26 → **26/26, twice**:
`[6b] 2 curved layers · ramped bands=[{i:3,layer:3,runs:48,xs:48},{i:4,layer:4,runs:64,xs:64}]`,
`[6c] 0 curved layers · ramped bands=[] of 5`.
Red-first: a null ramp in `camera-preview.ts` gives 25/26, red at `[6b]` with
`ramped bands=[]`, `[6c]` correctly still green.

### 3.5 / 3.6 `curve-editor-harness` and `layer-bound-harness` — STALE, one cause

```
layer-bound   28/46 — [3a4] set result = "no-element" (wanted 64)
curve-editor  28/29 — [7d] BLANKET: 6 v_offset: "no-element"
```

Both are the collapsed `aeon.effects.scene` again. `aeon.effects.layers` is still
open on arrival, which is why layer-bound's `[3a1]`/`[3a2]` layer-top writes
passed and only the scene field did not.

Changed: one idempotent door per file before its first `v_offset` write, each
with its own INSTRUMENT row (`[3a3b]`, `[6a0]`).
**layer-bound 28/46 → 47/47** (all 18 reds were downstream of one unwritten
field). **curve-editor 28/29 → 30/30.**

⚠ **Worth saying out loud about curve-editor:** *nothing except its blanket row
went red*. Its `v_offset` sweep starts at candidate 0 and the scene already sat
at 0, so `[6a]` found its owned rows and **passed on a field that had never been
written**. The blanket row was the only thing between that and a green run
measuring an unset fixture — which is exactly the job it exists for.

Red-first, one plant: the panel's `Scene — ${selected.id}` title → `ZZplantZZ`
gives layer-bound **28/47** (`[3a3b] open -> no-scene-header`) and curve-editor
**28/30** (`[6a0]` and `[7d]`).

### 3.7 `effects-deform-harness` — STALE; the app got better

Red row: `[4b]`, reading `rendered=["amplitude","speed"]` against a schema
asking for `["amplitude","period"]`.

`period` is still on screen. It is a `<Select>`, and the row filtered
`tag === 'INPUT'`. ROADMAP row 63 moved it on a stated principle: *"A PICKER
WHERE THE ENGINE ADMITS A SET, A SPINNER WHERE IT ADMITS A RANGE"* — period must
**divide** the table length, which no `min`/`max` or clamp can express, and the
spinner "advertised 247 values the build refuses".

Changed: `[4b]` counts one **control** per schema parameter plus speed, in schema
order, across inputs and selects; and keeps a kind check without pinning one —
any parameter offered as a picker must carry the divisor rule on its own title,
so a picker cannot quietly replace a spinner without the engine constraint that
justifies it.

37/38 → **38/38**:
`rendered=["amplitude:INPUT","period:SELECT","speed:INPUT"]`,
`picker titles=["deform_fg period — must divide the 256-byte table; the build refuses any other value"]`.

**The printed artifact caught my own first repair**: it read
`["—:SELECT","amplitude:INPUT","period:SELECT","speed:INPUT"]` — I had not
excluded the attachment's own on/off select. That is the reason a row prints what
it judges.

Red-first, **one plant per arm**: dropping `period` from the params map → 37/38
with `rendered=["amplitude:INPUT","speed:INPUT"]`; replacing the divisor rule
with `— ZZplantZZ` → 37/38 with the count intact and
`picker titles=["deform_fg period — ZZplantZZ"]`.

### 3.8 `screen-frame-guides-harness` — STALE, and one row held an overturned rule

Red rows `[3g] [7c] [7d] [7e] [7f] [7h]`. Two causes.

**(a) Five rows, one wave-1 rename cascading.** `[7c]` clicked a chip called
`Add blank band`; `bandVerbs` has called it `Add blank tile animation` since wave
1. `clickByText` returns `false` on no match, so `[7d] [7e] [7f] [7h]` then
measured a band that had never been added. `[7f]`'s toast is
`Tile animation N added — …`. `[7h]` wanted a `New band` section and an `Add
band` chip: the section is `New tile animation`, it lives on the **Tile anim**
sub-tab where an inactive tab's sections are unmounted, and the chip now reads
just `Add` under a `Blank tile animation` field — the JSX-text case O55 booked.
`/^Add$/` is far too generic to aim a row at, so it is found by its own composed
title. The chip label and the toast wording are now **read from the two
providers that declare them**, so the next rename fails the read instead of
silently matching nothing.

**(b) ⚠ `[3g]` held a rule the app lists under STILL REJECTED.** It required the
guides to move by the frame's own delta. From `canvas/effects-guides.ts`:

> STILL REJECTED … the **SCREEN FRAME's top edge** — row 65's answer. It makes
> the guides move when the camera moves, which is precisely what a LOCKED plane
> does not do.

`guideOriginWorldY` returns 0 in both spaces, so a guide's world row **is** the
layer's `world_y`; the canvas even paints the caption *"plane rows — fixed on the
background, not on the frame"*. The guide correctly did not move and the row read
that as a broken drag.

⚠ **How it survived is the finding.** The overturn (2026-08-27, `7ba5a638`)
**dropped a parameter so stale call sites would fail to compile**. That reaches
TypeScript and **does not reach a `.mjs` harness**, which passes no arguments and
asserts *behaviour*. `effects-guides-harness` was caught by the 2026-09-03
lane-log sweep at 30/31; **this sibling held the same overturned rule in another
file and was not.** Same defect class, second instance, found only because
somebody re-ran the sibling.

`[3g]` now asserts the coupling that *does* exist, which is stronger because it
names both halves: the drag is live, it reaches the **document** as `v_offset`, the
guide's plane row is **invariant** across it, and the **gap** between frame top
and guide is the layer's screen line `world_y − v_offset`. Measured:

```
frame anchor 0 -> 90 (delta 90); document v_offset=90 (space screen)
guide worldY 112 -> 112 (a plane row: MUST NOT move), canvasY 112 -> 112
frame top canvasY=90, gap=22, screen line = 112 - 90 = 22
```

Row `[3b]` is that same property sampled at `v_offset` 0, where the gap happens
to equal `world_y` — now said in the docblock rather than left to be
rediscovered.

27/33 → **33/33, twice**. Red-first, one plant per arm: `if (false && …)` around
`commitVOffset` in `endFrameDrag` → **32/33**, red at exactly `[3g]` with
`v_offset=0` after a drag that moved the anchor to 90; `guideOriginWorldY`
returning 25 → **29/33**, red at `[3g]` and, as honest collateral, `[3b] [5b]
[6a]` — every row that places a guide.

### 3.9 `effects-scene-harness` — an expired FIXTURE PREMISE, five stale finders, and a GREEN poison

Six independent causes; the largest single repair in the parcel.

1. **The fixture premise expired — ENVIRONMENT.** The file's own docblock said,
   verified 2026-08-22, that aeon's `games/sonic4/data/editor/effects/` **does
   not exist**. Aeon has since committed `ojz_act1_depth` and `ojz_act1_start`
   into it, so `[1b]` ("an absent `editor/effects/` loads as ZERO scenes")
   measured a directory that is now there, and `[3c]`/`[6b]`/`[9a]`, which count
   the library against 0 and 1, went with it.
   A harness standing on another repository's contents has a premise that can
   only decay, so the empty-library case is now **created**: the effects
   directory is moved aside for the run and back in `finally`, a leftover from a
   killed run is **refused** up front (O66's precedent), and the restore is
   verified (no `.o50-aside` directory survives a run). That makes this a harness
   that **writes**, so `AEON_DIR` must be a copy and the live sibling tree is
   refused — suite rule *"copy only where a harness can WRITE"* (d-28). Its old
   "IT WRITES NOTHING TO DISK" claim is retired in place, not left standing.
2. **The factor pickers' titles.** `/^Layer \d+ f[ab]$/` against
   `Layer N fa — how far Plane A …`: `PLANE_FACTOR_ROWS` gives each row a
   sentence after the key. `[4a]` reported the pickers absent while on screen;
   `[4b] [5b] [5c]` followed. The same pattern in `openAllPackedForms` is why
   `[11b]`/`[11d]` reported "0 packed spinners" — it opened nothing.
3. **The Layers heading, and the card counter behind it** — the same pair as
   §3.2, including the locked-scene `Screen line` trap.
4. `EFFECTS_MAX_LAYERS = 8` (read from the schema now) and
   `select[title="Scene v_factor"]` (item 35 made it a `NumberField` with a
   sentence for a title).
5. **Two controls behind the collapsed Scene form** — `[10a]`'s `Name` and
   `V factor` read MISSING.
6. `[7c]` required `null` after one undo. That held only while section 0 carried
   no `sceneRef`; it carries `ojz_act1_start` now, so a **correct** single undo
   restored that and the row read a working undo as a no-op command eating a
   step. It captures the pre-value and asserts the undo returns to it.

⚠ **A POISON CAME BACK GREEN, and it is the part worth keeping.** `[4c]` was
inverted to assert the precision picker is **absent** (ROADMAP row 59 / owner
ruling d-16 removed it *"rather than hidden"*). Planting a re-grown
`<Select title="precision">` into the panel left the run at **40/40** — bar 2d
cause **(iii)**: the retired control stood in `aeon.effects.scene`, which is
**collapsed** at that point, so "no precision picker" was true of a section that
mounts nothing. Success state and failure state emitted the same artifact.
`[4c]` now opens the form first (`[4c0]`) and proves a control that *does* live
there is on screen (`[4c1]`), so a null means *retired* rather than *shut*.
Re-run under the same plant: **41/42**, red at exactly `[4c]` with
`options: ["cell"]`.

22/39 → **42/42, twice** (39 rows + `[4c0] [4c1] [10a0]`).

Red-first, one plant per repaired aim:
`Remove layer ${i}` → `ZZplantZZ` gives **36/40** red `[11a] [11c] [11d] [11e]`;
`PLANE_FACTOR_ROWS.fa.title`'s key → `ZZplantZZ` gives **35/40** red
`[4a] [5a] [5b] [11b] [11d]`; the precision plant as above.

### 3.10 `effects-column-harness` — four rows STALE, two rows RIGHT

Four of the six were the sub-tab split: `[A1]` wanted `Scene` open (it is
`defaultCollapsed` now) and the two tile-animation sections present in the
Parallax column (they are on **Tile anim**, unmounted); `[D1] [D1b] [D2]` are
*about* that list, so each now takes an explicit, printed excursion to that tab
(`[r.tile]`) and `[D1]` puts the tab back so phase 2 still measures Parallax. The
band-card enumeration regex was `/^Band (\d+)/` against a card titled
`Tile animation N`, so `[D1b]` reported "no element enumerates a band" from a tab
where a card was on screen.

`[L2]`/`[L2b]` stay red — **§2, D-1**. Two instrument repairs around them:

- **The wrap arm was aimed at the wrong quantity** (bar 2b). It read the label
  *element's height* against a line height — but `lineHeight` computes to
  `normal`, so the threshold was a `fontSize` fallback, and the label span is a
  **flex item** stretched to its row by a 26–30px `Select` beside it. It
  reported `Plane B curve to: text 42px in 64px, h=30`; a 42px string in a 64px
  box cannot wrap, so that row was flagged on a height its own control set. **It
  reached the right verdict by luck.** The observable is now the number of line
  boxes the text occupies — distinct rounded tops of a `Range`'s client rects, so
  a span holding two text nodes on one line cannot invent a wrap.
- **`[r4]`'s blind spot** — §2, D-2.

19/25 gated → **23/25 gated, three runs**. Red-first for the repaired `[L2]`:
`LABEL_W` 64 → 100 takes the file to **25/25** with
`43 labels all fit; widest text "Plane B curve to" = 84px in a 100px column`.

---

## 4. What every one of these had in common

Four causes account for **all ten**, and three of them are the same shape: **a
rule moved, and the instrument was never told.**

1. **d-26b's sub-tabs and the collapsed Scene form** — 5 files
   (`numberfield-empty`, `curve-editor`, `layer-bound`, `effects-scene`,
   `effects-column`). The brief predicted this and it was the single largest
   cause. **Sections are UNMOUNTED, never `display:none`**, so a finder does not
   report "hidden", it reports *absent* — which reads exactly like a defect.
2. **Wave-1 renames** — 4 files. `Add blank band` → `Add blank tile animation`,
   `Band N` → `Tile animation N`, `New band` → `New tile animation`,
   `Layers (n/8)` → `Layers (n/16 per scene)`.
3. **Rules the app deliberately overturned** — 3 files, and these are the ones a
   reader must not "fix" back: the curve-ramp absence (`camera-preview`), the
   `period` picker (`effects-deform`), the frame-follows-guides rule
   (`screen-frame-guides`). In each case the app carries a comment saying so, and
   in the last it names the harness's rule as the *old wrong answer*.
4. **A fixture premise about a peer repository** — 1 file (`effects-scene`).

**And two rows were vacuous in a way no rename explains**, which is the part
worth carrying forward: `chunkgrid-hint`'s `[6t]` asserted a *click call* rather
than a selection, and `effects-scene`'s `[4c]` asserted an absence from a section
that mounts nothing. Both would have reported green forever.

**The card counter is the sharpest single lesson.** Two independent harnesses
keyed "how many layer cards are drawn" on a spinner title that says `world_y` on
an unlocked scene and `Screen line` on a locked one — and both files' fixtures
are locked. Both read **0 cards for every card the app drew**, and in both the
comment beside the code argued the title was safe *because* it was the field's
own name. **A title can carry a value, not just a name.**

---

## 5. Standing invariants — how they were met

- **No emulator.** No `mcp__oracle__*` call, no Aether socket, no ROM. Nothing
  here says what any of this looks like running.
- **Branch/tree.** All nine commits on `test/o50-triage-effects` in this
  worktree; branch verified at each commit; nothing on `master`.
- **Exact-path commits.** Every `git add` enumerated paths; no `-A`, no globs;
  each commit verified with `git show --stat`. One commit per file's triage
  (curve-editor and layer-bound share one, because they share one cause and one
  plant).
- **Red-first, from a committed baseline.** Every changed or added assertion was
  proven red with the mutation shown as a real `git diff` **before** the run, and
  `src/` restored with `git checkout --` from the committed baseline (`0 dirty`)
  and rebuilt afterwards. Where a row is a conjunction, **one plant per arm**
  (`effects-deform`, `screen-frame-guides`, `effects-scene`).
- **Loud on unmeasurable.** No "couldn't measure" was rendered as 0 or green.
  Three harnesses' own `UNMEASURABLE`/blanket rows are what made this triage
  possible at all, and they are named where they earned it (§3.6).
- **Nothing written to the live aeon tree.** Every run used a fresh `git archive`
  extract; `effects-scene`'s new fixture staging refuses the live sibling by path.

---

## 6. What is left open

1. **⚠ D-1, the wrapping labels.** Not fixed, by design of this parcel. Needs a
   ruling: widen `LABEL_W` (measured: 100 is sufficient and takes the file to
   25/25) or shorten the two labels. Knock-on to `[L1]`, `[H1]`–`[H3]` and four
   other facets sharing the primitive.
2. **`npm test` is RED on one pre-existing row, and it is not mine.**
   `test/formats/effects-preset-schema-drift.test.ts` — *"NOT AN AURORA
   REGRESSION — the vendored preset contract schema is stale"*: empyrean
   `origin/main` moved `contract/schema/aurora-effects-preset.schema.json` from
   blob `f85dde13…` to `c1147071…`. **6476 passed / 1 failed / 8 skipped, 471
   files.** I touched only `scratchpad/*.mjs`, so this is peer-contract drift
   with a knock-on to `preset.ts`'s derived constants — re-vendoring it inside a
   test-triage parcel would have hidden it in the wrong review.
3. **The `.mjs` blind spot has a second confirmed instance** (§3.8b). The
   "drop a parameter so stale call sites fail to compile" technique is used
   deliberately in this repo and **cannot reach a harness**. Two files have now
   been caught holding rules overturned that way. There is no gate for it; the
   only thing that found either was re-running the file.
4. **Not re-checked:** whether any of the eighteen *other* RED instruments share
   the four causes in §4. Given that five of my ten were one cause, a grep for
   `revealPanel`-era finders and for `/^Band /` across the remaining reds is
   likely to be cheap and productive. Out of scope here.
5. **`effects-scene`'s fixture staging is new and mutates its `AEON_DIR` copy.**
   It restores in `finally` and refuses a leftover, and I verified both — but it
   has run four times, not forty. A killed run leaves a `.o50-aside` directory
   the next run will refuse by name rather than silently reuse.

---

## 7. Commits

Branch **`test/o50-triage-effects`**, emitted from `git log --format='%h %s' master..HEAD`:

```
925f4b68 O50 triage: effects-column-harness — four rows STALE, and [L2] is a REAL DEFECT this repair sharpens rather than removes
20cad9ff O50 triage: effects-scene-harness — an expired FIXTURE PREMISE plus five stale finders, and a poison that came back GREEN
4c4d1563 O50 triage: screen-frame-guides-harness was STALE — including one row holding an overturned rule in the exact direction the app names as the old wrong answer
070f7e4e O50 triage: effects-deform-harness was STALE — the row went red because the app got better
3ce19a58 O50 triage: layer-bound and curve-editor were STALE — one cause, the collapsed Scene form
9de43e73 O50 triage: camera-preview-harness was STALE — the row was red because the feature SHIPPED
3b2240a4 O50 triage: chunkgrid-hint-harness was STALE — and its anti-vacuous row was vacuous
4255507e O50 triage: section-header-action-harness was STALE three times over
a9c2655b O50 triage: numberfield-empty-harness was STALE, not a defect
```

Each commit message carries that file's before/after tallies, the mutation used
for its red-first proof, and the rows the plant turned red.
