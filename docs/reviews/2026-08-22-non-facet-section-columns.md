# The four non-facet section columns — measured, not fixed

*ROADMAP §5.1 item 19. Branch `measure/non-facet-section-columns`. 2026-08-22.*

> **This is a measurement parcel and it changed no product source.** Node suite
> **4242 passed / 3 skipped** (identical to the master baseline at `a82d3db` —
> nothing was touched), `tsc --noEmit` clean, wall clock at the run:
> `16:59:07 up 4 days, 17:22, load average: 21.53, 63.44, 51.52` (heavy parallel
> load; the suite still finished in 10.50s, and nothing here is a timing claim).
>
> **RATIFIED 2026-08-22.** The controller ran the harness and confirmed the
> recommendation on its own numbers: `S9.r4` measured every other section at
> **1202px** against a **528px** column — a **−674px** share against a 160px
> floor, so the floor engages and the flex model is a no-op exactly where it
> would matter. The second run's cross-size data **strengthened** that: every
> surface overflows at both viewports by wide margins (§6.5). **"Leave all four
> alone" is ratified.**
>
> Those runs also found **four harness defects** (§6.5) — the size axis was never
> set, the CanvasMode block never created a canvas, `i1` compared the screen to
> itself, and `c1` was aimed at border boxes rather than painted pixels so the
> plant that reproduces the 954px defect could not turn it red. All four are
> fixed here. Two new run-level invariants (`P.invariant`, `P.invariant2`) make a
> green-with-a-poison-installed run a failure. The row taxonomy in §7 is
> re-stated; `c5` was withdrawn after the first run and is now earned back.
>
> **The runtime half is a harness the controller runs.** Everything about
> rendered geometry below is either a source fact, or a prediction the harness
> is built to confirm or refute. Predictions are labelled as such and never
> written as measurements. See §6 for the invocation and §7 for what each row
> should print.

---

## 1. The verdict up front

**Leave all four alone.** Three separate lines of evidence say the flex-column
model has nothing to offer these surfaces, and one of the three is decisive
before the app is even launched:

1. **The model's own floor makes the refactor a no-op wherever it would matter.**
   `LIST_SECTION` gives a section `container.clientHeight` minus the natural
   height of every other section, and stops shrinking at
   `SECTION_LIST_MIN_HEIGHT = 160`. On an over-subscribed column that share is
   below the floor by construction, the floor engages, and
   `CollapsibleSection.tsx:87` hands the deficit straight back to `Panel`'s
   scrollbar — *"the pre-existing behaviour of an over-subscribed column,
   restored for the case that actually is one."* Which is what these columns do
   today. **Measured, not argued:** `S9.r4` = 1202px of other sections against a
   528px column, a **−674px** share against a 160px floor. And the cross-size run
   shows it is not an artefact of one window — every surface overflows at both
   viewports, needing windows from **~1201px** (SpriteMode-6) to **~6326px**
   (ProjectSetupTab) to lose its scrollbar (§6.5).
2. **Two of the four are not columns at all.** `ProjectSetupTab` is an 860px
   centred document page with a pinned Apply footer; `Explorer` is a file tree.
   Giving a tree's groups per-group scrollbars is not a fix, it is a different
   and worse tree.
3. **The unbounded-list worry does not hold where the booking put it.** Every
   data-driven body in SpriteMode is already capped in its own source, at
   authorship time, before the flex model existed.

**One thing does deserve a booking**, and it is not a layout defect: SpriteMode's
nine-section configuration is reachable only because `SpriteMode.tsx` reads the
two project stores directly instead of through `state/open-project.ts`, so a
classic session can render an "Export to project" section for a *stale, resident
aeon project*. §4.4.

---

## 2. What the booking asked, answered

### (a) "The docblock says SpriteMode mounts six and it mounts nine — stale"

**Imprecise, and the correction matters.** `ui/primitives.tsx:27` says *"a column
whose CONTENT sections alone over-subscribe it (SpriteMode mounts six)"*. Six is
the **aeon-only** count, and it is *correct* for that configuration — then and
now. SpriteMode has three counts, because its two gates are independent:

| gate | sections | count |
|---|---|---|
| always | `sprite.mapping`, `sprite.name`, `sprite.open`, `sprite.palette` | 4 |
| `project !== null` (aeon resident) | `sprite.export`, `sprite.character` | **6** |
| `classicOpen` | `sprite.s1-objects`, `sprite.s1-shared-objects`, `sprite.save-source` | **7** (classic only) |
| both | all of the above | **9** |

`SpriteMode.tsx:49` reads `useProjectStore(s => s.project)`; `:54` reads the
classic store's status. Neither goes through `state/open-project.ts`.

