# Chip font: 11px or 13px, counted, and the majority applied

**Owner ruling, verbatim, 2026-09-13T22:06:54Z** (`d-36-chip-font-size-answered`):

> "what's there more of, things at 13 font orr 11? go with whatever there's more of."

A rule, not a size. This packet is the count, how it was taken, and what the rule then decided.

**Instrument:** `scratchpad/chip-font-census-harness.mjs`, registered as `npm run harness:chip-font-census`.
Raw record of the deciding run: `docs/captures/2026-09-13-chip-font-majority/census-before.json`.

---

## 1. The population

**A chip is an element the `Chip` primitive renders** (`src/renderer/components/ui/primitives.tsx`,
`function Chip`), and nothing else. In the live DOM it is identified by React's own fiber: a `<button>` or
`<span>` whose parent fiber's component is the function named `Chip`. The production bundle keeps function
names (`function Chip` is in `dist/renderer/assets/index-*.js`), so the check is exact and a reader can repeat
it. A missing name would show up as zero chips on the level header, which carries five; the per-part
anti-vacuous rows would fail on that.

**Hand-rolled lookalikes are counted but do not vote.** An element whose inline style is `display:
inline-flex` plus `white-space: nowrap` (the fingerprint the 2026-09-12 row 4b used) and that `Chip` did NOT
render is listed separately. They do not vote because the ruling decides what the PRIMITIVE declares, and no
size the primitive picks reaches them. **The run found none**: 0 lookalikes on all 95 screens.

## 2. The mechanism the count had to be built around

The brief's working assumption was that interactive chips paint 13px and static chips paint 11px. **Not
quite, and the difference decides how to count.** The button branch's `font: 'inherit'` shorthand, written
after the spread, resets the font size, so the button paints **its container's size**:

- in the level header, a panel or a dialog, the container is the body's 13px, so the chip is 13px;
- inside `OptionBar` (which declares `fontSize: T.tXs` on its root) and inside a
  `T.tXs` `div` in `SpritePaletteHeader`, it is 11px;
