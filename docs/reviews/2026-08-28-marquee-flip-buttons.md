# The flip gets buttons, and one action both surfaces take

**Branch** `feat/collision-mark-normal-first` · **Date** 2026-08-28 · **ROADMAP** §5.1 row 85
**Predecessor** `docs/reviews/2026-08-28-marquee-flip.md` (row 83) — the transform and the keys.

The owner, after reading the panel's key hint:

> "I think a button on the right panel would be nice too"

---

## 1. Row 83 rejected a button pair. It was right, and this does not overturn it.

Row 83's `map-flip.ts` docblock records the rejection verbatim: a button pair
"was considered and REJECTED **as the only surface**: flipping is a thing you do
mid-gesture with the cursor over the map and the ghost under it, and a control
240px away in a side panel breaks that."

That reasoning still holds and the keys are untouched. What it did *not* license
is the panel getting a sentence and nothing else:

> *"Drag to select … · X flips the selection left↔right, Y top↕bottom"*

**A sentence in a panel is documentation, not an affordance.** He found those
keys because he was told, not because the UI offered them — the same defect
class as the priority bit he could not see and the clamp that would not explain
itself. So the buttons are added *beside* the prose, and both stay.

---

## 2. What was built

### One action, two surfaces

Everything the keydown branch used to do inline moved into
`src/renderer/components/map-flip.ts` as **`performMapFlip(axis)`**: resolve the
target, apply the transform, batch the one undo entry, say what happened,
repaint the ghost. `MapViewport`'s branch is now four lines that call it, and
the panel's buttons call the same function.

**It reads the stores rather than taking them as arguments, and that is the
load-bearing choice.** The obvious alternative — each call site assembling the
act, the level and the command runner and handing them in — is exactly the shape
that lets two surfaces drift: `MapViewport` deliberately uses `getActiveLevel`,
whose level carries the **zone's** tileset and palette so the commands can reach
zone data as well as the act's, and a panel that reached for the act alone would
look identical at the call site and quietly write less. One assembly, one place
to be wrong.

### The ghost repaint is registered, not passed

`mapClipboard` is not a redraw dependency and the paste ghost is drawn on a
**second, unnamed overlay canvas**, so mirroring the clipboard changes nothing on
screen until that canvas is redrawn. The key path always had that line inline.
The panel cannot reach the canvas.

So `MapViewport` registers `drawCollisionPreview` with `map-flip` on mount and
clears it on unmount; every flip path then gets the repaint. A button that
flipped without it would mirror the model and leave the **old art under the
cursor**, which then pastes — worse than having no button. `FlipOutcome` reports
`ghostRepainted`, so an unregistered repainter is a visible answer rather than a
silence.

### The buttons

- **`X ⇄` / `Y ⇅`** — the key *and* the axis. The app's convention (`Ctrl+S` on
  Save, `Ctrl+Shift+B` on Build & Run, `shell/commands.ts`) is that a
  discoverable button also teaches its shortcut; a button that hides the key
  trades one undiscoverable thing for another. X/Y is both the key and the
  engine's own word for the axis (`collision-cell-word.ts` bit 10 `xFlip`,
  *"mirror horizontally"*), which is the vocabulary `map-flip.ts` defends. The
  glyphs match the collision palette's existing `H ⇄` / `V ⇅` pair rather than
  introducing a new control style.
- **A `Flip` row beside `Snap` and `Layers`**, in the same `planes`/`planeBtn`
  styles the panel already uses.
- **Disabled, never hidden.** A control that vanishes teaches nothing about when
  it applies, and "when does flip apply" is the subtle part: mirroring the
  pending paste works from any tool, mirroring a committed selection **in place**
  needs the marquee tool armed, because that one rewrites the map. The disabled
  title names which of the two is missing.
- **Enablement is `resolveFlip`'s verdict**, not a second reading of the same
  state — otherwise the panel could teach a rule the map does not keep.

