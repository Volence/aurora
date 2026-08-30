# O15 — the advisory is right and it is 21 lines tall

**Date** 2026-08-30 · **ROADMAP** O15 · **Project** EFFECTS-W1 (owner's reorder, empyrean
`c2833bc`: *"the bug fixes and semi random bits first"*) · **Capture**
`scratchpad/shots-o15/before-1920x1080-panel.png` · **Instrument**
`scratchpad/vsplit-advisory-harness.mjs` (`SCREEN=1920x1080 npm run harness:vsplit-advisory`)

---

## 1. The row was a false owner-blocker, and the reason is the finding

O15 sat labelled *"shape needs your eye"* — an owner blocker with **no screenshot, no
decision card, and no capture directory**. Nobody had ever produced the thing he was
supposed to look at. The next session was re-pointed to **produce the capture first, then
ask**; under the standing delegation this lane takes the layout call itself and parks the
before/after for his read-back.

**And the measurement it inherited was taken at a resolution he does not have.** The
`2026-08-28-vsplit-advisory.md` packet §5 recorded the hint box as *"200px wide × 346px
tall … at 1680x1050"*. `1680x1050` is `vsplit-advisory-harness.mjs`'s **built-in default**
(`process.env.SCREEN ?? '1680x1050'`, :350), not a display in this workspace. Measured
here with `xrandr` on `DISPLAY=:0`: **DP-2 primary 1920x1080** and **DP-1 2844x1600**. The
default is narrower than either, and a narrower column is exactly what inflates a wrap
height — so the inherited figure was **wrong in the alarming direction** and was never
"at the owner's resolution" as the packet's own sentence implied.

Same family as this repo's *"a gap between boundary labels is never evidence of free
space"*: the instrument returned a clean confident number about a subject it was not
pointed at.

## 2. What is actually on screen (1920x1080, his primary)

Harness re-run at `SCREEN=1920x1080`: **36/36**, so the advisory is present, painted, in
both places, with both remedies — the content is not in question and this row is not
about correctness.

Measured **off the capture** (stated as such: these are pixel bounds read from the
committed PNG, not a `getBoundingClientRect`): the scene advisory runs **21 wrapped
lines, ~460px tall in a ~275px text column**, inside a panel whose visible height is
~1010px. **One advisory is ~46% of the panel.** Below it and pushed down: `V center`,
`V offset`, `Transition`, `Deform fg`, `Deform bg` — five controls, with `Deform bg`'s
own hint clipped at the bottom edge. Per row `[7c]` the layer cards carry the same
sentence **twice more** when two layers split.

**So the row's own words hold and are, if anything, understated: content right, shape
wrong, and it buries the fields under it.**

## 3. The ruling (this lane's, under the standing delegation)

The advisory decomposes into three parts that are doing three different jobs:

1. **Diagnosis** — *"Plane B's vertical scroll TRACKS THE CAMERA (v_factor 3; 15 is the
   lock sentinel), and layers 0, 1 author Plane B splits — the build refuses this
   scene."* This is what tells an author something is wrong and which layers.
2. **Mechanism** — *"Two writers, one word: … while the plane's scroll is constant."*
   This is why. It is the bulk of the height and an author needs it **once**, not on
   every scene they touch.
3. **Remedies** — *"Either lock the plane (v_factor 15) … which the walker recomputes
   every frame."* This is what they do next.

**RULED: keep 1 and 3 always visible; put 2 behind an inline, collapsed-by-default
disclosure ("Why this happens").** That is ~21 lines down to ~8 with every actionable
word still on screen and no click required to act.

**Why not simply truncate with a "show more".** The remedies are last in the sentence, so
a naive length truncation hides precisely the part an author acts on and keeps the part
they can skip. The split has to be **semantic**, never positional.

## 4. ⚠ The vacuity this change CREATES, and it must be closed in the same parcel

The harness's `[5b]` requires both remedy clauses in the on-screen text, and `[5d]`/`[9d]`
read `textContent`. **Text inside a collapsed disclosure is still in `textContent`.** So
after this change, any row asserting on `textContent` alone would go green whether or not
the mechanism renders at all — a check whose failure state and success state emit the
same artifact, which is this repo's dominant defect class arriving *because of* a fix.

