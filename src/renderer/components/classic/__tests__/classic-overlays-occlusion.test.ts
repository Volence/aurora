// drawObjects' occlusion pass — the canvas half of the occlusion rule
// (core/level-classic/occlusion.ts holds the per-pixel decision; these tests
// pin the PASS STRUCTURE: when the hi-pri overlay intersects a drawn sprite,
// the map pixels are re-drawn above it, the ghost is blitted, and a frame
// carrying hi-pri sprite pieces is re-raised on top — and when nothing
// intersects, none of that runs).
//
// Node env: `document` is stubbed with fake canvases whose 2D contexts record
// their calls; drawImage arguments are tagged so the assertions can tell the
// sprite blit, the occluder blit (scratch A), the ghost blit (scratch B) and
// the priBitmap re-raise apart by identity, not by counting alone.

import { describe, it, expect, beforeAll } from 'vitest';
import { drawObjects, type SpriteOcclusion } from '../classic-overlays';
import type { ObjectSprite } from '../../../state/classicObjectArtStore';
import type { LevelDoc } from '../../../../core/level-classic/model';
import { monoMeasureText } from '../../../../test/mono-measure';

interface RecCtx {
  drawImageArgs: unknown[][];
  fillRects: number;
  ops: string[];
}

function makeRecordingCtx(): CanvasRenderingContext2D & { __rec: RecCtx } {
  const rec: RecCtx = { drawImageArgs: [], fillRects: 0, ops: [] };
  const ctx = {
    __rec: rec,
    lineWidth: 0, font: '', textAlign: 'center', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {}, stroke() {}, setLineDash() {},
    drawImage(...args: unknown[]) { rec.drawImageArgs.push(args); rec.ops.push('drawImage'); },
    fillRect() { rec.fillRects++; rec.ops.push('fillRect'); },
    strokeRect() {}, fillText() {}, arc() {},
    // Labels are measured before they are drawn (ROADMAP 5.1 item 17).
    measureText: monoMeasureText,
  };
  return ctx as unknown as CanvasRenderingContext2D & { __rec: RecCtx };
}

interface FakeCanvas {
  width: number;
  height: number;
  __tag: string;
  __ctx: ReturnType<typeof makeRecordingCtx>;
  getContext: (kind: string, opts?: unknown) => unknown;
}

const created: FakeCanvas[] = [];
function makeFakeCanvas(tag: string): FakeCanvas {
  const ctx = makeRecordingCtx();
  const c: FakeCanvas = {
    width: 0, height: 0, __tag: tag, __ctx: ctx,
    getContext: () => ctx,
  };
  created.push(c);
  return c;
}

beforeAll(() => {
  // Only DEFINE a missing global (node env) — never override a real DOM.
  const g = globalThis as { document?: unknown };
  if (typeof g.document === 'undefined') {
    g.document = { createElement: () => makeFakeCanvas('scratch') };
  }
});

function sprite(withPri: boolean): ObjectSprite {
  return {
    bitmap: { width: 32, height: 32, __tag: 'sprite' } as unknown as ImageBitmap,
    priBitmap: withPri ? ({ width: 32, height: 32, __tag: 'pri' } as unknown as ImageBitmap) : null,
    width: 32, height: 32, originX: 16, originY: 16,
  };
}

function doc(): LevelDoc {
  return {
    objects: [{ x: 100, y: 100, id: 0x10, subtype: 0, xflip: false, yflip: false, respawn: false }],
  } as unknown as LevelDoc;
}

const VISIBLE = { left: 0, top: 0, width: 1024, height: 1024 };

function occl(hiPri: FakeCanvas | null, visible = VISIBLE): SpriteOcclusion & { costs: number[] } {
  const costs: number[] = [];
  return {
    hiPriCanvasAt: () => hiPri as unknown as HTMLCanvasElement | null,
    visible,
    lensVeil: false,
    onCost: (ms) => costs.push(ms),
    costs,
  };
}

function tagsOf(ctx: ReturnType<typeof makeRecordingCtx>): string[] {
  return ctx.__rec.drawImageArgs.map((a) => (a[0] as { __tag?: string }).__tag ?? 'untagged');
}

