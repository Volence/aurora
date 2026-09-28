// AEON'S REMAINING OVERLAY STROKES LAND ON THE DEVICE GRID (ROADMAP row 240 (a)).
//
// Row 239 (d) put five stroke sites on the device grid and listed the ones it left in
// world units (docs/reviews/2026-09-28-stragglers-239d.md section 6). This file holds
// three of them, read off the REAL `OverlayRenderer.render` through the recorder
// (chrome-recorder.ts) under MapViewport's base `setTransform(dpr)`:
//
//   the collision SURFACE LINE   `1 / zoom` world, so 1 CSS px, one segment per column;
//   the A/B DIFF OUTLINE         `1.5 / zoom` world inset by `0.75 / zoom`, so an inset
//                                1.5 CSS px outline;
//   the tile, block and section GRIDS   0.5, 1 and 2 WORLD px, floored at 0.5 CSS px.
//
// The collision-paint shape ghost is in components/__tests__/map-leftovers-device-grid.test.ts,
// and PixelViewport's chrome in components/art-shared/__tests__/pixel-viewport-device-grid.test.ts.
//
// Every expectation is derived from `deviceStrokeWidth` and `Math.round` (grid-edges.ts)
// and the unsnapped world geometry, never from `snapStrokeEdges`. Fractional zooms and
// cameras ON PURPOSE: an integral case cannot tell a snap from none.

import { describe, it, expect } from 'vitest';
import { recordingContext, type Recording, type DeviceStroke } from './chrome-recorder';
import { deviceStrokeWidth } from '../device-grid';
import { expectedCentre, edgesWhole } from './grid-edges';
import {
  OverlayRenderer, TILE_GRID_WORLD_WIDTH, BLOCK_GRID_WORLD_WIDTH, SECTION_GRID_WORLD_WIDTH, MIN_GRID_SPACING_CSS_PX,
} from '../OverlayRenderer';
import { COLLISION_SURFACE_LINE, COLLISION_DIFF, GRID_TILE, GRID_BLOCK, GRID_SECTION } from '../canvas-colors';
import { packCollisionCell } from '../../../core/collision/collision-cell-word';
import type { CollisionProfile, CollisionProfileSet } from '../../../core/collision/collision-model';
import type { OverlayOptions } from '../../state/viewStore';
import type { Section } from '../../../core/model/s4-types';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../../core/model/s4-types';

const DPRS = [1, 1.25, 1.35, 1.5, 2, 3];
const EPS = 1e-6;
const isWhole = (v: number): boolean => Math.abs(v - Math.round(v)) < EPS;

type View = { zoom: number; x: number; y: number };
/**
 * ⚠ NO VIEW PUTS AN EDGE EXACTLY HALFWAY BETWEEN TWO DEVICE PIXELS. A POSITION tie
 * (`Math.round` of x.5 in `snapStrokeEdges` / `snapLength`) is decided by floating-point
 * noise in the mapping just as the width ties row 240 (b) fixed were: at zoom 3.3, camera
 * 13, the world column 48 is device 115.5, and the renderer's `w * k + e` rounds it to 115
 * where `(w - cam) * zoom * dpr` rounds it to 116. Reported with row 240, not fixed here
 * (the brief's (b) is the width); these views keep clear of it so a row measures the snap.
 */
const VIEWS: View[] = [
  { zoom: 1.0625, x: 3.3, y: 1.7 },
  { zoom: 1.5, x: 10.25, y: 3.5 },
  { zoom: 2, x: 0, y: 0 },
  { zoom: 3.3, x: 13.1, y: 7.2 },
];

// ---- the fixture: one flat floor on plane A, the same cell air on plane B ------------
const FLAT: CollisionProfile = { heights: new Int8Array(16).fill(8), angle: 0, hasAngle: true, solidity: 'all' };
const SET: CollisionProfileSet = {
  engine: 's4',
  solidCount: 2,
  profiles: [{ heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'none' }, FLAT],
};
/** The flat floor's cell, in 16px cells: solid on A, air on B, so the planes differ there. */
const CELL = { cc: 2, cr: 1 };
/** A height-8 floor's surface, cell-local px from the top. */
const SURFACE_Y = 8;

function fixtureSection(): Section {
  const a = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  const flat = packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' });
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) a[(CELL.cr * 2 + dy) * SECTION_TILES_WIDE + CELL.cc * 2 + dx] = flat;
  const b = new Uint16Array(a.length);
  return {
    index: 0, name: 's', rings: [], tiles: null, paletteRef: null, bgLayoutRef: null, objects: [],
    tileGrid: { width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH, nametable: new Uint16Array(a.length) },
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

const W = 800, H = 600;

/** OverlayRenderer.render on the recorder, under MapViewport's base `setTransform(dpr)`. */
function renderAt(dpr: number, v: View, opts: Partial<OverlayOptions>): Recording {
  const r = recordingContext();
  (r.ctx as unknown as Record<string, unknown>).arc = () => undefined;
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  new OverlayRenderer().render(
    r.ctx, [{ section: fixtureSection(), offsetX: 0, offsetY: 0 }], overlays(opts),
    { x: v.x, y: v.y, width: W, height: H, zoom: v.zoom }, dpr, undefined, SET,
  );
  return r;
}

/** A world coordinate's unsnapped device coordinate under the overlay's transform. */
const dev = (w: number, cam: number, v: View, dpr: number): number => (w - cam) * v.zoom * dpr;

/** The segments of a path stroke, as [x0, y0, x1, y1]. */
function segments(s: DeviceStroke): [number, number, number, number][] {
  expect(s.kind).toBe('path');
  expect(s.pts.length % 2).toBe(0);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < s.pts.length; i += 2) out.push([s.pts[i][0], s.pts[i][1], s.pts[i + 1][0], s.pts[i + 1][1]]);
  return out;
}

