// THE WIRING, not the arithmetic — the sibling of overlay-priority-wiring.ts.
//
// A perfectly-tested lens nobody calls reproduces the defect exactly: an author
// paints a field nothing depicts. So these rows prove `OverlayRenderer.render`
// — the ONE call MapViewport makes — actually calls each new lens, gates it on
// its own toggle, aims the crossover lens at the plane it was told, and
// aggregates what it drew.
//
// ⚠ THEY IDENTIFY EACH LENS BY ITS FILL COLOUR, not by a call count. Three
// lenses draw `fillRect` into the same context in one pass and the collision
// overlay draws more; a row that counted rects would go green on the wrong
// lens's output. Colour is the only thing that tells them apart from outside.
//
// WHAT THEY STILL CANNOT SEE: React, a real canvas, the View menu, whether any
// of it is on screen, and whether a REAL press writes what the lens then draws.
// That is scratchpad/loop-paint-harness.mjs.

import { describe, it, expect } from 'vitest';
import { OverlayRenderer } from '../OverlayRenderer';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, type Section,
} from '../../../core/model/s4-types';
import { SECTION_PLANE_WORDS } from '../../../core/collision/collision-cell-resolve';
import { packCollisionCell } from '../../../core/collision/collision-cell-word';
import { withCrossover } from '../../../core/collision/layer-transition';
import {
  BOTH_PLANES_FILL, CROSSOVER_FILL, CROSSOVER_ONE_WAY_FILL,
} from '../canvas-colors';
import type { OverlayOptions } from '../../state/viewStore';

function recCtx() {
  const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    lineWidth: 0, font: '', textAlign: 'left' as CanvasTextAlign,
    fillStyle: '', strokeStyle: '', globalAlpha: 1, imageSmoothingEnabled: false,
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
    fill() {}, stroke() {}, setLineDash() {}, moveTo() {}, lineTo() {}, arc() {},
    drawImage() {}, strokeRect() {}, fillText() {},
    measureText: () => ({ width: 0 }),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: (ctx as { fillStyle: string }).fillStyle, x, y, w, h });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

const SOLID = packCollisionCell({ shape: 0x11, xFlip: false, yFlip: false, solidity: 'all' });

/** Cell (cc,cr) writes all four of its 8px sub-tiles, exactly as every writer in
 *  the editor does — so a lens reading only the top-left is reading a real cell,
 *  not an artefact of the fixture. */
function put(plane: Uint16Array, cc: number, cr: number, word: number) {
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    plane[(cr * 2 + dy) * SECTION_TILES_WIDE + (cc * 2 + dx)] = word;
  }
}

function section(build: (a: Uint16Array, b: Uint16Array) => void): Section {
  const a = new Uint16Array(SECTION_PLANE_WORDS);
  const b = new Uint16Array(SECTION_PLANE_WORDS);
  build(a, b);
  return {
    tileGrid: {
      width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH,
      nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
    },
    objects: [], rings: [],
    collisionEdit: a, collisionEditB: b,
  } as unknown as Section;
}

function overlays(over: Partial<OverlayOptions> = {}): OverlayOptions {
  return {
    showObjects: false, showRings: false, showTileGrid: false, showBlockGrid: false,
    showChunkGrid: false, showCollision: false, showCollisionAngles: false,
    showCollisionPathB: false, showBgPlane: false, showStart: false,
    showPriority: false, showSolidBothPlanes: false, showCrossover: false,
    occludeSprites: false, playAnimatedArt: false,
    showScreenFrame: false,
    ...over,
  } as OverlayOptions;
}

const viewport = { x: 0, y: 0, width: 800, height: 600, zoom: 1 };
const byColour = (fills: { style: string }[], c: string) => fills.filter((f) => f.style === c);

describe('OverlayRenderer.render — the both-planes lens gate', () => {
  const bothSolid = section((a, b) => { put(a, 3, 2, SOLID); put(b, 3, 2, SOLID); });

  it('draws NOTHING with the toggle off, though the cell IS solid on both', () => {
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: bothSolid, offsetX: 0, offsetY: 0 }], overlays(), viewport);
    expect(byColour(fills, BOTH_PLANES_FILL)).toEqual([]);
    expect(lens.bothPlanes).toEqual({ veils: 0, segments: 0, sectionsWithPlaneB: 0 });
  });

  it('veils that cell with the toggle ON, at its world position and CELL size', () => {
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: bothSolid, offsetX: 0, offsetY: 0 }],
      overlays({ showSolidBothPlanes: true }), viewport);
    // 16px cells, so cell (3,2) is world (48,32). A lens that had read the
    // planes at TILE resolution would land at (24,16) with an 8px box.
    expect(byColour(fills, BOTH_PLANES_FILL)).toEqual([{ style: BOTH_PLANES_FILL, x: 48, y: 32, w: 16, h: 16 }]);
    expect(lens.bothPlanes.veils).toBe(1);
    expect(lens.bothPlanes.sectionsWithPlaneB).toBe(1);
  });

  it('CONTROL: a cell solid on ONE plane only is not veiled', () => {
    // Without this the lens could be marking "solid at all" and every row above
    // would still pass.
    const { ctx, fills } = recCtx();
    const oneSided = section((a) => { put(a, 3, 2, SOLID); });
    new OverlayRenderer().render(
      ctx, [{ section: oneSided, offsetX: 0, offsetY: 0 }],
      overlays({ showSolidBothPlanes: true }), viewport);
    expect(byColour(fills, BOTH_PLANES_FILL)).toEqual([]);
  });

  it('runs over EVERY section it is given, not just the first', () => {
    // The bug this catches: a lens wired to the active section only.
    const { ctx } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [
        { section: bothSolid, offsetX: 0, offsetY: 0 },
        { section: bothSolid, offsetX: 100, offsetY: 0 },
      ], overlays({ showSolidBothPlanes: true }), viewport);
    expect(lens.bothPlanes.veils).toBe(2);
    expect(lens.bothPlanes.sectionsWithPlaneB).toBe(2);
  });
});

