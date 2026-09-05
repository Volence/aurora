# `plane_y` gets something an author can see and something the editor can check

**Branch** `parcel/plane-y-referent` - 2026-09-05

The closing finding of `docs/reviews/2026-09-05-rowremap-author.md` (section 6
item 3): *"`plane_y` has no help beyond its range. The box refuses past 511 and
says why, but nothing anywhere relates the number to the strip, to the anchored
split, or to the art."* Two commits, either revertible alone.

Headline, three parts:

1. **THE REFERENT HAD A SURFACE TO LIVE ON, and it is the ordinary map canvas.**
   `SectionRenderer.renderBg` blits Plane B at world (0,0), so plane row P is map
   world Y P. A white dashed rule at that world Y sits on exactly the row of the
   author's own background art the field names, in both scene spaces, with no
   camera term and no lock test. Captured on a running app:
   `docs/captures/2026-09-05-plane-y/02-rule-on-bg-art.png`, and the same screen
   without it in `01-before-no-rule.png`.
2. **THE CHECK IS `n = min(|p|, span/2)`, and it is restricted to LOCKED
   scenes**, which is named on screen rather than left as silence. Two of the
   dispatch's claims moved under re-derivation: it is the LINE COUNT that caps
   and not the ladder row, and the cap is the PROTECTION rather than the fault.
3. **A pixel measurement, not a screenshot.** 21/21 harness rows, including a
   near-white count on the row the app's own publish names: **0 to 546** on that
   row, **0 above and 0 below** it, against a before-shot of the same screen.

---

## 1. The engine, re-derived rather than relayed

Read at aeon `a2bb59043918dd5ef81a7566aad7b358b17c5971` through git objects
(`git show <rev>:path`); the live aeon working tree was never read as files and
never written. A `git clone --no-hardlinks` pinned to that revision, under the
session scratchpad, is what the capture opened.

### `plane_y` is a row of the BG art. aeon says so in its own words

`engine/level/parallax.emp:391-393`:

```
//   brm_plane_y    the BG PLANE LINE at which this layer's art paints the surface the
//                  effect is about. Half of the perspective quantity: the BG's image of
//                  that surface is at screen line `brm_plane_y - Vscroll_BG`.
```

and the use, at `:3697-3698`:

```
        move.w  band_remap_plane_y(a1), d0
        sub.w   Parallax_Current_Vscroll_BG, d0     // BG image: plane line -> screen line
```

**The SCREEN line has a per-frame term; the PLANE line does not.** That is the
whole reason this rule can be drawn at author time at all, and the reason it is
drawn on the art rather than inside the screen frame: the camera preview models
`plane_y - Vscroll_BG`, which is a different quantity.

### The two facts the check is built from

`:3714-3721`, H and the clamp on `|p|`:

```
        move.b  band_remap_hshift(a1), d3           // H = 1 << d3
        moveq   #1, d2
        lsl.w   d3, d2                              // d2 = H
        move.w  d2, d1
        subq.w  #1, d1                              // d1 = H - 1
        cmp.w   d1, d0
        bls     .remap_clamped
        move.w  d1, d0                              // clamp |p| into the ladder
```

`:3753-3757`, the span, halved, as the second operand of a min:

```
        move.w  Parallax_Remap_State+6, d2          // the band's end screen line
        sub.w   Parallax_Remap_State+4, d2          // ...minus its top = its line span
        lsr.w   #1, d2
        beq     .remap_none                         // a band under 2 lines cannot remap
        cmp.w   d2, d0
        bls     .remap_have_n
        move.w  d2, d0                              // n = span/2
```

So `n = min(|p| capped at H-1, floor(span/2))`, and:

- **A.** `floor(span/2) == 0` (span under 2): the `beq` takes `.remap_none`. The
  effect does nothing, at every camera position.
- **B.** `floor(span/2) < H-1`: the min saturates on the span term before `|p|`
  can reach its own ceiling.

### ⚠ TWO CORRECTIONS TO THE SHAPE I WAS HANDED

Both found by reading past the lines I was pointed at, and both change what the
sentence an author reads may claim.

