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
 * on the same grid at the same scale.
 *
 * ⚠ IT WAS ASSUMED AND UNCHECKED UNTIL 2026-09-04, and the claim of a check was
 * worse than the gap: this paragraph used to say it was "checked at runtime by
 * `scratchpad/warp-mailbox-harness`" — an instrument that has never existed in
 * this repo, in the tree or in its history. The two things that DO exist answer
 * other questions and must not be read as covering this one:
 * `warp-math.test.ts` is arithmetic only (rounding, the act clamp, the protocol
 * clamp) and never leaves the editor; `scratchpad/warp-tearing-harness.mjs`
 * diffs the plane nametable between two routes to the SAME destination, which
 * is silent about whether that destination is the pixel the editor meant.
 *
 * IT IS CHECKED NOW, live, by `test/live/aeon-warp-correspondence.test.ts`
 * (opt-in: `AURORA_LIVE_AEON_WARP=1`, needs a built `s4.debug.bin` and
 * `oracle-aether`; run it after changing this file, `src/main/aether/warp.ts`, or
 * aeon's `Debug_Warp_Consume` / `Player_BoundsInit`). It warps to two known
 * editor world pixels and reads `Player_1`'s SST position OUT OF RAM — a
 * screenshot cannot answer this — and asserts the player is at the cursor
 * pixel, that two different pixels give two different landings differing by
 * exactly the distance asked for, and that the act clamp's legitimate
 * editor/engine DISAGREEMENT is the size the two margins say it is. First run
 * 2026-09-04 on aeon's 3x3 act: (1024,96) and (1801,429) both landed exactly,
 * delta (0,0) — see `docs/reviews/2026-09-04-warp-correspondence.md`.
 *
 * ⚠ THE ENGINE CLAMPS TIGHTER THAN THIS FILE DOES, and that is the one place
 * the two do not agree. `warpTargetFor` clamps to the last addressable pixel of
 * the act (`grid * SECTION_PX - 1`); aeon clamps to its own playable edges
 * (`Player_Bound_Right` = width - PBOUND_RIGHT_MARGIN, `Player_Bound_Bottom` =
 * height - SCREEN_HEIGHT), so a cursor in the act's last 24 px of width or last
 * 224 px of height lands short of where it was put. Measured, not deduced. That
 * is the engine's business — it publishes back where it actually put the player
 * and `warpTo` reports it as `clamped` — but a caller that ever needs the two
 * to agree at the edges has to read the bounds off the engine, not compute them
 * here.
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
