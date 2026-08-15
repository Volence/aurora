// SPRITE-DOC activation (planSpriteDocActivation + activateSpriteDocTarget), and
// the close confirm that is the only sprite path which still destroys work.
//
// MULTI-DOCUMENT (spec §4.4): every sprite-doc tab owns a document in
// spriteStore plus an undo stack on the hub, both keyed by the tab id. The
// sprite editor still has ONE mounting point, but focusing a tab now CHECKS OUT
// its document and PARKS the outgoing one whole — pixels, palette, save-back
// target, dirty flag and undo stack all survive in the background. So a tab
// switch discards nothing and asks nothing; only a CLOSE discards, and that
// confirm lives here, called from requestCloseTab.
//
// `spriteStore.activeDocId` IS the loaded-doc marker (it is what recordEdit
// records against), so there is no second copy to drift out of sync.

import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import {
  useSpriteStore, openSpriteDoc, activateSpriteDoc, closeSpriteDoc,
  dirtySpriteDocIds, spriteDocState, DEFAULT_FRAME_SIZE,
} from '../../state/spriteStore';
import { parseSpriteDocTabId, UNTITLED_SPRITE_TAB_ID } from '../tabs';
import { beginActivation, isCurrentActivation } from './generation';

/** The ENGINE-BOUND sprite-doc tab whose document is checked out, or null when
 *  the editor holds the untitled document. (The untitled document now has a tab
 *  of its own — "New Sprite…" — but it is bound to no sprite on disk, which is
 *  the question this answers, so it still reports null.) */
export function getLoadedSpriteDocId(): string | null {
  const id = useSpriteStore.getState().activeDocId;
  return parseSpriteDocTabId(id) ? id : null;
}

/**
 * TRUE when ANY open sprite document has unsaved edits — parked documents
 * included. Honest dirtiness: recordEdit sets the flag, loadSprite/newSprite and
 * a successful save/export clear it. A bare checkout (s1ArtSource set, no edits)
 * is NOT dirty — that was the phantom-dirty bug where a freshly-opened, unedited
 * S1 sprite dotted its tab and re-asked the discard dialog on every switch.
 */
export function anySpriteDocDirty(): boolean {
  return dirtySpriteDocIds().length > 0;
}

/**
 * End the whole sprite editing session: drop every open document, its undo stack
 * and its save-back checkout, leaving a blank untitled document. Used when the
 * project underneath them goes away — a surviving checkout points at the OLD
 * project's file by absolute path, so a later Ctrl+S would write across projects.
 * (Named for what it now does: Task 7 made this a multi-document store, so
 * resetting "the editor" alone would leave parked documents behind.)
 */
export function closeAllSpriteDocs(): void {
  useSpriteStore.getState().closeAll();
}

export type SpriteDocPlan =
  | { kind: 'none' }
  | { kind: 'checkout' }
  | { kind: 'untitled' }
  | { kind: 'deferred' }
  | { kind: 'open'; engine: 's1' | 'aeon'; ref: string };

/**
 * What focusing a sprite-doc tab has to do. No confirm among the cases: it is
 * already checked out (nothing), it is open in the background (check it out —
 * its content and history are still there, so RELOADING it would throw away
 * exactly what multi-document exists to keep), or it has never been opened
 * (load it into a fresh document).
 *
 * The "New Sprite…" tab is its own case: there is nothing on disk to load, and
 * its document may be checked out, parked, or (after the tab was closed once)
 * gone entirely — so the glue hands it to openSpriteDoc, which covers all three
 * without ever reaching a loader.
 *
 * DEFERRED is the fifth case, and it is about boot order. An s1 tab's ref is a
 * bare object id: editObjectArtCheckout resolves its art against the OPEN act's
 * ZONE, so with no act loaded there is nothing to resolve against and the
 * checkout can only fail. Session restore hits this every time it reopens an s1
 * sprite tab as the active tab — the level tabs are restored alongside it but
 * nothing has LOADED one yet — so it is the expected order of events, not an
 * error. Deferring means: touch no document, run no loader (hence toast
 * nothing), and let the next focus, after the user opens an act, do the real
 * checkout. Only a FIRST load defers; an already-open document needs nothing
 * from the act, so it still checks out (that is why this sits below `isOpen`).
 */
