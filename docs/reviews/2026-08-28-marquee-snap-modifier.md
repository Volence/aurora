# The marquee snap modifier — and a pan the mousemove handler was eating

**Branch** `feat/marquee-snap-modifier` · **2026-08-28** · ROADMAP §5.1 row 81

Two deliverables, kept as separate commits because they are separate things that
happen to live in the same function.

| | |
|---|---|
| `67ce169` | `feat(marquee): hold Ctrl and the drag snaps the OTHER way` |
| `c2c4ec7` | `harness(marquee): the snap modifier, proven on the running app` |
| `1d7b790` | `harness(marquee): say what 6f does NOT catch, measured` |
| `18ecd24` | `fix(paste): middle-drag pans again in paste mode — and the ghost follows` |

Node suite **5,362 passed / 0 failed / 7 skipped** (baseline on this tree
5,356/0/7). CDP **33/33** (snap modifier) and **17/17** (paste pan).

---

## 1. The ask, and why its literal form ships nothing

> "what if with select tool if you hold control it behaves like it did where it
> forces to draw collision size?"

"How it did" is block snapping — the granularity at which a selection can carry
collision, since collision is stored per 16px cell and four tiles share one word.

**Taken literally that is a no-op in the state every author is already in.**
`marqueeGranularity` still defaults to `'block'` (`editorStore.ts:512`), and the
field's own comment says so:

> `block` is the default and is what shipped before this field existed, so
> nothing changes for an author who never touches the control.

Tile granularity landed the same day as an *opt-in* `Snap` control. So "Ctrl
means block" would change nothing for anyone who has not gone looking for that
control. The idea is right; its literal reading under-delivers.

**Built as an inversion.** Ctrl (or Cmd) flips whatever the Snap control says:

| armed | modifier | result |
|---|---|---|
| block | plain | rounded out to 16px |
| block | **held** | the exact dragged tiles |
| tile | plain | the exact dragged tiles |
| tile | **held** | rounded out to 16px ← *his request, verbatim* |

One rule, symmetric in both directions, and the author never has to recall which
way the panel is set: the modifier is always the other one.

The rule is one exported function, `effectiveGranularity(base, invert)` in
`src/core/editing/map-clipboard.ts`, and not a ternary at the call sites —
because **three** surfaces have to agree on it: `handleMouseDown`,
`handleMouseMove`, and the panel's readout. Two of those decide the rect and the
third describes it, which is exactly how a panel comes to lie about the drag it
is watching.

`snapMarquee` itself was not touched. This parcel is about *which* granularity
reaches it.

---

## 2. The design question: live-sampled or release-sampled?

**Live, and the authority question is answered by construction rather than by a
convention.**

The load-bearing fact about the existing code is that **`handleMouseUp` never
re-snapped**. It only tears the drag refs down; the marquee is written live on
mousemove and simply stands. So there is exactly one writer of the rect, and
"the preview" and "the commit" are not two computations that have to be kept in
agreement — they are the same store value.

`applyMarqueeSnap(col, row, invert)` is that writer. It is called from:

- **mousedown**, with `e.ctrlKey || e.metaKey` off the event (a press arriving
  while the window was unfocused delivers no keydown; the mouse event's own
  modifier bit is the only thing that saw it);
- **mousemove**, the same way;
- **a bare Ctrl/Cmd keydown or keyup**, against the last cursor tile.

That third channel is why `marqueeDragLast` exists. Without it, releasing Ctrl
while the hand is held still would leave the rect showing one grid while the
panel described another, until a stray pixel of motion resolved it. **Authority:
the last event that moved either the cursor or the key.**

`marqueeSnapInvert` lives in the store rather than in a viewport ref because the
panel has to read it. It is documented as ephemeral tool chrome, never part of
the document and never a property of the selection — a committed marquee still
records only its rect, and every downstream rule is answered from that geometry
via `isBlockAligned`, exactly as before.

**Cleared on blur and on leaving the tool.** A window that loses focus mid-chord
never delivers the keyup, and a stuck `true` would leave the panel narrating a
key no finger is on.

---

## 3. The modifier-conflict check (result: no conflict, verified two ways)

Ctrl is already bound in this viewport: **Ctrl+C** copy, **Ctrl+V** paste, and a
blanket `if (e.ctrlKey || e.metaKey || e.altKey) return` before the tool letters.

**By reading:** those are all chords — a modifier *plus* a character. A bare
`Control`/`Meta` keydown matches neither the `'c'`/`'v'`/`'s'` tests nor any tool
letter, and reaches the blanket early return. So this parcel reads a signal
nothing else was reading. It claims no chord, calls no `preventDefault`, and
swallows nothing.

**By measurement** (harness §7, all green):

