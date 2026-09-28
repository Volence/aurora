// How a ZonePane fits a world rectangle on first show, as data, so the donor
// page harness can bundle the SAME margin it measures against (row 235 (d)).
//
// ROW 235 (d), decided: the target pane fits the WHOLE act, not its painted
// part. On s2_ehz_cpz (8 x 3 sections) that already fills the pane's usable
// height: the act's shape is 16384 x 6144 against an 860 x 319 pane, so height
// binds, and the empty lower two thirds are the act's own unpainted remainder
// (aeon's clips.json declares every row from y 2048 down carries no art bar
// Chemical Plant's 256-px lip). That space is not waste: it is every free
// section origin the act has, so it is where row 235 (a) re-places the draft
// and where the author clicks to place a paste. Fitting to the painted rows
// would hide the destination the page just chose.

import type { PxRect } from '../../../core/formats/donors/donor-tree';

export interface PaneView { scale: number; ox: number; oy: number }

/** Screen px kept clear between a fitted world and each pane edge. */
export const FIT_MARGIN_PX = 16;
export const MIN_SCALE = 1 / 64;
export const MAX_SCALE = 8;

/** The largest view (within the scale limits) that shows all of `r`, centred, `FIT_MARGIN_PX` in from the pane's edges. */
export function fitView(w: number, h: number, r: PxRect): PaneView {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
    Math.min((w - FIT_MARGIN_PX * 2) / r.w, (h - FIT_MARGIN_PX * 2) / r.h)));
  return { scale, ox: r.x - (w / scale - r.w) / 2, oy: r.y - (h / scale - r.h) / 2 };
}
