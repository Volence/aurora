// Guard for opening a project (path/dialog/recent) while ANY unsaved work is
// resident (stage-3 notes deferred gap #1: openPath previously reset stores with
// no confirm — silent data loss). planProjectOpen/currentOpenDirtySnapshot are
// the pure decision; confirmProjectOpen is the ask→save→re-snapshot GLUE,
// extracted here (rather than left inline in useProject.openPath) so the whole
// flow is unit-testable in this node-only suite without a React hook + jsdom.

import { useClassicLevelStore } from '../state/classicLevelStore';
import { useEditorStore } from '../state/editorStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveAllDirty } from '../state/project-runtime';
// anySpriteDocDirty is the SAME predicate the tab dots use; sharing it keeps the
// open-guard from being narrower than what the strip shows (finding 3), and it
// now covers PARKED sprite documents too — a background sprite tab's edits die
// with the project just as surely as the checked-out one's. closeAllSpriteDocs
// tears the whole sprite session down on a proceed (see below).
// No cycle: tab-activation does not import project-open-guard (this module is
// a leaf imported only by useProject/agent-handler).
import { anySpriteDocDirty, closeAllSpriteDocs } from './tab-activation';

export interface OpenDirtySnapshot {
  classicDirty: boolean;  // any classicLevelStore dirty domain
  aeonDirty: boolean;     // editorStore.dirty (aeon project-wide)
  // anySpriteDocDirty(): the honest unsavedEdits flag of every OPEN sprite
  // document. Was s1ArtSource-only, which both silently discarded an edited
  // aeon/new sprite on open (finding 3) AND phantom-blocked the open on a
  // freshly-opened, unedited checkout — the flag tracks actual unsaved edits, not
  // the checkout target.
  spriteDirty: boolean;
}

export type ProjectOpenPlan = { kind: 'proceed' } | { kind: 'confirm' };

export function planProjectOpen(s: OpenDirtySnapshot): ProjectOpenPlan {
  return s.classicDirty || s.aeonDirty || s.spriteDirty
    ? { kind: 'confirm' }
    : { kind: 'proceed' };
}

/** Live snapshot helper (kept beside the planner so the two stay in lockstep). */
export function currentOpenDirtySnapshot(): OpenDirtySnapshot {
  return {
    classicDirty: Object.values(useClassicLevelStore.getState().dirty).some(Boolean),
    aeonDirty: useEditorStore.getState().dirty,
    spriteDirty: anySpriteDocDirty(),
  };
}

// -- Injectable save call (test seam, mirroring tab-activation.ts's
// __setActivationSaveForTest convention) --
type SaveFn = () => Promise<unknown>;
let saveImpl: SaveFn = saveAllDirty;
/** Substitute the save call (tests only). */
export function __setOpenGuardSaveForTest(fn: SaveFn): void { saveImpl = fn; }
/** Restore the real save call (tests only). */
export function __resetOpenGuardSaveForTest(): void { saveImpl = saveAllDirty; }

/**
 * Runs the full ask→save→re-snapshot guard for opening a project over
 * whatever is currently resident. Resolves true when the open may proceed
 * (nothing was dirty, the user discarded, or a chosen save left everything
 * verified clean); false = abort (cancel/dismiss, or a save that left
 * something still dirty).
 *
 * No supersession generation counter here, unlike activateLevelTarget in
 * tab-activation.ts: opening a project is a modal-ish, rare action, so a
 * second open racing a pending confirm is an edge case not worth the extra
 * state — revisit only if users actually hit a race in practice.
 */
export async function confirmProjectOpen(): Promise<boolean> {
  const snap = currentOpenDirtySnapshot();
  if (planProjectOpen(snap).kind === 'proceed') {
    // Clean path still ends the sprite session: a surviving (unedited) checkout
    // points at the OLD project's .nem via an absolute basePath, so leaving it
    // would let a later Ctrl+S in the NEW project write into the old file.
    closeAllSpriteDocs();
    return true;
  }

  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved changes',
    body: 'Opening a project discards unsaved edits and undo history in the current one.',
    buttons: [
      { key: 'save', label: 'Save & open', tone: 'primary' },
      { key: 'discard', label: 'Discard & open', tone: 'danger' },
      { key: 'cancel', label: 'Cancel' },
    ],
  });

  if (answer === 'save') {
    await saveImpl();
    // saveAllDirty's `saved` only means the savers RAN (stage-3 notes item 7):
    // the honest gate is to re-snapshot — if anything is STILL dirty, a saver
    // failed (it already toasted). Abort instead of destroying the edits — and
    // say so; a silent abort here would look like the Open button did nothing.
    // (A saved sprite checkout no longer re-blocks: saveSpriteArt clears
    // unsavedEdits, so spriteDirty goes false. It deliberately does NOT clear it
    // when an edit landed mid-write — that edit isn't on disk, so aborting here
    // is the correct outcome, not a false positive.)
    if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') {
      useToastStore.getState().addToast(
        'Open cancelled — unsaved changes remain (save or discard them first).',
        'error',
      );
      return false;
    }
    // Everything persisted — reset the editor so no checkout survives into the
    // new project (same cross-project write hazard as the clean path above).
    closeAllSpriteDocs();
    return true;
  }

  if (answer === 'discard') {
    // Actually discard, not just proceed: a leftover aeon-dirty flag means the
    // NEXT open sees phantom dirtiness 'Save & open' can never clear (re-runs the
    // no-op savers forever; the re-snapshot keeps aborting).
    //
    // classicDirty needs no explicit clear here: classicProjectStore.openDirectory
    // calls useClassicLevelStore.getState().reset() as soon as the switch begins
    // (Task 7), which zeroes every dirty domain.
    useEditorStore.getState().markClean();
    // closeAllSpriteDocs drops every document + its history + unsaved flag, which also
    // closes the cross-project hazard: the surviving s1ArtSource points at the
    // OLD project's .nem, and the sprite-art saver would otherwise fire on it.
    closeAllSpriteDocs();
    return true;
  }

  return false; // cancel / dismissed / any unrecognized key
}
