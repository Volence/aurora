// The aeon priority lens: the WINDOW (the property that keeps a 256x256x48-tile
// act affordable) and the REPORT (the publish a harness reads).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  drawSectionPriority, LENS_TILE_PX,
  publishPriorityLensReport, lastPriorityLensReport,
} from '../priority-lens';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, packNametableWord } from '../../../core/model/s4-types';
import { PRIORITY_FILL, PRIORITY_EDGE } from '../canvas-colors';

interface Rect { x: number; y: number; w: number; h: number }

function recCtx() {
  const rects: Rect[] = [];
  const styles: string[] = [];
  const ctx = {
    lineWidth: 0,
    set fillStyle(v: string) { styles.push(v); },
    set strokeStyle(v: string) { styles.push(v); },
    beginPath() {}, stroke() {}, moveTo() {}, lineTo() {},
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, styles };
}

const HI = packNametableWord(0x2ff, 1, true, false, false);
const LO = packNametableWord(0x2ff, 1, false, false, false);

/** A full-size section nametable with the given "col,row" tiles high. */
function nametable(marks: [number, number][], fillLow = false): Uint16Array {
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  if (fillLow) nt.fill(LO);
  for (const [c, r] of marks) nt[r * SECTION_TILES_WIDE + c] = HI;
  return nt;
}

/** A viewport whose visible world rect is exactly (x,y)..(x+w, y+h) at zoom 1. */
const vp = (x: number, y: number, width: number, height: number, zoom = 1) =>
  ({ x, y, width: width * zoom, height: height * zoom, zoom });

describe('drawSectionPriority — the tile geometry', () => {
  it('veils a high tile at its WORLD position (section offset + tile * 8)', () => {
    const { ctx, rects } = recCtx();
    // Tile (10, 4) of a section whose world origin is (2048, 0).
    const drawn = drawSectionPriority(ctx, vp(2048, 0, 320, 224), nametable([[10, 4]]), 2048, 0);
    expect(rects).toEqual([{ x: 2048 + 10 * LENS_TILE_PX, y: 4 * LENS_TILE_PX, w: 8, h: 8 }]);
    expect(drawn.veils).toBe(1);
  });

  it('marks the high word and NOT the low one at the neighbouring tile', () => {
    // The discriminating pair: same art, same palette, one bit apart. A lens
    // that veiled "every non-empty tile" passes the row above and fails here.
    const nt = nametable([[10, 4]], true);
    const { ctx, rects } = recCtx();
    drawSectionPriority(ctx, vp(0, 0, 320, 224), nt, 0, 0);
    expect(rects).toEqual([{ x: 80, y: 32, w: 8, h: 8 }]);
  });

  it('uses the SAME colours as classic\'s lens — one language, not two', () => {
    const { ctx, styles } = recCtx();
    drawSectionPriority(ctx, vp(0, 0, 320, 224), nametable([[1, 1]]), 0, 0);
    expect(styles).toEqual([PRIORITY_FILL, PRIORITY_EDGE]);
  });

  it('draws nothing for a section with no high tiles (anti-vacuous)', () => {
    const { ctx, rects } = recCtx();
    const drawn = drawSectionPriority(ctx, vp(0, 0, 320, 224), nametable([], true), 0, 0);
    expect(rects).toEqual([]);
    expect(drawn).toEqual({ veils: 0, segments: 0 });
  });
});

describe('drawSectionPriority — the viewport window', () => {
  it('SKIPS a section that is entirely off-screen', () => {
    const { ctx, rects } = recCtx();
    // Camera on section 0; the nametable belongs to a section at world x=2048.
    const drawn = drawSectionPriority(ctx, vp(0, 0, 320, 224), nametable([[10, 4]]), 2048, 0);
    expect(rects).toEqual([]);
    expect(drawn.veils).toBe(0);
  });

  it('probes only the visible tiles — a 320x224 view touches ~41x29, not 65,536', () => {
    let probes = 0;
    const { ctx } = recCtx();
    const counting = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    // Count via a Proxy over the typed array's index reads.
    const proxy = new Proxy(counting, {
      get(t, k) {
        if (typeof k === 'string' && /^\d+$/.test(k)) probes++;
        return Reflect.get(t, k);
      },
    }) as unknown as Uint16Array;
    drawSectionPriority(ctx, vp(0, 0, 320, 224), proxy, 0, 0);
    // The window: ceil(320/8) = 40 cols (+1 when the edge is not tile-aligned),
    // ceil(224/8) = 28 rows. Two passes (veil + stroke) probe it, and the
    // stroke pass probes up to 5 tiles per marked tile — but NOTHING is marked
    // here, so it is exactly two sweeps of the window.
    const cols = Math.ceil(320 / 8), rows = Math.ceil(224 / 8);
    expect(probes).toBe(2 * cols * rows);
    expect(probes).toBeLessThan(SECTION_TILES_WIDE * SECTION_TILES_HIGH / 10);
  });

  it('grows the window as the camera zooms OUT (more world px on screen)', () => {
    // At zoom 0.5 a 320px-wide canvas shows 640 world px = 80 tile columns.
    let probes = 0;
    const proxy = new Proxy(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH), {
      get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) probes++; return Reflect.get(t, k); },
    }) as unknown as Uint16Array;
    const { ctx } = recCtx();
    drawSectionPriority(ctx, { x: 0, y: 0, width: 320, height: 224, zoom: 0.5 }, proxy, 0, 0);
    const cols = Math.ceil(640 / 8), rows = Math.ceil(448 / 8);
    expect(probes).toBe(2 * cols * rows);
  });

  it('does not stroke a false seam where a high region runs off the WINDOW edge', () => {
    // Two adjacent high tiles; the camera shows only the first. The shared
    // primitive probes the real neighbour, so no vertical stroke may appear
    // between them. Proven through the segment COUNT: a lone tile in the
    // interior would be 4, and this must be 3.
    const nt = nametable([[40, 4], [41, 4]]);
    const { ctx } = recCtx();
    const drawn = drawSectionPriority(ctx, vp(0, 0, 328, 224), nt, 0, 0);
    expect(drawn.veils).toBe(1);   // only tile 40 is inside the window
    expect(drawn.segments).toBe(3); // top, bottom, left — the right side continues
  });
});

describe('the priority-lens report', () => {
  beforeEach(() => {
    publishPriorityLensReport({ active: false, reason: 'off', sections: 0, veils: 0, segments: 0 });
  });

  it('advances `paints` on every publish, so a stalled draw pass is visible', () => {
    const before = lastPriorityLensReport().paints;
    publishPriorityLensReport({ active: true, reason: null, sections: 9, veils: 12, segments: 30 });
    const r = lastPriorityLensReport();
    expect(r.paints).toBe(before + 1);
    expect(r).toMatchObject({ active: true, reason: null, sections: 9, veils: 12, segments: 30 });
  });

  it('distinguishes the toggle being off from the BG layer having no foreground', () => {
    publishPriorityLensReport({ active: false, reason: 'bg-layer', sections: 0, veils: 0, segments: 0 });
    expect(lastPriorityLensReport().reason).toBe('bg-layer');
    publishPriorityLensReport({ active: false, reason: 'off', sections: 9, veils: 0, segments: 0 });
    expect(lastPriorityLensReport().reason).toBe('off');
  });
});
