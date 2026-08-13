// EVERY tab open/focus flows through requestOpenTab/requestFocusTabId so the
// classic dirty-switch guard cannot be bypassed: classicLevelStore.openAct
// resets doc + dirty + undo history, so switching away from a dirty classic act
// must confirm first (Save & switch / Discard / Cancel). Aeon act switches are
// pointer moves over the resident S4Project — always safe. planLevelActivation
// is the pure, tested decision; the exported request* functions are glue.

import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveClassicProject, type SaveClassicProjectResult } from '../state/classic-save';
import { parseLevelTabId } from './tabs';
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
export async function activateLevelTarget(tabId: string): Promise<boolean> {
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
      useProjectStore.getState().setCurrentAct(plan.zone, plan.act);
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

/** Open (or focus) a tab, running the level-activation guard first. */
export async function requestOpenTab(tab: TabDescriptor): Promise<void> {
  if (tab.kind === 'level' && !(await activateLevelTarget(tab.id))) return;
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
  const session = useSessionStore.getState();
  if (session.activeId !== id) { session.close(id); return; }
  const idx = session.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const remaining = session.tabs.filter((t) => t.id !== id);
  const promoted = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
  if (promoted && promoted.kind === 'level' && !(await activateLevelTarget(promoted.id))) return;
  useSessionStore.getState().close(id);
}

/** Ctrl+1..9 — 1-based over the whole strip (1 = Home). */
export async function requestFocusIndex(oneBased: number): Promise<void> {
  const tab = useSessionStore.getState().tabs[oneBased - 1];
  if (tab) await requestOpenTab(tab);
}
