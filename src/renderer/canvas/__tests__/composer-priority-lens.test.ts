// THE ART FACET'S PRIORITY LENS — geometry, not "it drew something".
//
// tile-lens.test.ts already pins the shared depiction. What is NEW here and can
// go wrong here is the mapping from a composer document onto that depiction:
// the bit is read off `ComposerCell.pri` rather than bit 15 of a word, and the
// context PixelViewport hands `drawOverlay` is translated but NOT zoom-scaled,
// so the zoom has to ride in `tilePx`. Get that second part wrong and the veil
// lands in the top-left corner of a zoomed canvas — still "drawing something".
//
// WHAT THIS FILE CANNOT SEE: React, a real canvas, the option-bar chip, or
// whether the lens is on screen. That is O17's CDP harness.

import { describe, it, expect } from 'vitest';
import {
  drawComposerPriority, countPriorityCells,
  publishComposerPriorityLensReport, lastComposerPriorityLensReport,
  COMPOSER_LENS_TILE_PX,
} from '../composer-priority-lens';
import { PRIORITY_FILL, PRIORITY_EDGE } from '../canvas-colors';
import { createDoc } from '../../../core/art/composer-buffer';
import type { ComposerDoc } from '../../../core/art/composer-buffer';

interface Rect { x: number; y: number; w: number; h: number }

function recCtx() {
  const rects: Rect[] = [];
  const pts: Array<{ x: number; y: number }> = [];
  const styles: string[] = [];
  const ctx = {
    lineWidth: 0,
    set fillStyle(v: string) { styles.push(`fill:${v}`); },
    set strokeStyle(v: string) { styles.push(`stroke:${v}`); },
    beginPath() {}, stroke() {},
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }); },
    moveTo(x: number, y: number) { pts.push({ x, y }); },
    lineTo(x: number, y: number) { pts.push({ x, y }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, pts, styles };
}

/** A 4x4-cell document with the named cells carrying priority. */
function doc4(marks: Array<[number, number]>): ComposerDoc {
  const doc = createDoc(4, 4);
  for (const [cx, cy] of marks) {
    doc.cells[cy * 4 + cx].atlasTile = 7;   // real art, so the mark is not "air"
    doc.cells[cy * 4 + cx].pri = true;
  }
  return doc;
}

describe('drawComposerPriority — the cell is the subject', () => {
  it('veils exactly the priority cell, at its DOC position', () => {
    const { ctx, rects } = recCtx();
    const drawn = drawComposerPriority(ctx, doc4([[1, 2]]), 1);
    expect(rects).toEqual([{ x: 8, y: 16, w: 8, h: 8 }]);
    expect(drawn.veils).toBe(1);
  });

  it('draws NOTHING for a document with no priority cell', () => {
    const { ctx, rects, pts } = recCtx();
    const drawn = drawComposerPriority(ctx, doc4([]), 1);
    expect(rects).toEqual([]);
    expect(pts).toEqual([]);
    expect(drawn).toEqual({ veils: 0, segments: 0 });
  });

  it('does not veil a DRAWN cell that merely has art (the anti-vacuous half)', () => {
    // The failure this excludes is a lens keyed on "the cell is not empty",
    // which would veil the whole chunk and pass every row above.
    const doc = createDoc(2, 1);
    doc.cells[0].atlasTile = 7;            // art, no priority
    doc.cells[1].atlasTile = 9;
    doc.cells[1].pri = true;               // art AND priority
    const { ctx, rects } = recCtx();
    drawComposerPriority(ctx, doc, 1);
    expect(rects).toEqual([{ x: 8, y: 0, w: 8, h: 8 }]);
  });

  it('SCALES BY ZOOM through tilePx — the context is translated, never scaled', () => {
    // PixelViewport hands drawOverlay an unscaled context (every other overlay
    // in ComposerCanvas multiplies by z itself). A lens that passed tilePx=8
    // and invZoom=1/zoom would put an 8px veil at (8,16) on a canvas where that
    // cell is 32px wide at (32,64).
    const z = 4;
    const { ctx, rects } = recCtx();
    drawComposerPriority(ctx, doc4([[1, 2]]), z);
    expect(rects).toEqual([{
      x: 1 * COMPOSER_LENS_TILE_PX * z,
      y: 2 * COMPOSER_LENS_TILE_PX * z,
      w: COMPOSER_LENS_TILE_PX * z,
      h: COMPOSER_LENS_TILE_PX * z,
    }]);
    // One SCREEN pixel, at every zoom — not one document pixel.
    expect(ctx.lineWidth).toBe(1);
  });

  it('merges a horizontal run into one blit (the cost property)', () => {
    const { ctx, rects } = recCtx();
    const drawn = drawComposerPriority(ctx, doc4([[0, 1], [1, 1], [2, 1]]), 1);
    expect(rects).toEqual([{ x: 0, y: 8, w: 24, h: 8 }]);
    expect(drawn.veils).toBe(1);
  });

  it('uses the SHARED colours — the same violet the map and classic paint', () => {
    const { ctx, styles } = recCtx();
    drawComposerPriority(ctx, doc4([[0, 0]]), 1);
    expect(styles).toContain(`fill:${PRIORITY_FILL}`);
    expect(styles).toContain(`stroke:${PRIORITY_EDGE}`);
  });

  it('outlines the region — a lone marked cell gets four boundary segments', () => {
    const { ctx, pts } = recCtx();
    const drawn = drawComposerPriority(ctx, doc4([[1, 1]]), 1);
    expect(drawn.segments).toBe(4);
    expect(pts).toHaveLength(8); // four moveTo/lineTo pairs
  });
});

describe('countPriorityCells — the model half of the report', () => {
  it('counts the cells the document says carry priority', () => {
    expect(countPriorityCells(doc4([]))).toBe(0);
    expect(countPriorityCells(doc4([[0, 0], [3, 3]]))).toBe(2);
  });
});

describe('the report', () => {
  it('advances `paints` on EVERY publish, refusals included', () => {
    const before = lastComposerPriorityLensReport().paints;
    publishComposerPriorityLensReport({
      active: false, reason: 'off', cells: 16, priorityCells: 2, veils: 0, segments: 0,
    });
    const off = lastComposerPriorityLensReport();
    expect(off.paints).toBe(before + 1);
    // The distinction the whole reason field exists for: a document that HAS
    // priority cells and drew none because the lens is switched off is not the
    // same answer as a document with nothing to mark.
    expect(off.active).toBe(false);
    expect(off.reason).toBe('off');
    expect(off.priorityCells).toBe(2);

    publishComposerPriorityLensReport({
      active: false, reason: 'live-tile', cells: 1, priorityCells: 0, veils: 0, segments: 0,
    });
    expect(lastComposerPriorityLensReport().reason).toBe('live-tile');
    expect(lastComposerPriorityLensReport().paints).toBe(before + 2);
  });
});