**No rotation button.** There is no rotate bit on this hardware, a rotated tile
costs budget where a flipped one is free, and putting rotation beside flip would
imply otherwise. Row 83's exclusion, kept.

---

## 3. How it was verified

### Node suite

**5,442 passed / 0 failed / 7 skipped** (404 files), up from 5,436 after the
rebase. Six new rows in
`src/renderer/components/__tests__/map-flip.test.ts`.

### Guards proven red-first (planted, quoted, restored)

| planted | row that fired | failing assertion |
|---|---|---|
| the ghost repaint call dropped | 1 | `expected +0 to be 1` |
| the wrong axis passed to `flipClipboard` | 2 | `expected [ 4099, 4100, 4097, 4098 ] to deeply equal [ 2050, 2049, 2052, 2051 ]` |
| the action acting in an ineligible state | 1 | "does nothing in exactly the states resolveFlip calls ineligible" |
| the panel reimplementing the transform (`flipClipboard` directly) | 1 | `MarqueePasteOptions.tsx must call the shared action: expected … to contain 'performMapFlip'` |

### CDP harness — the BUTTONS, clicked

`scratchpad/marquee-flip-button-harness.mjs`. **Nothing in it dispatches a flip
key.** Every flip is `element.click()` on a button located in the live DOM by
its own visible label, and the locator returns `no-button` rather than throwing,
so a missing control is a named failure.

**Result: 25/25 on three runs, identical numbers.**

| row | measured |
|---|---|
| `B2a` both buttons present, visible, DISABLED with nothing eligible | `{"found":true,"text":"X ⇄","disabled":true,…}` |
| `B2b` the disabled title says what is missing | *"Nothing to flip yet — drag a selection with the marquee tool, or press Ctrl+V…"* |
| `B2d` clicking a disabled button changes nothing | model byte-identical, `canUndo false → false` |
| `B3` the prose survived beside the buttons | hint still reads *"… X flips the selection left↔right, Y top↕bottom"* |
| `B4` a standing marquee enables the **same** elements | `disabled true → false`, label unchanged |
| ⭐ `B5b` the button mirrored the map | `before[0..3]=[49706,49152,17025,17030]` → `after=[19078,19073,51200,51754]`, equal to the harness's own two-part transform |
| `B5c` neither half alone | differs from reverse-only ✓ and toggle-only ✓ |
| `B6a`/`B6b` one undo step, exact revert | `canUndo false→true`, one Ctrl+Z restores and leaves `canUndo false` |
| `B7` the screen changed, only inside the selection | `#map-canvas` 650 px changed, bbox (496,528)–(527,559) vs selection (496,528)–(528,560) |
| `B8` the Y button is the other axis | matches the vertical transform, differs from X's result |
| ⭐ `B9b` the button mirrored the pending paste | matches the transform on a 4×4 clipboard |
| `B9c` …and it is not an edit | map unchanged, no undo step |
| ⭐ `B10` the button repainted the GHOST | overlay `605 px` changed, bbox (0,0)–(31,31) — the 32×32 ghost — while `#map-canvas` moved `0` |
| `B11` the act left as found | restored, `canUndo false` |

### ⭐ The button rows can fail while the key rows pass — measured, not asserted

The requirement, proven rather than claimed. With the flip buttons **deleted**
from the panel (`{FLIP_OPTS.map(` → `{[].map(`) and the app rebuilt:

- **`marquee-flip-button-harness.mjs`: 10/25**, with 15 rows failing, starting
  at `B2a` reporting `{"found":false,"why":"no-button"}`.
- **`marquee-flip-harness.mjs` (the key harness): 40/40**, unchanged.

The three rows that still pass in that world — `B6b`, `B9c`, `B11` — are the
"nothing changed" rows, which are non-discriminating **alone** and exist beside
`B6a`, `B9b` and `B5b`. Named here rather than counted as evidence.

