// AEON'S OVERLAY STROKES LAND ON THE DEVICE GRID (ROADMAP row 239 (d)).
//
// Row 238 (docs/reviews/2026-09-28-device-grid-238.md, Open) listed the strokes still in
// world units after rows 237/238 and 239 (a). This file holds four of them, read off the
// REAL draw functions through the recorder (chrome-recorder.ts) under the transform each
// one draws in:
//
//   site 3  `OverlayRenderer`'s angle marks (axis-aligned bar and stem) and its
//           no-preview object box;
//   site 4  the priority and both-planes lenses (`drawTileLens` edges), and the
//           composer's priority lens;
//   site 5  the legend swatch's mark (`AngleSwatch`), which is routed through the same
//           adapter but whose $20 profile is ALL diagonal, so nothing in it snaps.
//
// Every expectation is derived from `deviceStrokeWidth` and `Math.round` (grid-edges.ts)
// and from the unsnapped world geometry, never from `snapStrokeEdges` itself. Fractional
// zooms and cameras ON PURPOSE: an integral case cannot tell a snap from none.
//
// MapViewport's own two sites (the paste ghost, the collision-paint outlines) are in
// components/__tests__/map-stragglers-device-grid.test.ts.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { recordingContext, type Recording, type DeviceStroke } from './chrome-recorder';
import { deviceStrokeWidth } from '../device-grid';
import { expectedCentre, edgesWhole } from './grid-edges';
import { OverlayRenderer } from '../OverlayRenderer';
import { drawComposerPriority, COMPOSER_LENS_TILE_PX } from '../composer-priority-lens';
import { createDoc } from '../../../core/art/composer-buffer';
import {
  COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING, OBJECT_BOX_STROKE, PRIORITY_EDGE, BOTH_PLANES_EDGE,
} from '../canvas-colors';
import {
  angleMark, ARROW_WIDTH_SCALE, DETAIL_CELL_PX, MIN_CELL_PX_FOR_MARK,
} from '../../../core/collision/collision-angle-mark';
import { packCollisionCell } from '../../../core/collision/collision-cell-word';
import type { CollisionProfile, CollisionProfileSet } from '../../../core/collision/collision-model';
import type { OverlayOptions } from '../../state/viewStore';
import type { Section } from '../../../core/model/s4-types';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, packNametableWord } from '../../../core/model/s4-types';

const DPRS = [1, 1.25, 1.35, 1.5, 2, 3];
const EPS = 1e-6;
const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;

type View = { zoom: number; x: number; y: number };
/** Zoom Z puts a 16px cell past DETAIL_CELL_PX, so the mark draws its bar beside the stem. */
const Z = (DETAIL_CELL_PX + 1) / 16;
const VIEWS: View[] = [
  { zoom: Z, x: 3.3, y: 1.7 },
  { zoom: 1.5, x: 10.25, y: 3.5 },
  { zoom: 2, x: 0, y: 0 },
  { zoom: 1, x: 13, y: 7 },
];

// ---- the fixture: one flat floor, one slope, one high tile, one marker --------------
const FLAT: CollisionProfile = { heights: new Int8Array(16).fill(8), angle: 0, hasAngle: true, solidity: 'all' };
const SLOPE: CollisionProfile = {
  heights: new Int8Array(Array.from({ length: 16 }, (_, c) => c + 1)), angle: 0x20, hasAngle: true, solidity: 'all',
};
const SET: CollisionProfileSet = {
  engine: 's4',
  solidCount: 3,
  profiles: [{ heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'none' }, FLAT, SLOPE],
};
/** The flat floor's cell and the slope's cell, in 16px cells. */
const FLAT_CELL = { cc: 2, cr: 1 };
const SLOPE_CELL = { cc: 4, cr: 1 };
/** The lone high-priority tile, in 8px tiles. */
const HIGH_TILE = { tx: 5, ty: 5 };
/** The no-preview object's placement point, world px. */
const OBJ = { x: 40, y: 72 };

function putCell(plane: Uint16Array, cc: number, cr: number, word: number): void {
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) plane[(cr * 2 + dy) * SECTION_TILES_WIDE + cc * 2 + dx] = word;
}

