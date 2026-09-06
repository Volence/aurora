// THE HOVER PREVIEW'S CROSSOVER FOOTPRINT — "the click will mark THIS".
//
// ═══ WHAT WAS WRONG, PRECISELY ═══════════════════════════════════════════
//
// The collision hover preview draws the stroke's GEOMETRY footprint: one 16px
// outline per cell the stroke would reshape. That is correct and stays — a
// stroke does reshape the whole cell whatever the mark width says.
//
// It drew NOTHING for the MARK. So with the crossover brush armed at "Half
// (8px)", the only picture under the cursor was a 16px cell outline, and the
// author had no way to see which 8px sub-column the click was about to mark —
// or that it was a half at all. Booked at
// docs/reviews/2026-09-04-loops-two-way-mark.md §8 row 2 as the separable
// improvement this module is.
//
// ═══ ⚠ WHY THE RECTS COME OUT OF THE COMMIT PATH'S OWN FUNCTION ══════════
//
// A preview that read the cursor's offset within the cell itself, or took the
// palette's chip at face value, would be right today and would drift the first
// time the commit path's rule moved — silently, because a preview is only ever
// checked by looking at it and it would still LOOK right. So the footprint is
// `crossoverMarkIndices(targets, width, span)`: the same array the stroke
// turns into `crossoverAt`, converted to rects. The width of a rect is
// `CROSSOVER_SUBTILE_PX` — the crossover LENS's unit, so the thing shown
// before the click and the thing shown after it are drawn at one scale.
//
// Nothing here decides a span. The span arrives already resolved by
// `crossoverSpanForCursor`, which is the single call both roads make.

import { crossoverMarkIndices } from '../../core/collision/collision-cell';
import type { CrossoverSpan } from '../../core/collision/layer-transition';
import { CROSSOVER_SUBTILE_PX } from './crossover-lens';

export interface CrossoverPreviewRect { x: number; y: number; w: number; h: number }

/**
 * The sub-tile rects, in WORLD px, that a stroke over `targets` would mark.
 *
 * `width` is the section's width in 8px sub-tiles (SECTION_TILES_WIDE) — the
 * same `width` the commit path passes, because the indices are that path's.
 * `offsetX`/`offsetY` are the section's world origin.
 */
export function crossoverPreviewRects(args: {
  targets: ReadonlyArray<{ cellCol: number; cellRow: number }>;
  span: CrossoverSpan;
  width: number;
  offsetX: number;
  offsetY: number;
}): CrossoverPreviewRect[] {
  const { targets, span, width, offsetX, offsetY } = args;
  const S = CROSSOVER_SUBTILE_PX;
  return crossoverMarkIndices(targets, width, span).map((index) => {
    const tx = index % width;
    const ty = (index - tx) / width;
    return { x: offsetX + tx * S, y: offsetY + ty * S, w: S, h: S };
  });
}
