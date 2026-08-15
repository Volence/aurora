// EVERY tab open/focus flows through requestOpenTab/requestFocusTabId, so the
// three activation systems below live here and cannot be bypassed:
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
//   3. CANVAS-DOC activation (planCanvasDocActivation + activateCanvasDocTarget):
//      same multi-document shape as (2), with the difference that a canvas tab
//      id is STABLE ACROSS SESSIONS — it names a file — so the first focus is
//      usually a disk read. Closing confirms through confirmCloseCanvasDoc,
//      which is what puts something behind the unsaved dot on a canvas tab.
//      A read that FAILS blocks the tab from being created, but never blocks an
//      existing tab from being focused — see requestOpenTab (R17(2)).
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
import { openEngine, openProjectDir } from '../state/open-project';
import { useViewStore } from '../state/viewStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveClassicProject, type SaveClassicProjectResult } from '../state/classic-save';
import {
  useSpriteStore, openSpriteDoc, activateSpriteDoc, closeSpriteDoc,
  dirtySpriteDocIds, spriteDocState, DEFAULT_FRAME_SIZE,
} from '../state/spriteStore';
import {
  useCanvasStore, loadCanvasDoc, activateCanvasDoc, clearCanvasFocus, closeCanvasDoc,
} from '../state/canvasStore';
import { loadCanvasFile, type LoadedCanvas } from '../state/canvas-file';
import { saveCanvasDocument } from '../state/canvas-save';
import { documentHistoryHub } from '../state/history-hub';
import {
  parseLevelTabId, parseSpriteDocTabId, isSpriteDocTabId, zoneArtDocId, levelDocId,
  parseCanvasDocTabId, isCanvasDocTabId,
  UNTITLED_SPRITE_TAB_ID,
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
  const myGen = ++activationGen;
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
  return myGen === activationGen;
}

// --- Canvas-doc activation -------------------------------------------------
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
// The pane (Task 12) derives its document from the ACTIVE TAB ID and treats
// `activeDocId` as a mirror to validate against; nothing here asks it to trust
// `activeDocId` alone.

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
type CanvasActivation = 'focused' | 'failed' | 'superseded';

async function runCanvasActivation(
  tabId: string,
  loader: CanvasLoader,
): Promise<CanvasActivation> {
  // Bumped BEFORE the plan, so even the synchronous 'activate' branch supersedes
  // whatever was in flight — including an open classic dirty-switch confirm,
  // which will then answer false and skip its openAct. That is deliberate (the
  // user moved to another tab, so the switch they were being asked about is
  // stale) and it is what runSpriteActivation has always done; noted because it
  // widens what can cancel a level switch, and nothing tests that interaction.
  const myGen = ++activationGen;
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
    useToastStore.getState().addToast(
      `Could not open the canvas "${plan.name}": ${e instanceof Error ? e.message : String(e)}`,
      'error');
    return 'failed';
  }

  // SUPERSEDED while the read was in flight: the user has moved on. Discard the
  // bytes rather than install them — installing focuses the document
  // (loadCanvasDoc is the first-load path and always focuses), which would point
  // the pane at this canvas while another tab is active. The cost is one
  // re-read on the next focus; the alternative is a second "restore the focus
  // someone else set" path, which is the stale-pane bug wearing a repair kit.
  if (myGen !== activationGen) return 'superseded';

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
 */
