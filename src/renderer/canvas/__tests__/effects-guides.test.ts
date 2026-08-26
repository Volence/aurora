// The parallax layer guides' arithmetic (ROADMAP item 43).
//
// WHAT THIS FILE CAN AND CANNOT SAY. It can prove the transform is an
// involution, that the grab zone is a screen-space fingertip, and that the draw
// pass has exactly ONE spelling of the world<->canvas Y mapping in the tree. It
// CANNOT see a canvas, a mouse or React, so it says nothing whatsoever about
// whether a guide is drawn or draggable — that is
// scratchpad/effects-guides-harness.mjs's job, and this file's existence must
// not be read as covering it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  worldYToCanvasY, canvasYToWorldY, guideAtCanvasY, layerGuideGeometry,
  layerIsEnabled, GUIDE_GRAB_PX, publishGuideReport, lastGuideReport,
  guideOriginWorldY, canvasYToLayerTop, guideCaption,
  type GuideViewport,
} from '../effects-guides';
import { EFFECTS_WORLD_Y_BOUNDS, clampWorldY } from '../../providers/effects-aeon';
import type { EffectsLayer } from '../../../core/formats/effects/scene';

const layer = (world_y: number, enabled?: boolean): EffectsLayer => ({
  world_y, fa: 'FACTOR_1', fb: 'FACTOR_1', ...(enabled === undefined ? {} : { enabled }),
});

const vp = (y: number, zoom: number, height = 600): GuideViewport =>
  ({ x: 0, y, width: 800, height, zoom });

describe('the world<->canvas Y transform', () => {
  it('round-trips exactly at every zoom the viewport offers', () => {
    // Not a hand-picked pair: the whole point is that neither direction may
    // acquire a rounding step of its own.
    for (const zoom of [0.25, 0.5, 1, 1.5, 2, 4, 8]) {
      for (const vpY of [0, 37, 2048, 20000]) {
        for (const worldY of [0, 1, 133, 2048, EFFECTS_WORLD_Y_BOUNDS.max]) {
          const canvasY = worldYToCanvasY(worldY, vpY, zoom);
          expect(canvasYToWorldY(canvasY, vpY, zoom)).toBeCloseTo(worldY, 6);
        }
      }
    }
  });

  it('puts the viewport top edge at canvas y=0 — the guide origin IS the pan', () => {
    expect(worldYToCanvasY(512, 512, 3)).toBe(0);
    expect(canvasYToWorldY(0, 512, 3)).toBe(512);
  });

  it('scales by zoom, so a guide tracks the art it divides', () => {
    // 100 world px below the top edge is 100*zoom canvas px, always.
    for (const zoom of [0.5, 1, 4]) {
      expect(worldYToCanvasY(600, 500, zoom)).toBe(100 * zoom);
    }
  });
});

