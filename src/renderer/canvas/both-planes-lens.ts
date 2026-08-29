// THE BOTH-PLANES LENS — "this cell is solid on path A AND path B".
//
// WHY IT MUST EXIST BEFORE THE BRUSH IS SAFE. The collision overlay shows ONE
// plane at a time — CollisionPalette's `pickPlane` literally turns the other
// off, so that "show the plane you're editing" holds. A stroke that also writes
// the other plane is therefore, by construction, half invisible. That is the
// same trap `priority-lens.ts` was built for and its argument is the one being
// reused: a default whose failure mode you can SEE beats one that ambushes you,
// so the mode arms the lens (editorStore `setCollisionPaintBothPlanes`) rather
// than trusting the author to go looking.
//
// ═══ IT DRAWS A DERIVED FACT, NOT A STORED FLAG ═══
//
// Nothing anywhere records that the author pressed "Both". What is recorded is
// the consequence — the same shape and solidity in both plane arrays — and that
// is what this reads (`solidOnBothPlanes`). A stored flag could disagree with
// the data it describes; this cannot. It also means the lens is immediately
// truthful about content nobody painted with this brush: aeon measured OJZ
// section 0 with 644 cells solid on A and air on B and zero the other way, and
// on that section this lens correctly veils only the cells that really are on
// both, which is the picture the §4.2 finding is about.
//
// ═══ SHAPE, LANGUAGE AND COST ═══
//
// Same depiction as the priority lens (`drawTileLens` — merged veil runs plus a
// boundary stroke), in teal rather than violet, so an author who has learned one
// has learned the other. The CELL is 16px here, not 8: this is a statement about
// a collision cell, and the collision overlay it stacks on draws on the same
// 16px grid. `drawTileLens` takes the edge in world px, so one constant is the
// whole difference.
//
// WINDOWED TO THE VIEWPORT for priority-lens.ts's reason: a section is 128x128
// collision cells and an act may hold 48 of them, so an unwindowed scan would be
// ~786k predicate pairs per repaint against a measured ~15.7ms frame headroom.
// The window is computed the way `drawCollisionOverlay` computes its own, so the
// two agree about what "visible" means.
//
// NO CLOCK, NO CACHE — drawn straight into the pass that already repaints on a
// pan, a zoom, a store change, a paint edit and an undo.

import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import { solidOnBothPlanes } from '../../core/collision/both-planes-paint';
import { BOTH_PLANES_FILL, BOTH_PLANES_EDGE } from './canvas-colors';
import { drawTileLens, type TileLensDrawn } from './tile-lens';
import type { LensViewport } from './priority-lens';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Collision cell edge in world px. A cell is 2x2 patterns; the collision
 *  planes are indexed per PATTERN, which is why the probe below multiplies. */
export const BOTH_PLANES_CELL_PX = 16;

/** Cells across / down a section, DERIVED from the tile geometry rather than
 *  typed, so a section resize cannot leave this behind. */
export const SECTION_CELLS_WIDE = SECTION_TILES_WIDE / 2;
export const SECTION_CELLS_HIGH = SECTION_TILES_HIGH / 2;

/**
 * Veil the collision cells of ONE section, inside the viewport, that are solid
 * on both planes. `offsetX`/`offsetY` are the section's world origin.
 *
 * `planeB` may be null — a section whose second plane was never seeded. That
 * veils nothing, which is the honest answer ("nothing is on both planes yet"),
 * and it is a real result a harness row can fail on rather than an error.
 */
export function drawSectionBothPlanes(
  ctx: Ctx,
  viewport: LensViewport,
  planeA: ArrayLike<number>,
  planeB: ArrayLike<number> | null,
  offsetX: number,
  offsetY: number,
): TileLensDrawn {
  if (!planeB) return { veils: 0, segments: 0 };
  const { x: vpX, y: vpY, width, height, zoom } = viewport;
  const vpW = width / zoom, vpH = height / zoom;
  const localVpX = vpX - offsetX, localVpY = vpY - offsetY;
  const C = BOTH_PLANES_CELL_PX;

  return drawTileLens(ctx, {
    cols: SECTION_CELLS_WIDE, rows: SECTION_CELLS_HIGH,
    colStart: Math.floor(localVpX / C), colEnd: Math.ceil((localVpX + vpW) / C),
    rowStart: Math.floor(localVpY / C), rowEnd: Math.ceil((localVpY + vpH) / C),
    tilePx: C,
    originX: offsetX, originY: offsetY,
    // A collision CELL's word lives at its top-left PATTERN. The other three
    // sub-tiles carry the same word (every writer in the editor expands a cell
    // through `cellTileIndices`), so the top-left is the cell's value and
    // probing all four would be three redundant reads per cell per repaint.
    marked: (cx, cy) => {
      const i = (cy * 2) * SECTION_TILES_WIDE + cx * 2;
      return solidOnBothPlanes(planeA[i], planeB[i]);
    },
    fill: BOTH_PLANES_FILL, edge: BOTH_PLANES_EDGE,
    invZoom: 1 / zoom,
  });
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// reason priority-lens.ts's report exists: a harness reading this can tell
// "veiled N cells" from "would veil N if anything were drawing", and
// `active: false` is a real answer a row can fail on.
// ---------------------------------------------------------------------------

export interface BothPlanesLensReport {
  /** Did the last repaint draw the lens at all? */
  active: boolean;
  /** Why not, when it did not. Three distinct answers, kept apart because a
   *  row must be able to fail on the difference:
   *   • `off`        — the View toggle is off.
   *   • `bg-layer`   — the author is editing the background plane, where the
   *                    overlay pass that would draw this never runs at all.
   *   • `no-plane-b` — the toggle was ON and the lens ran, but no section it
   *                    was given had a second collision plane, so zero veils
   *                    means "nothing to compare against", not "nothing marked". */
  reason: 'off' | 'bg-layer' | 'no-plane-b' | null;
  /** Sections the lens ran over. */
  sections: number;
  /** Sections that actually had a plane B to compare against. */
  sectionsWithPlaneB: number;
  /** `fillRect` calls issued — merged runs, so <= cells veiled. */
  veils: number;
  /** Boundary segments stroked. */
  segments: number;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

let lastReport: BothPlanesLensReport = {
  active: false, reason: 'off', sections: 0, sectionsWithPlaneB: 0,
  veils: 0, segments: 0, paints: 0,
};

export function publishBothPlanesLensReport(r: Omit<BothPlanesLensReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastBothPlanesLensReport(): BothPlanesLensReport {
  return lastReport;
}
