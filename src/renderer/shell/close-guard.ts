// The window-close half of the unsaved-work perimeter.
//
// Every other exit door already prompts — tab close, act switch, project open,
// Setup Apply — and closing the WINDOW, the one that takes everything at once,
// did not. There was no `close` interception, no `before-quit` check, no
// `beforeunload` handler and no autosave, so Ctrl+W (Electron's default menu
// binds `close` to it, since Aurora sets no menu of its own) destroyed every
// unsaved document in the app without a word.
//
// Main owns the window and cannot see what is dirty; this side can. So main
// suspends the close and asks here — see installCloseGuard in main/index.ts —
// and this answers with the SAME snapshot and the same three-button dialog the
// project-open door uses. Sharing `currentOpenDirtySnapshot`/`planProjectOpen`
// rather than restating the rule is the point: a document type joined to one
// perimeter is joined to both.
//
// Unlike the open guard this does NOT tear the document session down. Nothing
// survives the window, and a discard here is the user saying "lose it", not
// "hand the next project a clean slate".

import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveAllDirty } from '../state/project-runtime';
import { planProjectOpen, currentOpenDirtySnapshot } from './project-open-guard';

// -- Injectable save call (test seam, same convention as project-open-guard) --
type SaveFn = () => Promise<unknown>;
let saveImpl: SaveFn = saveAllDirty;
/** Substitute the save call (tests only). */
export function __setCloseGuardSaveForTest(fn: SaveFn): void { saveImpl = fn; }
/** Restore the real save call (tests only). */
export function __resetCloseGuardSaveForTest(): void { saveImpl = saveAllDirty; }

/**
 * May the window close? True = nothing unsaved, the user discarded, or a save
 * left everything verifiably clean. False = cancel, or a save that did not.
 */
export async function confirmAppClose(): Promise<boolean> {
  if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'proceed') return true;

  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved changes',
    body: 'Closing Aurora discards unsaved edits and undo history.',
    buttons: [
      { key: 'save', label: 'Save & close', tone: 'primary' },
      { key: 'discard', label: 'Discard & close', tone: 'danger' },
      { key: 'cancel', label: 'Cancel' },
    ],
  });

  if (answer === 'save') {
    await saveImpl();
    // `saved` only means the savers RAN. The honest gate is to re-snapshot: if
    // anything is still dirty a saver failed (and has already toasted its own
    // reason), so stay open rather than closing over the work it was trying to
    // protect — and say so, since a window that simply refuses to close reads
    // as a hang.
    if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') {
      useToastStore.getState().addToast(
        'Close cancelled: unsaved changes remain (save or discard them first).',
        'error',
      );
      return false;
    }
    return true;
  }

  return answer === 'discard';
}

/**
 * Wire this window to main's close handshake. Called once at startup; a no-op
 * where the bridge is absent (the node suite, and any non-Electron host).
 */
export function installCloseGuard(): void {
  window.api?.onCloseRequest?.((respond) => {
    confirmAppClose().then(respond, (err) => {
      // A guard that throws must not be able to trap the user in the app.
      console.error('[close] guard failed; closing', err);
      respond(true);
    });
  });
}
