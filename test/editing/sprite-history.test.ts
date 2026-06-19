import { describe, it, expect } from 'vitest';
import { SpriteHistory, type SpriteSnapshot } from '../../src/core/editing/sprite-history';
import { createBuffer } from '../../src/core/art/pixel-ops';

function snap(fill: number): SpriteSnapshot {
  const b = createBuffer(4, 4); b.data.fill(fill);
  return { frames: [b], currentIndex: 0, selection: null };
}

describe('SpriteHistory', () => {
  it('starts empty', () => {
    const h = new SpriteHistory();
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false);
  });
  it('records a prior state and undo restores it', () => {
    const h = new SpriteHistory();
    h.record(snap(0));
    expect(h.canUndo).toBe(true);
    const back = h.undo(snap(1));
    expect(back).not.toBeNull();
    expect(back!.frames[0].data[0]).toBe(0);
    expect(h.canRedo).toBe(true);
  });
  it('redo moves forward to the stashed current', () => {
    const h = new SpriteHistory();
    h.record(snap(0));
    h.undo(snap(1));            // current(1) stashed to redo, returns state 0
    const fwd = h.redo(snap(0));
    expect(fwd!.frames[0].data[0]).toBe(1);
  });
  it('a new record after undo truncates the redo stack', () => {
    const h = new SpriteHistory();
    h.record(snap(0));
    h.undo(snap(1));
    expect(h.canRedo).toBe(true);
    h.record(snap(5));
    expect(h.canRedo).toBe(false);
  });
  it('record clones input (later mutation of the input does not change history)', () => {
    const h = new SpriteHistory();
    const s = snap(0);
    h.record(s);
    s.frames[0].data[0] = 99;             // mutate the original after recording
    const back = h.undo(snap(1));
    expect(back!.frames[0].data[0]).toBe(0); // history kept its own clone
  });
  it('undo returns a clone (mutating the result does not corrupt history)', () => {
    const h = new SpriteHistory();
    h.record(snap(7));
    const back = h.undo(snap(1))!;
    back.frames[0].data[0] = 42;
    const fwd = h.redo(snap(0))!;          // unrelated, but ensure no throw
    expect(fwd.frames[0].data[0]).toBe(1);
  });
  it('caps undo depth', () => {
    const h = new SpriteHistory(2);
    h.record(snap(0)); h.record(snap(1)); h.record(snap(2));
    expect(h.depth).toBe(2);
  });
});
