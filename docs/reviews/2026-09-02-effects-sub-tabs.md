# EW-SHAPE-TABS — three sub-tabs, one job on screen

**What this answers.** The owner ruled the Effects tooling's shape on 2026-09-02
(`docs/decisions.jsonl`, `d-26b-effects-tooling-shape-ANSWERED`:
`three_sub_tabs_plus_section_strip`). Its first clause — the permanent section
strip — shipped as `docs/reviews/2026-09-02-effects-section-strip.md`. This is the
second: **three sub-tabs, with the panels re-parented so one job shows one panel.**

**Branch** `feat/effects-sub-tabs`, five commits.
**Suite** 6371 → 6383 passing, 0 failing, 8 skipped (each naming its reason), `tsc`
clean. **Harnesses** `effects-sub-tabs` 13/13 (new, three poisons) plus nineteen
neighbouring instruments, all but two of them run against master's build as well as
this one (§5 says which two, and why).

---

## 1. The measurement, on both sides, with one instrument

`scratchpad/effects-subtabs-geometry-probe.mjs` **asserts nothing**. It prints the
column's visible and scroll height, the LAYERS list's own inner scroller, and every
section's height, so the same script could be run against master's build and this
branch's and the two numbers compared without a gate deciding in advance what
"better" means. Both builds: `VITE_AURORA_DEBUG=1 npx electron-vite build` in this
worktree, 1680×1050 under xvfb, on a fresh `git archive` extract of aeon
`origin/master` `b294234b`. **`../aeon` was never written to. No emulator.**

**BEFORE** — master (`adefc7aa`, the drift merge), one column:

| state | visible | scroll | screens | LAYERS list |
|---|---|---|---|---|
| on arrival | 742px | **1,865px** | 2.51 | **129px** onto 2,460px |
| every section open | 742px | **4,843px** | 6.53 | **129px** onto 2,460px |

The list is 129px in **both** states, and that is the whole story of the defect: the
section is `variant="list"`, which takes a share of what the CONTENT sections leave —
and they left nothing, so it stood on `SECTION_LIST_MIN_HEIGHT` (160px, a header and
a 129px body) before the list was reached at all.

**AFTER** — this branch, same instrument, same aeon revision:

| tab | visible | scroll | screens | LAYERS list |
|---|---|---|---|---|
| **Parallax** | 742px | **742px** | **1.00 — no column scrollbar at all** | **211px** onto 2,378px |
| **Colour** | 742px | 999px | 1.35 | — |
| **Tile anim** | 742px | 742px | 1.00 | — |
| Parallax, every section open | 742px | 1,478px | 1.99 | 129px (back on the floor, by design) |

**The layer list: 129px → 211px, +64%.** Honest about what that is and is not: 211px
of a ~2,378px list is about one layer card and a half. The cards are large (eight
rows, a factor gloss, the drift row); the list is no longer *starved by the column*,
which is what this parcel could fix, and the card's own height is not this parcel's
subject. **The refusal paragraph and its own control now fit** — the drift parcel's
row `[5e]`, which failed at 132px in a 129px scroller, passes here.

One detail worth keeping: the Parallax list's content measures **2,378px** on
arrival and **2,460px** with the scene form open. Same layers, same width setting —
the difference is the column scrollbar appearing and taking ~15px, which rewraps the
hints. Removing the scrollbar gives the content back its width.

---

## 2. The grouping, against the card's mockup

d-26b's mockup names three jobs and draws the Parallax one: a `Layers [+ Add]` list
with `y` and factor per row, the factor gloss beneath it, and `Scene settings (v)`
**collapsed, at the bottom**. That is what was built.

| sub-tab | panel | sections |
|---|---|---|
| **Parallax** | `EffectsScenePanel` | `SCENES` · `LAYERS (n/16)` · `SCENE — <id>` (shut) · `SECTION ASSIGNMENT` |
| **Colour** | `RasterTimelineStrip` + `BandPresetPanel` | `RASTER TIMELINE` · `RASTER BAND PRESETS` · `PRESET — <id>` · `PRESET — <id> — CYCLES, VARIANTS` |
| **Tile anim** | `BgAnimBandPanel` | `TILE ANIMATIONS (n/4)` · `NEW TILE ANIMATION` |

**Each job is one panel that already existed**, which is why this is a re-parenting
and not a rewrite: no component was split, and the only edit inside a panel is the
Parallax one's section order.

