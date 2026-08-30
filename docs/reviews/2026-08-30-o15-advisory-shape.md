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

## 6. Parked for the owner

`scratchpad/shots-o15/before-1920x1080-panel.png` is the before. The after goes beside it
at the same crop and the same `SCREEN`, so the pair is comparable — **one run, one
resolution**, per this repo's never-read-two-rows-of-one-run-out-of-two-runs bar.

**⚠ Committed with `-f` against this repo's own ignore rule, deliberately, and the
exception is narrow.** `.gitignore` ignores screenshots by class under the standing rule
*"instruments committed (a review that cites a harness must be able to point at it),
output not"* — and that rule is right, because a shot is normally regenerable by re-running
the named command. **A BEFORE shot is not.** Once the fix lands, the command regenerates
the *after* and the before can never be produced again by any means; it is the same class
as `scratchpad/2026-08-29-branches-before-sweep.txt`, the record kept precisely because
nothing could remake it. The AFTER shot is ordinary output and stays ignored — the pair
lives on in this packet's prose plus the one irreplaceable half.