export function planSpriteDocActivation(input: {
  tabId: string;
  activeDocId: string;
  isOpen: boolean;
  classicActLoaded: boolean;
}): SpriteDocPlan {
  if (input.tabId === UNTITLED_SPRITE_TAB_ID) {
    return input.activeDocId === input.tabId ? { kind: 'none' } : { kind: 'untitled' };
  }
  const ref = parseSpriteDocTabId(input.tabId);
  if (!ref) return { kind: 'none' };
  if (input.activeDocId === input.tabId) return { kind: 'none' };
  if (input.isOpen) return { kind: 'checkout' };
  if (ref.engine === 's1' && !input.classicActLoaded) return { kind: 'deferred' };
  return { kind: 'open', engine: ref.engine, ref: ref.ref };
}

// IMPORT CYCLE: export-sprite statically imports the shell's tab-activation
// index (requestOpenTab, for the classic edit-art handoff), so this module must
// NOT statically import export-sprite back — it is pulled in by dynamic import()
// at call time. The type-only `typeof import` below is erased at compile time,
// so it adds no edge.
type SpriteModule = typeof import('../../components/sprite/export-sprite');
let spriteModuleImpl: SpriteModule | null = null;
/** Substitute the sprite loader/saver module (tests only) — avoids needing
 *  window.api + a real canvas to drive the activation flow. */
export function __setSpriteModuleForTest(m: Partial<SpriteModule> | null): void {
  spriteModuleImpl = m as SpriteModule | null;
}
function spriteModule(): Promise<SpriteModule> {
  return spriteModuleImpl
    ? Promise.resolve(spriteModuleImpl)
    : import('../../components/sprite/export-sprite');
}

// Sprite activations run ONE AT A TIME. The loaders write into whichever document
// is checked out when their awaits resolve, so two overlapping loads would splice
// one sprite's pixels (and its save-back target) into the other's document — a
// later Ctrl+S would then write sprite A's art from sprite B's tab. The level
// path can cancel a superseded flow mid-await because openAct is a single
// synchronous commit at the end; a sprite load has no such seam, so it is
// serialized instead of cancelled.
let spriteActivations: Promise<unknown> = Promise.resolve();

/**
 * Check out (or first load) a sprite-doc tab's document. Resolves true when the
 * tab may take focus (false = load failed / superseded).
 *
 * NOTE for callers that gate on the result: false means "this tab has no
 * document". That is a reason not to FOCUS it; it is never a reason to keep a
 * tab the user asked to CLOSE — see requestCloseTab.
 */
export function activateSpriteDocTarget(tabId: string): Promise<boolean> {
  const run = spriteActivations.then(() => runSpriteActivation(tabId), () => runSpriteActivation(tabId));
  spriteActivations = run.catch(() => undefined);
  return run;
}

