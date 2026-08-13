// EVERY tab open/focus flows through requestOpenTab/requestFocusTabId, so TWO
// dirty-switch guard systems live here and cannot be bypassed:
//
//   1. Classic LEVEL activation (planLevelActivation + activateLevelTarget):
//      classicLevelStore.openAct resets doc + dirty + undo history, so switching
//      away from a dirty classic act must confirm first (Save & switch / Discard
//      / Cancel). Aeon act switches are pointer moves over the resident
//      S4Project — always safe.
//
//   2. SPRITE-DOC activation (planSpriteDocActivation + activateSpriteDocTarget,
//      plus the loaded-doc marker markSpriteDocLoaded/getLoadedSpriteDocId):
//      the sprite editor is a singleton, so retargeting it discards the current
//      sprite's edits + undo history; a dirty retarget must confirm first
//      (Discard & open / Cancel — confirmDiscardSpriteEdits).
//
// Each planner is the pure, tested decision; the exported request*/activate*
// functions are the glue. The shared confirm copy lives in
// confirmDiscardSpriteEdits so the edit-art wrapper shows the identical dialog.

import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveClassicProject, type SaveClassicProjectResult } from '../state/classic-save';
import { useSpriteStore, spriteHistory } from '../state/spriteStore';
import { parseLevelTabId, parseSpriteDocTabId } from './tabs';
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

function currentEngine(): 's1' | 'aeon' | null {
  if (useClassicProjectStore.getState().status === 'open') return 's1';
  if (useProjectStore.getState().project !== null) return 'aeon';
  return null;
}

// --- Sprite-doc activation -------------------------------------------------
//
// The sprite editor has ONE mounting point (an App-level pane rendered only
// while a sprite-doc tab is active). Only one sprite is loaded at a time, so
// focusing a different sprite-doc tab RETARGETS that single editor — which
// discards the current sprite's edits + undo history (loadSprite clears both).
// loadedSpriteDocId tracks which sprite the editor currently shows so a re-focus
// of the same doc no-ops instead of reloading.

let loadedSpriteDocId: string | null = null;
export function markSpriteDocLoaded(id: string | null): void { loadedSpriteDocId = id; }
export function getLoadedSpriteDocId(): string | null { return loadedSpriteDocId; }

export function spriteEditorDirty(): boolean {
  // Honest dirtiness: TRUE only when the working sprite has edits not yet
  // persisted. recordEdit sets the flag; loadSprite/newSprite and a successful
  // save/export clear it. A bare checkout (s1ArtSource set, no edits) is NOT
  // dirty — that was the phantom-dirty bug where a freshly-opened, unedited S1
  // sprite dotted its tab and re-asked the discard dialog on every switch.
  return useSpriteStore.getState().unsavedEdits;
}

/**
 * Tear down the singleton sprite editor's loaded-doc state so nothing stale is
 * left behind when its doc is closed or discarded (the phantom-dirty ghost the
 * smoke test hit: a closed sprite tab whose checkout + history kept re-tripping
 * the discard dialog). Clears the loaded-doc marker, the save-back checkout, the
 * undo history, and the unsaved-edits flag.
 */
export function resetSpriteEditor(): void {
  markSpriteDocLoaded(null);
  useSpriteStore.getState().setS1ArtSource(null);
  spriteHistory.clear();
  useSpriteStore.getState().setUnsavedEdits(false);
}

/**
 * Ask whether to discard the loaded sprite's unsaved edits. Resolves true on
 * 'discard', false on cancel. The copy lives here so BOTH the sprite-doc
 * activation guard and the edit-art wrapper (export-sprite.editObjectArt) show
 * the identical dialog.
 */
export async function confirmDiscardSpriteEdits(): Promise<boolean> {
  const answer = await useConfirmStore.getState().ask({
    // Context-neutral copy: this dialog fronts BOTH a sprite retarget (open
    // another) and a sprite-doc CLOSE, so it can't say "Opening another sprite".
    title: 'Unsaved sprite edits',
    body: 'This discards unsaved sprite edits and undo history.',
    buttons: [
      { key: 'discard', label: 'Discard & open', tone: 'danger' },
      { key: 'cancel', label: 'Cancel' },
    ],
  });
  return answer === 'discard';
}