- `7a` — Ctrl+C pressed **mid-drag, with Ctrl already held for the drag** copies
  exactly the rect on screen, which is the *inverted* one. Not some other rect,
  and not nothing.
- `7b` — Ctrl+B mid-drag still cannot arm `paint-block`. (Its real owner, the
  Explorer toggle, receives it — the canvas moves 192px, which the row asserts.)
- `7c` — an ordinary Ctrl+C *after* the key has been held through a drag copies
  the plain block-snapped rect, unaffected.
- `7d` — the override flag is `false` once nothing is held.

Alt and Shift are spent on the paste click (`e.altKey ? 'art' : e.shiftKey ?
'collision'`) and were not touched.

---

## 4. How the UI says the modifier is active

The Snap control **highlights the effective mode**, not the armed one, and a
caption underneath names the override and what release returns to:

> Ctrl held — snapping to tiles (8px, art only unless it lands even). Release
> for block.

The alternative — leaving the highlight on the armed mode — would have the
control claiming `Block` while the rect beside it snapped to tiles, which is the
precise defect class this facet spent the day removing. The hint line now reads
`Drag to select (hold Ctrl to snap the other way)`, so the gesture is
discoverable rather than folklore.

Both halves are asserted in the live DOM (`6c`, `6e`), by reading the buttons'
computed backgrounds and requiring them to **swap** and swap back.

---

## 5. Proof, and what would have gone green anyway

### The exposure, stated first

**Two of the four combinations produce byte-identical rects.** block+plain
equals tile+held; block+held equals tile+plain. So *"is the committed rect
block-aligned?"* cannot distinguish the modifier working from the Snap button
working, and **a harness that only ever dragged in the default mode would pass
with the modifier entirely unimplemented.**

### Which rows discriminate

| row | combination | what it is for |
|---|---|---|
| `3b` | block + plain | **control.** The baseline `3c` is measured against. |
| `3c` | block + **held** | **discriminating.** Same drag, same setting, one key. Asserts the exact odd rect *and* that it differs from `3b`'s. Unimplemented → this is `3b`'s rect. |
| `4b` | tile + plain | **control** for the other half. |
| `4c` | tile + **held** | **discriminating, opposite direction.** A modifier built as a *constant* ("Ctrl means tile") passes `3c` and dies here. |
| `5a`/`5b` | the grid | collapsed pairs equal, pairs different. A one-way modifier survives `3c` or `4c` alone and cannot survive this. |

Every drag targets an **odd** rect. `2b` asserts the oddness; `2d` asserts the
two derived expectations actually differ — on even bounds the granularities
agree and the store's own comment says a Tile drag there "behaves exactly like a
Block-mode one", so such a row would measure nothing.

Expectations are derived: `expectTile`/`expectBlock` transcribe `snapMarquee`'s
arithmetic with the source beside them, and are fed the tiles **the app itself
resolved** from the delivered integers, never the tiles the file intended (`2c`
asserts that resolution). dpr, rect and aim print. Run three times, dpr 1.

### Planted violations

| plant | rows red |
|---|---|
| `effectiveGranularity` ignores the modifier | **10** |
| the key listener removed (mouse-only modifier) | **2** — `6b`, `6c` |
| `handleMouseUp` re-snaps from the armed setting | **7** |

The second is the evidence that **section 6, and only section 6, discriminates
live sampling from mouse-only sampling** — `3c`/`4c`/`5` stay green under it.

**`6f` stayed green under the third plant, and the file now says so.** By that
point the key is already up, so the release-time and live computations agree and
there is nothing for the row to see. The rows that caught it hold the key
*through* the release — `3c`, `3d`, `4c`, `4d`, `5a`, `5b`, `6g`. `6f`'s claim is
narrowed to what it can support; **`6g` is the row standing between the design
and a preview that commits a different grid.**

Node: 6 rows on `effectiveGranularity`, red-first at 5 failures, quoted
`AssertionError: expected 'block' to be 'tile'`. `2M-b` correctly survives the
plant (it only exercises the unheld path) and `2M-f` exists specifically to pin
this parcel's own exposure.

### Two harness defects found before any claim was made

Both of the measure-the-wrong-thing kind:

- **Ctrl+B moves the canvas.** Its real owner opens a left sidebar, so the next
  drag landed at tile col 34 instead of 10 — exactly the 192px the Explorer is
  wide — and the row failed against an app that was right. It is now pressed
  twice and the restored geometry is asserted (`7b2`).
- **A chord is not a modifier bit.** Setting `modifiers` on the letter alone is
  not what a browser delivers: the letter's own keyUp still carries
  `ctrlKey: true` (correctly — Ctrl really is still down), so nothing in the run
  ever told the app the key had been let go. `chord` now presses Ctrl down first
  and lifts it last, like a hand.

