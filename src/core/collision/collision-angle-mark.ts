// src/core/collision/collision-angle-mark.ts
//
// THE ONE ANGLE MARK. Every surface that depicts a collision angle — the aeon
// map overlay, the classic map overlay, the picker thumbnails, the big picker
// preview and the paint ghost under the cursor — draws THIS, so a direction
// that reads one way in the picker cannot read another way on the map.
//
// ═══ WHY THE OLD MARK WAS UNREADABLE ═══
//
// It was a centred, symmetric, fixed-world-length segment (OverlayRenderer's
// `mx = cx+8, my = cy+8, len = 6`). Three separate defects in one line:
//
//  1. CENTRED, NOT ON THE SURFACE. It floated at the middle of the cell, so it
//     read as a mark scattered ACROSS the map rather than an annotation ON the
//     edge it describes. The owner's words: "detached from the surface".
//
//  2. SYMMETRIC. A bar at 45° is the same bar for a 45° floor and for the
//     ceiling of the same slope. A symmetric mark CANNOT say which side is
//     solid, which is the single most important thing about a collision cell.
//
//  3. DISAGREEING ACROSS SURFACES. The three call sites had three conventions.
//     Measured on 2026-08-28 by reproducing each formula verbatim:
//
//       angle $20 (45°)   aeon map (0.707, -0.707)
//                         classic map (0.707, +0.707)
//                         picker/ghost (0.707, +0.707)
//
//     The aeon map drew every non-flat angle VERTICALLY MIRRORED against both
//     the classic map and the picker — the tick lay ACROSS the slope it sat on
//     instead of along it. That is the whole of "collision angles view is just
//     bad", and it is a correctness bug, not a taste one.
//
// ═══ WHAT REPLACES IT: AN OUTWARD ARROW WITH A FINE TANGENT BAR ═══
//
//   • a STEM from a point ON the surface pointing OUT of the solid — the side
//     the player stands on / approaches from. This is the DOMINANT element:
//     longest, thickest, the thing the eye lands on;
//   • a short, fine bar lying ALONG the surface through the stem's root, so it
//     merges with the silhouette's surface line and reads as "this angle
//     describes THIS edge".
//
// The stem is what makes the mark asymmetric, and therefore what lets a floor
// and the ceiling at the same angle be told apart at a glance.
//
// ═══ WHY THE HIERARCHY IS THIS WAY ROUND (2026-08-28, the second report) ═══
//
// The first version of this mark had it INVERTED: a prominent tangent bar with
// a small barb hanging off it. The geometry was correct — measured, at angle 0
// the tangent is exactly (1, 0) and the outward normal exactly (0, -1) — and it
// still read as broken:
//
//   "I still think the collision direction arrows in the preview may be kind of
//    useless? Also why are the 0 degree ones not pointing straight up lol"
//
// Both halves of that are ONE complaint. What an author looks for in a
// collision cell is WHICH WAY IS OUT, and that was the quiet element: at a 28px
// picker thumbnail the barb was a few pixels beside a bold horizontal stroke.
// The mark was spending its ink on the quantity nobody was asking about. So the
// weights are swapped; the maths is untouched.
//
// The tangent is NOT deleted, and normal-only is still rejected for the reason
// recorded in docs/reviews/2026-08-28-collision-legibility.md §3: the silhouette
// is quantised to 16 integer column heights, so it cannot tell a 26° slope from
// a 30° one, and the bar lying along the surface is what ties the annotation to
// the edge it describes. It is demoted, not removed — and dropped only at sizes
// where it is measurably unable to do that job (see DETAIL_CELL_PX).
//
// ═══ THE TANGENT COMES FROM THE ANGLE; THE SIDE COMES FROM THE GEOMETRY ═══
//
// The tangent is the engine's own convention, (cos a, sin a) with y DOWN — the
// one anchored on `Sonic_Jump` and unit-tested in classic/collision-needle.ts.
//
// The outward normal is one of the two perpendiculars, and WHICH one is decided
// by the height sign at the anchor column, NOT by the angle byte. That is
// deliberate. The collision tables' convention for a ceiling's stored angle
// (already reflected past $80, or the floor value reused) is a per-game
// question this module refuses to guess at; the geometry is unambiguous and
// local. `heights[c] >= 0` means solid grows up from the bottom, so the open
// side is above; `< 0` means solid hangs from the top, so the open side is
// below. Choosing the perpendicular whose y-sign matches that is correct under
// EITHER table convention, and cannot double-negate.
//
// The one case geometry cannot decide is a vertical normal-y of zero — a wall
// cell, where every column is full and nothing inside the cell says which side
// is open. There the angle-derived perpendicular is kept as-is. Documented
// limitation, not an oversight: the information is not in the cell.
//
// ⚠ AND NOW THAT THE NORMAL IS THE DOMINANT MARK, THAT LIMITATION HAS TO SHOW.
// A small barb pointing at an arbitrary wall side was a small lie; a bold arrow
// pointing at one is a loud one. So `AngleMark.normalKnown` carries the answer
// out of the geometry, and a mark whose normal is NOT known is drawn with the
// stem going BOTH ways — a double-ended stem that says "out is one of these
// two" instead of picking. It is not silently a confident arrow, and it is not
// silently nothing either, which would be indistinguishable from a cell the
// overlay skipped.
//
// ═══ UNITS: CELL-LOCAL, SO ONE GEOMETRY SERVES EVERY BOX SIZE ═══
//
// All lengths here are in CELL-LOCAL pixels (0..16), the space `columnSolidRun`
// already speaks. A caller drawing into a box of `size` scales by `size/16`.
// That keeps the mark proportional to the CELL it describes at every zoom and
// in every panel, while stroke WIDTHS stay the caller's business (they are
// screen-space quantities — see `drawAngleMark`'s opts).