function fixtureSection(): Section {
  const a = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  const flat = packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' });
  const slope = packCollisionCell({ shape: 2, xFlip: false, yFlip: false, solidity: 'all' });
  putCell(a, FLAT_CELL.cc, FLAT_CELL.cr, flat);
  putCell(a, SLOPE_CELL.cc, SLOPE_CELL.cr, slope);
  // Plane B equals A only on the flat cell, so the both-planes lens veils exactly it.
  const b = new Uint16Array(a.length);
  putCell(b, FLAT_CELL.cc, FLAT_CELL.cr, flat);
  const nametable = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nametable[HIGH_TILE.ty * SECTION_TILES_WIDE + HIGH_TILE.tx] = packNametableWord(0x2ff, 1, true, false, false);
  return {
    index: 0, name: 's', rings: [], tiles: null, paletteRef: null, bgLayoutRef: null,
    objects: [{ x: OBJ.x, y: OBJ.y, typeId: 'solid', subtype: 0 }],
    tileGrid: { width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH, nametable },
    engineCollision: null, engineCollisionB: null,
    collisionEdit: a, collisionEditB: b,
  } as unknown as Section;
}

function overlays(over: Partial<OverlayOptions>): OverlayOptions {
  return {
    showObjects: false, showRings: false, showTileGrid: false, showBlockGrid: false,
    showChunkGrid: false, showCollision: false, showCollisionAngles: false,
    showCollisionPathB: false, showBgPlane: false, showStart: false,
    showPriority: false, showSolidBothPlanes: false,
    occludeSprites: false, playAnimatedArt: false, showScreenFrame: false,
    ...over,
  } as OverlayOptions;
}

/** OverlayRenderer.render on the recorder, under MapViewport's base `setTransform(dpr)`. */
function renderAt(dpr: number, v: View, opts: Partial<OverlayOptions>): Recording {
  const r = recordingContext();
  (r.ctx as unknown as Record<string, unknown>).arc = () => undefined;
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  new OverlayRenderer().render(
    r.ctx, [{ section: fixtureSection(), offsetX: 0, offsetY: 0 }], overlays(opts),
    { x: v.x, y: v.y, width: 800, height: 600, zoom: v.zoom }, dpr, undefined, SET,
  );
  return r;
}

/** A world coordinate's unsnapped device coordinate under the overlay's transform. */
const dev = (w: number, cam: number, v: View, dpr: number): number => (w - cam) * v.zoom * dpr;

/**
 * The device width a `cssWidth` stroke may be drawn at: `deviceStrokeWidth`'s answer, OR,
 * when `cssWidth * dpr` is an exact TIE between two same-parity integers, either of them.
 *
 * ⚠ MEASURED, NOT ASSUMED (row 239 (d)): the angle mark's stem core is 2 CSS px (3.0
 * device px at dpr 1.5) and its casing 4.8 (6.0 at dpr 1.25), both exact ties, and
 * `deviceStrokeWidth`'s "ties go thinner" is decided there by floating-point noise in
 * the width's arithmetic path (`(k / zoom) * 1.6 * zoom * dpr / dpr`). Measured through
 * that path: the core at dpr 1.5 is 4 device px at zooms 1.5 and 3.625 but 2 at zooms 1
 * and 2; the casing at dpr 1.25 is 5 at zooms 1.5 and 3.625 but 7 at 1 and 2. That is
 * the helper's, not this parcel's, and is reported, not fixed.
 */
function expectWidth(s: DeviceStroke, cssWidth: number, dpr: number): void {
  const want = deviceStrokeWidth(cssWidth, dpr);
  const x = cssWidth * dpr;
  const tie = Math.abs(Math.abs(x - want) - 1) < 1e-9;
  if (tie) {
    expect(isWhole(s.width) && Math.round(s.width) % 2 === want % 2 && Math.abs(s.width - x) < 1 + 1e-9,
      `width ${s.width} at a tie (${x} device px) is neither neighbour`).toBe(true);
  } else {
    expect(s.width, 'width').toBeCloseTo(want, 9);
  }
}