A third measurement bug: the "which button is highlighted" probe compared against
the Layers row's `Art` button and got `null`, because the shell has an **`Art`
facet button** too and the exact-text lookup correctly refused an ambiguous
match. The claim is a *swap*, and a swap needs no third party.

---

## 6. The second bug: middle-drag pan in paste mode

> "When I'm in paste mode with marquee I can't middle mouse click to move around"

### The mousedown made a promise its sibling broke

`handleMouseDown`'s paste branch guards on `e.button === 0` and says so:

> Left-click only (button 0) — middle-click must still fall through to pan.

And it keeps that promise. The middle press falls through, reaches the pan branch
and sets `isDragging.current`. **`handleMouseMove` then threw the pan away** —
its paste branch runs unconditionally whenever `pasting` is true and `return`s
before the pan handler at the bottom of the function ever runs. The press started
a pan the move handler discarded, every frame, for the whole of paste mode.

### The class, which is now well evidenced

**A rule enforced in one handler and not honoured by its sibling.** Third
instance in one day: the batch-command repaint recursed on one path and not the
other; the paint tools truncated the nametable word in the press handler *and* in
the drag handler, and only the press one was found by reading. Here the press
handler's comment states an intent its sibling breaks.

**Reading one handler is demonstrably not enough to know what a gesture does.**
Every one of the three was invisible to a reader of the file the fix went in.

### Why not an early return

`if (isDragging.current) return;` at the top of the paste branch would have been
one line. It also reintroduces the bug the branch's own comment defends against:

> takes priority over any drag state so the ghost can't get stuck showing a
> stale cell

That is a real prior decision. And the two behaviours are not actually in
tension: **a pan moves the map under the cursor, so the world position beneath
the pointer genuinely changes and the ghost *should* follow it.** So the branch
**pans first and falls through**, computing the footprint against the camera the
pan just wrote — `screenToWorld` reads the view store live, so the `world` below
is the post-pan position and the ghost tracks the cell it is really over instead
of lagging a frame.

Ordering is load-bearing and is tested: computing `world` *before* the pan reds
`4c`.

The pan body is now one function, `panFromEvent`, called from both sites. A
second copy of the arithmetic in the paste branch would have been the same defect
wearing a different hat.

### The mouseup path

Checked: **nothing can commit a paste from this gesture.** The commit lives in
`handleMouseDown` behind `e.button === 0`; `handleMouseUp` has no paste path at
all. `4b` asserts it anyway, on section 0's own nametable hash and on `canUndo`.

### Proof

Red-first on the running app: **`[4a] got (0, 0) want (96, 64)`**, every other
row green including the left-drag control. 17/17 after.

The camera is read from `__dbg.view()`, never from the ghost — the ghost is the
quantity the bug leaves *moving*. The expectation transcribes `viewStore.pan`'s
own arithmetic including its `Math.max(0, …)` clamp.

**Two rows were rewritten when the app proved them wrong rather than the
reverse.** The first `4d` asked whether the ghost *moved* during the pan and
failed the **fixed** app: a grab-drag holds the world under the cursor invariant,
so a correct ghost stays exactly where it was. That also made `4c` vacuous in the
same stroke — post-fix, a frozen ghost and a live one both read the same cell.
`4d` now hovers to a new point *after* the pan, where frozen, stale-camera and
live give three different answers, and `4d2` asserts they do.

Each ghost row was then planted against separately:

| plant | row that catches it |
|---|---|
| `world` computed before the pan (ghost lags a frame) | `4c` |
| pan, then `return` (ghost stranded during the drag) | `4c2`, via the paint count |
| ghost frozen / reading the stale camera | `4d` |

**The control, `5a`/`5b`/`5c`:** a *left* drag in paste mode still does not pan,
still pastes (proven on the nametable hash, not a toast), and paste mode stays
armed. Without it the `4*` rows could not distinguish "middle-click now pans"
from "paste mode stopped working".

`pasteGhost()` is a new read-only probe, published the way `publishGuideReport`
and `publishScreenFrameReport` publish theirs. It exists because the property is
not otherwise visible: the hovered cell is a viewport-local ref (deliberately —
nothing outside the viewport needs it), it is not in the camera, and the ghost is
drawn on a **second overlay canvas** that a colour scan cannot tell from the map
beneath it. `paints` is published unconditionally so that "never updated" and
"updated to the same cell" are distinguishable, which is what `4c2` turns on.

---

## 7. Open / not done

- **The owner was offered the strictly-literal version** ("Ctrl always means
  block") and the inverting one was built pending his answer. If he picks the
  literal one it is a one-line change in `effectiveGranularity` plus the three
  node rows that pin the inversion.
- **Nothing was seen on the owner's display.** Both harnesses run headless under
  Xvfb. No emulator was touched.
- **Neither harness writes to disk.** Ctrl+S is never pressed; the paste harness
  undoes its single paste and reloads.
