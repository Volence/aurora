// THE SAVE CONTRACT: the three mechanical halves of it that two independent UX
// seats found broken on 2026-09-07, one row per receipt.
// Packet: docs/reviews/2026-09-09-save-contract.md.
//
// ⚠ THREE DIFFERENT PREDICATES LIVE IN THIS FILE AND THEY ARE NOT SYNONYMS.
// Naming which one each row reads is the whole discipline here, because a row
// that confirms one while the defect lives in another passes and proves nothing:
//
//   * "the store believes there are unsaved edits" - `useEditorStore.dirty` /
//     `dirtyActs`. Rows R5-* read this.
//   * "an undo could take the work back" - `documentHistoryHub.has(docId)` and
//     the stack's `canUndo`. Rows R4-* read this.
//   * "the app told a person" - a toast in `useToastStore`. Row R2-* reads this.
//
// A FOURTH, "the bytes on disk changed", is NOT readable from this suite (no IO
// here) and is measured in the foreground harness instead
// (`npm run harness:save-contract`), where the file's mtime and hash are the
// instrument. Do not let a green here be read as "it saved".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requestCloseTab } from '../tab-activation';
import { levelDocDirty, unsavedElsewhereMessage, type DirtySnapshot } from '../dirty-tabs';
import { classicLevelTab } from '../tabs';
import { useSessionStore } from '../../state/sessionStore';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useEditorStore, executeCommand, focusedHistory } from '../../state/editorStore';
import { useToastStore } from '../../state/toastStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import { saveActive, __setRuntimeSaversForTest, __resetRuntimeSaversForTest } from '../../state/project-runtime';

/** A one-zone/two-act aeon project, the shape state/__tests__/aeon-doc-history uses. */
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

/** One undoable command: a palette line edit, recorded on the focused document. */
const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

function focusAct(actId: string): void {
  useProjectStore.getState().setCurrentAct('ojz', actId);
  useSessionStore.setState({ activeId: `level:ojz:${actId}` });
}

/** The clean baseline every row starts from. */
function openAeon(): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject() });
  useEditorStore.getState().markClean();
  useToastStore.setState({ toasts: [] });
}

// ---------------------------------------------------------------------------
// R5 - dirty clears when the document returns to the point it was last saved.
// PREDICATE: the store's belief (`useEditorStore.dirty` / `dirtyActs`).
// ---------------------------------------------------------------------------

describe('R5: the dirty flag follows the undo stack back to the saved point', () => {
  beforeEach(() => { openAeon(); focusAct('act1'); });

  it('undoing the only edit clears dirty, and redoing it sets it again', () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(Object.keys(useEditorStore.getState().dirtyActs)).toEqual(['ojz/act1']);

    focusedHistory()!.undo();

    // THE RECEIPT. Before the fix this stayed true: nothing ever walked the edit
    // count back down, so the dot could only be turned on.
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(Object.keys(useEditorStore.getState().dirtyActs)).toEqual([]);

    focusedHistory()!.redo();
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it('two edits need two undos, and the halfway point is still dirty', () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    executeCommand(setPal(9), getActiveLevel(useProjectStore.getState())!);

    focusedHistory()!.undo();
    expect(useEditorStore.getState().dirty).toBe(true);

    focusedHistory()!.undo();
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  // THE CONTROL THAT MATTERS, because the failure it guards is a FALSE CLEAN and
  // a false clean loses work. `markDirty()` with no argument is the mid-gesture
  // path (a direct BG tile write, a collision stroke's other plane): no command,
  // no undo step, nothing an undo can give back.
  it('an edit no undo can revert keeps the act dirty however far the stack unwinds', () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    useEditorStore.getState().markDirty();          // the unrevertable one

    focusedHistory()!.undo();

    expect(useEditorStore.getState().dirty).toBe(true);
    expect(Object.keys(useEditorStore.getState().dirtyActs)).toEqual(['ojz/act1']);
  });

  // THE OTHER DIRECTION, and the other false clean: undoing PAST the point the
  // save was taken leaves the document differing from disk again.
  it('undoing past a save is dirty, and redoing back to the save is clean', () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    const atGen = { ...useEditorStore.getState().dirtyActs };
    useEditorStore.getState().markActsClean(['ojz/act1'], atGen);
    expect(useEditorStore.getState().dirty).toBe(false);

    focusedHistory()!.undo();
    expect(useEditorStore.getState().dirty).toBe(true);

    focusedHistory()!.redo();
    expect(useEditorStore.getState().dirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R4 - a level tab close must not destroy the undo history of work it KEEPS.
// PREDICATE: "an undo could take the work back" (`documentHistoryHub.has`).
// ---------------------------------------------------------------------------

describe('R4: closing a dirty level tab keeps the history that could revert it', () => {
  const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };
  const GHZ1 = classicLevelTab({ zone: 'ghz', act: 1, label: 'GHZ 1', available: true });

  beforeEach(() => {
    useSessionStore.getState().reset();
    documentHistoryHub.clearAll();
    // No project open, so a promoted level tab never blocks the close (the same
    // baseline tab-activation.test.ts's disposal rows use).
    useClassicProjectStore.setState({ status: 'closed' } as never);
    useProjectStore.setState({ project: null } as never);
    useEditorStore.getState().markClean();
  });

  it('a CLEAN level tab still disposes its stack (the pre-existing rule, unchanged)', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ1], activeId: GHZ1.id });
    documentHistoryHub.historyFor(GHZ1.id);

    await requestCloseTab(GHZ1.id);

    expect(documentHistoryHub.has(GHZ1.id)).toBe(false);
  });

  it('a DIRTY level tab keeps its stack, because the close keeps the edit', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ1], activeId: GHZ1.id });
    documentHistoryHub.historyFor(GHZ1.id);
    // Dirty through the CLASSIC half of the snapshot, which is what
    // `levelDocDirty` reads for a classic tab: the loaded act plus a dirty
    // domain. Derived from dirty-snapshot.ts's own reads, not copied from a pin.
    useClassicProjectStore.setState({ status: 'open' } as never);
    useClassicLevelStore.setState({
      ref: { zone: 'ghz', act: 1 }, dirty: { layout: true },
    } as never);

    await requestCloseTab(GHZ1.id);

    // THE RECEIPT. Before the fix this was false: the tab closed, the edit
    // survived in the store, and Undo and Redo came back disabled.
    expect(documentHistoryHub.has(GHZ1.id)).toBe(true);
    // And the predicate the rule is derived from, asserted rather than assumed.
    expect(levelDocDirty(GHZ1.id, {
      classicOpen: true, classicRef: { zone: 'ghz', act: 1 }, classicDirty: true,
      aeonOpen: false, aeonDirty: false,
      dirtySpriteDocIds: [], dirtyCanvasDocIds: [], artDirty: false,
    })).toBe(true);
  });

  afterEach(() => {
    useClassicProjectStore.setState({ status: 'closed' } as never);
    useClassicLevelStore.setState({ ref: null, dirty: {} } as never);
  });
});

