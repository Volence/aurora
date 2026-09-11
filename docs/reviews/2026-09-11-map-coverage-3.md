# map-coverage-3: the gesture carriers, the override arm, and the rest of the list

Branch `parcel/map-coverage-3`, from master `5361cd67`.
Code tip `1e89eea7` (commits `69b21a03`, `45c6afcc`, `1e89eea7`); this packet and
the ledger row follow it and change no code or test.

Continues lens row `MAPVIEWPORT-UNTESTED` (last row `2026-09-09T09:52:00Z`,
packet `docs/reviews/2026-09-09-map-coverage-2.md`). That row's WHAT REMAINS was
this parcel's worklist, and the tree agreed with it on every item but one (the
guide drag, below).

---

## The headline: no live defect this time, and three places where one line is not what holds a property

The last parcel found a live defect on its first behavioural run. This one did
not, and that is a result, stated as one. The row shape that found it ("a move
after the switch writes into NEITHER", React held back so the act-switch effect
cannot do the row's work) is now pointed at every gesture carrier in the file:
the BG stroke, the FG stroke, the collision stroke, the band stamp and the
marquee. On the band stamp there was no twin of the `isPaintDragging` hole to
find, because that carrier never sets the flag. What could survive a
cancellation there is the gesture REF, and the stale arm clears it. Plant MA1
removes that one line and the NEITHER row is the only row in the file that
sees it.

What the mutations DID find is three properties that no single line holds.
Each was measured by planting the lines one at a time and then together:

| property | plant A alone | plant B alone | both |
|---|---|---|---|
| a refused BG pick or band stamp says so again on the NEXT gesture | MA7a: all 90 green | MA7b: all 90 green | MA7: 3 red |
| a collision press that changes nothing costs no undo entry | MC9: all 90 green | MC9c: all 90 green | MC9b: 1 red |

1. `finishGesture` calls both `endBgStroke` and `endBandStampGesture`, and each
   clears the one shared `bgRefusalShown` flag. Either reset alone keeps the
   property.
2. `paintCollisionCell` returns on an empty entry list, and `endPaintStroke`
   returns on an empty stroke. Either guard alone keeps the property.

Neither is a defect. Both are stated so nobody reads either line as
load-bearing on its own, and so a later parcel that removes one of them as
redundant knows the other is now the only thing left.

The third is the frame gate: `screenFrameShown()` planted to answer `true`
(MF6) reddened TEN rows across four blocks, not just the hidden-frame row. The
frame's default anchor is the world origin, and those rows press within its
six-pixel grab distance of the map's top-left. The gate is what stops a hidden
frame from eating every press in that corner, and nothing named that before.

---

## What is now covered

41 rows, all in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`
(49 to 90). Every row drives the component's real handlers over the real stores.

| block | rows | what it had before |
|---|---|---|
| the band stamp, the sixth gesture carrier | 7 | the pure machine over a fake plane, and a scan for its witness ref |
| the BG OVERRIDE arm of `paintBgTile`: out-of-blob refusal and its toast | 5 | nothing (map-coverage-2 built the `act` arm) |
| collision paint, including both planes | 8 | nothing |
| the marquee drag and its snap | 7 | the pure snap functions |
| paste mode | 5 | the pure paste functions, and the Escape verdict |
| the screen frame's drag (unlocked arm) | 5 | the pure hit test and drag arithmetic |
| the context menu | 4 | nothing |

And worklist item 4: `map-escape.test.ts`'s header no longer says the Escape
branch "is inside a React effect the node suite cannot reach". It now says what
that file pins (the verdict), where the act is pinned, and which arm is still
not driven (`lens`, behind `inEffectsFacet()`).

### Fixture decisions worth knowing

- **The override is bound to ONE act.** `resolveDisplayedBg` shows the override
  only on the act whose `stripPath` is aeon's output directory
  (`actBindsBgOverride`). The fixture binds act1 and leaves act2 unbound, so an
  act switch moves the displayed background from `override` to `act`: the event
  both override gestures have to survive.
- **The canvas mirror is read from `sectionRenderer.getBg()`, never through
  `bgOverrideDisplay`.** That function re-syncs the mirror FROM the document on
  every call, so reading through it would erase the exact divergence the rows
  about "the file and the canvas agree" exist to see.
- **The out-of-blob bound is tested on both sides.** The control paints
  `OV_TILES - 1`, the last legal pick; the refusal picks `OV_TILES`, the first
  illegal one. MB1 (`>` for `>=`) reddens three rows. A refusal row picking far
  past the end would have passed it.
- **Both collision planes are sized from `SECTION_PLANE_WORDS`**, for the reason
  the nametable already is: an out-of-range typed-array store is dropped, not
  thrown. Fills are per act AND per plane, so a wrong-act or wrong-plane write is
  a wrong value, not only a wrong array.
- **Every paste hover is on an ODD tile**, so the snap is doing work.
- **The screen-frame view is parked off its defaults** (zoom 2, camera off 0), so
  a drag that ignored the zoom or measured from the origin is a wrong number.

---

## Two harness findings, measured before they were fixed

**1. Every earlier row ran at a rect whose origin IS the client origin.**
`mountMap` took no rect, and `VIEWPORT` sits at (0,0). There, a client coordinate
and a container-local one are the same number, so every `clientX - rect.left` in
the component was invisible to all 49 rows that existed. `mountMap` now takes a
rect, and the frame and menu blocks use `OFFSET` (100, 40). MF4 (the press hit
test forgetting the canvas offset) and MG1 (the menu placed in client space) are
the plants that need it, and both are red only because of it.

**2. Paste mode was dropped by the mount, and that hid a second failure.**
The paste rows first went red as ASSERTION, because they armed paste mode before
the map mounted. The effect that clears the marquee and paste mode on an act
switch is keyed on the open zone and act, and like every effect it also runs on
the first render. Armed after the mount, the rows then died as
`ReferenceError: document is not defined`: with paste armed, the preview pass
rasterises a ghost through `regionPreviewCanvas`
(`src/renderer/canvas/region-preview.ts`), which calls
`document.createElement('canvas')`. The ASSERTION reds had hidden that, since
paste mode was never armed. The fix is a `document` stub scoped to the paste
block only. It serves that one call, throws on any other tag, refuses to shadow
a real `document` and is removed exactly. It is NOT added to
`src/test/window-stub.ts`, whose header refuses to grow into a DOM. No row
asserts on the ghost's pixels.

---

## Every one of the 41 rows is red-first proven

Each plant was applied by exact-anchor replacement (refused unless the anchor
occurred exactly once), read back from disk and printed as a line diff before
its run, run against the whole file, and then restored byte-identical from the
committed baseline. `git status` was clean after every batch. 52 plants: 50 on
`src/renderer/components/MapViewport.tsx`, 2 on the test file. Every one applied.

**Band stamp and override arm** (13 plants, recorded in `45c6afcc`'s message):
MA1 to MA7, MB1 to MB4, and the MA7a/MA7b singles above. Every one of the 12
rows is reddened by at least one.

**Collision, marquee, paste, frame, menu** (37 plants on the source):

| # | plant | reds |
|---|---|---|
| MC1 | both-planes mode read live, not latched | 1 (latch) |
| MC2 | revert skips the other plane's entries | 1 (act switch) |
| MC3 | press-time section claim removed | 1 (no-op claim) |
| MC4 | other plane recorded, never written live | 3 |
| MC5 | aimed plane ignored | 1 |
| MC6 | collision stroke commits per cell | 4 |
| MC7 | stale arm leaves `isPaintDragging` armed | 2 (NEITHER, on both carriers) |
| MC8 | brush paints a shape one off the pick | 2 (incl. HARNESS) |
| MC9 / MC9c / MC9b | empty guards, singly and together | 0 / 0 / 1 |
| MD1 | rect resolved from the cursor, not the start | 4 |
| MD2 | invert never reaches the granularity | 3 |
| MD3 | move ignores the pointer's modifier bit | 1 |
| MD4 | Ctrl tap flips the flag without re-snapping | 2 |
| MD5 | blur does not un-stick the modifier | 1 |
| MD6 | marquee stale arm keeps the drag | 1 |
| MD7 | act-identity effect clears nothing | 1 |
| ME1 | paste hover not snapped | 2 |
| ME2 | a paste click exits paste mode | 1 |
| ME3 | clipboard's own grid ignored | 1 |
| ME4 | Shift refusal silent | 1 |
| ME5 | Alt and Shift swapped | 2 |
| ME6 | paste branch swallows the middle-drag pan (the owner's 2026-08-28 report) | 1 |
| ME7 | one-click modifier rewrites the sticky layers | 1 |
| MF1 | frame never hit-tests | 2 |
| MF2 | store written on every move | 1 |
| MF3 | drag measured from the world origin | 1 |
| MF4 | hit test forgets the canvas offset | 2 |
| MF5 | frame grabs its interior | 1 |
| MF6 | hidden frame still hit-tests | 10 (see headline) |
| MF7 | release never writes the store | 1 |
| MG1 | menu placed in client space | 1 |
| MG2 | right button falls through to the tool | 1 |
| MG3 | browser menu suppressed only after the BG gate | 1 |
| MG4 | BG gate removed | 1 |
| MG5 | click-away not wired | 1 |
| MG6 | menu Escape loses its sprite-tab guard | 1 |

**Two fixture guards**, reddened only by test-file plants, because they are
claims about the fixture and no source plant can reach them:

- MT1 moves the marquee corners to (2,2)-(3,3), where block and tile snapping
  agree. The ANTI-VACUOUS row goes red, and **every Ctrl, tap and blur row stays
  green**. That is the vacuity the guard exists to catch, measured: without it
  those rows would pass with the modifier doing nothing at all.
- MT2 moves the frame's INSIDE point to within the grab distance of its edge.
  The guard and the interior CONTROL row go red.

### Rows that could not be reddened by the single plant aimed at them

Stated rather than folded into a clean 41/41:

1. The two "says it again on the NEXT gesture" rows: only MA7 (both resets)
   reddens them. See the headline.
2. The depth half of "a press claims its section even when it changes nothing,
   and costs no undo entry": only MC9b (both guards) reddens it. Its section
   half is reddened by MC3 alone.
3. The context menu's "suppressed even where this one does not open" row: MG3
   and MG4 both redden its BG half. **Its off-grid half has no plant of its
   own.**

---

## Suite

| | Test Files | Tests |
|---|---|---|
| before (`5361cd67`) | 600 passed \| 3 skipped (603) | 8962 passed \| 9 skipped (8971) |
| after (`1e89eea7`) | 600 passed \| 3 skipped (603) | 9003 passed \| 9 skipped (9012) |

Both runs exit 0, and the repo's failure-class reporter says "no failures in
this run" on both. `9012 - 8971 = 41`, the number of rows added; the file count
does not move because every row went into an existing file. `npx tsc --noEmit`
exits 0.

---

## An observation for the overseer, not acted on

The act-identity effect's comment says it clears the marquee and paste mode
"only ... on an actual act/zone switch, not on every command". It also runs on
the component's FIRST render, which the paste rows measured. So any remount
drops an armed paste and a committed marquee, and a facet switch is a remount
(`LevelWorkspace` renders the facet's module as the canvas). Whether a marquee
should survive a facet round-trip is a behaviour call. It changes what a gesture
does, so it is not this parcel's to make.

---

## Still open, and what is foreground-only

**Foreground-only, tagged, not attempted.** No emulator was touched.

- **The guide drag.** The brief listed it as reachable. The tree says otherwise
  by the brief's own rule: `activeGuideScene()` returns null unless
  `facetFor(activeId)` is the Effects facet, the same predicate
  `inEffectsFacet()` spells, and anything behind that predicate is
  foreground-only here. It IS a store read, not a pixel, so lifting the rule for
  it would be cheap; that is the overseer's call, not mine.
- **The screen frame's LOCKED-scene arm**, where the frame's Y is a scene's
  `v_offset` and the drag commits a document edit. Same gate.
- `resolveEscape`'s `lens` arm. Same gate.
- Anything that depends on a pixel or real layout: the paste ghost, the stamp
  ghost, the collision hover preview, the band preview. Every rect in the file is
  declared by the test, never measured by a browser.

**Reachable and still uncovered in the node suite:**

- Collision: Alt's propagate-to-matching-blocks, brush size above 1, the
  crossover brush and its half-cell span.
- The marquee resolving against its START section when the cursor crosses into
  another. The fixture is a one-section act, so this needs a two-section grid.
- The context menu's two actions (they open an Art document and switch facet).
- Stamp-chunk and its link hover, paint-block, place-object and place-ring, the
  flip keys, F7's warp, the hover bar's text.
- The act-identity effect's mount-time clear (above), as a question before it is
  a row.
