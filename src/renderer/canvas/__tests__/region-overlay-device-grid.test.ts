// ROADMAP row 239 (a), RULED 2026-09-28 under the owner's 2026-09-18 look permission:
// the regions overlay's strokes have BOTH edges on whole device pixels at every dpr.
//
// Row 238 found (docs/reviews/2026-09-28-device-grid-238.md sections 7.2 and Open) that
// the selected region's outline and the dragged region rect, both 2 CSS px, drew through
// `snapStroke`, which centres every width on a device HALF-pixel: an even device width
// there leaves each edge half-covering a device column. The ruling moves them to
// `snapStrokeEdges` (parity-aware centring). The on-screen half of this is
// `npm run harness:even-chrome-239` (rows e<s>.r and e<s>.d).
//
// What is asserted is derived from `grid-edges.ts` (deviceStrokeWidth and Math.round
// only), never from `snapStrokeEdges` itself: every axis-aligned outline segment's
// row or column, and every corner of a stroked rect, sits so that the stroke's two
// edges are whole device pixels. The diagonal hatch is skipped, because a slanted line
// has no device row to sit on (the shared rule's own limit).
//
// WHAT IT CANNOT SAY: anything about pixels. The recorder maps geometry.

import { describe, it, expect } from 'vitest';
import {
  REGION_OUTLINE_SELECTED_PX, drawRegionGesture, drawRegionOverlay, type RegionViewport,
} from '../region-overlay';
import { deviceStrokeWidth } from '../device-grid';
import { regionOverlayPass, type RegionOverlayPass } from '../../components/map-region-gesture';
import { recordingContext, type Recording } from './chrome-recorder';
import { edgesWhole } from './grid-edges';
import { fullCases, caseDrag, CASE_ACT, CASE_DOC, CASE_REGIONS, CASE_VP } from './region-overlay-cases';

const DPRS = [1, 1.25, 1.35, 1.5, 1.75, 2, 2.5, 3];
const EPS = 1e-6;
/** A fractional pan and zoom as well as the integral one, so the snap has work to do. */
const VPS: { name: string; vp: RegionViewport }[] = [
  { name: 'integral view', vp: CASE_VP },
  { name: 'fractional pan, zoom 1.5', vp: { ...CASE_VP, x: 3.25, y: 7.5, zoom: 1.5 } },
];

/** Every axis-aligned stroke in a recording, as [device coordinate, device width, kind]. */
function axisStrokes(r: Recording): { at: number; width: number; what: string }[] {
  const out: { at: number; width: number; what: string }[] = [];
  for (const s of r.strokes) {
    if (s.kind === 'rect') {
      for (const [x, y] of s.pts) {
        out.push({ at: x, width: s.width, what: 'rect corner x' });
        out.push({ at: y, width: s.width, what: 'rect corner y' });
      }
      continue;
    }
    // Paths here are moveTo/lineTo pairs (the union outline and the hatch).
    for (let i = 0; i + 1 < s.pts.length; i += 2) {
      const [[x0, y0], [x1, y1]] = [s.pts[i], s.pts[i + 1]];
      if (Math.abs(y1 - y0) < EPS) out.push({ at: y0, width: s.width, what: 'horizontal segment' });
      else if (Math.abs(x1 - x0) < EPS) out.push({ at: x0, width: s.width, what: 'vertical segment' });
    }
  }
  return out;
}

type GesturePass = Extract<RegionOverlayPass, { kind: 'gesture' }>;
const gesturePass = (): GesturePass => {
  const p = regionOverlayPass(CASE_DOC, caseDrag(), false);
  if (p.kind !== 'gesture') throw new Error(`expected the gesture arm, got ${p.kind}`);
  return p;
};

describe('row 239 (a): every region-overlay stroke has both edges on whole device pixels', () => {
  for (const dpr of DPRS) {
    for (const { name: vpName, vp } of VPS) {
      for (const c of fullCases()) {
        it(`dpr ${dpr}, ${vpName}: full overlay, ${c.name}`, () => {
          const r = recordingContext();
          drawRegionOverlay(r.ctx, dpr, vp, c.input);
          const strokes = axisStrokes(r);
          expect(strokes.length).toBeGreaterThan(0);
          const bad = strokes.filter((s) => !edgesWhole(s.at, s.width));
          expect(bad).toEqual([]);
        });
      }
      it(`dpr ${dpr}, ${vpName}: the gesture draw (dragged rect and trimmed outline)`, () => {
        const p = gesturePass();
        const r = recordingContext();
        drawRegionGesture(r.ctx, dpr, vp, {
          act: CASE_ACT, pieces: p.pieces, dragged: p.dragged, trimmed: p.trimmed,
          regions: CASE_REGIONS, selectedId: 'west',
        });
        const strokes = axisStrokes(r);
        // Anti-vacuous: the dragged rect is here, at the selected (EVEN) width.
        expect(r.strokes.some((s) => s.kind === 'rect'
          && Math.abs(s.width - deviceStrokeWidth(REGION_OUTLINE_SELECTED_PX, dpr)) < EPS)).toBe(true);
        const bad = strokes.filter((s) => !edgesWhole(s.at, s.width));
        expect(bad).toEqual([]);
      });
    }
  }

  it('the rows above read an EVEN-width stroke: the selected outline is 2 CSS px, an even device width at every dpr (anti-vacuous)', () => {
    for (const dpr of DPRS) expect(deviceStrokeWidth(REGION_OUTLINE_SELECTED_PX, dpr) % 2).toBe(0);
    const selected = fullCases().find((c) => c.input.selectedId !== null);
    expect(selected).toBeDefined();
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1.5, CASE_VP, selected!.input);
    expect(axisStrokes(r).some((s) => Math.abs(s.width - deviceStrokeWidth(REGION_OUTLINE_SELECTED_PX, 1.5)) < EPS)).toBe(true);
  });
});