import type { CollisionProfile } from './collision-model';
import { columnSolidRun } from './collision-render';

/** Half-length of the tangent bar, in cell-local px. 4.5 → a 9px bar in a 16px
 *  cell: long enough to read as a direction, short enough that adjacent cells'
 *  marks stay visually separate instead of merging into one long line.
 *  UNCHANGED by the hierarchy inversion — the bar's length is exactly what
 *  carries the precise angle (see DETAIL_CELL_PX), so shortening it to make the
 *  stem look bigger would buy legibility with the information the bar exists
 *  for. The stem out-weighs it by getting LONGER and THICKER, not by the bar
 *  getting smaller. */
export const BAR_HALF = 4.5;

/**
 * Outward reach of the normal stem from its root on the surface, in cell-local
 * px. This replaces `BARB_LEN` (which was 4 — SHORTER than each half of the
 * 4.5 bar, i.e. the smallest thing in the mark).
 *
 * 6.5 is chosen so the stem out-reaches a half-bar by ~44% while still fitting
 * inside a neighbouring cell on the map (a 16px cell has 16px of room above a
 * full-height surface). Together with ARROW_WIDTH_SCALE it makes the stem the
 * dominant element on both axes a viewer weighs, length and weight, which is
 * the whole of this parcel.
 */
export const NORMAL_LEN = 6.5;

/**
 * How much thicker the stem is drawn than the caller's stated width — which is
 * the tangent bar's width, so this is also the ratio between the two elements.
 *
 * Emphasis is applied by making the dominant element bolder, never by thinning
 * the quiet one: the tangent keeps exactly the widths the previous parcel
 * measured as legible (a 1.25px core in a 3px casing, whose visible casing band
 * is 0.875 screen px per side — already sub-pixel; anything thinner stops
 * rendering as a cased stroke at all).
 *
 * ⚠ IT APPLIES AT EVERY TIER, AND THE COMPACT TIER IS WHY. The first cut of
 * this scaled the stem only where a bar was there to out-weigh, on the argument
 * that a lone mark has no competition. Rendered, the picker thumbnail came out
 * a 1px hair — measured, seven angle-coloured pixels in a 38px canvas against
 * the fifteen of the mark it replaced. It read as fainter than what the owner
 * had already called useless, which is a worse answer than the one it fixed.
 * At the compact tier the stem is not the loud half of a mark, it IS the mark;
 * it carries the whole message alone and needs the weight to do it.
 */
export const ARROW_WIDTH_SCALE = 1.6;

