// THE MAP'S CHROME AT A SCALE FACTOR ABOVE 1 (docs/reviews/2026-09-12-dpr-guides-offset.md).
//
// cdp-sweep-4's OBS.DPR measured the layer guides and the screen frame drawn at 1/1.35
// of where their hit tests grab them, at an emulated devicePixelRatio of 1.35: each draw
// reset the map canvas to identity and drew CSS coordinates onto a device-pixel backing
// store. The fix draws them in the canvas's CSS frame and snaps in device space
// (canvas/device-grid.ts). These rows hold the pieces that are separable from a canvas:
//
//   - AT dpr 1 NOTHING CHANGED: every call each of the five chrome draws issues equals
//     the call log recorded from master's own code (dpr1-chrome-master.golden.json),
//     EXCEPT the even-width strokes row 239 (a) moved on purpose (see the golden rows);
//   - AT EVERY SCALE THE LINE IS WHERE THE GRAB IS: the device row a guide is stroked on,
//     divided by dpr, is within one device pixel of the row `layerGuideGeometry`
//     reports, and `guideAtCanvasY` at that row returns that guide; the same for the
//     frame's four edges and `screenFrameEdgeAt`, and for the `plane_y` rule;
//   - THE CRISPNESS THE IDENTITY RESET WAS FOR IS KEPT: every stroke is a whole number
//     of device pixels, of the parity it has at dpr 1, with BOTH edges on whole device
//     pixels (a half-pixel centre for an odd width, a whole-pixel one for an even
//     width: ROADMAP row 239 (a), ruled 2026-09-28);
//   - A LOCK: no renderer code calls `snapStroke`, which half-covers the edges of an
//     even width (row 239);
//   - THE COMPOSITE AND THE LENS CAPTION ARE THE dpr-1 DRAWING SCALED BY dpr;
//   - A CENSUS: no identity reset is left in the renderer except on the two canvases
//     whose backing stores are not dpr-scaled.
//
// WHAT IT CANNOT SAY: anything about pixels, antialiasing or what the author sees. The
// recorder maps geometry, it does not rasterise. scratchpad/dpr-guides-offset-harness.mjs
// (npm run harness:dpr-guides-offset) is the half that presses the drawn lines in the
// running app, at an emulated and at a real forced scale factor.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import {
  drawLayerGuides, drawSurfaceMarks, surfaceGeometry, layerGuideGeometry, guideAtCanvasY,
} from '../effects-guides';
import { drawScreenFrame, screenFrameRect, screenFrameEdgeAt } from '../screen-frame';
import { drawCameraPreview, cameraPreviewPlan } from '../camera-preview';
import { drawBandLensLabel } from '../band-lens';
import { deviceStrokeWidth, snapStroke, snapStrokeEdges, snapLength } from '../device-grid';
import {
  recordingContext, GUIDE_CASES, SURFACE_CASES, FRAME_CASES, CAMERA_CASES, LENS_LABEL_CASES,
  CAMERA_SOURCES,
  type Recording, type GuideCase, type SurfaceCase, type FrameCase, type CameraCase,
  type LensLabelCase, type DeviceStroke,
} from './chrome-recorder';
import { edgesWhole } from './grid-edges';

const golden = JSON.parse(readFileSync(
  fileURLToPath(new URL('./dpr1-chrome-master.golden.json', import.meta.url)), 'utf8',
)) as { generatedFrom: string; cases: Record<string, unknown> };

/** 1, the factor measured on this host (1.35), and the common desktop steps either side. */
const DPRS = [1, 1.25, 1.35, 1.5, 1.75, 2, 2.5, 3];
const SCALED = DPRS.filter((d) => d !== 1);
const EPS = 1e-6;