describe('OverlayRenderer.render — the crossover lens gate', () => {
  const pair = section((a, b) => {
    put(a, 5, 1, withCrossover(SOLID, 'to-b'));
    put(b, 5, 1, withCrossover(SOLID, 'to-a'));
  });
  const halfPainted = section((a, b) => {
    put(a, 5, 1, withCrossover(SOLID, 'to-b'));
    put(b, 5, 1, SOLID);            // solid, but NO crossover — the mistake
  });

  it('draws NOTHING with the toggle off, though the cells ARE marked', () => {
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: pair, offsetX: 0, offsetY: 0 }], overlays(), viewport, undefined, null, 'a');
    expect(byColour(fills, CROSSOVER_FILL)).toEqual([]);
    expect(lens.crossover).toEqual({ pairedVeils: 0, oneWayVeils: 0, segments: 0 });
  });

  it('veils a COMPLETE two-way crossover in the paired colour', () => {
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: pair, offsetX: 0, offsetY: 0 }],
      overlays({ showCrossover: true }), viewport, undefined, null, 'a');
    expect(byColour(fills, CROSSOVER_FILL)).toEqual([{ style: CROSSOVER_FILL, x: 80, y: 16, w: 16, h: 16 }]);
    expect(byColour(fills, CROSSOVER_ONE_WAY_FILL)).toEqual([]);
    expect(lens.crossover.pairedVeils).toBe(1);
    expect(lens.crossover.oneWayVeils).toBe(0);
  });

  it('⚠ veils a HALF-PAINTED crossover in the one-way colour instead', () => {
    // THE ROW. On the map these two sections are indistinguishable — the
    // collision overlay shows one plane at a time — and aeon's build does not
    // check it. This is the only place the difference is visible.
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: halfPainted, offsetX: 0, offsetY: 0 }],
      overlays({ showCrossover: true }), viewport, undefined, null, 'a');
    expect(byColour(fills, CROSSOVER_ONE_WAY_FILL)).toHaveLength(1);
    expect(byColour(fills, CROSSOVER_FILL)).toEqual([]);
    expect(lens.crossover.oneWayVeils).toBe(1);
    expect(lens.crossover.pairedVeils).toBe(0);
  });

  it('shows the plane it was AIMED at — plane B sees its own marks', () => {
    const { ctx } = recCtx();
    // Same half-painted fixture, aimed at B: B has no mark, so B's lens is
    // empty. A lens that ignored the aim would report A's mark either way.
    const lens = new OverlayRenderer().render(
      ctx, [{ section: halfPainted, offsetX: 0, offsetY: 0 }],
      overlays({ showCrossover: true }), viewport, undefined, null, 'b');
    expect(lens.crossover.pairedVeils + lens.crossover.oneWayVeils).toBe(0);
  });

  it('does NOT veil the RESERVED value 3 as a crossover', () => {
    // It is a build-breaking defect, not a working feature; the audit reports
    // it in words. Veiling it amber would present it as painted data.
    const { ctx, fills } = recCtx();
    const bad = section((a, b) => {
      put(a, 5, 1, SOLID | (3 << 14));
      put(b, 5, 1, SOLID | (3 << 14));
    });
    new OverlayRenderer().render(
      ctx, [{ section: bad, offsetX: 0, offsetY: 0 }],
      overlays({ showCrossover: true }), viewport, undefined, null, 'a');
    expect(byColour(fills, CROSSOVER_FILL)).toEqual([]);
    expect(byColour(fills, CROSSOVER_ONE_WAY_FILL)).toEqual([]);
  });

  it('the two lenses are independent — each toggle drives only its own', () => {
    const { ctx, fills } = recCtx();
    new OverlayRenderer().render(
      ctx, [{ section: pair, offsetX: 0, offsetY: 0 }],
      overlays({ showCrossover: true }), viewport, undefined, null, 'a');
    // The crossover cells are also solid on both planes, so a lens pair that
    // shared a gate would light teal here too.
    expect(byColour(fills, BOTH_PLANES_FILL)).toEqual([]);
  });
});