/**
 * Below this many SCREEN pixels per 16px cell, callers must not draw the angle
 * mark at all.
 *
 * This is the deliberate answer to "the ticks crowd into noise". A directional
 * mark needs roughly a cell's width to be resolvable; under ~14 screen px the
 * mark collapses into a blob, and a viewport full of them is the scattered-
 * static effect the old overlay had at low zoom. The silhouette and the surface
 * line still carry the SHAPE down there — only the angle annotation drops out,
 * which is the cheapest thing on screen to lose.
 */
export const MIN_CELL_PX_FOR_MARK = 14;

/**
 * The coarsest angular difference the SILHOUETTE cannot express, in radians.
 *
 * The silhouette is 16 columns of integer height in a 16px cell, so the finest
 * slope step it can draw is one pixel of rise across the cell: `atan(1/16)`,
 * 3.576°. Two angle bytes inside that band produce the SAME picture while the
 * physics uses different numbers — which is precisely why the tangent bar
 * exists and why deleting it was rejected.
 */
export const SILHOUETTE_BLIND_RAD = Math.atan(1 / 16);

/**
 * At or above this many SCREEN px per 16px cell the tangent bar is drawn beside
 * the stem; below it, the stem is drawn alone.
 *
 * DERIVED, not chosen. The bar earns its ink only when it can actually separate
 * two angles the silhouette cannot: its endpoint must move at least one screen
 * pixel across SILHOUETTE_BLIND_RAD. A half-bar of `BAR_HALF` cell-local px is
 * `BAR_HALF * cellPx / 16` screen px long, so
 *
 *     BAR_HALF * cellPx / 16 * sin(SILHOUETTE_BLIND_RAD) >= 1
 *     cellPx >= 16 / (BAR_HALF * sin(SILHOUETTE_BLIND_RAD))   = 56.9999...
 *
 * → 57. Below that the bar is a stroke whose slope no viewer can read against
 * the silhouette it lies on: ink spent on a quantity it cannot deliver, which
 * is the exact defect this parcel is fixing at the other end. A 22px picker
 * thumbnail is far under it (its bar moved 0.3px across the whole blind band);
 * the big preview and the map at the owner's working zoom are far over it.
 *
 * ⚠ This is a DEMOTION RULE, not permission to drop the tangent for looks. The
 * detail tier draws both, always.
 */
export const DETAIL_CELL_PX = Math.ceil(16 / (BAR_HALF * Math.sin(SILHOUETTE_BLIND_RAD)));

/** What a given screen size of cell gets drawn. See DETAIL_CELL_PX. */
export type MarkTier = 'off' | 'compact' | 'detail';

/**
 * THE SIZE RULE, IN ONE PLACE.
 *
 * Callers pass the screen px their 16px cell occupies and are told what to
 * draw; they do not each decide. Three surfaces with three budgets — a ~28px
 * picker thumbnail, a 120px preview, a map at arbitrary zoom — used to mean
 * three chances to disagree, and disagreement between surfaces drawing one
 * angle byte is the defect class this module was created to end.
 */
export function markTier(cellScreenPx: number): MarkTier {
  if (!(cellScreenPx >= MIN_CELL_PX_FOR_MARK)) return 'off';
  return cellScreenPx >= DETAIL_CELL_PX ? 'detail' : 'compact';
}

/**
 * Fraction of a cell's size that the mark can reach OUTSIDE the cell box.
 *
 * The stem is rooted on the surface and points away from the solid, so on a
 * full-height cell (surface at y = 0) it leaves the box entirely. On the map
 * that is correct and wanted — the stem reaches into the air cell above, which
 * is what "the open side is up there" looks like. A FIXED-BOX caller (the
 * picker) has a hard clip instead, and a clipped arrow loses its far end, which
 * is the end that carries the direction.
 */
export const MARK_BOX_MARGIN = NORMAL_LEN / 16;

/**
 * The largest cell size whose mark fits wholly inside a `box`-square canvas.
 *
 * For a fixed-box caller. The alternative — clamping the anchor so the stem
 * stays inside — was rejected in the previous parcel and stays rejected: it
 * moves the mark OFF the surface, which is the original defect.
 */
