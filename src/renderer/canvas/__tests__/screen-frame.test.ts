// The screen-frame overlay's arithmetic (triage 2026-08-26 §B row G).
//
// This file can prove the world->canvas rectangle, the edge hit-test and the
// drag delta. It CANNOT see a canvas or a mouse: whether the frame is drawn,
// dragged and toggled in the app is FOREGROUND verification, not this file.

import { describe, it, expect } from 'vitest';
import {
  screenFrameRect, screenFrameEdgeAt, dragScreenFrame, clampScreenFrameAnchor,
  SCREEN_FRAME_GRAB_PX, publishScreenFrameReport, lastScreenFrameReport,
  type FrameViewport,
} from '../screen-frame';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../../../core/model/screen';
import { worldYToCanvasY } from '../effects-guides';

const vp = (x: number, y: number, zoom: number): FrameViewport =>
  ({ x, y, width: 800, height: 600, zoom });

describe('screenFrameRect', () => {
  it('is exactly one game screen in world units, scaled by zoom, at every zoom', () => {
    for (const zoom of [0.125, 0.25, 0.5, 1, 2, 4, 8]) {
      const r = screenFrameRect({ x: 512, y: 300 }, vp(100, 50, zoom));
      expect(r.w).toBeCloseTo(SCREEN_WIDTH * zoom, 9);
      expect(r.h).toBeCloseTo(SCREEN_HEIGHT * zoom, 9);
      expect(r.x).toBeCloseTo((512 - 100) * zoom, 9);
      // The Y half is the guides' ONE transform, not a second spelling of it.
      expect(r.y).toBeCloseTo(worldYToCanvasY(300, 50, zoom), 9);
    }
  });

  it('pins to a WORLD point: panning moves it on the canvas, the anchor does not move', () => {
    const a = { x: 640, y: 448 };
    const before = screenFrameRect(a, vp(0, 0, 1));
    const after = screenFrameRect(a, vp(100, 40, 1));
    expect(after.x).toBe(before.x - 100);
    expect(after.y).toBe(before.y - 40);
  });
});

describe('screenFrameEdgeAt', () => {
  const a = { x: 100, y: 100 };
  const v = vp(0, 0, 1);
  it('hits within the grab zone of each of the four edges', () => {
    expect(screenFrameEdgeAt(100, 150, a, v)).toBe(true);                       // left
    expect(screenFrameEdgeAt(100 + SCREEN_WIDTH, 150, a, v)).toBe(true);        // right
    expect(screenFrameEdgeAt(200, 100, a, v)).toBe(true);                       // top
    expect(screenFrameEdgeAt(200, 100 + SCREEN_HEIGHT, a, v)).toBe(true);       // bottom
    expect(screenFrameEdgeAt(100 + SCREEN_FRAME_GRAB_PX, 150, a, v)).toBe(true);
  });
  it('does NOT hit the interior: a click inside the frame belongs to the tool', () => {
    expect(screenFrameEdgeAt(100 + SCREEN_WIDTH / 2, 100 + SCREEN_HEIGHT / 2, a, v)).toBe(false);
    expect(screenFrameEdgeAt(100 + SCREEN_FRAME_GRAB_PX + 1, 150, a, v)).toBe(false);
  });
  it('does not hit outside the frame past the grab zone', () => {
    expect(screenFrameEdgeAt(100 - SCREEN_FRAME_GRAB_PX - 1, 150, a, v)).toBe(false);
    expect(screenFrameEdgeAt(50, 50, a, v)).toBe(false);
  });
  it('grab zone is screen px, not world px: the same fingertip at zoom 4', () => {
    const z = vp(0, 0, 4);
    // Left edge of the frame sits at canvas x=400 at zoom 4.
    expect(screenFrameEdgeAt(400 + SCREEN_FRAME_GRAB_PX, 500, a, z)).toBe(true);
    expect(screenFrameEdgeAt(400 + SCREEN_FRAME_GRAB_PX + 1, 500, a, z)).toBe(false);
  });
});

describe('dragScreenFrame', () => {
  it('moves the anchor by the WORLD delta between press and cursor', () => {
    const next = dragScreenFrame({ x: 100, y: 100 }, { x: 10, y: 20 }, { x: 43, y: 27 });
    expect(next).toEqual({ x: 133, y: 107 });
  });
  it('rounds to whole world pixels: the camera never sits between two', () => {
    const next = dragScreenFrame({ x: 100, y: 100 }, { x: 0, y: 0 }, { x: 0.4, y: 0.6 });
    expect(next).toEqual({ x: 100, y: 101 });
  });
  it('clamps at the world origin: the camera cannot see left of or above x=0,y=0', () => {
    const next = dragScreenFrame({ x: 10, y: 10 }, { x: 0, y: 0 }, { x: -50, y: -50 });
    expect(next).toEqual({ x: 0, y: 0 });
    expect(clampScreenFrameAnchor({ x: -1, y: 5 })).toEqual({ x: 0, y: 5 });
  });
});

describe('the report', () => {
  it('advances paints on every publish and reports the rect it drew', () => {
    const before = lastScreenFrameReport().paints;
    publishScreenFrameReport({ active: true, anchor: { x: 1, y: 2 }, rect: { x: 1, y: 2, w: 3, h: 4 }, dragging: false });
    expect(lastScreenFrameReport().paints).toBe(before + 1);
    expect(lastScreenFrameReport().anchor).toEqual({ x: 1, y: 2 });
    publishScreenFrameReport({ active: false, anchor: null, rect: null, dragging: false });
    expect(lastScreenFrameReport().active).toBe(false);
  });
});
