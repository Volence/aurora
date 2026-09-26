// THE WIRING, not the arithmetic — the sibling of overlay-priority-wiring.test.ts.
//
// A perfectly-tested lens nobody calls reproduces the defect exactly: an author
// paints a field nothing depicts. So these rows prove `OverlayRenderer.render`
// — the ONE call MapViewport makes — actually calls the both-planes lens, gates
// it on its own toggle, and aggregates what it drew.
//
// (This file was loop-lens-wiring.test.ts and also drove the loop CROSSOVER
// lens. That lens was retired with the painted marks, ROADMAP rows 223+224, and
// its rows were deleted with it; the both-planes rows are unchanged.)
//
// ⚠ THEY IDENTIFY THE LENS BY ITS FILL COLOUR, not by a call count: the
// collision overlay draws `fillRect` into the same context, and a row that
// counted rects would go green on the wrong output.

import { describe, it, expect } from 'vitest';
import { OverlayRenderer } from '../OverlayRenderer';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, type Section,
} from '../../../core/model/s4-types';
import { SECTION_PLANE_WORDS } from '../../../core/collision/collision-cell-resolve';
import { packCollisionCell } from '../../../core/collision/collision-cell-word';
import { BOTH_PLANES_FILL } from '../canvas-colors';
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
    showPriority: false, showSolidBothPlanes: false,
    occludeSprites: false, playAnimatedArt: false,
    showScreenFrame: false,
    ...over,
  } as OverlayOptions;
}

const viewport = { x: 0, y: 0, width: 800, height: 600, zoom: 1 };
const byColour = (fills: { style: string }[], c: string) => fills.filter((f) => f.style === c);

describe('OverlayRenderer.render: the both-planes lens gate', () => {
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
