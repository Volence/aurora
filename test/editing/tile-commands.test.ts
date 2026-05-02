import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import { createSection } from '../../src/core/model/s4-types';

describe('tile painting commands', () => {
  function makeLevel(): S4Level {
    return {
      sections: [createSection(0, 'Test')],
    };
  }

  it('set-tile command sets nametable and collision', () => {
    const history = new EditHistory();
    const level = makeLevel();
    history.execute({
      type: 'set-tiles',
      description: 'Paint tile',
      sectionIndex: 0,
      entries: [{ index: 0, oldNt: 0, newNt: 0x802A, oldColl: 0, newColl: 5 }],
    }, level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x802A);
    expect(level.sections[0]!.tileGrid.collision[0]).toBe(5);
  });

  it('undo restores previous values', () => {
    const history = new EditHistory();
    const level = makeLevel();
    level.sections[0]!.tileGrid.nametable[0] = 0x1234;
    level.sections[0]!.tileGrid.collision[0] = 3;

    history.execute({
      type: 'set-tiles',
      description: 'Paint tile',
      sectionIndex: 0,
      entries: [{ index: 0, oldNt: 0x1234, newNt: 0x802A, oldColl: 3, newColl: 5 }],
    }, level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x802A);

    history.undo(level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x1234);
    expect(level.sections[0]!.tileGrid.collision[0]).toBe(3);
  });

  it('batch set-tiles handles multiple entries', () => {
    const history = new EditHistory();
    const level = makeLevel();
    history.execute({
      type: 'set-tiles',
      description: 'Paint block',
      sectionIndex: 0,
      entries: [
        { index: 0, oldNt: 0, newNt: 1, oldColl: 0, newColl: 1 },
        { index: 1, oldNt: 0, newNt: 2, oldColl: 0, newColl: 2 },
        { index: 256, oldNt: 0, newNt: 3, oldColl: 0, newColl: 3 },
      ],
    }, level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(1);
    expect(level.sections[0]!.tileGrid.nametable[1]).toBe(2);
    expect(level.sections[0]!.tileGrid.nametable[256]).toBe(3);
  });
});