### ⭐ Three defects the plant found in the harness itself

All three would have shipped green, and two are the "wrong quantity" failure
mode:

1. **`B2d` passed with the buttons deleted.** *"Clicking a disabled button did
   nothing"* is trivially true when there is no button — and the row's own
   ruled-out line pointed at `B2a` as its guard. **A cross-row claim is not a
   guard**: `B2a` failing does not make `B2d` fail. The condition is now in the
   row (`dead.h.found && dead.v.found`).
2. **The run crashed instead of reporting.** With no button, `dead.h.text` was
   `undefined` and row `B3` threw, losing every row after it — reintroducing,
   one line later, the exact failure the locator's `no-button` return exists to
   prevent.
3. **`B5d` (collision) passed on a dead flip.** Its region had no authored
   collision plane, and `flipRegion` of an all-zero rectangle is an all-zero
   rectangle, so the row would have passed on a dead flip, a wrong-axis flip and
   no flip at all. Now gated on the rectangle actually holding a collision shape
   (reported UNMEASURED, not counted, when it does not) and additionally
   requiring the result to differ from the input.

A fourth was found on the first clean run: **`B10` failed on correct output**
because no mousemove had happened since the paste began, so there was no ghost
on the overlay to repaint — the row was measuring *the absence of a ghost*, not
the absence of a repaint. The cursor is now parked on an all-air strip first
(row `B9z`, which asserts the strip exists), and the ghost is hovered over the
**void** so a mirrored ghost cannot coincidentally match the art under it.

### Alternative green-paths ruled out

- **`B2d`** — the click never reaching a button: the row requires the elements
  itself now.
- **`B4`** — a *different* pair of buttons appearing: the visible label is the
  locator and it is unchanged; `B2a` found these same two while disabled.
- **`B5b`/`B5c`** — reverse-only and toggle-only, which both look nearly right
  on tiled art; and a no-op, excluded by `!eq(after, before)`. The expectation
  is computed from masks parsed out of the two **encoders**
  (`packNametableWord`, `packCollisionCell`), never out of `region-flip.ts`,
  the module under test.
- **`B6a`/`B6b`** — many undo steps looking like one: `B6b` requires `canUndo`
  to be **false** after a single Ctrl+Z.
- **`B7`** — a whole-canvas repaint (the changed bbox must sit inside the
  selection, ±1px for the marquee outline) and a dead canvas (`n > 0`).
- **`B10`** — the map canvas moving instead (`map-canvas` keys are excluded and
  are separately required to be 0, and `B9c` requires the map model untouched);
  a canvas that changed size rather than content (`shape-changed` is reported as
  an error, not as a change).

### Environment

`dpr=1`, printed every run; viewport pinned via
`Emulation.setDeviceMetricsOverride({deviceScaleFactor: 1, 1400×872})`. Camera
parked at `(0,0,1)` so one canvas pixel is one world pixel — asserted by `B1b`,
which is what licenses the pixel rows. Every mouse aim is rounded to an
**integer client pixel** and printed (`{"x":783,"y":605} -> {"x":807,"y":629}`).
Map canvas rect `{left:284, top:74, width:876, height:721}`.

---

## 4. Screenshots

`scratchpad/marquee-flip-button/`, captured at scale 3.

| file | shows |
|---|---|
| `panel-disabled.png` | `Snap` / `Layers` / `Flip` stacked, the flip pair greyed out with nothing selected, and the prose still naming the keys below |
| `panel-enabled.png` | the same row live under a standing 2×2-block selection, with the selection preview above it |
| `paste-ghost-flipped.png` | the whole window after the button mirrored a pending paste |

---

## 5. Left open

- **No rotation control**, deliberately (row 83's exclusion).
- The buttons are on the map facet's marquee/paste panel only. The classic
  facet has no marquee, so there is nothing to add there.
- **Nothing here needs the emulator, and none was touched.**