The docblock was written in `5399202` (2026-08-14), and **SpriteMode.tsx already
had seven `<CollapsibleSection>` call sites that day** (`git show
5399202:…/SpriteMode.tsx`). So "six" was never a stale count of the file — it was
an unqualified count of one configuration. The honest repair is one word, not a
new number: *"SpriteMode mounts six in an aeon-only session, nine with a classic
project open beside it."* No source change is required for that and none is made
here; it is a docblock edit for whoever next touches that file.

### (b) "A data-driven list in a content section is what `UNBOUNDED_BY_NATURE` forbids"

**Refuted for SpriteMode, and it is the interesting half of this parcel.** Every
data-driven body on that surface carries its own ceiling, written at authorship:

| body | cap | added |
|---|---|---|
| `sprite.open`'s project-scan results (`styles.scanList`) | `maxHeight: 220, overflowY: 'auto'` **and** `.slice(0, 200)` | `ef6c613`, 2026-06-17 |
| `S1ObjectSection`'s two row lists (`styles.list`) | `maxHeight: 240, overflowY: 'auto'` | `5e0d493`, 2026-08-12 |
| `sprite.open`'s saved-sprite picker | a native `<select>` | 2026-06-17 |

Both caps predate the flex model (2026-08-14), so they are not retrofits — they
are the original authors bounding their own lists. And the node guard sees them:
planting `scanList` without its `maxHeight` fails
`panel-scrollers.test.ts` on `sprite.open` today (§3).

**Two genuinely uncapped data-driven bodies do exist**, and neither is in
SpriteMode:

- `Explorer`'s `styles.items` — no cap, no overflow. The Object Library group
  renders ~102 rows (`S1_OBJECT_LIST`, `s1-objects.ts:178`, 102 named ids) plus
  the named art docs. **This is the largest content section on any of the four**,
  and it is bounded only by `styles.treeScroll` (`flex: 1, overflowY: 'auto'`).
- `CanvasMode`'s `canvas.commit` → `CommitPlanView.tsx:128` — one target row per
  256×256 chunk, no cap. `CANVAS_MAX_SIDE = 1024` (`canvas-doc.ts:142`) bounds it
  at 4×4 = **16 rows**, but that bound is arithmetic, not a style.

Both are argued about in §4.2 and §4.3. Neither is asserted to be a defect here.

### (c) "Whether a 240px column with nine sections is usable is a CDP question"

Agreed, and that is the harness. But §1's point 1 says the *answer* is decidable
without it: whatever the usability verdict, `variant="list"` cannot improve it on
an over-subscribed column, because the floor hands the deficit back to the same
scrollbar. `r4` prints that per surface so the claim is measured rather than
argued.

---

## 3. Are the item-18 guards correctly scoped? — **the booking's premise is stale**

The booking says these four panels are "invisible to those guards." **They are
not, as of item 18.** `deriveSections()` no longer walks facet modules; it scans
every `.tsx` under `src/renderer` for the primitive's call sites. Dumped from the
live helper on this branch:

```
TOTAL SECTIONS 43   OWNERS 14   PANELS 25
  components/canvas/CanvasMode.tsx      canvas.doc / canvas.palette / canvas.commit   variant=content
  components/setup/ProjectSetupTab.tsx  setup.${g.id}                                 variant=content
  components/sprite/S1ObjectSection.tsx sprite.s1-objects / sprite.s1-shared-objects  variant=content
  components/sprite/SpriteMode.tsx      save-source / mapping / name / open /
                                        export / character / palette                  variant=content
  shell/Explorer.tsx                    explorer.${g.id}                              variant=content
  …plus EffectsScenePanel (4) and the 25 facet sections
```

**14 content sections across 5 declaring files on the four surfaces** — the
booking's `9 + 3 + 1 + 1`, exactly.

### The guards discriminate on these surfaces — proven red-first

Both plants were made, run, and reverted on this branch:

| plant | result |
|---|---|
| `SpriteMode.tsx` `styles.scanList`: drop `maxHeight: 220` | `panel-scrollers.test.ts` **1 failed / 94 passed** — `components/sprite/SpriteMode.tsx sprite.open (variant=content) has an unbounded scroller in its own body` |
| `Explorer.tsx` `styles.items`: add `overflowY: 'auto'` uncapped | **1 failed / 94 passed** — `shell/Explorer.tsx explorer.${g.id} (variant=content) has an unbounded scroller in its own body` |

Baseline before each plant: `panel-scrollers` + `panel-headings` = **140 passed**.
Both plants reverted; the working tree carries no product change.

So the answer to question 3 is: **the guards already cover these four, in the
per-section form, and that coverage is real rather than nominal.** What they do
*not* cover, and correctly do not:

- the `UNBOUNDED_BY_NATURE` list (4 hand-named panel files, none on these
  surfaces) — that list is explicitly "named, not derived… being data-driven is
  not a property of the source", and adding `Explorer.tsx` to it would be a
  category error: the rule it enforces is *"is only ever mounted in a
  `variant="list"` section"*, which is precisely the thing this parcel concludes
  Explorer should **not** be;
- the `variant="list"` scroller rule — vacuous here by construction, because none
  of the fourteen declares `list`. That is not a hole; it is the rule not
  applying.
- **anything geometric.** No node rule can see a column's height. That is the
  harness's job, and it is why item 19 was booked as a CDP question.

**Recommendation: change nothing in the guards.** Their subject list is now
derived from the primitive and is closed under composition depth; their
hand-maintained lists are correctly scoped to what they name.

---

### 3.1 One datum that reframes "the escape hatch"

**Every one of the 15 `<Panel>` mounts in the renderer declares `scroll`** —
all seven facet columns, both engines, the effects panel, and both of the
non-facet ones. So the container scrollbar is not something these four surfaces
fell back to while the facet columns did something better. It is what *every*
column in the app declares, including every column the flex model was built for.
The difference is only whether a `variant="list"` section is there to absorb the
height first, and `r4` measures whether one could.

---

## 4. What is actually there, surface by surface

### 4.1 SpriteMode — the extreme case, and how you reach it

Nine sections in a `<Panel width={240} scroll>`. Reaching nine requires **aeon
first, classic second**:

- `state/open-project.ts`'s header: *"A window holds exactly one project at a
  time. Classic wins the tie because a classic open leaves a previously-resident
  aeon project in the store."*
- `useProjectStore.getState().reset()` appears **only in tests** — no app path
  clears the resident aeon project on a classic open (grep across `src/`).
- `SpriteMode.tsx` reads `s.project` directly, so with both stores populated both
  gates are open.

Harness phase C drives exactly that order. Row `S9.nine` is the falsifier: if the
app *does* clear the aeon project, that row reports 7 and item 19's extreme case
does not exist. **That would be the most useful outcome the harness could have,
and it is not treated as a failure.**

Data-driven bodies: all capped (§2b). Nested scroll depth: **2** — the Panel
scroller plus one 220/240px inner list. Row `c3` asserts that; row `c4` asks the
question that actually decides whether depth 2 is confusing (does the wheel chain
out of an exhausted inner list, or dead-end?). Nothing in `src/` sets
`overscroll-behavior`, so chaining is predicted to work; `c4` is what turns that
prediction into a measurement.

### 4.2 Explorer — the largest content section in the app, and correctly so

One call site, rendered per group. ~102 Object Library rows in `styles.items`,
uncapped, inside `styles.treeScroll`. Three facts argue it is right as it stands:

- **Every group is `defaultCollapsed`** (`Explorer.tsx:249`), so the tall state is
  one the user opted into and localStorage remembers.
- **The filter force-expands via `collapsedOverride`** (`:250`), which is the
  designed way to make a 102-row group navigable — a per-group scrollbar is not.
- **A per-group scrollbar is the wrong affordance for a tree.** No file tree in
  any editor gives each folder its own scrollbar, and `LIST_SECTION`'s promise
  ("takes an equal share… and scrolls inside it") would give four groups four
  bars in a 240px rail.