**THE WALKTHROUGH'S DUPLICATE LIST, ANSWERED WHERE IT COULD BE.** The log's §c
listed seven apparent repeats. The two the shape settles:

- **c1 — "band" naming two features across six controls.** Wave 1 gave them names
  sharing no word; this puts them on **different sub-tabs**, so they can no longer be
  read as one list. Harness row `[3c]` measures that they are never on screen
  together — and §5 says why that row cannot carry the claim alone.
- **c3 — two per-section bindings ~4,000px apart.** They are now on two different
  jobs, with the strip above both stating the section and its two bindings
  permanently. **They were never one control**, which is the walkthrough's own point:
  a scene binding and a raster binding are different files' worth of different
  meaning.

The rest of §c is unmoved and stays open: c2 (two doors to a tile animation), c4 (a
self-declared duplicate playback chip), c5 (three ways to say "a horizontal line"),
c6/c7 (scene vs layer deform, `V factor` vs `Plane B split at`). None is a layout
question.

**Where the raster timeline went, flagged as a call I made.** The mockup does not
draw it. Its PRESET column is *editable* — drag a palette band's edge, split it —
and those bands are the Colour job's subject; its layer column is read-only context.
It is on **Colour**, above the preset form, for the same reason it used to sit under
the scene: it is the picture of what the form edits. **Reversible in one line** by
moving `<RasterTimelineStrip />` into the Parallax branch of `EffectsSubTabBody`.

**`PROPERTIES` is outside the three jobs**, last in the column, collapsed. It is the
facet's generic aeon readout — about whatever is selected, not about parallax,
colour or tiles — and putting it on one job would have made that job's contents a
lie. It costs every tab a 25px header.

---

## 3. Two things that are not re-parenting

### The scene form arrives collapsed, and it is the only reason the list has a height

`SCENE — <id>` is **478px of a 742px column**, and a content section never shrinks
(`ui/CollapsibleSection`). With it open the arithmetic is: strip 132 + advisory 107 +
`SCENES` 107 + form 478 + `SECTION ASSIGNMENT` 98 = 922px of content in a 742px
column, so the list is straight back on its 160px floor — measured, in the table
above, as the "every section open" row. **The sub-tab split alone does not fix the
list**; this is the half that does, and the mockup draws it.

Nothing was hidden: the fields did not move, one click opens it, and the disclosure
persists per author (`shell/panel-state`), so this is the ARRIVAL state only.

### The reveal now crosses the tab boundary

`Add blank tile animation` is a chip on the **tool-options bar**, which is on screen
whichever job is shown — so the band it makes can land two tabs away. `revealPanel`
opens a section *wherever it is mounted*, and a section on an inactive tab is not
mounted at all. A bare `revealPanel` here would have been the owner's own "I press
add a band bank and idk where it is" in a second costume, one parcel after it was
fixed.

`revealEffectsSection` (providers/effects-sub-tabs) is the one door: **it switches to
the owning tab first and then reveals**, and the order is asserted rather than
described — a node row subscribes to `panel-state` and requires the store already to
say `tileAnim` when the notification fires. Harness `[5b]` closes it on screen: the
chip is clicked from Parallax, the tab changes, the section opens, and the card it
made is painted inside the column.

### And where the tab bar lives, which is a consequence of the strip

The bar renders as the last row **inside the strip's own sticky box**, passed to
`SectionPicker` as `children`. Two sticky siblings at `top: 0` occupy the same 0 and
the later one paints over the earlier, so a second sticky box would have to know the
first one's height — which is content-dependent. A wrapper around both was rejected
for a sharper reason: it would make the strip's own `position: sticky` **dead code**,
and `poisons-effects-section-strip.sh` poison 1 — which deletes that line and
requires rows `[2b] [2c]` to go red — would silently start passing. A poison that
stops discriminating is worse than the defect it was written for.

**Sections are UNMOUNTED, never `display: none`.** Hiding would have kept every text
finder in this repo green while the control was unreachable, which is this facet's
own documented failure mode.

---

## 4. Red-first, from a committed baseline

`scratchpad/poisons-effects-sub-tabs.sh`, baseline `1c1e8391`. Each poison prints the
mutation as a real `git diff` of the working tree, names the runner, and restores
with `git checkout --` (`0 dirty file(s)` after each). Poisons 1 and 3 rebuild with
`VITE_AURORA_DEBUG=1` between mutation and run; poison 2 also runs the node row on a
fresh vitest transform cache, printed **0 before, 1 after**.

