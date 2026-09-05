# The Effects tab's inert controls, and whether they say why

**EW-INERT-CONTROL-SILENCE**, project EFFECTS-W1, branch
`parcel/inert-control-silence`, 2026-09-05.

**The property:** a control the app will not let you use must say why, **without
being hovered**.

The row came out of `docs/reviews/2026-09-05-effects-cold-read.md` finding **C5**
(the curve picker's greyed entry, marked `(engine refuses)` and unexplained).
This is the census that finding asked for, not a fix of C5 alone.

---

## 1. How the population was taken

Every `disabled` in the Effects tab's four components, taken with `git grep`
(not `grep`, which is ugrep with `--ignore-files` here and skips gitignore
patterns even when tracked), plus a sweep for the other ways a control goes
inert (`readOnly`, `aria-disabled`, `pointerEvents`), which found **none**:

| file | sites |
|---|---|
| `src/renderer/components/effects/BandPresetPanel.tsx` | 9 |
| `src/renderer/components/effects/EffectsScenePanel.tsx` | 6 |
| `src/renderer/components/effects/BgAnimBandPanel.tsx` | 2 |
| `src/renderer/components/effects/EffectsToolOptions.tsx` | 1 |

18 code sites. `SectionPicker`, `RasterTimelineStrip`, `EffectsSubTabBar`,
`AnchorSweepPreview`, `PresetLagDisclosure`, `RampSignLagDisclosure` and
`workspace/facets/effects-facet.tsx` contain no disabled control at all.

**The finding is not that the reasons are missing.** Most are computed, correct,
and already rendered in the page beside the control, under an idiom this panel
wrote for itself:

> *THE DEAD CONTROL, WITH ITS REASON BESIDE IT ... `bandControlsRefusal` is ONE
> predicate read by the `disabled` flag AND by the Hint, so the greyed chip and
> the reason cannot disagree.* (`BandPresetPanel.tsx:596-611`)

Three sites broke that idiom, in three different ways, and one more was found by
asking how often the inert state is actually reached.

---

## 2. The census

Ranked by **which one ships a wrong sentence, or no sentence, to a person**.
"Reachable" means: readable from the painted screen or by keyboard, with nothing
hovered.

| # | control | where | what makes it inert | where the reason was | reachable? | verdict |
|---|---|---|---|---|---|---|
| **1** | `B curve to` option equal to this layer's `fb` | Parallax, layer card (`EffectsScenePanel.tsx:694`, options from `curveFieldOptions`) | `curveGoesNowhere(fb, to)`: aeon `layer()` guard 4 | `title` on a **disabled `<option>`**, plus the generic label `(engine refuses)` | **NO** | **FIXED** (C5) |
| **2** | `sprite_mask` in `Left col` | Parallax, scene card (`EffectsScenePanel.tsx:1763`, `leftColumnMaskOptions`) | **unconditional**: greyed for every scene there is | `title` on a **disabled `<option>`**; the row's visible Hint said nothing about it | **NO** | **FIXED** |
| **3** | `ends at a line` checkbox | Colour, base-swap band card (`BandPresetPanel.tsx:2041`) | `newBaseSwapRestoreLine(band) === null`, i.e. the ON fire is on the last line `fire()` accepts | **NOWHERE. Not computed at all.** And the visible Hint beside it describes the untickable state as the intended one | **NO** | **FIXED** |
| **4** | every `Remove layer` button | Parallax, layer cards (`EffectsScenePanel.tsx:571`) | `layers.length <= EFFECTS_LAYER_COUNT.min` | **NOWHERE.** The count line said `1 of 16 layers` and nothing more | **NO** | **FIXED** |
| 5 | non-divisor `Period` option | Parallax, table sub-form (`EffectsScenePanel.tsx:349`, `tableRefParamOptions`) | `256 % period != 0`; only ever present when the FILE carries one | `title` on a disabled `<option>` **and** `tableRefAdvisory`, rendered as a visible Hint on the same row | **yes**, via the advisory | label improved, no new sentence |
| 6 | unrecognised `ON` arm | Colour, raster band card (`BandPresetPanel.tsx:1367`, `armOptions`) | the arm the document carries is not one of `EFFECTS_PRESET_ON_ARMS`; only present when the FILE carries one | `title` **and** `bandArmAdvisory`, a visible warning Hint under the row | **yes** | untouched |
| 7 | `Add raster band` | Colour (`BandPresetPanel.tsx:606`) | `bandControlsRefusal` (a ramp preset cannot grow a `bands` key) | `title` **and** a visible warning Hint | **yes** | untouched |
| 8 | `Add base-swap band` | Colour (`BandPresetPanel.tsx:1900`) | `addBaseSwapBandRefusal` | `title` **and** a visible warning Hint | **yes** | untouched |
| 9 | `Remove raster band` | Colour (`BandPresetPanel.tsx:1314`) | `lastBandRefusal` (the schema floor) | a visible Hint under it | **yes** | untouched |
| 10 | `Remove base-swap band` | Colour (`BandPresetPanel.tsx:1974`) | `lastBaseSwapBandRefusal` | a visible Hint under it | **yes** | untouched |
| 11 | `Delete` preset | Colour (`BandPresetPanel.tsx:518`) | `deletePresetRefusal` (a binding would dangle) | a visible warning Hint inside the section | **yes** | untouched |
| 12 | `Channel` seed options | Colour, anchor card (`BandPresetPanel.tsx:791`) | `anchorExtendRefusal(…, 'seed')` | a visible warning Hint under the row | **yes** | untouched |
| 13 | `Movement` options | Colour, anchor card (`BandPresetPanel.tsx:823`) | `anchorExtendRefusal(…, 'motion')` | a visible warning Hint under the row | **yes** | untouched |
| 14 | `Promote` | Tile anim (`BgAnimBandPanel.tsx:838`) | `bandVerbs(...).promote.reason` | `title` **and** a visible warning Hint | **yes** | untouched |
| 15 | `Add` (blank tile animation) | Tile anim (`BgAnimBandPanel.tsx:879`) | `bandVerbs(...).add.reason` | `title` **and** a visible warning Hint | **yes** | untouched |
| 16 | `Promote` / `Add` chips on the toolbar | tool-options bar (`EffectsToolOptions.tsx:32`) | the same two `bandVerbs` reasons | `title`, **and** a visible line at the right of the bar: `refusal ?? promote.reason ?? add.reason ?? TOOL_HINTS[tool]` | **partly** | **residual, see §5** |
| 17 | `Add layer` | Parallax (`EffectsScenePanel.tsx:538`) | `layers.length >= EFFECTS_LAYER_COUNT.max` | no sentence, but the section header prints `Layers (16/16 per scene)` and the count line repeats it | **yes**, as a number rather than a sentence | untouched |
| 18 | `New` (scene) | Parallax (`EffectsScenePanel.tsx:528`) | the id box beside it is empty | no sentence | **self-evident**: the empty box is the reason and is on screen | untouched |
| 19 | `New` (preset) | Colour (`BandPresetPanel.tsx:401`) | same | same | **self-evident** | untouched |

### The two defect classes, named apart

The brief asked for this distinction and it is the spine of the table.

* **A `title` on a disabled `<option>` (rows 1, 2, 5, 6)** is the least reachable
  string in the DOM. Chromium draws a `<select>` popup as a **native widget
  outside the page** - measured, and written into
  `scratchpad/curve-option-disabled-harness.mjs`'s own banner, which had to force
  `size` on the element to photograph its own list. So it is invisible to a
  screenshot, invisible to a keyboard user who never lands on a disabled option,
  and reachable only by someone who thinks to hover a dead row. Rows 5 and 6
  survive that only because a **separate visible advisory** covers the same case.
* **A `title` on a disabled `<button>` (rows 7, 8, 14, 15, 16)** is also
  hover-only, and every one of those sites pairs it with a visible Hint reading
  the same predicate. They are correct by the panel's own idiom, not by the
  tooltip.
* **No string at all (rows 3, 4)** is the worst class, and row 3 is worse than
  silence: the only sentence beside the dead checkbox says *"No restore line:
  this band runs to the bottom of the display ... That is the shipped
  single-edge shape, not a missing value"*, so an author who **cannot** tick the
  box is told the untickable state is the intended one.

---

## 3. C3, from the same cold read: a row, not a fix

> **C3** - "the one sentence that says what a factor *does* is a hover tooltip;
> the permanent sentence under the same control is much weaker" (Parallax →
> Plane B).