export type SpriteDocPlan =
  | { kind: 'none' }
  | { kind: 'open'; engine: 's1' | 'aeon'; ref: string }
  | { kind: 'confirm'; engine: 's1' | 'aeon'; ref: string };

export function planSpriteDocActivation(input: {
  tabId: string;
  loadedDocId: string | null;
  spriteDirty: boolean;
}): SpriteDocPlan {
  const ref = parseSpriteDocTabId(input.tabId);
  if (!ref) return { kind: 'none' };
  if (input.loadedDocId === input.tabId) return { kind: 'none' };
  return input.spriteDirty
    ? { kind: 'confirm', engine: ref.engine, ref: ref.ref }
    : { kind: 'open', engine: ref.engine, ref: ref.ref };
}

/**
 * Point the singleton sprite editor at a sprite-doc tab's target. Resolves true
 * when the tab may take focus (false = user cancelled / open failed). Shares the
 * module's activationGen counter with activateLevelTarget so a newer activation
 * of either kind supersedes an older one mid-await.
 *
 * IMPORT CYCLE: export-sprite statically imports this module (markSpriteDocLoaded
 * + requestOpenTab, for the classic edit-art handoff), so this module must NOT
 * statically import export-sprite back. The two sprite loaders are pulled in via
 * a dynamic import() at call time to break that cycle.
 */
export async function activateSpriteDocTarget(tabId: string): Promise<boolean> {
  const myGen = ++activationGen;
  const plan = planSpriteDocActivation({
    tabId,
    loadedDocId: loadedSpriteDocId,
    spriteDirty: spriteEditorDirty(),
  });
  if (plan.kind === 'none') return true;

  if (plan.kind === 'confirm') {
    const discard = await confirmDiscardSpriteEdits();
    if (myGen !== activationGen) return false; // superseded while the dialog was open
    if (!discard) return false; // cancelled
  }

  // Dynamic import breaks the export-sprite ↔ tab-activation cycle (see above).
  const { loadSpriteByName, editObjectArtCheckout } = await import('../components/sprite/export-sprite');
  if (myGen !== activationGen) return false; // superseded while the module loaded
  try {
    if (plan.engine === 'aeon') {
      await loadSpriteByName(plan.ref);
    } else if (!(await editObjectArtCheckout(Number(plan.ref)))) {
      return false; // checkout failed (a toast already fired) — leave the editor as-is
    }
  } catch {
    return false; // loadSpriteByName rejected — stay put
  }
  if (myGen !== activationGen) return false; // superseded while the load was in flight
  // Mark the loaded doc ONLY here, after the final gen check passes — for BOTH
  // engine branches. A superseded flow may still have mutated the sprite editor
  // via its loader (inherent: the loader IS the await), but it never reaches this
  // mark, so loadedSpriteDocId always reflects the newest WINNING activation; a
  // stale editor view self-heals on the next activation.
  markSpriteDocLoaded(tabId);
  return true;
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
    engine: currentEngine(),
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

  // Closing the tab whose sprite is loaded in the singleton editor must not leave
  // the editor state behind (the phantom-dirty ghost). If it has unsaved edits,
  // confirm the discard first (cancel → abort the close); then reset the editor.
  // Runs BEFORE neighbor-promotion so a promoted sprite-doc reloads cleanly and a
  // promoted level tab isn't blocked by a now-stale sprite prompt. A NON-loaded
  // sprite-doc tab (its sprite isn't in the editor) closes through the path below.
  if (parseSpriteDocTabId(id) !== null && id === getLoadedSpriteDocId()) {
    if (spriteEditorDirty() && !(await confirmDiscardSpriteEdits())) return;
    resetSpriteEditor();
  }

  const session = useSessionStore.getState();
  if (session.activeId !== id) { session.close(id); return; }
  const idx = session.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const remaining = session.tabs.filter((t) => t.id !== id);
  const promoted = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
  if (promoted && promoted.kind === 'level' && !(await activateLevelTarget(promoted.id))) return;
  if (promoted && promoted.kind === 'sprite-doc' && !(await activateSpriteDocTarget(promoted.id))) return;
  useSessionStore.getState().close(id);
}

/** Ctrl+1..9 — 1-based over the whole strip (1 = Home). */
export async function requestFocusIndex(oneBased: number): Promise<void> {
  const tab = useSessionStore.getState().tabs[oneBased - 1];
  if (tab) await requestOpenTab(tab);
}
