# The layer guide's bound, said out loud — and two holes found on the way

**Branch** `feat/layer-guide-bound-legibility` · **2026-08-28**
**Instrument** `scratchpad/layer-bound-harness.mjs` · **runner** `scratchpad/run-layer-bound.sh`
**ROADMAP** row 72 (this parcel); amends rows 37, 58, 66.

---

## 1. The report, and whether the diagnosis held

The owner, twice, on the effects facet:

> *"layers are still bound to the window view — like I can't move that above the orange line"*
> `L2 y=67 · camera x=0 · v_offset=64`

> *"I can drag the view box below l2 though."*
> `L2 y=138 · camera x=0 · v_offset=135`

**The handed-down diagnosis held, and it is now measured on the running app rather than
read off the source.** Harness rows `[5a]` and `[8b]`, same run:

| `v_offset` | contract `EFFECTS_FIRE_LINE_MIN + v_offset` | guide came to rest at | owner reported |
|---|---|---|---|
| 64 | `3 + 64 = 67` | **67** | 67 |
| 135 | `3 + 135 = 138` | **138** | 138 |

The mechanism is exactly as diagnosed: `layerTopBounds` narrows a **locked** scene's
layer top to `max(0, FIRE_MIN + v_offset) .. min(511, FIRE_MAX + v_offset)` **for a layer
that carries a `vsplit`**, because such a layer lowers to a raster fire and aeon's
`fire()` ensures `3 <= line <= 223`. `clampLayerTop` enforces it on the drag.

**Nothing was wrong with the clamp.** It is the engine's own rule, transcribed correctly,
narrowing exactly the subset of layers it should. What was wrong is that **it was
silent**, and a clamp that cannot explain itself is indistinguishable from a bug.

### Why his reading was the reasonable one

This is the part that shapes the fix. On a locked scene **the screen frame's top edge IS
`v_offset`** — `frameAnchorFor` resolves it, `commitVOffset` writes it, and dragging the
box edits the document. So the fire floor sits `EFFECTS_FIRE_LINE_MIN` lines under the
box **and moves with it**. The correlation the owner could see was perfect. He inferred
"the layer is welded to the window" from a wall that tracked the window, and the actual
cause — a raster-fire rule three abstraction layers away — was nowhere on screen.

A message that printed only `min 138` would leave that reading completely intact. So the
sentence names the coupling he had already, correctly, noticed.

---

## 2. THE DESIGN FORK — recommendation, and it is yours to overturn

### Three paths, one rule, three behaviours

| path | on an out-of-range top | ruling |
|---|---|---|
| **1. Loading** a document that holds one | keeps it, advises, **still saves** | ROADMAP 58 |
| **2. The layer's own controls** (spinner, guide drag) | **refuses** it via `clampLayerTop` | ROADMAP 37, 66 |
| **3. Changing `v_offset`** (view-box drag, arrow keys) | ***creates*** one, silently | nobody's — see §3 |

### The options, and what each costs

**(A) Make all three PERMIT and advise.** Restores symmetry with loading. But it
re-opens what row 66 closed: the owner produced tops of 303, 304 and 302 by dragging, and
three dead builds, in twenty minutes. The counter-argument is real — he produced those
*because* "nothing on the canvas marked where line 223 was", and that is now fixed — but
it trades a certainty for an argument.

**(B) Make all three FORBID.** Requires clamping `v_offset` so it can never lift the
floor past a placed layer. **Reject.** The view box would stop moving because of a layer
three lines below it: a strictly worse spelling of the bug being reported here — an
invisible wall, on a *second* control, for a reason even further away. It would also make
it impossible to place the box first and the layers second.

**(C) RECOMMENDED — keep path 2's clamp, make it speak; make paths 1 and 3 both
permit-and-advise.** Two behaviours, separated by one statable line:

> **The control that OWNS a value refuses to originate an illegal one, and says why.
> Every other route surfaces it, rather than silently rewriting or blocking.**

