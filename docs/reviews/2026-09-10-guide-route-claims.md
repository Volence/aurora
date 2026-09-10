# THE IN-APP GUIDE'S ROUTE CLAIMS — a census, one FALSE, and what now holds them

**Branch:** `parcel/guide-route-claims`, base `master` at `33ccee18`.
**Subject:** `docs/guides/effects-first-run.md`, which
`src/renderer/components/guide/guides.ts` imports with Vite's `?raw` and renders **verbatim**
into the Guide tab. Every sentence in it is a sentence the app says to a person.
**Machine constraint honoured:** node only. No Electron launch, no CDP run, no emulator tool
called or attempted. `node_modules/.bin/electron` does not exist in this worktree.

> ## ⚠ WHAT A ROUTE CLAIM IS, AND WHY IT NEEDED ITS OWN CENSUS
>
> A **route claim** is a sentence asserting **where a control is**, **in what order things
> appear**, or **what state a section or a control arrives in**. It is not a label claim.
>
> `scripts/check-guide-text.mjs` already covers the label class, and its own header is explicit
> about that population: every backticked span is the claim *"you will find this string on
> screen"*, re-derived from the component that renders it. **It says nothing about position,
> order or arrival state.** A guide can name every control correctly and still send the reader
> to the wrong end of the column, and until this packet nothing in the repo could tell.
>
> One route claim had already gone false once, been fixed, and been left unheld. This census
> found a **second** one false — broken by the *same landing that fixed the first*.

---

## 1 · Headline numbers

