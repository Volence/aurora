// The canvas pane's pure rules. The suite renders no React and no canvas, so
// these are the only parts of Task 12 a node test can reach at all — which is
// exactly why they were pulled out of the components.
//
// The two failures they exist for:
//
//   • THE PANE SHOWING SOMEONE ELSE'S DOCUMENT. `activeDocId` is a mirror of
//     the focused tab, not a second source of truth; reading it alone is the
//     shape of every stale-pane bug this app has had.
//
//   • A GRID THAT LIES ABOUT WHERE THE TILES ARE. `gridOrigin` decides which
//     pixels share an 8x8 cell, and therefore which palette-line clashes 2B
//     will report. A guide drawn from the canvas corner when the document says
//     otherwise sends the artist's alignment work in the wrong direction.

import { describe, it, expect } from 'vitest';
import {
  canvasPaneState, planCanvasGrids, offeredGrids,
} from '../canvas-pane-model';

const CANVAS_TAB = { id: 'doc:canvas:sky', kind: 'art-doc', title: 'Canvas · sky' };
const LEVEL_TAB = { id: 'level:ghz:1', kind: 'level', title: 'GHZ 1' };
const NO_ORIGIN = { originX: 0, originY: 0 };

describe('which document the pane shows', () => {
  it('is ready when the focused document IS the active tab\'s', () => {
    expect(canvasPaneState(CANVAS_TAB, CANVAS_TAB.id)).toEqual({ kind: 'ready', docId: CANVAS_TAB.id });
  });

  it('is hidden for any tab that is not a canvas', () => {
    expect(canvasPaneState(LEVEL_TAB, null)).toEqual({ kind: 'hidden' });
    expect(canvasPaneState(null, null)).toEqual({ kind: 'hidden' });
    expect(canvasPaneState(undefined, 'doc:canvas:sky')).toEqual({ kind: 'hidden' });
    // ...even when a canvas document is still focused behind it. Nothing about
    // a level tab makes the canvas pane appear.
    expect(canvasPaneState(LEVEL_TAB, 'doc:canvas:sky')).toEqual({ kind: 'hidden' });
  });

  it('is UNLOADED when the tab has no document, rather than blank', () => {
    // A blank canvas under a real canvas's name reads as "your art is gone".
    expect(canvasPaneState(CANVAS_TAB, null))
      .toEqual({ kind: 'unloaded', tabId: CANVAS_TAB.id, title: 'Canvas · sky' });
  });

  it('is UNLOADED when the focused document is a DIFFERENT canvas', () => {
    // The mirror disagreeing with the tab is the stale-pane bug itself. Drawing
    // the other document here would put rock's pixels under sky's tab.
    expect(canvasPaneState(CANVAS_TAB, 'doc:canvas:rock').kind).toBe('unloaded');
  });
});

describe('which grids get drawn', () => {
  it('offers exactly the profile\'s pitches', () => {
    expect(offeredGrids('genesis-level-art')).toEqual([8, 16, 256]);
    expect(offeredGrids('genesis-sprite')).toEqual([8, 16]);
    expect(offeredGrids('none')).toEqual([8]);
    // A sidecar can name a profile this build never heard of; it falls back to
    // `none` rather than drawing nothing.
    expect(offeredGrids('made-up-by-a-later-aurora')).toEqual([8]);
  });

  it('hands an aligned 8 and 16 to the shared viewport layers', () => {
    const plan = planCanvasGrids([8, 16, 256], [8, 16], NO_ORIGIN);
    expect(plan.layerGrids).toEqual(['cell8', 'block']);
    expect(plan.blockPx).toBe(16);
    expect(plan.underlay).toEqual([]);
  });

  it('draws only what visibleGrids selects', () => {
    expect(planCanvasGrids([8, 16, 256], [], NO_ORIGIN))
      .toEqual({ layerGrids: [], underlay: [] });
    expect(planCanvasGrids([8, 16, 256], [16], NO_ORIGIN).layerGrids).toEqual(['block']);
  });

  it('never draws a pitch the profile does not offer', () => {
    // visibleGrids is GLOBAL view state and outlives the document that
    // justified it: selecting 256 on a level-art canvas and switching to a
    // sprite one would otherwise draw a chunk grid over a 32x32 sprite.
    const plan = planCanvasGrids([8, 16], [8, 256], NO_ORIGIN);
    expect(plan.layerGrids).toEqual(['cell8']);
    expect(plan.underlay).toEqual([]);
  });

  it('sends 256 to the underlay — the viewport has no layer for it', () => {
    const plan = planCanvasGrids([8, 16, 256], [256], NO_ORIGIN);
    expect(plan.layerGrids).toEqual([]);
    expect(plan.underlay).toEqual([{ pitch: 256, offsetX: 0, offsetY: 0, weight: 'coarse' }]);
  });

  it('sends an OFFSET 8 or 16 to the underlay too', () => {
    // The shared layer draws from the buffer origin in fixed steps and cannot be
    // offset, so an aligned-to-the-art grid has to be drawn by the pane. Using
    // the layer anyway would draw the guides in the wrong place while the
    // document said otherwise.
    const plan = planCanvasGrids([8, 16], [8, 16], { originX: 3, originY: 0 });
    expect(plan.layerGrids).toEqual([]);
    expect(plan.underlay).toEqual([
      { pitch: 8, offsetX: 3, offsetY: 0, weight: 'fine' },
      { pitch: 16, offsetX: 3, offsetY: 0, weight: 'fine' },
    ]);
  });

  it('an origin that is a whole multiple of the pitch is still ALIGNED', () => {
    // originX 16 shifts a 16px grid onto exactly the same lines, so forcing it
    // into the underlay would cost a hand-drawn grid for no visible difference.
    const plan = planCanvasGrids([8, 16], [8, 16], { originX: 16, originY: 32 });
    expect(plan.layerGrids).toEqual(['cell8', 'block']);
    expect(plan.underlay).toEqual([]);
  });

  it('folds a NEGATIVE origin into a positive first line', () => {
    // JS `%` yields -3 here, and a grid whose first line is at -3 draws its
    // leftmost column off the canvas — the column the artist is aligning to.
    const plan = planCanvasGrids([8], [8], { originX: -3, originY: -20 });
    expect(plan.underlay).toEqual([{ pitch: 8, offsetX: 5, offsetY: 4, weight: 'fine' }]);
  });

  it('orders the grids finest first, so the coarse lines draw on top', () => {
    const plan = planCanvasGrids([8, 16, 256], [256, 8, 16], { originX: 1, originY: 1 });
    expect(plan.underlay.map((g) => g.pitch)).toEqual([8, 16, 256]);
  });

  it('ignores a nonsense pitch instead of dividing by zero', () => {
    expect(planCanvasGrids([0, 8], [0, 8], NO_ORIGIN))
      .toEqual({ layerGrids: ['cell8'], underlay: [] });
  });
});
