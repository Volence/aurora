// src/core/editing/__tests__/canvas-history.test.ts
import { describe, it, expect } from 'vitest';
import { CanvasDocHistory, CANVAS_MAX_DEPTH, type CanvasSnapshot } from '../canvas-history';
import { createBuffer } from '../../art/pixel-ops';

function snapshot(fill: number): CanvasSnapshot {
  const pixels = createBuffer(4, 4);
  pixels.data.fill(fill);
  return { pixels, palette: new Array(64).fill(fill), selection: null, profileId: 'genesis-unrestricted' };
}

describe('CanvasDocHistory', () => {
  it('restores the pixels a record captured', () => {
    let live = snapshot(1);
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live = snapshot(2);
    h.undo();
    expect(live.pixels.data[0]).toBe(1);
    h.redo();
    expect(live.pixels.data[0]).toBe(2);
  });

  it('deep-clones, so a later mutation of the live buffer cannot rewrite history', () => {
    // The bug this prevents: recording a REFERENCE, then painting into it, makes
    // undo restore the post-edit pixels — an undo that does nothing at all.
    let live = snapshot(1);
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live.pixels.data[0] = 9;
    live.palette[0] = 9;
    live = snapshot(2);
    h.undo();
    expect(live.pixels.data[0]).toBe(1);
    expect(live.palette[0]).toBe(1);
  });

  it('restores the selection alongside the pixels', () => {
    let live: CanvasSnapshot = { ...snapshot(1), selection: { x: 1, y: 1, w: 2, h: 2 } };
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live = snapshot(2);
    h.undo();
    expect(live.selection).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });

  it('restores the profile alongside the pixels', () => {
    // Guards Task 7's setProfile: a profile switch must be undoable, not just
    // a dirty-flag flip, or Ctrl+Z after one silently reverts the previous
    // paint stroke while leaving the (wrong) new profile in place.
    let live: CanvasSnapshot = { ...snapshot(1), profileId: 'genesis-sprite' };
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live = { ...snapshot(2), profileId: 'none' };
    h.undo();
    expect(live.profileId).toBe('genesis-sprite');
  });

  it('caps the undo stack at CANVAS_MAX_DEPTH, dropping the oldest entry', () => {
    let live = snapshot(0);
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    // Record one more entry than the cap allows. Each record captures the
    // fill value BEFORE the next edit, so after this loop the oldest surviving
    // undo should restore fill 1 (fill 0's record having been dropped).
    for (let i = 0; i <= CANVAS_MAX_DEPTH; i++) {
      h.record(live);
      live = snapshot(i + 1);
    }
    for (let i = 0; i < CANVAS_MAX_DEPTH; i++) h.undo();
    // One more undo should be a no-op — the stack is exhausted, proving the
    // cap held at CANVAS_MAX_DEPTH rather than growing without bound.
    expect(live.pixels.data[0]).toBe(1);
    h.undo();
    expect(live.pixels.data[0]).toBe(1);
  });
});
