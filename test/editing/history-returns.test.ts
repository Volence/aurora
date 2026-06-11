import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { AnyCommand, S4Level } from '../../src/core/editing/commands';
import { createSection } from '../../src/core/model/s4-types';

function makeLevel(): S4Level {
  return { sections: [createSection(0, 'Test')] };
}

function makeCommand(): AnyCommand {
  return {
    type: 'set-tiles',
    description: 'test paint',
    sectionIndex: 0,
    entries: [{ index: 0, oldNt: 0, newNt: 0x1234, oldColl: 0, newColl: 1 }],
  };
}

describe('EditHistory undo/redo return values', () => {
  it('undo returns the command it processed', () => {
    const history = new EditHistory();
    const level = makeLevel();
    const cmd = makeCommand();
    history.execute(cmd, level);

    const undone = history.undo(level);
    expect(undone).toBe(cmd);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0);
  });

  it('redo returns the command it processed', () => {
    const history = new EditHistory();
    const level = makeLevel();
    const cmd = makeCommand();
    history.execute(cmd, level);
    history.undo(level);

    const redone = history.redo(level);
    expect(redone).toBe(cmd);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x1234);
  });

  it('returns undefined on empty stacks', () => {
    const history = new EditHistory();
    const level = makeLevel();
    expect(history.undo(level)).toBeUndefined();
    expect(history.redo(level)).toBeUndefined();
  });
});