- inside a `Hint` (the band card's `Hide` chip) it is 11px.

The span branch has no shorthand and paints the declared 11px. So today one primitive paints two sizes, and
**which one is decided by where the chip is mounted, not by which branch it takes.** A branch count alone
is not a size count.

## 3. Count (b): call sites, from source

`<Chip` JSX elements under `src/` (tests excluded), parsed with the TypeScript compiler.
**Unit: JSX elements in source.**

| | |
|---|---|
| call sites | **73** in 22 files (119 `.tsx` scanned) |
| interactive (`onClick` always given: the `<button>`) | **70** |
| static (no `onClick`: the `<span>`) | **1** (`BgAnimPreviewStrip.tsx:119`, "pan to move") |
| conditional (`onClick={x ? fn : undefined}`) | **2** (`ChunkLinkOptions.tsx:149` Detach, `:163` Detach all in section) |
| inside a `.map()` (one site, many chips) | 12 |

**Size predicted from source alone** (the span paints the declared token; a button paints the nearest JSX
ancestor's size where its own file shows one: a sizing ui primitive, derived from the ui sources as
`OptionBar`, `StatusBar`, `IconButton` at `T.tXs` and `PanelHeader` at `T.t2xs`, or an inline `fontSize`
token): **18 sites at 11px, 2 conditional, and 53 decided at the MOUNT SITE**, which a single file cannot
show. The source can only name a size a container sets explicitly, and the 13px default comes from the
body, so this reading is biased toward 11 by construction. It is printed, not voted.

**(b) joined to (a), each call site by the size MEASURED for it.** A site matches a rendered chip when the
site's enclosing component is the nearest enclosing-site component in the chip's render chain and, where the
label is a literal, the text is equal:

| measured | call sites |
|---|---|
| **13px** | **40** |
| **11px** | **22** |
| mixed | 1 (`PriorityChips.tsx:56`: 13px under `TileBrushOptions`, 11px under `ArtToolOptions`' `OptionBar`) |
| not rendered on any screen reached | 10 |

The 22 at 11px: every chip in the sprite, canvas, art and Effects option bars (`SpriteToolOptions` 6,
`CanvasToolOptions` 4, `ArtToolOptions` 3, `EffectsToolOptions` 2 plus its `VerbChip`), `SpritePaletteHeader`
2, the band card's `Hide`, and the three spans (`pan to move` and the two Detach chips before anything is
hovered).

## 4. Count (a): rendered chips, in the running app

`getComputedStyle().fontSize` of every VISIBLE chip, over CDP, on every screen the run reaches: each facet
pill, each Effects sub-tab, each classic Art tier and its Paint mode, **every tool in every facet's dock**,
and the deep states below. **Two units, both printed:** *distinct chips* (deduplicated by the first four
component names of the render chain, the text, and the element; the header's Undo seen on 73 screens is ONE)
and *chip-screens* (every screen and chip pair).

| part | screens | distinct at 13px | distinct at 11px | chip-screens 13px / 11px |
|---|---|---|---|---|
| aeon (copy of `origin/master` `1b414115`) | 46 | 19 | 17 | 240 / 96 |
| classic (copy of s1disasm, GHZ act 1) | 30 | 35 | 0 | 207 / 0 |
| sprite (the GHZ spring, object $41) | 9 | 3 | 12 | 27 / 108 |
| canvas (a new 256x256 canvas) | 10 | 5 | 6 | 50 / 60 |
| **total** (the header's five are shared by aeon and classic) | **95** | **57** | **35** | **524 / 264** |

**Deep states**, made through the app's own controls in the throwaway copies, nothing saved: a new preset
(`chip_census`) on the Colour tab; the collapsed "New tile animation" section opened; a blank tile animation
added; playback on; a band promoted from existing tiles and Remove pressed until it refused and showed its
confirm row; a collision cell probed (with View armed) until the shape picker was up; the Import Art Sheet
dialog, measured and never pressed (its chip opens a native file picker); art drawn on the canvas so the
Commit to level section has a plan.

## 5. What was not measured, and whether it could flip the count

**Facets: none unmeasured.** aeon's 7, classic's 5, the sprite document and the canvas all ran. Because every
chip comes from one of the 73 call sites, the static census bounds the population, and 63 of the 73 were
rendered.

**Ten call sites were rendered on no screen:** `CommitPlanView.tsx:155` and `:162` (the palette offers, shown
only when the art's colours differ from the act's), `AnchorSweepPreview.tsx:235` (needs a channel whose
motion is an anchor sweep), and seven in `BandPresetPanel.tsx` (`:741`, `:1046`, `:1096`, `:1156`, `:1233`,
`:1266`, `:2064`). The preset WAS created (the id field cleared, which is the create path's `setNewId('')`),
but none of its editor chips mounted in that state. That was not diagnosed.

- **By call sites they cannot flip it.** Even if all ten painted 11px it would be 40 against 32.
- **By distinct chips the worst case has no bound**, because three of the ten are `.map()` sites whose
  count is set by the document. What is known: the source predicts every one of them "from the mount site"
  (no 11px container in its file), and in the same panels every chip that was measured painted 13px
  (`BandPresetPanel`'s New, `CommitPlanView`'s Give new art collision and Commit).
- The two conditional Detach chips were measured as spans, at 11px. As buttons (a placement hovered) they
  paint 13px today (chunk-links row 4b measured it), so they are counted at 11 here, not 13.

## 6. The majority

**13px, by every count taken:** 57 to 35 distinct chips, 40 to 22 call sites by measured size, 524 to 264
chip-screens. (a) and (b) agree, and the ten unrendered call sites cannot flip the call-site count, so the
brief's STOP condition does not hold.

Taken as the brief framed it, (b) reads 70 interactive against 1 static, which also points to 13, but §2 is
why that reading is not a size count: 17 of the 70 interactive sites paint 11px today because of where they
are mounted.

**What the rule changes on screen:** the primitive declares 13px for both branches, so the **35 distinct
chips at 11px today grow to 13px**: every option-bar chip (sprite, canvas, art, Effects), the sprite palette
header's Zone and Standalone, the band card's Hide, and the three spans. The 57 at 13px do not change size.
