# EW-SHAPE-DRAG — "layer edges are draggable on the canvas the way band edges already are"

The final clause of `d-26b-effects-tooling-shape-ANSWERED`, option
`three_sub_tabs_plus_section_strip`.

Branch `feat/effects-layer-drag`, from `b0e1b0c1`.

---

## 1. The measured delta, first

**The clause was already built, and had been for a week.** This is the fifth row
on this lane to come back smaller than its booking, and — as instructed — that is
reported as the outcome rather than worked around.

`e9749e61` (2026-08-26, "feat(effects): drag a parallax layer's world_y on the map
canvas") shipped ROADMAP item 43. Measured on the running app before anything was
written, every mechanic the clause names was present **and built to the precedent
the brief asked me to match**, because `RasterTimelineStrip` and this were written
by the same hand within days of each other:

| What the clause asks for | State on arrival | Where |
|---|---|---|
| Guide lines drawn per layer, labelled `L0 y=…` | built | `src/renderer/canvas/effects-guides.ts:380` |
| Hit test with a screen-px grab zone | built (`GUIDE_GRAB_PX = 6`, nearest wins, tie to the later layer) | `effects-guides.ts:169-188` |
| The press taken by the guide, not the map | built, as a priority order inside the one mousedown | `MapViewport.tsx:2693-2716` |
| Live preview through a ref, no React render per move | built | `MapViewport.tsx:2303-2334` |
| **One undo step per gesture** | built | `endGuideDrag`, `MapViewport.tsx:2336-2354` |
| **Stale-subject guard** | built, with a serialized witness | `guideDrag` docblock, `MapViewport.tsx:417-454` |
| Bounds from the model, never literals | built (`clampLayerTop`, the panel spinner's own clamp) | `effects-aeon.ts:1505` |
| Refusals that name the reason and the remedy | built, as a red plate beside the guide | `drawNoticePlate`, `effects-guides.ts:313` |
| Drag continues off the canvas edge | built, on a window listener | `MapViewport.tsx:3495` |
| A debug publish a harness can read | built | `GuideReport`, `effects-guides.ts:449` |
| A CDP harness driving a real mouse | built, 31 rows | `scratchpad/effects-guides-harness.mjs` |

**So the residual was three things, all real and all small.** They are what this
branch contains.

### R1 — "dragged past another layer" had no answer on the canvas

The brief names this as a hazard and says silence is the one indefensible option.
It was silent.

`vsplitOrderAdvisory` — the transcription of aeon `scene_vsplit_fires`'s
`ensure line > prev` — existed, was tested, and was rendered **in the panel only**
(`EffectsScenePanel.tsx:532`). The panel row sits in the 129px window onto a
2,466px list that the cold walkthrough measured, roughly 300px from the gesture.
Dragging one guide past another on the canvas produced a document the build
refuses, with nothing on the canvas saying so.

### R2 — the harness held a refuted rule and had been red for six days

Running the existing 31-row harness on an unmodified tree returned **30/31**, red
at `[8d]`.

It was not a feature bug. `originOf` still returned `vp.y` for a locked scene —
parcel C's rule of 2026-08-26 — which `7ba5a638` overturned the next day on the
owner's own words (*"if I move the viewport it drags the layers which I don't
want"*). `guideOriginWorldY` has returned `0` in both spaces ever since, and
deliberately **dropped its `origin` argument so that stale call sites would fail
to compile**. A `.mjs` harness has no compiler, so this one did not.

At `vp.y 64, zoom 2, top 200` the app drew **272** = `(0 + 200 - 64) * 2`, which is
the current rule exactly. The harness asked for **400** = `(64 + 200 - 64) * 2`,
the rule the owner rejected.

**How it survived six days is this file's own lesson, not the app's**: the two
rules *agree at `vp.y === 0`*, and every row but one pins the camera at 0. One row
of thirty-one covered the difference — and that harness is not in `package.json`,
so it was in nobody's regression set and nobody ran it.

### R3 — the gesture was in no document

`docs/guides/effects-first-run.md` (403 lines) did not mention that the lines can
be dragged at all.

---

## 2. The gesture, and how it arbitrates

**Arbitration is a priority order inside the single `onMouseDown`, not a guard
bolted on afterwards** — the repo's stated precedent, and it was already the case:

```
paste mode  →  parallax guide  →  screen-frame edge  →  tools / map pan
```

A guide takes the press only when `activeGuideScene()` is non-null (the Effects
facet, with a scene selected) **and** the cursor is within `GUIDE_GRAB_PX` of a
line. Off a line, or off the facet, the hit test returns `null` in one arithmetic
pass and the press falls through to the pan branch untouched.

| Gesture | How it is arbitrated | Tested? |
|---|---|---|
| **Map pan (mouse drag)** | The guide branch `return`s before the pan branch is reached. Off a line, the hit test is `null` and pan is reached normally. | **Yes** — `[5a]` (cursor becomes `ns-resize` on the line), `[5b]/[5c]` (the press moves the layer, not the view), `[8b]` (off the Effects facet nothing hit-tests, report inactive **and** no line in the pixels). |
| **Camera arrow keys** (on by default here since `0c4b5982`) | Different input device; no contest for the button. But `ArrowDown` on a locked scene runs `commitVOffset` — **a real undoable document edit from a window-level keydown with no pointer event**, which is precisely the incident shape `guideDrag`'s witness exists for. | **Yes, and this is new coverage** — `[6c]/[6d]/[6e]`. Pressed mid-drag: `v_offset` 0→1, the release still commits the dragged top (290, the value the final cursor position asks for), and the two edits are **two separate undo steps**, which is the right answer for two genuinely distinct edits. ⚠ The witness does **not** cover this case — it compares the *layer*, and `v_offset` is a *scene* field, so the layer serializes identically and the commit proceeds. That is why it was measured rather than reasoned about. |
| **Wheel zoom** | Different event entirely. | **Partly.** `[8d]` proves a zoom of 2 puts the guide on the contract row, but it sets the view through `__dbg.setView`, not a real `Input.dispatchMouseEvent` wheel. **No real wheel event was dispatched in this parcel** — stated as a gap rather than claimed. |
| **Space-pan** | Different key path; the guide branch is on `mousedown` only. | **No.** By construction, not by measurement. Stated as a gap. |

---

## 3. What happens when one layer is dragged past another

**It is allowed, it is never re-sorted, and where it is illegal the canvas now says
so in red, mid-gesture.**

**Why not refuse.** `clampLayerTop` bounds a top against the Plane-B row span and
the raster-fire rule and nothing else. For a layer that authors no `vsplit` there
is **no engine rule about order at all** — refusing the crossing would invent a
bound the bake does not have, and would wall the author in for a reason that does
not exist. This repo has already paid for one invisible wall on this exact field
(the `v_offset` fire floor, `FIRE_FLOOR_IS_THE_BOX`).

**Why not reorder.** `vsplitOrderAdvisory`'s own note, written before this parcel:
an ordering violation is a fact about *two* layers and has *two* legal
resolutions — move either top, or drop either split. A control that silently
picked one would be choosing for the author, and would rewrite a placement the
author did not ask about.

**So it must not be silent, and now it is not.** When *both* layers author a
`vsplit`, the crossing is an engine violation (`scene_vsplit_fires` ensures
`line > prev`) and the build dies. The sentence is the panel's own — one rule, one
spelling, per the `FIRE_IS`/`FIRE_LAW` discipline in `effects-aeon.ts` — drawn in
the same red plate the other refusals use, and it names both layers and both
remedies.

Two details that are the point rather than polish:

- **Asked of the layers as the *gesture* has them**, not as the document has them.
  During a drag the stored top has not moved, so an advisory derived from the
  document would appear **one gesture late** — after release, which is when it is
  no longer actionable. `[7f]` asserts the notice is present *while the document
  still reads the pre-drag value*, so this cannot pass on a post-release notice.
- **A bound notice out-ranks an ordering one.** "This top cannot exist" is about
  the layer the author has hold of; "these two collide" is about a pair. Reading
  the second first sends the author to change the wrong layer. This is not
  theoretical: the first version of the harness rows left the fixture at tops
  200/232, 232 is past the fire ceiling of 223, and the bound notice correctly
  pre-empted — which is how the rule got measured instead of assumed.

This matches the guide, which now says the same thing in the author's words.

---

## 4. Undo — one step per gesture

Not a claim; three rows, on a real mouse, in one session:

- `[5d]` — ten `mouseMoved` events between press and release, then **one** `Ctrl+Z`.
  The layer returns to 200. A per-move commit lands at ~362 and the row prints that
  counterfactual so the number cannot be read as a coincidence.
- `[6b]` — a drag released on the row it started from consumes **no** undo step.
  The pre-state is part of the assertion (an undo-to-a-default proves nothing if the
  value was never non-default).
- `[6e]` — with an arrow-key camera edit interleaved, **two** edits cost **two**
  undos, one each. One gesture is still one step; a second distinct edit is
  correctly its own.

Mechanically: the drag previews through a `useRef` and writes exactly once, in
`endGuideDrag`, through the same `setLayerFieldCommand` + `executeCommand` the
panel's spinner uses.

---

## 5. Red-first proof of the new gate

Required by invariant 8, and done on disk.

**Mutation applied** to `MapViewport.tsx` (shown as the real `git diff` before the
run):

```diff
-        if (n !== null) { notices.set(i, { tone: n.tone, text: n.text }); continue; }
+        if (n !== null) { notices.set(i, { tone: n.tone, text: n.text }); }
+        continue;  // POISON: the ordering notice below is now unreachable.
```

**Cache:** `rm -rf node_modules/.vite dist`, then `VITE_AURORA_DEBUG=1 npm run
build` — 14 fresh `dist/` entries emitted, so the poisoned source is what ran.

**Runner:** `npm run harness:effects-guides` (`scratchpad/effects-guides-harness.mjs`),
against `AURORA_BUILT_TREE` = this worktree.

**Result — red:**

```
FAIL  [7f] DRAGGED PAST ITS NEIGHBOUR, THE CANVAS SAYS SO — mid-gesture, before release
        dragIndex=0 document still at 100 (started 100); notice=[null,null] text=null
FAIL  [7g] the refused guide is drawn RED on the canvas, not merely reported
        pixel=null at row undefined
```

**Restored** with `git checkout --` from the committed baseline, `node_modules/.vite`
cleared again, rebuilt, re-run: green.

**The alternative green path I ruled out.** `[7f]` could in principle pass on some
*other* notice, so it matches the advisory's own text (`/not BELOW layer/`) — a
string produced by nothing else in the tree — requires `tone === 'illegal'`, and
requires the document to still hold the pre-drag top. And `[7g]` is independent of
the report entirely: it samples the **canvas pixels** at the row index the report
names and requires red (measured `{r:242,g:91,b:91}`), so a report-only fabrication
with nothing drawn fails.

⚠ **One row survives the poison and cannot carry the claim alone.** `[7e]` asserts
that layers *in* order produce **no** notice — and a feature that never speaks at
all also passes it. It is kept, because without it `[7f]` would pass on a canvas
that shouted at everything; but it is a companion, not the gate. Reported rather
than deleted or banked.

---

## 6. Numbers

**Node suite:** 6405 passed, 8 skipped, 463 files — before and after, unchanged.
The suite cannot see any of this (no DOM, no canvas, no pointer), which is the
premise of the harness.

**Harnesses** (all run sequentially, each against its own fresh throwaway aeon
copy; `AURORA_BUILT_TREE` pinned to this worktree, **no `BORROWED` line in any
run**; `dpr 1` on this run and printed in-band):

| Harness | Expected at `b0e1b0c1` | This branch |
|---|---|---|
| `harness:effects-sub-tabs` | 13 | **13/13** |
| `harness:effects-section-strip` | 15 | **15/15** |
| `harness:effects-drift` | 21 | **21/21** |
| `harness:effects-guide` | 11 | **11/11** |
| `harness:effects-preview-default` | 16 | **16/16** |
| `harness:timeline-edit` | 39 | **39/39** |
| `harness:effects-guides` | *(unregistered)* 30/31 | **38/38** |

`harness:effects-guide` is worth calling out: it compares the app's **rendered**
guide text against the bytes of `docs/guides/effects-first-run.md` read from disk,
so its 11/11 after the doc edit is what proves the new section actually reaches the
in-app reader rather than sitting in a file.

`harness:effects-guides` went 31 → 38 rows: `[6c]/[6d]/[6e]` (arrow key mid-drag),
`[7d]`–`[7g]` (ordering), and `[8d]` is green for the first time since 2026-08-27.

**It is now registered in `package.json`.** That is a fix for the cause of R2, not
bookkeeping: an unregistered harness is one nobody runs, and this one rotted for
six days in plain sight.

---

## 7. Screenshot

`scratchpad/shots-effects-guides/5-dragged-past-neighbour.png` — captured **mid-drag,
button still down**, `L0` dragged to 180 past `L1` at 150. Both guides visible, `L1`
red, and the plate reading:

> L1 this split lands on screen line 150, which is not BELOW layer 0's split at line
> 180 — two whole-plane vertical scroll values for one row, and the merged fire would
> carry both writes with the second silently winning. The build refuses it. Give the
> two layers different screen lines, or drop one split.

Also from the same run: `2-mid-drag.png` (an ordinary drag in flight),
`3-after-drag.png`, `1-guide-drawn.png`, `4-layout-facet-no-guides.png`.

### Granular visual calls, each reversible in one line

The owner has seen none of this. Two calls were made, and neither is a new
mechanism — both reuse chrome that already shipped:

1. **The ordering violation is drawn in the refusal RED, at `lineWidth 2`, with the
   plate** — identical treatment to the fire-bound refusal. *Alternative:* a third,
   softer tone for "the pair is wrong" versus "this layer is wrong". *Why not:* both
   kill the build, and two shades of "the build dies" is the exact confusion the
   `FIRE_IS`/`FIRE_LAW` shared clauses were extracted to end. **To reverse:** give
   the ordering branch its own tone in `MapViewport.tsx`'s notices loop.
2. **The bound notice wins where both apply** (§3). *Alternative:* show the ordering
   one, or both. *Why not:* at most one plate is on screen by design
   (`drawLayerGuides`: four stacked paragraphs is how an advisory becomes
   decoration), and the layer's own illegality is the one the author can fix from
   the guide they are holding. **To reverse:** swap the two branches in that loop.

Both live in one 8-line block in `MapViewport.tsx`.

---

## 8. What this parcel did NOT do

- **No emulator.** No `mcp__oracle__*` call, no ROM, no build of aeon. Nothing here
  needs one.
- **Nothing written to `../aeon`.** Every run used a fresh `cp -a` throwaway under
  the session scratchpad, and the harness presses no `Ctrl+S`; `[10a]` undoes the
  session back to the fixture scene list and asserts it matches.
- **No real wheel or space-pan event dispatched** (§2). Arbitration against those
  two is by construction, not by measurement.
- **The visual detail is unratified** — the answered card's own note says the owner
  chose the reasoning, not the picture. The screenshot is for him, not evidence he
  approved it.
