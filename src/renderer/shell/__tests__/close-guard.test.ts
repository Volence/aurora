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
    useEditorStore.getState().markClean();
    useArtStore.getState().closeDocument();
    useConfirmStore.getState().answer('cancel');
  });
  afterEach(() => {
    __resetCloseGuardSaveForTest();
    useConfirmStore.getState().answer('cancel');
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
    useEditorStore.setState({ dirty: true });
    const save = vi.fn(async () => { useEditorStore.getState().markClean(); });
    __setCloseGuardSaveForTest(save);
    const p = confirmAppClose();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('save that fails keeps the window open and says why', async () => {
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
});
