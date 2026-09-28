// PIXELVIEWPORT'S OWN CHROME LANDS ON ITS CANVAS'S PIXEL GRID (ROADMAP row 240 (a)).
//
// PixelViewport's backing store is CSS-sized (scale 1: pixel-viewport-chrome.ts says why),
// and its chrome is drawn in the doc frame translated to the editable origin. These rows
// drive the REAL chrome functions through the recorder (canvas/__tests__/chrome-recorder.ts)
// under that translate, and check every stroke's edges are whole backing-store pixels:
//
//   the grids (1 px), the 1 px marquee overlay, the selection (1 px), the 2 px INSET
//   outline overlay, and the gesture preview (1.5 px: a rect, a marquee, a move, a line).
//
// Expectations come from `deviceStrokeWidth` and `Math.round` (grid-edges.ts) at scale 1,
// never from `snapStrokeEdges`.
//
// TWO KINDS OF ZOOM, KEPT APART:
//   - INTEGER zooms are what the hosts give (artStore and spriteStore keep integers,
//     `cappedZoom` floors). There master's `+ 0.5` and `+ 1` / `- 2` arithmetic was already
//     whole for everything but the preview, so the IDENTITY rows hold those strokes to
//     master's numbers, and only the preview rows discriminate.
//   - FRACTIONAL zooms (1.5, 2.5) no host gives today. They discriminate for every stroke,
//     and hold that the chrome stays whole if one ever does.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { recordingContext, type Recording, type DeviceStroke } from '../../../canvas/__tests__/chrome-recorder';
import { deviceStrokeWidth } from '../../../canvas/device-grid';
import { expectedCentre, edgesWhole } from '../../../canvas/__tests__/grid-edges';
import {
  drawGridLines, drawPreview, drawSelection, strokeDocRect, strokeDocRectInset, PREVIEW_STROKE_PX,
  type ChromeFrame,
} from '../pixel-viewport-chrome';

const EPS = 1e-6;
const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;

type Case = { zoom: number; originX: number; originY: number };
const INTEGER: Case[] = [
  { zoom: 1, originX: 0, originY: 0 }, { zoom: 3, originX: 0, originY: 0 },
  { zoom: 4, originX: 96, originY: 64 }, { zoom: 8, originX: 128, originY: 128 },
];
const FRACTIONAL: Case[] = [
  { zoom: 1.5, originX: 0, originY: 0 }, { zoom: 2.5, originX: 40, originY: 20 },
];
const ALL = [...INTEGER, ...FRACTIONAL];

/** A recorder translated to the origin, as PixelViewport's effect leaves its context. */
function frameAt(c: Case): { f: ChromeFrame; r: Recording } {
  const r = recordingContext();
  r.ctx.translate(c.originX, c.originY);
  return { f: { ctx: r.ctx, originX: c.originX, originY: c.originY, zoom: c.zoom }, r };
}

function box(s: DeviceStroke): { l: number; t: number; r: number; b: number } {
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
}

/** A rect stroke centred on the doc rect (x, y, w, h)'s edges, both edges whole. */
function expectCentredRect(s: DeviceStroke, c: Case, x: number, y: number, w: number, h: number, cssWidth: number): void {
  expect(s.kind).toBe('rect');
  expect(s.width, 'width').toBeCloseTo(deviceStrokeWidth(cssWidth, 1), 9);
  const b = box(s);
  expect(b.l, 'left').toBeCloseTo(expectedCentre(c.originX + x * c.zoom, cssWidth, 1), 9);
  expect(b.t, 'top').toBeCloseTo(expectedCentre(c.originY + y * c.zoom, cssWidth, 1), 9);
  expect(b.r - b.l, 'width in px').toBeCloseTo(Math.round(w * c.zoom), 9);
  expect(b.b - b.t, 'height in px').toBeCloseTo(Math.round(h * c.zoom), 9);
  for (const [px, py] of s.pts) {
    expect(edgesWhole(px, s.width), `side at x ${px}: an edge off the pixel grid`).toBe(true);
    expect(edgesWhole(py, s.width), `side at y ${py}: an edge off the pixel grid`).toBe(true);
  }
}