export function fitCellSizeToBox(box: number): number {
  return Math.floor(box / (1 + 2 * MARK_BOX_MARGIN));
}

/** The free margin a `size`-square cell needs on each side, in screen px. */
export function markPadPx(size: number): number {
  return Math.ceil(size * MARK_BOX_MARGIN);
}

/** The drawn mark, in cell-local px relative to the cell's top-left. */
export interface AngleMark {
  /** Anchor: a point ON the collidable surface (bar midpoint, stem root). */
  ax: number;
  ay: number;
  /** Unit tangent along the surface, screen space (y DOWN). */
  tx: number;
  ty: number;
  /** Unit outward normal — points into the OPEN side (away from the solid). */
  nx: number;
  ny: number;
  /**
   * Whether the geometry could actually DECIDE which side is open.
   *
   * False for a wall cell, where every column is full and nothing inside the
   * cell says which side the player approaches from — see the module docblock.
   * `nx`/`ny` still hold the angle-derived perpendicular (one of the two right
   * answers), but a caller must not present it as a confident direction.
   */
  normalKnown: boolean;
}

/**
 * The surface y of one column, in cell-local px, or null when the column is
 * empty. The top of a floor run (h >= 0) or the underside of a hanging ceiling
 * run (h < 0) — the same player-facing boundary the surface line traces, so the
 * mark lands exactly on the line rather than near it.
 */
export function columnSurfaceY(height: number): number | null {
  const run = columnSolidRun(height);
  if (!run) return null;
  return height >= 0 ? run.y : run.y + run.h;
}

/**
 * Where to anchor the mark: the MEDIAN solid column's surface point.
 *
 * Median rather than the cell centre, because the cell centre is not on the
 * surface (defect 1 above) and is not even inside the solid for a shallow
 * slope. Median rather than the mean height, because the mean of a step
 * profile lands between two columns and off the drawn line. Returns null for a
 * cell with no solid column at all — an air cell has no surface to annotate.
 */
export function surfaceAnchor(heights: ArrayLike<number>): { ax: number; ay: number; height: number } | null {
  const solid: number[] = [];
  for (let c = 0; c < 16; c++) {
    if (columnSurfaceY(heights[c] ?? 0) !== null) solid.push(c);
  }
  if (solid.length === 0) return null;
  const c = solid[(solid.length - 1) >> 1];
  const sy = columnSurfaceY(heights[c] ?? 0);
  // Unreachable (c came from the solid list), but keeps the type honest.
  if (sy === null) return null;
  return { ax: c + 0.5, ay: sy, height: heights[c] ?? 0 };
}

/**
 * Unit tangent along the surface for an angle byte, screen space (y DOWN).
 *
 * (cos a, sin a) — the ENGINE's convention, not the maths one. `Sonic_Jump`
 * sends the player along angle-$40 through CalcSine, so angle 0 (flat ground)
 * must launch upward, which fixes the sign with y increasing downward. This is
 * the same formula `classic/collision-needle.ts` derives and unit-tests; it is
 * repeated here (rather than imported) only because that module lives under
 * renderer/components/classic and this one is core, shared by both engines.
 *
 * Works in BYTES, never in rounded degrees: the picker used to route the angle
 * through `angleDegrees`, whose `Math.round` cost up to half a degree and made
 * the thumbnail disagree with the map by a visible hair at shallow slopes
 * (measured: angle $10 drew (0.921, 0.391) instead of (0.924, 0.383)).
 */
export function angleTangent(angleByte: number): { tx: number; ty: number } {
  const r = ((angleByte & 0xff) / 256) * Math.PI * 2;
  return { tx: Math.cos(r), ty: Math.sin(r) };
}

