// THE SONIC 1 CANVAS'S STROKES LAND ON THE DEVICE GRID (ROADMAP row 237 (b), RULED).
//
// Row 194 made the classic canvas's backing store device-sized and its pixel art
// nearest-neighbour, and left its vector chrome at CSS widths under the world transform
// (docs/reviews/2026-09-28-classic-canvas-dpr-194.md, Open): at 1.5 a 1 CSS px outline
// on a cell edge is 1.5 device px centred ON the edge, so it half-covers the device
// column either side. The ruling (overseer, 2026-09-28, under the owner's
// 2026-09-18T19:27:49Z look permission): classic's strokes (ghost outline, marquee,
// collision marks) snap through the SAME `snapStroke` / `snapLength`
// (canvas/device-grid.ts) MapViewport's chrome uses. No new stroke look.
//
// So these rows restate device-grid's own contract (dpr-chrome.test.ts's crispness
// rows) on classic's draws, through the same recorder (chrome-recorder.ts), which maps
// every stroke to DEVICE pixels under the matrix in force:
//
//   - a stroke's width is `deviceStrokeWidth(cssWidth, dpr)` device px (whole, of the
//     parity of its CSS width);
//   - its centre, and every corner of a stroked rect, is on a device half-pixel, the one
//     `snapStroke` picks for where the unsnapped stroke would have been;
//   - the transform is left as it was found (the draws after it are in world units).
//
// The census at the end holds the wiring: every outline ClassicLevelViewport strokes
// goes through the snapped helper. The on-screen half (a real screenshot at forced 1.5,
// the ghost's edge column) is scratchpad/canvas-dpr-237-harness.mjs, part bs.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recordingContext, type Recording } from '../../../canvas/__tests__/chrome-recorder';
import { deviceStrokeWidth } from '../../../canvas/device-grid';
import { COLLISION_SURFACE_LINE } from '../../../canvas/canvas-colors';
import { strokeRectOnDeviceGrid, drawCollision } from '../classic-overlays';
import { expectedCentre, edgesWhole } from '../../../canvas/__tests__/grid-edges';
import type { LevelDoc } from '../../../../core/level-classic/model';

const DPRS = [1, 1.25, 1.35, 1.5, 2, 3];
/** Fractional zooms and cameras ON PURPOSE: an integral case cannot tell a snap from none. */
const VIEWS = [
  { zoom: 1, x: 0, y: 0 },
  { zoom: 2, x: 3032, y: 472 },
  { zoom: 0.5, x: 13, y: 7 },
  { zoom: 1.5, x: 10.25, y: 3.5 },
  { zoom: 3.3, x: 250.4, y: 99.9 },
];
const EPS = 1e-6;
const frac = (v: number): number => v - Math.floor(v);
const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;
const onHalf = (v: number): boolean => Math.abs(frac(v) - 0.5) < EPS;

/** A recorder under classic's own draw transform: the device scale, then the camera. */
function underWorld(dpr: number, v: { zoom: number; x: number; y: number }): Recording {
  const r = recordingContext();
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(v.zoom, v.zoom);
  r.ctx.translate(-v.x, -v.y);
  return r;
}
const matrixOf = (r: Recording) => { const t = r.ctx.getTransform(); return [t.a, t.b, t.c, t.d, t.e, t.f]; };

describe('ROW 238 RULING: an EVEN-width outline has both edges on whole device pixels', () => {
  // The rows the ruling names: 2 CSS px (the stamp-drag preview) and 1.5 CSS px (the
  // collision marquee, drawn 2 device px wide) at dpr 1, 1.5 and 2. Each of the four
  // sides must start and end on a device boundary; row 237 centred them on a half-pixel,
  // which half-covered one column at each edge.
  for (const cssWidth of [2, 1.5]) {
    for (const dpr of [1, 1.5, 2]) {
      it(`${cssWidth} CSS px at dpr ${dpr}: every side's two edges are whole device px`, () => {
        const r = underWorld(dpr, { zoom: 1.5, x: 10.25, y: 3.5 });
        strokeRectOnDeviceGrid(r.ctx, 3072, 512, 256, 256, cssWidth, dpr);
        const s = r.strokes[0];
        expect(deviceStrokeWidth(cssWidth, dpr) % 2, 'fixture: this row is about an even device width').toBe(0);
        const xs = [...new Set(s.pts.map((p) => p[0]))], ys = [...new Set(s.pts.map((p) => p[1]))];
        for (const x of xs) expect(edgesWhole(x, s.width), `vertical side at ${x}`).toBe(true);
        for (const y of ys) expect(edgesWhole(y, s.width), `horizontal side at ${y}`).toBe(true);
      });
    }
  }
});

