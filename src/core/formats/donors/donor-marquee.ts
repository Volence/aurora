// The donor-page marquee: two world points in, one clip source rectangle out.
//
// ═══ THE RULES, AND WHO OWNS EACH ═════════════════════════════════════════
//
//   * EVERY COORDINATE A MULTIPLE OF 8. Aeon's R6: an editor section file is a
//     grid of 8-px cells with no sub-tile addressing, so there is nothing finer
//     to round to. The marquee snaps OUTWARD: the rectangle is every cell the
//     drag touched, never a cell fewer, so the readout names what the author saw
//     covered.
//   * INSIDE THE CROP. Aeon's R9 refuses a src_rect past `extent.crop_tiles`,
//     because outside it there is only the converter's zero padding. The marquee
//     clamps to the crop rather than letting the author draw a rectangle the
//     paste will refuse; the crop is a multiple of 8 on every edge (it is in
//     cells), so clamping cannot break the first rule.
//   * NOT HERE: R12. The paste SHIFT must be a multiple of 16 px, which is a
//     property of the source AND the destination together, so it is the
//     destination's rule (the paste slice owns it), and aeon's loader is what
//     finally holds it.
//
// Pure: world pixels in, world pixels out.

import type { PxRect } from './donor-tree';

export const MARQUEE_SNAP_PX = 8;

/** Aeon's collision quantum: a paste must move the clip by a multiple of this (R12). */
export const COLLISION_QUANTUM_PX = 16;

export interface WorldPoint { x: number; y: number }

/**
 * The rectangle a drag from `a` to `b` covers, snapped outward to the 8-px cell
 * grid and clamped to `crop`, or null when nothing of it is inside the crop.
 *
 * A point exactly on a cell boundary belongs to the cell to its right/below,
 * the same rule `Math.floor` gives everywhere else in the map code.
 */
export function marqueeRect(a: WorldPoint, b: WorldPoint, crop: PxRect): PxRect | null {
  const s = MARQUEE_SNAP_PX;
  let x0 = Math.floor(Math.min(a.x, b.x) / s) * s;
  let y0 = Math.floor(Math.min(a.y, b.y) / s) * s;
  let x1 = (Math.floor(Math.max(a.x, b.x) / s) + 1) * s;
  let y1 = (Math.floor(Math.max(a.y, b.y) / s) + 1) * s;
  x0 = Math.max(x0, crop.x);
  y0 = Math.max(y0, crop.y);
  x1 = Math.min(x1, crop.x + crop.w);
  y1 = Math.min(y1, crop.y + crop.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The readout line under the donor view, in world pixels and in cells. */
export function marqueeReadout(r: PxRect): string {
  return `x ${r.x} y ${r.y} w ${r.w} h ${r.h} px `
    + `(${r.w / MARQUEE_SNAP_PX} x ${r.h / MARQUEE_SNAP_PX} cells)`;
}

/**
 * True when the source origin sits on the 16-px collision grid in both axes.
 *
 * Advisory, not a rule of this page: aeon's R12 is about the SHIFT, and a
 * source 8 px off the grid can still be pasted by moving the destination 8 px
 * off it too. But a section-aligned destination is a multiple of 16, so a
 * source off the grid can never be pasted section-aligned, and the page says
 * so before the author picks a destination.
 */
export function onCollisionGrid(r: PxRect): boolean {
  return r.x % COLLISION_QUANTUM_PX === 0 && r.y % COLLISION_QUANTUM_PX === 0;
}
