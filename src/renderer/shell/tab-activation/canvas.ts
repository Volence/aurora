// CANVAS-DOC activation (planCanvasDocActivation + activateCanvasDocTarget), and
// the close confirm that puts something behind the unsaved dot on a canvas tab.
//
// A canvas-doc tab owns a document in canvasStore plus an undo stack on the hub,
// both keyed by the tab id — the same multi-document shape sprite docs have. Two
// things differ, and both come from the tab id naming a FILE:
//
//   • The first focus is a DISK READ, not a checkout of something already in
//     memory. So the order is LOAD THEN ACTIVATE, never the reverse: nothing is
//     written into the store until the bytes are in hand (R14). Opening an empty
//     document first and filling it in afterwards — the shape the sprite path
//     uses, because its loaders write into whatever is checked out — would leave
//     a failed load holding a blank document under the missing file's name,
//     which is indistinguishable from data loss.
//
//   • A canvas tab id SURVIVES A RESTART, so session restore reaches a tab whose
//     document has not been read yet. That is why activateCanvasDoc is total
//     (canvasStore) and why activation must fire on EVERY focus change, clearing
//     the canvas focus when the incoming tab is not a canvas — otherwise the
//     pane keeps rendering the last canvas under someone else's tab.
//
// The pane derives its document from the ACTIVE TAB ID and treats `activeDocId`
// as a mirror to validate against; nothing here asks it to trust `activeDocId`
// alone.

import { openProjectDir } from '../../state/open-project';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import {
  useCanvasStore, loadCanvasDoc, activateCanvasDoc, clearCanvasFocus,
} from '../../state/canvasStore';
import { loadCanvasFile, type LoadedCanvas } from '../../state/canvas-file';
import { saveCanvasDocument } from '../../state/canvas-save';
import { parseCanvasDocTabId } from '../tabs';
import type { TabDescriptor } from '../../../core/shell/session';
import { beginActivation, isCurrentActivation } from './generation';

export type CanvasDocPlan =
  | { kind: 'none' }
  | { kind: 'activate' }
  | { kind: 'load'; name: string };

/**
 * What focusing a canvas tab has to do. Pure — no store reads, so the decision
 * is testable without a loaded document (its two inputs are the tab id and the
 * one fact only the store knows).
 *
 * No confirm among the cases, for the sprite reason: focusing parks nothing and
 * discards nothing. An already-open document is FOCUSED rather than re-read —
 * re-reading would throw away exactly the unsaved edits multi-document exists to
 * keep, and `loadCanvasDoc` refuses it outright.
 */
export function planCanvasDocActivation(input: { tabId: string; isOpen: boolean }): CanvasDocPlan {
  const ref = parseCanvasDocTabId(input.tabId);
  if (!ref) return { kind: 'none' };
  if (input.isOpen) return { kind: 'activate' };
  return { kind: 'load', name: ref.name };
}

/** Reads one canvas's file pair by NAME. Injectable so the activation flow is
 *  testable without window.api — the seam is a parameter rather than a module
 *  global because there is exactly one call site. */
export type CanvasLoader = (name: string) => Promise<LoadedCanvas>;

function defaultCanvasLoader(name: string): Promise<LoadedCanvas> {
  const dir = openProjectDir();
  // A canvas lives under the project root; with no project open there is no
  // root to resolve `.aurora/canvas/<name>.png` against. Rejecting (rather than
  // reading from some default) routes it through the same "leave nothing
  // behind" path as any other failed load.
  if (dir === null) return Promise.reject(new Error('no project is open'));
  return loadCanvasFile(dir, name);
}

/**
 * R16: the load-time warnings, on screen.
 *
 * `decodeCanvasFiles` diagnoses a sidecar it could not parse, a PNG another tool
 * recoloured behind Aurora's back, a short PLTE, a tRNS index a canvas cannot
 * honour — and every one of those is a fact about the artist's file that only
 * this moment can report. Dropped here, their first notice would be a save-time
 * toast much later, after they have drawn on top of it.
 *
 * ONE TOAST PER WARNING, not one joined paragraph: they are independent
 * diagnoses with independent fixes, and a reader who acts on the first sentence
 * of a wall of text never sees the second. Each is prefixed with the canvas name
 * because a load can be triggered by something other than a click, when the user
 * is not looking at the tab that produced it.
 *
 * THE CEILING IS 3 AT ONCE, and it holds only while loads are one-at-a-time.
 * Four sites push warnings (three in canvas-file-format, one in canvas-file) but
 * two pairs are mutually exclusive — a stale-palette disagreement requires a
 * sidecar that PARSED, and canvas-file's read failure excludes format's parse
 * failure — so one load can produce at most three. If Task 13 (or a restore that
 * stops pruning canvas tabs) ever loads N canvases at once, that becomes 3N on
 * screen together and this should batch per load instead.
 *
 * TYPE 'error' although none of these is fatal — the type picks the DWELL, and
 * only the error dwell (10s, vs 2.2s) is long enough to read a multi-sentence
 * message that ends in an instruction. canvas-save.ts makes the same call for
 * the same reason on its `ok: true, sidecarWritten: false` toast.
 */
