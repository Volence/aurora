// THE WIRING, not the arithmetic.
//
// priority-lens.test.ts proves `drawSectionPriority` veils the right tiles;
// this file proves `OverlayRenderer.render` — the ONE call site MapViewport
// makes — actually calls it, gates it on `options.showPriority`, and aggregates
// what it drew for the report. A perfectly-tested helper nobody calls would
// reproduce the owner's bug exactly ("no way to see what art on fg is priority
// or not"), which is the whole reason this file exists next to that one.
//
// WHAT IT STILL CANNOT SEE: React, a real canvas, the View menu, and whether
// any of it is on screen. That is scratchpad/priority-lens-harness.mjs.

import { describe, it, expect } from 'vitest';
import { OverlayRenderer } from '../OverlayRenderer';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE, packNametableWord,
  type Section,
} from '../../../core/model/s4-types';
import { PRIORITY_FILL } from '../canvas-colors';
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

const HI = packNametableWord(0x2ff, 1, true, false, false);

/** A section with exactly one high-priority tile, at nametable (col,row). */
function sectionWithHighTile(col: number, row: number): Section {
  const nametable = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nametable[row * SECTION_TILES_WIDE + col] = HI;
  return {
    tileGrid: { width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH, nametable },
    objects: [], rings: [],
  } as unknown as Section;
}

/** Every overlay off except the ones a row names. */
function overlays(over: Partial<OverlayOptions> = {}): OverlayOptions {
  return {
    showObjects: false, showRings: false, showTileGrid: false, showBlockGrid: false,
    showChunkGrid: false, showCollision: false, showCollisionAngles: false,
    showCollisionPathB: false, showBgPlane: false, showStart: false,
    showPriority: false, occludeSprites: false, playAnimatedArt: false,
    showScreenFrame: false, showCameraPreview: false,
    ...over,
  } as OverlayOptions;
}

const viewport = { x: 0, y: 0, width: 800, height: 600, zoom: 1 };

/** The lens's own fillRects, told apart from any other overlay's by colour. */
const veils = (fills: { style: string }[]) => fills.filter((f) => f.style === PRIORITY_FILL);

describe('OverlayRenderer.render — the priority lens gate', () => {
  it('draws NOTHING with the toggle off, even though the section HAS a high tile', () => {
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: sectionWithHighTile(3, 2), offsetX: 0, offsetY: 0 }],
      overlays(), viewport,
    );
    expect(veils(fills)).toEqual([]);
    expect(lens).toEqual({ veils: 0, segments: 0 });
  });

  it('veils that tile with the toggle ON, at its world position', () => {
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section: sectionWithHighTile(3, 2), offsetX: 0, offsetY: 0 }],
      overlays({ showPriority: true }), viewport,
    );
    expect(veils(fills)).toEqual([{ style: PRIORITY_FILL, x: 24, y: 16, w: 8, h: 8 }]);
    expect(lens).toEqual({ veils: 1, segments: 4 });
  });

  it('runs over EVERY section it is given, at each one\'s own world offset', () => {
    // The bug this catches: a lens wired to the active section only. Section 1
    // sits at world x = SECTION_PIXEL_SIZE, so its veil must be offset by it.
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx,
      [
        { section: sectionWithHighTile(3, 2), offsetX: 0, offsetY: 0 },
        { section: sectionWithHighTile(1, 1), offsetX: SECTION_PIXEL_SIZE, offsetY: 0 },
      ],
      overlays({ showPriority: true }),
      // Wide enough to see both sections' tiles.
      { x: 0, y: 0, width: SECTION_PIXEL_SIZE + 64, height: 600, zoom: 1 },
    );
    expect(veils(fills)).toEqual([
      { style: PRIORITY_FILL, x: 24, y: 16, w: 8, h: 8 },
      { style: PRIORITY_FILL, x: SECTION_PIXEL_SIZE + 8, y: 8, w: 8, h: 8 },
    ]);
    expect(lens).toEqual({ veils: 2, segments: 8 });
  });

  it('reports zeroes — not silence — for a section with no high tile', () => {
    const nametable = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    const section = {
      tileGrid: { width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH, nametable },
      objects: [], rings: [],
    } as unknown as Section;
    const { ctx, fills } = recCtx();
    const lens = new OverlayRenderer().render(
      ctx, [{ section, offsetX: 0, offsetY: 0 }], overlays({ showPriority: true }), viewport,
    );
    expect(veils(fills)).toEqual([]);
    expect(lens).toEqual({ veils: 0, segments: 0 });
  });
});
