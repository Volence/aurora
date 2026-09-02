# `layer.drift` — the control, the ×256, and the refusals aeon forwards

**2026-09-02** · EW-DRIFT-CTL, EFFECTS-W1 · branch `feat/effects-drift-control`
off master `f7676b4c`

---

## 0. What changed, in one sentence

**A layer card can now author `drift`, in px/frame, and refuses at typing time
every value aeon's build would refuse — the first of which is `0`.**

The codec for this shipped on 2026-08-29 (`docs/reviews/2026-08-29-drift-codec.md`)
and deliberately built **no control**, because aeon's `tools/effects_gen.py`
refused the key and a spinner would have originated a value the build rejected
for every input. That premise expired: **aeon `ce4dbb7c`, "merge: chain 205 —
drift becomes authorable in the editor"**, whose `LAYER_KEYS` carries `drift` and
whose `render_drift` lowers it to `SceneDrift.Rate(n)`. Verified by reading
aeon's tree at that revision through `git show`, never by trusting the dispatch.

---

## 1. The conversion — where the ×256 lives, and the proof it happens once

### The chain, end to end

| where | what |
|---|---|
| `scene-ui.ts` `EFFECTS_DRIFT_UNITS_PER_PIXEL` | the factor, **read out of the schema's own description**, derived twice from two independent sentences. Untouched by this parcel. |
| `scene-ui.ts` `driftPxPerFrameToRate` | **the only multiply in this repo.** Untouched. |
| `effects-aeon.ts` `driftFromPxPerFrame` | the only WRITE-PATH caller of it. New, three lines, no arithmetic of its own. |
| `EffectsScenePanel.tsx` drift row | the only caller of *that*. New. |
| `effects-aeon.ts` `driftPxFieldValue` | the divide, for display. New, delegates to `driftRateToPxPerFrame`. |

Nothing re-derives the factor and nothing writes it as a literal. The gate on
that is not a reading — `effects-drift.test.ts` **greps the effects source for a
bare `256` outside the derivation**, and this parcel **extended that grep to the
two files the control lives in**, because they are now the first place a second
copy would plausibly appear. It fired once during the work, on a JSX comment of
mine, and the comment was reworded rather than the gate loosened.

### The round trip — the only shape that can catch a doubled multiply

A 256× error is invisible to every one-directional check, because **every wrong
value is itself a legal rate**: `1` px/frame written twice is `65536` (caught
only by the bound), and `0.001` written twice is `65` (caught by nothing). So the
gate walks the author's whole path.

`effects-drift.test.ts`, "round-trips a typed px/frame value through a real
document, unchanged" — 9 typed values, each through `driftFromPxPerFrame` →
`serializeEffectsScene` → `parseEffectsScene` → `driftPxFieldValue`:

```
typed 0.125 px/frame -> wire 32 -> on disk 32 -> box shows 0.125
typed 1 px/frame -> wire 256 -> on disk 256 -> box shows 1
typed -1 px/frame -> wire -256 -> on disk -256 -> box shows -1
typed 6 px/frame -> wire 1536 -> on disk 1536 -> box shows 6
typed -6 px/frame -> wire -1536 -> on disk -1536 -> box shows -6
typed 0.5 px/frame -> wire 128 -> on disk 128 -> box shows 0.5
typed 2.25 px/frame -> wire 576 -> on disk 576 -> box shows 2.25
typed 16 px/frame -> wire 4096 -> on disk 4096 -> box shows 16
typed -16 px/frame -> wire -4096 -> on disk -4096 -> box shows -16
```

plus `expect(wire.rate).toBe(px * EFFECTS_DRIFT_UNITS_PER_PIXEL)` — **exactly
one** application: a doubled multiply lands on `px·F²`, a missing one on `px`.

### And the round trip through the REAL control

The suite calls `driftFromPxPerFrame` directly, so it cannot say the PANEL calls
it. That is a seam, and a test per component and none across the seam is how a
chain of sound links holds nothing. Harness row **[4a]**, typing `2` into the real
box with CDP key events and reading `window.__dbg.aeon.scenesJson()` back:

```
box → document: 2 px/frame → {"rate":512}; expected {"rate":512} (2 x 256).
A MISSING multiply lands 2; a DOUBLED one lands 131072
```

⚠ The `256` the harness multiplies by is **re-read from the vendored schema JSON
in the harness's own process**, never imported from the module under test — a
module asked what its own factor is agrees with itself no matter what it does.

