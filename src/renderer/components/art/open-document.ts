// THE THREE DOORS THAT CAN DESTROY THE OPEN COMPOSER DRAWING.
//
// `artStore.open.doc` is a document store on the unsaved-work perimeter: its
// strokes live in that store alone, and replacing or closing it is the only way
// they are ever lost. Three doors do that, and all three are here so that one
// rule, one dialog and one set of words serve them:
//
//   • REPLACE  (`confirmArtDocumentOpen`) — every "open this in the composer"
//     gesture in the app: the launcher's New Tile / Block / Chunk, a double click
//     in the tileset panel, the chunk grid, the blob tile strip, a band's bank
//     strip, and the map's right-click Edit Tile / Edit Block and marquee capture.
//   • CLOSE    (`confirmArtDocumentClose`) — the doc header's `New...` button, the
//     one route back to the launcher.
//   • STALE    (`confirmStaleArtDocumentClose`) — the target the document was
//     editing stopped existing under it (see ./stale-document.ts).
//
// ═══ WHY THIS FILE CHANGED, TWICE OVER ════════════════════════════════════
//
// (1) ART-DOC-CLOSED-UNGUARDED. The STALE door did not exist. `art-facet.tsx`
// called `useArtStore.getState().closeDocument()` directly at three sites and
// followed it with an INFO TOAST, so a drawing with unsaved strokes was destroyed
// and the author was notified after the fact. That was a defensible concession
// once and is not one now; the evidence either way is written out at the stale
// door below.
//
// (2) ART-DISCARD-GUARD-UNTESTED. The other two doors asked through
// `window.confirm`, which was the ONLY `window.confirm` left in `src/` (measured:
// every other door in the app asks through `state/confirmStore.ts`, rendered by
// `shell/ConfirmDialog.tsx`). It was not a considered exception. This file was
// created on 2026-06-11 and `confirmStore.ts` on 2026-08-12, so the site predates
// the convention by two months.
//
// ⚠ AND THE MECHANISM WAS NOT A COSMETIC PROBLEM. Card
// `d-31-confirm-dialog-focuses-nothing` ruled that a confirm dialog must focus
// its SAFE button and never a destructive one, after a bare Space aimed at
// nothing destroyed a sprite in the running app (`components/ui/safe-focus.ts`
// records the measurement). A native `window.confirm` focuses OK by default, and
// OK here meant "discard the drawing" — so the one door in the app whose
// destructive answer is an artist's unsaved work was the one door outside that
// ruling's reach, and `shell/__tests__/confirm-dialog-focus.test.ts`, which walks
// every `ask()` site in the tree, could not see it at all. Going through
// `confirmStore` puts this door inside both.
//
// A third gain, and the reason the tests below can exist: `window.confirm` is
// unreachable in the node suite (`window` itself is undefined there, so the call
// is a ReferenceError rather than a no-op, exactly as `shell/close-guard.ts`
// records for its own old code). `confirmStore` is a plain zustand store, so the
// real door can be driven here with no DOM.
//
// ═══ THE SHAPE IS THE PERIMETER'S OWN ════════════════════════════════════
//
// `planArtDocDiscard` is the pure decision, `artDocDiscardBody` the pure copy,
// and the `confirm*` functions the ask -> save -> re-snapshot glue: the same
// split, in the same order, for the same reason as `shell/project-open-guard.ts`
// and `shell/close-guard.ts`. `offerSave` comes from `composerSaveState()`, the
// one rule for "can Save write this document", so this door cannot promise a save
// the coordinator will not perform.

import { useArtStore } from '../../state/artStore';
import type { OpenDocument } from '../../state/artStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { composerSaveState, saveComposerDocument } from '../../state/art-composer-save';
import type { ComposerSaveState } from '../../state/art-composer-save';
import { staleTargetSentence } from './stale-document';
import type { StaleTarget } from './stale-document';

/** Which door the author is standing at. Decides the verbs, nothing else. */
export type ArtDocDoor = 'open' | 'close' | 'stale';

export type ArtDocDiscardPlan =
  | { kind: 'proceed' }
  /**
   * `offerSave` false ⇒ the door must NOT show a Save button: the strokes at risk
   * have no writer, so the primary would be inert by construction. That is the
   * defect `state/art-composer-save.ts` was extracted to end, and repeating the
   * shape here rather than passing a bare boolean is deliberate.
   */
  | { kind: 'confirm'; name: string; offerSave: boolean; unsavable: string | null };

/**
 * Is there anything to lose, and can Save reach it?
 *
 * PURE, and takes the save state as an ARGUMENT rather than calling
 * `composerSaveState()` itself, so a test can walk every combination of
 * (document kind, save verdict) without building a project to induce each one.
 */