function reportCanvasWarnings(name: string, warnings: readonly string[]): void {
  for (const w of warnings) {
    useToastStore.getState().addToast(`Canvas "${name}": ${w}`, 'error');
  }
}

/**
 * Focus a canvas tab's document, reading it from disk on the first focus.
 * Resolves true when the tab may take focus (false = the load failed or was
 * superseded).
 *
 * A FAILED LOAD LEAVES NOTHING BEHIND — no document, no undo stack, no focus
 * change. There is deliberately no openCanvasDoc fallback: a blank document
 * under the missing file's name reads as "your art is gone", and the next save
 * would write that blank over the file that failed to read.
 */
export async function activateCanvasDocTarget(
  tabId: string,
  loader: CanvasLoader = defaultCanvasLoader,
): Promise<boolean> {
  return (await runCanvasActivation(tabId, loader)) === 'focused';
}

/**
 * The SESSION-RESTORE entry point (R17(1)), and the only caller that asks for a
 * load failure to be silent.
 *
 * Restoring canvas tabs is the decision Task 13 owns, and this function is the
 * half of it that keeps the decision affordable. A canvas tab id names a file,
 * so a canvas whose PNG was deleted or renamed between sessions produces a
 * failed load at EVERY boot, forever. Reported the ordinary way that is a
 * 10-second error toast on every single launch, about a file the user may have
 * deleted deliberately — the definition of an alarm nobody can turn off, and the
 * exact cost R17(1) flagged as the reason not to restore at all.
 *
 * So the restore is silent about the failure and the PANE carries the report
 * instead: `canvasPaneState` renders `CanvasDocUnloaded`, which names the file,
 * explains what happened, and offers Retry. That is strictly better than a
 * toast for this case — it is scoped to the tab it is about, it is there when
 * the user looks at that tab rather than 10 seconds after boot, and it does not
 * follow them into a level they opened instead. It is also what Task 12's
 * R17(2) decision built and, until now, nothing reached.
 *
 * A restore-time load that SUCCEEDS still reports its warnings normally: those
 * are facts about a file that opened fine, and the reader is about to draw on
 * it.
 */
export async function activateRestoredCanvasDocTarget(
  tabId: string,
  /** The same test seam `activateCanvasDocTarget` offers, for the same reason:
   *  "does this path stay silent?" is only answerable if the failure can be
   *  provoked without a filesystem. */
  loader: CanvasLoader = defaultCanvasLoader,
): Promise<void> {
  await runCanvasActivation(tabId, loader, { reportLoadFailure: false });
}

/**
 * WHY THE INTERNAL FORM DISTINGUISHES TWO FAILURES (Task 12's R17(2) decision).
 *
 * The boolean above conflates them, and its one consumer needs them apart:
 *
 *   'failed'     — the file could not be read. PERMANENT, and it says nothing
 *                  about which tab the user wants to be looking at.
 *   'superseded' — the read finished after the user moved on. It says exactly
 *                  that, and a tab that takes focus on it steals it back.
 *
 * requestOpenTab treats them differently (see there); requestCloseTab discards
 * both. The public boolean is unchanged so nothing else has to care.
 */
export type CanvasActivation = 'focused' | 'failed' | 'superseded';

async function runCanvasActivation(
  tabId: string,
  loader: CanvasLoader,
  /** `reportLoadFailure: false` is session restore's — see
   *  activateRestoredCanvasDocTarget. Everything else must leave it on: a
   *  failure the user's own click provoked, unreported, is a click that does
   *  nothing. */
  opts: { reportLoadFailure?: boolean } = {},
): Promise<CanvasActivation> {
  // Bumped BEFORE the plan, so even the synchronous 'activate' branch supersedes
  // whatever was in flight — including an open classic dirty-switch confirm,
  // which will then answer false and skip its openAct. That is deliberate (the
  // user moved to another tab, so the switch they were being asked about is
  // stale) and it is what runSpriteActivation has always done; noted because it
  // widens what can cancel a level switch, and nothing tests that interaction.
  const myGen = beginActivation();
  const plan = planCanvasDocActivation({
    tabId,
    isOpen: useCanvasStore.getState().isOpen(tabId),
  });
  if (plan.kind === 'none') return 'focused';
  if (plan.kind === 'activate') {
    activateCanvasDoc(tabId); // synchronous, nothing to supersede
    return 'focused';
  }

  let loaded: LoadedCanvas;
  try {
    loaded = await loader(plan.name);
  } catch (e) {
    // The store was never touched, so there is nothing to roll back — the whole
    // point of loading before installing. Only the report is left to do.
    if (opts.reportLoadFailure !== false) {
      useToastStore.getState().addToast(
        `Could not open the canvas "${plan.name}": ${e instanceof Error ? e.message : String(e)}`,
        'error');
    }
    return 'failed';
  }

  // SUPERSEDED while the read was in flight: the user has moved on. Discard the
  // bytes rather than install them — installing focuses the document
  // (loadCanvasDoc is the first-load path and always focuses), which would point
  // the pane at this canvas while another tab is active. The cost is one
  // re-read on the next focus; the alternative is a second "restore the focus
  // someone else set" path, which is the stale-pane bug wearing a repair kit.
  if (!isCurrentActivation(myGen)) return 'superseded';

  // A document that dirtied while this read was in flight WINS. loadCanvasDoc
  // throws rather than overwrite unsaved edits (a stale read replacing live
  // work), and it is right to: focus what is already open instead.
  if (useCanvasStore.getState().isDirty(tabId)) {
    activateCanvasDoc(tabId);
    return 'focused';
  }

  loadCanvasDoc(tabId, loaded.doc, loaded.source);
  reportCanvasWarnings(plan.name, loaded.warnings);
  return 'focused';
}