async function focusCanvasForTab(tab: TabDescriptor): Promise<CanvasActivation> {
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

function classicOpenAct(zone: string, act: number, opts?: { skipViewSnapshot?: boolean }): boolean {
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
  // Per-tab viewport, same as the aeon branch (spec §10) — possible only since
  // classic's camera stopped being a component-local ref. Snapshot the OUTGOING
  // act, then restore the INCOMING one.
  //
  // The restore is a plain viewStore write: the classic viewport adopts external
  // camera writes, so this repositions it without reaching into the component.
  // Its fit-to-height on load defers to a remembered viewport, which is what
  // keeps this from being overwritten a moment later when the doc goes ready.
  const outgoing = useClassicLevelStore.getState().ref;
  if (!opts?.skipViewSnapshot && outgoing) {
    const v = useViewStore.getState();
    useWorkspaceStore.getState().setView(
      levelDocId(outgoing.zone, String(outgoing.act)),
      { x: v.vpX, y: v.vpY, zoom: v.zoom });
  }
  void useClassicLevelStore.getState().openAct(target);
  const view = useWorkspaceStore.getState().viewFor(levelDocId(zone, String(act)));
  if (view) useViewStore.getState().setViewport(view.x, view.y, view.zoom);
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
      // THE ACT MUST EXIST. This is classicOpenAct's zoneTree lookup, which the
      // aeon branch never had — so `level:<zone>:<act>` in the tab strip was
      // taken as authoritative, setCurrentAct wrote an id nothing resolves, and
      // useActTabSync (shell/session-lifecycle.ts) dutifully opened a tab titled
      // for it. getCurrentAct then answers null, so the tab hosts an editor with
      // no act behind it: a level tab that can never load.
      //
      // The reachable route is not the debug hook it was found with. A level tab
      // survives a SAME-DIRECTORY re-open (Home recents / Open Project… on the
      // project already open) because session-lifecycle's prune is keyed on
      // config.basePath and early-returns when the key has not changed. Delete or
      // rename an act in project.json, re-open the project in the live window,
      // and its stale tab is still in the strip — one click away from here.
      //
      // Checked against config.zones[].acts[], the MANIFEST, which openLoaded
      // commits atomically with the project — not against loaded act data. So a
      // valid act whose data is still in flight (the boot-restore dispatch)
      // passes, as it must.
      const zoneCfg = useProjectStore.getState().config?.zones.find((z) => z.id === plan.zone);
      if (!zoneCfg || !zoneCfg.acts.some((a) => a.id === plan.act)) {
        useToastStore.getState().addToast(
          `Level not found in this project (${plan.zone} ${plan.act})`, 'error');
        // FALSE, not a 'none' plan: 'none' resolves true, and requestOpenTab
        // opens the tab on a true resolution — which is the tab this exists to
        // prevent.
        return false;
      }
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
      // Same skipViewSnapshot reasoning as the aeon branch above: on the BOOT
      // restore there is no user-viewed outgoing act to snapshot, only the
      // loader's default, and snapshotting it would clobber the record.
      return classicOpenAct(plan.zone, plan.act, opts);
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
      return classicOpenAct(plan.zone, plan.act, opts);
    }
  }
}

/**
 * Open (or focus) a tab, running the level/sprite-doc/canvas activation guard
 * first. The canvas step runs for EVERY tab kind — see focusCanvasForTab: a tab
 * that is not a canvas has to CLEAR the canvas focus.
 *
 * This is every focus change FROM THE TAB STRIP (plus ⌘K and Ctrl+1..9, which
 * route through requestFocusTabId/requestFocusIndex). It is NOT every focus
 * change in the app: two paths deliberately call `useSessionStore.open`/
 * `replace` directly and are not covered here —
 *
 *   • useActTabSync (session-lifecycle.ts) opens the tab for an act the STORES
 *     switched to, which is how the MCP/agent surface, __dbg.openAct and
 *     aeon-open move the user. An agent-driven act switch therefore focuses a
 *     level tab WITHOUT clearing the canvas focus.
 *   • The restore effect calls replace(next) and hand-dispatches activation for
 *     sprite and level ids only.
 *
 * Both are bounded today (nothing renders a canvas pane yet), but Task 12 must
 * not read this function as a funnel it can rely on.
 */