Item 18's parcel already ruled the tree scroller a **false positive** when a
widened guard flagged it, on exactly this reasoning ("the surface's OWN
container… all four are correct"). This parcel agrees.

### 4.3 CanvasMode — the one section authored *after* the model

Three sections, all forms. `canvas.commit` is the only section on any of the four
surfaces that is **(i)** data-driven, **(ii)** uncapped in style, and **(iii)**
authored after `variant` existed:

| | |
|---|---|
| `CanvasMode.tsx` created | `f55a696`, 2026-08-15 — one day after the model, with **two** sections (`doc`, `palette`) |
| `canvas.commit` added | `c16f61c`, 2026-08-15 |
| body | `CommitPlanView.tsx:128`, one `<Select>` row per 256×256 chunk |
| ceiling | `CANVAS_MAX_SIDE = 1024` → 4×4 = **16 rows**, arithmetic not style |

Neither commit message mentions section variants, so there is no written evidence
of a deliberate choice — but 16 bounded rows is a small enough worst case that
`content` is the right answer regardless. The harness measures it at exactly that
worst case (a 1024×1024 canvas), with `C.i0` asserting all sixteen rows really
rendered — a canvas under 256px shows *"nothing to commit yet"* and would make
every geometry row green for the wrong reason.

### 4.4 ProjectSetupTab — not a column, and it should not become one

A page, not a panel: `styles.column` is `maxWidth: 860, margin: '0 auto'` inside
`styles.scroll` (`flex: 1, overflowY: 'auto'`), with the **Apply & re-validate
footer deliberately outside the scroller** so it is always reachable. Groups are
`defaultCollapsed` when fully resolved (`:252`), i.e. the tab opens showing only
what needs attention. `LIST_SECTION` has no meaning on a document page.

### 4.5 The residual finding: two projects, one SpriteMode

Not a layout defect, and outside this parcel's mandate to fix — but it is what
the nine-section configuration is *made of*, so it belongs in the record:

> In an aeon-then-classic session, SpriteMode renders **"Export to project"** and
> **"Load engine character"** against a resident aeon project the user has
> already navigated away from, beside the classic disasm's own object list and
> save-to-source. `state/open-project.ts` exists to be the one answer to "which
> engine is open" and its own docblock records that four call sites once derived
> this independently and two disagreed. `SpriteMode.tsx:49`/`:54` is a fifth
> site deriving it independently.

Whether that is a bug depends on a product call nobody has made (is cross-engine
sprite porting a feature of that state, or an accident?). **Recommend booking it
as its own item** rather than folding it into a layout decision.

---

## 5. Deliberate choice, or unexamined default? — per surface

The flex model landed in `5399202` (2026-08-14). **That commit touched none of
the four surfaces.** Its 14 changed files are three `ui/` files
(`CollapsibleSection`, `primitives`, `index`), two guard files
(`panel-scrollers.test.ts`, `helpers/section-panels.ts`), the four data-driven
panels (`ChunkGrid`, `ObjectList`, `SectionGridNav`, `RingPatternPalette`) and
five facet modules. Its measurement table lists only facet columns (classic
Layout / Objects / Art, aeon Layout, aeon Objects, aeon Rings).

| surface | created | verdict |
|---|---|---|
| `SpriteMode` | `359fc77`, 2026-06-17 | **Unexamined default** — two months before `variant` existed. *But* it is named in the Panel docblock as the escape hatch's justification, so it was reasoned about even though its file was not opened, and the number written down was not re-derived. |
| `S1ObjectSection` | `5e0d493`, 2026-08-12 | **Unexamined default** — predates the model. Its `maxHeight: 240` is contemporaneous, so the author bounded the list without needing the variant. |
| `Explorer` | `ad93e11`, 2026-08-12 | **Unexamined default** — predates the model. Item 18 has since examined it and ruled the tree scroller correct. |
| `ProjectSetupTab` | `54e0aad`, 2026-08-12 | **Unexamined default** — predates the model. Also the surface the variant is least applicable to. |
| `CanvasMode` | `f55a696`, 2026-08-15 | **Available but unexamined.** The only surface authored after the model; no commit message or comment mentions the variant. Two form sections make `content` obviously right; `canvas.commit` (`c16f61c`, same day) is the one place a choice was plausibly available and no record of one exists. |

So: **four of five are unexamined defaults in the strict sense that the option did
not exist, and the fifth is an unexamined default in the sense that it did.** None
is a documented decision. The docblock's SpriteMode sentence is the closest thing
to one, and §2a shows it is unqualified rather than wrong.

---

## 6. The harness

**`scratchpad/section-column-harness.mjs`** — committed on this branch.

```bash
cd /home/volence/sonic_hacks/aurora          # the MAIN checkout; ROOT is hardcoded
VITE_AURORA_DEBUG=1 npm run build            # __dbg exists only with the flag

SCREEN=1680x1050 node scratchpad/section-column-harness.mjs
SCREEN=1280x800  node scratchpad/section-column-harness.mjs
node scratchpad/section-column-harness.mjs --compare      # c5 + minimum window height

# red-first — each plant must flip ONLY the rows it is written for
PLANT=clip             SCREEN=1280x800 node scratchpad/section-column-harness.mjs
PLANT=nested           SCREEN=1280x800 node scratchpad/section-column-harness.mjs
PLANT=contain          SCREEN=1280x800 node scratchpad/section-column-harness.mjs
PLANT=list-no-scroller SCREEN=1280x800 node scratchpad/section-column-harness.mjs
```

`VERBOSE=1` tees Electron's output; screenshots go to
`scratchpad/shots-section-column/`; each run writes
`scratchpad/section-column-<SCREEN>.json`.

**The instrument.** `ui/primitives.tsx`'s `PanelHeader` is rendered by exactly one
component in the whole renderer — `ui/CollapsibleSection` (`grep '<PanelHeader'`:
no other call site). So a `<div>` whose computed style is `textTransform:
uppercase` + `letterSpacing: 1px` with a leading `<span>` **is** a titled section
header, and its grandparent is the section box. The enumeration is structural and
one-to-one with source call sites, not a maintained list. Collision check, because
a signature scan is only as good as what else could match it: two other styles in
the tree pair uppercase with `letterSpacing: 1` — `HomeTab`'s `sectionTitle` (a
`div`, but its children are bare text, so `children[0]` is undefined) and
`ProjectSetupTab`'s `infoKey` (a `span`, excluded by the tag test). Everything
else uses `letterSpacing: 0.5`. Both exclusions are load-bearing.