That is a rule about **authorship**, not about permissiveness, and it covers all three
paths without contorting any of them. Path 1 already behaved this way; path 3 now does;
path 2 keeps the prevention row 66 bought and loses the silence that made it a bug report.

**Why C over A, plainly:** the owner's complaint is answered by legibility, not by
permission. If he drags L2 to 40 with `v_offset` 135 the build dies — permitting hands him
a broken build in place of a labelled wall. What he actually needs to know is that the
lever is `v_offset`, and the sentence now tells him so.

**⚠ This is a design call and it touches rulings already on the books (37, 58, 66).
I have implemented C. If you want A, the change is small and localised** — drop the
`layer` argument at `MapViewport`'s `clampLayerTop` call and at the panel spinner's, and
the existing `guideBoundNotice`/`fireLineAdvisory` pair already carries every sentence the
permitting path would need. Nothing else would have to move.

---

## 3. ⚠ THE HOLE — `v_offset` strands a layer under its own floor

**Confirmed, in code and on the running app.** `setSceneFieldCommand(library, id,
'v_offset', n)` writes one key through `editSceneCommand` and **re-checks no layer**.
`commitVOffset` adds no check of its own. So:

> Raise `v_offset` and the fire floor rises past an already-placed layer, leaving the
> document holding a top the bake refuses — **reached without ever touching the layer.**

Harness `[9a]`, measured: a fire layer legally at top 138 (`v_offset` 135, screen line 3),
`v_offset` moved to 400, **top stays 138** — now 265 rows below its own legal minimum,
screen line −262, with no layer gesture made at any point.

**The prevention rows 37 and 66 installed is therefore bypassable by moving the view box,
and the bypass is the exact gesture the owner performed.**

### What I did about it, and what I refused to do

**REFUSED: silently re-clamping the layers when `v_offset` moves.** Quietly rewriting
placements the author chose, in response to a gesture about something else, is worse than
the hole — it is the same class of defect one level up.

**REFUSED: refusing the `v_offset` change.** That is option (B) above.

**DONE: surfaced it, consistent with how the load path already treats an arrived-illegal
value.** `guideBoundNotice(scene, layer)` with no gesture asking reports `tone: 'illegal'`,
the guide draws in the refusal colour, and the plate names the cause:

> *"top 138 is now screen line −262 — this layer authors a Plane B split, so it becomes a
> raster fire, and a fire must land on 3..223 (lines 0-2 belong to the priming records).
> The build refuses it. On a locked scene the view box's top edge IS v_offset (400), so
> MOVING THE BOX MOVED THIS FLOOR and left the layer under it. Drag the box back, move the
> top into 403..511, or drop the split — a layer without one may sit anywhere in 0..511."*

The panel's `fireLineAdvisory` already spoke in this case; the canvas did not, and the
canvas is where the gesture happens.

**⚠ Still open and NOT fixed here:** the document can still be *saved* in this state. That
is row 58's ruling holding, deliberately, not an oversight — but it means the hole is now
**visible** rather than **closed**. If you want it closed, that is a separate call about
save-time refusal and it contradicts 58.

---

## 4. THE SECOND, SEPARATE BUG — the viewport really did imprison the drag

You asked whether the pan/zoom viewport constrains guide dragging independently of the
value bound. **It did. This is the owner's literal words as a real defect.**

`MapViewport` had a window `mouseup` (so a gesture survives leaving the container) but
**no window `mousemove` and no pointer capture**. So a guide drag *paused* the instant the
cursor crossed the container edge: the only rows the handler ever saw were rows already on
screen, and **a layer could not be dragged to any `world_y` scrolled off the top.**

Measured red-first, harness `[10b]`, on a **control layer with no `vsplit`** (bound
`0..511`, so no value clamp is in play at all):

```
view panned to vp.y = 200; dragged to clientY 56, which is 50px ABOVE the canvas top
  reached world 210      <- the last in-container step, vp.y + 10
  unconstrained contract  150
  window-bounded          200
```

