import { describe, it, expect } from 'vitest';
import { SpriteDocHistory, type SpriteSnapshot } from '../../src/core/editing/sprite-history';
import { createBuffer } from '../../src/core/art/pixel-ops';

function snap(fill: number): SpriteSnapshot {
  const b = createBuffer(4, 4); b.data.fill(fill);
  return { frames: [b], currentIndex: 0, selection: null, paletteMode: 'zone', zoneLine: 1, standalonePalette: [] };
}

/** A history bound to one mutable cell, standing in for a sprite document in the
 *  store: `live` is what the store holds, undo/redo write back into it. */
function bound(initial: SpriteSnapshot) {
  const cell = { live: initial };
  const h = new SpriteDocHistory(() => cell.live, (s) => { cell.live = s; });
  return { h, cell };
}

describe('SpriteDocHistory', () => {
  it('starts empty', () => {
    const { h } = bound(snap(0));
    expect(h.canUndo).toBe(false); expect(h.canRedo).toBe(false);
  });
  it('records a prior state and undo restores it', () => {
    const { h, cell } = bound(snap(0));
    h.record(snap(0));
    expect(h.canUndo).toBe(true);
    cell.live = snap(1);         // the edit the store applied
    h.undo();
    expect(cell.live.frames[0].data[0]).toBe(0);
    expect(h.canRedo).toBe(true);
  });
  it('redo moves forward to the stashed current', () => {
    const { h, cell } = bound(snap(0));
    h.record(snap(0));
    cell.live = snap(1);
    h.undo();                    // current(1) stashed to redo, live back to 0
    h.redo();
    expect(cell.live.frames[0].data[0]).toBe(1);
  });
  it('a new record after undo truncates the redo stack', () => {
    const { h, cell } = bound(snap(0));
    h.record(snap(0));
    cell.live = snap(1);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.record(snap(5));
    expect(h.canRedo).toBe(false);
  });
  it('record clones input (later mutation of the input does not change history)', () => {
    const { h, cell } = bound(snap(0));
    const s = snap(0);
    h.record(s);
    s.frames[0].data[0] = 99;             // mutate the original after recording
    cell.live = snap(1);
    h.undo();
    expect(cell.live.frames[0].data[0]).toBe(0); // history kept its own clone
  });
  it('undo writes a clone (mutating what the store received does not corrupt history)', () => {
    const { h, cell } = bound(snap(0));
    h.record(snap(7));
    cell.live = snap(1);
    h.undo();
    cell.live.frames[0].data[0] = 42;     // the store mutating its own copy
    h.redo();
    expect(cell.live.frames[0].data[0]).toBe(1);
  });
  it('caps undo depth', () => {
    const { h, cell } = bound(snap(0));
    for (let i = 0; i < 60; i++) h.record(snap(0));
    let undos = 0;
    while (h.canUndo) { h.undo(); undos++; }
    expect(undos).toBe(50);
    expect(cell.live).toBeDefined();
  });
  it('round-trips palette state (mode/line/standalone) through undo', () => {
    const a: SpriteSnapshot = { frames: [createBuffer(4, 4)], currentIndex: 0, selection: null,
      paletteMode: 'zone', zoneLine: 2, standalonePalette: [] };
    const b: SpriteSnapshot = { frames: [createBuffer(4, 4)], currentIndex: 0, selection: null,
      paletteMode: 'standalone', zoneLine: 2, standalonePalette: [{ r: 9, g: 0, b: 0, a: 255 }] };
    const { h, cell } = bound(a);
    h.record(a);
    cell.live = b;
    h.undo();
    expect(cell.live.paletteMode).toBe('zone');
    expect(cell.live.zoneLine).toBe(2);
    cell.live.standalonePalette.push({ r: 1, g: 1, b: 1, a: 255 });
    h.redo();
    expect(cell.live.standalonePalette).toEqual([{ r: 9, g: 0, b: 0, a: 255 }]);
  });
});
