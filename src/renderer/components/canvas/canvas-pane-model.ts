// The canvas pane's two pure rules: WHICH DOCUMENT it shows, and WHICH GRIDS it
// draws. Both live here rather than inside CanvasMode/CanvasHost because the
// suite renders no React — a rule in a .tsx is a rule no test can reach (Task 14
// is where the components themselves are checked, under CDP).
//
// No store, no React, no canvas.

import type { GridKind } from '../art-shared/PixelViewport';
import type { CanvasGridOrigin } from '../../../core/art/canvas-doc';
import { constraintProfile } from '../../../core/art/canvas-profiles';
import { CANVAS_GRID_CELL, CANVAS_GRID_BLOCK, CANVAS_GRID_CHUNK } from '../../canvas/canvas-colors';

// --- Which document the pane shows -----------------------------------------

/** The minimum a tab has to tell the pane. Matches TabDescriptor structurally so
 *  callers pass the real tab. */
export interface PaneTab { id: string; kind: string; title: string }

/**
 * What the canvas pane renders.
 *
 *   hidden   — the active tab is not a canvas at all; the pane does not mount.
 *   unloaded — a canvas tab whose document is NOT the one the store has focused.
 *   ready    — the tab and the focused document agree; draw it.
 */
export type CanvasPaneState =
  | { kind: 'hidden' }
  | { kind: 'unloaded'; tabId: string; title: string }
  | { kind: 'ready'; docId: string };

/**
 * THE DOCUMENT COMES FROM THE TAB, and `activeDocId` is a mirror to validate
 * against — never an independent source of truth (R14c).
 *
 * The failure this shape prevents: the pane reading `activeDocId` alone renders
 * whatever the store last focused, under whatever tab is active. Every stale-
 * pane bug in this app has that one shape — the sprite pane showed a blank
 * untitled document under an object's name, which read as data loss, and
 * `activateCanvasDoc` was made total precisely so `activeDocId !== tab.id` is a
 * usable "not loaded" test rather than a stale pointer.
 *
 * So a disagreement is rendered as UNLOADED, honestly, rather than as a blank
 * canvas under a real canvas's name. `activateCanvasDoc` sets the focus
 * synchronously before any await, so an in-flight first load does not flash
 * this — a tab that shows it is a tab whose file genuinely did not load.
 */
export function canvasPaneState(
  activeTab: PaneTab | null | undefined,
  activeDocId: string | null,
): CanvasPaneState {
  if (!activeTab || activeTab.kind !== 'art-doc') return { kind: 'hidden' };
  if (activeDocId !== activeTab.id) {
    return { kind: 'unloaded', tabId: activeTab.id, title: activeTab.title };
  }
  return { kind: 'ready', docId: activeTab.id };
}

// --- Which grids get drawn --------------------------------------------------

/**
 * How heavily one grid draws.
 *
 * THESE ARE THE SHARED VIEWPORT'S OWN THREE WEIGHTS, not a scale of this
 * module's invention, and that is the whole point: the same pitch is drawn by
 * `PixelViewport`'s layer when the origin is aligned and by the pane's underlay
 * when it is not, so the two paths have to be pixel-identical apart from
 * position. A two-tier scale is what made an offset 8px mesh brighter than an
 * aligned one — a one-pixel origin nudge reading as a functional change — and
 * made the 8px and 16px grids the same colour in the offset branch, which hides
 * the block grid exactly when someone offsets the origin because they care about
 * block alignment.
 */
export type CanvasGridWeight = 'cell' | 'block' | 'chunk';

/** The stroke each weight draws with. Here rather than in the pane so the
 *  mapping is testable — the defect above lived in two lines of JSX consuming a
 *  correct, exhaustively-tested plan. */
export const CANVAS_GRID_STROKE: Record<CanvasGridWeight, string> = {
  cell: CANVAS_GRID_CELL,
  block: CANVAS_GRID_BLOCK,
  chunk: CANVAS_GRID_CHUNK,
};

/** One grid the shared viewport cannot draw itself, handed to `drawUnderlay`. */
export interface CanvasUnderlayGrid {
  pitch: number;
  /** First line position, in pixels, already folded into 0..pitch-1. */
  offsetX: number;
  offsetY: number;
  weight: CanvasGridWeight;
}

export interface CanvasGridPlan {
  /** PixelViewport's own grid layers (origin 0 only — see planCanvasGrids). */
  layerGrids: GridKind[];
  /** Pitch for the 'block' layer, when one is present. */
  blockPx?: number;
  underlay: CanvasUnderlayGrid[];
}