**(a) It is the LINE COUNT that caps, not the ladder ROW.** The dispatch's
wording was *"the upper ladder rows are unreachable"*. The ladder row is computed
and published at `:3730-3737`, **before** the equilibrium `beq` and before the
min, and parallax.emp says so in a banner of its own: *"THE ROW IS COMPUTED
BEFORE THE EQUILIBRIUM EARLY-OUT ... row H IS the uncompressed surface, and it
still has to reach VRAM the first time it is selected."* `Waterline_Art_Row` is
the ART half's only input and it is unaffected by the span. So the ladder's rows
DO sweep their whole range and the art DOES compress; it is the SCROLL half whose
line count saturates. A sentence claiming otherwise would be a true statement
about the wrong half, and this repo has the precedent on file
([[correct-comment-one-quantity-over]]).

**(b) The cap is the PROTECTION, not the fault.** aeon at `:3746-3752`: the
ladder is generated with `i <= entry[i] <= 2i`, so a run of n lines reads as far
as slot `2n-2`, and *"capping n at span/2 is what keeps every read inside THIS
band's own longwords; without it a tall |p| over a short band would fetch the
NEXT band's scroll words and paint them into this one, which looks like a
plausible effect and is not one."* The overrun the dispatch quoted as the reason
this is worth checking is the thing the cap PREVENTS. The author's symptom is
therefore a **clipped** effect, not a garbled one, and the rendered sentence says
"clipped rather than broken" so nobody goes hunting a corruption the engine
already rules out.

---

## 2. The referent: where it lives, and the two quantities it is not

`surfaceGeometry` / `drawSurfaceMarks` in
`src/renderer/canvas/effects-guides.ts`, drawn from `MapViewport` after the layer
guides and published into `GuideReport.surfaces`.

**Why world Y is the plane row, in both spaces, with no lock test.** The layer
guides needed a whole correction block to establish their origin, because a
layer top means different things on a locked and an unlocked scene. This rule
needs none: `renderBg` composites the plane at (0,0) unconditionally, so the fact
is about how the MAP draws Plane B and not about a scene's vertical mapping.

Two quantities are deliberately not folded in, and each would have looked right:

| would have looked right | why it is wrong | what catches it |
|---|---|---|
| the LAYER TOP | the rowRemap parcel SEEDS `plane_y` from the strip's own top, so on a fresh document the two coincide | a named row, plus a poison run below |
| `v_offset` | that is where the SCREEN sits on the plane; this is a row OF the plane. Subtracting it welds the waterline to the view box, which is exactly the trap row 65 fell into one axis over | `surfaceGeometry` is not handed the scene, so the term is unpassable rather than unused; a row asserts the arity and that the parameter list does not mention a scene |

**Not draggable.** `guideAtCanvasY` is untouched, so a cursor near a coincident
pair still grabs the layer top and nothing else. A referent an author aims at is
not a handle, and making it one would put two draggable lines on one pixel row.

**Drawn AFTER the guides**, for the same seeding reason: drawn first it would be
the half that disappears on the one scene most likely to be opened.

**White, and not a fourth cyan.** The cyan family already carries three degrees
of one axis (enabled / disabled / active) and the refusal red is the categorical
escape from it. A fourth cyan reads as a fourth degree. White is unclaimed at
this weight (the tile grid is a thin 8-px lattice, never a labelled full-width
rule) and it is what a surface line reads as. A dark casing is stroked under it
so it survives OJZ's bright water tiles, which is the art this key is for.

---

## 3. The check, and the restriction I could not remove

`src/renderer/canvas/row-remap-span.ts`. It sits beside `bg-wrap.ts`, which is
the precedent: a module under `canvas/` that draws nothing, imports
`planeVscroll` from `camera-preview` and `layerTopSpace` from the provider, and
exports advisory sentences the panel renders.

**Step 4a is NOT re-transcribed.** `rebasePlaneTopsToScreen` and `planeVscroll`
already are, in `camera-preview.ts`, and the reason that module split its
geometry out is precisely so a second reader does not write a second copy of the
engine's rotation.

### The restriction: LOCKED scenes only, and why

`span` is a SCREEN-line extent. Step 4a rebases plane tops against the current
`Vscroll_BG` every frame (`parallax.emp:1990-2008`): the band containing
`vs` is forced to screen row 0 whatever its top was, the rest are `top - vs`
with a wrap past the plane bottom and a clamp at 224, and the last band in SCREEN
order ends at 224.

