// Regression test for the classic viewport crash: drawObjects must never call
// drawImage on a detached (closed) ImageBitmap. An act switch publishes the new
// sprite map then closes the previous epoch's bitmaps (classicObjectArtStore
// evictStale); the no-dep render effect can still flush a draw that holds the old
// map, and drawImage on a closed bitmap throws InvalidStateError — which, with no
// error boundary, unmounts the whole viewport (blank window). Closed ImageBitmaps
// report width/height === 0, so drawObjects treats a width-0 sprite as "no sprite"
// (hex-box fallback) rather than drawing it.

import { describe, it, expect } from 'vitest';
import { drawObjects, drawCollision } from '../classic-overlays';
import type { ObjectSprite } from '../../../state/classicObjectArtStore';
import type { LevelDoc } from '../../../../core/level-classic/model';

/** A recording 2D-context stand-in: captures drawImage/fillRect call counts. */
function mockCtx() {
  const calls = { drawImage: 0, fillRect: 0, strokeRect: 0, fillText: 0, arc: 0 };
  const ctx = {
    lineWidth: 0, font: '', textAlign: '' as CanvasTextAlign, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {}, stroke() {}, setLineDash() {},
    drawImage() { calls.drawImage++; },
    fillRect() { calls.fillRect++; },
    strokeRect() { calls.strokeRect++; },
    fillText() { calls.fillText++; },
    arc() { calls.arc++; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Minimal doc with a single object placement — drawObjects only reads .objects. */
function docWithObject(id: number): LevelDoc {
  return {
    objects: [{ x: 100, y: 100, id, subtype: 0, xflip: false, yflip: false, respawn: false }],
  } as unknown as LevelDoc;
}

function sprite(width: number): ObjectSprite {
  // The bitmap only needs a `width` for the guard; drawImage is mocked.
  return { bitmap: { width, height: width } as unknown as ImageBitmap, width: 16, height: 16, originX: 8, originY: 8 };
}

describe('drawObjects detached-bitmap guard', () => {
  it('does not throw and skips drawImage when the sprite bitmap is detached (width 0)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<string, ObjectSprite>([['16', sprite(0)]]); // closed bitmap ($10 = 16)
    expect(() => drawObjects(ctx, docWithObject(0x10), 1, sprites, '')).not.toThrow();
    expect(calls.drawImage).toBe(0);   // never blit a detached source
    expect(calls.fillRect).toBeGreaterThan(0); // fell back to the hex box
  });

  it('draws the sprite when its bitmap is live (width > 0)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<string, ObjectSprite>([['16', sprite(16)]]);
    drawObjects(ctx, docWithObject(0x10), 1, sprites, '');
    expect(calls.drawImage).toBe(1);
  });

  it('falls back to the ring markers (no drawImage) for a detached ring sprite ($25)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<string, ObjectSprite>([['37', sprite(0)]]); // $25 = 37
    expect(() => drawObjects(ctx, docWithObject(0x25), 1, sprites, '')).not.toThrow();
    expect(calls.drawImage).toBe(0);
    expect(calls.arc).toBeGreaterThan(0); // ring circle markers drawn instead
  });

  it('draws a ghost marker (labelled box, no hex) for an invisible id with no sprite', () => {
    const { ctx, calls } = mockCtx();
    // $49 Waterfall Sound Effect — an invisible/trigger id with no linked art.
    drawObjects(ctx, docWithObject(0x49), 1, new Map(), '');
    expect(calls.drawImage).toBe(0); // no sprite
    expect(calls.fillRect).toBeGreaterThan(0); // muted ghost box drawn
    expect(calls.fillText).toBeGreaterThan(0); // labelled with the object name
  });

  it('resolves the composed sprite by (id, subtype) key for a rule object', () => {
    const { ctx, calls } = mockCtx();
    // Monitor $26 subtype 6 → composed key "38:6". A sprite published under the bare
    // id ("38") must NOT be picked up (subtype rule keys by subtype).
    const wrongKey = new Map<string, ObjectSprite>([['38', sprite(16)]]);
    drawObjects(ctx, { objects: [{ x: 50, y: 50, id: 0x26, subtype: 6, xflip: false, yflip: false, respawn: false }] } as unknown as LevelDoc, 1, wrongKey, 'ghz');
    expect(calls.drawImage).toBe(0); // bare-id sprite ignored — falls back to hex box
    const rightKey = new Map<string, ObjectSprite>([['38:6', sprite(16)]]);
    const r2 = mockCtx();
    drawObjects(r2.ctx, { objects: [{ x: 50, y: 50, id: 0x26, subtype: 6, xflip: false, yflip: false, respawn: false }] } as unknown as LevelDoc, 1, rightKey, 'ghz');
    expect(r2.calls.drawImage).toBe(1); // composed sprite drawn
  });
});

/** A recording context for the angle needle: captures moveTo/lineTo endpoints. */
function needleCtx() {
  const pts: { x: number; y: number }[] = [];
  const ctx = {
    lineWidth: 0, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, setLineDash() {},
    fillRect() {}, strokeRect() {},
    moveTo(x: number, y: number) { pts.push({ x, y }); },
    lineTo(x: number, y: number) { pts.push({ x, y }); },
    getTransform() { return { a: 1 }; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pts };
}

/**
 * One chunk, one solid cell at index 0, pointing at block 1 → shape 1.
 *
 * Shape 1's height row is all-zero (no column has a solid run) so neither the
 * height fill nor the "crisp surface line" pass draws anything — both would
 * otherwise add their own moveTo/lineTo calls to the SAME recording ctx and
 * swamp the needle's 2 points. The needle itself is unconditional on column
 * contents (it only reads shapeIndex/angle), so it still draws.
 */
function collisionDoc(xf: boolean, yf: boolean): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf, yf, solidity: 3 };
  const heights = [new Int8Array(16), new Int8Array(16)];
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: { colind: new Uint8Array([0, 1]), shapes: { heights, angles: new Uint8Array([0, 0xe0]) } },
  } as unknown as LevelDoc;
}

describe('drawCollision angle needle', () => {
  it('draws the needle along angleNeedle, not its vertical mirror', () => {
    const { ctx, pts } = needleCtx();
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    expect(pts.length).toBe(2);
    const dy = pts[1].y - pts[0].y;
    expect(dy).toBeLessThan(0); // $E0 ascends
  });

  it('honours the chunk cell flips the heights already honour', () => {
    const { ctx, pts } = needleCtx();
    drawCollision(ctx, collisionDoc(true, false), 0, 0, 1, true);
    const dy = pts[1].y - pts[0].y;
    expect(dy).toBeGreaterThan(0); // X-flipped $E0 descends
  });
});
