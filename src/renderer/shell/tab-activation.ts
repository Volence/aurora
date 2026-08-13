// EVERY tab open/focus flows through requestOpenTab/requestFocusTabId, so TWO
// dirty-switch guard systems live here and cannot be bypassed:
//
//   1. Classic LEVEL activation (planLevelActivation + activateLevelTarget):
//      classicLevelStore.openAct resets doc + dirty + undo history, so switching
//      away from a dirty classic act must confirm first (Save & switch / Discard
//      / Cancel). Aeon act switches are pointer moves over the resident
//      S4Project — always safe.
//
//   2. SPRITE-DOC activation (planSpriteDocActivation + activateSpriteDocTarget):
//      each sprite-doc tab owns a document, so focusing one CHECKS IT OUT and
//      parks the outgoing one — a switch discards nothing and asks nothing. The
//      only sprite path that still destroys work is CLOSING a tab, so that is
//      where the confirm now lives (confirmCloseSpriteDoc — Save / Discard /
//      Cancel).
//
// Each planner is the pure, tested decision; the exported request*/activate*
// functions are the glue.
//
// Tab close is also where per-document undo stacks are DISPOSED (spec §4.1): a
// closed document's stack is unreachable, and keeping it would both leak and let
// a reopened tab inherit the history of a document the user already threw away.

import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { openEngine } from '../state/open-project';
import { useViewStore } from '../state/viewStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveClassicProject, type SaveClassicProjectResult } from '../state/classic-save';
import {
  useSpriteStore, openSpriteDoc, activateSpriteDoc, closeSpriteDoc,
  dirtySpriteDocIds, spriteDocState, DEFAULT_FRAME_SIZE,
} from '../state/spriteStore';
import { documentHistoryHub } from '../state/history-hub';
import {
  parseLevelTabId, parseSpriteDocTabId, isSpriteDocTabId, zoneArtDocId, UNTITLED_SPRITE_TAB_ID,
} from './tabs';
import { HOME_TAB, type TabDescriptor } from '../../core/shell/session';

// The save call is behind a seam (mirrors the retired save router's convention) so the
// save-failure path is unit-testable without driving a real guarded write.
type Saver = () => Promise<SaveClassicProjectResult>;
let saveImpl: Saver = saveClassicProject;

/** Substitute the classic save call (tests only). */
export function __setActivationSaveForTest(fn: Saver): void { saveImpl = fn; }
/** Restore the real save call (tests only). */
export function __resetActivationSaveForTest(): void { saveImpl = saveClassicProject; }

// saveClassicProject NEVER rejects — every failure mode (conflict/partial/error)
// is encoded in the returned variant (see classic-save.ts). Only 'saved' and
// 'nothing' (nothing was dirty) mean it's safe to proceed to openAct, which
// resets doc+dirty+undo — a failed save must NOT fall through to that, or the
// edits the user clicked "Save & switch" to protect are destroyed.
function isSaveSuccess(r: SaveClassicProjectResult): boolean {
  return r.kind === 'saved' || r.kind === 'nothing';
}

// One activation flow completes at a time: a newer call bumps this counter, so
// an older flow that was awaiting a confirm answer or a save aborts instead of
// racing its openAct in after the user's newer choice already landed.
let activationGen = 0;

export type ActivationPlan =
  | { kind: 'none' }
  | { kind: 'aeon-switch'; zone: string; act: string }
  | { kind: 'classic-open'; zone: string; act: number }
  | { kind: 'classic-confirm'; zone: string; act: number };

export function planLevelActivation(input: {
  tabId: string;
  engine: 's1' | 'aeon' | null;
  classicLoadedRef: { zone: string; act: number } | null;
  classicDirty: boolean;
}): ActivationPlan {
  const ref = parseLevelTabId(input.tabId);
  if (!ref || input.engine === null) return { kind: 'none' };
  if (input.engine === 'aeon') return { kind: 'aeon-switch', zone: ref.zone, act: ref.act };
  const act = Number(ref.act);
  if (!Number.isInteger(act)) return { kind: 'none' };
  const loaded = input.classicLoadedRef;
  if (loaded && loaded.zone === ref.zone && loaded.act === act) return { kind: 'none' };
  if (loaded && input.classicDirty) return { kind: 'classic-confirm', zone: ref.zone, act };
  return { kind: 'classic-open', zone: ref.zone, act };
}

// --- Sprite-doc activation -------------------------------------------------
//
// MULTI-DOCUMENT (spec §4.4): every sprite-doc tab owns a document in
// spriteStore plus an undo stack on the hub, both keyed by the tab id. The
// sprite editor still has ONE mounting point, but focusing a tab now CHECKS OUT
// its document and PARKS the outgoing one whole — pixels, palette, save-back
// target, dirty flag and undo stack all survive in the background. So a tab
// switch discards nothing and asks nothing; only a CLOSE discards, and that
// confirm lives in requestCloseTab.
//
// `spriteStore.activeDocId` IS the loaded-doc marker (it is what recordEdit
// records against), so there is no second copy to drift out of sync.

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
 */