- **LOCKED** (`v_factor == 15`): `Vscroll_BG` IS `v_offset`, a scene constant
  (`.v_locked`, and `planeVscroll` does not read `camY` on that arm at all). Every
  term is on the document.
- **UNLOCKED**: `Vscroll_BG` follows the camera. It is not only the band ORDER
  that moves: the band forced to row 0 changes, the band that runs to 224
  changes, and a band rotated past the bottom clamps to a span of zero. **No
  band has a camera-independent span**, so there is nothing to check, and picking
  a camera would report one camera's answer as if it were every camera's.

⚠ **`rowRemapSpanRestriction` is a SEPARATE function from the advisory and the
panel renders it as its own note.** "The check found nothing" and "the check did
not run" are the same silence otherwise, which is how a partial check earns trust
it has not got ([[partial-coverage-beats-none-at-hiding]]).

### The span is an UPPER BOUND even locked, and that is the safe direction

Step 4b splits the band containing the anchored line, copying the whole record,
and last-wins marks the LOWER half (`parallax.emp:3085-3096`). So the runtime
span is **at most** the one computed here. A refusal derived from an upper bound
only gets more true when the real number is smaller. A **clearance** derived from
one would not, which is the second reason there is none.

### The wording, and why it states no clearance

> 28 screen lines from this band's top to the next layer's top, and the remap
> moves at most half of them: 14. height_shift 4's ladder steps down to 15 lines,
> so 1 step is out of reach at every camera position. The cap is what keeps the
> remap reading inside this band, so the result is clipped rather than broken.
> Make the band taller, or lower height_shift.

- It names the SPAN, the CAP, the ladder's depth and the SHORTFALL, all four
  computed from the engine's two lines rather than typed.
- It says **clipped rather than broken**, which is correction (b) above.
- It ends on the two edits that change the number, and neither of them is
  "check whether the effect is right", because that is not a question this
  module can answer.
- **The quiet arm returns `null`.** `floor(span/2) >= H-1` means ONE failure is
  absent out of a list that includes whether the camera travels vertically here
  at all (nobody can check that), whether `plane_y` is on the waterline (only the
  author can), and whether the anchored split leaves the lower half tall enough
  (a runtime quantity). A row reads the module's own string literals and fails on
  any of `ok|fine|good|correct|valid|passes|clear`, so it cannot acquire a
  reassuring sentence later.

### ⚠ ADVICE, NOT PREVENTION

aeon's generator accepts these documents today and has separately booked adding
the refusal at its end. A control that refused what the generator accepts is a
bound Aurora invented, and an author who opened a hand-authored scene could not
see their own file. Two rows hold it, and one of them is measured **on the scene
the advisory fires on**:

- node: every height option is present and `rowRemapHeightShiftRefusal` returns
  null for every one, on a scene whose reach sentence is non-null; plus a census
  asserting a warned value is never also a refused one.
- app: `[7a]` reads the picker's options off the live DOM with the sentence on
  screen: `[{"v":"3","disabled":false} ... {"v":"7","disabled":false}]`.

---

## 4. Gates: red first, with the mutation shown applied

### The referent line

Source restored from the **committed** blob (`git stash push` of exactly the two
implementation files), and the baseline quoted from disk before the run:

```
$ grep -c "surfaceGeometry" src/renderer/canvas/effects-guides.ts
0
$ grep -c "EFFECTS_SURFACE_LINE" src/renderer/canvas/canvas-colors.ts
0
```

Runner `npx vitest run src/renderer/canvas/__tests__/effects-guides.test.ts`:

| | |
|---|---|
| BEFORE (committed source, new rows) | **10 failed / 28 passed (38)** |
| AFTER (fix restored) | **38 passed (38)** |

⚠ **That red is an ABSENCE red** (`surfaceCaption is not a function`), which only
proves the function is missing. So it is backed by a **plausible** one: the
geometry computing `worldYToCanvasY(layers[i].world_y, ...)`, which is the mistake
the seed invites and which draws a line that looks entirely reasonable:

| | |
|---|---|
| POISONED (layer top instead of plane row) | **3 failed / 35 passed (38)** |

the three being the plane-row row, the shared-transform census, and the row named
IS NOT THE LAYER TOP.

### The check