const runGuides = (dpr: number, c: GuideCase): Recording => {
  const r = recordingContext(); drawLayerGuides(r.ctx, dpr, c.vp, c.layers, c.opts); return r;
};
const runSurfaces = (dpr: number, c: SurfaceCase): Recording => {
  const r = recordingContext(); drawSurfaceMarks(r.ctx, dpr, c.vp, surfaceGeometry(c.layers, c.vp)); return r;
};
const runFrame = (dpr: number, c: FrameCase): Recording => {
  const r = recordingContext(); drawScreenFrame(r.ctx, dpr, c.vp, c.anchor, c.opts); return r;
};
const runCamera = (dpr: number, c: CameraCase): Recording => {
  const r = recordingContext();
  drawCameraPreview(r.ctx, dpr, screenFrameRect(c.anchor, c.vp), c.vp.zoom,
    cameraPreviewPlan(c.scene, c.camX, c.camY), CAMERA_SOURCES, { captions: c.captions });
  return r;
};
const runLens = (dpr: number, c: LensLabelCase): Recording => {
  const r = recordingContext(); drawBandLensLabel(r.ctx, dpr, c.vp, c.lines, c.anchor); return r;
};

/** Every scenario, under the key its master recording is filed under. */
const ALL: { key: string; run: (dpr: number) => Recording }[] = [
  ...GUIDE_CASES.map((c) => ({ key: `guides: ${c.name}`, run: (d: number) => runGuides(d, c) })),
  ...SURFACE_CASES.map((c) => ({ key: `surfaces: ${c.name}`, run: (d: number) => runSurfaces(d, c) })),
  ...FRAME_CASES.map((c) => ({ key: `frame: ${c.name}`, run: (d: number) => runFrame(d, c) })),
  ...CAMERA_CASES.map((c) => ({ key: `camera: ${c.name}`, run: (d: number) => runCamera(d, c) })),
  ...LENS_LABEL_CASES.map((c) => ({ key: `lens label: ${c.name}`, run: (d: number) => runLens(d, c) })),
];

/** JSON's view of a value: what the golden was written through (it also folds -0 to 0). */
const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;
const lineStrokes = (r: Recording): DeviceStroke[] => r.strokes.filter((s) => s.kind === 'path');

// ⚠ THE GOLDEN WAS RE-RECORDED FOR ROADMAP ROW 239 (a), RULED 2026-09-28 by the overseer
// under the owner's 2026-09-18 look permission: EVEN WIDTHS MOVED TO WHOLE-PIXEL CENTRES.
// The hovered, dragged or refused guide and the active frame (2 CSS px) now draw through
// `snapStrokeEdges`, so at dpr 1 their stroke geometry sits on `Math.round(v)` where
// master's sat on `Math.round(v) + 0.5` (two whole device rows, where master half-covered
// three). It was re-recorded by the one-off generator the original came from, re-run on
// the row 239 tree (docs/reviews/239-even-chrome/golden-generator.ts.txt; the same
// generator on the pre-239 tree reproduced the old file byte for byte but for
// `generatedFrom`). EXACTLY 7 calls moved, all moveTo/lineTo/strokeRect of a 2-device-px
// stroke, with every op, count and matrix unchanged
// (docs/reviews/239-even-chrome/golden-moved-dpr1-chrome.txt). Every other call is
// still master 803e8a30's, so "nothing else changed at dpr 1" is still what this holds.
describe('at dpr 1 the chrome issues exactly the calls master issued, but for row 239\'s even-width strokes', () => {
  it('the golden is master\'s re-recorded for row 239 (a), and it and the scenarios name the same cases (anti-vacuous)', () => {
    expect(golden.generatedFrom).toMatch(/^row 239 \(a\) .*every other call as master 803e8a30/);
    expect(Object.keys(golden.cases).sort()).toEqual(ALL.map((a) => a.key).sort());
    expect(ALL.length).toBeGreaterThan(0);
  });

  for (const a of ALL) {
    it(`${a.key}`, () => {
      expect(roundTrip(a.run(1).calls)).toEqual(golden.cases[a.key]);
    });
  }

  it('the comparison can fail: at 1.35 the same draws differ from master (anti-vacuous)', () => {
    for (const a of ALL) expect(roundTrip(a.run(1.35).calls)).not.toEqual(golden.cases[a.key]);
  });
});