async function runSpriteActivation(tabId: string): Promise<boolean> {
  const myGen = beginActivation();
  const store = useSpriteStore.getState();
  const plan = planSpriteDocActivation({
    tabId,
    activeDocId: store.activeDocId,
    isOpen: store.isOpen(tabId),
    classicActLoaded: useClassicLevelStore.getState().ref !== null,
  });
  if (plan.kind === 'none') return true;
  if (plan.kind === 'deferred') {
    // TRUE on purpose: the tab is legitimate and keeps its place in the strip —
    // it just has no document yet. App renders a sprite-doc tab whose id is not
    // the checked-out doc id as an inert "waiting for a level" pane, so nothing
    // pretends the blank untitled canvas is this object's art.
    return true;
  }
  if (plan.kind === 'checkout') {
    activateSpriteDoc(tabId); // synchronous state swap — nothing to supersede
    return true;
  }
  if (plan.kind === 'untitled') {
    // openSpriteDoc covers every state the untitled document can be in: parked
    // (checked out again, pixels and history intact) or absent, because the tab
    // was closed earlier and closeSpriteDoc dropped it (a fresh blank document).
    // Synchronous, so nothing can supersede it.
    openSpriteDoc(tabId, { width: DEFAULT_FRAME_SIZE, height: DEFAULT_FRAME_SIZE });
    return true;
  }

  // First open: park the outgoing document and check out a fresh one for THIS
  // tab, so everything the loader writes below lands in this tab's document (and
  // on this tab's undo stack). The size is provisional — the loader replaces the
  // frames wholesale.
  const previousDocId = store.activeDocId;
  openSpriteDoc(tabId, { width: DEFAULT_FRAME_SIZE, height: DEFAULT_FRAME_SIZE });

  const { loadSpriteByName, editObjectArtCheckout } = await spriteModule();
  let loaded = false;
  try {
    // Both loaders swallow their own failures into a toast and resolve, so the
    // returned boolean — not "it didn't throw" — is what decides whether this tab
    // has a document. Assuming success here opened the tab onto the blank 32×32
    // placeholder document instead of taking the rollback below.
    loaded = plan.engine === 'aeon'
      ? await loadSpriteByName(plan.ref)
      : await editObjectArtCheckout(Number(plan.ref));
  } catch {
    loaded = false; // loadSpriteByName rejected — stay put
  }
  if (!loaded) {
    // Nothing was loaded, so this tab has no document — drop the empty one and
    // put the user back on the document they were looking at, rather than
    // stranding them on a blank canvas that belongs to a tab they never reached.
    closeSpriteDoc(tabId);
    if (useSpriteStore.getState().activeDocId !== previousDocId) activateSpriteDoc(previousDocId);
    return false;
  }
  // Superseded by a LEVEL activation while the load was in flight: the document
  // itself is fine (it is this tab's own), but the user has moved on, so the tab
  // must not steal focus.
  return isCurrentActivation(myGen);
}

/**
 * Ask what to do about a sprite document that is about to be CLOSED with unsaved
 * edits — the one sprite path that genuinely destroys work now that switching
 * parks instead of discarding. Resolves true when the close may proceed.
 *
 * Save is offered only when the document has an in-place art target to write
 * back to (an S1 object checkout). A document without one has no destination —
 * persisting it means Export in the sprite UI, with a name and animation steps
 * to choose — so a Save button here would be a promise the dialog can't keep.
 *
 * NOT re-exported by the tab-activation index, deliberately: closing a tab goes
 * through requestCloseTab, which is what runs this. A second public door onto a
 * confirm dialog is a door that gets used without the close behind it.
 */
export async function confirmCloseSpriteDoc(docId: string): Promise<boolean> {
  const doc = spriteDocState(docId);
  if (!doc || !doc.unsavedEdits) return true; // nothing to lose
  const canSave = doc.s1ArtSource !== null;

  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved sprite edits',
    body: canSave
      ? 'Closing this sprite tab discards its unsaved edits and undo history.'
      : 'Closing this sprite tab discards its unsaved edits and undo history. '
        + 'This sprite has no save-back file — export it from the sprite editor to keep the edits.',
    buttons: [
      ...(canSave ? [{ key: 'save', label: 'Save & close', tone: 'primary' as const }] : []),
      { key: 'discard', label: 'Discard & close', tone: 'danger' as const },
      { key: 'cancel', label: 'Cancel' },
    ],
  });

  if (answer === 'save') {
    const { saveSpriteDocArt } = await spriteModule();
    await saveSpriteDocArt(docId);
    // The savers encode failure as a toast, not a rejection, so the honest gate
    // is to re-read the flag (same pattern as the project-open guard): still
    // dirty ⇒ the save failed, and closing would destroy what it was meant to
    // protect. Abort and say so — a silent abort looks like a dead button.
    if (spriteDocState(docId)?.unsavedEdits) {
      useToastStore.getState().addToast(
        'Close cancelled — the sprite art could not be saved.', 'error');
      return false;
    }
    return true;
  }
  return answer === 'discard';
}