describe('MapViewport has ONE spelling of that transform', () => {
  // A duplicated transform is the specific defect this parcel was told to
  // prevent, and it is invisible to every behavioural test: two copies agree
  // until one of them changes. Reading the source is the only way to see it.
  const src = readFileSync(
    fileURLToPath(new URL('../../components/MapViewport.tsx', import.meta.url)), 'utf8');

  it('is looking at the right file (anti-vacuous)', () => {
    expect(src).toContain('function screenToWorld');
  });

  it('screenToWorld calls the shared inverse rather than re-deriving it', () => {
    expect(src).toContain('canvasYToWorldY(clientY - rect.top');
  });

  it('no second copy of `vpY + (…) / zoom` survives anywhere in it', () => {
    // The exact shape screenToWorld used to carry inline. The X axis keeps its
    // own line (`vpX + (clientX - rect.left) / zoom`) and is deliberately not
    // matched: guides are a Y-axis affordance and X was never duplicated.
    expect(src).not.toMatch(/vpY\s*\+\s*\(/);
  });
});

describe('guideAtCanvasY — the grab zone', () => {
  const layers = [layer(0), layer(400), layer(1200)];

  it('grabs a guide the cursor is exactly on', () => {
    // world 400 at vpY=0, zoom=1 -> canvas 400.
    expect(guideAtCanvasY(400, layers, vp(0, 1))).toBe(1);
  });

  it('grabs within GUIDE_GRAB_PX and lets go one pixel outside it', () => {
    expect(guideAtCanvasY(400 + GUIDE_GRAB_PX, layers, vp(0, 1))).toBe(1);
    expect(guideAtCanvasY(400 - GUIDE_GRAB_PX, layers, vp(0, 1))).toBe(1);
    expect(guideAtCanvasY(400 + GUIDE_GRAB_PX + 1, layers, vp(0, 1))).toBeNull();
  });

  it('is a SCREEN-space fingertip, not a world-space one', () => {
    // At zoom 4 the same grab zone is a quarter as many world pixels: world 401
    // is 4 canvas px from world 400's line, still inside — but world 403 is 12,
    // outside. A world-space tolerance would grab both at every zoom.
    const at = (worldY: number, zoom: number) => guideAtCanvasY(
      worldYToCanvasY(worldY, 0, zoom), layers, vp(0, zoom));
    expect(at(401, 4)).toBe(1);
    expect(at(403, 4)).toBeNull();
    // ...and at zoom 1 world 403 IS within the fingertip.
    expect(at(403, 1)).toBe(1);
  });

  it('gives an overlap to the later layer — the one drawn on top', () => {
    expect(guideAtCanvasY(400, [layer(400), layer(400)], vp(0, 1))).toBe(1);
  });

  it('returns null for an empty layer list rather than throwing', () => {
    expect(guideAtCanvasY(400, [], vp(0, 1))).toBeNull();
  });
});

describe('layerGuideGeometry', () => {
  it('places every layer, on screen or not, and says which', () => {
    const rows = layerGuideGeometry([layer(0), layer(2000)], vp(0, 1, 600));
    expect(rows.map((r) => r.canvasY)).toEqual([0, 2000]);
    expect(rows.map((r) => r.onScreen)).toEqual([true, false]);
  });

  it('draws the dragged layer at the DRAG position, not its stored one', () => {
    const rows = layerGuideGeometry([layer(100), layer(500)], vp(0, 1),
      { dragIndex: 1, dragWorldY: 300 });
    expect(rows[1].worldY).toBe(300);
    expect(rows[1].canvasY).toBe(300);
    // The layer that is NOT being dragged is untouched.
    expect(rows[0].worldY).toBe(100);
  });

  it('still draws a disabled layer, flagged (ruling: the canvas must not disagree with the panel)', () => {
    const rows = layerGuideGeometry([layer(100, false), layer(200, true), layer(300)], vp(0, 1));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.enabled)).toEqual([false, true, true]);
  });

  it('treats an absent `enabled` as true — the schema default', () => {
    expect(layerIsEnabled(layer(0))).toBe(true);
    expect(layerIsEnabled(layer(0, true))).toBe(true);
    expect(layerIsEnabled(layer(0, false))).toBe(false);
  });
});

describe('a drag cannot author a world_y the schema refuses', () => {
  // The gesture routes its dragged position through the SAME clamp the panel's
  // spinner does; these are the ends of the range that clamp derives from the
  // vendored schema, never typed here.
  it('clamps past either end of the schema bound', () => {
    expect(clampWorldY(EFFECTS_WORLD_Y_BOUNDS.min - 1000)).toBe(EFFECTS_WORLD_Y_BOUNDS.min);
    expect(clampWorldY(EFFECTS_WORLD_Y_BOUNDS.max + 1000)).toBe(EFFECTS_WORLD_Y_BOUNDS.max);
  });

  it('rounds a sub-pixel drag position to an integer row', () => {
    // canvasYToWorldY at a fractional zoom yields fractions; world_y is `int`.
    expect(Number.isInteger(clampWorldY(canvasYToWorldY(37, 0, 1.5)))).toBe(true);
  });
});