**Bounding.** The Explorer is persistent and its groups are titled sections too,
so every measurement is bounded to one x-range (`minLeft`/`maxLeft`, split at
x=280 — Explorer is a fixed 240px). An unbounded scan would measure the Explorer
four times and report four green columns: chunkgrid-hint-harness's row 5t in
another costume.

**Configurations driven.** Phase A (classic only): Explorer, ProjectSetupTab,
SpriteMode-7, CanvasMode at 1024×1024. Phase B (aeon only): SpriteMode-6. Phase C
(aeon *then* classic, no reload): SpriteMode-9.

---

## 6.5 What the controller runs found — four instrument defects

**The recommendation survived; the harness did not.** The controller ran both
`SCREEN` invocations. Eight rows failed, and every one of them was the
instrument, not the app.

*Two controller runs, four instrument defects. None of them touched the
conclusion — the source-level argument in §1 never depended on the harness — but
all four are about whether this instrument can be trusted next time.*

### Defect 1 — `SCREEN` sized the xvfb display, not the Electron window

```
SCREEN=1680x1050  ->  window 1400x872
SCREEN=1280x800   ->  window 1400x872
```

Electron opens its window at its own configured size regardless of the virtual
display. **The six `i4` rows caught it and failed loudly** rather than letting
the geometry rows report numbers from a window nobody asked for — the
anti-vacuous discipline doing exactly its job.

What it cost, stated in the terms §7 used:

- **`c5` could not discriminate as invoked.** `--compare` would have compared two
  runs at the *same* viewport, reported "0.0% drift, PASS", and called
  run-to-run noise a size property. **`c5` is withdrawn from the discriminating
  list until `V.set` passes at two genuinely different sizes.**
- **The `PLANT=list-no-scroller` split was untestable.** The prediction (red at
  1280×800, possibly green at 1680×1050) stands, unmeasured.

**Fixed.** `SCREEN` now drives the *page viewport*, set explicitly and verified:
`Browser.setWindowBounds` first (a real OS resize), `Emulation.setDeviceMetricsOverride`
second, and if neither takes the run is **BLOCKED** on the size axis and says so
rather than measuring whatever it got. `XVFB` sizes the display and only has to
be big enough to hold the viewport. A new row **`V.set`** asserts this once, at
setup — the row that would have caught the defect at its source instead of as six
scattered `i4` failures. `--compare` now **refuses** when the two summaries share
a viewport height. If the emulation path is what takes, the run says so: layout
viewport geometry is faithful, scrollbar gutter width and OS chrome are not.

### Defect 2 — `C.i0` and `C.c4`: one cause, and it is not nested scroll

The controller asked me to check rather than adopt their inference. **Their
bottom line is right and their mechanism is not, and the difference matters.**

**Root cause, found in source:** `NEW_CANVAS_DEFAULTS` has no default name, on
purpose — `new-canvas.ts:77`: *"the name field opens empty on purpose (Create
starts disabled until the artist types one)"*, enforced at
`NewCanvasDialog.tsx:106` (`newCanvasFieldErrors`) and `:125` (`submit` returns
early). **The harness set only the width and height.** Create was disabled, the
click did nothing, **no canvas was ever created**, and the block went on to
measure SpriteMode's column a second time under CanvasMode's name.

`C.i0` failed correctly. `C.c4` then armed *SpriteMode's* row list, so its red is
a verdict about a run whose subject was wrong. **It is not evidence about
CanvasMode and not evidence about nested scroll.**

**And there is a hard source fact that settles it independently of the
diagnosis:** there is **no `overflow: auto` or `scroll` anywhere inside
CanvasMode's three sections.** `grep -rn overflow src/renderer/components/canvas/`
returns exactly two hits — `canvasWrap` (the canvas area, outside the `Panel`)
and `ImportSheetDialog`'s body — and `PaletteGrid.tsx:173` documents *"No
`overflow: auto` anywhere below"*. So **when CanvasMode is genuinely on screen,
`C.c4` must report NOT MEASURED. A red `C.c4` is proof the surface was not
CanvasMode.** The two failures are therefore *not* independent, and **the
recommendation for CanvasMode is unchanged.**

### The size fix worked, and the cross-size data strengthens evidence line 1

