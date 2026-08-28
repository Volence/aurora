# Collision legibility — one depiction of a shape and its direction

**Branch** `feat/collision-legibility` · **Date** 2026-08-28 · **ROADMAP** §5.1 row 72

The owner, playing the game and then painting in the editor, filed three
complaints:

> 4. Painting collision feels bad right now, when I go to paint you can't really
>    see what the shape looks like over the art at all so I kind of have to
>    guess and hope that it's correct?
> 5. These lines aren't really useful to describe direction I think
> 6. Collision angles view is just bad

These are one question asked in three places — *how does this app depict a
collision shape and its direction?* — so they got one answer.

---

## 1. What was actually wrong

The starting brief guessed that item 6 was about a mark that is centred,
symmetric and fixed-length. That was right, and there was a fourth thing under
it that nobody had seen.

**The four surfaces held three different angle conventions, and the one an
author paints on was a vertical mirror.** Measured by reproducing each call
site's formula verbatim (`scratchpad/dircheck.mjs`):

| angle | aeon map (`OverlayRenderer`) | classic map (`classic-overlays`) | picker / ghost (`collision-shape-draw`) |
|---|---|---|---|
| `$00` (0°) | (1.000, 0.000) | (1.000, 0.000) | (1.000, 0.000) |
| `$10` (23°) | (0.924, **−0.383**) | (0.924, **+0.383**) | (0.921, +0.391) |
| `$20` (45°) | (0.707, **−0.707**) | (0.707, **+0.707**) | (0.707, +0.707) |
| `$40` (90°) | (0.000, **−1.000**) | (0.000, **+1.000**) | (0.000, +1.000) |

So on the aeon map — the surface the complaint is about — every non-flat angle
was drawn lying **across** the slope it sat on instead of along it. That is not
a taste problem; "collision angles view is just bad" was a correct bug report.

Note also the picker column at `$10`: `0.921` where the others say `0.924`. The
picker routed the angle through `angleDegrees`, which rounds to whole degrees.

The rest of the diagnosis held up:

- **Centred, not on the surface.** `mx = cx+8, my = cy+8` — the middle of the
  cell, which for a shallow slope is not even inside the solid. The mark read
  as scattered *across* the map rather than as an annotation *on* an edge.
- **Symmetric.** A bar at 45° is the same bar for a 45° floor and for the
  ceiling of that slope. A symmetric mark **cannot** say which side is solid,
  which is the most important fact about a collision cell.
- **Two colours for one concept.** The map drew red (`COLLISION_ANGLE_TICK`),
  the picker drew blue (`COLLISION_ANGLE_NEEDLE`). The owner read them as
  unrelated marks because they were.
- **World-px length with no density gate** — the low-zoom crowding.

### Where the brief's measurements were wrong

Measurement 4 said classic might render angles through the same code as aeon and
told me to check. It does not: `classic-overlays.ts` has its own draw block. The
practical consequence is that this parcel had **four** call sites to unify, not
two, and one of them (`collision-shape-draw.ts`) serves three surfaces at once
(picker thumbnails, big preview, paint ghost). Every other measurement in the
brief reproduced exactly.

---

## 2. What was built: the tangent bar with an outward barb

One module, `src/core/collision/collision-angle-mark.ts`, drawn by every
surface:

- a short **tangent bar** lying along the surface and **anchored on it** (the
  median solid column's surface point), so it merges with the silhouette's
  surface line and reads as *this angle describes this edge*;
- an **outward barb** from the bar's midpoint, pointing out of the solid — the
  side the player stands on.

The barb is the whole answer to item 5. It is what makes the mark asymmetric,
and therefore what lets a floor and the ceiling at the same angle be told apart.

**The tangent comes from the angle; the side comes from the geometry.** The
tangent is the engine's own `(cos a, sin a)` with y down, cross-checked against
classic's independently unit-tested `angleNeedle` for all 256 bytes. The outward
normal is whichever perpendicular's y-sign opposes the solid, decided by the
**height sign at the anchor column**, not by the angle byte. That is deliberate:
whether a game's table stores a ceiling's angle already reflected past `$80` or
reuses the floor value is a per-game question this module refuses to guess at,
while the geometry (`h >= 0` solid from the bottom, `h < 0` hanging from the
top) is unambiguous and local. Choosing by geometry is correct under either
convention and cannot double-negate.

**Legibility over art (item 4) is a casing.** Every stroke goes down twice — a
near-black casing, then the bright core. A single bright stroke vanishes
wherever the art is bright; a single dark one vanishes wherever it is dark; a
cased pair contrasts against anything. This is how map labels survive an
arbitrary basemap, and it is the only part of the design that directly answers
"you can't see the shape over the art".

**Zoom, decided per quantity rather than globally.** Lengths are cell-local
(world) px, because the mark annotates a 16px cell and must stay proportional to
it. Stroke widths are screen px (`/zoom`), so a hairline stays a hairline. And
below `MIN_CELL_PX_FOR_MARK` (14 screen px per cell) the mark is not drawn at
all — that density, not the mark itself, is the low-zoom noise. The silhouette
and surface line still carry the shape down there.

**It is not heavier by default.** The mark replaces the old tick one-for-one and
is shorter than it was. No new toggle, no new colour: `COLLISION_ANGLE_NEEDLE`
was deleted so there is one angle hue, and `needleEndpoints` was deleted so
there is one angle direction.

---

## 3. The design space — what was rejected, and why

The next session's most useful inheritance is the roads not taken.

**A longer / brighter version of the existing tick.** Rejected outright, and the
brief specifically warned against narrowing the parcel to this. It cannot fix
item 5: no amount of recolouring makes a symmetric mark express a side.

**An arrowhead instead of a barb.** A proper arrow (two angled strokes) at a
16px cell is three strokes in ~5px and reads as a blob at anything under zoom 4.
The single barb carries the same one bit of information — which side — for a
third of the ink.

**Showing the normal only, dropping the tangent.** Tempting, because the
silhouette already implies the slope and the normal is the non-redundant part.
Rejected: the silhouette is quantised to 16 integer column heights, so a 26°
slope and a 30° slope are the *same picture*, while the angle byte that the
physics actually uses differs. The bar is what shows the precise angle; without
it the mark loses the only information it uniquely carries.

**Deciding the open side from the angle byte alone.** This is what a naive
reading of the data suggests, and it is a trap: if a table stores ceiling angles
already reflected, the ceiling flip is applied twice and every hanging surface
gets an upward barb. Geometry-decides is immune. See §4 for the measurement that
proves the two are genuinely different rules here.

**Clamping the anchor so the barb never leaves the cell.** Rejected after seeing
it rendered. On the map a barb reaching into the air cell above is *correct* —
it is what "the open side is up there" looks like. Only the picker thumbnail has
a hard boundary, and that got padding, which moves nothing.

**A neutral / desaturated mark.** The band-lens note in `canvas-colors.ts`
records the same argument being lost once already: a lens that can be mistaken
for the picture is worse than one that is obviously not. Red-orange stays.

**Keeping the picker's blue as a "this is the picker" cue.** This *is* the
defect restated. One concept, one colour.

---

## 4. How it was verified

### Node suite

5200 passed / 393 files. One failure,
`test/formats/effects-scene-curve-vsplit.test.ts`, is **pre-existing and
unrelated** — its import graph (`effects/scene`, `effects-aeon`,
`editing/history`, the schema JSON) never reaches collision rendering, and it
fails on a shipped aeon fixture where `setLayerFieldCommand` returns null.
Not touched by this parcel; flagged, not fixed.

New: `src/core/collision/__tests__/collision-angle-mark.test.ts` (29 rows).

### Guards proven red-first

Each violation planted, the failing assertion recorded, then restored.

| Planted | Rows that fired | Evidence |
|---|---|---|
| The old aeon mirror (`ty` negated) | 5 | 254/254 non-flat bytes mismatch vs `angleNeedle` |
| Geometry side-override deleted | 2 | 254 entries, `ceil $0 ny=-1` (a ceiling gets an upward barb) |
| Casing pass deleted | 1 | `[{#f00,1}]` vs expected `[{#000,3},{#f00,1}]` |
| Anchor forced to the cell centre | 2 | `expected 8 to be 7`, `expected 8 to be greater than 12` |
| Barb deleted (symmetric bar) | 6 | incl. both rewritten classic rows |
| Classic density gate deleted | 1 | `expected 4 to be +0` |

### A non-discriminating row, named

The test **"y-flipping a slope reverses the barb"** still passes with the
geometry side-override deleted. `flipAngleY` happens to reverse the barb on its
own for this table's convention, so two independent paths produce that one
observable and the row cannot tell them apart. The row that actually holds the
property is the **254-byte sweep**, which is why it exists. This is exactly the
false-green cause (ii) — "two independent code paths produce one observable" —
caught in the act.

### Two defects found by looking, not by testing

- **Float noise decided a wall's barb.** `Math.cos(3π/2)` is `-1.8e-16`, not 0,
  so an `ny !== 0` wall test let rounding flip the normal: `$c0` negated and
  `$40` did not. Found because a test I had written for the documented exception
  failed. Fixed with `VERTICAL_EPS`; the 256-byte sweep now pins it, and the
  excluded set is itself asserted to be exactly `{$40, $c0}` so the exception
  cannot silently widen.
- **The barb was clipped at every full-height thumbnail.** Only visible in a
  rendered picker. Fixed with padding, not a clamp.

### CDP harness against the real app

`scratchpad/collision-legibility-harness.mjs`, driving the real Electron app on
the owner's own act (aeon, ojz act1, section 0, the curved slope at world
x 1152–1264 / y 528–592), reading both the model and the canvas's own pixels.

