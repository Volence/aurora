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
// (3) d-38, THE WORDS. On 2026-09-09 the chunk-undo routing (d-37) made a chunk
// document write through: its strokes land in the library chunk as they are
// made, as recorded, undoable steps. That turned this file's central noun
// false for one document kind. "Discard & close" over a chunk now throws away
// the DOCUMENT and not the work, and a control whose name states a destruction
// that cannot happen is the same defect as the silent ones fixed the same day.
// The owner's answer to `d-38-save-surface-vocabulary` is to rename or remove
// it; it is RENAMED here, because the dialog still carries a real offer (Save
// on a chunk is what APPLIES it to this act's placements, d-18c) and deleting
// the door would delete that offer with it. See RECORDED_COPY below.
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
import { useProjectStore } from '../../state/projectStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { composerSaveState, saveComposerDocument } from '../../state/art-composer-save';
import type { ComposerSaveState } from '../../state/art-composer-save';
import { chunkDocEditsAreRecorded } from '../../state/chunk-doc-commit';
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
  | {
      kind: 'confirm'; name: string; offerSave: boolean; unsavable: string | null;
      /**
       * TRUE when leaving this document behind throws NOTHING away, because
       * every edit in it is already recorded on the zone-art undo stack and
       * already in the library chunk it edits (`chunkDocEditsAreRecorded`).
       *
       * Owner card `d-38-save-surface-vocabulary`: after d-37's write-through
       * routing landed on 2026-09-09, "Discard" on a chunk document names a
       * thing that no longer happens. It is not merely a wrong word: the whole
       * point of the surrounding dialog is to tell a person what they are about
       * to lose, and the honest answer here is "nothing, and Ctrl+Z is how you
       * abandon this work". So the copy, the labels and the danger tone all
       * turn on this flag rather than the word being edited in place.
       */
      writesThrough: boolean;
    };

/**
 * Is there anything to lose, and can Save reach it?
 *
 * PURE, and takes the save state and the write-through verdict as ARGUMENTS
 * rather than calling `composerSaveState()` / reading the project itself, so a
 * test can walk every combination of (document kind, save verdict, recorded or
 * not) without building a project to induce each one.
 *
 * `writesThrough` DEFAULTS TO FALSE, which is the pre-d-38 behaviour and the
 * conservative one: a caller that has not been taught the question keeps
 * warning that work will be lost, rather than reassuring a reader on a document
 * where nobody checked.
 */
export function planArtDocDiscard(
  open: OpenDocument | null, save: ComposerSaveState, writesThrough: boolean = false,
): ArtDocDiscardPlan {
  if (open === null || !open.dirty) return { kind: 'proceed' };
  return {
    kind: 'confirm',
    name: open.name,
    offerSave: save.kind === 'savable',
    unsavable: save.kind === 'blocked' ? save.why : null,
    writesThrough,
  };
}

interface DoorCopy {
  body: string; save: string; discard: string; cancel: string; cancelled: string;
}