| | |
|---|---|
| Route claims enumerated | **45** |
| Currently **TRUE** against their producer | **44** |
| Currently **FALSE** | **1** (R5, the §1 panel diagram's Colour column) |
| Held by an existing test **before** this parcel | **1** (R17, and only half of it) |
| Held by a test **after** this parcel | **26** |
| Still unheld after this parcel, with reason | **19** (§5) |

The FALSE one is fixed in this parcel, in the guide, against the source. **No component
behaviour, control label, mount order or UI was changed to make any sentence true** — that was
outside this parcel's scope, and no claim needed it.

---

## 2 · ⚠ THE LIVE DEFECT — R5, and how it was made

### 2.1 What the app told a person

§1 of the guide draws the right-hand panel as a fenced schematic. Its **Colour** column read, top
to bottom:

```
RASTER TIMELINE
RASTER BAND PRESETS §3
PRESET: <id> §3
PRESET: <id> · CYCLES, VARIANTS §4
PRESET: <id> · MOVING ANCHORS §5
```

`src/renderer/providers/effects-sub-tabs.ts` declares the Colour tab's column order as
`aeon.effects.presets`, `aeon.effects.preset.bands`, `aeon.effects.preset.channels`,
`aeon.effects.preset.anchors`, `aeon.effects.timeline`, and
`src/renderer/workspace/facets/effects-facet.tsx` mounts `<BandPresetPanel />` before
`<RasterTimelineStrip />` to match. **The raster timeline is LAST on that tab. The diagram put
it FIRST.**

### 2.2 The page contradicted itself, four screens apart

§3 step 1 says, correctly:

> Press `Colour`, the middle sub-tab. `RASTER BAND PRESETS` is the first section on it and
> arrives open.

The diagram in §1 said the first section on it is `RASTER TIMELINE`. **Both sentences were on
one page, in one document, rendered into one tab.**

### 2.3 Who broke it, and it was the fix

`git show 8e3727ad -- docs/guides/effects-first-run.md` is a three-line diff. That commit is
uxa F5 (`docs/reviews/2026-09-10-last-three-seat-findings.md` §3): it moved the preset panel to
the top of the Colour tab, moved the provider's declared order with it, and updated **the one
sentence the seat had quoted** — step 1. The diagram four screens above it was not touched and
went stale in the same commit.

That is the shape worth keeping: **the landing that fixes a route claim is the landing most
likely to falsify its siblings**, because it is the only landing that moves the thing they all
describe. The guard added for step 1 (`colour-tab-arrival.test.ts`) was phrased at step 1's
text, so it could not see the diagram.

### 2.4 The fix

The guide sentence was corrected to match the source, never the other way round. `RASTER
TIMELINE` moved to the bottom of the Colour column, in the diagram's own column offsets. No
label was renamed and no other column moved.

---

## 3 · The census

Legend for **Held before**: what would go red today if the claim became false, before this
parcel. **Held after**: the row in
`src/renderer/components/guide/__tests__/guide-route-claims.test.ts` that holds it now.

### 3.1 §1 — the map of the panel

| # | The sentence | What it asserts | Producer that decides | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R1 | "The right panel is three sub-tabs under one permanent strip." | three tabs exist; the strip is permanent | `providers/effects-sub-tabs.ts` (`EFFECTS_SUB_TABS`), `components/effects/SectionPicker.tsx` (`position: 'sticky'`) | TRUE | count: `effects-sub-tabs.test.ts`; sticky: `scratchpad/poisons-effects-section-strip.sh` | count row |
| R2 | "the three buttons under it choose which job you are doing" | the bar renders BELOW the strip's rows | `SectionPicker.tsx` renders `{children}` after the three `ConditionRow`s and the `act:` line; `effects-facet.tsx` passes `<EffectsSubTabBar />` as those children | TRUE | nothing | ✔ |
| R3 | "One job is on screen at a time, and the other two are not rendered at all." | unmounted, not hidden | `effects-facet.tsx` `EffectsSubTabBody` returns exactly one branch; no `display: none` | TRUE | nothing | ✔ |
| R4 | diagram, **Parallax** column order | SCENES, LAYERS, SCENE, SECTION ASSIGNMENT | `effects-sub-tabs.ts` parallax `sections` | TRUE | nothing | ✔ |
| R5 | diagram, **Colour** column order | RASTER TIMELINE first | `effects-sub-tabs.ts` colour `sections`; `effects-facet.tsx` mount order | **FALSE** | nothing | ✔ (fixed + held) |
| R6 | diagram, **Tile anim** column order | TILE ANIMATIONS, NEW TILE ANIMATION | `effects-sub-tabs.ts` tileAnim `sections` | TRUE | nothing | ✔ |
| R7 | "`PROPERTIES` sits below all three." | mounted after the sub-tab body | `effects-facet.tsx`: `<EffectsSubTabBody />` then the `aeon.props` section | TRUE | `effects-sub-tabs.test.ts` proves only that `aeon.props` belongs to no tab | ✔ |
| R8 | "`SCENE: <id>` **arrives shut.**" | `defaultCollapsed` | `EffectsScenePanel.tsx`, `id="aeon.effects.scene"` | TRUE | nothing | ✔ |

### 3.2 §2 — the parallax layer

| # | The sentence | What it asserts | Producer | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R9 | "Press `Parallax`, the first of the three sub-tab buttons." | position 1 of 3 | `EFFECTS_SUB_TABS[0]`; `EffectsSubTabBar.tsx` maps the array in order | TRUE | nothing | ✔ |
| R10 | "Arriving on the **Parallax** sub-tab draws the real background" | preview on by default there | `providers/parallax-preview.ts` `previewOnFrom`, `PREVIEW_DEFAULT_TAB` | TRUE | `parallax-preview.test.ts` | (left there) |
| R11 | "it is on for `Parallax` and off for `Colour` and `Tile anim`" | the undecided default, per tab | same | TRUE | `parallax-preview.test.ts` | (left there) |
| R12 | "The switch is `Parallax preview` on the Effects toolbar" | which surface carries it | `effects-facet.tsx` `ToolOptions: EffectsToolOptions` | TRUE | label only, `check-guide-text.mjs` | ✔ |
| R13 | "In `LAYERS`, press `Add`. A layer appears at the next screen line." | the new layer lands below the last | `providers/effects-aeon.ts` `addLayerCommand` (`last.world_y + 32`) | TRUE | nothing about direction | ✔ |
| R14 | "A number box appears, already holding `0.125`." | the seeded drift value | `effects-aeon.ts` `driftFromToggle` → `EFFECTS_DRIFT_SEED_RATE` | TRUE | nothing tying it to the guide | ✔ |
| R15 | "**Negative moves left.**" | the sign convention | `effects-aeon.ts` `LAYER_DRIFT_ROW.title` ("negative = leftward") | TRUE | nothing | ✔ |
| R16 | "it says so under the box" (the two drift refusals) | the message renders under the control | `EffectsScenePanel.tsx`, `Hint under` / `Advisory under` after the drift `Field` | TRUE | `field-group-message-placement.test.ts` (a different pair) | not held (§5) |

### 3.3 §3 — the raster band

| # | The sentence | What it asserts | Producer | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R17 | "Press `Colour`, the middle sub-tab. `RASTER BAND PRESETS` is the first section on it and arrives open." | position 2 of 3; first section; open on arrival | `EFFECTS_SUB_TABS[1]`; colour `sections[0]`; `BandPresetPanel.tsx` `aeon.effects.presets` has no `defaultCollapsed` | TRUE | **`colour-tab-arrival.test.ts`** — but only the *arrives open* half is asserted against the guide text; "middle" and "first section" were unheld | ✔ both halves |
| R18 | "Press `New`. You now have a preset with `Raster band 0` in it." | a new preset carries exactly one band, index 0 | `providers/effects-preset.ts` `newPreset` (`bands: [newBand()]`) | TRUE | nothing | ✔ |
| R19 | "Open `PRESET: <your id>` and fill the band in" | it is a section you must open | `BandPresetPanel.tsx` `aeon.effects.preset.bands` `defaultCollapsed` | TRUE | nothing | ✔ |

### 3.4 §4 — the palette cycle

| # | The sentence | What it asserts | Producer | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R20 | "Still on the **Colour** sub-tab … open `PRESET: <id> · CYCLES, VARIANTS`." | which tab owns it; it arrives shut | `effects-sub-tabs.ts` colour; `BandPresetPanel.tsx` `aeon.effects.preset.channels` `defaultCollapsed` | TRUE | nothing | ✔ |
| R21 | "Set `cycles` to `authored script (array of channels)`. A `Channel 0` appears." | switching seeds ONE channel | `effects-preset.ts`, the cycles seed ("ONE CHANNEL, NOT ZERO") | TRUE | `effects-preset-channels.test.ts` (not against the guide) | ✔ |
| R22 | "`variants` … lives in the same card" | same section as `cycles` | `BandPresetPanel.tsx`: `CyclesBlock` and `VariantsBlock` in one `SectionBody` | TRUE | nothing | ✔ |

### 3.5 §5 — the moving anchor

| # | The sentence | What it asserts | Producer | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R23 | "Still on the **Colour** sub-tab … open `PRESET: <id> · MOVING ANCHORS`." | which tab owns it; arrives shut | `effects-sub-tabs.ts`; `aeon.effects.preset.anchors` `defaultCollapsed` | TRUE | nothing | ✔ |
| R24 | "A `World Y` box appears, already holding a value near the middle of the screen." | the seed is mid-band, not 0 | `effects-preset.ts` `newAnchorWorldY` = midpoint of `EFFECTS_FIRE_LINE_MIN..MAX` | TRUE | `effects-preset-anchors.test.ts` (not against the guide) | ✔ |
| R25 | "Set `Movement` to `sweep up and down`. **Three more rows appear**, and a strip that draws the sweep." | exactly three new `Field`s plus the strip | `BandPresetPanel.tsx`: `Travel`, `Cycle`, `Start at`, then `<AnchorSweepPreview>`, all inside the sweep branch | TRUE | nothing | ✔ |
| R26 | "`Start at` … Optional, and it **arrives absent**", "leave it on `absent · set`" | a new sweep writes no `phase` | `effects-preset.ts` `newAnchorSweep` returns `{amp_shift, period_shift}` only | TRUE | nothing tying it to the guide | ✔ |
| R27 | "A warning appears **under `Travel`**" | the fit warning renders after the Travel field | `BandPresetPanel.tsx`: `anchorSweepBandRefusal` `Hint under` immediately after the `Travel` `Field` | TRUE | nothing | ✔ |
| R28 | "adds a small animated strip **to the bottom of the channel**" | last child of the channel card | `BandPresetPanel.tsx`: `<AnchorSweepPreview>` is the last element in the card | TRUE | nothing | ✔ |
| R29 | "There is no green tick beside `Travel` and there is not going to be one." | no clearance arm exists | `AnchorBandFit` / `anchorSweepBandRefusal`, one-directional | TRUE | `effects-preset-anchors.test.ts` | (left there) |

### 3.6 §6 — binding to a section

| # | The sentence | What it asserts | Producer | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R30 | "`SECTION ASSIGNMENT`, at the **bottom** of the **Parallax** sub-tab." | last section of that tab | `effects-sub-tabs.ts` parallax `sections` last entry | TRUE | nothing | ✔ |
| R31 | "the `Section <n>` dropdown at the **bottom** of `RASTER BAND PRESETS`" | last block inside that section body | `BandPresetPanel.tsx`: the `Section ${activeSectionIndex}` `Field` follows the create row, the list and the unreadable warning | TRUE | nothing | ✔ |
| R32 | "a **section strip** pinned to the top of the panel, above the three sub-tab buttons" | first child of the `Panel`, sticky, bar below it | `effects-facet.tsx` (`<SectionPicker>` first inside `<Panel>`), `SectionPicker.tsx` | TRUE | sticky: the poison script; position: nothing | ✔ (order half) |
| R33 | "states the raster-wiring conditions as **three rows**" | three `ConditionRow`s | `SectionPicker.tsx` `<ConditionRow n={1..3}>` | TRUE | `check-guide-text.mjs` C rows cover the labels | ✔ |
| R34 | "the `act:` line **under** the condition rows names the set" | the act line renders after the three rows | `SectionPicker.tsx` | TRUE | nothing | ✔ |
| R35 | "the note **under the section dropdown** in RASTER BAND PRESETS says it at the control" | the rebind notice follows the `Select` | `BandPresetPanel.tsx` `effects-rebind-notice` | TRUE | `preset-rebind-orphan.test.ts` (text, not position) | not held (§5) |

### 3.7 §8 — tile animations are not raster bands

| # | The sentence | What it asserts | Producer | True? | Held before | Held after |
|---|---|---|---|---|---|---|
| R36 | the §8 table's `sub-tab` column, five rows | which tab owns each control | `effects-sub-tabs.ts` section ownership | TRUE | nothing | ✔ |
| R37 | "`Add blank tile animation` is on the toolbar, which is on screen whichever job you are doing" | it is a `ToolOptions` chip, outside the tabs | `effects-facet.tsx` `ToolOptions`, `EffectsToolOptions.tsx` | TRUE | `band-verbs.test.ts` (the command, not the surface) | ✔ |
| R38 | "pressing it from `Parallax` brings the **Tile anim** sub-tab forward, opens the list and scrolls to the animation it just made" | a cross-tab route | `providers/band-follow.ts` → `revealEffectsSection(BANDS_SECTION_ID)` | TRUE | **`effects-sub-tabs.test.ts`**, `band-follow.test.ts` | (left there) |

### 3.8 §9 — the quick reference

Every row of the quick-reference table is a route. Nine of them restate a claim above and are
listed here so the census is complete rather than a subset.

| # | The row | Restates | True? | Held after |
|---|---|---|---|---|
| R39 | "make the background move as the camera does → `Parallax` → `LAYERS` → `Add` → set `Plane B (bg)`" | R4, R9, R13 | TRUE | via R4/R9/R13 |
| R40 | "see that → `Parallax preview` on the Effects toolbar" | R12 | TRUE | via R12 |
| R41 | "make a coloured stripe → `Colour` → `RASTER BAND PRESETS` → `Preset id` → `New`" | R17 | TRUE | via R17 |
| R42 | "make colours shimmer → `Colour` → `PRESET: <id> · CYCLES, VARIANTS` → …" | R20 | TRUE | via R20 |
| R43 | "make a stripe follow the scenery → `Colour` → `PRESET: <id> · MOVING ANCHORS` → …" | R23 | TRUE | via R23 |
| R44 | "animate background tiles → `Tile anim` → `NEW TILE ANIMATION`" | R6, R36 | TRUE | via R6/R36 |
| R45 | "change which job I am doing → the three buttons under the strip: `Parallax` / `Colour` / `Tile anim`" | the **order of the three labels**, which no other sentence states | TRUE | ✔ (its own row) |

Two further quick-reference rows repeat R32 ("the section strip pinned to the top of the Effects
panel") and R8 ("`Parallax` → open `SCENE: <id>` (it arrives shut)"); both are held by those
rows, and the R8 row asserts the guide says `arrives shut` in **both** places, so deleting one
does not go unnoticed.

---

## 4 · The gate

`src/renderer/components/guide/__tests__/guide-route-claims.test.ts`, executed by
`vitest run` inside `npm test` (the repo's vitest include glob is
`src/**/__tests__/**/*.test.ts`).

**Every expectation is derived from the producer**, never copied out of the guide:

* the sub-tab **order and labels** come from `EFFECTS_SUB_TABS`, imported and executed;
* the **column order** in the §1 diagram is compared against `effectsSubTab(id).sections`;
* the **arrival state** of a section is read from that section's own `<CollapsibleSection>` tag
  in its component source;
* the **drift seed** the guide prints as `0.125` is computed as
  `driftPxFieldValue({ drift: driftFromToggle(true) })`;
* the **`Start at` absence** is read from `newAnchorSweep()`'s returned object;
* the **band count of a new preset** is read from `newPreset('x').bands`.

**The diagram is read by column, not by substring.** The header line's own offsets for
`Parallax`, `Colour` and `Tile anim` slice each subsequent line into three cells, so an anchor
that appears in the wrong column fails rather than being counted as present. A whole-block
`indexOf` would have passed a Colour entry that had drifted into the Parallax column.

**The landmark discipline is copied deliberately from `colour-tab-arrival.test.ts`.** Every
`indexOf` this file reasons about is asserted `> 0` in a dedicated row first: `-1` is less than
everything, so a renamed anchor would otherwise make every order row pass while measuring
nothing.

**Rows are phrased against the discrimination, not against the defect.** The diagram row is not
"the timeline is no longer first"; it is "the diagram's Colour column lists the sections in the
order the provider declares", which stays able to catch the *next* reorder in either direction.

---

## 5 · ⚠ What is NOT held, and why

Nineteen enumerated claims are left unheld. None is a silent omission.

**Left where they already live** (holding them again here would be a second author with no
arbiter): R10, R11 (`parallax-preview.test.ts`), R29 (`effects-preset-anchors.test.ts`), R38
(`effects-sub-tabs.test.ts` and `band-follow.test.ts`).

**Restatements** covered through their originals: R39 to R44.

**Genuinely unheld, and these are the residual:**

* **R16** — "it says so under the box" for the two drift refusals. The `under` prop is a
  rendering concern and this repo's node suite has no jsdom; a source-order row would assert the
  JSX order and not the painted order, and `field-group-message-placement.test.ts` already owns
  that argument for a different set of pairs. Better folded into that file by whoever next
  touches it than duplicated here.
* **R35** — the rebind notice's position under the section dropdown. Same reason; its *text* is
  already owned by `preset-rebind-orphan.test.ts` and splitting the position into a second file
  would give one control two guards in two places.
* **The pixel claims are not route claims and are not touched.** The `> LAYERS list …` block in
  §2 states "measured at 211px of a ~2,400px list". That is a measurement of a rendered layout,
  it cannot be made in node, and it is **TAGGED FOR THE FOREGROUND** rather than asserted. It is
  the one number on this page that will go stale without anything noticing.
* **"the middle of the screen"** in R24 is held as "the seed is the midpoint of the engine's own
  fire-line band, and is not 0". Whether that reads to a person as *the middle of the screen* is
  a prose judgement, not a derivable fact.

**And the honest bound on all of it:** none of these rows rendered a pixel. What is proved is
**declared order, source order and arrival state** — the mechanism behind where a control is,
never a measurement of where it appeared.

---

## 6 · Verification

See the commit messages on `parcel/guide-route-claims` for the red-first evidence: each mutation
was applied to a committed baseline, quoted back from disk, and the resulting failure named by
row.