/**
 * The canvas half of a focus change, run for EVERY tab kind (R14): a canvas tab
 * loads or checks out its document, and any OTHER tab clears the canvas focus.
 *
 * The clear is not decoration. Canvas documents stay open in the background, so
 * without it `activeDocId` still names the last canvas while a level tab is
 * active — and the moment a canvas tab is focused again, the pane's first frame
 * renders that stale document.
 *
 * BOTH CALL SITES MATTER, and the second one is the easy one to lose: this runs
 * from requestOpenTab AND from the neighbour promotion in requestCloseTab, which
 * is the focus change `session.closeTab` performs after a close. Deleting the
 * promotion call left the whole suite green until the test named for it existed.
 *
 * NOT re-exported by the tab-activation index: it is dispatch's half of a focus
 * change, and a caller reaching it directly would be performing half a focus
 * change with no session write behind it.
 */
export async function focusCanvasForTab(tab: TabDescriptor): Promise<CanvasActivation> {
  if (tab.kind === 'art-doc') return runCanvasActivation(tab.id, defaultCanvasLoader);
  clearCanvasFocus();
  return 'focused';
}

/**
 * Ask what to do about a canvas document that is about to be CLOSED with unsaved
 * edits — the only canvas path that destroys work, since focusing parks. Resolves
 * true when the close may proceed. Same Save / Discard / Cancel vocabulary as
 * confirmCloseSpriteDoc, deliberately: one dialog language for closing a
 * document, whatever kind it is.
 *
 * Save is offered only when the document HAS a destination (`CanvasSource`).
 * Without one there is nothing to write — `saveCanvasDocument` resolves silently
 * for a source-less document — so the button would be a promise the dialog
 * cannot keep. (Task 13 gives every new canvas its file up front, which is what
 * makes that the rare case rather than the normal one.)
 */
export async function confirmCloseCanvasDoc(docId: string): Promise<boolean> {
  const store = useCanvasStore.getState();
  if (!store.isDirty(docId)) return true; // clean, or not open at all: nothing to lose
  const canSave = store.sourceOf(docId) !== null;

  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved canvas edits',
    body: canSave
      ? 'Closing this canvas tab discards its unsaved pixels and undo history.'
      : 'Closing this canvas tab discards its unsaved pixels and undo history. '
        + 'This canvas has no file yet, so there is nowhere to save it.',
    buttons: [
      ...(canSave ? [{ key: 'save', label: 'Save & close', tone: 'primary' as const }] : []),
      { key: 'discard', label: 'Discard & close', tone: 'danger' as const },
      { key: 'cancel', label: 'Cancel' },
    ],
  });

  if (answer === 'save') {
    // saveCanvasDocument THROWS to report failure (the SaveCoordinator contract
    // it was written for) and does NOT toast — its header says the entry points
    // above it do that. This is a third entry point, so the message, which
    // carries the whole recovery instruction, has to be surfaced here or the
    // Save button just looks dead. That is where this diverges from
    // confirmCloseSpriteDoc, whose savers toast and never reject.
    try {
      await saveCanvasDocument(docId);
    } catch (e) {
      useToastStore.getState().addToast(
        `Close cancelled — ${e instanceof Error ? e.message : String(e)}`, 'error');
      return false;
    }
    // Re-read the flag rather than trusting "it did not throw" (the sprite path's
    // rule, and the project-open guard's): still dirty ⇒ nothing was written, and
    // closing would destroy the work Save was meant to protect.
    if (useCanvasStore.getState().isDirty(docId)) {
      useToastStore.getState().addToast(
        'Close cancelled — the canvas could not be saved.', 'error');
      return false;
    }
    return true;
  }
  return answer === 'discard';
}