The module is new, so absence is the committed baseline. Three plausible poisons,
each a thing a careful person would write. Runner `npx vitest run
src/renderer/canvas/__tests__/row-remap-span.test.ts`:

| poison | result |
|---|---|
| `reach < H` instead of `reach < H - 1` | **1 failed / 15 passed (16)** |
| span as the raw top difference, skipping Step 4a | **1 failed / 15 passed (16)** |
| the lock restriction dropped, unlocked scenes answered anyway | **2 failed / 14 passed (16)** |
| (restored) | **16 passed (16)** |

**Anti-vacuity.** The main row is a CENSUS over every legal shift crossed with
every band height 1..224, with the verdict derived from the engine's two lines
independently of the function under test, and it asserts that **both** the firing
and the silent state occur. The `.remap_none` boundary is asserted from both
sides (span 0 and 1 fire "does nothing"; span 2 does not and is capped at 1
instead), and the singular/plural boundary at a one-step shortfall is asserted
because the census walks past it without reading it.

---

## 5. The app, driven: 21/21, and the numbers

`npm run harness:plane-y-referent`, registered in `package.json` in the same
commit as the file. Run root printed and refused on borrowed:

```
root: <this worktree>
      pinned: AURORA_BUILT_TREE=<this worktree>
```

**⚠ NO EMULATOR, NO ROM BUILD, NO SAVE.** Nothing here touched an Aether socket
or pressed Build and Run. The scene edits live in the app's memory; the run needs
a project only to have BG ART to draw on. `AEON_DIR` is still refused if it names
the live aeon checkout, because "never saves" is a property of that file today
and not of the application.

| row | what it measured |
|---|---|
| `[2b]` | **no** surface rule before the remap is authored, so the finding is a delta |
| `[3a]`-`[3c]` | the panel's own controls turned the remap on and typed `plane_y`; the DOCUMENT THE APP HOLDS carries `{"plane_y":96,"height_shift":4}` |
| `[4a]`-`[4c]` | the repaint PUBLISHED one rule at index 2, plane row 96, canvas y 192; `paints` 7 to 9; the published row equals the plane row through the guides' transform |
| `[4d]` | **near-white pixels on that row: 0 to 546** |
| `[4e]` | **0 above and 0 below** it, 24px away, so it is a line and not a wash |
| `[5a]` | a 32-line band with a 16-line ladder earns NO sentence, and that silence is asserted |
| `[6a]`-`[6c]` | the top moved to 84 (a 28-line band) and the sentence appeared, naming 28 lines and a cap of 14, with no reassuring word in it |
| `[7a]` | every height option still `disabled: false`, with the sentence on screen |
| `[8a]` | the rule did **not** follow the top: still plane row 96 at canvas y 192 while L2 sits at 84 |

⚠ **The sampled row comes from the app's own publish**, not from `PLANE_Y * ZOOM`.
A disagreement between them is the finding, so `[4c]` prints both.

### ⚠ A ROW I HAD TO REWRITE, AND THE REWRITE IS THE FINDING

The first version of `[6d]` asserted the sentence FITS the box it renders in. It
failed at 163.5px in a 149.5px scroller, and the obvious reading was that my
sentence was too long. It was too long, and shortening it (from 470 chars to 355)
was right. But the row was still wrong, because the measurement it forced me to
take says this:

```
sentence 163.5px / 355 chars
precondition hints [{"h":163.5,"chars":334}, {"h":81,"chars":164}]
scroller 149.47px
```

