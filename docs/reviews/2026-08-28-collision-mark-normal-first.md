# The collision mark leads with the OUT direction

**Branch** `feat/collision-mark-normal-first` · **Date** 2026-08-28 · **ROADMAP** §5.1 row 84
**Predecessor** `docs/reviews/2026-08-28-collision-legibility.md` (row 73) — read §3 of it before
changing anything here.

The owner's second report on the same mark, hours after the first parcel landed:

> "I still think the collision direction arrows in the preview may be kind of
>  useless? Also why are the 0 degree ones not pointing straight up lol"

---

## 1. THE GEOMETRY WAS ALREADY CORRECT. DO NOT GO LOOKING FOR A MATHS BUG.

This is the single most important sentence in the packet, because the report
reads exactly like a sign error and it is not one.

Reproducing the module's own formulas (`scratchpad/verify-geom.mjs`, and
re-derived inside the test file so the claim is a test and not a note):

| byte | `angleTangent` | `outwardNormal(·, h ≥ 0)` |
|---|---|---|
| `$00` | (1.000, 0.000) | **(0.000, −1.000)** — exactly straight up |
| `$08` | (0.981, 0.195) | (0.195, −0.981) |
| `$10` | (0.924, 0.383) | (0.383, −0.924) |
| `$20` | (0.707, 0.707) | (0.707, −0.707) |
| `$e0` | (0.707, −0.707) | (−0.707, −0.707) |

At angle 0 the outward normal *is* straight up, to the last bit. Nothing in this
parcel changes `angleTangent`, `outwardNormalFromTangent`, `surfaceAnchor` or
`columnSurfaceY`, and the 254-byte sweeps that pin them are untouched and green.

**The defect was the visual hierarchy.** The mark led with a prominent tangent
bar (9 cell-local px) and hung a barb off it that was 4 cell-local px — *shorter
than each half of the bar*, i.e. the smallest thing in the picture. What an
author reads a collision cell for is **which way is out**, and that was the
quiet element. At a 28px picker thumbnail it was a few pixels beside a bold
horizontal stroke.

So both halves of the report are one complaint, and the answer is one change:
**swap the weights.** At angle 0 he sees a bold horizontal stroke and nothing
saying "up", so a mark that is arithmetically right reads as broken.

---

## 2. What was built

### The mark, re-weighted

| | before | after |
|---|---|---|
| outward element | barb, `BARB_LEN` 4 cell px, caller's width | **stem, `NORMAL_LEN` 6.5 cell px, `ARROW_WIDTH_SCALE` (1.6) × the caller's width** |
| tangent element | bar, `BAR_HALF` 4.5 (9 total), caller's width | bar, `BAR_HALF` **4.5, unchanged**, caller's width unchanged |
| stroke passes | one path, casing then core | **all casings, then all cores** (4 strokes at detail, 2 at compact) |

`BAR_HALF` is deliberately untouched. The bar's *length* is what carries the
precise angle (see §3), so shortening it to make the stem look bigger would buy
legibility with the information the bar exists for. Likewise the tangent's
stroke widths are untouched: the previous parcel measured the visible casing
band at **0.875 screen px per side**, already sub-pixel, and anything thinner
stops rendering as a cased stroke at all. **Emphasis is added to the loud
element, never subtracted from the quiet one.**

The stroke order changed because the two elements now carry different widths and
so cannot share one path. Per-element casing-then-core would let the stem's fat
casing chew a dark notch out of the thin bar core exactly where they cross.

### The size rule, in the module, derived

`markTier(cellScreenPx)` → `'off' | 'compact' | 'detail'`. Every call site now
passes the screen px its 16px cell occupies and is *told* what to draw:

| surface | `cellScreenPx` | tier |
|---|---|---|
| aeon map overlay | `16 * zoom` | any |
| classic map overlay | `zoomScale * 16` | any |
| paint ghost | `16 * zoom` | any |
| picker thumbnail | its box size (~20) | compact |
| picker big preview | its box size (66) | detail |
| legend swatch | **the MAP's `16 * zoom`** | follows the map |

`DETAIL_CELL_PX` is **not chosen**:

```
silhouette-blind band = atan(1/16) = 3.5763°     (16 integer column heights,
                                                  1px of rise across the cell)
the bar earns its ink only if its endpoint moves >= 1 screen px across it:
    BAR_HALF * cellPx/16 * sin(band) >= 1
    cellPx >= 16 / (4.5 * sin(atan(1/16))) = 56.9999...   ->  57
```

