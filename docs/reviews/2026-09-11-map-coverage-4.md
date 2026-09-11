# map-coverage-4: the rest of the list, and the readout that hid in paste mode

Branch `parcel/map-coverage-4`, from master `c3899d56`.
Code tip `a186e348`. Commits, in order:

| commit | what |
|---|---|
| `0388cb82` | rows: collision Alt propagate, a wide brush, the crossover brush and its half span |
| `b7584108` | rows: a marquee dragged across a section boundary (two-section act) |
| `35ae034a` | rows: the context menu's two actions |
| `1640594a` | test: the paste-mode readout defect, reproduced red on base |
| `9b22d032` | fix: the readout shows and follows the cursor in paste mode |
| `3984cc0f` | rows: paint-block, place-object, place-ring, the X/Y flip keys |
| `a186e348` | rows: F7 aims at the cursor; the hover bar's text on every arm |

This packet and the ledger row follow the code tip and change no code or test.

Continues lens row `MAPVIEWPORT-UNTESTED` (last row `2026-09-11T19:05:47Z`,
packet `docs/reviews/2026-09-11-map-coverage-3.md`). Its WHAT REMAINS was the
worklist. The run was cut off once, at about 21:45Z, by the account's usage
limit; the uncommitted context-menu block it left behind was finished, proven
and committed as `35ae034a`, not dropped.

---

## The headline: one live defect, found where the brief said, and fixed in one call

**PASTE-READOUT-HIDDEN.** In paste mode the coordinate readout (the hover bar)
stayed hidden once the cursor left the map and came back, and it never
followed the cursor at all. `onMouseLeave` hides the bar, and the only line
that showed it again sat at the bottom of `handleMouseMove`, below the paste
branch's `return`. At base the return is at line 3837 and the readout at lines
4011 to 4015 of `src/renderer/components/MapViewport.tsx`; the brief's `:3814`
and `:3993` had drifted, and the tree was read instead.

- **Reproduced red on base** (`1640594a`): the symptom row read `'none'` where
  `'flex'` was expected, and the follow row read `Sec 0 | Tile (3, 3) ...` with
  the cursor at tile (9, 5). Both failures are class ASSERTION.
- **The CONTROL** (outside paste mode, leave and come back) is green before and
  after the fix.
- **The fix** (`9b22d032`): the readout's writer moved, unchanged, out of the
  hover tail into `writeHoverReadout(bar, world)`, which the paste branch now
  calls as well. The diff is +81/-50, nearly all of it the move; the
  behavioural change is the one call. The collision ghost's hover tracking stays
  in the tail, untouched.
- **Proven against the fix:**

| plant | reds |
|---|---|
| MR1: the fix's one call removed | exactly the two paste-mode rows |
| MR2: the writer never sets `display: 'flex'` | CONTROL + both paste rows (these at their premise) |
| MR3: the plain hover never calls the writer | CONTROL + both paste rows (these at their premise) |

Only MR1 reaches the subject of the two paste rows. Under MR2 and MR3 they go
red at the premise that the readout showed before paste mode.

**Not changed, and stated in the fix's docblock:** the drag branches (marquee,
band stamp, paint, object drag, pan) also return above the readout, so during
a drag it freezes, and after leaving and returning mid-drag it stays hidden
until the button comes up. Whether a readout should follow a drag is a
behaviour call, not this parcel's.

No other live defect.

---

## A harness finding, measured by the defect's own first run

The readout CONTROL first went red reading `BG | Pos 28, 28`. The top-level
`beforeEach` resets the tool and the selection, but **not the editing layer**,
so the paste block had been running on the `'bg'` layer left behind by the BG
blocks above it. The paste branch never reads the layer, so none of the
earlier paste rows noticed. The readout block now sets `'fg'` itself. The
top-level reset is not widened here, since that would change the conditions of
rows that do not read the layer; it is named so the next reader who writes a
layer-sensitive row in that block knows.

---

## What is now covered