---

## 2. The refusals, and why they are the point

aeon's `render_drift` **forwards `Rate(0)` and `Rate(9000)` as shape-legal** and
leaves them to a build-time `ensure`. So **this box is the only place an author
learns the bound before a red build** — the owner's own EFFECTS-W1 complaint,
where the only escape from an unbuildable document was to revert.

`refuse` on `NumberField` withholds the commit (wave 1's pattern). `min`/`max`
are passed too and are **not** a guard; they bind the spinner.

### Painted, on screen, typed with real key events

| row | typed | document | sentence painted under the box |
|---|---|---|---|
| [5a] [5b] | `0` | unchanged `{"rate":512}` | `0 is not a drift rate — it is indistinguishable from no drift at all in ROM, and aeon refuses it at build time. A layer that should not drift spells "none".` |
| [5c] [5c2] | `0.001` | unchanged | `0.001 px/frame is 0 in wire units (1 px/frame = 256). 0 is not a drift rate — …` |
| [5d] [5e] | `20` | unchanged | `5120 (20 px/frame) is outside the contract's -4096..4096 (-16..16 px/frame). That is a TASTE bound, not a correctness one — raise it in the contract rather than working around it.` |

Every clause is `driftRateRefusal`'s, reached by converting first —
`driftPxPerFrameRefusal` adds **no bound, no exclusion and no arithmetic of its
own**, and a test row runs both over the same twelve values and requires they
never disagree, with both verdicts shown to vary.

**Zero is refused BY ITS REASON**, not as "must not be 0" — and the sentence names
the legal escape, which is the row's own `none` state (harness [6c]: it CLEARS the
key rather than writing a zero).

### The gloss rule — found by the harness, not by reading

Row [5e] failed on the first run, honestly: the out-of-range sentence measured
**132px tall in a 129px-tall LAYERS scroller** and could not be contained. The
cause was real redundancy — the prefix restated the px/frame arithmetic the
delegated clause already carried. The wire gloss now appears **exactly when the
conversion changed the number** (`0.001` → `0`), which is the one case an author
cannot reconstruct and the only place the ×256 is ever visible. Both halves of
that rule are asserted, in the suite and in the harness.

---

## 3. What the parcel deliberately did NOT build

- **No group control.** The four OJZ canopy layers carry one rate because that art
  is a single plane cut into four records and per-strip rates would shear it at a
  boundary. That is an author typing one number four times, not a reason for an
  "apply to all" that would hide the per-layer nature.
- **No band-level key.** `drift` is a LAYER key; `BAND_KEYS` in `effects_gen.py`
  is the raster preset's scanline region, an unrelated use of the word, and was
  not touched.
- **No re-vendoring.** The schema was already byte-identical to empyrean's tip and
  was neither re-extracted nor hand-edited.
- **No clamp.** `driftFromPxPerFrame` does not substitute a number the author did
  not type; the value is refused, unwritten, with the reason beside it.

---

## 4. A judgement call, flagged as one

**`layerExtras` gives `drift` up.** That line is "what the file sets that the card
cannot"; `curve` and `vsplit` left it in parcel H and `deform` in wave 2, each
when it got a control, and the file's own banner states the rule. Drift leaves it
here for the same rule — and it was the sharper case, because the extras line
printed px/frame over a file holding 1/256ths, so a stale second copy of that
value would have been the 256× hazard wearing a descriptor.

**If the lane disagrees**, restore the `layerExtras` hunk in `effects-aeon.ts` and
the `describe('the extras line no longer speaks for drift')` block; nothing else
depends on them.

---

## 5. Verification

### Suite

| | files | tests |
|---|---|---|
| master `f7676b4c` (measured, `git stash`, same tree, same `node_modules`) | 461 passed / 2 skipped | **6365** passed / 8 skipped |
| this branch | 461 passed / 2 skipped | **6371** passed / 8 skipped |

Both figures are runs I performed; neither is the other minus an arithmetic
guess. `npx tsc --noEmit` clean. The final green run was on a **removed and
repopulated** `node_modules/.vite`.

### Harness — `scratchpad/effects-drift-harness.mjs`, **21/21**