**Fixed** by extracting the drag update into `updateGuideDrag(clientY)` and adding a window
`mousemove` for the duration — the same cure `finishGesture` already documents for the
same class of bug. **Guides only, deliberately:** for an object drag, a paint stroke or a
marquee, "pause at the edge" is not a wall, and following the cursor into the panel would
let a stroke land somewhere the author cannot see. A layer top is the one subject here
whose legal range is far larger than the window showing it. After the fix, `[10b]` reads
`reached 150`.

---

## 5. What changed

| file | what |
|---|---|
| `src/renderer/providers/effects-aeon.ts` | `guideBoundNotice()` + `GuideBoundNotice`; three shared clauses (`FIRE_IS`/`FIRE_LAW`/`FIRE_REMEDY`) that `fireLineAdvisory` now composes from — **its output is byte-identical**, pinned by a test |
| `src/renderer/canvas/effects-guides.ts` | `notices` draw option, `notice` on `GuideGeometry` (published, not re-derived), refusal colouring, `wrapNoticeText`, `drawNoticePlate` |
| `src/renderer/canvas/canvas-colors.ts` | `EFFECTS_GUIDE_REFUSED` + plate colours |
| `src/renderer/components/MapViewport.tsx` | notices resolved per layer in the draw pass; `requested` on the drag ref; `updateGuideDrag(clientY)` extracted; **window `mousemove` for guide drags** |
| `src/renderer/components/effects/EffectsScenePanel.tsx` | the spinner's tooltip now says *why* its range was narrowed, only when it was |

**Design choices worth contesting:**
- **Red, not a fourth shade of cyan.** The cyan family already carries enabled/disabled/
  active; a fourth shade reads as "less selected" when the meaning is categorical.
- **At most one plate on screen.** `v_offset` can strand several layers at once; four
  stacked paragraphs of one rule is how an advisory becomes decoration. Every refused
  *line* is still marked, and the count is in the plate.
- **The plate sits beside its guide, not in a corner.** The bug is that the wall was here
  and the explanation was elsewhere; a corner is a second elsewhere.
- **Refusal outranks hover** in the line colour: "which line am I touching" is answerable
  from the cursor, "which line kills the build" is answerable from nothing else.

---

## 6. How it was verified

### CDP harness — the only instrument that can see this

**46/46 on three consecutive runs** (`run-bound-FINAL-1/2/3.log`, dpr 1, canvas
816x742, 0 idle repaints each). The node suite cannot see a canvas, a drag or a repaint.

**Red-first, against the genuine pre-implementation `dist/`** (`run-bound-RED.log`,
**31/45**). The owner's case reproduced exactly:

```
PASS  [5a] the fire layer is HELD at EFFECTS_FIRE_LINE_MIN + v_offset
FAIL  [5b] ⚠ something on screen EXPLAINS the stop, mid-gesture
             notice = undefined
FAIL  [5c] it names the REASON, not just the number
             ""
PASS  [6a] NOT EVERYTHING IS STUCK: the no-split layer moves FREELY above the fire floor
PASS  [8b] THE FLOOR MOVED WITH v_offset — a fire bound, not a fixed wall
PASS  [9a] ⚠ THE HOLE IS REAL
FAIL  [9b] the canvas marks the stranded layer          notice = undefined
FAIL  [10b] a guide CAN be dragged to a row scrolled off the top
             reached 210; unconstrained 150, window-bounded 200
```

`[5a]` passing while `[5b]` fails **is the bug report, exactly**: the wall works, nothing
explains it.

### Numbers are derived, never typed

`EFFECTS_FIRE_LINE_MIN`/`_MAX` are **parsed out of `effects-aeon.ts` at startup**;
`v_offset` is read back off the live document; the floor is computed. `67` and `138`
appear in the harness **only** in row `[0z]`, which cross-checks the parse against the
field report and asserts no behaviour.

### Alternative green-paths ruled out

