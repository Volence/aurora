// THE REST OF THE SONIC 1 CANVAS'S STROKES LAND ON THE DEVICE GRID (ROADMAP row 238 (c),
// under the row 237 (b) ruling: the existing `snapStroke` / `snapLength`, no new look).
//
// Row 237 snapped classic's ghost outline, stamp-drag preview, marquee and surface line,
// and left (its packet, Open) the object, start, priority and loop-glyph strokes and the
// shared angle mark in world units. This file holds the ones that now snap:
//
//   - the object hex-fallback box (1 CSS px), the ghost marker's dashed box (1 CSS px,
//     dash 3/2 CSS px) and the selection box (2 CSS px), through strokeRectOnDeviceGrid;
//   - the start marker's crosshair (2 CSS px) and the priority lens's boundary edges
//     (1 CSS px) and the angle mark's AXIS-ALIGNED bar and stem, through
//     segmentsOnDeviceGrid (canvas/device-grid.ts), which is snapStroke for the line's
//     row or column and snapLength for its ends.
//
// And the ones that do not, each stated as a row rather than a comment:
//
//   - a DIAGONAL angle mark (any slope) is drawn where it was: the shared rule is about
//     device rows and columns and has no whole-pixel answer for a slanted line;
//   - the start marker's ring and the ring-object circles are arcs, for the same reason;
//   - the loop glyph has NO stroke at all (a filled disc and a glyph), so it has nothing
//     to snap; the census row below fails if one is ever added.
//
// ROW 238 RULING (2026-09-28): every one of these strokes has BOTH edges on whole device
// pixels at every dpr; an even device width (the 2 CSS px selection box and crosshair)
// centres on a whole device pixel. The expectations come from canvas/__tests__/grid-edges.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { recordingContext, type Recording, type DeviceStroke } from '../../../canvas/__tests__/chrome-recorder';
import { deviceStrokeWidth, segmentsOnDeviceGrid } from '../../../canvas/device-grid';
import {
  OBJECT_BOX_STROKE, GHOST_BOX_STROKE, OBJECT_SELECTED_STROKE, START_MARKER, PRIORITY_EDGE,
  COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING,
} from '../../../canvas/canvas-colors';
import { drawObjects, drawStart, drawPriority, drawCollision } from '../classic-overlays';
import { DETAIL_CELL_PX } from '../../../../core/collision/collision-angle-mark';
import type { LevelDoc } from '../../../../core/level-classic/model';
import { monoMeasureText } from '../../../../test/mono-measure';
import { expectedCentre, edgesWhole } from '../../../canvas/__tests__/grid-edges';

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
const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;

/** A recorder under classic's own draw transform, with the two calls it lacks. */
function underWorld(dpr: number, v: { zoom: number; x: number; y: number }): Recording {
  const r = recordingContext();
  const extra = r.ctx as unknown as Record<string, unknown>;
  extra.arc = () => undefined;              // rings and the start ring: not measured here
  extra.measureText = monoMeasureText;      // labels are fitted before they are drawn
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(v.zoom, v.zoom);
  r.ctx.translate(-v.x, -v.y);
  return r;
}
const matrixOf = (r: Recording) => { const t = r.ctx.getTransform(); return [t.a, t.b, t.c, t.d, t.e, t.f]; };
const dev = (w: number, cam: number, v: { zoom: number }, dpr: number): number => (w - cam) * v.zoom * dpr;

/** A world rect's outline, as strokeRectOnDeviceGrid must draw it. */
function expectRectOnGrid(s: DeviceStroke, world: { x: number; y: number; w: number; h: number },
  cssWidth: number, v: { zoom: number; x: number; y: number }, dpr: number): void {
  expect(s.kind).toBe('rect');
  expect(s.width).toBeCloseTo(deviceStrokeWidth(cssWidth, dpr), 9);
  for (const [x, y] of s.pts) {
    expect(edgesWhole(x, s.width), `side at x ${x}: an edge off the device grid`).toBe(true);
    expect(edgesWhole(y, s.width), `side at y ${y}: an edge off the device grid`).toBe(true);
  }
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  expect(Math.min(...xs)).toBeCloseTo(expectedCentre(dev(world.x, v.x, v, dpr), cssWidth, dpr), 9);
  expect(Math.min(...ys)).toBeCloseTo(expectedCentre(dev(world.y, v.y, v, dpr), cssWidth, dpr), 9);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.round(world.w * v.zoom * dpr), 9);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(Math.round(world.h * v.zoom * dpr), 9);
}

