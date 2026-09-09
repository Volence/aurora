import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  confirmAppClose, __setCloseGuardSaveForTest, __resetCloseGuardSaveForTest,
} from '../close-guard';
import { useEditorStore } from '../../state/editorStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { useArtStore } from '../../state/artStore';
import { createDoc } from '../../../core/art/composer-buffer';
import { useProjectStore } from '../../state/projectStore';
import { createSection } from '../../../core/model/s4-types';

/**
 * AN AEON PROJECT RESIDENT, which is what makes `editorStore.dirty` SAVABLE.
 *
 * ⚠ WHY EVERY ROW BELOW THAT PRESSES SAVE NOW CALLS THIS
 * (DIRTY-DOMAINS-ASSUMED-SAVABLE, 2026-09-09). The rows used to set
 * `editorStore.dirty = true` with nothing open and call it "savable", and the
 * aeon-project saver's own `isDirty` is `openEngine() === 'aeon'` — false with
 * nothing open. No registered saver would have written that dirt; the rows passed
 * because the injected `__setCloseGuardSaveForTest` stub markCleaned the store
 * itself. That is a save no coordinator performs, upholding an offer the guard
 * should never have made, and the guard now correctly drops the Save button in
 * that state. Making the premise TRUE is the repair; deleting the assertion is
 * not.
 */
function aeonProjectResident(): void {
  useProjectStore.setState({
    project: {
      zones: [{
        id: 'z', name: 'Z', tileset: { tiles: [] }, palette: { lines: [] },
        acts: [{
          id: 'a', name: 'A', gridWidth: 1, gridHeight: 1,
          sections: [createSection(0, 'sec0')],
        }],
      }],
      chunkLibrary: [], bgLibrary: [],
    } as never,
    currentZoneId: 'z',
    currentActId: 'a',
  });
}

/**
 * R5. Nothing intercepted the window close: no `close` handler, no
 * `before-quit` check, no `beforeunload`, no autosave. Every OTHER exit door
 * prompts — tab close, act switch, project open, Setup Apply — which trains the
 * habit exactly where it was missing, and Electron's default menu binds `close`
 * to Ctrl+W, so the reflexive close-this-tab chord took the whole window and
 * every unsaved document in it.
 */
describe('confirmAppClose', () => {
  beforeEach(() => {
    useClassicLevelStore.getState().reset();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
    useArtStore.getState().closeDocument();
    useConfirmStore.getState().answer('cancel');
  });
  afterEach(() => {
    __resetCloseGuardSaveForTest();
    useConfirmStore.getState().answer('cancel');
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
    useArtStore.getState().closeDocument();
  });

  it('closes without asking when nothing is unsaved', async () => {
    await expect(confirmAppClose()).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('asks before closing over unsaved work, and cancel keeps the window', async () => {
    useEditorStore.setState({ dirty: true });
    const p = confirmAppClose();
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it('discard closes and leaves the work alone (nothing survives the window)', async () => {
    useEditorStore.setState({ dirty: true });
    const p = confirmAppClose();
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);
  });

  it('save that leaves everything clean closes', async () => {
    aeonProjectResident();                        // so the dirt really IS savable
    useEditorStore.setState({ dirty: true });
    const save = vi.fn(async () => { useEditorStore.getState().markClean(); });
    __setCloseGuardSaveForTest(save);
    const p = confirmAppClose();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('save that fails keeps the window open and says why', async () => {
    aeonProjectResident();                        // so the dirt really IS savable
    useEditorStore.setState({ dirty: true });
    useToastStore.setState({ toasts: [] });
    __setCloseGuardSaveForTest(vi.fn(async () => { /* saver failed and toasted */ }));
    const p = confirmAppClose();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(useToastStore.getState().toasts.at(-1)!.message).toMatch(/unsaved changes remain/i);
  });

  /** The perimeter is shared with the project-open door, so a document type
   *  joined to one is joined to both — including the aeon composer (R3). */
  it('asks over an unsaved aeon composer document too', async () => {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: null, name: 'New Chunk', dirty: false,
    });
    useArtStore.getState().markOpenDirty();
    const p = confirmAppClose();
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
  });

  /**
   * ...AND THE OFFER IS SHARED TOO. This door had no equivalent of the open
   * door's special-case copy at all: an unsavable document got "Save & close" as
   * the primary and, when the re-snapshot re-failed, the bare generic sentence.
   * Both halves come from the shared snapshot now.
   */
  it('does not offer Save & close over a drawing nothing can save, and says why', async () => {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: null, name: 'New Chunk', dirty: false,
    });
    useArtStore.getState().markOpenDirty();       // no project open ⇒ no writer

    const p = confirmAppClose();
    const req = useConfirmStore.getState().request!;
    expect(req.buttons.map((b) => b.key)).toEqual(['discard', 'cancel']);
    expect(req.body!).toMatch(/no open zone and act/i);
    expect(req.body!).toMatch(/Discard & close/);
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open?.dirty).toBe(true);
  });

  it('a MIXED save that leaves the unsavable drawing behind names it in the toast', async () => {
    // BOTH HALVES TRUE IN THE STATE THEY ARE ASSERTED IN, since the two used to
    // contradict each other: the aeon dirt was called savable with no project
    // open, and the composer document was unsavable BECAUSE no project was open.
    // With the project resident the aeon saver really does fire, and the
    // unsavable document is a LIVE-TILE one, which has no writer even then (it
    // writes straight to the tileset; see the open door's twin of this row).
    aeonProjectResident();
    useEditorStore.setState({ dirty: true });     // savable: openEngine() === 'aeon'
    useArtStore.getState().openDocument({
      doc: createDoc(1, 1), liveTileIndex: 4, chunkId: null, name: 'Tile $04', dirty: false,
    });
    useArtStore.getState().markOpenDirty();       // not savable
    useToastStore.setState({ toasts: [] });
    __setCloseGuardSaveForTest(vi.fn(async () => { useEditorStore.getState().markClean(); }));

    const p = confirmAppClose();
    expect(useConfirmStore.getState().request!.buttons.map((b) => b.key)).toContain('save');
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);

    const msg = useToastStore.getState().toasts.at(-1)!.message;
    expect(msg).toMatch(/^Close cancelled/);
    expect(msg).toMatch(/straight to the tileset/i);  // only composerSaveState says this
    expect(msg).toMatch(/Discard & close/);        // and it names THIS door's verb
  });
});