describe('the snap reduces to master\'s dpr-1 arithmetic', () => {
  // Row 239 (a): the chrome draws through `snapStrokeEdges`, so this row now asks it,
  // not `snapStroke` (which no renderer code calls any more, and whose half-pixel rule
  // for every width the second row keeps stating). Odd widths are master's arithmetic
  // exactly; an even width is `Math.round(v)`, the ruled whole-pixel centre.
  it('centre, width and length at dpr 1: Math.round(v) + 0.5 for an odd width, Math.round(v) for an even one, w and Math.round(len)', () => {
    for (const v of [-3.5, -0.25, 0, 0.5, 7.125, 48.375, 185.625, 374.625, 1023.5]) {
      for (const w of [1, 2, 3]) {
        const s = snapStrokeEdges(v, w, 1);
        expect(Object.is(s.at, w % 2 === 1 ? Math.round(v) + 0.5 : Math.round(v))).toBe(true);
        expect(s.width).toBe(w);
      }
      expect(snapLength(v, 1)).toBe(Math.round(v));
    }
  });

  it('snapStroke itself is unchanged: Math.round(v) + 0.5 for every width at dpr 1', () => {
    for (const v of [-3.5, 0, 7.125, 1023.5]) {
      for (const w of [1, 2, 3]) expect(Object.is(snapStroke(v, w, 1).at, Math.round(v) + 0.5)).toBe(true);
    }
  });

  it('a device width keeps the parity of its CSS width and is the nearest such integer', () => {
    for (const dpr of DPRS) {
      for (const w of [1, 2, 3]) {
        const d = deviceStrokeWidth(w, dpr);
        expect(Number.isInteger(d)).toBe(true);
        expect(d % 2).toBe(w % 2);
        expect(Math.abs(d - w * dpr)).toBeLessThanOrEqual(1 + EPS);
      }
    }
  });
});

describe('a guide is drawn where its hit test grabs it, at every scale factor', () => {
  for (const dpr of DPRS) {
    for (const c of GUIDE_CASES) {
      it(`dpr ${dpr}: ${c.name}`, () => {
        const rows = layerGuideGeometry(c.layers, c.vp, c.opts).filter((r) => r.onScreen);
        const lines = lineStrokes(runGuides(dpr, c));
        expect(rows.length).toBeGreaterThan(0);
        expect(lines.length).toBe(rows.length);
        rows.forEach((row, k) => {
          const devY = lines[k].pts[0][1];
          expect(lines[k].pts[1][1]).toBe(devY);
          expect(Math.abs(devY / dpr - row.canvasY)).toBeLessThanOrEqual(1 / dpr + EPS);
          // The whole width of the backing store, not a 1/dpr stub of it.
          expect(lines[k].pts[1][0]).toBeCloseTo(c.vp.width * dpr, 6);
          // A guide mid-drag is drawn at the gesture's row and grabbed by the
          // document's, by design, so the grab half is asked of the others only.
          if (c.opts.dragIndex === undefined || c.opts.dragIndex === null) {
            expect(guideAtCanvasY(devY / dpr, c.layers, c.vp, c.opts.space)).toBe(row.index);
          }
        });
      });
    }
  }
});

describe('the plane_y rule is drawn on the plane row it names, at every scale factor', () => {
  for (const dpr of DPRS) {
    for (const c of SURFACE_CASES) {
      it(`dpr ${dpr}: ${c.name}`, () => {
        const rows = surfaceGeometry(c.layers, c.vp).filter((r) => r.onScreen);
        const lines = lineStrokes(runSurfaces(dpr, c));
        expect(rows.length).toBeGreaterThan(0);
        // Two strokes per rule, the casing and the dashed line, on the same row.
        expect(lines.length).toBe(rows.length * 2);
        rows.forEach((row, k) => {
          for (const s of [lines[2 * k], lines[2 * k + 1]]) {
            expect(Math.abs(s.pts[0][1] / dpr - row.canvasY)).toBeLessThanOrEqual(1 / dpr + EPS);
          }
        });
      });
    }
  }
});

