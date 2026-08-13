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

  // --- onCommand: the whole aeon repaint path -----------------------------
  //
  // history-factories wires notifyCommandApplied in here, and that is the ONLY
  // route by which an aeon undo/redo reaches bumpStoreVersions + the renderer
  // -cache invalidation listener (undo()/redo() are argument-free, so they can't
  // hand the moved command back to their caller). If it stops firing, an undo
  // mutates the data and leaves the map canvas, chunk thumbnails and tileset
  // thumbs stale — which reads to a user as "undo lost my work".

  const setTiles = (newNt: number) => ({
    type: 'set-tiles', description: 't', sectionIndex: 0,
    entries: [{ index: 0, oldNt: 0, newNt }],
  }) as never;

  it('notifies onCommand for execute, undo and redo, with the moved command', () => {
    const level = levelWithOneSection();
    const seen: unknown[] = [];
    const bound = new BoundEditHistory(new EditHistory(), () => level, (c) => { seen.push(c); });
    const cmd = setTiles(42);

    bound.execute(cmd);
    expect(seen).toEqual([cmd]);

    bound.undo();
    expect(seen).toEqual([cmd, cmd]);   // the command that was REVERTED

    bound.redo();
    expect(seen).toEqual([cmd, cmd, cmd]);
  });

  it('reports the command each step actually moved, not the newest one', () => {
    const level = levelWithOneSection();
    const seen: Array<{ entries: Array<{ newNt: number }> }> = [];
    const bound = new BoundEditHistory(new EditHistory(), () => level, (c) => { seen.push(c as never); });

    bound.execute(setTiles(1));
    bound.execute(setTiles(2));
    seen.length = 0;

    bound.undo();                                   // reverts the SECOND command
    expect(seen[0].entries[0].newNt).toBe(2);
    bound.undo();                                   // then the first
    expect(seen[1].entries[0].newNt).toBe(1);
    bound.redo();                                   // redo replays the first again
    expect(seen[2].entries[0].newNt).toBe(1);
  });

  it('stays silent when undo/redo move nothing', () => {
    const level = levelWithOneSection();
    let calls = 0;
    const bound = new BoundEditHistory(new EditHistory(), () => level, () => { calls++; });

    bound.undo();   // empty undo stack
    bound.redo();   // empty redo stack
    expect(calls).toBe(0);

    bound.execute(setTiles(5));
    expect(calls).toBe(1);
    bound.redo();   // execute cleared the redo stack — nothing to replay
    expect(calls).toBe(1);
  });

  it('stays silent when the level supplier returns null', () => {
    let calls = 0;
    const bound = new BoundEditHistory(new EditHistory(), () => null, () => { calls++; });
    bound.execute(setTiles(1));
    bound.undo();
    bound.redo();
    expect(calls).toBe(0);
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
