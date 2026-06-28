import { describe, it, expect } from 'vitest';
import { zoomAtPoint, pan, fit, zoomToSelection, screenToWorld, worldToScreen, clampZoom } from '../../src/core/art/camera';

describe('camera', () => {
  it('zoomAtPoint keeps the world point under the cursor fixed', () => {
    const cam = { x: 10, y: 20, zoom: 2 };
    const sx = 100, sy = 50;
    const before = screenToWorld(cam, sx, sy);
    const next = zoomAtPoint(cam, sx, sy, 4, { min: 0.125, max: 8 });
    const after = screenToWorld(next, sx, sy);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.zoom).toBe(4);
  });
  it('zoomAtPoint clamps to [min,max]', () => {
    expect(zoomAtPoint({ x: 0, y: 0, zoom: 1 }, 0, 0, 999, { min: 0.125, max: 8 }).zoom).toBe(8);
    expect(zoomAtPoint({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.001, { min: 0.125, max: 8 }).zoom).toBe(0.125);
  });
  it('pan moves the world origin opposite the screen drag, scaled by zoom', () => {
    const cam = { x: 100, y: 100, zoom: 2 };
    expect(pan(cam, 10, -6)).toEqual({ x: 100 - 10 / 2, y: 100 - -6 / 2, zoom: 2 });
  });
  it('screen<->world round-trips', () => {
    const cam = { x: 7, y: 9, zoom: 3 };
    const w = screenToWorld(cam, 33, 12);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(33, 6); expect(s.y).toBeCloseTo(12, 6);
  });
  it('fit centers content with integer-friendly zoom and padding', () => {
    const cam = fit({ width: 100, height: 50 }, { width: 420, height: 240 }, { padding: 20 });
    expect(cam.zoom).toBe(4);
    expect(cam.x).toBeCloseTo(-(420 - 400) / 2 / 4, 6);
    expect(cam.y).toBeCloseTo(-(240 - 200) / 2 / 4, 6);
  });
  it('zoomToSelection frames a rect within max zoom', () => {
    const cam = zoomToSelection({ x: 0, y: 0, w: 50, h: 50 }, { width: 200, height: 200 }, { max: 8, padding: 0 });
    expect(cam.zoom).toBe(4);
  });
  it('clampZoom bounds', () => { expect(clampZoom(100, 0.125, 8)).toBe(8); expect(clampZoom(0, 0.125, 8)).toBe(0.125); });
});
