// Classic LEVEL activation (planLevelActivation + activateLevelTarget).
//
// classicLevelStore.openAct resets doc + dirty + undo history, so switching away
// from a dirty classic act must confirm first (Save & switch / Discard / Cancel).
// Aeon act switches are pointer moves over the resident S4Project — always safe.
//
// The planner is the pure, tested decision; activateLevelTarget is the glue.

import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useProjectStore } from '../../state/projectStore';
import { openEngine } from '../../state/open-project';
import { useViewStore } from '../../state/viewStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { saveClassicProject, type SaveClassicProjectResult } from '../../state/classic-save';
import { parseLevelTabId, levelDocId } from '../tabs';
import { beginActivation, isCurrentActivation } from './generation';

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
  const myGen = beginActivation();
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
      if (!isCurrentActivation(myGen)) return false; // superseded while the dialog was open
      if (answer === 'save') {
        const result = await saveImpl();
        if (!isCurrentActivation(myGen)) return false; // superseded while the save was in flight
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