// ═══ the collision surface line ═══════════════════════════════════════════════════════
describe('the collision surface line is on the device grid (row 240 (a))', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
        const r = renderAt(dpr, v, { showCollision: true });
        const lines = r.strokes.filter((s) => s.style === COLLISION_SURFACE_LINE);
        expect(lines.length, 'the flat cell drew no surface line: the row measures nothing').toBeGreaterThan(0);
        const segs = lines.flatMap(segments);
        expect(segs.length, 'one segment per column').toBe(16);
        const cx = CELL.cc * 16, cy = CELL.cr * 16;
        const row = expectedCentre(dev(cy + SURFACE_Y, v.y, v, dpr), 1, dpr);
        for (const s of lines) expect(s.width, 'width').toBeCloseTo(deviceStrokeWidth(1, dpr), 9);
        segs.forEach(([x0, y0, x1, y1], c) => {
          expect(y0, `column ${c}: row`).toBeCloseTo(row, 9);
          expect(y1, `column ${c}: horizontal`).toBeCloseTo(row, 9);
          expect(edgesWhole(y0, lines[0].width), `column ${c}: an edge off the device grid`).toBe(true);
          expect(isWhole(x0) && isWhole(x1), `column ${c}: an end off the device grid`).toBe(true);
          expect(x0, `column ${c}: left end`).toBeCloseTo(Math.round(dev(cx + c, v.x, v, dpr)), 9);
          expect(x1, `column ${c}: right end`).toBeCloseTo(Math.round(dev(cx + c + 1, v.x, v, dpr)), 9);
        });
      });
    }
  }
});

// ═══ the A/B diff outline ═════════════════════════════════════════════════════════════
describe('the A/B diff outline is inset on the device grid (row 240 (a))', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
        const r = renderAt(dpr, v, { showCollision: true, showCollisionPathB: true });
        const outlines = r.strokes.filter((s) => s.style === COLLISION_DIFF);
        expect(outlines.length, 'the differing cell drew no diff outline: the row measures nothing').toBe(1);
        const s = outlines[0];
        expect(s.kind).toBe('rect');
        const w = deviceStrokeWidth(1.5, dpr);
        expect(s.width, 'width').toBeCloseTo(w, 9);
        const cx = CELL.cc * 16, cy = CELL.cr * 16;
        const L = Math.round(dev(cx, v.x, v, dpr)), T = Math.round(dev(cy, v.y, v, dpr));
        const R = Math.round(dev(cx + 16, v.x, v, dpr)), B = Math.round(dev(cy + 16, v.y, v, dpr));
        const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
        // Each side's centre is half the width in from its outer edge: both edges whole,
        // the stroke inside [L, R] x [T, B].
        expect(Math.min(...xs) - w / 2, 'left outer edge').toBeCloseTo(L, 9);
        expect(Math.min(...ys) - w / 2, 'top outer edge').toBeCloseTo(T, 9);
        expect(Math.max(...xs) + w / 2, 'right outer edge').toBeCloseTo(R, 9);
        expect(Math.max(...ys) + w / 2, 'bottom outer edge').toBeCloseTo(B, 9);
      });
    }
  }
});

// ═══ the three grids ══════════════════════════════════════════════════════════════════
const GRIDS = [
  { name: 'tile', opt: 'showTileGrid', style: GRID_TILE, step: 8, world: TILE_GRID_WORLD_WIDTH },
  { name: 'block', opt: 'showBlockGrid', style: GRID_BLOCK, step: 128, world: BLOCK_GRID_WORLD_WIDTH },
  { name: 'section', opt: 'showChunkGrid', style: GRID_SECTION, step: SECTION_PIXEL_SIZE, world: SECTION_GRID_WORLD_WIDTH },
] as const;
const GRID_VIEWS: View[] = [...VIEWS, { zoom: 0.25, x: 1.3, y: 0.7 }, { zoom: 0.4, x: 0, y: 0 }];