const DOOR_COPY: Record<ArtDocDoor, DoorCopy> = {
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
 * ═══ THE SAME THREE DOORS, WHEN NOTHING IS AT STAKE ═══════════════════════
 *
 * Owner card `d-38-save-surface-vocabulary`, answered `name_what_is_true`:
 * "Discard on a chunk is renamed or removed, because there is no longer
 * anything unrecorded for it to throw away. Undo is how you abandon chunk work
 * now."
 *
 * RENAMED, NOT REMOVED, and the reason is that the dialog itself still has
 * something true and useful to say. After d-37 a chunk document's strokes reach
 * the library as they are made, so the DISCARD half of the old question is
 * gone; but Save on a chunk document has meanwhile become the only gesture that
 * APPLIES the chunk to its placements in this act (owner ruling d-18c, the
 * propagation in `state/art-composer-save.ts`). Delete the dialog and that
 * offer disappears with it, and the author walks away leaving placements
 * showing the old art with nothing on screen having mentioned it. So the door
 * stays and stops claiming a loss.
 *
 * WHAT EACH WORD IS DOING:
 *   • The BODY leads with what is already safe, because the reader's question
 *     at this door is "am I about to lose my work" and every second they spend
 *     not knowing is the cost the dialog exists to remove. It names Ctrl+Z by
 *     its chord, not as "undo", because the card's answer is that Undo is now
 *     the abandon gesture and a reader who has to go looking for it has not
 *     been told.
 *   • The middle button is "Close without saving" / "Open without saving", the
 *     plainest description of what it does. It is deliberately NOT "Discard":
 *     `components/ui/safe-focus.ts` is explicit that the repo's guards key on
 *     the `danger` TONE and never on labels, so renaming costs no coverage,
 *     and a word that names a destruction which cannot happen is the exact
 *     defect class this card is about.
 *   • It also loses the `danger` tone (see the ask() call below), because
 *     nothing about it is destructive any more. `safeFocusIndex` still lands on
 *     the reserved `cancel` key, so the d-31 ruling is untouched.
 *
 * ⚠ THE `stale` ENTRY IS UNREACHABLE TODAY and is written honestly rather than
 * left to throw. A chunk document is stale precisely when its library entry has
 * GONE (`components/art/stale-document.ts`, the `chunk` arm), and
 * `chunkDocEditsAreRecorded` answers false for exactly that document, so the
 * stale door always takes `DOOR_COPY` above. It is filled in because
 * `staleTarget` returns the FIRST stale target and a document can in principle
 * carry two, and a `Record` with a hole is a crash waiting for that day.
 */
const RECORDED_COPY: Record<ArtDocDoor, DoorCopy> = {
  open: {
    body: 'Your edits to this chunk are already in the chunk library and Ctrl+Z takes '
      + 'them back, so opening another document throws nothing away. Saving also applies '
      + 'them to every placement of this chunk in this act, which nothing else does.',
    save: 'Save & open',
    discard: 'Open without saving',
    cancel: 'Cancel',
    cancelled: 'Open cancelled',
  },
  close: {
    body: 'Your edits to this chunk are already in the chunk library and Ctrl+Z takes '
      + 'them back, so closing throws nothing away. Saving also applies them to every '
      + 'placement of this chunk in this act, which nothing else does.',
    save: 'Save & close',
    discard: 'Close without saving',
    cancel: 'Cancel',
    cancelled: 'Close cancelled',
  },
  stale: {
    body: 'Your edits to this chunk are already in the chunk library and Ctrl+Z takes '
      + 'them back, so closing throws nothing away.',
    save: 'Save & close',
    discard: 'Close without saving',
    cancel: 'Keep it open',
    cancelled: 'Document kept open',
  },
};

/** The words this door speaks, which depend on whether anything is at stake. */
function doorCopy(door: ArtDocDoor, writesThrough: boolean): DoorCopy {
  return (writesThrough ? RECORDED_COPY : DOOR_COPY)[door];
}

/**
 * The dialog's title.
 *
 * The old one, "Unsaved strokes in ...", is a true sentence about a buffered
 * document and a misleading one about a chunk: the strokes are not unsaved,
 * they are unAPPLIED. A title is the one line a reader is guaranteed to read,
 * so it carries the distinction rather than leaving it to the body.
 */
export function artDocDiscardTitle(plan: { name: string; writesThrough: boolean }): string {
  return plan.writesThrough
    ? `Chunk "${plan.name}" is not applied to this act yet`
    : `Unsaved strokes in "${plan.name}"`;
}

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
  door: ArtDocDoor,
  plan: { offerSave: boolean; unsavable: string | null; writesThrough?: boolean },
  lead?: string,
): string {
  const copy = doorCopy(door, plan.writesThrough === true);
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
  const plan = planArtDocDiscard(
    useArtStore.getState().open,
    composerSaveState(),
    // The d-38 question, asked at the door rather than assumed: is this a chunk
    // document whose entry is STILL in the library, i.e. one whose edits are
    // already recorded and undoable? `chunkDocEditsAreRecorded` is the single
    // definition, so this door cannot disagree with the write-through routing
    // about which documents lose nothing.
    chunkDocEditsAreRecorded(
      useArtStore.getState().open,
      useProjectStore.getState().project?.chunkLibrary ?? [],
    ),
  );
  if (plan.kind === 'proceed') return true;
  const copy = doorCopy(door, plan.writesThrough);

  // The array literal is inline, with the Save button behind a conditional
  // spread, because shell/__tests__/confirm-dialog-focus.test.ts walks every
  // ask() site in src/ in the AST and expands exactly this shape. A computed
  // button list would make this door invisible to it.
  //
  // The MIDDLE button is spread the same way for a reason that analyser also
  // dictates: its `tone` differs between the two cases (danger when strokes are
  // really at risk, none when the edits are already recorded), and a computed
  // `tone:` would make the analyser REFUSE rather than expand. Two spreads means
  // this door now presents four button sets to that guard, and `safeFocusIndex`
  // must land on `cancel` in all four.
  const answer = await useConfirmStore.getState().ask({
    title: artDocDiscardTitle(plan),
    body: artDocDiscardBody(door, plan, lead),
    buttons: [
      ...(plan.offerSave
        ? [{ key: 'save', label: copy.save, tone: 'primary' as const }] : []),
      ...(plan.writesThrough
        ? [{ key: 'discard', label: copy.discard }]
        : [{ key: 'discard', label: copy.discard, tone: 'danger' as const }]),
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
