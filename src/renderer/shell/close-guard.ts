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

import type { ElectronAPI } from '../../preload/index';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveAllDirty } from '../state/project-runtime';
import {
  planProjectOpen, currentOpenDirtySnapshot, unsavedDialogBody, unsavedBlockedMessage,
} from './project-open-guard';

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
  const plan = planProjectOpen(currentOpenDirtySnapshot());
  if (plan.kind === 'proceed') return true;

  // The Save button is dropped when nothing dirty has a writer, and the body
  // names what those things are — the same decision, from the same snapshot,
  // as the project-open door. The array literal is inline because
  // shell/__tests__/confirm-dialog-focus.test.ts walks it in the AST.
  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved changes',
    body: unsavedDialogBody('close', plan),
    buttons: [
      ...(plan.offerSave
        ? [{ key: 'save', label: 'Save & close', tone: 'primary' as const }] : []),
      { key: 'discard', label: 'Discard & close', tone: 'danger' as const },
      { key: 'cancel', label: 'Cancel' },
    ],
  });

  if (answer === 'save') {
    await saveImpl();
    // `saved` only means the savers RAN. The honest gate is to re-snapshot: if
    // anything is still dirty a saver failed (and has already toasted its own
    // reason), so stay open rather than closing over the work it was trying to
    // protect — and say so, since a window that simply refuses to close reads
    // as a hang. The message names WHICH work Save could not write: this door
    // used to emit the generic sentence alone, so a close blocked by an
    // unsavable document told the user to do the one thing that cannot work.
    const after = currentOpenDirtySnapshot();
    if (planProjectOpen(after).kind === 'confirm') {
      useToastStore.getState().addToast(unsavedBlockedMessage('close', after), 'error');
      return false;
    }
    return true;
  }

  return answer === 'discard';
}

/**
 * DID THE GUARD ACTUALLY ARM? A three-way answer, because the two ways it can
 * fail to arm want opposite treatment and the old code could not tell them
 * apart — it was `window.api?.onCloseRequest?.(…)`, two optional chains whose
 * combined meaning was "and if either is missing, do nothing, quietly".
 *
 * That silence is expensive on THIS perimeter specifically. Main suspends the
 * close, asks, and — by design — CLOSES ANYWAY when no answer arrives
 * (main/close-handshake.ts says why). So a renderer that registered nothing does
 * not merely lose the dialog: the window closes over every unsaved document
 * fifteen seconds later, and nothing anywhere said why. Compare the aeon removal
 * loop, which handles its absent channel explicitly and names it —
 * `'no delete channel on window.api'` in state/aeon-save.ts.
 */
export type CloseGuardInstall =
  /** Registered: main's question will be answered. */
  | { kind: 'armed' }
  /**
   * No Electron preload at all. The documented no-op — the node suite and any
   * non-Electron host — and not a defect. (The old code CLAIMED to no-op here
   * and would in fact have thrown: `window` itself is undefined in the node
   * suite, so `window.api?.` is a ReferenceError, not a short circuit.)
   */
  | { kind: 'no-bridge'; why: string }
  /**
   * PRELOAD DRIFT: the bridge is there and the close channel is not. Everything
   * else in the app works, so nothing else will ever surface this — and the
   * window will close over unsaved work. `ElectronAPI` is `typeof api`, so the
   * type already promises this method; reaching here means the running preload
   * disagrees with the type it was compiled from.
   */
  | { kind: 'drift'; why: string };

/**
 * Wire this window to main's close handshake. Called once at startup. The caller
 * must act on a 'drift' result — App.tsx says so out loud — because a close
 * guard that failed to arm looks exactly like one that armed until the day the
 * window is closed.
 */
export function installCloseGuard(): CloseGuardInstall {
  if (typeof window === 'undefined') {
    return { kind: 'no-bridge', why: 'there is no `window`: not running in a renderer.' };
  }
  const api = (window as { api?: Partial<ElectronAPI> }).api;
  if (!api) {
    return { kind: 'no-bridge', why: 'window.api is absent: no Electron preload is exposed.' };
  }
  if (typeof api.onCloseRequest !== 'function') {
    return {
      kind: 'drift',
      why: 'no onCloseRequest channel on window.api: the preload does not expose the '
        + 'close handshake, so nothing will answer main and the window will close over '
        + 'unsaved work when main\'s guard times out.',
    };
  }
  api.onCloseRequest((respond) => {
    confirmAppClose().then(respond, (err) => {
      // A guard that throws must not be able to trap the user in the app.
      console.error('[close] guard failed; closing', err);
      respond(true);
    });
  });
  return { kind: 'armed' };
}