// ---------------------------------------------------------------------------
// R2 - Ctrl+S that writes nothing while work is unsaved must say so.
// PREDICATE: "the app told a person" (a toast), plus the pure message rule.
// ---------------------------------------------------------------------------

const CLEAN_SNAPSHOT: DirtySnapshot = {
  classicOpen: false, classicRef: null, classicDirty: false,
  aeonOpen: false, aeonDirty: false,
  dirtySpriteDocIds: [], dirtyCanvasDocIds: [], artDirty: false,
};

describe('R2: the message rule', () => {
  it('says nothing when nothing is dirty', () => {
    expect(unsavedElsewhereMessage(CLEAN_SNAPSHOT)).toBeNull();
  });

  it('names the level when an aeon act is dirty', () => {
    const m = unsavedElsewhereMessage({ ...CLEAN_SNAPSHOT, aeonOpen: true, aeonDirty: true });
    expect(m).toContain('a level');
    expect(m).toContain('Ctrl+Shift+S');
  });

  it('names every dirty kind at once, and counts the documents', () => {
    const m = unsavedElsewhereMessage({
      ...CLEAN_SNAPSHOT, aeonOpen: true, aeonDirty: true, artDirty: true,
      dirtySpriteDocIds: ['doc:sprite:a'],
      dirtyCanvasDocIds: ['doc:canvas:a', 'doc:canvas:b'],
    });
    expect(m).toContain('a level');
    expect(m).toContain('the art composer');
    expect(m).toContain('a sprite document');
    expect(m).toContain('2 canvas documents');
  });
});

describe('R2: Ctrl+S on a tab no saver owns', () => {
  beforeEach(() => {
    openAeon();
    useSessionStore.getState().reset();          // Home is the active tab
    __setRuntimeSaversForTest({ aeon: async () => {}, classic: async () => {} });
  });
  afterEach(() => { __resetRuntimeSaversForTest(); });

  it('stays silent when nothing anywhere is unsaved', async () => {
    await saveActive('home');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('says what it did and where the work is when an act IS unsaved', async () => {
    focusAct('act1');
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    useSessionStore.setState({ activeId: 'home' });
    useToastStore.setState({ toasts: [] });

    await saveActive('home');

    // THE RECEIPT. Before the fix: dirtyActs ["ojz/act1"] before, ["ojz/act1"]
    // after, and no toast, no error, no message of any kind.
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.message).toBe(
      unsavedElsewhereMessage({
        classicOpen: false, classicRef: null, classicDirty: false,
        aeonOpen: true, aeonDirty: true,
        dirtySpriteDocIds: [], dirtyCanvasDocIds: [], artDirty: false,
      }),
    );
  });

  it('a save that DID write says nothing extra', async () => {
    focusAct('act1');
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    useToastStore.setState({ toasts: [] });

    await saveActive('level:ojz:act1');

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
