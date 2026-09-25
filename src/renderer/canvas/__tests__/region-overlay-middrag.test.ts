// ROW 208, REGIONS-MIDDRAG-PREVIEW: with the regions tint hidden, a region drag
// draws only the gesture (ROADMAP §5.1 row 208; the options are section 7 of
// docs/reviews/2026-09-25-regions-list.md; ruled C by the aurora overseer).
//
// TWO HALVES, AND THE FIRST IS A CONTROL THAT MUST BE GREEN ON BOTH TREES.
//
//   1. THE TINT ON CHANGES NOTHING. Every call `drawRegionOverlay` issues for the
//      scenarios in `region-overlay-cases.ts` (at rest, and mid-drag with the
//      preview pieces, at dpr 1 and 1.35) equals the call log recorded from
//      master 6072f9df's own code, before row 208 touched anything
//      (`region-overlay-full-master.golden.json`, written by a one-off generator
//      the packet quotes). The report's pre-existing fields are compared too.
//
//   2. THE TINT OFF DRAWS THE GESTURE AND NOTHING ELSE (the rows further down).
//
// WHAT THIS FILE CANNOT SAY: which branch MapViewport takes when a real mouse
// is down, or what the author sees. That is harness row 7c of
// scratchpad/region-gesture-harness.mjs, which reads pixels off the map canvas.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  REGION_OUTLINE_PX, REGION_OUTLINE_SELECTED_PX,
  drawRegionGesture, drawRegionOverlay, lastRegionOverlayReport, regionHue,
} from '../region-overlay';
import { REGION_UNASSIGNED_FILL } from '../canvas-colors';
import type { Rect } from '../../../core/editing/region-geometry';
import {
  regionDragPreview, regionOverlayPass, type RegionOverlayPass,
} from '../../components/map-region-gesture';
import { recordingContext } from './chrome-recorder';
import {
  fullCases, caseDrag, CASE_ACT, CASE_DOC, CASE_DRAG_RECT, CASE_REGIONS, CASE_VP,
} from './region-overlay-cases';

const golden = JSON.parse(readFileSync(
  fileURLToPath(new URL('./region-overlay-full-master.golden.json', import.meta.url)), 'utf8',
)) as { generatedFrom: string; cases: Record<string, { calls: unknown[]; report: Record<string, unknown> }> };

/** JSON's view of a value: what the golden was written through (it also folds -0 to 0). */
const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('row 208 control: with the tint ON the full overlay issues exactly master\'s calls', () => {
  it('the golden was recorded from master 6072f9df and names the same cases (anti-vacuous)', () => {
    expect(golden.generatedFrom).toMatch(/^master 6072f9df/);
    expect(Object.keys(golden.cases).sort()).toEqual(fullCases().map((c) => c.name).sort());
    // A mid-drag case is in the set, or "nothing changed mid-drag" was never asked.
    expect(fullCases().some((c) => c.name.startsWith('mid-drag'))).toBe(true);
  });

  for (const c of fullCases()) {
    it(`${c.name}: same calls, same report`, () => {
      const r = recordingContext();
      const rep = drawRegionOverlay(r.ctx, c.dpr, CASE_VP, c.input);
      expect(roundTrip(r.calls)).toEqual(golden.cases[c.name].calls);
      expect(roundTrip({
        regions: rep.regions, selectedId: rep.selectedId, unassignedRects: rep.unassignedRects,
        unassignedArea: rep.unassignedArea, visual: rep.visual,
      })).toEqual(golden.cases[c.name].report);
    });
  }

  it('the comparison can fail: selecting a different region changes the calls (anti-vacuous)', () => {
    const c = fullCases()[0];
    const r = recordingContext();
    drawRegionOverlay(r.ctx, c.dpr, CASE_VP, { ...c.input, selectedId: 'south' });
    expect(roundTrip(r.calls)).not.toEqual(golden.cases[c.name].calls);
  });
});