`V.set` passes at both viewports (65/65 each), and `--compare` now compares two
genuinely different runs — the setup tab's column measured **975px vs 725px**,
SpriteMode-9's **706px vs 456px**. **Controller-measured, second run:**

| surface | window height needed to lose its scrollbar |
|---|---|
| `ProjectSetupTab` | **~6326px** |
| `SpriteMode` (nine) | **~2071px** |
| `SpriteMode` (seven) | **~1780px** |
| `CanvasMode` (1024×1024) | **~1306px** |
| `SpriteMode` (six) | **~1201px** |

**Every surface overflows at both viewports, by wide margins.** So the flex
model's floor does not merely engage at today's window sizes — it engages across
the whole range these columns are ever seen at. §1's point 1 is now measured
rather than argued, and `S9.r4`'s −674px share is not an artefact of one window.

**One sharpening, because the strong form overshoots for two rows.** "There is no
window size a human owns where the floor wouldn't engage" holds outright for
`ProjectSetupTab` (~6326px is beyond any display) and for the whole set at 1080p
and 1440p, which is nearly every screen in use. It does *not* hold universally for
the bottom three: a 4K panel maximised gives ~2160px of window, which would clear
`SpriteMode`-6 (~1201px), CanvasMode (~1306px), `SpriteMode`-7 (~1780px) and even
`SpriteMode`-9 (~2071px). The honest statement is: **at every display size in
common use every one of these columns is over-subscribed, and the one surface
that is over-subscribed at literally any size is `ProjectSetupTab`** — which is
also the surface the flex model is least applicable to. That is still decisive
for the recommendation, and it is what the numbers actually support.

---

### Defect 3 — the one the controller could not see, and it was the worst

Chasing defect 2 exposed a defect in the instrument built to prevent exactly this:

> **`expect.titles` was read off the screen immediately before being asserted
> against the screen.** `C.i1` — "exactly the 3 expected sections are on
> screen" — compared the subject to itself and **could not go red for any
> reason**. It reported green against SpriteMode's seven titles while
> CanvasMode was nowhere on screen.

That is the dominant defect class in this repo, one level inside the harness
written to catch it, and the controller's trust in "`i1` saw its subject" was
misplaced for **every** surface in that run.

**Fixed three ways:**
1. **Titles are literals now**, transcribed from the call sites (`T_SPRITE_ALWAYS`,
   `T_SPRITE_AEON`, `T_SPRITE_CLASSIC`, `T_CANVAS`, `T_EXPLORER_CLASSIC`). The one
   data-driven title (`${zone.toUpperCase()} objects`) is a matcher; the setup
   tab's are zone ids with no literal set, so that surface uses a floor plus a
   DOM sentinel and says so.
2. **A store-level sentinel (`i0`) per surface** — `__dbg.canvas.activeDocId()` +
   the document's real dimensions, `__dbg.spriteState().activeDocId` plus which
   projects are resident, and so on. Answered by the store, which no leftover
   paint can satisfy.
3. **The gate.** If any instrument row fails, **every** claim row and report for
   that surface is NOT MEASURED — never red, never green. The controller's
   inference about `C.c4` is now an enforced property rather than something a
   reader has to reconstruct.

Two smaller fixes fell out: `C.setup2` asserts Create is **enabled before it is
clicked**, and `C.setup3` asserts a 1024×1024 document is checked out — the
defect caught at its own site rather than four steps downstream in a geometry
number. `c4` now reports the armed element's identity, how many wheel events the
page saw and whether anything cancelled them, and spaces its ticks 400ms apart
because Chromium latches a scroll sequence to the element the first event hit —
this row's most likely reason to report a false red, disclosed rather than hoped
away. `armInnerScroller` now arms the **tallest** overflowing scroller rather
than the last in DOM order, and S7/S9/C name the same wheel section, so two
configurations measuring the same column cannot disagree by accident.

### Defect 4 — `PLANT=list-no-scroller` deleted its own judge, and `c1` was aimed at the wrong geometry

```
PLANT=list-no-scroller SCREEN=1680x1050  ->  65/65 passed  (+19 NOT-MEASURED)
PLANT=list-no-scroller SCREEN=1280x800   ->  65/65 passed  (+19 NOT-MEASURED)
```

NOT-MEASURED went 13 → 19 under the plant, and the six extra were all `c4`:
the plant strips inner scrollers, `c4` judges inner-scroller behaviour, so the
plant disabled the row and the run reported clean. Each note was honest about
why; **the headline still read as a green run with a poison installed.**

**But the deeper fault is `c1`, and it is mine.** `c1` was supposed to be this
plant's judge, and it compared section **border boxes**:

```js
if (a.section.bottom > b.section.top + 1)   // the old test
```