describe("the screen frame's four edges are drawn where screenFrameEdgeAt grabs them", () => {
  for (const dpr of DPRS) {
    for (const c of FRAME_CASES) {
      it(`dpr ${dpr}: ${c.name}`, () => {
        const r = screenFrameRect(c.anchor, c.vp);
        const rects = runFrame(dpr, c).strokes.filter((s) => s.kind === 'rect');
        expect(rects.length).toBe(1);
        const [[x0, y0], [x1], [, y1]] = rects[0].pts;
        const left = x0 / dpr; const right = x1 / dpr; const top = y0 / dpr; const bottom = y1 / dpr;
        expect(Math.abs(left - r.x)).toBeLessThanOrEqual(1 / dpr + EPS);
        expect(Math.abs(top - r.y)).toBeLessThanOrEqual(1 / dpr + EPS);
        expect(Math.abs(right - (r.x + r.w))).toBeLessThanOrEqual(1.5 / dpr + EPS);
        expect(Math.abs(bottom - (r.y + r.h))).toBeLessThanOrEqual(1.5 / dpr + EPS);
        const midX = r.x + r.w / 2; const midY = r.y + r.h / 2;
        expect(screenFrameEdgeAt(left, midY, c.anchor, c.vp)).toBe(true);
        expect(screenFrameEdgeAt(right, midY, c.anchor, c.vp)).toBe(true);
        expect(screenFrameEdgeAt(midX, top, c.anchor, c.vp)).toBe(true);
        expect(screenFrameEdgeAt(midX, bottom, c.anchor, c.vp)).toBe(true);
      });
    }
  }
});

describe('every stroke keeps the crispness the identity reset was for: both edges on whole device pixels', () => {
  const stroked = [
    ...GUIDE_CASES.map((c) => ({ key: `guides: ${c.name}`, run: (d: number) => runGuides(d, c) })),
    ...SURFACE_CASES.map((c) => ({ key: `surfaces: ${c.name}`, run: (d: number) => runSurfaces(d, c) })),
    ...FRAME_CASES.map((c) => ({ key: `frame: ${c.name}`, run: (d: number) => runFrame(d, c) })),
  ];
  for (const dpr of DPRS) {
    for (const a of stroked) {
      it(`dpr ${dpr}: ${a.key}`, () => {
        const at1 = a.run(1).strokes;
        const atD = a.run(dpr).strokes;
        expect(atD.length).toBe(at1.length);
        expect(atD.length).toBeGreaterThan(0);
        atD.forEach((s, i) => {
          // A whole number of device pixels, of the parity the same stroke has at dpr 1.
          expect(isWhole(s.width)).toBe(true);
          expect(Math.round(s.width) % 2).toBe(Math.round(at1[i].width) % 2);
          // BOTH EDGES ON WHOLE DEVICE PIXELS (ROADMAP row 239 (a), ruled 2026-09-28):
          // every line stroke's row, and every corner of a stroked rect, since its size
          // is a whole number of device pixels. For an odd width that is a half-pixel
          // centre, as it always was; for an even width (the hovered, dragged or refused
          // guide, the active frame) it is a WHOLE-pixel centre, where `snapStroke` had
          // put it on a half-pixel and left each edge half-covering a device row.
          if (s.kind === 'path') expect(edgesWhole(s.pts[0][1], s.width)).toBe(true);
          else for (const [x, y] of s.pts) { expect(edgesWhole(x, s.width)).toBe(true); expect(edgesWhole(y, s.width)).toBe(true); }
        });
      });
    }
  }
});

describe('the camera preview and the band lens caption are the dpr-1 drawing, scaled', () => {
  for (const dpr of SCALED) {
    for (const c of CAMERA_CASES) {
      it(`dpr ${dpr}: camera: ${c.name}`, () => {
        const a = runCamera(1, c); const b = runCamera(dpr, c);
        expect(a.images.length).toBeGreaterThan(0);
        expect(b.images.length).toBe(a.images.length);
        b.images.forEach((im, i) => {
          for (const k of ['x', 'y', 'w', 'h'] as const) expect(im.dest[k]).toBeCloseTo(a.images[i].dest[k] * dpr, 6);
        });
        expect(b.clips.length).toBe(1);
        for (const k of ['x', 'y', 'w', 'h'] as const) expect(b.clips[0][k]).toBeCloseTo(a.clips[0][k] * dpr, 6);
        b.texts.forEach((t, i) => { expect(t.x).toBeCloseTo(a.texts[i].x * dpr, 6); expect(t.y).toBeCloseTo(a.texts[i].y * dpr, 6); });
      });
    }
    for (const c of LENS_LABEL_CASES) {
      it(`dpr ${dpr}: lens label: ${c.name}`, () => {
        const a = runLens(1, c); const b = runLens(dpr, c);
        expect(a.fills.length).toBeGreaterThan(0);
        expect(b.fills.length).toBe(a.fills.length);
        b.fills.forEach((f, i) => {
          for (const k of ['x', 'y', 'w', 'h'] as const) expect(f[k]).toBeCloseTo(a.fills[i][k] * dpr, 6);
        });
        expect(b.texts.length).toBe(a.texts.length);
        b.texts.forEach((t, i) => { expect(t.x).toBeCloseTo(a.texts[i].x * dpr, 6); expect(t.y).toBeCloseTo(a.texts[i].y * dpr, 6); });
      });
    }
  }
});