/** The pitches a profile offers, coarsest last. The MENU; `visibleGrids` is the
 *  selection within it. */
export function offeredGrids(profileId: string): number[] {
  return constraintProfile(profileId).grids;
}

/**
 * Which grids to draw and how.
 *
 * TWO SOURCES, deliberately: the PROFILE says which pitches exist for this
 * document (a sprite has no 256px chunk to align to, so it is not offered one)
 * and the store's `visibleGrids` says which of them the artist wants drawn.
 * Intersecting rather than trusting `visibleGrids` alone is what keeps a stale
 * selection — the grid list is global view state and outlives the document that
 * justified it — from drawing a 256px grid over a sprite canvas.
 *
 * WHY SOME GRIDS GO TO THE UNDERLAY. PixelViewport draws `cell8`/`block` from
 * the buffer's origin in fixed steps and has no offset parameter, but a canvas
 * carries a `gridOrigin` so the guides can align to the ART rather than to the
 * canvas corner (canvas-doc.ts). So a pitch is handed to the shared layer only
 * when its offset is zero — the common case, and the one where the shared code
 * is exactly right — and drawn in the pane's own underlay otherwise. Pitches
 * the viewport has no layer for (256) always take the underlay.
 *
 * The offset is folded into 0..pitch-1 with a floored modulo: a negative origin
 * is legal (the art may start left of the canvas's first tile boundary) and
 * JavaScript's `%` would hand back a negative first line, which draws nothing at
 * all for the leftmost column.
 */
export function planCanvasGrids(
  offered: readonly number[],
  visible: readonly number[],
  origin: CanvasGridOrigin,
): CanvasGridPlan {
  const drawn = offered.filter((p) => p > 0 && visible.includes(p)).sort((a, b) => a - b);
  const plan: CanvasGridPlan = { layerGrids: [], underlay: [] };
  for (const pitch of drawn) {
    const offsetX = mod(origin.originX, pitch);
    const offsetY = mod(origin.originY, pitch);
    const aligned = offsetX === 0 && offsetY === 0;
    if (aligned && pitch === 8) { plan.layerGrids.push('cell8'); continue; }
    // `pitch`, not a literal 16: they are provably equal in this branch, and
    // writing the literal is how the two drift when a profile offers another
    // block-scale pitch.
    if (aligned && pitch === 16) { plan.layerGrids.push('block'); plan.blockPx = pitch; continue; }
    plan.underlay.push({ pitch, offsetX, offsetY, weight: gridWeight(pitch) });
  }
  return plan;
}

/**
 * The weight a pitch draws at.
 *
 * The two thresholds are the Genesis' own units, not tuning: 8px is one TILE
 * (the finest mesh, and the one the shared viewport draws at its lightest), 16px
 * is one BLOCK, and anything coarser is structure — 256px is one chunk. A pitch
 * between them, if a future profile offers one, is closer in meaning to the
 * block grid than to the chunk grid, so it rounds down rather than up.
 */
function gridWeight(pitch: number): CanvasGridWeight {
  if (pitch <= 8) return 'cell';
  if (pitch <= 16) return 'block';
  return 'chunk';
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

// --- Fitting the document to the viewport -----------------------------------

/** Zoom bounds, shared with canvasStore.setZoom — which clamps to the same range,
 *  so a fit that ignored them would be silently corrected and the readout would
 *  disagree with the fit. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 48;
/** The padding `CanvasMode`'s canvasPad puts around the art, in CSS px. */
const FIT_PAD = 24;

/**
 * The integer zoom at which a `docW x docH` document fits a `clientW x clientH`
 * scroller. Pure so the arithmetic is reachable: the sign of the padding, the
 * order of the clamp and the zero-size guard are exactly what goes wrong here,
 * and inside a component closure nothing can test any of them.
 *
 * Returns null when the scroller has not been laid out yet (a zero dimension) —
 * a caller that zoomed anyway would compute a fit against a 0px viewport and
 * land on MIN_ZOOM, which looks to the user like the document opened at 1x for
 * no reason.
 */
export function fitZoom(
  clientW: number, clientH: number, docW: number, docH: number,
): number | null {
  if (clientW <= 0 || clientH <= 0 || docW <= 0 || docH <= 0) return null;
  const z = Math.floor(Math.min((clientW - FIT_PAD) / docW, (clientH - FIT_PAD) / docH));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