**The advisory already on that row is the same height and also does not fit.**
The layer cards sit in a ~150px box (column-layout's LIST floor) and no advisory
of this length fits it. Holding a new sentence to a bar its own neighbours miss
would have reported a panel-wide layout property as this parcel's defect. So the
row is now a COMPARISON ("no taller than the advisories already there") and the
box is recorded below as an open item rather than silently absorbed.

Two smaller traps caught in the same place, both worth the words:

- **The peers' heights were equal to the pixel at first** (163.5 and 163.5),
  which is the shape of a selector that resolved to one element twice. The row
  now prints each peer's CHARACTER COUNT beside its height; 334 and 164 chars at
  163.5px and 81px is a consistent pair, so the equality was a coincidence of
  near-equal texts and not a duplicate.
- **`scrollIntoView({block:'center'})` on an element TALLER than its box puts the
  top ABOVE the box** - the one position from which an author cannot begin
  reading. `block: 'start'` is what a reachability row wants.

And one selector trap, caught before it could ruin the capture: `/plane/i` over
the number inputs' titles matches the layer TOP box too, because a locked scene's
top box says *"a plane line, so the scene is locked"* and it comes first in the
DOM. A loose predicate would have typed `plane_y` into `world_y` and the whole
capture would have been a picture of a moved layer.

---

## 6. Aurora suite

`npm test`, whole chain, rc=0, measured in this worktree:

```
Test Files  510 passed | 3 skipped (513)
Tests       7386 passed | 9 skipped (7395)     0 failed
tsc --noEmit: clean
check-test-collection:     513 test-shaped files on disk, all 513 collected
check-peer-path-literals:  OK - 1326 files, 5 rules, all 5 fired on the canaries
check-cited-paths:         OK - 2077 citations, both rules fired on their canaries
check-ledger-timestamps:   OK - 17 canary cases, both directions of the ratchet
check-pseudo-skip / check-object-stringify / check-tsx-dashes /
check-python-resolver / check-harness-guards / skip-report: OK
```

**The delta, attributed.** The dispatch quotes master as `7361 / 8` in a main
checkout, i.e. **`7360 / 9` in a linked worktree** (`test/support/
sibling-root.test.ts`'s step-3 row skips by design there and is self-diagnosing
in the skip report). This run stands in a linked worktree, so:

```
7386 - 7360 = +26
  +10  src/renderer/canvas/__tests__/effects-guides.test.ts   (28 -> 38 rows)
  +16  src/renderer/canvas/__tests__/row-remap-span.test.ts   (new file)
  ---
   26  accounted for, with nothing left over
```

One new test FILE, so the file count is master's + 1.

### ⚠ A GATE CAUGHT SOMETHING, AND IT WAS RIGHT TO

`test/renderer/no-raw-hex.test.ts` regexes `#[0-9a-fA-F]{3,6}` over WHOLE FILES,
comments included. Two comments quoting the 68000 immediate `move.w #224, d5`
read as three-digit hex colours, took the guardrail from **0 to 2**, and took the
suite red. The gate is right about its mechanism and over-broad in extent, and
this parcel **reworded rather than widening someone else's ratchet**: a `MAX_RAW_HEX`
raised to absorb a comment is a ratchet that has stopped ratcheting. Worth knowing
for any future parcel quoting 68000 immediates in a `src/renderer` comment: `#224`,
`#$FF0`, `#128` and friends all match.

---

## 7. Still owed

1. **RUNTIME CONFIRMATION IS TAGGED, NOT ATTEMPTED.** Nothing here ran under the
   emulator. Whether `plane_y 96` is on OJZ's waterline is a question for the
   author looking at the rule, and whether the remap then LOOKS like water needs a
   foreground drive.
2. **THE LAYER CARDS' SCROLLER IS TOO SHORT FOR ANY OF THEIR ADVISORIES.**
   Measured this run: a ~149px box against a 163.5px reach sentence and a 163.5px
   precondition hint. Every one of these sentences is read by scrolling inside a
   scroller. That is a panel-layout parcel and not this one, but it is now a
   number rather than an impression.
3. **THE UNLOCKED CASE IS UNCHECKED, BY CONSTRUCTION**, and the panel says so.
   If a future parcel wants it, the honest shape is not an author-time span but a
   camera SWEEP: the minimum span over the camera range the act permits, which is
   a different and much larger measurement.
4. **`plane_y` STILL HAS NO RELATION TO THE ANCHORED SPLIT.** The split line is a
   runtime quantity (`Effects_Screen_L[ch]`) and neither the referent nor the
   check touches it. The remap's magnitude `|p|` is the distance between the two,
   so nothing here says anything about how FAR the effect will move, only about
   how far it CAN.
5. **TWO EM DASHES LANDED IN THE REFERENT COMMIT** (`canvas-colors.ts`) and were
   corrected in the third. The scan (`grep -nP '[\x{2013}\x{2014}]'`) was tested
   against a deliberate violation first, which is the only reason it was caught:
   the earlier version of this check ran only over the commit MESSAGE, and the
   message was clean while the diff was not.
