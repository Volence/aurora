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
  surfaceGeometry, surfaceCaption,
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

  it('puts the viewport top edge at canvas y=0: the guide origin IS the pan', () => {
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

describe('guideAtCanvasY: the grab zone', () => {
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

  it('gives an overlap to the later layer: the one drawn on top', () => {
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

  it('treats an absent `enabled` as true: the schema default', () => {
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
    publishGuideReport({ active: false, sceneId: null, space: null, rows: [], surfaces: [], dragIndex: null, hoverIndex: null });
    expect(lastGuideReport().active).toBe(false);
    expect(lastGuideReport().paints).toBe(before + 1);
    publishGuideReport({
      active: true, sceneId: 'sky', space: 'act', dragIndex: 2, hoverIndex: null,
      rows: layerGuideGeometry([layer(0)], vp(0, 1)), surfaces: [],
    });
    expect(lastGuideReport().sceneId).toBe('sky');
    expect(lastGuideReport().paints).toBe(before + 2);
  });
});

// ---------------------------------------------------------------------------
// Locked scenes: a layer top is a PLANE ROW, fixed on the art
// ---------------------------------------------------------------------------

describe('a locked scene draws its guides on the plane, at world origin', () => {
  // ⚠ THIS BLOCK ASSERTED THE OPPOSITE EARLIER ON 2026-08-27. Row 65 anchored a
  // locked scene's guides to the SCREEN FRAME, less v_offset. The owner
  // disproved it the same day — "if I move the viewport it drags the layers
  // which I don't want" — and the engine agrees with him:
  //
  //   .v_locked  ->  Vscroll_BG = v_offset, a scene constant; Camera_Y unread
  //   Step 4a    ->  the screen shows plane rows v_offset .. v_offset+223
  //   locked scene_plane_line is the IDENTITY, so a top IS a plane row
  //   renderBg draws the plane at world (0,0), so plane row P is at world Y P
  //
  // The old rows are not deleted quietly: the last one in this block is the
  // NEW catcher and it is the exact inverse of the old one.
  it('anchors BOTH spaces at world origin', () => {
    expect(guideOriginWorldY('screen')).toBe(0);
    expect(guideOriginWorldY('act')).toBe(0);
  });

  it('does NOT subtract v_offset: that belongs to the FIRE LINE, not the position', () => {
    // `scene_vsplit_line = scene_plane_line - v_offset` is the screen line a
    // vsplit fires on (fireScreenLineOf / fireLineAdvisory own it). A guide is
    // drawn where the layer IS; the fire line is what the layer BECOMES.
    // Nothing here can be given a v_offset to subtract any more, which is the
    // structural half of saying so.
    expect(guideOriginWorldY.length).toBe(1);
  });

  it('places a top at its own world row, at every pan and every zoom', () => {
    for (const vpY of [0, 37, 2048, 20000]) {
      for (const zoom of [0.5, 1, 3]) {
        const rows = layerGuideGeometry([layer(0), layer(160)], vp(vpY, zoom), { space: 'screen' });
        expect(rows.map((r) => r.canvasY)).toEqual([(0 - vpY) * zoom, (160 - vpY) * zoom]);
        expect(rows.map((r) => r.worldY)).toEqual([0, 160]);
      }
    }
  });

  it('KEPT FROM ROW 65: a pan moves the guide on the canvas by exactly the pan', () => {
    // Still the property that matters against the ORIGINAL bug (`vp.y` as the
    // origin), and still true of the corrected rule: a guide pinned to the
    // plane is pinned to the world, so panning moves it like any world feature.
    // Under the `vp.y` origin this row reads 0 for every pan.
    const at = (vpY: number) =>
      layerGuideGeometry([layer(112)], vp(vpY, 1), { space: 'screen' })[0].canvasY;
    expect(at(0)).toBe(112);
    expect(at(100)).toBe(12);
    expect(at(0) - at(100)).toBe(100);
  });

  it('the two spaces now agree everywhere, because both are the plane\'s own rows', () => {
    for (const vpY of [0, 300]) {
      const at = (space: 'screen' | 'act') =>
        layerGuideGeometry([layer(112)], vp(vpY, 1), { space })[0].canvasY;
      expect(at('screen')).toBe(at('act'));
    }
  });

  it('defaults to act space, so every existing caller is unchanged', () => {
    const a = layerGuideGeometry([layer(160)], vp(500, 1));
    const b = layerGuideGeometry([layer(160)], vp(500, 1), { space: 'act' });
    expect(a).toEqual(b);
    expect(a[0].canvasY).toBe(160 - 500);
  });

  it('grabs and drags in the space it draws in, and round-trips', () => {
    const v = vp(1000, 2);
    const ls = [layer(50), layer(200)];
    const rows = layerGuideGeometry(ls, v, { space: 'screen' });
    expect(guideAtCanvasY(rows[1].canvasY, ls, v, 'screen')).toBe(1);
    expect(canvasYToLayerTop(rows[1].canvasY, v, 'screen')).toBe(200);
    expect(canvasYToLayerTop(worldYToCanvasY(200, v.y, v.zoom), v, 'act')).toBe(200);
  });

  it('a layer can sit anywhere on the 512-row plane, including below the visible strip', () => {
    // The owner's own case: flower art at plane row ~430, well past 223. It is
    // a legal top (the plane is 512 rows) and the guide belongs on the art.
    const rows = layerGuideGeometry([layer(430)], vp(0, 1), { space: 'screen' });
    expect(rows[0].canvasY).toBe(430);
    expect(rows[0].worldY).toBe(430);
  });

  it('captions the guide layer so the space is visible, and only when locked', () => {
    expect(guideCaption('screen')).toBe('plane rows: fixed on the background, not on the frame');
    expect(guideCaption('act')).toBeNull();
  });

  it('THE NEW CATCHER: the guide does not move when the SCREEN FRAME moves', () => {
    // ⚠ THE EXACT INVERSE OF THE ROW IT REPLACES, and the owner's sentence in
    // one assertion. Nothing this function can be handed describes a frame, so
    // the frame cannot enter the answer — which is why the parameter was
    // REMOVED rather than defaulted: a default is a value a call site can still
    // pass something else for.
    const before = layerGuideGeometry([layer(112)], vp(0, 1), { space: 'screen' })[0].canvasY;
    // Move the frame by any amount you like; there is no argument for it.
    const after = layerGuideGeometry([layer(112)], vp(0, 1), { space: 'screen' })[0].canvasY;
    expect(after).toBe(before);
    expect(after).toBe(112);
  });
});

// ---------------------------------------------------------------------------
// `plane_y` HAS A REFERENT: the row of the author's own BG art
// ---------------------------------------------------------------------------
//
// WHAT THIS FILE CAN SAY ABOUT IT, and it is narrower than it looks. It can
// prove the rule lands on the plane row and on nothing else, that it is
// independent of the two quantities it would be wrong to fold in (`v_offset`
// and the layer's own top), and that a layer with no remap contributes none. It
// CANNOT see a canvas, so it says nothing about whether the white rule is
// actually painted; the CDP capture under docs/captures/2026-09-05-plane-y/ is
// what says that, and this block's existence must not be read as covering it.

describe('the plane_y surface rule', () => {
  const remapped = (world_y: number, plane_y: number, height_shift = 4): EffectsLayer => ({
    ...layer(world_y), rowRemap: { plane_y, height_shift },
  });

  it('lands on the plane row, because the map draws Plane B at world origin', () => {
    // The engine's definition is a BG PLANE LINE (parallax.emp:391-393) and
    // SectionRenderer.renderBg blits the plane at (0,0), so plane row P is map
    // world Y P. At vpY 0, zoom 1, that is the number itself.
    expect(surfaceGeometry([remapped(96, 96)], vp(0, 1))[0].canvasY).toBe(96);
    expect(surfaceGeometry([remapped(96, 160)], vp(0, 1))[0].canvasY).toBe(160);
  });

  it('goes through the SAME transform as the guides, at every pan and zoom', () => {
    // A second copy of the pan/zoom mapping is the defect this module was shaped
    // to prevent; the rule is a new line on the same canvas and must not acquire
    // one. Derived from `worldYToCanvasY` rather than restated.
    for (const zoom of [0.25, 1, 2.5, 8]) {
      for (const vpY of [0, 37, 500]) {
        for (const planeY of [0, 96, 223, 511]) {
          expect(surfaceGeometry([remapped(0, planeY)], vp(vpY, zoom))[0].canvasY)
            .toBe(worldYToCanvasY(planeY, vpY, zoom));
        }
      }
    }
  });

  it('IS NOT THE LAYER TOP: moving the top does not move the rule', () => {
    // The defect being prevented is the one the rowRemap parcel's seed invites.
    // `plane_y` is seeded FROM the strip's own top, so on a fresh document the
    // two coincide, and a reader could conclude the rule is drawn at the top.
    expect(surfaceGeometry([remapped(96, 96)], vp(0, 1))[0].canvasY).toBe(96);
    expect(surfaceGeometry([remapped(0, 96)], vp(0, 1))[0].canvasY).toBe(96);
    expect(surfaceGeometry([remapped(300, 96)], vp(0, 1))[0].canvasY).toBe(96);
    // ...and the anti-vacuity twin: the rule DOES move when plane_y moves, so a
    // function that returned a constant would fail this pair rather than pass it.
    expect(surfaceGeometry([remapped(96, 97)], vp(0, 1))[0].canvasY).toBe(97);
  });

  it('takes no v_offset term, so the rule is not welded to the view box', () => {
    // Row 65's trap, one axis over. `v_offset` is where the SCREEN sits on the
    // plane; this is a row OF the plane. `surfaceGeometry` is not even given the
    // scene, which is how the term is made unpassable rather than merely unused.
    expect(surfaceGeometry.length).toBe(2);
    const head = surfaceGeometry.toString().slice(0, 80);
    expect(head).not.toMatch(/scene/);
  });

  it('draws one per REMAPPED layer and none for the rest', () => {
    const rows = surfaceGeometry(
      [layer(0), remapped(96, 96), layer(160), remapped(200, 208, 6)], vp(0, 1));
    expect(rows.map((r) => r.index)).toEqual([1, 3]);
    expect(rows.map((r) => r.planeY)).toEqual([96, 208]);
  });

  it('reports `rowRemap: "none"` as no rule, the same as an absent key', () => {
    const none: EffectsLayer = { ...layer(96), rowRemap: 'none' };
    expect(surfaceGeometry([none], vp(0, 1))).toEqual([]);
    expect(surfaceGeometry([layer(96)], vp(0, 1))).toEqual([]);
  });

  it('carries H as LINES for the label, and the file still stores a SHIFT', () => {
    // The one `<<` on this key lives in `rowRemapHeightLines`; the label reads
    // it, and nothing on the write path does. A geometry row that carried the
    // shift under a `heightLines` name is the mistake this asserts against.
    expect(surfaceGeometry([remapped(0, 96, 4)], vp(0, 1))[0].heightLines).toBe(16);
    expect(surfaceGeometry([remapped(0, 96, 7)], vp(0, 1))[0].heightLines).toBe(128);
  });

  it('still draws for a DISABLED layer, as a guide does', () => {
    const off: EffectsLayer = { ...remapped(96, 96), enabled: false };
    expect(surfaceGeometry([off], vp(0, 1))).toHaveLength(1);
  });

  it('marks a rule scrolled off the viewport, and the draw skips it', () => {
    expect(surfaceGeometry([remapped(0, 96)], vp(0, 1, 600))[0].onScreen).toBe(true);
    expect(surfaceGeometry([remapped(0, 96)], vp(700, 1, 600))[0].onScreen).toBe(false);
  });

  it('captions itself only when a rule is drawn', () => {
    expect(surfaceCaption([])).toBeNull();
    const caption = surfaceCaption(surfaceGeometry([remapped(0, 96)], vp(0, 1)));
    // The sentence has to name the KEY and the ART, because the defect is that
    // the number related to neither.
    expect(caption).toMatch(/plane_y/);
    expect(caption).toMatch(/BG art row/);
  });
});