| poison | mutation | runner | result |
|---|---|---|---|
| 1 | both tab branches in `EffectsSubTabBody` made `if (false)` — every job renders the same panel | `effects-sub-tabs-harness` | **9/13** — `[3a] [3b] [5b]` and, as collateral, `[2b]` |
| 2 | the tab switch deleted from `revealEffectsSection` | `vitest … effects-sub-tabs.test.ts`, then the harness | **3 failed / 9 passed**, then **12/13** naming `[5b]` |
| 3 | `defaultCollapsed` deleted from the scene section | `effects-sub-tabs-harness` | **11/13** — exactly `[4a] [4b]` |

**Poison 1's collateral is worth reading.** `[2b]` measures permanence at the bottom
of a *scrolling* tab; with every job rendering the short Parallax panel, the Colour
tab no longer scrolls, so the row's own precondition fails. Reported rather than
tuned away — the row is about a scroll, and the poison genuinely removes the scroll.

⚠ **AND POISON 1 FOUND A VACUOUS ROW OF MY OWN, which is now labelled in the file.**
`[3c]` — "the two band features are never on screen together" — **went GREEN under
poison 1**, on a build where the tabs are decoration, because with every tab showing
the Parallax panel *neither* feature is on screen. A pair that never appears never
fails to appear together. It is the same shape the drift parcel found in its `[6b]`,
and it is kept only because `[3a]` (each tab paints its own sections) is asserted in
the same run: the conjunction is the claim, and the row cannot carry it alone.

**Plant.** `PLANT=rot-tabs` finds the bar by an attribute nothing carries: `[2a]`
fails and the run **aborts** — `3/4 rows had run — this is NOT a pass over the rows
that never ran.`

---

## 5. Thirteen neighbouring instruments, measured on both builds

Re-parenting moved every section this column's instruments drive. A section belonging
to another job is unmounted, so a harness standing on the default tab and looking for
a preset control finds nothing — correctly. Each file gets one `SUBTAB(id)` click
after the facet mounts, and three that read the scene form get an idempotent
`OPEN_SCENE_FORM`.

⚠ **EVERY ONE WAS RUN AGAINST MASTER'S BUILD FIRST**, because "it was already red"
and "I broke it" print the same output, and this repo has a memory of exactly that
mistake. Each run below was on a fresh aeon extract.

| harness | master | this branch |
|---|---|---|
| `effects-guide` | 11/11 † | **11/11** |
| `effects-drift` | 21/21 † | **21/21** |
| `effects-section-strip` | 14/14 | **15/15** (its 14 rows, plus `[1c]` naming the job) |
| `effects-section-picker` | 15/15 | **15/15** |
| `effects-refusal` | 13/13 | **13/13** |
| `raster-timeline` | 25/25 | **25/25** |
| `timeline-edit` | 39/39 | **39/39** |
| `vsplit-advisory` | 45/45 | **45/45** |
| `effects-bob` | green | **green** |
| `curve-option-disabled`, `curve-vsplit-reachable` | green | **green** |
| `effects-deform` | 33/37 | **37/38** — three of master's four reds go green |
| `band-preset` | 8 red | **the same 8** |
| `variant-cycle` | 28/31 | **the same 28/31** |
| `section-raster-select` | 22/23 | **the same 22/23** |
| `effects-scene` | 22/39 | **the same 22/39** |
| `effects-column` | 8 red | **the same 8** |
| `writer-originated-scene` | `[8b] [8f]` | **the same two** |
| `bganim-strip-range` | `[5a] [6c] [8a]` | **the same three** |
| `effects-guides` | 30/31 | **the same 30/31** |

† `effects-guide` and `effects-drift` are the two the brief named as must-stay-green
and the two that needed no edit; their "master" figures are **their own parcels'**
(`effects-first-run` wave 1, and `2026-09-02-effects-drift-control.md`, whose merge
is this branch's base), not a run I performed. Every other row in this table is two
runs I performed, on the same machine, minutes apart.

The eight "identical failing set" rows are **not this parcel's**, and are not fixed
here either — several are stale finders from wave 1's renames (`bganim-strip-range`
opens a section by `/^New band/`, which has been `New tile animation` since wave 1;
`section-header-action` matches `/^Layers \(\d+\/\d+\)$/` against a heading that has
read `Layers (n/16 per scene)` for longer than that). They are booked here rather
than quietly repaired inside a layout parcel.

**`effects-deform` going 33/37 → 37/38 is a side effect worth naming**: three of
master's failures are gestures on controls that were below the fold, and the shorter
column puts them on screen. Its one remaining red, `[4b]`, is red on master too.

