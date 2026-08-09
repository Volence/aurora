// Regression test for the classic viewport crash: drawObjects must never call
// drawImage on a detached (closed) ImageBitmap. An act switch publishes the new
// sprite map then closes the previous epoch's bitmaps (classicObjectArtStore
// evictStale); the no-dep render effect can still flush a draw that holds the old
// map, and drawImage on a closed bitmap throws InvalidStateError — which, with no
// error boundary, unmounts the whole viewport (blank window). Closed ImageBitmaps
// report width/height === 0, so drawObjects treats a width-0 sprite as "no sprite"
// (hex-box fallback) rather than drawing it.

import { describe, it, expect } from 'vitest';
import { drawObjects } from '../classic-overlays';
import type { ObjectSprite } from '../../../state/classicObjectArtStore';
import type { LevelDoc } from '../../../../core/level-classic/model';

/** A recording 2D-context stand-in: captures drawImage/fillRect call counts. */
function mockCtx() {
  const calls = { drawImage: 0, fillRect: 0, strokeRect: 0, fillText: 0, arc: 0 };
  const ctx = {
    lineWidth: 0, font: '', textAlign: '' as CanvasTextAlign, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {}, stroke() {},
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
    const sprites = new Map<number, ObjectSprite>([[0x10, sprite(0)]]); // closed bitmap
    expect(() => drawObjects(ctx, docWithObject(0x10), 1, sprites)).not.toThrow();
    expect(calls.drawImage).toBe(0);   // never blit a detached source
    expect(calls.fillRect).toBeGreaterThan(0); // fell back to the hex box
  });

  it('draws the sprite when its bitmap is live (width > 0)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<number, ObjectSprite>([[0x10, sprite(16)]]);
    drawObjects(ctx, docWithObject(0x10), 1, sprites);
    expect(calls.drawImage).toBe(1);
  });

  it('falls back to the ring markers (no drawImage) for a detached ring sprite ($25)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<number, ObjectSprite>([[0x25, sprite(0)]]);
    expect(() => drawObjects(ctx, docWithObject(0x25), 1, sprites)).not.toThrow();
    expect(calls.drawImage).toBe(0);
    expect(calls.arc).toBeGreaterThan(0); // ring circle markers drawn instead
  });
});