**It is materially different and is left as a row.** Three reasons:

1. **Nothing is inert.** The `fb` picker takes every value it offers;
   `FactorField` is passed no narrowed `options` on the `fa`/`fb` rows, so no
   option is ever disabled there (asserted in the sibling harness's rows 4a/4b as
   the control condition). The tooltip carries an **enrichment**, not a refusal.
2. **The tooltip is on an *enabled* `<select>`**, so it is at least reachable by
   hover, and the row already carries a permanent sentence
   (`PLANE_FACTOR_HINT`). C5's row carried a permanent sentence that said nothing
   about the dead entry at all.
3. **The trade-off is already ruled, in writing, on height grounds.** The good
   half of that tooltip is `bandReachClause` - a number derived from *this act's*
   width - and `EffectsScenePanel.tsx:653-665` states why it is not on the row:

   > *a band with any live factor repeats across an act - that is the design
   > ..., not a fault, and a visible line saying so on every layer of every scene
   > would add height to this panel to report the normal case.*

   Overturning that needs the height budget argued, which is the same argument
   §4 below had to have and lost two lines of. It is a different parcel, and it
   should carry the measurement.

---

## 4. What was changed, and the height call

Two channels, deliberately not one.

**(a) The option's own label carries a SHORT reason.** `refusedOptionLabel`
replaces the shared `(engine refuses)` marker at all three `<option>` pickers.
Zero height. It is what a person reads while looking at the grey row.