export async function requestOpenTab(tab: TabDescriptor): Promise<void> {
  if (tab.kind === 'level' && !(await activateLevelTarget(tab.id))) return;
  if (tab.kind === 'sprite-doc' && !(await activateSpriteDocTarget(tab.id))) return;
  const canvas = await focusCanvasForTab(tab);
  // A SUPERSEDED read always stops here: the user has moved to another tab
  // while this one's file was being read, and opening now would drag the focus
  // back to a tab they left.
  if (canvas === 'superseded') return;
  // A FAILED read stops here only when this tab is NOT already in the strip.
  //
  // R17(2), decided in Task 12. The two situations are genuinely different:
  //
  //   • The tab does not exist yet (an Explorer click, ⌘K, the create flow).
  //     Refusing to open it is right — the toast carries the decoder's own
  //     message, and a dead tab is debris the user then has to clean up.
  //
  //   • The tab is already open (its file was deleted, moved or made
  //     unreadable since; or a restore reopened it — Task 13). Refusing FOCUS
  //     makes a tab the user can see, cannot select, and gets a fresh toast
  //     from on every click: the strip appears frozen on that tab. The pane
  //     renders an honest "could not be loaded" card instead
  //     (canvasPaneState → CanvasDocUnloaded), with Retry and the file path.
  //
  // This is the rule requestCloseTab already states for the sprite path in
  // another form: a document that will not load is a reason not to CREATE or
  // to REDRAW a tab, never a reason to make an existing one unusable.
  if (canvas === 'failed') {
    if (!useSessionStore.getState().tabs.some((t) => t.id === tab.id)) return;
    // The tab is about to be focused with no document behind it, so no canvas
    // is showing — say so. Without this the mirror keeps naming whichever canvas
    // was focused before, which is the stale-mirror state R14 spent a whole
    // section on; the pane already refuses to draw it (it compares against the
    // TAB), but leaving the two disagreeing is how the next consumer inherits
    // the bug. The clear lives here rather than in the activation itself because
    // there it would also fire for a failed load that is NOT taking focus, and
    // that one must leave the visible document alone.
    clearCanvasFocus();
  }
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
 * stack goes with its document (closeSpriteDoc), and a canvas doc's likewise
 * (closeCanvasDoc). A level tab disposes only its OWN layout document: the
 * zone-art document is shared by every act tab of that zone, so it survives
 * until the last of them closes — otherwise closing act 1 would silently throw
 * away undo for art edits still visible in act 2.
 */
function disposeStacksForClosedTab(id: string): void {
  if (isSpriteDocTabId(id)) { closeSpriteDoc(id); return; }
  // Runs AFTER the close confirm in requestCloseTab, so by here the user has
  // either saved or chosen to discard. closeCanvasDoc disposes the stack itself
  // — including for a tab whose document never loaded.
  if (isCanvasDocTabId(id)) { closeCanvasDoc(id); return; }
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
 * must pass the same activation gate as a click on it — on cancel the close is
 * abandoned and the tab stays. Closing an inactive tab never changes the active
 * document and closes directly.
 *
 * The promoted-tab gate is asymmetric, deliberately:
 *
 *   LEVEL promotion CAN veto — activateLevelTarget's false means the user hit
 *   Cancel in the "unsaved changes in this act" confirm, i.e. "don't switch",
 *   and switching is exactly what closing this tab would force.
 *
 *   SPRITE-DOC promotion CANNOT veto. Its false means the neighbour's document
 *   failed to load, which says nothing about the tab being closed. Letting it
 *   veto is what wedged the strip: two restored s1 sprite tabs, neither able to
 *   check out with no act loaded, each vetoing the other's close and re-toasting
 *   on every attempt. A tab must be closable whatever state its document is in,
 *   so the promotion runs for its effect only and the close proceeds regardless.
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
  // Same for a canvas tab, and for the same reason: the document dies with the
  // tab (disposeStacksForClosedTab below), so this is what the unsaved dot on a
  // canvas tab means. Without it the dot is a warning with nothing behind it.
  if (isCanvasDocTabId(id) && !(await confirmCloseCanvasDoc(id))) return;

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
  // Runs BEFORE the close (so the promoted tab never renders for a frame holding
  // someone else's document) but its result is discarded — see the asymmetry
  // note above.
  if (promoted && promoted.kind === 'sprite-doc') await activateSpriteDocTarget(promoted.id);
  // The canvas side of that same promotion, and it runs for EVERY promoted kind:
  // this is a focus change (session.close moves the active tab), so a promoted
  // canvas tab must check its document out and a promoted LEVEL tab must clear
  // the canvas focus. Result discarded for the sprite reason — a neighbour whose
  // file will not load is no argument for keeping the tab the user is closing.
  if (promoted) await focusCanvasForTab(promoted);
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
