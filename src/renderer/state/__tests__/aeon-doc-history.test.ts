// Aeon's per-document undo: each act tab owns a command history on the hub, and
// the FOCUSED tab is the one executeCommand records on and undo drives.

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { documentHistoryHub } from '../history-hub';
import { focusedHistory, executeCommand } from '../editorStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';

/** A one-zone/two-act project whose zone palette the commands below edit. */
function fakeProject(): never {
  const act = (id: string) => ({ id, name: id, sections: [] });
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [act('act1'), act('act2')],
    }],
    chunkLibrary: [],
  } as never;
}

const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

/** Focus an act the way the shell does: the project's current act AND its tab. */
function focusAct(actId: string): void {
  useProjectStore.getState().setCurrentAct('ojz', actId);
  useSessionStore.setState({ activeId: `level:ojz:${actId}` });
}

const paletteRed = () =>
  useProjectStore.getState().project!.zones[0].palette.lines[0].colors[0].r;

describe('per-document aeon undo (hub-keyed by act tab id)', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useProjectStore.setState({ project: fakeProject() });
  });

  it('the focused act tab keys its own history', () => {
    focusAct('act1');
    const h1 = focusedHistory();
    expect(documentHistoryHub.has('level:ojz:act1')).toBe(true);
    focusAct('act2');
    expect(focusedHistory()).not.toBe(h1);
  });

  it('edits land in the focused act history; switching acts switches the undo target', () => {
    focusAct('act1');
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    expect(paletteRed()).toBe(7);
    expect(focusedHistory()!.canUndo).toBe(true);

    focusAct('act2');
    expect(focusedHistory()!.canUndo).toBe(false);   // act2 has its own empty history
    focusedHistory()!.undo();                        // no-op on an empty stack, no throw
    expect(paletteRed()).toBe(7);

    focusAct('act1');
    expect(focusedHistory()!.canUndo).toBe(true);
    focusedHistory()!.undo();
    expect(paletteRed()).toBe(0);
    expect(focusedHistory()!.canUndo).toBe(false);
  });

  it('an art-facet command lands on the ZONE-ART document, not the act', () => {
    focusAct('act1');
    useWorkspaceStore.getState().setFacet('level:ojz:act1', 'art');

    executeCommand(setPal(5), getActiveLevel(useProjectStore.getState())!);

    expect(documentHistoryHub.historyFor('zoneart:ojz').canUndo).toBe(true);
    expect(documentHistoryHub.historyFor('level:ojz:act1').canUndo).toBe(false);
  });
});