/** Each segment of `s` is axis-aligned with both edges whole, ends whole, width derived. */
function expectSegmentsOnGrid(s: DeviceStroke, cssWidth: number, dpr: number): void {
  expect(s.kind).toBe('path');
  expectWidth(s, cssWidth, dpr);
  expect(s.pts.length % 2).toBe(0);
  for (let i = 0; i < s.pts.length; i += 2) {
    const [[x0, y0], [x1, y1]] = [s.pts[i], s.pts[i + 1]];
    const horizontal = Math.abs(y1 - y0) < EPS, vertical = Math.abs(x1 - x0) < EPS;
    expect(horizontal || vertical, `segment ${i / 2} is neither horizontal nor vertical`).toBe(true);
    expect(edgesWhole(horizontal ? y0 : x0, s.width), `segment ${i / 2}: an edge off the device grid`).toBe(true);
    expect(isWhole(horizontal ? x0 : y0) && isWhole(horizontal ? x1 : y1), `segment ${i / 2}: an end off the grid`).toBe(true);
  }
}

// ═══ site 3: OverlayRenderer's angle marks ═══════════════════════════════════════════
describe('site 3: aeon OverlayRenderer angle marks are on the device grid (row 239 (d))', () => {
  const mark = angleMark(FLAT)!;
  const cx = FLAT_CELL.cc * 16, cy = FLAT_CELL.cr * 16;
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`a flat floor's mark, dpr ${dpr}, zoom ${v.zoom.toFixed(4)}, camera ${v.x},${v.y}`, () => {
        expect(16 * v.zoom >= MIN_CELL_PX_FOR_MARK, 'the view must draw marks at all').toBe(true);
        const detail = 16 * v.zoom >= DETAIL_CELL_PX;
        const r = renderAt(dpr, v, { showCollision: true, showCollisionAngles: true });
        // The slope's mark is diagonal on the same colours; the flat cell's strokes are
        // the axis-aligned ones.
        const axis = (s: DeviceStroke) => s.pts.length === 2
          && (Math.abs(s.pts[0][0] - s.pts[1][0]) < EPS || Math.abs(s.pts[0][1] - s.pts[1][1]) < EPS);
        const core = r.strokes.filter((s) => s.style === COLLISION_ANGLE_TICK && axis(s));
        const casing = r.strokes.filter((s) => s.style === COLLISION_ANGLE_CASING && axis(s));
        expect(core.length, 'bar + stem cores (stem only below the detail tier)').toBe(detail ? 2 : 1);
        expect(casing.length, 'bar + stem casings').toBe(detail ? 2 : 1);
        const stemCore = core[core.length - 1], stemCasing = casing[casing.length - 1];
        // The stem: vertical, at the column nearest the unsnapped anchor.
        expectSegmentsOnGrid(stemCore, 1.25 * ARROW_WIDTH_SCALE, dpr);
        expectSegmentsOnGrid(stemCasing, 3 * ARROW_WIDTH_SCALE, dpr);
        const ax = dev(cx + mark.ax, v.x, v, dpr);
        expect(stemCore.pts[0][0]).toBeCloseTo(expectedCentre(ax, 1.25 * ARROW_WIDTH_SCALE, dpr), 9);
        expect(stemCasing.pts[0][0]).toBeCloseTo(expectedCentre(ax, 3 * ARROW_WIDTH_SCALE, dpr), 9);
        if (detail) {
          // The bar: horizontal, on the row nearest the unsnapped surface.
          expectSegmentsOnGrid(core[0], 1.25, dpr);
          expectSegmentsOnGrid(casing[0], 3, dpr);
          const ay = dev(cy + mark.ay, v.y, v, dpr);
          expect(core[0].pts[0][1]).toBeCloseTo(expectedCentre(ay, 1.25, dpr), 9);
          expect(casing[0].pts[0][1]).toBeCloseTo(expectedCentre(ay, 3, dpr), 9);
        }
      });
    }
  }

  it('CONTROL: the slope ($20) mark is diagonal and drawn where it was, at its unsnapped CSS width', () => {
    const dpr = 1.5, v = VIEWS[0];
    const r = renderAt(dpr, v, { showCollision: true, showCollisionAngles: true });
    const diag = r.strokes.filter((s) => s.style === COLLISION_ANGLE_TICK && s.pts.length === 2
      && Math.abs(s.pts[0][0] - s.pts[1][0]) > EPS && Math.abs(s.pts[0][1] - s.pts[1][1]) > EPS);
    expect(diag.length, 'the slope drew no diagonal core: the control measures nothing').toBe(2);
    expect(diag[0].width, 'the bar core, unsnapped: 1.25 CSS px').toBeCloseTo(1.25 * dpr, 9);
    const m = angleMark(SLOPE)!;
    const sx = SLOPE_CELL.cc * 16, sy = SLOPE_CELL.cr * 16;
    expect(diag[0].pts[0][0]).toBeCloseTo(dev(sx + m.ax - m.tx * 4.5, v.x, v, dpr), 6);
    expect(diag[0].pts[0][1]).toBeCloseTo(dev(sy + m.ay - m.ty * 4.5, v.y, v, dpr), 6);
  });
});

