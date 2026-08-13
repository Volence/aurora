import { describe, it, expect } from 'vitest';
import { EditHistory } from '../history';
import { BoundEditHistory } from '../bound-edit-history';
import type { S4Level } from '../commands';

function levelWithOneSection(): S4Level {
  return {
    sections: [{
      tileGrid: { nametable: new Uint16Array(4) },
      objects: [], rings: [],
      collisionEdit: null, collisionEditB: null, bgLayoutRef: null,
    }],
  } as unknown as S4Level;
}

describe('BoundEditHistory', () => {
  it('undoes through the bound level without taking an argument', () => {
    const level = levelWithOneSection();
    const raw = new EditHistory();
    const bound = new BoundEditHistory(raw, () => level);

    raw.execute(
      { type: 'set-tiles', sectionIndex: 0, entries: [{ index: 0, oldNt: 0, newNt: 42 }] } as never,
      level,
    );
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(42);
    expect(bound.canUndo).toBe(true);

    bound.undo();
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0);
    expect(bound.canUndo).toBe(false);
    expect(bound.canRedo).toBe(true);

    bound.redo();
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(42);
  });

  it('is inert when the level supplier returns null', () => {
    const raw = new EditHistory();
    const bound = new BoundEditHistory(raw, () => null);
    expect(() => bound.undo()).not.toThrow();
    expect(() => bound.redo()).not.toThrow();
  });

  it('forwards onChange subscriptions to the underlying history', () => {
    const level = levelWithOneSection();
    const raw = new EditHistory();
    const bound = new BoundEditHistory(raw, () => level);
    let fired = 0;
    const off = bound.onChange(() => { fired++; });

    raw.execute(
      { type: 'set-tiles', sectionIndex: 0, entries: [{ index: 0, oldNt: 0, newNt: 7 }] } as never,
      level,
    );
    expect(fired).toBe(1);

    off();
    bound.undo();
    expect(fired).toBe(1);
  });
});