describe('the tile, block and section grids are on the device grid (row 240 (a))', () => {
  for (const g of GRIDS) {
    for (const dpr of DPRS) {
      for (const v of GRID_VIEWS) {
        it(`${g.name} grid, dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, () => {
          const r = renderAt(dpr, v, { [g.opt]: true });
          const lines = r.strokes.filter((s) => s.style === g.style);
          // The loop's own lines, restated: every multiple of `step` across the view.
          const vw = W / v.zoom, vh = H / v.zoom;
          const xs: number[] = [], ys: number[] = [];
          for (let x = Math.floor(v.x / g.step) * g.step; x < v.x + vw; x += g.step) xs.push(x);
          for (let y = Math.floor(v.y / g.step) * g.step; y < v.y + vh; y += g.step) ys.push(y);
          // A grid under MIN_GRID_SPACING_CSS_PX apart on screen is not drawn at all (its
          // own describe below holds that edge); these rows then hold only that nothing leaks.
          const drawn = g.step * v.zoom >= MIN_GRID_SPACING_CSS_PX;
          expect(lines.length, 'one stroke per grid line').toBe(drawn ? xs.length + ys.length : 0);
          const cssWidth = Math.max(g.world * v.zoom, 0.5);
          const want = deviceStrokeWidth(cssWidth, dpr);
          lines.forEach((s, i) => {
            expect(s.width, `line ${i}: width`).toBeCloseTo(want, 9);
            const [[x0, y0, x1, y1]] = segments(s);
            const vertical = i < xs.length;
            if (vertical) {
              expect(x1, `line ${i}: vertical`).toBeCloseTo(x0, 9);
              expect(x0, `line ${i}: column`).toBeCloseTo(expectedCentre(dev(xs[i], v.x, v, dpr), cssWidth, dpr), 9);
              expect(isWhole(y0) && isWhole(y1), `line ${i}: an end off the device grid`).toBe(true);
            } else {
              expect(y1, `line ${i}: horizontal`).toBeCloseTo(y0, 9);
              expect(y0, `line ${i}: row`).toBeCloseTo(expectedCentre(dev(ys[i - xs.length], v.y, v, dpr), cssWidth, dpr), 9);
              expect(isWhole(x0) && isWhole(x1), `line ${i}: an end off the device grid`).toBe(true);
            }
            expect(edgesWhole(vertical ? x0 : y0, s.width), `line ${i}: an edge off the device grid`).toBe(true);
          });
        });
      }
    }
  }

  it('below half a CSS px a grid line is ONE device px at dpr 1, not the parity rule\'s even minimum of 2', () => {
    // The block grid at zoom 0.25: a quarter CSS px wide, 32 CSS px apart, so drawn.
    const zoom = 0.25;
    expect(128 * zoom >= MIN_GRID_SPACING_CSS_PX, 'the case must be a drawn grid').toBe(true);
    const r = renderAt(1, { zoom, x: 0, y: 0 }, { showBlockGrid: true });
    const lines = r.strokes.filter((s) => s.style === GRID_BLOCK);
    expect(lines.length).toBeGreaterThan(0);
    for (const s of lines) expect(s.width).toBeCloseTo(1, 9);
    // The rule the floor exists to avoid, stated: a quarter CSS px reads as EVEN.
    expect(deviceStrokeWidth(BLOCK_GRID_WORLD_WIDTH * zoom, 1)).toBe(2);
  });
});

// ═══ the spacing threshold (overseer ruling 2026-09-28, row 240) ════════════════════════
describe('a map grid closer than MIN_GRID_SPACING_CSS_PX on screen is not drawn', () => {
  // Zooms DERIVED from the constant and each grid's step: exactly at the threshold, and
  // just under it. Both sides at every dpr for the tile grid; one block-grid case.
  const JUST_UNDER = 1 - 1e-3;
  const tileAt = MIN_GRID_SPACING_CSS_PX / 8;
  for (const dpr of DPRS) {
    it(`tile grid, spacing just under the threshold: nothing drawn, dpr ${dpr}`, () => {
      const zoom = tileAt * JUST_UNDER;
      expect(8 * zoom).toBeLessThan(MIN_GRID_SPACING_CSS_PX);
      const r = renderAt(dpr, { zoom, x: 0, y: 0 }, { showTileGrid: true });
      expect(r.strokes.filter((s) => s.style === GRID_TILE).length).toBe(0);
    });
    it(`tile grid, spacing exactly at the threshold: drawn, dpr ${dpr}`, () => {
      expect(8 * tileAt).toBe(MIN_GRID_SPACING_CSS_PX);
      const r = renderAt(dpr, { zoom: tileAt, x: 0, y: 0 }, { showTileGrid: true });
      expect(r.strokes.filter((s) => s.style === GRID_TILE).length).toBeGreaterThan(0);
    });
    it(`tile grid, spacing above the threshold: drawn, dpr ${dpr}`, () => {
      const zoom = tileAt * 1.5;
      const r = renderAt(dpr, { zoom, x: 0, y: 0 }, { showTileGrid: true });
      expect(r.strokes.filter((s) => s.style === GRID_TILE).length).toBeGreaterThan(0);
    });
  }
  it('block grid, spacing just under the threshold: nothing drawn', () => {
    const zoom = (MIN_GRID_SPACING_CSS_PX / 128) * JUST_UNDER;
    expect(128 * zoom).toBeLessThan(MIN_GRID_SPACING_CSS_PX);
    const r = renderAt(1, { zoom, x: 0, y: 0 }, { showBlockGrid: true });
    expect(r.strokes.filter((s) => s.style === GRID_BLOCK).length).toBe(0);
  });
});