```
before   FACTOR_1_4 (engine refuses)
after    FACTOR_1_4 (same as Plane B, so no ramp)

before   sprite_mask (engine refuses)
after    sprite_mask (the engine cannot emit this yet)
```

**(b) The full sentence goes in a Hint that was ALREADY RENDERED on that row**,
so the only height it can cost is the characters that wrap. `curveRowHint(layer)`
replaces the constant `LAYER_CURVE_ROW.hint`; `leftColumnMaskRowHint()` replaces
`LEFT_COLUMN_MASK_ROW.hint`; the base-swap refusal and the layer-floor clause
follow the same rule.

**The height number is measured, not estimated.** Harness row `[5c]` reads the
curve row's hint in two states in one run at one geometry: `fb` on a named
factor (clause present) against `fb` on an unclaimed packed triple (nothing
refused, no clause).

| cut | hint height with the clause | without | cost per layer card |
|---|---|---|---|
| first cut (refusal appended as a second sentence) | **99px** | 33px | **+66px** |
| shipped (refusal said as a consequence of the base sentence) | **66px** | 33px | **+33px** |

The first cut was six lines where there had been two, permanently, on every
layer card. At 16 layers that is more height than the whole Layers list paints.
The rewrite says the refusal as a **consequence** of the mechanism the base
sentence already states, which costs two lines instead of four and reads better:

> Plane B speed ramps from fb at this strip's top to this value at its bottom,
> so fb itself (FACTOR_1_4) is greyed: a ramp with equal ends is refused by the
> build.

**+33px per layer card is the honest price of this fix**, and it is written into
the code beside the string with an instruction to re-run `[5c]` if anyone
lengthens it.