// ═══ site 3: OverlayRenderer's object box ════════════════════════════════════════════
describe('site 3: aeon OverlayRenderer no-preview object box is on the device grid (row 239 (d))', () => {
  const OBJ_VIEWS: View[] = [...VIEWS, { zoom: 0.5, x: 1.3, y: 0.7 }, { zoom: 0.25, x: 0, y: 0 }];
  for (const dpr of DPRS) {
    for (const v of OBJ_VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom.toFixed(4)}, camera ${v.x},${v.y}`, () => {
        const r = renderAt(dpr, v, { showObjects: true });
        const boxes = r.strokes.filter((s) => s.style === OBJECT_BOX_STROKE);
        expect(boxes.length, 'the render drew no object box: the row measures nothing').toBe(1);
        const s = boxes[0];
        expect(s.kind).toBe('rect');
        // The world width (1 world px, so `zoom` CSS px), never under half a CSS px.
        const cssWidth = Math.max(1 * v.zoom, 0.5);
        expect(s.width, 'width').toBeCloseTo(deviceStrokeWidth(cssWidth, dpr), 9);
        for (const [x, y] of s.pts) {
          expect(edgesWhole(x, s.width), `side at x ${x}: an edge off the device grid`).toBe(true);
          expect(edgesWhole(y, s.width), `side at y ${y}: an edge off the device grid`).toBe(true);
        }
        const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
        expect(Math.min(...xs)).toBeCloseTo(expectedCentre(dev(OBJ.x - 8, v.x, v, dpr), cssWidth, dpr), 9);
        expect(Math.min(...ys)).toBeCloseTo(expectedCentre(dev(OBJ.y - 8, v.y, v, dpr), cssWidth, dpr), 9);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.round(16 * v.zoom * dpr), 9);
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(Math.round(16 * v.zoom * dpr), 9);
      });
    }
  }

  it('below zoom 0.5 the border is ONE device px at dpr 1, not the parity rule\'s even minimum of 2', () => {
    const r = renderAt(1, { zoom: 0.25, x: 0, y: 0 }, { showObjects: true });
    const box = r.strokes.find((s) => s.style === OBJECT_BOX_STROKE)!;
    expect(box.width).toBeCloseTo(1, 9);
    // The rule the floor exists to avoid, stated: a quarter CSS px reads as EVEN.
    expect(deviceStrokeWidth(0.25, 1)).toBe(2);
  });
});

// ═══ site 4: the priority and both-planes lenses ═════════════════════════════════════
/** The four boundary segments of a lone marked square at world (x, y), size T. */
function expectLoneSquare(s: DeviceStroke, x: number, y: number, T: number, v: View, dpr: number): void {
  expectSegmentsOnGrid(s, 1, dpr);
  const rows = new Set<number>(), cols = new Set<number>();
  for (let i = 0; i < s.pts.length; i += 2) {
    const [[x0, y0], [, y1]] = [s.pts[i], s.pts[i + 1]];
    if (Math.abs(y1 - y0) < EPS) rows.add(Math.round(y0 * 1e6) / 1e6); else cols.add(Math.round(x0 * 1e6) / 1e6);
  }
  const want = (w: number, cam: number) => Math.round(expectedCentre(dev(w, cam, v, dpr), 1, dpr) * 1e6) / 1e6;
  expect([...rows].sort((p, q) => p - q)).toEqual([want(y, v.y), want(y + T, v.y)].sort((p, q) => p - q));
  expect([...cols].sort((p, q) => p - q)).toEqual([want(x, v.x), want(x + T, v.x)].sort((p, q) => p - q));
}

describe('site 4: aeon priority lens edges are on the device grid (row 239 (d))', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom.toFixed(4)}, camera ${v.x},${v.y}`, () => {
        const r = renderAt(dpr, v, { showPriority: true });
        const edges = r.strokes.filter((s) => s.style === PRIORITY_EDGE);
        expect(edges.length, 'the lens drew no edge stroke: the row measures nothing').toBe(1);
        expect(edges[0].pts.length, 'four segments round the lone tile').toBe(8);
        expectLoneSquare(edges[0], HIGH_TILE.tx * 8, HIGH_TILE.ty * 8, 8, v, dpr);
      });
    }
  }
});