The load-bearing design choice is the **publish**: `OverlayRenderer` writes
`__dbg.aeon.collisionMarks()` out of the exact geometry it hands to
`drawAngleMark` (`src/renderer/canvas/collision-mark-report.ts`), so the harness
knows where to sample and, more importantly, where the mark must **not** be.
Recomputing the geometry harness-side would prove only that two copies of one
formula agree — which stays true when the draw pass never ran.

**The discriminating quantity is the mirrored-barb probe.** Sampling "is the
angle colour present near this cell" passes on the *old* mark too. Sampling at
`anchor − (tip − anchor)` — the position the old symmetric tick painted and the
new asymmetric one must leave empty — is what separates this change from what it
replaced, and from a regression to the mirror. The colour test is near-exact
match to `rgba(255,90,70)` rather than a "reddish" shape test, because this
act's orange-brown art would false-positive on the latter.

`suppressed` is published separately from `active` so "angles off" and "angles
on but zoomed out" are different answers a row can fail on, rather than one
silence.

### The environment trap, pinned rather than reported

`devicePixelRatio` is genuinely unstable on this host — measured at both 1 and
1.35 on a byte-identical tree, with and without `-dpi 96`, producing 1400×872
vs 1890×1178 PNGs for the same view. The capture harness therefore issues
`Emulation.setDeviceMetricsOverride({deviceScaleFactor: 1, …})`, making the
device grid an **input** of the harness rather than a property of whichever
display Xvfb picked. Every park is a fixed integer world coordinate, never
derived from a measured rect. Separately, `MapViewport` sets
`canvas.width = rect.width` (CSS px, not dpr-scaled), so world→canvas is exactly
`(world − vp) * zoom` with no dpr factor in the pixel math.

---

## 5. Screenshots

`scratchpad/collision-legibility/`, same park for both sides.

| Before | After | Shows |
|---|---|---|
| `before-slope-z4.png` | `after-slope-z4.png` | the curved slope over art, the owner's zoom |
| `before-slope-z8.png` | `after-slope-z8.png` | the mark's geometry close up |
| `before-slope-z1.png` | `after-slope-z1.png` | low zoom — the crowding, and the gate |
| `before-noangles-z4.png` | `after-noangles-z4.png` | control: what the angle mark adds |
| `before-picker.png` | `after-picker.png` | the picker thumbnails (complaint 5) |
| `before-slope-z4-collision-facet.png` | `after-…` | the actual painting context |

The z4 pair is the one to look at. Before: red ticks floating in the black air
above the curve, tilted against it. After: the marks hug the curve, lie along
it, and each carries a barb out of the solid.

---

## 6. Left open

- **Tagged for foreground confirmation:** nothing in this parcel needs the
  emulator, and none was touched.
- The pre-existing `effects-scene-curve-vsplit` failure above is unowned.
- `angleDegrees` still exists and is still used for the picker's `°` **labels**,
  which is correct — rounding is right for a label and wrong for geometry. It no
  longer feeds any drawing.
- The wall case (`$40` / `$c0`) keeps the angle-derived perpendicular because
  nothing inside a full cell says which side is open. If that ever matters, the
  information would have to come from the neighbouring cells, which is a
  different parcel.