describe('PixelViewport grids are on the backing store\'s pixel grid (row 240 (a))', () => {
  for (const c of ALL) {
    it(`zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      // The pixel grid (step 1), so a fractional zoom puts lines between store pixels.
      const W = 3, H = 2, step = 1;
      drawGridLines(f, W, H, step, 'grid');
      const lines = r.strokes.filter((s) => s.style === 'grid');
      expect(lines.length, 'x lines 0..3 and y lines 0..2').toBe(7);
      const want: ['x' | 'y', number][] = [
        ...[0, 1, 2, 3].map((g): ['x' | 'y', number] => ['x', c.originX + g * c.zoom]),
        ...[0, 1, 2].map((g): ['x' | 'y', number] => ['y', c.originY + g * c.zoom]),
      ];
      lines.forEach((s, i) => {
        expect(s.width).toBeCloseTo(1, 9);
        const [[x0, y0], [x1, y1]] = s.pts;
        const [axis, at] = want[i];
        const across = axis === 'x' ? x0 : y0;
        expect(axis === 'x' ? x1 : y1, `line ${i}: axis-aligned`).toBeCloseTo(across, 9);
        expect(across, `line ${i}: position`).toBeCloseTo(expectedCentre(at, 1, 1), 9);
        expect(edgesWhole(across, 1), `line ${i}: an edge off the pixel grid`).toBe(true);
        expect(isWhole(axis === 'x' ? y0 : x0) && isWhole(axis === 'x' ? y1 : x1), `line ${i}: an end off the grid`).toBe(true);
      });
    });
  }
});

describe('PixelViewport overlays and selection are on the backing store\'s pixel grid (row 240 (a))', () => {
  for (const c of ALL) {
    it(`the 1 px marquee overlay, zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      f.ctx.strokeStyle = 'ov';
      strokeDocRect(f, 3, 5, 7, 2, 1);
      expectCentredRect(r.strokes[0], c, 3, 5, 7, 2, 1);
    });

    it(`the selection, dashed [4, 3], zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      drawSelection(f, { x: 1, y: 2, w: 5, h: 3 });
      expectCentredRect(r.strokes[0], c, 1, 2, 5, 3, 1);
      expect(r.strokes[0].dash).toEqual([4, 3]);
    });

    it(`the 2 px outline overlay stays INSIDE its rect, zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      strokeDocRectInset(f, 3, 5, 7, 2, 2);
      const s = r.strokes[0];
      expect(s.kind).toBe('rect');
      const w = deviceStrokeWidth(2, 1);
      expect(s.width).toBeCloseTo(w, 9);
      const b = box(s);
      expect(b.l - w / 2, 'left outer edge').toBeCloseTo(Math.round(c.originX + 3 * c.zoom), 9);
      expect(b.t - w / 2, 'top outer edge').toBeCloseTo(Math.round(c.originY + 5 * c.zoom), 9);
      expect(b.r + w / 2, 'right outer edge').toBeCloseTo(Math.round(c.originX + 10 * c.zoom), 9);
      expect(b.b + w / 2, 'bottom outer edge').toBeCloseTo(Math.round(c.originY + 7 * c.zoom), 9);
    });
  }
});