Below 57 screen px per cell the bar is a stroke whose slope no viewer can read
against the silhouette it lies on — ink that cannot deliver its own quantity,
which is this parcel's defect at the other end. A 22px thumbnail is far under
(its bar moves 0.3px across the *whole* blind band); the big preview and the map
at the owner's working zoom (z4 = 64px/cell) are over.

The threshold is asserted in the test file by **re-deriving it**, plus the
sharpness rows `swing(DETAIL_CELL_PX) >= 1` and `swing(DETAIL_CELL_PX − 1) < 1`.

⚠ This is a **demotion rule, not permission to drop the tangent for looks**. The
detail tier always draws both.

### The wall stays honest, and had to get louder

A small barb pointing at an arbitrary wall side was a small lie; a bold arrow
pointing at one is not. So:

- `outwardNormalFromTangent` now returns `known`, out of **the same test** that
  decides the negation (`|ny| > VERTICAL_EPS`). Two independent tests would be
  two chances for the drawn mark and its honesty flag to disagree.
- `AngleMark.normalKnown` carries it to the draw.
- A mark whose side cannot be decided is drawn **double-ended** — the stem goes
  both ways from the surface anchor. It says "out is one of these two" instead
  of picking, and it is not silently *nothing* either, which would be
  indistinguishable from a cell the overlay skipped.

The excluded set is still pinned to exactly `{$40, $c0}`, and a new row asserts
`known === false` for exactly those bytes at **both** height signs.

### A clipping defect that had been shipping since the mark landed

The picker used a flat `MARK_PAD = 5` around a shape drawn at its full size. The
outward reach is *proportional to the cell*, so:

- 22px thumbnail: needed 5.5px, had 5 — marginal;
- **120px preview: needed 30px, had 5.** It has been drawing a barb sliced at
  the border since the mark landed.

Nobody saw it because the barb was the quiet element — which is this parcel's
whole subject. Fixed by making the shape size itself to the canvas
(`fitCellSizeToBox(box) = floor(box / (1 + 2·NORMAL_LEN/16))`) rather than the
canvas guessing a fixed pad: thumbnail cell 20 in a 38px canvas, preview cell 66
in the 120px box. The grid's gap is tied to the bleed (`MARK_PAD + 2`) so one
tile's stem cannot paint a direction onto the tile beside it.

Padding, never a clamp. Clamping the anchor to keep the stem inside would move
the mark **off the surface**, which is the defect row 73 removed.

### The legend

Still draws the real mark with the real drawing code — that was a deliberate win
of row 73 and is preserved. It is now told the **map's** live `16 * zoom`, so
the key shows the tier the map is showing rather than a picture the overlay may
have demoted away. Wording follows the mark: `Angle · arrow points to the open
side` (was "barb = open side"). The zoom-gate wording (`Angle — zoom in to
show`) is unchanged.

### The publish

`CollisionMarkRow` gains `tangentDrawn` and `normalKnown`; the report gains
`tier`. The tier is **returned by `drawAngleMark`**, not recomputed at the
publish site — the publish must report what was painted. This is what lets a
harness separate "the tangent is missing" from "the tangent is correctly demoted
at this zoom", the same way `suppressed` already separates the density gate from
a dead overlay.

---

## 3. What was NOT done, and why

**Normal-only, tangent deleted.** Still rejected, for row 73 §3's reason: the
silhouette is quantised to 16 integer column heights, so a 26° slope and a 30°
one are the *same picture* while the physics differs, and the bar lying along
the surface is what ties the annotation to the edge it describes. This parcel
**re-weights** that decision; it does not overturn it. The `H3b` harness row
exists specifically to fail if "points up" is ever bought by deleting the bar.

**An arrowhead on the stem.** Considered and rejected again, and this time with
the budget written down. A head is two strokes of `HEAD_LEN`; for it to read as
strokes rather than a blob each needs ~3× its own width. At the picker's
proportional widths the big preview's core is ~9px, so a head would have to be
~28px on a 120px box — nearly as long as the shaft. Row 73 rejected the head at
16px cells; the preview rejects it at 120px for the opposite reason. Length +
width + the tangent's demotion carry the hierarchy without it.