export function planArtDocDiscard(
  open: OpenDocument | null, save: ComposerSaveState,
): ArtDocDiscardPlan {
  if (open === null || !open.dirty) return { kind: 'proceed' };
  return {
    kind: 'confirm',
    name: open.name,
    offerSave: save.kind === 'savable',
    unsavable: save.kind === 'blocked' ? save.why : null,
  };
}

const DOOR_COPY: Record<ArtDocDoor, {
  body: string; save: string; discard: string; cancel: string; cancelled: string;
}> = {
  open: {
    body: 'Opening another art document discards the unsaved strokes in this one.',
    save: 'Save & open',
    discard: 'Discard & open',
    cancel: 'Cancel',
    cancelled: 'Open cancelled',
  },
  close: {
    body: 'Closing this art document discards its unsaved strokes.',
    save: 'Save & close',
    discard: 'Discard & close',
    cancel: 'Cancel',
    cancelled: 'Close cancelled',
  },
  stale: {
    // The lead sentence (which target went, and why) is prepended by the caller;
    // this half says what closing would cost, in the present tense, because at
    // this door the document is still on screen.
    body: 'Closing it discards the unsaved strokes it still holds.',
    save: 'Save & close',
    discard: 'Discard & close',
    // NOT "Cancel", because at this door cancelling is a real outcome the author
    // may well want: the drawing stays on screen. The KEY is still the reserved
    // `cancel` (see components/ui/safe-focus.ts), which is what the dialog
    // focuses and what Esc answers; only the label differs.
    cancel: 'Keep it open',
    cancelled: 'Document kept open',
  },
};

/**
 * The dialog body: what is at stake, then every sentence naming work Save cannot
 * write, then what to do about it, BEFORE the author presses anything.
 *
 * Modelled on `unsavedDialogBody` in shell/project-open-guard.ts, and for the
 * reason its header gives: a user with an unsavable document must not have to
 * learn that by pressing Save and reading a toast. When nothing is savable the
 * Save button is gone entirely and the last sentence has to say so, or a missing
 * primary button reads as a bug.
 */
export function artDocDiscardBody(
  door: ArtDocDoor, plan: { offerSave: boolean; unsavable: string | null }, lead?: string,
): string {
  const copy = DOOR_COPY[door];
  const head = lead ? `${lead} ${copy.body}` : copy.body;
  if (plan.unsavable === null) return head;
  const tail = plan.offerSave
    ? `Save cannot cover all of it, so anything left needs ${copy.discard}.`
    : `Nothing here can be saved, so ${copy.discard} or ${copy.cancel} are the only ways out.`;
  return `${head} ${plan.unsavable} ${tail}`;
}

/**
 * Ask the one question, then act on the answer: the whole of the ask -> save ->
 * re-snapshot flow, shared by all three doors.
 *
 * Resolves true when the caller may destroy the document (nothing was at risk,
 * the author discarded, or a save left it verifiably clean), false when it must
 * not (cancel, dismissal, or a save that did not clear the flag).
 */
async function askBeforeDiscard(door: ArtDocDoor, lead?: string): Promise<boolean> {
  const plan = planArtDocDiscard(useArtStore.getState().open, composerSaveState());
  if (plan.kind === 'proceed') return true;
  const copy = DOOR_COPY[door];

  // The array literal is inline, with the Save button behind a conditional
  // spread, because shell/__tests__/confirm-dialog-focus.test.ts walks every
  // ask() site in src/ in the AST and expands exactly this shape. A computed
  // button list would make this door invisible to it.
  const answer = await useConfirmStore.getState().ask({
    title: `Unsaved strokes in "${plan.name}"`,
    body: artDocDiscardBody(door, plan, lead),
    buttons: [
      ...(plan.offerSave
        ? [{ key: 'save', label: copy.save, tone: 'primary' as const }] : []),
      { key: 'discard', label: copy.discard, tone: 'danger' as const },
      { key: 'cancel', label: copy.cancel },
    ],
  });

  if (answer === 'save') {
    saveComposerDocument();
    // `saveComposerDocument` returning is not the same as it having written: it
    // bails on a full tileset, an unslicable document and a chunk that went away
    // mid-flight, toasting its own reason each time. The honest gate is the same
    // one the two perimeter doors use: RE-READ the flag. Still dirty means the
    // save did not happen, so refuse rather than destroying the work the save was
    // meant to protect, and say so, since a button that appears to do nothing
    // reads as a hang. (On success the save re-opens the document clean, which is
    // why this reads `open` again rather than trusting the pre-save snapshot.)
    if (useArtStore.getState().open?.dirty === true) {
      useToastStore.getState().addToast(
        `${copy.cancelled}: Save did not write "${plan.name}", so its strokes are still `
        + 'unsaved.', 'error');
      return false;
    }
    return true;
  }

  return answer === 'discard';   // cancel / dismissed / any unrecognised key
}