export function planSpriteDocActivation(input: {
  tabId: string;
  activeDocId: string;
  isOpen: boolean;
}): SpriteDocPlan {
  if (input.tabId === UNTITLED_SPRITE_TAB_ID) {
    return input.activeDocId === input.tabId ? { kind: 'none' } : { kind: 'untitled' };
  }
  const ref = parseSpriteDocTabId(input.tabId);
  if (!ref) return { kind: 'none' };
  if (input.activeDocId === input.tabId) return { kind: 'none' };
  if (input.isOpen) return { kind: 'checkout' };
  return { kind: 'open', engine: ref.engine, ref: ref.ref };
}

// IMPORT CYCLE: export-sprite statically imports this module (requestOpenTab, for
// the classic edit-art handoff), so this module must NOT statically import
// export-sprite back — it is pulled in by dynamic import() at call time. The
// type-only `typeof import` below is erased at compile time, so it adds no edge.
type SpriteModule = typeof import('../components/sprite/export-sprite');
let spriteModuleImpl: SpriteModule | null = null;
/** Substitute the sprite loader/saver module (tests only) — avoids needing
 *  window.api + a real canvas to drive the activation flow. */
export function __setSpriteModuleForTest(m: Partial<SpriteModule> | null): void {
  spriteModuleImpl = m as SpriteModule | null;
}
function spriteModule(): Promise<SpriteModule> {
  return spriteModuleImpl
    ? Promise.resolve(spriteModuleImpl)
    : import('../components/sprite/export-sprite');
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
 */
export function activateSpriteDocTarget(tabId: string): Promise<boolean> {
  const run = spriteActivations.then(() => runSpriteActivation(tabId), () => runSpriteActivation(tabId));
  spriteActivations = run.catch(() => undefined);
  return run;
}

async function runSpriteActivation(tabId: string): Promise<boolean> {
  const myGen = ++activationGen;
  const store = useSpriteStore.getState();
  const plan = planSpriteDocActivation({
    tabId,
    activeDocId: store.activeDocId,
    isOpen: store.isOpen(tabId),
  });
  if (plan.kind === 'none') return true;
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
  return myGen === activationGen;
}

function classicOpenAct(zone: string, act: number): boolean {
  const target = useClassicProjectStore.getState().zoneTree
    .find((r) => r.zone === zone && r.act === act);
  if (!target) {
    useToastStore.getState().addToast(`Level not found in this project (${zone} act ${act})`, 'error');
    return false;
  }
  if (!target.available) {
    useToastStore.getState().addToast(
      `${target.label} is unavailable: ${target.reason ?? 'missing files'}`, 'error');
    return false;
  }
  void useClassicLevelStore.getState().openAct(target);
  return true;
}

/**
 * Point the singleton editor at a level tab's target. Resolves true when the
 * tab may take focus (false = user cancelled / target unavailable).
 */
export async function activateLevelTarget(
  tabId: string,
  opts?: { skipViewSnapshot?: boolean },
): Promise<boolean> {
  const myGen = ++activationGen;
  const classic = useClassicLevelStore.getState();
  const plan = planLevelActivation({
    tabId,
    engine: openEngine(),
    classicLoadedRef: classic.ref ? { zone: classic.ref.zone, act: classic.ref.act } : null,
    classicDirty: Object.values(classic.dirty).some(Boolean),
  });
  switch (plan.kind) {
    case 'none':
      return true;
    case 'aeon-switch': {
      // Snapshot the OUTGOING act's viewport into its record, then restore the
      // INCOMING act's (spec §10: viewport persists per tab). Runs entirely
      // synchronously around the act switch.
      //
      // The snapshot only makes sense for a USER-initiated switch, where the
      // outgoing act is the one the user was actually viewing (live viewStore =
      // that act's state). On the BOOT-restore dispatch, session-lifecycle passes
      // skipViewSnapshot: the "outgoing" act is merely the loader's default
      // (setCurrentAct(zones[0].acts[0]) ran before this dispatch) and viewStore
      // still holds its fresh default, NOT user state — snapshotting it would
      // clobber that act's just-seeded viewport in the record (and the workspace
      // subscription would persist the clobbered value). The restore branch below
      // still runs so the target act's seeded viewport is applied.
      if (!opts?.skipViewSnapshot) {
        const prev = useProjectStore.getState();
        if (prev.currentZoneId && prev.currentActId) {
          const v = useViewStore.getState();
          useWorkspaceStore.getState().setView(
            `level:${prev.currentZoneId}:${prev.currentActId}`,
            { x: v.vpX, y: v.vpY, zoom: v.zoom });
        }
      }
      useProjectStore.getState().setCurrentAct(plan.zone, plan.act);
      const view = useWorkspaceStore.getState().viewFor(tabId);
      if (view) useViewStore.getState().setViewport(view.x, view.y, view.zoom);
      return true;
    }
    case 'classic-open':
      return classicOpenAct(plan.zone, plan.act);
    case 'classic-confirm': {
      const loadedLabel = classic.ref?.label ?? 'the current act';
      const answer = await useConfirmStore.getState().ask({
        title: `Unsaved changes in ${loadedLabel}`,
        body: 'Switching acts reloads from disk and discards unsaved edits and undo history.',
        buttons: [
          { key: 'save', label: 'Save & switch', tone: 'primary' },
          { key: 'discard', label: 'Discard & switch', tone: 'danger' },
          { key: 'cancel', label: 'Cancel' },
        ],
      });
      if (myGen !== activationGen) return false; // superseded while the dialog was open
      if (answer === 'save') {
        const result = await saveImpl();
        if (myGen !== activationGen) return false; // superseded while the save was in flight
        // The save layer already toasted the failure — don't duplicate it here,
        // just stop before openAct discards the edits it was trying to protect.
        if (!isSaveSuccess(result)) return false;
      } else if (answer !== 'discard') {
        return false; // 'cancel' (or any unrecognized key, treated as cancel)
      }
      return classicOpenAct(plan.zone, plan.act);
    }
  }
}

/** Open (or focus) a tab, running the level/sprite-doc activation guard first. */
export async function requestOpenTab(tab: TabDescriptor): Promise<void> {
  if (tab.kind === 'level' && !(await activateLevelTarget(tab.id))) return;
  if (tab.kind === 'sprite-doc' && !(await activateSpriteDocTarget(tab.id))) return;
  useSessionStore.getState().open(tab);
}

/** Focus an already-open tab by id (tab strip click, ⌘K "go to tab"). */
export async function requestFocusTabId(id: string): Promise<void> {
  const tab = useSessionStore.getState().tabs.find((t) => t.id === id);
  if (tab) await requestOpenTab(tab);
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
 */
async function confirmCloseSpriteDoc(docId: string): Promise<boolean> {
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

/**
 * Drop the undo stacks a closed tab leaves unreachable (Task 11). A sprite doc's
 * stack goes with its document (closeSpriteDoc). A level tab disposes only its
 * OWN layout document: the zone-art document is shared by every act tab of that
 * zone, so it survives until the last of them closes — otherwise closing act 1
 * would silently throw away undo for art edits still visible in act 2.
 */
function disposeStacksForClosedTab(id: string): void {
  if (isSpriteDocTabId(id)) { closeSpriteDoc(id); return; }
  const level = parseLevelTabId(id);
  if (!level) return;
  documentHistoryHub.dispose(id);
  const zoneStillOpen = useSessionStore.getState().tabs.some((t) => {
    const other = parseLevelTabId(t.id);
    return other !== null && other.zone === level.zone;
  });
  if (!zoneStillOpen) documentHistoryHub.dispose(zoneArtDocId(level.zone));
}

/**
 * Close a tab through the activation guard: closing the ACTIVE tab promotes a
 * neighbor (core closeTab picks right-then-left), so the promoted level tab
 * must pass the same activation gate as a click on it — on cancel/failed
 * activation the close is abandoned and the tab stays. Closing an inactive
 * tab never changes the active document and closes directly.
 */
export async function requestCloseTab(id: string): Promise<void> {
  // Home is uncloseable (core closeTab no-ops on it) — bail before the
  // activation guard so a future non-TabStrip caller can't run it either.
  if (id === HOME_TAB.id) return;

  // Closing a sprite-doc tab discards its document — whether it is the checked-out
  // one or a parked background one — so every sprite-doc close is confirmed when
  // it has unsaved edits. Runs BEFORE neighbor-promotion so a promoted level tab
  // isn't blocked by a now-stale sprite prompt.
  if (isSpriteDocTabId(id) && !(await confirmCloseSpriteDoc(id))) return;

  const session = useSessionStore.getState();
  if (session.activeId !== id) {
    session.close(id);
    disposeStacksForClosedTab(id);
    return;
  }
  const idx = session.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const remaining = session.tabs.filter((t) => t.id !== id);
  const promoted = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
  if (promoted && promoted.kind === 'level' && !(await activateLevelTarget(promoted.id))) return;
  if (promoted && promoted.kind === 'sprite-doc' && !(await activateSpriteDocTarget(promoted.id))) return;
  useSessionStore.getState().close(id);
  // AFTER the session close: disposeStacksForClosedTab reads the surviving tabs
  // to decide whether the zone-art document still has an owner.
  disposeStacksForClosedTab(id);
}

/** Ctrl+1..9 — 1-based over the whole strip (1 = Home). */
export async function requestFocusIndex(oneBased: number): Promise<void> {
  const tab = useSessionStore.getState().tabs[oneBased - 1];
  if (tab) await requestOpenTab(tab);
}