describe('PixelViewport\'s gesture preview is on the backing store\'s pixel grid (row 240 (a))', () => {
  for (const c of ALL) {
    it(`a rect preview, zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      drawPreview(f, { kind: 'rect', x0: 6, y0: 4, x1: 2, y1: 1 });
      expectCentredRect(r.strokes[0], c, 2, 1, 5, 4, PREVIEW_STROKE_PX);
    });

    it(`a marquee preview, dashed, zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      drawPreview(f, { kind: 'marquee', x0: 1, y0: 1, x1: 3, y1: 2 });
      expectCentredRect(r.strokes[0], c, 1, 1, 3, 2, PREVIEW_STROKE_PX);
      expect(r.strokes[0].dash).toEqual([4, 3]);
    });

    it(`a move preview, zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      drawPreview(f, { kind: 'move', dx: 2, dy: -1, sel: { x: 1, y: 3, w: 4, h: 2 } });
      expectCentredRect(r.strokes[0], c, 3, 2, 4, 2, PREVIEW_STROKE_PX);
    });

    it(`a horizontal line preview, zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      f.ctx.strokeStyle = 'pv';
      drawPreview(f, { kind: 'line', x0: 1, y0: 3, x1: 6, y1: 3 });
      const s = r.strokes.find((x) => x.style === 'pv')!;
      expect(s.width).toBeCloseTo(deviceStrokeWidth(PREVIEW_STROKE_PX, 1), 9);
      const [[x0, y0], [x1, y1]] = s.pts;
      expect(y1).toBeCloseTo(y0, 9);
      expect(y0).toBeCloseTo(expectedCentre(c.originY + 3.5 * c.zoom, PREVIEW_STROKE_PX, 1), 9);
      expect(edgesWhole(y0, s.width)).toBe(true);
      expect(isWhole(x0) && isWhole(x1)).toBe(true);
    });
  }

  it('CONTROL: a slanted line preview is drawn where it was, pixel centre to centre, at 1.5 px', () => {
    const c = INTEGER[2];
    const { f, r } = frameAt(c);
    f.ctx.strokeStyle = 'pv';
    drawPreview(f, { kind: 'line', x0: 1, y0: 1, x1: 4, y1: 3 });
    const s = r.strokes.find((x) => x.style === 'pv')!;
    expect(s.width).toBeCloseTo(PREVIEW_STROKE_PX, 9);
    expect(s.pts[0][0]).toBeCloseTo(c.originX + 1.5 * c.zoom, 9);
    expect(s.pts[1][1]).toBeCloseTo(c.originY + 3.5 * c.zoom, 9);
  });
});

describe('at the integer zooms the hosts give, the grids, marquee, selection and 2 px outline draw master\'s numbers', () => {
  // Master: grid lines at `g * zoom + 0.5`, width 1; marquee and selection
  // `strokeRect(x * zoom + 0.5, y * zoom + 0.5, w * zoom, h * zoom)` at 1; the outline
  // `strokeRect(x * zoom + 1, y * zoom + 1, w * zoom - 2, h * zoom - 2)` at 2. All in the
  // origin-translated frame, so on the store: plus the origin.
  for (const c of INTEGER) {
    it(`zoom ${c.zoom}, origin ${c.originX},${c.originY}`, () => {
      const { f, r } = frameAt(c);
      drawGridLines(f, 8, 8, 8, 'grid');
      strokeDocRect(f, 3, 5, 7, 2, 1);
      strokeDocRectInset(f, 3, 5, 7, 2, 2);
      const [g0] = r.strokes;
      expect(g0.pts[0][0]).toBe(c.originX + 0.5);
      const [marq, outline] = r.strokes.slice(-2);
      expect(box(marq)).toEqual({
        l: c.originX + 3 * c.zoom + 0.5, t: c.originY + 5 * c.zoom + 0.5,
        r: c.originX + 3 * c.zoom + 0.5 + 7 * c.zoom, b: c.originY + 5 * c.zoom + 0.5 + 2 * c.zoom,
      });
      expect(marq.width).toBe(1);
      expect(box(outline)).toEqual({
        l: c.originX + 3 * c.zoom + 1, t: c.originY + 5 * c.zoom + 1,
        r: c.originX + 3 * c.zoom + 1 + 7 * c.zoom - 2, b: c.originY + 5 * c.zoom + 1 + 2 * c.zoom - 2,
      });
      expect(outline.width).toBe(2);
    });
  }
});

describe('CENSUS: PixelViewport strokes its chrome only through pixel-viewport-chrome.ts', () => {
  // Comment-stripped first: a comment outbids code in a grep.
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(readFileSync(new URL('../PixelViewport.tsx', import.meta.url), 'utf8'));

  it('the census read the right file (anti-vacuous)', () => {
    expect(src).toMatch(/export default function PixelViewport/);
  });

  it('calls each chrome function, and never strokes or sets a line width itself', () => {
    for (const fn of ['drawGridLines', 'strokeDocRect', 'strokeDocRectInset', 'drawSelection', 'drawPreview']) {
      expect(src, `PixelViewport no longer calls ${fn}`).toMatch(new RegExp(`\\b${fn}\\(`));
    }
    expect(src, 'PixelViewport strokes a rect itself').not.toMatch(/\.strokeRect\(/);
    expect(src, 'PixelViewport strokes a path itself').not.toMatch(/\.stroke\(\)/);
    expect(src, 'PixelViewport sets a line width itself').not.toMatch(/\.lineWidth\s*=/);
  });
});