**Shortening `BAR_HALF` to make the stem relatively bigger.** That is buying
legibility with the tangent's only unique information, and it would push
`DETAIL_CELL_PX` up out of the owner's working zoom (at `BAR_HALF = 3` the
threshold is 86, so the map at z4 would lose the bar entirely).

**Clamping the mark inside the picker's box.** See above.

---

## 4. A defect found by LOOKING, not by a test — and it is the same class as last time

The first cut applied `ARROW_WIDTH_SCALE` only at the detail tier, on the
argument that a lone mark has no competition to out-weigh. Rendered, the picker
thumbnail came out a **1px hair**: measured on the real canvas, **7
angle-coloured pixels in a 38px tile against the 15 of the mark it replaced**.
The thumbnail is the exact surface the owner was looking at, so the change made
his complaint's home the *faintest* place the mark appears — a worse answer than
the one it fixed.

Every geometry assertion was green through this. The mark was in the right
place, pointing the right way, at the wrong weight. That is the same class as
row 73's paint-ghost stroke-width defect, found the same way: by opening the
picture.

Fixed: the scale applies at **every** tier. At the compact tier the stem is not
the loud half of a mark — it *is* the mark, and it carries the whole message
alone. (Commit 2 of this branch.)

---

## 5. Screenshots — the review

`scratchpad/collision-mark-normal/`, same parks and same pinned viewport for
both sides (1400×872 CSS, `deviceScaleFactor: 1`).

| before | after | shows |
|---|---|---|
| `before-picker-crop.png` | `after-picker-crop.png` | **⭐ THE 0° CASE. Start here.** The collision picker at 3× — the surface in his screenshot. |
| `before-picker.png` | `after-picker.png` | the same panel in the whole window |
| `before-map-z4-working.png` | `after-map-z4-working.png` | the map at his working zoom, over real art |
| `before-map-z8.png` | `after-map-z8.png` | the mark's geometry close up |
| `before-map-z2-compact.png` | `after-map-z2-compact.png` | the compact tier: stem only, no bar |

**The 0° tile, in one number.** Its angle-coloured ink, measured off the
thumbnail canvas:

| | bounding box (w × h) |
|---|---|
| before | **11 × 5** — wider than tall: a bold horizontal bar with a stub |
| after | **1 × 7** — taller than wide: a stem out of the surface, pointing up |

That is the owner's second sentence, before and after, as a measurement rather
than an impression. In the crops the before tile reads as a `⊥` and the after
tile reads as an arrow leaving the ground.

---

## 6. How it was verified

### Node suite

**5,398 passed / 0 failed / 7 skipped** (402 files), up from the 5,383 baseline.
`src/core/collision/__tests__/collision-angle-mark.test.ts` (43 rows) and
`src/renderer/components/classic/__tests__/classic-overlays.test.ts` (16).

Expectations are **derived from the module's own constants**, never read off a
screenshot: `DETAIL_CELL_PX` is re-derived from `BAR_HALF` and `atan(1/16)`; the
stem's widths are asserted as `coreWidth * ARROW_WIDTH_SCALE`; classic's fixture
scale is `(DETAIL_CELL_PX + 1) / 16` rather than a literal.

### Guards proven red-first (each planted, quoted, restored)

| planted | rows that fired | first failing assertion |
|---|---|---|
| the OLD weights (`NORMAL_LEN` 4, `ARROW_WIDTH_SCALE` 1) | 4 | `expected 1 to be greater than 1`; `expected 4 to be greater than 4.5` |
| `markTier` always `'detail'` (size rule deleted) | 6 | `expected 'detail' to be 'compact'`; `expected 4 to be 2` |
| `known = true` (wall honesty removed) | 3 | `expected [] to deeply equal [ 64, 192 ]` |
| per-element casing→core stroke order | 5 | `expected [ '#000', '#f00', '#000', '#f00' ] to deeply equal [ '#000', '#000', '#f00', '#f00' ]` |
| the mark TRANSPOSED (stem along the tangent) | 6 | `expected 6.5 to be close to +0` (the 0° row); `expected -6.36 to be greater than 0` (the 45° row) |
| `fitCellSizeToBox` returning the box | 1 | `expected 0 to be greater than or equal to 13` |

### A non-discriminating row, named

**"a picker thumbnail is compact and the big preview is detail"** does NOT fail
when `fitCellSizeToBox` stops fitting: with `fit(box) = box`, `markTier(38)` is
still `'compact'` and `markTier(120)` is still `'detail'`, so the row passes on a
broken fit. The row that holds that property is **"fitCellSizeToBox leaves room
for the stem on both sides"**, which is why it exists and is stated as an
inequality against `NORMAL_LEN * size/16` rather than against a size.