The shape it exists for *does not move those boxes*. A section sized by the
column paints its children below its own box while the box stays exactly where
the column put it — that is what the effects panel shipped, 954px of layer cards
over the assignment rows, with every border box where flexbox had placed it. **So
`c1` was blind to the one defect it was written for**, and the plant that
reproduces that defect could not turn it red at any window size. It was not just
non-discriminating on an unplanted tree, as §7 disclosed; it was non-functional.

**Fixed, three ways:**

1. **`c1` now measures painted extent, not boxes.** A new `contentBottom(sec)` in
   the probe walks descendants for the lowest painted pixel and **stops at any
   box that clips** — descending into an `overflow: auto` list would report every
   capped inner list in the app as an overlap, a false red, which is the opposite
   failure and just as useless. A border-box overlap (strictly worse) is reported
   separately as `c1box`.
2. **`P.invariant`, the general fix the controller asked for:** if `PLANT` is set
   and no row went red, that is a **FAILURE**, whatever the disclosure says. It
   protects every future plant, not this one.
3. **`P.invariant2`:** the plant's *named* judge (`PLANT_JUDGE`: `clip`→`c2`,
   `nested`→`c3`, `contain`→`c4`, `list-no-scroller`→`c1`) is what must go red.
   Some other row happening to fail does not make a plant coverage for the
   property it names.

**The plant is re-aimed, not retired** — it now has a judge that survives it.

**And I withdraw the split I predicted.** I said `c1` should be red at 1280×800
and possibly green at 1680×1050, because flexbox only squeezes when free space is
negative. The cross-size numbers settle it: these columns are over-subscribed at
*both* viewports by wide margins, so there is no slack to find at either size and
the plant should be **red at both**. The reasoning about flexbox was right; the
premise that these columns ever have room to spare was wrong.

---

### One arithmetic reconciliation for the next run

**Settled.** I counted six measured surfaces → six `i4` rows, plus `C.i0` and
`C.c4` = eight. The controller recounted from their own output — `E.i4`, `P.i4`,
`S7.i4`, `C.i4`, `S6.i4`, `S9.i4` — confirmed six, and corrected the "seven of
eight" figure on their side. Recorded because a number that travelled in a status
and turned out to be wrong is worth leaving a trace of. It is moot going forward:
`V.set` now fails once at setup instead of `i4` failing per surface.

---

## 7. What each row should print, and which rows can go red

*Re-stated after the first controller run. `c5` has moved OUT of the
discriminating list; `V.set` is new; the instrument rows are materially
stronger than they were, and one of them was previously vacuous.*

### Rows that discriminate

| row | asserts | goes red under |
|---|---|---|
| `V.set` | the page viewport really is the size this run asked for, and by which mechanism | the xvfb defect, and anything else that leaves the window at its own size. **Would have caught defect 1 at its source.** If neither mechanism takes, the run is BLOCKED on the size axis rather than measuring what it got |
| `c2` | every section can be scrolled fully into view | `PLANT=clip`. Not trivially green: Explorer's root is `overflow: hidden` with the scroller nested inside, and the setup tab keeps its footer outside its scroller, so "which box actually scrolls" is a real question on two of the four |
| `c3` | no row is more than two scrollbars deep | `PLANT=nested`. SpriteMode genuinely sits at depth 2 today; three would be the defect |
| `c4` | a wheel over an exhausted inner list chains out to the column | `PLANT=contain`. The only place nested-scroll confusion is observable. **NOT MEASURED, by source-derived necessity, whenever CanvasMode is genuinely on screen** — that surface has no inner scroller at all |
| `c5` | the natural stack height is a content property, not a window property (≤4% drift across sizes) | **Earned back.** `V.set` now passes at two genuinely different viewports (975 vs 725px, 706 vs 456px), so this compares real cross-size data instead of a run against itself. `--compare` still refuses when the two viewports match |
| `P.invariant` | a run with `PLANT` set has at least one red row | **any plant that disables its own judge.** The general protection for every future plant |
| `P.invariant2` | the plant's *named* judge is the row that went red | a plant whose coverage claim is carried by some unrelated failure |
| `S6.doc` | `ui/primitives.tsx`'s "SpriteMode mounts six" holds in an aeon-only session | a section added or removed since |
| `S7.seven` / `S9.nine` | the classic-only and both-resident counts | **`S9.nine` is the booking's central number.** Red = the nine-section column is unreachable and item 19's extreme case does not exist |
| `i0` (per surface) | a STORE-level sentinel: the surface is really mounted | anything painted that is not this surface. **New — this is what defect 3 was missing** |
| `i0b` | the data-driven subjects really rendered their data (16 commit rows; ≥100 tree rows) | a canvas under 256px, a filtered tree, a collapsed group, an unloaded project |
| `i1` | the exact expected title set, **transcribed from the call sites** | a surface that is not the one named. **Previously vacuous — it read its expectation off the screen and compared the screen to itself** |
| `C.setup2` / `C.setup3` | Create is enabled before it is clicked; a 1024×1024 doc is checked out | **defect 2, at its own site** |
| `i2`–`i4` | painted heights, one shared container with a real height, no viewport drift mid-run | upstream breakage |