/**
 * Open `next` in the composer, asking first when the open document has unsaved
 * strokes. Resolves true if the document was opened.
 *
 * ⚠ RENAMED FROM `openDocumentGuarded`, ON PURPOSE. The old name was synchronous
 * and returned a bare boolean, and every call site is written as
 * `if (!openDocumentGuarded(...)) return;`. A `Promise<boolean>` under the old
 * name would have typechecked at all ten of those sites and been WRONG at all
 * ten: `!somePromise` is always false, so each one would have carried on as if
 * the author had agreed. Renaming makes the import fail to resolve instead, which
 * is the only version of this change that cannot land half-applied.
 *
 * The save flow's own re-open (`state/art-composer-save.ts`) and the project-open
 * path (`state/aeon-open.ts`) still call `openDocument` directly and must keep
 * doing so: the document is provably clean at both of those points, and routing
 * them through here would put a dialog in front of a save that just succeeded.
 */
export async function confirmArtDocumentOpen(next: OpenDocument): Promise<boolean> {
  if (!await askBeforeDiscard('open')) return false;
  useArtStore.getState().openDocument(next);
  return true;
}

/**
 * Close the open document, asking first when it has unsaved strokes. Resolves
 * true if it was closed.
 *
 * THE WAY BACK TO THE NEW-DOCUMENT LAUNCHER. The launcher is the art facet's
 * no-document state, and it was reachable only by never having opened one, which
 * stopped being true when the aeon open path started landing on the first chunk.
 * Without this, defaulting to a document would have deleted "make a new
 * tile/block/chunk" from the product.
 */
export async function confirmArtDocumentClose(): Promise<boolean> {
  if (useArtStore.getState().open === null) return true;
  if (!await askBeforeDiscard('close')) return false;
  useArtStore.getState().closeDocument();
  return true;
}

/**
 * The document's target has gone (see ./stale-document.ts). Close it, asking
 * first when it has unsaved strokes. Resolves true if it was closed.
 *
 * ═══ WAS THE OLD TOAST A CONCESSION OR AN OVERSIGHT? ════════════════════════
 *
 * A CONCESSION, and the code says so in three places. Until the composer document
 * got a saver of its own (`state/art-composer-save.ts`, extracted 2026-09-08),
 * NOTHING could clear `open.dirty` on an existing entry: `artStore` had
 * `openDocument` / `closeDocument` / `markOpenDirty` and no `markOpenClean`, the
 * SaveCoordinator had four savers and none touched this store, and the one Save
 * button in the app lived inside the facet component. So a dialog raised here
 * could have offered only Discard and Cancel, and Cancel would have meant
 * "keep a document nothing in the app can ever save". Closing it and saying so
 * was the honest end of a road with no exit. The three call sites read that way
 * too: one shared handler, one `info` toast each, no `error` and no `warning`.
 *
 * WHAT MAKES IT AN OVERSIGHT NOW is not that a saver exists but that CANCEL
 * became worth offering. A stale document left open is a safe no-op rather than a
 * hazard, and that is measured, not assumed: `ComposerCanvas`'s `commitAtlasTile`
 * does `const tile = atlas[tileIndex]; if (!tile) return;`, so strokes on a live
 * tile past the end of the tileset write nothing; `bgArtCommitCommand` skips every
 * write whose `bgArtCellAtlasIndex` is null and returns null for a band that is
 * gone; and a chunk document whose chunk was removed still paints against the
 * intact zone tileset. So keeping it open costs nothing and shows the author their
 * drawing, which is strictly more than a notification that it has been deleted.
 *
 * ⚠ AND SAVE IS BLOCKED AT ALL THREE ARMS OF THIS DOOR TODAY, which is worth
 * knowing before reading the Save button as this door's payoff. `composerSaveState`
 * blocks a live-tile document and a BG-art document outright, and (as of this
 * parcel) a chunk document whose chunk has left the library, which is precisely
 * the set of documents that can be stale. So the dialog here offers Discard and
 * Keep it open, and the Save arm exists because this door shares one flow with the
 * other two and not because it can fire. Making a stale document savable again is
 * a real follow-up and deliberately not invented here: it would mean DETACHING it
 * (dropping `chunkId` / `liveTileIndex` / `bgOverride` so Save writes a new library
 * chunk), and a band-art document cannot simply be detached, because its cells
 * index the override's own atlas and would silently be reinterpreted against the
 * zone tileset. See the report filed with this parcel.
 */
export async function confirmStaleArtDocumentClose(target: StaleTarget): Promise<boolean> {
  const open = useArtStore.getState().open;
  if (open === null) return true;
  const lead = staleTargetSentence(target);
  if (!open.dirty) {
    // Nothing to lose, so nothing to ask: close it and say why it went, which is
    // what the old code did at all three sites and is still right at this one.
    useArtStore.getState().closeDocument();
    useToastStore.getState().addToast(`${lead} Document closed`, 'info');
    return true;
  }
  if (!await askBeforeDiscard('stale', lead)) return false;
  useArtStore.getState().closeDocument();
  return true;
}