// ---------------------------------------------------------------------------
// 2. THE TINT OFF DRAWS THE GESTURE AND NOTHING ELSE.
//
// Every expected figure below is worked out BY HAND from the scenario in
// region-overlay-cases.ts's header, never read back from the code under test:
//   east (320,0)-(640,224) with the hole (400,96)-(496,192) punched in it has
//   area 320*224 - 96*96 = 62464 and a union boundary of
//   2*(320+224) + 2*(96+96) = 1472 (outer rectangle plus the hole's rim).
// ---------------------------------------------------------------------------

const EAST_REMAINDER_AREA = 320 * 224 - 96 * 96;
const EAST_REMAINDER_PERIMETER = 2 * (320 + 224) + 2 * (96 + 96);

/** Total length of the axis-aligned moveTo/lineTo pairs in a path stroke. */
const pathLength = (pts: [number, number][]): number => {
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    n += Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]);
  }
  return n;
};
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

type GesturePass = Extract<RegionOverlayPass, { kind: 'gesture' }>;
const gesturePass = (): GesturePass => {
  const p = regionOverlayPass(CASE_DOC, caseDrag(), false);
  if (p.kind !== 'gesture') throw new Error(`expected the gesture arm, got ${p.kind}`);
  return p;
};
const drawGesture = (dpr: number) => {
  const p = gesturePass();
  const r = recordingContext();
  const report = drawRegionGesture(r.ctx, dpr, CASE_VP, {
    act: CASE_ACT, pieces: p.pieces, dragged: p.dragged, trimmed: p.trimmed,
    regions: CASE_REGIONS, selectedId: 'west',
  });
  return { r, report };
};

describe('row 208: which overlay the map draws (regionOverlayPass)', () => {
  it('tint OFF with a drag live: the gesture arm, the dragged rectangle under its region', () => {
    const p = regionOverlayPass(CASE_DOC, caseDrag(), false);
    expect(p.kind).toBe('gesture');
    expect((p as GesturePass).dragged).toEqual({ id: 'west', rect: CASE_DRAG_RECT });
  });

  it('tint OFF with a drag live: the trimmed pieces are what the carve leaves of east, and only that', () => {
    const { trimmed } = gesturePass();
    expect(trimmed.length).toBeGreaterThan(0);
    expect(new Set(trimmed.map((t) => t.id))).toEqual(new Set(['east']));
    expect(trimmed.reduce((n, t) => n + t.rect.w * t.rect.h, 0)).toBe(EAST_REMAINDER_AREA);
    expect(trimmed.some((t) => overlaps(t.rect, CASE_DRAG_RECT))).toBe(false);
  });

  it('tint OFF with a drag live: the pieces are the release\'s own transform (regionDragPreview)', () => {
    expect(gesturePass().pieces).toEqual(regionDragPreview(CASE_DOC, caseDrag()));
  });

  it('tint OFF and no drag: nothing at all (the owner\'s toggle)', () => {
    expect(regionOverlayPass(CASE_DOC, null, false)).toEqual({ kind: 'none' });
  });

  it('tint ON: the full overlay, over the preview mid-drag and the document at rest (unchanged)', () => {
    expect(regionOverlayPass(CASE_DOC, caseDrag(), true))
      .toEqual({ kind: 'full', pieces: regionDragPreview(CASE_DOC, caseDrag()) });
    expect(regionOverlayPass(CASE_DOC, null, true)).toEqual({
      kind: 'full', pieces: CASE_DOC.regions.map((r) => ({ id: r.id, rect: r.rect })),
    });
  });

  it('no regions document: nothing, whatever the tint and the drag', () => {
    for (const on of [true, false]) {
      expect(regionOverlayPass(null, caseDrag(), on)).toEqual({ kind: 'none' });
    }
  });
});