```
node        : v24.15.0   PLANT=(none)
loadavg     : 2.14 3.09 2.80
AEON_DIR    : <scratchpad>/aeon-copy   (git archive of aeon origin/master, fresh)
DISPLAY     : :96          screen 1680x1050x24, xvfb
contract    : 1 px/frame = 256 wire units; rate -4096..4096 (±16 px/frame),
              {"const":0} refused — READ FROM THE VENDORED SCHEMA IN THIS PROCESS
run target  : this worktree's own dist (AURORA_BUILT_TREE), electron borrowed
              from the main checkout (ELECTRON_BIN)
```

⚠ **The first attempt ran against the WRONG BUILD and said so.** A linked worktree
has no `node_modules/` or `dist/`, so `run-root.mjs` announced
`BORROWED — … the app under test is /home/volence/sonic_hacks/aurora's build` and
the drift select was absent. The banner is why that was a two-minute fix and not
a wrong conclusion about the control.

### Red-first — five plants, each shown applied on disk, each restored

| # | planted | result |
|---|---|---|
| A | `driftFromPxPerFrame` multiplies **twice** | **2 red** — `0.125 px/frame produced {"rate":8192}`, and the round trip |
| B | `driftFromPxPerFrame` **forgets** the multiply | **2 red** — `produced {"rate":0.125}` |
| C | the refusal catches only a TYPED zero, letting a rounds-to-zero through | **2 red** — `0.001 px/frame: expected refused=true` |
| D | the seed set to `0` | the module **throws at import**: `the drift row's seed (1/8 px/frame = 0) is no longer a legal rate: 0 is not a drift rate — …` — loud, not a fallback |
| **E** | **`onRefusal` removed from the panel's drift box** — the sentence never reaches the screen | **NODE SUITE GREEN: 154/154.** **HARNESS RED: 18/21**, exactly [5b], [5c2], [5e] |

**Plant E is the one that justifies the harness existing.** The commit is still
withheld with `onRefusal` gone, so every model-side row stays green and the node
suite sees nothing at all; only typing into the real box and measuring the
sentence against its scroller finds it.

⚠ **Honest limit found by plant E**: row **[6b]** ("the refusal CLEARS once a legal
value commits") **passed on the poison**, vacuously — a sentence that never
appears never fails to disappear. [6b] is only meaningful given [5b], and it is
not a discriminating row on its own.

`grep -rn "PLANTED VIOLATION" src test scratchpad` after restoring: **empty**
(the two permanent plants in `region-flip.test.ts` and
`reserved-tiles-real-act.test.ts` excluded by name). Full suite re-run green.

### The visibility gate

⚠ `checkVisibility()` and `getClientRects()` both go green on an element scrolled
out of its own scroller — measured in this repo at 2,635px out. Every paint row
here gates on the leaf's rect **against the SCROLLER's box** plus a strict
`elementFromPoint`; the trio is printed as evidence and is never the gate. It
earned its keep on the first run: [5e]'s `insideScroller: false` with
`visible: true, rects: 1` is what found the oversized sentence.

### Screenshot

`scratchpad/shots-effects-drift/effects-drift.png` — the row set to `px/frame`, a
typed `0` in the box, and the amber refusal painted beneath it.

---

## 6. Open, and where the lane may disagree

- ⚠ **NOTHING HERE PROVES A LAYER DRIFTS ON SCREEN.** No emulator was touched, by
  standing invariant. The engine half is aeon's and landed at `ce4dbb7c`; that a
  scene Aurora writes makes a cloud move in a running ROM is **untested by this
  parcel** and needs a foreground run.
- ⚠ **`Parallax preview` does not animate drift**, and the guide now says so. It
  composes the background from the camera; drift is the one thing on the card
  that moves with the camera standing still. A preview that showed it would need
  a clock, which is the `effects-preview-driver-faithful` ruling's other half.
- **THE LAYERS LIST IS 129px TALL** (measured). A refusal paragraph and the
  control it is about **cannot both be fully visible in it**. That is panel
  layout, which is the sub-tabs lane's file — **not touched**, reported here.
- **No ROADMAP row was added.** Another agent is live on `feat/effects-sub-tabs`
  and `docs/ROADMAP.md` is a shared file; the row is the lane's to write.
- **`newEffectsLayer` still does not offer drift**, correctly — a new layer
  carries the fewest keys the schema requires, and `"none"` is the default.
- **`step` was added to `NumberField`** (optional, one attribute passed through).
  Every field in the app was an integer until this one; with the browser default
  of `1` a spinner press on `0.125` snaps to `1`. It is documented there as **not
  a refusal**, beside `min`/`max`.
