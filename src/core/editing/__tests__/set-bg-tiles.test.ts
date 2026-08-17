import { describe, it, expect } from 'vitest';
import { EditHistory } from '../history';
import type { S4Level, SetBgTilesCommand } from '../commands';

/**
 * R10. BG-layer painting wrote the resolved nametable directly — markDirty and
 * a repaint bump, no command. The data saved (to `<zone>_<act>_bg.bin`), so the
 * mutation was durable; but the next Ctrl+Z popped whatever act-scoped command
 * happened to precede the strokes and silently reverted THAT instead. A `set-bg`
 * command existed and was a whole-plane swap nothing on this path ever built.
 *
 * These also start on UNDO-A11 — the aeon command engine's hand-rolled inverses
 * had no unit test at all.
 */
function level(): S4Level {
  return {
    sections: [],
    act: { bgLayout: new Uint16Array([1, 2, 3, 4]), bgTiles: [] },
    bgLibrary: [{ id: 'clouds', name: 'Clouds', layout: new Uint16Array([9, 9, 9, 9]), tiles: [] }],
  } as unknown as S4Level;
}

const cmd = (over: Partial<SetBgTilesCommand> = {}): SetBgTilesCommand => ({
  type: 'set-bg-tiles',
  description: 'Paint background',
  sectionIndex: 0,
  bgRef: null,
  entries: [{ index: 1, oldNt: 2, newNt: 77 }],
  ...over,
});

describe('set-bg-tiles', () => {
  it('applies, undoes and redoes against the act default plane', () => {
    const l = level();
    const h = new EditHistory();
    h.execute(cmd(), l);
    expect(Array.from(l.act!.bgLayout!)).toEqual([1, 77, 3, 4]);
    h.undo(l);
    expect(Array.from(l.act!.bgLayout!)).toEqual([1, 2, 3, 4]);
    h.redo(l);
    expect(Array.from(l.act!.bgLayout!)).toEqual([1, 77, 3, 4]);
  });

  it('edits the library entry the stroke actually painted', () => {
    const l = level();
    const h = new EditHistory();
    h.execute(cmd({ bgRef: 'clouds', entries: [{ index: 0, oldNt: 9, newNt: 5 }] }), l);
    expect(Array.from(l.bgLibrary![0].layout)).toEqual([5, 9, 9, 9]);
    expect(Array.from(l.act!.bgLayout!)).toEqual([1, 2, 3, 4]); // untouched
    h.undo(l);
    expect(Array.from(l.bgLibrary![0].layout)).toEqual([9, 9, 9, 9]);
  });

  /**
   * The ref travels ON the command, not read from the active section at undo
   * time — an undo can land long after the artist moved to a section showing a
   * different background, and reaching the wrong array would revert tiles
   * nobody painted while leaving the painted ones in place.
   */
  it('undoes the library entry even after the act default would resolve instead', () => {
    const l = level();
    const h = new EditHistory();
    h.execute(cmd({ bgRef: 'clouds', entries: [{ index: 2, oldNt: 9, newNt: 4 }] }), l);
    l.bgLibrary!.push({ id: 'other', name: 'Other', layout: new Uint16Array(4), tiles: [] } as never);
    h.undo(l);
    expect(Array.from(l.bgLibrary![0].layout)).toEqual([9, 9, 9, 9]);
  });

  it('is inert when the named background is gone', () => {
    const l = level();
    const h = new EditHistory();
    expect(() => h.execute(cmd({ bgRef: 'deleted' }), l)).not.toThrow();
    expect(Array.from(l.act!.bgLayout!)).toEqual([1, 2, 3, 4]);
  });

  it('carries a whole gesture as one undo step', () => {
    const l = level();
    const h = new EditHistory();
    h.execute(cmd({
      entries: [
        { index: 0, oldNt: 1, newNt: 8 },
        { index: 1, oldNt: 2, newNt: 8 },
        { index: 2, oldNt: 3, newNt: 8 },
      ],
    }), l);
    expect(Array.from(l.act!.bgLayout!)).toEqual([8, 8, 8, 4]);
    h.undo(l);
    expect(Array.from(l.act!.bgLayout!)).toEqual([1, 2, 3, 4]);
    expect(h.canUndo).toBe(false); // one step, not three
  });
});
