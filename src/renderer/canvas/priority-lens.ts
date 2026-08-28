// THE AEON PRIORITY LENS — "which foreground art will draw in front of me".
//
// The owner, playing the game: "No way to see what art on fg is priority or
// not. Randomly sometimes sonic just goes behind a tile that I wasn't aware was
// prioritised." The complaint is SURPRISE, not missing data, so the answer is a
// mark on the map at the place the ambush happens, not a table.
//
// SAME LANGUAGE AS CLASSIC, DELIBERATELY. The picture is `drawTileLens`
// (tile-lens.ts) with `PRIORITY_FILL` / `PRIORITY_EDGE` — the exact colours,
// alpha and shape the classic viewport's lens has used since commit 337d2d3.
// Two lenses in one app that mean the same thing must not look different, and
// the toggle is literally the same store key (`showPriority`) with the same
// View-menu label, so an author who learns "violet = it is in front of you" in
// one viewport has learned it in both.
//
// WHAT DIFFERS FROM CLASSIC, and why it is not a second design:
//
//  • The bit comes off a flat 8px nametable word, not a chunk→block→quad
//    composition (core/model/nametable-priority.ts says why there is nothing to
//    lift from priority-mask.ts).
//  • It WINDOWS TO THE VIEWPORT. Classic iterates the visible chunks it is
//    already drawing, 1,024 tiles each. An aeon section is 256x256 = 65,536
//    tiles and an act may hold up to MAX_ACT_SECTIONS = 48 of them, so an
//    unwindowed scan would be ~3.1M predicate calls PER REPAINT — a pan would
//    stutter and MapViewport's measured ~15.7ms frame headroom would be gone.
//    The window is computed exactly the way drawCollisionOverlay computes its
//    own (OverlayRenderer.drawCollisionOverlay), so the two agree about what
//    "visible" means.
//
// NO CLOCK, NO CACHE. This draws straight onto the map context inside the pass
// that already repaints on a pan, a zoom, a store change, a paint edit and an
// undo. It never touches the SectionRenderer's cached section canvases, so a
// nametable edit cannot leave a stale veil baked into art: the veil is not in
// the art, it is over it.

import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import { tileWordDrawsAboveSprites } from '../../core/model/nametable-priority';
import { PRIORITY_FILL, PRIORITY_EDGE } from './canvas-colors';
import { drawTileLens, type TileLensDrawn } from './tile-lens';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Tile edge in world px — a VDP pattern is 8x8 and a nametable word is one. */
export const LENS_TILE_PX = 8;

export interface LensViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/**
 * Veil the high-priority foreground tiles of ONE section that fall inside the
 * viewport. `offsetX`/`offsetY` are the section's world origin.
 *
 * Returns what it painted. Zero veils is a real answer — the window holds no
 * high-priority tile — and the caller publishes it rather than swallowing it,
 * so a harness can tell "nothing to mark" from "the lens never ran".
 */
export function drawSectionPriority(
  ctx: Ctx,
  viewport: LensViewport,
  nametable: Uint16Array,
  offsetX: number,
  offsetY: number,
): TileLensDrawn {
  const { x: vpX, y: vpY, width, height, zoom } = viewport;
  const vpW = width / zoom, vpH = height / zoom;
  // Section-local viewport rect, in world px, then in tiles. Same derivation as
  // drawCollisionOverlay's, with 8 where it uses 16.
  const localVpX = vpX - offsetX, localVpY = vpY - offsetY;
  const colStart = Math.floor(localVpX / LENS_TILE_PX);
  const rowStart = Math.floor(localVpY / LENS_TILE_PX);
  const colEnd = Math.ceil((localVpX + vpW) / LENS_TILE_PX);
  const rowEnd = Math.ceil((localVpY + vpH) / LENS_TILE_PX);

  return drawTileLens(ctx, {
    cols: SECTION_TILES_WIDE, rows: SECTION_TILES_HIGH,
    colStart, colEnd, rowStart, rowEnd,
    tilePx: LENS_TILE_PX,
    originX: offsetX, originY: offsetY,
    // The nametable's own stride. A word outside the array reads `undefined`,
    // and `undefined & 0x8000` is 0 — but drawTileLens range-checks against
    // cols/rows before ever calling this, so that path is unreachable by
    // construction rather than by luck.
    marked: (tx, ty) => tileWordDrawsAboveSprites(nametable[ty * SECTION_TILES_WIDE + tx]),
    fill: PRIORITY_FILL, edge: PRIORITY_EDGE,
    invZoom: 1 / zoom,
  });
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// same reason effects-guides.ts's and screen-frame.ts's reports exist: a harness
// reading this can tell "veiled N tiles" from "would veil N if anything were
// drawing", and `active: false` is a real answer a row can fail on.
// ---------------------------------------------------------------------------

export interface PriorityLensReport {
  /** Did the last repaint draw the lens at all? */
  active: boolean;
  /** Why not, when it did not: the toggle, or the BG layer (no FG to mark). */
  reason: 'off' | 'bg-layer' | null;
  /** Sections the lens ran over (the ones the draw pass was given). */
  sections: number;
  /** `fillRect` calls issued across them — merged runs, so <= tiles veiled. */
  veils: number;
  /** Boundary segments stroked across them. */
  segments: number;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

let lastReport: PriorityLensReport = {
  active: false, reason: 'off', sections: 0, veils: 0, segments: 0, paints: 0,
};

export function publishPriorityLensReport(r: Omit<PriorityLensReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastPriorityLensReport(): PriorityLensReport {
  return lastReport;
}
