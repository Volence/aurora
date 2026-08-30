// THE PRIORITY LENS ON THE ART FACET — the third mount of one picture.
//
// ROADMAP O17. The map got the violet veil on 2026-08-28 (priority-lens.ts) and
// classic's viewport has had it since 337d2d3, but the aeon composer — the
// surface where an author BUILDS the chunk whose priority bits the map then
// shows them — could not show it at all. So a chunk captured out of a
// high-priority cliff opened looking exactly like a chunk captured out of the
// sky behind it, and the stamp that O12 taught to say `keep` was keeping a field
// the author still could not see.
//
// SAME PICTURE, NOT A SECOND ONE. `drawTileLens` with `PRIORITY_FILL` /
// `PRIORITY_EDGE` — the same module, the same colours, the same merged-run veil
// and the same boundary stroke both other viewports use. An author who has
// learned "violet = it draws in front of you" on the map has learned it here.
// Nothing about priority lives in this file that is not already true of the
// others; what is different is only where the bit is read from.
//
// ═══ THE BIT COMES OFF A CELL, NOT A WORD ═══
//
// The map reads bit 15 of a packed nametable word. A composer document has not
// been packed yet — `ComposerCell.pri` is a boolean field, and `sliceForSave`
// turns it into bit 15 at save time. That is the same distinction O12 tripped
// over (the composer's stamp was invisible to a `packNametableWord` grep because
// it builds a CELL), and it is why this cannot simply call `drawSectionPriority`
// with a different origin.
//
// ═══ NO WINDOWING, AND THAT IS NOT AN OVERSIGHT ═══
//
// priority-lens.ts windows to the viewport because an aeon SECTION is 256x256 =
// 65,536 tiles and an act may hold 48 of them. A composer document is capped at
// 64x64 tiles by the New Chunk dialog's `clampDim`, i.e. 4,096 cells worst case
// and 256 for the usual 16x16 chunk — three orders of magnitude under the map's
// problem, and the whole document is on screen at composer zooms anyway. A
// window here would be machinery earning nothing.
//
// ═══ THE CONTEXT IS NOT ZOOM-SCALED, SO THE ZOOM GOES IN THE TILE ═══
//
// `PixelViewport` hands `drawOverlay` a context translated to the document
// origin but NOT scaled — every existing overlay in ComposerCanvas multiplies by
// `z` itself. `drawTileLens` multiplies coordinates by `tilePx` and treats
// `invZoom` as "one screen pixel in world units", so passing `tilePx = 8 * zoom`
// and `invZoom = 1` renders the identical picture in screen space with a
// 1-screen-px stroke at every zoom. Do not "fix" this to 8 and 1/zoom: that is
// the map's convention, on a context the map's convention holds for.
//
// A LIVE-TILE DOCUMENT IS REFUSED, and reports why. `docFromTile` opens ONE
// atlas tile with no placement anywhere; priority is a property of a placement,
// so a veil there would be asserting something the document cannot know. The
// cell's `pri` is `false` in that case regardless, so this changes no pixel — it
// changes what the report says, which is the difference between "nothing to
// mark" and "this surface has no such field".

import type { ComposerDoc } from '../../core/art/composer-buffer';
import { PRIORITY_FILL, PRIORITY_EDGE } from './canvas-colors';
import { drawTileLens, type TileLensDrawn } from './tile-lens';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A VDP pattern is 8x8 and one `ComposerCell` is one pattern. */
export const COMPOSER_LENS_TILE_PX = 8;

/**
 * Veil the high-priority cells of a composer document.
 *
 * `zoom` is screen pixels per art pixel (`artStore` zoom), matching the second
 * argument `PixelViewport` hands every `drawOverlay`.
 */
export function drawComposerPriority(ctx: Ctx, doc: ComposerDoc, zoom: number): TileLensDrawn {
  return drawTileLens(ctx, {
    cols: doc.widthTiles,
    rows: doc.heightTiles,
    colStart: 0,
    colEnd: doc.widthTiles,
    rowStart: 0,
    rowEnd: doc.heightTiles,
    tilePx: COMPOSER_LENS_TILE_PX * zoom,
    originX: 0,
    originY: 0,
    marked: (tx, ty) => !!doc.cells[ty * doc.widthTiles + tx]?.pri,
    fill: PRIORITY_FILL,
    edge: PRIORITY_EDGE,
    invZoom: 1,
  });
}

export interface ComposerPriorityLensReport {
  /** Did the last composer repaint draw the lens at all? */
  active: boolean;
  /**
   * Why not, when it did not.
   *  - `off`        — the `showPriority` overlay is switched off.
   *  - `no-doc`     — nothing is open, so there is nothing to mark.
   *  - `live-tile`  — a single atlas tile, which has no placement and therefore
   *                   no priority bit. See the docblock.
   */
  reason: 'off' | 'no-doc' | 'live-tile' | null;
  /** Document extent the pass covered, in cells. */
  cells: number;
  /** Cells whose `pri` is set — the model's own count, independent of drawing,
   *  so a harness can tell "nothing to mark" from "the lens drew nothing". */
  priorityCells: number;
  /** `fillRect` calls issued — merged runs, so <= priorityCells. */
  veils: number;
  /** Boundary segments stroked. */
  segments: number;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

const IDLE: Omit<ComposerPriorityLensReport, 'paints'> = {
  active: false, reason: 'no-doc', cells: 0, priorityCells: 0, veils: 0, segments: 0,
};

let lastReport: ComposerPriorityLensReport = { ...IDLE, paints: 0 };

export function publishComposerPriorityLensReport(
  r: Omit<ComposerPriorityLensReport, 'paints'>,
): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastComposerPriorityLensReport(): ComposerPriorityLensReport {
  return lastReport;
}

/** The model's own priority count for a document — the report's anti-vacuous
 *  companion, and the only thing in this module that is true with no canvas. */
export function countPriorityCells(doc: ComposerDoc): number {
  let n = 0;
  for (const c of doc.cells) if (c.pri) n++;
  return n;
}
