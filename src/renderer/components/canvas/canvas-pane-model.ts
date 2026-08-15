// The canvas pane's two pure rules: WHICH DOCUMENT it shows, and WHICH GRIDS it
// draws. Both live here rather than inside CanvasMode/CanvasHost because the
// suite renders no React — a rule in a .tsx is a rule no test can reach (Task 14
// is where the components themselves are checked, under CDP).
//
// No store, no React, no canvas.

import type { GridKind } from '../art-shared/PixelViewport';
import type { CanvasGridOrigin } from '../../../core/art/canvas-doc';
import { constraintProfile } from '../../../core/art/canvas-profiles';

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

/** One grid the shared viewport cannot draw itself, handed to `drawUnderlay`. */
export interface CanvasUnderlayGrid {
  pitch: number;
  /** First line position, in pixels, already folded into 0..pitch-1. */
  offsetX: number;
  offsetY: number;
  /** Ranks the line weight — the pane maps it to a colour. Coarser pitches read
   *  as structure and must not disappear under the 8px mesh. */
  weight: 'fine' | 'coarse';
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
    if (aligned && pitch === 16) { plan.layerGrids.push('block'); plan.blockPx = 16; continue; }
    plan.underlay.push({ pitch, offsetX, offsetY, weight: pitch >= 64 ? 'coarse' : 'fine' });
  }
  return plan;
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}