/**
 * The outward normal: the perpendicular of the tangent that points AWAY from
 * the solid, chosen by the anchor column's height sign.
 *
 * The candidate is (sin a, -cos a), which for flat ground (a = 0) is (0, -1) —
 * up, the side you stand on. `anchorHeight >= 0` (solid up from the bottom)
 * wants ny < 0; `< 0` (solid hanging from the top) wants ny > 0. When the
 * candidate disagrees, negate it.
 *
 * A horizontal normal is a wall: the tangent is vertical, every column is full,
 * and nothing in the cell says which side is open — so the candidate is
 * returned untouched. See the module docblock.
 *
 * ⚠ THE WALL TEST NEEDS AN EPSILON, AND FINDING OUT WHY IS WHY IT HAS ONE.
 * `Math.cos(3π/2)` is -1.8e-16, not 0, so an `ny !== 0` test lets the sign of
 * float NOISE decide a wall's barb direction — at angle $c0 it negated and at
 * $40 it did not, from rounding alone. With 256 discrete bytes the neighbours
 * of a true vertical ($3f, $41) have |cos| ≈ 0.0245, five orders of magnitude
 * above the epsilon, so VERTICAL_EPS separates the exact walls from every real
 * angle with room to spare.
 */
const VERTICAL_EPS = 1e-9;

/**
 * The outward normal for a tangent that is ALREADY resolved — the form classic
 * needs, because it gets its tangent from `angleNeedle` with the chunk-cell
 * x/y flips already folded in and must not re-derive it from a raw byte.
 *
 * The candidate perpendicular of (tx, ty) is (ty, -tx); for flat ground
 * (1, 0) that is (0, -1), up.
 */
export function outwardNormalFromTangent(
  tx: number, ty: number, anchorHeight: number,
): { nx: number; ny: number; known: boolean } {
  let nx = ty, ny = -tx;
  // `known` is the SAME test that decides whether to negate, deliberately: the
  // one branch that cannot choose a side is the one branch that must report it.
  // Two independent tests here would be two chances for the drawn mark and its
  // honesty flag to disagree.
  const known = Math.abs(ny) > VERTICAL_EPS;
  const wantNegativeY = anchorHeight >= 0;
  if (known && (ny < 0) !== wantNegativeY) { nx = -nx; ny = -ny; }
  return { nx, ny, known };
}

export function outwardNormal(
  angleByte: number, anchorHeight: number,
): { nx: number; ny: number; known: boolean } {
  const { tx, ty } = angleTangent(angleByte);
  return outwardNormalFromTangent(tx, ty, anchorHeight);
}

/**
 * The complete mark for a profile, or null when there is nothing to annotate
 * (no usable angle, or no solid column). Cell-local px.
 */
export function angleMark(profile: CollisionProfile): AngleMark | null {
  if (!profile.hasAngle) return null;
  const anchor = surfaceAnchor(profile.heights);
  if (!anchor) return null;
  const { tx, ty } = angleTangent(profile.angle);
  const { nx, ny, known } = outwardNormal(profile.angle, anchor.height);
  return { ax: anchor.ax, ay: anchor.ay, tx, ty, nx, ny, normalKnown: known };
}

/**
 * The same mark for a caller that has flip-resolved columns but not a
 * `CollisionProfile` — classic's overlay, which applies chunk-cell X/Y flips
 * per cell at draw time rather than materialising a flipped profile.
 *
 * `heightAt` must return the FLIP-RESOLVED cell-local height of column c, and
 * `tangent` the FLIP-RESOLVED unit tangent (classic's `angleNeedle(byte, xf,
 * yf)`, whose flip math is the engine's own and unit-tested). Note that a
 * y-flip on a height is simply
 * its negation for this purpose: a floor of height 5 (`run y=11 h=5`, surface
 * 11) becomes a hanging run of depth 5 (`run y=0 h=5`, surface 5), which is
 * exactly classic's own `16 - surfaceY` mapping.
 */
export function angleMarkFromColumns(
  heightAt: (c: number) => number,
  tangent: { tx: number; ty: number },
): AngleMark | null {
  const heights: number[] = [];
  for (let c = 0; c < 16; c++) heights.push(heightAt(c));
  const anchor = surfaceAnchor(heights);
  if (!anchor) return null;
  const { nx, ny, known } = outwardNormalFromTangent(tangent.tx, tangent.ty, anchor.height);
  return { ax: anchor.ax, ay: anchor.ay, tx: tangent.tx, ty: tangent.ty, nx, ny, normalKnown: known };
}

/** Minimal structural canvas context — matches `ShapeDrawCtx` so a caller can
 *  pass the same object to both, and keeps this module free of the DOM lib. */
export interface MarkDrawCtx {
  strokeStyle: string;
  lineWidth: number;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
}