describe('row 208: the gesture-only draw (drawRegionGesture)', () => {
  it('draws no label, no plate, no clip, no alpha wash and no unassigned red', () => {
    const { r } = drawGesture(1);
    expect(r.texts).toEqual([]);
    expect(r.fills).toEqual([]);
    expect(r.clips).toEqual([]);
    expect(r.calls.some((c) => c.op === 'set:globalAlpha')).toBe(false);
    expect(r.strokes.some((s) => s.style === REGION_UNASSIGNED_FILL)).toBe(false);
  });

  it('draws no hatch: the only line length is the trimmed region\'s boundary', () => {
    const { r } = drawGesture(1);
    const lines = r.strokes.filter((s) => s.kind === 'path');
    // A hatch would add dozens of diagonal strokes across east's box.
    expect(lines.reduce((n, s) => n + pathLength(s.pts), 0)).toBe(EAST_REMAINDER_PERIMETER);
  });

  it('outlines what the carve leaves of east, in east\'s hue, at the unselected width', () => {
    const { r } = drawGesture(1);
    const east = r.strokes.filter((s) => s.kind === 'path' && s.style === regionHue(1));
    expect(east.length).toBe(1);
    expect(east[0].width).toBe(REGION_OUTLINE_PX);
    expect(pathLength(east[0].pts)).toBe(EAST_REMAINDER_PERIMETER);
  });

  it('outlines the dragged rectangle, in west\'s hue, at the selected width, where it is', () => {
    const { r } = drawGesture(1);
    const rects = r.strokes.filter((s) => s.kind === 'rect');
    expect(rects.length).toBe(1);
    expect(rects[0].style).toBe(regionHue(0));
    expect(rects[0].width).toBe(REGION_OUTLINE_SELECTED_PX);
    const xs = rects[0].pts.map((p) => p[0]);
    const ys = rects[0].pts.map((p) => p[1]);
    expect(Math.abs(Math.min(...xs) - CASE_DRAG_RECT.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.max(...xs) - (CASE_DRAG_RECT.x + CASE_DRAG_RECT.w))).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.min(...ys) - CASE_DRAG_RECT.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.max(...ys) - (CASE_DRAG_RECT.y + CASE_DRAG_RECT.h))).toBeLessThanOrEqual(1);
  });

  it('draws in the canvas`s own dpr frame, never resetting to identity', () => {
    const { r } = drawGesture(1.35);
    const sets = r.calls.filter((c) => c.op === 'setTransform');
    expect(sets.length).toBeGreaterThan(0);
    for (const c of sets) expect(c.args).toEqual([1.35, 0, 0, 1.35, 0, 0]);
  });

  it('publishes mode gesture, advances paints, and counts what it drew', () => {
    const before = lastRegionOverlayReport().paints;
    const { report } = drawGesture(1);
    expect(report.paints).toBe(before + 1);
    expect(report.mode).toBe('gesture');
    expect(report.drew).toEqual({
      hatches: 0, unassignedHoles: 0, labels: 0, gestureOutlines: 1, trimmedOutlines: 1,
    });
    expect(report.regions).toEqual([]);
  });

  it('the absence rows can fail: the FULL draw of the same pieces has labels, clips, alpha and hatch (anti-vacuous)', () => {
    const p = gesturePass();
    const r = recordingContext();
    const report = drawRegionOverlay(r.ctx, 1, CASE_VP, {
      act: CASE_ACT, pieces: p.pieces, regions: CASE_REGIONS, selectedId: 'west',
    });
    expect(r.texts.length).toBeGreaterThan(0);
    expect(r.clips.length).toBeGreaterThan(0);
    expect(r.calls.some((c) => c.op === 'set:globalAlpha')).toBe(true);
    expect(r.strokes.filter((s) => s.kind === 'path').reduce((n, s) => n + pathLength(s.pts), 0))
      .toBeGreaterThan(EAST_REMAINDER_PERIMETER);
    expect(report.mode).toBe('full');
    expect(report.drew.hatches).toBe(3);
    expect(report.drew.labels).toBe(3);
  });
});