### CDP harness against the real app

`scratchpad/collision-mark-normal-harness.mjs`, a sibling of
`collision-legibility-harness.mjs` (which still owns "the mark exists, is on the
surface, is not mirrored"). This one is entirely about **which element
dominates**, in pixels. Driven on the owner's own act (aeon, ojz act1), reading
both `__dbg.aeon.collisionMarks()` and the map canvas's pixels, plus the
picker's thumbnail canvases directly.

**Result: 16/16 on three runs, identical numbers.** 1 row UNMEASURED and
reported as such (see below).

| row | measured |
|---|---|
| `H0b` tier published = derived threshold | `tier=detail cellScreenPx=128`, derived `DETAIL_CELL_PX=57`, 9/9 `tangentDrawn` |
| `H1b` both elements on canvas at detail | bar `4/25` ×2, stem `13/25`, `best=0` |
| ⭐ `H2` stem ink ≥ `ARROW_WIDTH_SCALE` × bar ink | stem `13.00/25`, bar `4.00/25`, **ratio 3.25** vs required ≥ 1.6 |
| ⭐ `H3` shallow angle points UP, tilted by exactly its own byte | `$f4`: stem tilt off vertical `−16.875000°` vs byte `−16.875000°` (Δ `−6.2e-13`); up `7/25`, down `0/25` with `25/25` non-black |
| `H3b` the tangent is still drawn there | `tangentDrawn=true`, bar `3/25` |
| ⭐ `H4` 45°-class transpose/mirror trap (`$e0`) | bar dir `(0.7071,−0.7071)` = `(cos,sin)`; dot `−3.0e-14`; `stemLen 6.5000`, `barLen 9.0000`; mirror `0/25`, `25/25` non-black |
| `H5a` compact tier published | `tier=compact cellScreenPx=32` ∈ [14, 57), `drawn=11`, all `tangentDrawn=false` |
| ⭐ `H5b` bar coordinates EMPTY at compact, stem still red | bar ends `0` and `0` (`23/25` non-black), stem `5/25` |
| `H6` zoom back in restores the bar | `tier=detail`, `paints 37→38`, canvas red `946` |
| ⭐ `H8b` every 0° THUMBNAIL's ink is taller than wide | `bbox 1×7` in a 38×38 canvas |
| `H8c` the demotion rule reaches the picker | widest 0° ink `1px`, tallest `7px` |
| `S2` the legend's wording follows the mark | `Angle · arrow points to the open side` |

### The harness rows were proven red-first against the ACTUAL shipped build

Not against a synthetic mutation: `git checkout HEAD~1 -- src/`, rebuild, same
harness. **5/14 passed** — the nine discriminating rows failed with the numbers
that make the case:

- `H2` stem `5.00` vs bar `4.00`, ratio **1.25**, required ≥ 1.6 — two strokes of
  identical width.
- `H4` `stemLen=4.0000` against `NORMAL_LEN 6.5`.
- `H5b` bar ends `red=4` and `red=4` where the demotion requires 0.
- ⭐ `H8b` 0° thumbnail ink `bbox 11×5` — wider than tall.
- `H0b`/`H5a`/`H6` `tier=undefined`, `tangentDrawn=undefined`.
- `S2` legend still reading `Angle · barb = open side`.

### ⭐ Two false-green paths found in the harness itself, and what they cost

Both in row `H2`, both caught by running the harness against the *before* build
and asking why it was green.

1. **A 1-px-wide perpendicular scan measured the wrong quantity.** It meant to
   read stroke width directly and reported `bar red=0` on a bar a 5×5 probe two
   rows earlier had found at `red=4/25, best=0` — it failed on correct output. A
   1.25 screen px stroke is thinner than the sample; its exactly-coloured pixels
   are a sparse set, so a scan line one pixel off the stroke's own centre sees
   nothing. Replaced with 5×5 ink density. (Same class as the sibling harness's
   casing-band lesson: 0.875px is thinner than a pixel.)
2. **`stem > bar` passed on the OLD mark, at 5 vs 4.** Two strokes of *identical
   width* differ by ±1 saturated pixel purely from subpixel phase, so a bare
   ">" is inside the noise — the row went green on exactly what it exists to
   reject. (An earlier sampling bug, windows sitting on the barb's flat end cap,
   was fixed first and did **not** account for it; the phase noise did.) The
   threshold is now the width ratio itself, and it is a *derived lower bound*
   rather than a guess: a stroke `k` times wider covers `k` times the area, and
   the near-fully-covered count grows at least that fast — for width `w` and
   crossing length `L` it goes as `(w − c)L` with `c > 0` the antialiased
   fringe, so `(1.6w − c)/(w − c) > 1.6`. Measured: 3.25 after, 1.25 before.

### Alternative green-paths ruled out (per row, and printed by the harness)

- **`H2`** — the bar not drawn at all (its own mean must be > 0, measured 4.00);
  a window straddling the perpendicular element (every sample is in its own
  element's middle third); a window on an end cap; off-canvas (`oob` is
  reported, never silently zero); subpixel phase (the threshold is the width
  ratio, not ">").
- **`H3`** — a build drawing the old centred symmetric tick, or drawing the stem
  *downward*: both put red at the DOWN probe, required to be 0. **"There is ink
  on the vertical axis through this cell" as the whole test passes on both of
  those**, which is why the absent half is required too. A blank probe (down
  requires ≥18/25 non-black, measured 25). A neighbouring mark supplying the
  down red (nearest other anchor is reported).
- **`H4`** — a transposed mark fails `perp` *and* `stemLen`; a y-mirror fails the
  tangent-direction check on a diagonal byte; the mirror probe requires ≥20/25
  non-black and reports the nearest other anchor (7.5 world px).
- **`H5b`** — the overlay being dead at that zoom: the stem probe **on the same
  mark** must be red (5/25) and the bar probes must be looking at drawn content
  (≥15/25 non-black), and `H6` brings the bar back in the same run.
- **`H8b`** — the ink being the orange solid-edge frame or the teal surface line:
  the picker tolerance is 25 and `COLLISION_SOLID_EDGE` (255,150,60) is 60 away
  on green. A tile with no ink at all: `n > 0` is required per tile, and `H8a`
  requires *every* 0°-labelled tile to have ink. The frame being mistaken for the
  mark: a frame is square, and `bh > bw` is strict.
- **`H0b`** — the harness and the module holding two copies of one constant:
  `DETAIL_CELL_PX` is re-derived harness-side from `BAR_HALF` and `atan(1/16)`
  and compared against the cell size the **app** published.

### Loud on unmeasurable

One row is reported as `UNMEASURED` and is **not** counted as a pass:

- **`H7`, the wall (undecidable open side) on the map.** Hunted across 25 parks
  at zoom 4 (104 marks published). This act contains no mark with
  `normalKnown === false`; the angle bytes actually present are
  `$b4 $b6 $ca $cc $d8 $e0 $ec $f0 $f4`, none of them `$40`/`$c0`. The double-
  ended draw and the `known` flag are covered by
  `collision-angle-mark.test.ts` instead.

An exact `$00` mark is likewise absent from the map, and that is a **property of
the tables, not a gap**: these collision tables use s4's "odd angle byte = no
angle" flag, so genuinely flat ground is stored as an odd byte and draws no mark
at all. The 0° case is therefore measured where it actually exists — the picker
(`H8b`, `H8c`) — and the map gets the generalisation instead (`H3`: the stem's
tilt off vertical equals the byte's own angle, exactly, which at `$00` is zero).

### Environment

`devicePixelRatio=1` on all runs, printed every time. The viewport is pinned via
`Emulation.setDeviceMetricsOverride({deviceScaleFactor: 1, 1400×872})` because
dpr is unstable under Xvfb on this host. `#map-canvas` rect
`{left:284, top:74, width:876, height:721}`, backing store `876×721` — asserted
equal to `round(rect.width)` by row `H0a`, because the pixel math depends on
`MapViewport` setting `canvas.width = rect.width` in CSS px. Every park is a
fixed integer world coordinate.

---

## 7. Left open

- **`H7` unmeasured on the map** (above). If a wall cell with an angle ever
  appears in an act, that row starts measuring on its own — no change needed.
- The wall's open side still cannot be *derived*; the information would have to
  come from neighbouring cells, which is a different parcel (row 73 §6 already
  says so). This parcel only made the refusal visible.
- **Nothing here needs the emulator, and none was touched.** No `mcp__oracle__*`
  call was made.