**One design I considered and rejected:** gating the clause on the select having
**focus**, which would cost 0px at rest and appear exactly when the author is at
the control. It is defensible - the grey entry is only visible while the popup
is open, and the popup only opens from the focused select - but it introduces a
layout shift that moves every control below the one you just tabbed into, and it
is a novel interaction in a panel whose idiom is settled. Recorded rather than
taken.

**Where the cost is zero:** every clause is gated on the state that makes it
true. `curveRowHint` adds nothing when `fb` is a packed triple no published name
claims (nothing is refused, so there is nothing to say - harness `[5b]`);
`leftColumnMaskRowHint` only renders on a scene that has a policy to answer for;
the base-swap sentence only at the top of `fire()`'s range; the layer-floor
clause only at `EFFECTS_LAYER_COUNT.min`.

### The two paths are not collapsed

`curveAdvisory`'s docblock argues its own case and it stands. It fires only when
a document **already carries** the refused value - a hand-edited file, an MCP
write, a scene authored before the option was disabled, and the packed path no
dropdown can express. `curveRowHint` fires while the document is still **legal**
and the author is choosing. Harness row `[2c]` reads the document back and
requires `curve` to be **absent**, so the state under test is precisely the one
in which the advisory is silent and the old surface said nothing at all.

---

## 5. Residuals, named

* **Row 16, `EffectsToolOptions`' status line, is partial coverage.** It prints
  `refusal ?? verbs.promote.reason ?? verbs.add.reason ?? TOOL_HINTS[tool]`. If
  **both** chips are off for **different** reasons, only `promote`'s is on
  screen and `add`'s dead chip is unexplained. Not touched: the fix is a layout
  question about a one-line bar, the reasons come from `bandVerbs` which the
  Tile-anim panel also reads (where both **are** shown, as two separate Hints),
  and I have no measurement of how often the two reasons differ. Booked.
* **C3** - §3.
* **Rows 18/19 (`New` disabled on an empty id box)** are left silent
  deliberately: the reason is the empty box six pixels to the left.
* **Row 17 (`Add layer` at the cap)** is left as a number rather than a
  sentence: `Layers (16/16 per scene)` is in the section header the button sits
  in, and a sentence would fire on the fullest scenes, which are the ones with
  the least room for it. Reconsider if anyone reports it.
* **Rows 3 and 4 are proven by node rows only, not by the painted harness.** The
  reason is structural, not a count that happened to be zero: row 3's card needs
  a preset converted to `base_swap` with its ON fire typed to the top of
  `fire()`'s range, and row 4's floor needs the Layers list photographed on a
  scene at `min`. Both are reachable and neither was driven. The harness covers
  rows 1 and 2 painted; rows 3 and 4 have derived-from-constant node coverage in
  `effects-preset-base-swap-control.test.ts` and `effects-aeon.test.ts` and are
  named here so the gap is a row rather than a silence.
* **Nothing in this parcel touched the Colour or Tile-anim sub-tabs' painted
  surface**, and nothing touched `curveFieldOptions`' refusal predicate,
  `curveAdvisory`, `curveDescendingAdvisory`, or any option's `disabled` flag.
  What an author may land on is unchanged; only what they are told changed.

---

## 6. One stale fact corrected on the way

`curveFieldOptions`' docblock still asserts:

> *when `fb` is itself packed, `curveGoesNowhere` compares an object against a
> `FACTOR_*` string for every named option and disables NONE of them*

That has been **false since the alias fix of 2026-09-05**: a packed triple that
equals a published factor greys that name's whole alias class, which the file's
own test at `effects-aeon.test.ts` ("curveFieldOptions greys a packed fb's own
NAME") pins. The new code is written against the artifact rather than the
docblock: `curveRefusedFactors` returns a **list**, because `FACTOR_LOCKED` and
`FACTOR_0` are one value with two spellings and a layer with either as `fb`
greys **two** rows - a sentence naming one of them would have described half the
screen. Empty only for a triple no published name claims, which is the real
structural gate under the height argument in §4.