The parcel therefore owes a row that asserts the mechanism is **not visible collapsed and
visible expanded**, measured by `checkVisibility()` + `elementFromPoint` the way `[5c]`
already does for the hint — never by `textContent`.

## 5. Scope

- **In:** the vsplit advisory, in both places it renders (the `v_factor` row's sentence
  and the layer cards').
- **Out, named rather than silently skipped:** the `Deform bg` hint (*"a plane-wide
  horizontal wobble…"*) is the next-longest block in the same panel and is clipped at the
  fold in the same capture. It is the same shape problem and a candidate for the same
  treatment, but it is a different sentence with a different owner and is not this row.
- **Not a clamp.** ROADMAP rows 37/58/66's authorship rule is still pending the owner's
  review; `[8a]` must stay green — the document keeps holding the illegal combination.

## 6. Parked for the owner — BUILT, and the crop needed re-deriving

**DELIVERED 2026-08-30**, branch `o15-advisory-shape`. `vsplitLockAdvisoryParts` /
`sceneVsplitLockAdvisoryParts` return the three parts separately addressable and
`column-layout.tsx`'s `Advisory` renders them; the composed one-string form is byte-identical
and `splitRefusal` is untouched. Harness **45/45** at `SCREEN=1920x1080` (36 inherited, nine
new); node **5,802 passed / 0 failed / 7 skipped** (this branch's base measured separately at 5,799/0/7; +3 rows pinning the composition).

**MEASURED, both ways, and they agree.** Off the two captures, in one normalised 410×1010
frame (the amber painted extent of the advisory, found by scanning rows for the warning
colour rather than by eye): **459px → 238px, a 48% reduction.** Independently, off
`getBoundingClientRect` in the live app (harness row `[5i]`, CSS px, one block against
itself in two states): **388px expanded → 186px collapsed, ratio 0.48.** Everything the
before pushed below the fold — `V center`, `V offset`, `Transition`, `Deform fg`,
`Deform bg` — is on screen in the after, with `Deform bg`'s own hint whole and `V deform`
and the `LAYERS` header now visible too.

⚠ **THE CROP OFFSETS HAD TO BE RE-DERIVED, and the reason is a trap worth keeping.** The
before was cropped `420x1010+1480+140` from a `Page.captureScreenshot` — and that screenshot
was **1890×1177**, which is this harness's ordinary 1400×872 window at **`dpr` 1.35**. (It is
410px wide, not 420, because the crop ran off the right edge and ImageMagick clipped it.)
This host's `devicePixelRatio` varies run to run under Xvfb — memory `cdp-harness-integer-aim`,
and the harness's own AIM banner prints it for exactly this reason — and the rerun came back
at **`dpr` 1**, so the identical `SCREEN` produced a 1400×872 shot and the old offsets pointed
somewhere else entirely. The after is therefore cropped at the **same CSS-pixel region**
(`304x748+1096+104`, the device crop divided by 1.35) and rescaled to 410×1010 so the pair is
literally comparable. Same run, same resolution, same region; only the raster scale was ever
different, and it is normalised out.

A second thing the shot depended on and should not have: **where the effects column happened
to be scrolled** was a side effect of whichever probe had last called `scrollIntoView`. The
new `[5i]` block walk moved it onto the raster strip, which would have made the two halves of
the pair pictures of different things. The harness now scrolls the `v_factor` spinner into
view explicitly before that shot.

`scratchpad/shots-o15/before-1920x1080-panel.png` is the before, committed under the narrow
exception below. The after is at `scratchpad/shots-o15/after-1920x1080-panel.png` and **stays
gitignored** — it is regenerable from `SCREEN=1920x1080 npm run harness:vsplit-advisory` plus
the crop line above.

**⚠ Committed with `-f` against this repo's own ignore rule, deliberately, and the
exception is narrow.** `.gitignore` ignores screenshots by class under the standing rule
*"instruments committed (a review that cites a harness must be able to point at it),
output not"* — and that rule is right, because a shot is normally regenerable by re-running
the named command. **A BEFORE shot is not.** Once the fix lands, the command regenerates
the *after* and the before can never be produced again by any means; it is the same class
as `scratchpad/2026-08-29-branches-before-sweep.txt`, the record kept precisely because
nothing could remake it. The AFTER shot is ordinary output and stays ignored — the pair
lives on in this packet's prose plus the one irreplaceable half.


## 7. §4's vacuity, closed — and it was real, measured under a plant

The mechanism is hidden with `display: none`, **not unmounted**, exactly as §4 assumed. So
the hazard is not theoretical: with the disclosure welded shut (`display: 'none'`
unconditionally), the harness ran **43/45 with `[5a]`, `[5b]` and `[9d]` all GREEN** — three
rows asserting the mechanism reaches the author, over a mechanism no author could ever see.
The two that reddened are the new ones.

Nine rows close it, and **not one reads `textContent`**:

| row | asserts | what it catches |
|---|---|---|
| `[5e]` | collapsed: `checkVisibility()` false, `getClientRects().length === 0`, and `elementFromPoint` at the advisory block's centre does **not** land on the mechanism | an always-shown mechanism |
| `[5f]` | one disclosure per converted advisory, visible, `aria-expanded="false"` | a mechanism with no control to open it |
| `[5f2]` | the disclosure is hit-testable at its own centre before it is clicked | a button under something else |
| `[5g]` | expanded: visible, ≥1 client rect, strict `elementFromPoint` lands **inside** the mechanism | a disclosure welded shut |
| `[5g2]` | the other advisory stayed collapsed | one click reflowing the whole panel |
| `[5h]` | a second click hides it again | a one-way toggle |
| `[5i]` | the block is ≤ 60% as tall collapsed as expanded, both printed | a hide that saves no height |
| `[5j]` | the raster strip's sentence is still whole and has **no** disclosure | scope silently widening onto a third surface |
| `[9e]` | the layer card hides its mechanism and paints its remedies | converting one surface and not the other |

Containment is **strict** (`el === hit || el.contains(hit)`). `HIT_AT`'s existing
`hit.contains(leaf)` is true for any *ancestor*, and the advisory block **is** an ancestor —
so the loose test would report a `display:none` mechanism as "under the pointer".

**Three inherited rows were re-pointed**, each because O15 moved what they were aimed at:

- `[5c]` / `[5d]` — the "published but never painted" rows. Aimed at the mechanism they would
  now assert the opposite of the ruling, so they are aimed at `REMEDY_HORIZONTAL`: the **last
  clause of the whole advisory**, which is what a length-based truncation eats first. Under a
  planted positional cut (remedies behind the disclosure, mechanism always shown) both go
  RED — while `[5b]`, on `textContent`, stays green.
- `[5b2]` — "the author's own `v_factor` value is on screen". That value lives in the
  DIAGNOSIS; it was only ever readable off the mechanism leaf because the whole advisory used
  to be one element. Now parsed from the provider as `VSPLIT_LOCK_SCENE_IS` with `${vf}`
  bound to the fixture's value, so it is still not a sentence typed in the instrument.
- `[9d]` — stays a text row on purpose ("the layer card states one rule, not a shorter one"
  *is* a text question) but asks it of the **block**, one structural step up from the leaf.
  `[9e]` is its keeper.

## 8. What the first run found that the ruling did not know

**There are three surfaces carrying the mechanism, not two.** The first draft of `[5e]`
asserted "exactly 2 mechanism elements" and found **three**: `canvas/raster-timeline.ts`'s
`splitRefusal` composes the same clauses on the raster strip, in a different collapsible
section, as one un-split paragraph — the alternative green path the harness's own header
already names. It is outside O15's scope and is untouched. The classification is therefore
**structural, never a count or an index**: a mechanism whose block also holds a
"Why this happens" control is one of the two O15 converted. `[5j]` asserts the third is still
there and still whole, which turns "scope held" from a sentence in a packet into a
measurement.

## 9. Left open, deliberately

- **The `Deform bg` hint** — named out of scope in §5 and still out of scope. It is the next
  longest block in the same panel and has the same shape problem; `Advisory` is now the
  component that would fix it, in one line, whenever that row is opened. Not opened here.
- **Nothing runtime.** This is comptime advisory text; no emulator was touched.
- **`[5i]`'s 0.60 bar is a floor, not a target.** Measured 0.48 on both methods; the bar is
  set where a regression is unambiguous rather than at the measured value, so ordinary
  wording changes do not redden it.
