import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import { SpriteHistory, type SpriteSnapshot } from '../../src/core/editing/sprite-history';
import type { S4Level } from '../../src/core/editing/commands';

function miniLevel(): S4Level {
  return { palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 0 }] }] } } as unknown as S4Level;
}
function paletteCmd(r: number) {
  return {
    type: 'set-palette-line' as const,
    line: 0,
    oldColors: [{ r: 0, g: 0, b: 0, a: 0 }],
    newColors: [{ r, g: 0, b: 0, a: 255 }],
  };
}
function snap(): SpriteSnapshot {
  return { frames: [], currentIndex: 0, selection: null, paletteMode: 'zone', zoneLine: 0, standalonePalette: [] };
}

describe('EditHistory edit-sequence stamps', () => {
  it('topUndoSeq is -1 when empty and increases with each execute', () => {
    const h = new EditHistory();
    expect(h.topUndoSeq()).toBe(-1);
    h.execute(paletteCmd(1), miniLevel());
    const a = h.topUndoSeq();
    expect(a).toBeGreaterThan(0);
    h.execute(paletteCmd(2), miniLevel());
    expect(h.topUndoSeq()).toBeGreaterThan(a);
  });

  it('undo moves the entry seq onto the redo stack', () => {
    const h = new EditHistory();
    h.execute(paletteCmd(1), miniLevel());
    const a = h.topUndoSeq();
    h.execute(paletteCmd(2), miniLevel());
    const b = h.topUndoSeq();
    h.undo(miniLevel());
    expect(h.topUndoSeq()).toBe(a);  // back to the first edit
    expect(h.topRedoSeq()).toBe(b);  // the undone edit is now redo-top
  });

  it('clearRedo empties the redo stack', () => {
    const h = new EditHistory();
    h.execute(paletteCmd(1), miniLevel());
    h.undo(miniLevel());
    expect(h.canRedo).toBe(true);
    h.clearRedo();
    expect(h.canRedo).toBe(false);
    expect(h.topRedoSeq()).toBe(-1);
  });
});

describe('SpriteHistory edit-sequence stamps', () => {
  it('topUndoSeq tracks records and undo moves it to redo', () => {
    const h = new SpriteHistory();
    expect(h.topUndoSeq()).toBe(-1);
    h.record(snap());
    const a = h.topUndoSeq();
    h.record(snap());
    const b = h.topUndoSeq();
    expect(b).toBeGreaterThan(a);
    h.undo(snap());
    expect(h.topUndoSeq()).toBe(a);
    expect(h.topRedoSeq()).toBe(b);
  });
});

describe('cross-history recency (global monotonic clock)', () => {
  it('a later edit on either history has a strictly larger seq', () => {
    const level = new EditHistory();
    const sprite = new SpriteHistory();
    level.execute(paletteCmd(1), miniLevel());
    const levelSeq = level.topUndoSeq();
    sprite.record(snap());
    const spriteSeq = sprite.topUndoSeq();
    expect(spriteSeq).toBeGreaterThan(levelSeq); // sprite edit came last → undo it first
  });
});
