// What the canvas's constraint numbers are, and what they are measured against.
//
// The SHAPING is pure and lives at the bottom of this file so the suite (which
// renders no React) can reach it; the hooks above are wiring only. That split is
// the same one canvas-pane-model.ts makes, for the same reason: a rule inside a
// hook is a rule no test can execute.

import { useMemo } from 'react';
import { useCanvasStore } from '../../state/canvasStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useEditableTileRange } from '../classic/composer-shared';
import { isTileEditable } from '../../../core/project/editable-tiles';
import { buildUsageIndex } from '../../../core/level-classic/usage-index';
import { countFreeTileSlots } from '../../../core/art/free-tile-slots';
import { constraintProfile } from '../../../core/art/canvas-profiles';
import { cachedConstraints } from '../../state/canvas-constraints-cache';
import type {
  CanvasConstraintReport, UniqueTileCount,
} from '../../../core/art/canvas-constraints';

/**
 * This document's constraint report, or NULL while the unconstrained toggle is
 * off.
 *
 * Null rather than a stale or empty report: an empty `clashes` array means "no
 * clashes", and handing that back while checking is suspended would report a
 * clean canvas that nobody checked — the exact shape of a guard that asserts
 * nothing. The consumers render `—` instead.
 */
export function useCanvasConstraints(docId: string): CanvasConstraintReport | null {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const live = useCanvasStore((s) => s.constraintsLive);
  const pixels = doc?.pixels, profileId = doc?.profileId, gridOrigin = doc?.gridOrigin;
  return useMemo(() => {
    if (!pixels || !profileId || !gridOrigin || !live) return null;
    // Through the shared cache, so this hook's two callers (the readout and the
    // overlay) scan once between them rather than once each.
    return cachedConstraints({
      pixels, profile: constraintProfile(profileId), origin: gridOrigin,
    });
  }, [pixels, profileId, gridOrigin, live]);
}

export interface CanvasTileBudget {
  /** Null when no classic act is open — the canvas is a free-standing document
   *  and may well be the only thing on screen. */
  act: { zone: string; act: number } | null;
  freeSlots: number | null;
  poolUsed: number | null;
  poolTotal: number | null;
}

/**
 * The open act's tile budget, live.
 *
 * Recomputed when the level doc changes IDENTITY, which is what a command, an
 * undo and an act switch all produce — the same key ClassicComposerDock uses for
 * the same index. It moves when the user switches acts, and that is correct
 * rather than unfortunate: the budget genuinely is a property of the act you are
 * aiming at, and a number frozen to whichever act happened to be open when the
 * canvas was created would be a stale answer that looks stable.
 */
export function useCanvasTileBudget(): CanvasTileBudget {
  const ref = useClassicLevelStore((s) => s.ref);
  const doc = useClassicLevelStore((s) => s.doc);
  const reservedTiles = useClassicLevelStore((s) => s.reservedTiles);
  const range = useEditableTileRange();

  return useMemo(() => {
    if (!ref || !doc) return shapeTileBudget({ ref: null, poolTileCount: 0, freeSlots: 0 });
    const poolTileCount = Math.floor(doc.tiles.length / 32);
    const freeSlots = countFreeTileSlots({
      poolTileCount, usage: buildUsageIndex(doc),
      reserved: reservedTiles ?? null, isEditable: (t) => isTileEditable(range, t),
    });
    return shapeTileBudget({ ref: { zone: ref.zone, act: ref.act }, poolTileCount, freeSlots });
  }, [ref, doc, reservedTiles, range]);
}

// --- The pure half ----------------------------------------------------------

export function shapeTileBudget(input: {
  ref: { zone: string; act: number } | null;
  poolTileCount: number;
  freeSlots: number;
}): CanvasTileBudget {
  if (!input.ref) return { act: null, freeSlots: null, poolUsed: null, poolTotal: null };
  return {
    act: input.ref,
    freeSlots: input.freeSlots,
    poolUsed: input.poolTileCount - input.freeSlots,
    poolTotal: input.poolTileCount,
  };
}

/**
 * The tile line of the readout.
 *
 * IT DOES NOT COMPARE THE TWO NUMBERS, and that is deliberate. The unique count
 * is what the drawing CONTAINS; commit matches against the existing pool first
 * (spec §4.4 step 3), so the slots actually claimed can be far fewer. Rendering
 * "37 > 17, this will not fit" would state as fact something 2C has not
 * computed yet. Both numbers, side by side, and the tooltip explains the gap.
 */
export function budgetReadout(tiles: UniqueTileCount, budget: CanvasTileBudget): string {
  const parts = [`tiles ${tiles.unique} unique`];
  if (budget.act) {
    parts.push(`${budget.freeSlots} free in ${budget.act.zone} ${budget.act.act}`);
    parts.push(`pool ${budget.poolUsed}/${budget.poolTotal}`);
  }
  if (tiles.pixelsOutsideGrid > 0) parts.push(`${tiles.pixelsOutsideGrid}px outside the grid`);
  return parts.join(' · ');
}

export const BUDGET_TOOLTIP =
  'Unique 8×8 tiles in this canvas, counting flips as one. Committing matches '
  + 'against the pool first, so the slots actually claimed can be fewer than this.';