// ---------------------------------------------------------------------------
// THE CENSUS. A lock, not a reader: the rows above are the readers. What it holds
// is the defect CLASS, an identity reset on a canvas whose backing store is
// dpr-scaled, which the brief that opened this parcel enumerated by hand and got a
// partial list of. Comments are stripped first: the files that were fixed still
// NAME the reset in their docblocks, and a comment outbids code in a grep.
// ---------------------------------------------------------------------------

describe('no identity reset is left in the renderer except on canvases that are not dpr-scaled', () => {
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  walk(ROOT);
  const IDENTITY = /setTransform\(\s*1\s*,\s*0\s*,\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*\)|resetTransform\(\s*\)/g;
  const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const hits = files.flatMap((f) => (code(readFileSync(f, 'utf8')).match(IDENTITY) ?? []).map(() => relative(ROOT, f)));
  /** The sites whose identity reset is RIGHT, and why (the packet's per-site table). */
  const UNSCALED: Record<string, string> = {
    'canvas/raster-timeline.ts': 'RasterTimelineStrip gives this canvas a FIXED intrinsic size (RASTER_TIMELINE_W x H); its pointer maps client px to strip px through the rect, so identity is strip px',
    // ClassicLevelViewport LEFT this list at row 194: its store is now device-sized and
    // its draw starts from setTransform(dpr, ...), so an identity reset there is the
    // defect again, and the row above now reds on one
    // (docs/reviews/2026-09-28-classic-canvas-dpr-194.md).
  };

  it('the census read the renderer tree (anti-vacuous)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('MapViewport.tsx'))).toBe(true);
  });

  it('every identity reset left is on a canvas whose backing store is not dpr-scaled', () => {
    expect(hits.filter((h) => !(h in UNSCALED))).toEqual([]);
  });

  it('and each of those sites still has one, so the list cannot outlive what it names', () => {
    for (const site of Object.keys(UNSCALED)) expect(hits).toContain(site);
  });
});

// ---------------------------------------------------------------------------
// ROW 239 (a), RULED 2026-09-28: the chrome snaps through `snapStrokeEdges`. A LOCK,
// not a reader (the crispness rows above are the readers): `snapStroke` centres EVERY
// width on a device half-pixel, which is right for an odd width and half-covers a
// device row at each edge of an even one, so a renderer call to it is the defect
// class this row closed, whatever width it passes today. Comments are stripped first,
// because the docblocks still NAME `snapStroke` when they explain the history.
// ---------------------------------------------------------------------------

describe('row 239: no renderer code snaps a stroke through snapStroke', () => {
  const ROOT = fileURLToPath(new URL('../../', import.meta.url));
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  walk(ROOT);
  const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // device-grid.ts DEFINES it (`function snapStroke(`); a definition is not a call.
  const calls = files.flatMap((f) => (code(readFileSync(f, 'utf8')).replace(/function\s+snapStroke\s*\(/g, '')
    .match(/\bsnapStroke\s*\(/g) ?? []).map(() => relative(ROOT, f)));

  it('the census read the renderer tree, and device-grid.ts still defines the old helper (anti-vacuous)', () => {
    expect(files.length).toBeGreaterThan(100);
    for (const f of ['canvas/screen-frame.ts', 'canvas/region-overlay.ts', 'canvas/effects-guides.ts']) {
      expect(files).toContain(join(ROOT, f));
    }
    expect(readFileSync(join(ROOT, 'canvas/device-grid.ts'), 'utf8')).toMatch(/export function snapStroke\(/);
  });

  it('no file outside the tests calls snapStroke(: every chrome stroke goes through snapStrokeEdges', () => {
    expect(calls).toEqual([]);
  });
});
