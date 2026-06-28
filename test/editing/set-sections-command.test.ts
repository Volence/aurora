import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level, SetSectionsCommand } from '../../src/core/editing/commands';
import type { Act, Section } from '../../src/core/model/s4-types';
import { createSection } from '../../src/core/model/s4-types';

function makeLevel(): { level: S4Level; act: Act; original: Section } {
  const original = createSection(0, 'Section 0');
  const act: Act = {
    id: 'act1',
    gridWidth: 1,
    gridHeight: 1,
    sections: [original],
    startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
    bgLayout: null,
    bgTiles: null,
    parallaxRef: null,
  };
  return { level: { sections: act.sections, act }, act, original };
}

describe('set-sections command', () => {
  it('applies a grid reshape, then undoes and redoes it', () => {
    const { level, act, original } = makeLevel();
    const history = new EditHistory();

    const appended = createSection(1, 'Section 1');
    const cmd: SetSectionsCommand = {
      type: 'set-sections',
      description: 'add section (grow row)',
      sectionIndex: -1,
      oldGridWidth: 1,
      oldGridHeight: 1,
      oldSections: [original],
      newGridWidth: 1,
      newGridHeight: 2,
      newSections: [original, appended],
    };

    history.execute(cmd, level);
    expect(act.gridWidth).toBe(1);
    expect(act.gridHeight).toBe(2);
    expect(act.sections.length).toBe(2);
    expect(act.sections[1]).not.toBeNull();
    expect(act.sections[1]!.index).toBe(1);

    history.undo(level);
    expect(act.gridHeight).toBe(1);
    expect(act.sections.length).toBe(1);
    expect(act.sections[0]).toBe(original);

    history.redo(level);
    expect(act.gridHeight).toBe(2);
    expect(act.sections.length).toBe(2);
    expect(act.sections[1]).not.toBeNull();
  });

  it('throws when level.act is missing', () => {
    const history = new EditHistory();
    const cmd: SetSectionsCommand = {
      type: 'set-sections',
      description: 'noop',
      sectionIndex: -1,
      oldGridWidth: 1, oldGridHeight: 1, oldSections: [],
      newGridWidth: 1, newGridHeight: 1, newSections: [],
    };
    expect(() => history.execute(cmd, { sections: [] })).toThrow(/set-sections requires level\.act/);
  });
});