**Two rows asserted something this parcel deliberately changed**, and are repaired
rather than deleted:

- `effects-deform`'s `panelIsDrawn` was `/Deform fg[\s\S]*Layer 0/` — an **ordered**
  pattern, which also asserted that the scene form came before the layer list. The
  claim it exists to make is "both halves of the Parallax job are on screen"; the
  order was never part of it, and asserting it made **eight** rows red for a reason
  none of them measure. Now two substrings.
- `vsplit-advisory` `[7a]`/`[7b]` pinned the scene sentence *between* the v_factor
  spinner and the layer cards. The layers are above the form now, so `beforeLayer0`
  no longer discriminates — the pair discriminates on `afterVFactor` instead, which
  does, in the new order. `[5j]` goes to the Colour job to look at the raster strip's
  sentence, because "it is not converted" and "it is not rendered" are different facts
  and measuring the second while meaning the first is how a scope row stops
  discriminating.

`effects-section-strip` `[2c]`'s travel clause was a literal `500`, a proxy for the
~1,600px that binding used to sit down the single column. It is **395px** down the
Colour tab, so the literal started refusing a strip that had genuinely survived the
scroll. It is derived now: the column moved by more than the strip's own height,
which is exactly when a non-sticky strip is entirely above the scrollport.

---

## 6. An instrument defect this run found in itself

The first run of the new harness failed `[2a]` on a correct build. Every harness in
this family finds "the scroller" by walking up for an ancestor that overflows — right
when the subject is a column that scrolls, and **the Parallax tab no longer
overflows**, which is row `[4b]`'s whole finding. The walk returned `null` on the one
tab the shape fixed. The scrollport is the `Panel`, whether or not it currently
scrolls; the fix is in the instrument and the reason is in its docblock.

---

## 7. For the owner — the appearance is UNRATIFIED

d-26b's own note: *"He chose the reasoning, not the picture… Treat the SHAPE as ruled
and the VISUAL DETAIL as unratified."* One shot per tab, from a clean arrival, at
1680×1050:

```
scratchpad/shots-effects-sub-tabs/effects-sub-tab-parallax.png
scratchpad/shots-effects-sub-tabs/effects-sub-tab-colour.png
scratchpad/shots-effects-sub-tabs/effects-sub-tab-tileAnim.png
```

(`scratchpad/shots*/` is gitignored, as the strip's and wave 1's captures were.)

**Granular calls made without asking, each reversible in one line:**

- the bar is a **segmented control** (one bordered group, the active segment filled,
  `role="tab"`), not three `Chip`s — a chip would have put `Parallax` and
  `Parallax preview` in the same visual tier on one screen, which is the walkthrough's
  own "things that look like repeats" authored fresh;
- the three labels are the card's own words (`Parallax` / `Colour` / `Tile anim`),
  and each carries a one-sentence `title` saying what the job is;
- the bar sits **below** the strip's condition rows rather than above them;
- `SCENES` stays open on arrival while `SCENE — <id>` shuts — the mockup shows
  neither, and a shut scene picker would hide how you choose what you are editing;
- `RASTER TIMELINE` is on Colour (§2), and `PROPERTIES` is outside all three.

---

## 8. What is open, and what the instruments cannot see

- ⚠ **NO EMULATOR, NO ROM.** Nothing here says what any of this looks like running.
- **The toolbar is unscoped.** `Promote from tile N` and `Add blank tile animation`
  are tile-animation verbs and they are on screen while you are authoring parallax —
  the walkthrough's defect 2 (the first control an author meets builds the wrong
  feature) is *mitigated* by the sub-tab the panel switches to, not removed. Scoping
  the chips to the Tile anim job is a real option and it would delete the seam row
  `[5b]` proves; it was not taken here.
- **"The parallax preview is on by default on the Parallax sub-tab"** — d-26b's third
  clause — is still **not** done. The chip exists and is off by default;
  `showCameraPreview` is one global view flag shared with every facet's `View` menu,
  so "on by default on this tab" needs the flag to become tab-scoped, which is its own
  parcel with its own opinion about view state.
- **The canvas layer-drag** the card mentions ("layer edges draggable the way band
  edges already are") is untouched; the map already drags layer guides in world
  space, and the strip's layer column is read-only by ruling.
- **Eight neighbouring harnesses are red on both builds** (§5). Stale finders, not
  regressions, and now written down.