describe('strokeRectOnDeviceGrid: a world rect outlined on whole device pixels', () => {
  for (const cssWidth of [1, 2, 1.5]) {
    for (const dpr of DPRS) {
      for (const v of VIEWS) {
        it(`${cssWidth} CSS px at dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
          const r = underWorld(dpr, v);
          const before = matrixOf(r);
          // A layout cell: cell (12, 2), 256 world px square.
          const wx = 12 * 256, wy = 2 * 256, ws = 256;
          strokeRectOnDeviceGrid(r.ctx, wx, wy, ws, ws, cssWidth, dpr);
          expect(r.strokes.length).toBe(1);
          const s = r.strokes[0];
          expect(s.kind).toBe('rect');
          expect(s.width).toBeCloseTo(deviceStrokeWidth(cssWidth, dpr), 9);
          // ROW 238 RULING: BOTH edges of every side on whole device pixels. Row 237
          // asserted every corner on a half-pixel, which for an EVEN device width (2 px,
          // and 1.5 px drawn as 2) IS the half-covered edge the ruling calls a defect;
          // the corner is now parity-aware (canvas/__tests__/grid-edges.ts).
          for (const [x, y] of s.pts) {
            expect(edgesWhole(x, s.width), `the side at x ${x} (width ${s.width}) has an edge off the device grid`).toBe(true);
            expect(edgesWhole(y, s.width), `the side at y ${y} (width ${s.width}) has an edge off the device grid`).toBe(true);
          }
          const devL = (wx - v.x) * v.zoom * dpr, devT = (wy - v.y) * v.zoom * dpr;
          const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
          expect(Math.min(...xs)).toBeCloseTo(expectedCentre(devL, cssWidth, dpr), 9);
          expect(Math.min(...ys)).toBeCloseTo(expectedCentre(devT, cssWidth, dpr), 9);
          expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.round(ws * v.zoom * dpr), 9);
          expect(matrixOf(r), 'the helper left a different transform behind').toEqual(before);
        });
      }
    }
  }

  it('a 1 CSS px outline covers exactly one whole device column at its edge, at every scale', () => {
    for (const dpr of DPRS) {
      const r = underWorld(dpr, { zoom: 2, x: 3032, y: 472 });
      strokeRectOnDeviceGrid(r.ctx, 3072, 512, 256, 256, 1, dpr);
      const s = r.strokes[0];
      const left = Math.min(...s.pts.map((p) => p[0]));
      expect(isWhole(left - s.width / 2), `dpr ${dpr}: the left edge starts mid-pixel`).toBe(true);
      expect(isWhole(left + s.width / 2), `dpr ${dpr}: the left edge ends mid-pixel`).toBe(true);
    }
  });
});

/** One chunk, one solid cell at index 0, block 1 -> shape 1, a flat floor at height 8. */
function collisionDoc(): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: {
      colind: new Uint8Array([0, 1]),
      shapes: { heights: [new Int8Array(16), new Int8Array(16).fill(8)], angles: new Uint8Array([0, 0]) },
    },
  } as unknown as LevelDoc;
}

describe('drawCollision: the surface line is on the device grid', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
        const r = underWorld(dpr, v);
        const before = matrixOf(r);
        drawCollision(r.ctx, collisionDoc(), 0, 0, 1, false, dpr);
        const lines = r.strokes.filter((s) => s.style === COLLISION_SURFACE_LINE);
        expect(lines.length, 'one surface segment per solid column').toBe(16);
        const devY = (8 - v.y) * v.zoom * dpr;          // the floor's surface, world y 8
        for (const s of lines) {
          expect(s.width).toBeCloseTo(deviceStrokeWidth(1, dpr), 9);
          expect(s.pts.length).toBe(2);
          for (const [x, y] of s.pts) {
            expect(onHalf(y), `segment row ${y}`).toBe(true);
            expect(y).toBeCloseTo(Math.round(devY) + 0.5, 9);
            expect(isWhole(x), `segment end ${x}`).toBe(true);
          }
        }
        // The 16 segments tile the cell's width with no gap and no overlap.
        const spans = lines.map((s) => [s.pts[0][0], s.pts[1][0]]).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeCloseTo(spans[i - 1][1], 9);
        expect(matrixOf(r), 'drawCollision left a different transform behind').toEqual(before);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// THE CENSUS: a lock, not a reader. The rows above read the helper; this holds that
// the viewport's outlines (the stamp ghost, the stamp-drag preview, the collision
// marquee) reach it, rather than a raw `strokeRect` under the world transform.
// Comments are stripped first: a comment outbids code in a grep.
// ---------------------------------------------------------------------------
describe('every outline ClassicLevelViewport strokes is on the device grid', () => {
  const src = readFileSync(fileURLToPath(new URL('../ClassicLevelViewport.tsx', import.meta.url)), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('the census read the component (anti-vacuous)', () => {
    expect(code.length).toBeGreaterThan(10000);
    expect(code).toMatch(/function ClassicLevelViewport|ClassicLevelViewport/);
  });

  it('no raw strokeRect is left in the component', () => {
    expect(code.match(/\.strokeRect\(/g) ?? []).toEqual([]);
  });

  it('the ghost outline, the stamp-drag preview and the collision marquee go through strokeRectOnDeviceGrid', () => {
    expect((code.match(/strokeRectOnDeviceGrid\(/g) ?? []).length).toBe(3);
  });
});