### Rows that do NOT discriminate on an unplanted tree

**`c1` still cannot go red without a plant** — every section on these four
surfaces is `CONTENT_SECTION` = `flexShrink: 0` inside an `overflow: auto` box,
so the stack grows and the container scrolls rather than anything overlapping. A
green `c1` is not evidence that these columns are healthy; it is evidence that
they are made of `flexShrink: 0`.

**What changed is that it is now a functioning judge of the planted shape.** It
compares painted extent rather than border boxes (defect 4), so
`PLANT=list-no-scroller` turns it red — which it could not do before at any window
size. `P.invariant2` now asserts that.

**Nothing is currently withdrawn from the discriminating list.** `c5` was, after
the first run, and has been earned back.

**`c4` reports NOT MEASURED rather than passing** on Explorer, ProjectSetupTab
**and CanvasMode**: none has an inner list with anything to scroll, so
dead-ending cannot arise there. For CanvasMode this is a *source-derived
necessity*, not an observation — there is no `overflow: auto` inside any of its
three sections — which is what makes a red `C.c4` proof that the surface was not
CanvasMode. `c4` also reports NOT MEASURED where the outer column has nothing to
scroll, and where no wheel event reached the page at all.

**`PLANT=list-no-scroller` is now expected RED AT BOTH SIZES.** The split this
section previously predicted — red at 1280×800, possibly green at 1680×1050 — is
**withdrawn**. Flexbox does only squeeze a `flex: 1 1 0` item when free space is
negative, but the cross-size run showed free space is negative on every one of
these columns at *both* viewports (the smallest, SpriteMode-6, still wants a
~1201px window). There is no slack to find, so there is no split. The reasoning
was right; the premise that these columns ever have room to spare was wrong.

---

## 8. What remains unmeasurable

- **Everything geometric, until the harness is run.** §1's point 1 is arithmetic
  from source constants and is sound without it; §4's per-surface px numbers are
  not, and are not asserted anywhere above.
- **Whether nested scrolling is *confusing*, as opposed to *deep*.** `c3` counts
  bars and `c4` checks the wheel chains. Neither can tell you whether a user
  looking for the palette at the bottom of a nine-section column finds it. That
  needs eyes, and the screenshots are written for exactly that.
- **Whether nine sections in 240px is the right information architecture.** This
  parcel measures whether the *layout model* is wrong. It cannot tell you whether
  SpriteMode should have nine sections at all — that is a design question, and
  §4.5 suggests the honest version of it is "should a classic session be showing
  aeon export controls?"
- **The `list-no-scroller` plant on Explorer specifically.** Its section bodies
  have no inner scrollers to remove, so the plant reduces to applying
  `LIST_SECTION` — which is a faithful reproduction of the defect shape but a
  weaker one than on SpriteMode.

---

## 9. Deviations from the brief, flagged for ratification

1. **I planted two defects in product source to prove the item-18 guards
   discriminate** (§3), ran the guard, and reverted both. `git status` is clean of
   product changes; the only added files are the harness and this document. Flagged
   because the brief says do not "fix" anything not shown to be a defect — this was
   the opposite (deliberately introducing a defect to test an instrument), but it
   did touch `src/`.
2. **I answered question 3 with "the premise is stale"** rather than with a
   recommendation to widen the guards. Item 18's fix already enrolled these four;
   the booking's wording describes the pre-fix state.
3. **I recorded a non-layout finding** (§4.5, the two-projects-one-SpriteMode
   state) because the nine-section configuration is built out of it. It is booked
   as a suggestion, not acted on.
4. **The booking's "four surfaces" is not short.** Bar 12 says count by what
   mounts a section, not by what defines one, so I enumerated all 43
   `<CollapsibleSection>` call sites and all 15 `<Panel>` mounts (a sixteenth
   `<Panel` hit is prose inside `EffectsScenePanel`'s own docblock — the same
   comment-vs-code trap item 18 had to fix in its scanner), and checked for
   aliasing (`React.createElement(CollapsibleSection)`, re-export under another
   name: none — `ui/index.ts:5` is a plain re-export). The one non-facet owner the
   booking omits is `EffectsScenePanel` (4 sections), and it is *correctly*
   omitted: two of its four are `variant="list"`, so it fails the booking's own
   predicate ("every one is `variant="content"`"). **No fifth surface.**