export interface MarkDrawOpts {
  /** Bright core colour. */
  color: string;
  /** Dark casing drawn UNDER the core. See `drawAngleMark`. */
  casing: string;
  /** Core stroke width, in the CALLER's units (world px for a zoomed map
   *  context — pass `1.25 / zoom` to get a screen-constant hairline). This is
   *  the TANGENT's width; the stem is drawn at ARROW_WIDTH_SCALE times it. */
  coreWidth: number;
  /** Casing stroke width, same units. Must exceed coreWidth to show. */
  casingWidth: number;
  /**
   * How many SCREEN pixels this caller's 16px collision cell occupies.
   *
   * NOT the box size and NOT the caller's unit scale: the map draws at
   * `size = 16` into a context scaled by `zoom`, so its cell is `16 * zoom`
   * screen px while its `size` is 16. This is the quantity `markTier` is stated
   * in, and passing it is how a call site says what budget it has instead of
   * deciding for itself what to draw.
   */
  cellScreenPx: number;
}

/**
 * Draw one mark into a `size`-square box at (x, y).
 *
 * ═══ THE CASING IS THE POINT OF THIS FUNCTION ═══
 *
 * The overlay is drawn over high-contrast pixel art in ARBITRARY colours, and
 * that is the actual content of the "I can't see the shape over the art"
 * complaint. A single bright stroke is invisible wherever the art happens to be
 * bright; a single dark stroke is invisible wherever the art is dark. So every
 * stroke goes down twice — a near-black casing first, the bright core over it —
 * which is how map labels stay readable over an arbitrary basemap. Against ANY
 * background at least one of the two contrasts, and the pair reads as one mark.
 *
 * This costs a second stroke pass per mark and nothing else; it adds no new
 * colour to the overlay palette and no new toggle.
 *
 * ═══ THE STROKE ORDER IS ALL CASINGS, THEN ALL CORES ═══
 *
 * The stem and the bar carry DIFFERENT widths now, so they cannot share one
 * path. Drawing each element's casing-then-core in turn would let the stem's
 * fat casing paint over the bar's thin core where they cross, chewing a dark
 * notch out of the bar at the one point both elements meet. Casings first,
 * cores last: four strokes at the detail tier, two at compact.
 *
 * Returns the tier it drew, so a caller that publishes what it painted (see
 * collision-mark-report.ts) reports the module's decision rather than a second
 * copy of it.
 */
export function drawAngleMark(
  ctx: MarkDrawCtx,
  x: number, y: number, size: number,
  mark: AngleMark,
  opts: MarkDrawOpts,
): MarkTier {
  const tier = markTier(opts.cellScreenPx);
  if (tier === 'off') return tier;

  const s = size / 16;
  const ax = x + mark.ax * s, ay = y + mark.ay * s;
  const bx = mark.tx * BAR_HALF * s, by = mark.ty * BAR_HALF * s;
  const nx = mark.nx * NORMAL_LEN * s, ny = mark.ny * NORMAL_LEN * s;
  const withBar = tier === 'detail';

  const barPath = () => {
    ctx.beginPath();
    ctx.moveTo(ax - bx, ay - by);
    ctx.lineTo(ax + bx, ay + by);
    ctx.stroke();
  };
  const stemPath = () => {
    ctx.beginPath();
    // An UNKNOWN open side is drawn both ways — see the module docblock. The
    // root is still the surface point; the mark simply refuses to pick an end.
    ctx.moveTo(mark.normalKnown ? ax : ax - nx, mark.normalKnown ? ay : ay - ny);
    ctx.lineTo(ax + nx, ay + ny);
    ctx.stroke();
  };

  ctx.strokeStyle = opts.casing;
  if (withBar) { ctx.lineWidth = opts.casingWidth; barPath(); }
  ctx.lineWidth = opts.casingWidth * ARROW_WIDTH_SCALE;
  stemPath();

  ctx.strokeStyle = opts.color;
  if (withBar) { ctx.lineWidth = opts.coreWidth; barPath(); }
  ctx.lineWidth = opts.coreWidth * ARROW_WIDTH_SCALE;
  stemPath();

  return tier;
}