describe('site 4: aeon both-planes lens edges are on the device grid (row 239 (d))', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom.toFixed(4)}, camera ${v.x},${v.y}`, () => {
        const r = renderAt(dpr, v, { showSolidBothPlanes: true });
        const edges = r.strokes.filter((s) => s.style === BOTH_PLANES_EDGE);
        expect(edges.length, 'the lens drew no edge stroke: the row measures nothing').toBe(1);
        expect(edges[0].pts.length, 'four segments round the lone cell').toBe(8);
        expectLoneSquare(edges[0], FLAT_CELL.cc * 16, FLAT_CELL.cr * 16, 16, v, dpr);
      });
    }
  }
});

describe('site 4: the composer priority lens edges are on its canvas\'s pixel grid (row 239 (d))', () => {
  // PixelViewport's composer canvas has a CSS-sized backing store (scale 1) and hands
  // drawOverlay a context translated to the editable origin, never scaled.
  for (const z of [1, 3, 4, 8]) {
    for (const origin of [{ x: 0, y: 0 }, { x: 96, y: 64 }]) {
      it(`zoom ${z}, origin ${origin.x},${origin.y}`, () => {
        const r = recordingContext();
        r.ctx.translate(origin.x, origin.y);
        const doc = createDoc(4, 4);
        doc.cells[1 * 4 + 2].atlasTile = 7;
        doc.cells[1 * 4 + 2].pri = true;
        drawComposerPriority(r.ctx, doc, z);
        const edges = r.strokes.filter((s) => s.style === PRIORITY_EDGE);
        expect(edges.length, 'the lens drew no edge stroke: the row measures nothing').toBe(1);
        expect(edges[0].pts.length).toBe(8);
        const T = COMPOSER_LENS_TILE_PX * z;
        // dpr 1 on this canvas; the "camera" is minus the origin at zoom 1.
        expectLoneSquare(edges[0], 2 * T, 1 * T, T, { zoom: 1, x: -origin.x, y: -origin.y }, 1);
      });
    }
  }
});

// ═══ site 5: the legend swatch ═══════════════════════════════════════════════════════
describe('site 5: the legend swatch routes its mark through the device-grid adapter (row 239 (d))', () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const legend = strip(readFileSync(new URL('../../components/CollisionLegend.tsx', import.meta.url), 'utf8'));

  it('CENSUS: AngleSwatch hands drawAngleMark `segmentsOnDeviceGrid(ctx, dpr)`, never the raw context', () => {
    expect(legend, 'the census read the wrong file').toMatch(/export function AngleSwatch/);
    const calls = legend.match(/drawAngleMark\(/g) ?? [];
    expect(calls.length, 'AngleSwatch no longer calls drawAngleMark: the row measures nothing').toBe(1);
    expect(legend).toMatch(/drawAngleMark\(\s*segmentsOnDeviceGrid\(ctx, dpr\)/);
  });

  it('the swatch\'s $20 mark is ALL diagonal, so the routing changes none of its pixels (disclosed, not a snap)', () => {
    // The profile the legend declares, restated from its source rather than imported
    // (it is module-private): heights c + 1, angle $20.
    expect(legend).toMatch(/heights: new Int8Array\(Array\.from\(\{ length: 16 \}, \(_, c\) => c \+ 1\)\)/);
    expect(legend).toMatch(/angle: 0x20,/);
    const m = angleMark(SLOPE)!;
    expect(Math.abs(m.tx) > EPS && Math.abs(m.ty) > EPS, 'the bar is diagonal').toBe(true);
    expect(Math.abs(m.nx) > EPS && Math.abs(m.ny) > EPS, 'the stem is diagonal').toBe(true);
  });
});
