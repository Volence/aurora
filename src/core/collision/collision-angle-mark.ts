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
// ═══ WHAT REPLACES IT: A TANGENT BAR WITH AN OUTWARD BARB ═══
//
//   • a short bar lying ALONG the surface, anchored ON the surface, so it
//     visually merges with the silhouette's surface line and reads as "this
//     angle describes THIS edge";
//   • a barb from the bar's midpoint pointing OUT of the solid — the side the
//     player stands on / approaches from.
//
// The barb is what makes the mark asymmetric, and therefore what lets a floor
// and the ceiling at the same angle be told apart at a glance.
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
 *  marks stay visually separate instead of merging into one long line. */
export const BAR_HALF = 4.5;

/** Length of the outward barb from the bar's midpoint, in cell-local px. Kept
 *  just under BAR_HALF so the mark reads as a bar-with-a-stem (a surface with a
 *  side) rather than as a plus or an arrow of ambiguous orientation. */
export const BARB_LEN = 4;

/**
 * Below this many SCREEN pixels per 16px cell, callers must not draw the angle
 * mark at all.
 *
 * This is the deliberate answer to "the ticks crowd into noise". A directional
 * mark needs roughly a cell's width to be resolvable; under ~14 screen px the
 * bar and its barb collapse into a single blob, and a viewport full of them is
 * the scattered-static effect the old overlay had at low zoom. The silhouette
 * and the surface line still carry the SHAPE down there — only the angle
 * annotation drops out, which is the cheapest thing on screen to lose.
 */
export const MIN_CELL_PX_FOR_MARK = 14;

/** The drawn mark, in cell-local px relative to the cell's top-left. */
export interface AngleMark {
  /** Anchor: a point ON the collidable surface (bar midpoint, barb root). */
  ax: number;
  ay: number;
  /** Unit tangent along the surface, screen space (y DOWN). */
  tx: number;
  ty: number;
  /** Unit outward normal — points into the OPEN side (away from the solid). */
  nx: number;
  ny: number;
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
): { nx: number; ny: number } {
  let nx = ty, ny = -tx;
  const wantNegativeY = anchorHeight >= 0;
  if (Math.abs(ny) > VERTICAL_EPS && (ny < 0) !== wantNegativeY) { nx = -nx; ny = -ny; }
  return { nx, ny };
}

export function outwardNormal(angleByte: number, anchorHeight: number): { nx: number; ny: number } {
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
  const { nx, ny } = outwardNormal(profile.angle, anchor.height);
  return { ax: anchor.ax, ay: anchor.ay, tx, ty, nx, ny };
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
  const { nx, ny } = outwardNormalFromTangent(tangent.tx, tangent.ty, anchor.height);
  return { ax: anchor.ax, ay: anchor.ay, tx: tangent.tx, ty: tangent.ty, nx, ny };
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
   *  context — pass `1.25 / zoom` to get a screen-constant hairline). */
  coreWidth: number;
  /** Casing stroke width, same units. Must exceed coreWidth to show. */
  casingWidth: number;
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
 */
export function drawAngleMark(
  ctx: MarkDrawCtx,
  x: number, y: number, size: number,
  mark: AngleMark,
  opts: MarkDrawOpts,
): void {
  const s = size / 16;
  const ax = x + mark.ax * s, ay = y + mark.ay * s;
  const bx = mark.tx * BAR_HALF * s, by = mark.ty * BAR_HALF * s;
  const nx = mark.nx * BARB_LEN * s, ny = mark.ny * BARB_LEN * s;

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(ax - bx, ay - by);       // tangent bar, along the surface
    ctx.lineTo(ax + bx, ay + by);
    ctx.moveTo(ax, ay);                 // barb, out of the solid
    ctx.lineTo(ax + nx, ay + ny);
    ctx.stroke();
  };

  ctx.strokeStyle = opts.casing;
  ctx.lineWidth = opts.casingWidth;
  path();
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.coreWidth;
  path();
}