/** Every segment of a recorded path is axis-aligned, on the grid by the shared rule. */
function expectSegmentsOnGrid(s: DeviceStroke, cssWidth: number, dpr: number): void {
  expect(s.kind).toBe('path');
  expect(s.width).toBeCloseTo(deviceStrokeWidth(cssWidth, dpr), 9);
  expect(s.pts.length % 2).toBe(0);
  for (let i = 0; i < s.pts.length; i += 2) {
    const [[x0, y0], [x1, y1]] = [s.pts[i], s.pts[i + 1]];
    if (Math.abs(y1 - y0) < EPS) {
      expect(edgesWhole(y0, s.width), `horizontal segment row ${y0}: an edge off the device grid`).toBe(true);
      expect(isWhole(x0) && isWhole(x1), `horizontal segment ends ${x0}, ${x1}`).toBe(true);
    } else {
      expect(Math.abs(x1 - x0) < EPS, `segment ${i / 2} is neither horizontal nor vertical`).toBe(true);
      expect(edgesWhole(x0, s.width), `vertical segment column ${x0}: an edge off the device grid`).toBe(true);
      expect(isWhole(y0) && isWhole(y1), `vertical segment ends ${y0}, ${y1}`).toBe(true);
    }
  }
}

describe('segmentsOnDeviceGrid: the shared rule for a straight world segment', () => {
  for (const w of [1, 2, 1.25, 3]) {
    for (const dpr of DPRS) {
      for (const v of VIEWS) {
        it(`${w} CSS px at dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
          const r = underWorld(dpr, v);
          const before = matrixOf(r);
          const p = segmentsOnDeviceGrid(r.ctx, dpr);
          p.strokeStyle = 'probe';
          p.lineWidth = w / v.zoom;                  // world units, as the callers pass it
          p.beginPath();
          p.moveTo(100.3, 50.7); p.lineTo(140.9, 50.7);   // horizontal
          p.moveTo(77.6, 20.2); p.lineTo(77.6, 61.1);     // vertical
          p.moveTo(10, 10); p.lineTo(20, 17);             // diagonal
          p.stroke();
          expect(matrixOf(r), 'the adapter left a different transform behind').toEqual(before);
          expect(r.strokes.length, 'one stroke for the snapped segments, one for the diagonal').toBe(2);
          const [grid, diag] = r.strokes;
          expectSegmentsOnGrid(grid, w, dpr);
          // Where: snapStroke's row / column on the unsnapped device coordinate.
          expect(grid.pts[0][1]).toBeCloseTo(expectedCentre(dev(50.7, v.y, v, dpr), w, dpr), 9);
          expect(grid.pts[0][0]).toBeCloseTo(Math.round(dev(100.3, v.x, v, dpr)), 9);
          expect(grid.pts[2][0]).toBeCloseTo(expectedCentre(dev(77.6, v.x, v, dpr), w, dpr), 9);
          // The diagonal is drawn where it was, at its unsnapped width.
          expect(diag.width).toBeCloseTo(w * dpr, 9);
          expect(diag.pts[0][0]).toBeCloseTo(dev(10, v.x, v, dpr), 9);
          expect(diag.pts[1][1]).toBeCloseTo(dev(17, v.y, v, dpr), 9);
          expect(grid.style).toBe('probe');
        });
      }
    }
  }

  it('a quarter-turn direction from Math.cos/sin (~6e-17 off axis) counts as vertical', () => {
    const r = underWorld(1.5, VIEWS[3]);
    const p = segmentsOnDeviceGrid(r.ctx, 1.5);
    p.lineWidth = 1;
    p.beginPath();
    p.moveTo(40, 40); p.lineTo(40 + Math.cos(Math.PI / 2) * 6.5, 40 - 6.5);
    p.stroke();
    expect(r.strokes.length).toBe(1);
    expectSegmentsOnGrid(r.strokes[0], 1 * VIEWS[3].zoom, 1.5);
  });
});

/** One object placement. */
const docWith = (id: number, x = 100.25, y = 60.5): LevelDoc =>
  ({ objects: [{ x, y, id, subtype: 0, xflip: false, yflip: false, respawn: false }] } as unknown as LevelDoc);

describe('drawObjects: the marker and selection outlines are on the device grid', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
        // $10 has no sprite and is not invisible: the hex box. Selected, so the box too.
        const r = underWorld(dpr, v);
        const before = matrixOf(r);
        drawObjects(r.ctx, docWith(0x10), 1 / v.zoom, dpr, new Map(), '', 0);
        expect(matrixOf(r)).toEqual(before);
        const hex = r.strokes.filter((s) => s.style === OBJECT_BOX_STROKE);
        const sel = r.strokes.filter((s) => s.style === OBJECT_SELECTED_STROKE);
        expect(hex.length, 'no hex box outline was drawn: the row measures nothing').toBe(1);
        expect(sel.length, 'no selection outline was drawn: the row measures nothing').toBe(1);
        expectRectOnGrid(hex[0], { x: 100.25 - 8, y: 60.5 - 8, w: 16, h: 16 }, 1, v, dpr);
        const pad = 2 / v.zoom;
        expectRectOnGrid(sel[0], { x: 100.25 - 11 - pad, y: 60.5 - 11 - pad, w: 22 + 2 * pad, h: 22 + 2 * pad }, 2, v, dpr);

        // An invisible id ($71, a trigger): the dashed ghost marker box.
        const g = underWorld(dpr, v);
        drawObjects(g.ctx, docWith(0x71), 1 / v.zoom, dpr, new Map(), '');
        const ghost = g.strokes.filter((s) => s.style === GHOST_BOX_STROKE);
        expect(ghost.length, 'no ghost marker outline was drawn: the row measures nothing').toBe(1);
        expectRectOnGrid(ghost[0], { x: 100.25 - 12, y: 60.5 - 8, w: 24, h: 16 }, 1, v, dpr);
        expect(ghost[0].dash, 'the dash is 3/2 CSS px in the frame the box is stroked in').toEqual([3, 2]);
      });
    }
  }
});

describe('drawStart: the crosshair is on the device grid', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
        const r = underWorld(dpr, v);
        const before = matrixOf(r);
        drawStart(r.ctx, { start: { x: 80.3, y: 40.6 } } as unknown as LevelDoc, 1 / v.zoom, dpr);
        expect(matrixOf(r)).toEqual(before);
        const marks = r.strokes.filter((s) => s.style === START_MARKER);
        // The ring (an arc, not snapped) and the crosshair.
        const cross = marks.filter((s) => s.pts.length === 4);
        expect(cross.length, 'no crosshair was drawn: the row measures nothing').toBe(1);
        expectSegmentsOnGrid(cross[0], 2, dpr);
        expect(cross[0].pts[0][1]).toBeCloseTo(expectedCentre(dev(40.6, v.y, v, dpr), 2, dpr), 9);
        expect(cross[0].pts[2][0]).toBeCloseTo(expectedCentre(dev(80.3, v.x, v, dpr), 2, dpr), 9);
      });
    }
  }
});

/** SBZ block $5A's pattern (one high tile, TL) at chunk cell 0 (classic-overlays.test.ts). */
function priorityDoc(): LevelDoc {
  const lowCell = { tile: 0, xf: false, yf: false, pal: 0, pri: false };
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[17] = { block: 1, xf: false, yf: false, solidity: 0 };   // an interior cell: all four sides known
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [lowCell, lowCell, lowCell, lowCell] },
      { cells: [{ ...lowCell, tile: 0xae, pri: true }, lowCell, lowCell, lowCell] }],
  } as unknown as LevelDoc;
}

describe('drawPriority: the high/low boundary edges are on the device grid', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
        const r = underWorld(dpr, v);
        const before = matrixOf(r);
        drawPriority(r.ctx, priorityDoc(), 0, 0, 1, 1 / v.zoom, dpr);
        expect(matrixOf(r)).toEqual(before);
        const edges = r.strokes.filter((s) => s.style === PRIORITY_EDGE);
        expect(edges.length, 'the lens stroked its edges in one stroke').toBe(1);
        expect(edges[0].pts.length, 'four sides of the lone high tile').toBe(8);
        expectSegmentsOnGrid(edges[0], 1, dpr);
      });
    }
  }
});

/** One solid cell, flat floor at height 8, at the given angle byte. */
function collisionDoc(angle: number): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: {
      colind: new Uint8Array([0, 1]),
      shapes: { heights: [new Int8Array(16), new Int8Array(16).fill(8)], angles: new Uint8Array([0, angle]) },
    },
  } as unknown as LevelDoc;
}

describe('drawCollision: the angle mark', () => {
  // A zoom that puts the cell past DETAIL_CELL_PX, so the bar is drawn beside the stem.
  const Z = (DETAIL_CELL_PX + 1) / 16;
  for (const dpr of DPRS) {
    it(`a flat floor's bar and stem are on the device grid at dpr ${dpr}`, () => {
      const r = underWorld(dpr, { zoom: Z, x: 3.3, y: 1.7 });
      drawCollision(r.ctx, collisionDoc(0), 0, 0, 1, true, dpr);
      const core = r.strokes.filter((s) => s.style === COLLISION_ANGLE_TICK);
      const casing = r.strokes.filter((s) => s.style === COLLISION_ANGLE_CASING);
      expect(core.length, 'bar + stem core').toBe(2);
      expect(casing.length, 'bar + stem casing').toBe(2);
      for (const s of [...core, ...casing]) {
        expect(s.pts.length).toBe(2);
        const [[x0, y0], [x1, y1]] = s.pts;
        const horizontal = Math.abs(y1 - y0) < EPS, vertical = Math.abs(x1 - x0) < EPS;
        expect(horizontal || vertical, 'a flat floor\'s mark is axis-aligned').toBe(true);
        expect(edgesWhole(horizontal ? y0 : x0, s.width), 'both of its edges are whole device px').toBe(true);
        expect(isWhole(horizontal ? x0 : y0) && isWhole(horizontal ? x1 : y1), 'its ends are whole device px').toBe(true);
        expect(isWhole(s.width), 'its width is whole device px').toBe(true);
      }
      // The BAR's core (1.25 CSS px) and casing (3) are both ODD device widths at every
      // dpr, so they share one centre line.
      expect(core[0].pts[0][1]).toBeCloseTo(casing[0].pts[0][1], 9);
      // The STEM's core is 1.25 x ARROW_WIDTH_SCALE = 2 CSS px (EVEN at every dpr) and
      // its casing 3 x 1.6 = 4.8 CSS px (rounds to 5: ODD at every dpr). Under the
      // ruling's parity-aware centring they cannot both have whole-pixel edges AND share
      // a centre: they sit exactly half a device px apart, so the casing shows one more
      // device px on one side than the other. Held here as a measured consequence, not
      // hidden; the packet reports it.
      expect(Math.abs(core[1].pts[0][0] - casing[1].pts[0][0]), 'stem core vs casing centre, device px').toBeCloseTo(0.5, 9);
    });
  }

  it('a slope ($E0) is diagonal and is drawn where it was, at its unsnapped width', () => {
    const dpr = 1.5, v = { zoom: Z, x: 3.3, y: 1.7 };
    const r = underWorld(dpr, v);
    drawCollision(r.ctx, collisionDoc(0xe0), 0, 0, 1, true, dpr);
    const core = r.strokes.filter((s) => s.style === COLLISION_ANGLE_TICK);
    expect(core.length).toBe(2);
    // The bar's core is 1.25 CSS px wide, unsnapped: 1.25 x 1.5 device px.
    expect(core[0].width).toBeCloseTo(1.25 * dpr, 9);
    const [[x0, y0], [x1, y1]] = core[0].pts;
    expect(Math.abs(x1 - x0) > EPS && Math.abs(y1 - y0) > EPS, 'the fixture slope is not diagonal').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE CENSUS: a lock, not a reader. Comments stripped first: a comment outbids code.
// ---------------------------------------------------------------------------
describe('classic-overlays and the loop glyph', () => {
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const overlays = strip(readFileSync(fileURLToPath(new URL('../classic-overlays.ts', import.meta.url)), 'utf8'));
  const viewport = strip(readFileSync(fileURLToPath(new URL('../ClassicLevelViewport.tsx', import.meta.url)), 'utf8'));

  it('the census read both files (anti-vacuous)', () => {
    expect(overlays).toMatch(/export function drawObjects/);
    expect(viewport).toMatch(/function drawLoopGlyph/);
  });

  it('no raw strokeRect is left in classic-overlays.ts', () => {
    expect(overlays.match(/\.strokeRect\(/g) ?? []).toEqual([]);
  });

  it('the loop glyph strokes nothing (a filled disc and a glyph), so it has nothing to snap', () => {
    const body = /function drawLoopGlyph[\s\S]*?\n}\n/.exec(viewport);
    expect(body, 'drawLoopGlyph moved: the census cannot find its body').not.toBeNull();
    expect(body![0]).toMatch(/\.fill\(\)/);                  // anti-vacuous: it draws
    expect(body![0].match(/\.stroke(Rect)?\(/g) ?? [], 'the loop glyph now strokes: snap it (row 238 (c))').toEqual([]);
  });
});