describe('drawObjects sprite occlusion pass', () => {
  it('no hi-pri overlay anywhere → only the sprite blit, cost still reported', () => {
    const ctx = makeRecordingCtx();
    const o = occl(null);
    drawObjects(ctx, doc(), 1, new Map([['16', sprite(false)]]), '', null, null, undefined, o);
    expect(tagsOf(ctx)).toEqual(['sprite']);
    expect(o.costs.length).toBe(1); // the meter always reports, even a ~0
  });

  it('hi-pri overlay intersecting → occluder + ghost blits above the sprite', () => {
    const ctx = makeRecordingCtx();
    const hi = makeFakeCanvas('hipri');
    const o = occl(hi);
    drawObjects(ctx, doc(), 1, new Map([['16', sprite(false)]]), '', null, null, undefined, o);
    // Order matters: sprite first, then the occluding map pixels, then the ghost.
    expect(tagsOf(ctx)).toEqual(['sprite', 'scratch', 'scratch']);
    // The ghost scratch composed: sprite drawn into it, then destination-in
    // against the occluder, then the violet tint fill.
    const scratches = created.filter((c) => c.__tag === 'scratch');
    const ghostCtx = scratches.find((c) => tagsOf(c.__ctx).includes('sprite'));
    expect(ghostCtx).toBeDefined();
    expect(ghostCtx!.__ctx.__rec.fillRects).toBeGreaterThan(0); // the tint
  });

  it('a frame with hi-pri pieces is re-raised ABOVE the ghost when occluded', () => {
    const ctx = makeRecordingCtx();
    const hi = makeFakeCanvas('hipri');
    drawObjects(ctx, doc(), 1, new Map([['16', sprite(true)]]), '', null, null, undefined, occl(hi));
    // sprite → occluder → ghost → priBitmap re-raise, in that order.
    expect(tagsOf(ctx)).toEqual(['sprite', 'scratch', 'scratch', 'pri']);
  });

  it('no re-raise when nothing was occluded, even with a priBitmap present', () => {
    const ctx = makeRecordingCtx();
    drawObjects(ctx, doc(), 1, new Map([['16', sprite(true)]]), '', null, null, undefined, occl(null));
    expect(tagsOf(ctx)).toEqual(['sprite']);
  });

  it('an object outside the visible rect is skipped by the pass', () => {
    const ctx = makeRecordingCtx();
    const hi = makeFakeCanvas('hipri');
    const o = occl(hi, { left: 5000, top: 5000, width: 100, height: 100 });
    drawObjects(ctx, doc(), 1, new Map([['16', sprite(false)]]), '', null, null, undefined, o);
    expect(tagsOf(ctx)).toEqual(['sprite']);
  });

  it('patchAnimated is invoked per intersecting chunk, into the occluder scratch', () => {
    const ctx = makeRecordingCtx();
    const hi = makeFakeCanvas('hipri');
    const o = occl(hi);
    const calls: { col: number; row: number; dx: number; dy: number }[] = [];
    (o as SpriteOcclusion).patchAnimated = (actx, col, row, dx, dy) => {
      calls.push({ col, row, dx, dy });
      // Must be handed the occluder scratch's context (scratch A), not the main ctx.
      expect(actx).not.toBe(ctx);
    };
    drawObjects(ctx, doc(), 1, new Map([['16', sprite(false)]]), '', null, null, undefined, o);
    // The 32x32 frame at (100,100) sits inside chunk (0,0) only.
    expect(calls).toEqual([{ col: 0, row: 0, dx: -84, dy: -84 }]);
  });

  it('fallback hex-box objects (no sprite) are editor chrome — never occluded', () => {
    const ctx = makeRecordingCtx();
    const hi = makeFakeCanvas('hipri');
    drawObjects(ctx, doc(), 1, new Map(), '', null, null, undefined, occl(hi));
    expect(ctx.__rec.drawImageArgs.length).toBe(0); // hex box is fills/strokes only
    expect(ctx.__rec.fillRects).toBeGreaterThan(0);
  });
});