describe('the guide report', () => {
  it('starts inactive, and every publish advances the paint counter', () => {
    const before = lastGuideReport().paints;
    publishGuideReport({ active: false, sceneId: null, rows: [], dragIndex: null, hoverIndex: null });
    expect(lastGuideReport().active).toBe(false);
    expect(lastGuideReport().paints).toBe(before + 1);
    publishGuideReport({
      active: true, sceneId: 'sky', dragIndex: 2, hoverIndex: null,
      rows: layerGuideGeometry([layer(0)], vp(0, 1)),
    });
    expect(lastGuideReport().sceneId).toBe('sky');
    expect(lastGuideReport().paints).toBe(before + 2);
  });
});

// ---------------------------------------------------------------------------
// Locked scenes: the guides are screen lines, not act rows (feedback 2026-08-26 pt 4)
// ---------------------------------------------------------------------------

describe('a locked scene draws its guides as screen lines', () => {
  // For a locked plane a layer top IS a plane line (aeon scene_plane_line:
  // identity mapping), so drawing it at act Y is wrong everywhere except
  // inside the plane rectangle at world origin, where the two coincide by
  // accident. Until the screen-frame overlay (parcel G) lands, "the screen"
  // is the viewport's own top edge: line N is N world px below `vp.y`.
  it('anchors screen space at the viewport top, act space at the act origin', () => {
    expect(guideOriginWorldY(vp(1234, 2), 'screen')).toBe(1234);
    expect(guideOriginWorldY(vp(1234, 2), 'act')).toBe(0);
  });

  it('places line N at N*zoom canvas px whatever the pan — the guide does not scroll with the act', () => {
    for (const vpY of [0, 37, 2048, 20000]) {
      for (const zoom of [0.5, 1, 3]) {
        const rows = layerGuideGeometry([layer(0), layer(160)], vp(vpY, zoom), { space: 'screen' });
        expect(rows.map((r) => r.canvasY)).toEqual([0, 160 * zoom]);
        // The reported top is still the document's number, not a world Y.
        expect(rows.map((r) => r.worldY)).toEqual([0, 160]);
      }
    }
  });

  it('defaults to act space, so every existing caller is unchanged', () => {
    const a = layerGuideGeometry([layer(160)], vp(500, 1));
    const b = layerGuideGeometry([layer(160)], vp(500, 1), { space: 'act' });
    expect(a).toEqual(b);
    expect(a[0].canvasY).toBe(160 - 500);
  });

  it('the two spaces disagree everywhere except at the act origin', () => {
    // The coincidence that hid the defect: with the view at world 0 both
    // spellings land on the same row.
    const atOrigin = (space: 'screen' | 'act') =>
      layerGuideGeometry([layer(112)], vp(0, 1), { space })[0].canvasY;
    expect(atOrigin('screen')).toBe(atOrigin('act'));
    const panned = (space: 'screen' | 'act') =>
      layerGuideGeometry([layer(112)], vp(300, 1), { space })[0].canvasY;
    expect(panned('screen')).not.toBe(panned('act'));
  });

  it('grabs and drags in the same space it draws in', () => {
    const v = vp(1000, 2);
    const rows = layerGuideGeometry([layer(50), layer(200)], v, { space: 'screen' });
    expect(guideAtCanvasY(rows[1].canvasY, [layer(50), layer(200)], v, 'screen')).toBe(1);
    // In act space the same canvas row finds nothing (the act guide is off-screen).
    expect(guideAtCanvasY(rows[1].canvasY, [layer(50), layer(200)], v, 'act')).toBeNull();
    // Round trip: the row a guide draws at converts back to its own top.
    expect(canvasYToLayerTop(rows[1].canvasY, v, 'screen')).toBe(200);
    expect(canvasYToLayerTop(worldYToCanvasY(200, v.y, v.zoom), v, 'act')).toBe(200);
  });

  it('captions the guide layer so the space is visible, and only when locked', () => {
    expect(guideCaption('screen')).toBe('screen lines — locked scene');
    expect(guideCaption('act')).toBeNull();
  });
});