34 rows, all in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`
(111 to 145). Each drives the component's real handlers over the real stores.

| block | rows | before this parcel |
|---|---|---|
| collision: Alt propagate, brush above 1, crossover brush and half span | 10 | the pure target and span functions |
| the marquee crossing into another section | 3 | one-section rows only |
| the context menu's two actions | 3 | where it opens and how it closes |
| the paste-mode readout (defect + CONTROL) | 3 | nothing |
| paint-block, place-object, place-ring | 4 | nothing |
| the X and Y flip keys on a committed marquee | 4 | the pure transforms; the clipboard half in the paste block |
| F7, play from cursor | 3 | the arithmetic and the chord verdict |
| the hover bar's text on each arm | 4 | nothing |

### Fixture decisions worth knowing

- **A two-section act**, sized from `SECTION_PIXEL_SIZE` (`makeAct1TwoSections`).
  Section 1 has its own FG fill, so a write into the wrong section is a wrong
  value. The marquee, placement and section-readout rows use it: on the old
  one-section act at the origin, "local" and "world" were one number.
- **Placements go through OFFSET and a zoom-2 parked view**, so a forgotten
  offset, zoom or section origin is a wrong point. Every point is a whole pixel,
  so no row asks what `Math.round` does.
- **Expected values come from the rule a module states**, quoted beside each
  derivation: the brush area "centred on the cell", hand-off as "the value that
  leaves the plane", the half span as "one sub-tile column, both of its rows",
  and the flip as the mirrored source cell with its flip bit toggled.
- **One pin, labelled as one:** the order of paint-block's four tiles
  (row-major). No module states it; the only statement is MapViewport's own
  `tileOffset`, so the row pins it as found.
- **The game is not here.** F7's rows replace the aether store's `warp` with a
  recorder and read what F7 asked for. No emulator was touched.

### The three control hazards the brief named

- **Dropped typed-array stores.** The brush-edge row presses at block (0, 1),
  where an unclamped brush writes at sub-tile index `2 * cr * W - 2`, a real
  index in the row above, not a dropped negative one. MH5 (the clamp removed in
  `src/core/collision/collision-paint.ts`) reddens it, with 254 and 255 in the
  painted set.
- **Pan clamps at 0.** The F7 view is parked at (256, 256), and the pan row
  asserts the camera moved before trusting it.
- **Controls parked at a default.** Every section-claim row sets
  `activeSectionIndex` to 7 first, and the placement rows claim section 1, so a
  missing claim is a visible value.

---

## Every one of the 34 rows is red-first proven

Each plant was applied by exact-anchor replacement, refused unless the anchor
occurred exactly once and the planted file equalled HEAD. It was read back from
disk and printed as a line diff before its run, run against the whole file,
and restored byte-identical from HEAD with `git diff` checked quiet. The runner
is a scratch script outside the repo and is not committed. 47 runs: 42 plants
on `MapViewport.tsx`, 2 on the modules it calls (`collision-paint.ts`,
`src/renderer/components/map-flip.ts`), 2 on the test file's fixture, and 1
two-file run. Every one applied, and none was refused.

| # | plant | reds |
|---|---|---|
| MH1 | Alt ignored at the press | ALT, ALT latched |
| MH2 | the move reads live Alt, not the latch | ALT latched |
| MH3 | every press propagates | the new CONTROL, HALF, and 6 map-coverage-3 collision rows |
| MH4 | brush size never reaches the paint | brush N, brush edge |
| MH5 | brush area's left clamp removed (collision-paint.ts) | brush edge |
| MH6 | crossover brush never latched | HAND-OFF, HALF, both halves, crossover latched |
| MH7 | crossover brush read live per cell | crossover latched |
| MH8 | aimed plane id always A | HAND-OFF's plane-B half |
| MH9 | span from the other half of the cell | HALF |
| MH10 | span mode never latched | HALF |
| MH11 | drag cache keyed on the cell, not the span | both halves |
| MH12 | a half mark narrows the geometry too | HALF's geometry half |
| MM1 | marquee move resolves against the cursor's section | the crossing row |
| MM2 | marquee move always measures from section 0 | the section-1 CONTROL |
| MM3 | marquee press records section 0 | the section-1 CONTROL |
| MG7 | Edit tile reads the word transposed | Edit tile |
| MG8 | Edit tile never switches to Art | Edit tile, the Discard half |
| MG9 | switches to Art whatever the door answered | the cancelled-open row only |
| MG10 | Edit tile leaves the menu open | Edit tile |
| MG11 | Edit chunk region origin not floored | Edit chunk region |
| MG12 | region opened without the map's collision | Edit chunk region |
| MR1 to MR3 | the readout fix (table above) | as above |
| MK1 | paint-block origin not snapped | paint-block, its CONTROL |
| MK2 | paint-block tiles column-major | paint-block's pinned order |
| MK3 | paint-block commits an empty change | the paint-block CONTROL |
| MK4 | paint-block does not claim its section | paint-block |
| MO1 | place-object stores the world point | place-object |
| MO2 | place-object drops the subtype | place-object |
| MO3 | place-object always writes section 0 | place-object |
| MO4 | place-ring ignores the pattern | place-ring |
| MO5 | place-ring stores the world point | place-ring |
| MX1 | flip on the other axis | X, Y |
| MX2 | flip does not claim the key | X, Y |
| MX3 | the hoisted chord guard removed | GUARD |
| MX4 | resolveFlip ignores the tool (map-flip.ts) | the other-tool CONTROL |
| MW1 | F7 aims at the pan anchor | hover F7, pan-then-hover F7 |
| MW2 | cold F7 warps to the corner anyway | cold F7 |
| MT1r | FG readout row and column swapped | section-1 readout + the 3 paste readout rows |
| MT2r | BG readout row and column swapped | BG readout |
| MT3r | off-grid readout never written | off-grid readout |
| MT4r | collision readout skips the cell snap | collision readout |
| MT5r | collision readout's path B inverted | collision readout |

**Two fixture guards**, reddened only by test-file plants, because they are
claims about the fixture that no source plant can reach:

- **MT3** makes `plantBlock` silently skip every block at column 5 and beyond.
  The ANTI-VACUOUS guard and both ALT rows go red. **MT3 together with MH3**
  (two files, one run) leaves the new propagate CONTROL **green**. Without the
  guard, that control could not see "every press propagates", because nothing
  else would match. That is the vacuity the guard exists to catch, measured.
- **MT4** leaves the two-section act one section wide. The HARNESS row and the
  section-1 CONTROL go red, and **the crossing row stays green**: its expected
  rect is the same whether or not a second section exists. Only the HARNESS
  row makes it a row about a crossing.

### Rows that could not fail until changed, or failed for the wrong reason

- The readout CONTROL's first run was red for the FIXTURE's reason (the
  inherited `'bg'` layer), not the component's. It was changed to set `'fg'`
  before it was trusted, and it is green on base.
- No row needed a change to become able to fail: every one of the 34 is
  reddened by at least one plant aimed at it.

---

## Suite

| | Test Files | Tests |
|---|---|---|
| base (`c3899d56`) | 604 passed \| 3 skipped (607) | 9083 passed \| 9 skipped (9092) |
| code tip (`a186e348`) | 604 passed \| 3 skipped (607) | 9117 passed \| 9 skipped (9126) |

Both runs exit 0, and the repo's failure-class reporter says "no failures in
this run" on both. `9126 - 9092 = 34`, the rows added. The file count does not
move because every row went into an existing file. `npx tsc --noEmit` exits 0
at base and at the code tip. The base moved from the last row's 9012: parcels
landed in between.

---

## What the tree said that the brief did not

- **Line numbers.** The paste return and the readout were at 3837 and 4011 to
  4015 at base, not `:3814` and `:3993`. The mechanism was as described.
- **The act-identity mount-time clear**, carried in the last row's WHAT REMAINS
  "as a question before it is a row", was already settled before this parcel,
  by the map-remount parcel (`49e36604`, with rows in the paste block). It is
  not a remaining item.
- **"The chunk stamp already has pinned rows from tonight"** is true
  (CHUNK-STAMP-ACROSS-ZONES). Its **link hover** is not among them and remains
  uncovered.

---

## Observations for the overseer, not acted on

- **The collision brush SIZE is read live per cell, while Alt, both planes and
  the crossover brush are latched at the press.** A size change mid-drag changes
  the area for the rest of the stroke (still one undo step). Whether it should
  latch like its neighbours is a behaviour call.
- **paint-block arms `isPaintDragging`, but the move branch only continues
  paint-tile and paint-collision**, so a drag paints one block. Pinned nowhere;
  a behaviour question.
- **The readout freezes during every drag branch** (see the headline).

---

## Still open, and what is foreground-only

**Foreground-only, tagged, not attempted.** No emulator was touched.

- The guide drag, the screen frame's LOCKED-scene arm, and `resolveEscape`'s
  lens arm, all behind the Effects-facet gate (`activeGuideScene()` /
  `inEffectsFacet()`).
- Anything that depends on a pixel or real layout: the paste ghost, the stamp
  ghost, the collision hover preview with its crossover rects, the band preview,
  and whether the hover bar is legible on screen. Every rect in the file is
  declared by the test (`src/test/element-stub.ts`), never measured.
- The warp's landing in the running game (F7's rows read a recorder).

**Reachable and still uncovered in the node suite:**

- The stamp-chunk **link hover** (`setLinkHover`, the Detach target).
- A paint or collision stroke **crossing a section boundary** (`recordPaint`'s
  flush into two commands), now that the two-section fixture exists.
- The three observations above, each once its behaviour is ruled.

**Cannot be a row today, and why:** a place-object or place-ring press off the
grid is guarded twice (`sectionAtWorld` and `getSectionByIndex`), so a plant on
either stays green. F7's "read the act fresh" defence is held twice as well:
the handler already reads the act fresh at its top.