- **A matcher catching a different rule's wording.** `[5c]` requires `v_offset (64)` and
  `[8c]` requires `v_offset (135)` **and asserts 64 is absent** — a static string cannot
  satisfy both.
- **Two paths holding one observable green.** The notice is published (`[5b]`) *and*
  pixel-sampled on the canvas (`[5e]` the line, `[5f]` the plate's own left rule, with a
  control column that must be clean). Deleting the draw call reds the pixel rows while the
  model rows stay green, and vice versa.
- **Measuring the wrong quantity.** `[5a]`/`[5d]`/`[6a]` triangulate: the held layer, the
  control layer's silence, and the control layer's free movement, in one repaint.
- **The parcel's own exposure — a clamp tested where it would not have changed anything.**
  The drag goes from world 200 to world 22 against a floor of 67, so the clamp *moves* the
  value; and `[8b]` re-runs it at a different `v_offset`. **A row pinned at one `v_offset`
  cannot tell a bound from a wall** — which is the confusion that produced this report.

### Rows that DO NOT discriminate, named

`[3a*] [4a] [4b] [4c] [10a] [11a] [11b] [11c]` — anti-vacuous setup. `[0z]` — a parse
cross-check. **`[9a]` documents a hole**: it passes *because* the app does not re-clamp. It
is not a feature passing, and it would go red if someone "fixed" the hole by silently
moving layers — which is a change worth noticing.

### Node suite

**5194 tests: 5186 passed, 7 skipped, 1 failed.** `tsc` clean.

The one failure is **pre-existing and not this parcel's** — proven by stashing this
branch's `src/` and re-running on the clean tree, where it fails identically:
`test/formats/effects-scene-curve-vsplit.test.ts > ojz_act1_depth.json round-trip golden`,
`TypeError: Cannot read properties of null` at `history.ts:99`. It reads a **locally
modified, uncommitted** aeon fixture (`aeon/games/sonic4/data/editor/effects/
ojz_act1_depth.json`) whose `vsplit` has moved off the layer the test picks, so
`setLayerFieldCommand` returns `null` and the `!` feeds it to `EditHistory.execute`.
**TAGGED for foreground follow-up** — it belongs to whoever owns that aeon edit.

13 new node tests were added under `guideBoundNotice — the fire bound is a MOVING wall,
and it now says so`, every number derived from the constants, at four `v_offset` values
(`0, 64, 135, -32`) with anti-collision guards so the four cannot silently coincide.
Red-first with five plants; **the decisive one is a bound that is correct at the owner's
first `v_offset` and wrong at his second** — only the 135 and −32 rows catch it:

```
AssertionError: min at v_offset 135: expected 67 to be 138
```

### Two defects found in the harness itself, and fixed

1. **A rect captured once is a stale rect.** One run reported `[10b] reached 149,
   unconstrained 150` — an off-by-one that looks exactly like the feature being wrong, and
   was the harness deriving its expectation from a `rect.top` measured seconds earlier
   while the app used the live one. The rect is now re-read before every aiming section,
   and a move is printed. Same family as the dpr trap.
2. **Client-X passed to a canvas-local pixel probe.** It kept working only because a guide
   line spans the full canvas width, so every column hit it. A coincidence, not a
   measurement.

One run in six reported a single idle repaint at `[11d]`; the cause was a repaint already
scheduled when the counters were zeroed landing just after them. A settle was added before
zeroing — **the assertion stays a hard `=== 0`**, and the last three runs report
`0 repaints against ~960 rAF ticks`.

---

## 7. Left open

- **The `v_offset` hole is now visible, not closed** — a stranded scene still saves (row
  58). Closing it is a separate call that contradicts 58.
- **Design fork (§2) is yours to overturn**; option A's change is small and localised.
- **The pre-existing suite failure** above, TAGGED.
- **Not seen on the owner's own display.** Everything here is Xvfb at dpr 1. The colour
  and plate placement are unconfirmed on his monitor — TAGGED for foreground.
- **No emulator was touched at any point.**
