/**
 * Editor cursor → engine warp destination. ONE function, deliberately.
 *
 * aeon design #2 (floating origin) will change the coordinate contract —
 * unbounded coordinates and a per-act rebase — and when it does, this file is
 * the whole diff. That is the only reason it exists as a module rather than
 * three lines at the call site; the 2026-07-03 spec asked for it explicitly and
 * it has already earned its keep once, when the section-slot model it was
 * originally written against turned out not to exist any more.
 *
 * The editor and the engine agree on world pixels TODAY: an aeon act is flat
 * world coordinates end to end (`section.emp:3` — "the level scrolls live with
 * no section rebases"), and the editor's `sectionWorldOffset` lays sections out
 * on the same grid at the same scale. That correspondence is checked at runtime
 * by `scratchpad/warp-mailbox-harness` rather than assumed, because "the two
 * origins match" is exactly the sort of thing that is true until it isn't.
 */

import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';

/** A section is 256 tiles of 8px on each axis. */
export const SECTION_PX_WIDE = SECTION_TILES_WIDE * 8;
export const SECTION_PX_HIGH = SECTION_TILES_HIGH * 8;

/** The mailbox carries u16 world pixels. */
export const WARP_COORD_MAX = 0xffff;

export interface ActBounds {
  gridWidth: number;
  gridHeight: number;
}

export interface WarpTarget {
  x: number;
  y: number;
  /** True when the act's own bounds moved the point (the cursor was outside). */
  clampedToAct: boolean;
  /** True when the u16 protocol ceiling moved it — see `reachable`. */
  clampedToProtocol: boolean;
  /**
   * False when the act is bigger than the protocol can address, so this point
   * is not reachable by a warp at all. Today no act comes close; when mega-acts
   * land, floating-origin keeps runtime coordinates 16-bit and the mailbox
   * gains an origin field, so this stays a diagnostic rather than a limit.
   */
  reachable: boolean;
}

/**
 * Convert a point in the editor's act-world pixel space to a warp destination.
 *
 * Clamping happens twice on purpose, and the engine clamps a third time: the
 * cursor can legitimately sit outside the authored section grid (the viewport
 * shows more than the act), and a warp there would ask for somewhere that is
 * not level. The engine defends itself too — it publishes back where it
 * actually put the player — so this is the polite answer, not the safe one.
 */
export function warpTargetFor(worldX: number, worldY: number, act: ActBounds): WarpTarget {
  const maxX = Math.max(0, act.gridWidth * SECTION_PX_WIDE - 1);
  const maxY = Math.max(0, act.gridHeight * SECTION_PX_HIGH - 1);

  const ax = Math.round(worldX);
  const ay = Math.round(worldY);

  const actX = Math.min(Math.max(ax, 0), maxX);
  const actY = Math.min(Math.max(ay, 0), maxY);
  const clampedToAct = actX !== ax || actY !== ay;

  const x = Math.min(actX, WARP_COORD_MAX);
  const y = Math.min(actY, WARP_COORD_MAX);
  const clampedToProtocol = x !== actX || y !== actY;

  return {
    x, y, clampedToAct, clampedToProtocol,
    reachable: maxX <= WARP_COORD_MAX && maxY <= WARP_COORD_MAX,
  };
}
