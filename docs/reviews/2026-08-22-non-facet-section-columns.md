# The four non-facet section columns — measured, not fixed

*ROADMAP §5.1 item 19. Branch `measure/non-facet-section-columns`. 2026-08-22.*

> **This is a measurement parcel and it changed no product source.** Node suite
> **4242 passed / 3 skipped** (identical to the master baseline at `a82d3db` —
> nothing was touched), `tsc --noEmit` clean, wall clock at the run:
> `16:59:07 up 4 days, 17:22, load average: 21.53, 63.44, 51.52` (heavy parallel
> load; the suite still finished in 10.50s, and nothing here is a timing claim).
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
   today. Row `r4` prints that arithmetic per surface, per window size.
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

## 7. What each row should print, and which rows can go red

### Rows that discriminate

| row | asserts | goes red under |
|---|---|---|
| `c2` | every section can be scrolled fully into view | `PLANT=clip`. Not trivially green: Explorer's root is `overflow: hidden` with the scroller nested inside, and the setup tab keeps its footer outside its scroller, so "which box actually scrolls" is a real question on two of the four |
| `c3` | no row is more than two scrollbars deep | `PLANT=nested`. SpriteMode genuinely sits at depth 2 today; three would be the defect |
| `c4` | a wheel over an exhausted inner list chains out to the column | `PLANT=contain`. The only place nested-scroll confusion is observable, and it has never been checked on a real wheel event |
| `c5` | the natural stack height is a content property, not a window property (cross-size, ≤4% drift) | a layout whose section heights track the window — which would make every px number here meaningless. Reported **NOT MEASURED** from a single run, never quietly skipped |
| `S6.doc` | `ui/primitives.tsx`'s "SpriteMode mounts six" holds in an aeon-only session | a section added or removed since |
| `S7.seven` / `S9.nine` | the classic-only and both-resident counts | **`S9.nine` is the booking's central number.** Red = the nine-section column is unreachable and item 19's extreme case does not exist |
| `C.i0` / `E.i0` | the data-driven subjects really rendered their data (16 commit rows; ≥100 tree rows) | a canvas under 256px, a filtered tree, a collapsed group, an unloaded project — every way this measurement could be of nothing |
| `i1`–`i4` | exact title set, painted heights, one shared container with a real height, the requested window size | any of the above going wrong upstream |

### Rows that do NOT discriminate — say so when reporting

**`c1` ("no section paints over the one below it") cannot go red on an unplanted
tree.** Every section on these four surfaces is `CONTENT_SECTION` = `flexShrink:
0` inside an `overflow: auto` box, so overlap is *structurally impossible*: the
stack grows and the container scrolls. `c1` is a **regression tripwire** for the
shape that did ship — the effects panel's 954px of layer cards — and it is red
only under `PLANT=list-no-scroller`. A green `c1` is not evidence that these
columns are healthy; it is evidence that they are made of `flexShrink: 0`.

**`c4` reports NOT MEASURED rather than passing** on Explorer and
ProjectSetupTab: neither has an inner list with anything to scroll, so
dead-ending cannot arise there. It also reports NOT MEASURED where the outer
column has nothing to scroll — chaining has no observable effect on a column that
already fits.

**`PLANT=list-no-scroller` is expected to be red at 1280×800 and possibly green
at 1680×1050**, and that split is a *finding*, not a harness fault: flexbox only
squeezes a `flex: 1 1 0` item when free space is negative. A column with room to
spare grows it instead, and nothing overlaps. Which columns have room to spare is
precisely what §1's point 1 turns on.

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
