import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';
import { documentHistoryHub } from '../history-hub';
import { activeHistory, executeCommand, undo } from '../editorStore';
import type { S4Level } from '../../../core/editing/commands';

function levelWithPalette(): S4Level {
  return {
    sections: [],
    tileset: { tiles: [] },
    palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
  } as never;
}
const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

describe('per-document aeon undo (hub-keyed by act tab id)', () => {
  beforeEach(() => { documentHistoryHub.clearAll(); useProjectStore.getState().reset(); });

  it('activeHistory keys on the current act', () => {
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    const h1 = activeHistory();
    expect(documentHistoryHub.has('level:ojz:act1')).toBe(true);
    useProjectStore.getState().setCurrentAct('ojz', 'act2');
    expect(activeHistory()).not.toBe(h1);
  });

  it('edits land in the current act history; switching acts switches the undo target', () => {
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    const level = levelWithPalette();
    executeCommand(setPal(7), level);
    expect(activeHistory().canUndo).toBe(true);
    useProjectStore.getState().setCurrentAct('ojz', 'act2');
    expect(activeHistory().canUndo).toBe(false);   // act2 has its own empty history
    undo(level);                                    // no-op on empty history, no throw
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    expect(activeHistory().canUndo).toBe(true);
    undo(level);
    expect(activeHistory().canUndo).toBe(false);
  });
});
