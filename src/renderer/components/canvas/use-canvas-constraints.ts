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
  CanvasConstraintReport, UniqueTileCount, CanvasCellClash, CanvasFrameSize,
  CellClashKind,
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
    // UPPERCASED. `ZoneActRef.zone` is the project's internal slug — 'ghz',
    // 'lz' — and the readout was printing it raw, so a status bar that says
    // "Green Hill Zone Act 1" three inches to its left also said "free in ghz
    // 1". Found under CDP, not in a unit test, because only the running app
    // puts the two spellings on one line. Presentation only: nothing downstream
    // reads this string.
    parts.push(`${budget.freeSlots} free in ${budget.act.zone.toUpperCase()} ${budget.act.act}`);
    parts.push(`pool ${budget.poolUsed}/${budget.poolTotal}`);
  }
  if (tiles.pixelsOutsideGrid > 0) parts.push(`${tiles.pixelsOutsideGrid}px outside the grid`);
  return parts.join(' · ');
}

export const BUDGET_TOOLTIP =
  'Unique 8×8 tiles in this canvas, counting flips as one. Committing matches '
  + 'against the pool first, so the slots actually claimed can be fewer than this.';

/**
 * Colours in use per line, against the 15 an artist can actually spend — entry
 * 0 is transparency in every line, so a "16" here would promise a colour that
 * does not exist.
 *
 * Lines the profile does not have print as `—` UNLESS something is drawn in
 * them, in which case the count shows. Hiding it would leave the artist with a
 * clash tint and no number anywhere that explains where the stray pixels are.
 */
export function colorsReadout(perLine: number[], max: number, profileLines = perLine.length): string {
  const shown = perLine.map((n, i) => (i < profileLines || n > 0 ? String(n) : '--'));
  while (shown.length > profileLines && shown[shown.length - 1] === '--') shown.pop();
  return `colours ${shown.join('·')} / ${max} per line`;
}

/** The sprite frame's size in tiles, naming the hardware bound only when it is
 *  exceeded — a canvas holding a sheet of frames is legitimate, so this states
 *  a size rather than nagging about one. */
export function frameReadout(frame: CanvasFrameSize | null): string {
  if (!frame) return '';
  const size = `frame ${frame.tilesWide}×${frame.tilesHigh} tiles`;
  return frame.overBound ? `${size} (one sprite is ${frame.maxTiles}×${frame.maxTiles} max)` : size;
}

/**
 * Whether ANY cell violates the palette-line rule — a boolean, never a count.
 *
 * Spec §4.3: structural violations surface as a live highlight and never as a
 * number, because no surveyed tool gives this class a numeric count and none
 * combines both for one constraint. The overlay toggle lights off this; the
 * canvas itself says where.
 */
export function clashSignal(clashes: readonly CanvasCellClash[]): boolean {
  return clashes.length > 0;
}

export interface ClashRect { x: number; y: number; w: number; h: number; kind: CellClashKind }

/**
 * What the overlay draws, in DOCUMENT pixels — the viewport applies the zoom
 * and the origin translation, so nothing here knows about either.
 *
 * A partial cell keeps its real width and height. Rounding it up to 8x8 would
 * tint pixels outside the canvas at the offset edge; rounding it away would
 * hide a real clash in the band a non-zero grid origin creates.
 */
export function planClashOverlay(
  clashes: readonly CanvasCellClash[], show: boolean,
): ClashRect[] {
  if (!show) return [];
  return clashes.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: c.kind }));
}
