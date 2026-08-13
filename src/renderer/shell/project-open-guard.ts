// Guard for opening a project (path/dialog/recent) while ANY unsaved work is
// resident (stage-3 notes deferred gap #1: openPath previously reset stores with
// no confirm — silent data loss). planProjectOpen/currentOpenDirtySnapshot are
// the pure decision; confirmProjectOpen is the ask→save→re-snapshot GLUE,
// extracted here (rather than left inline in useProject.openPath) so the whole
// flow is unit-testable in this node-only suite without a React hook + jsdom.

import { useClassicLevelStore } from '../state/classicLevelStore';
import { useEditorStore } from '../state/editorStore';
import { useSpriteStore, spriteHistory } from '../state/spriteStore';
import { useConfirmStore } from '../state/confirmStore';
import { useToastStore } from '../state/toastStore';
import { saveAllDirty } from '../state/project-runtime';
// spriteEditorDirty is the SAME predicate the dot/tab-switch guard uses; sharing
// it keeps the open-guard from being narrower than the tab-switch guard (finding
// 3). No cycle: tab-activation does not import project-open-guard (this module is
// a leaf imported only by useProject/agent-handler).
import { spriteEditorDirty } from './tab-activation';

export interface OpenDirtySnapshot {
  classicDirty: boolean;  // any classicLevelStore dirty domain
  aeonDirty: boolean;     // editorStore.dirty (aeon project-wide)
  // spriteEditorDirty(): an s1ArtSource checkout OR sprite history (canUndo).
  // Was s1ArtSource-only, which let an edited aeon/new sprite (dots + blocks tab
  // switches via canUndo) be silently discarded on a project open (finding 3).
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
    spriteDirty: spriteEditorDirty(),
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
  if (planProjectOpen(snap).kind === 'proceed') return true;

  // The caveat is specifically about a CHECKED-OUT sprite (s1ArtSource), which
  // survives a save and keeps re-blocking the open. snap.spriteDirty is broader
  // now (also true for a canUndo-only aeon/new sprite, which a save/discard DOES
  // clear), so key the sentence on the live checkout, not the broad flag.
  const hasSpriteCheckout = useSpriteStore.getState().s1ArtSource !== null;
  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved changes',
    body:
      'Opening a project discards unsaved edits and undo history in the current one.' +
      (hasSpriteCheckout
        ? ' A checked-out sprite keeps the open blocked after saving — close it from the Sprite editor first.'
        : ''),
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
    // failed (it already toasted) or a sprite checkout is still open (the
    // sprite saver never clears s1ArtSource). Abort instead of destroying the
    // edits — and say so; a silent abort here would look like the Open button
    // just did nothing.
    if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') {
      useToastStore.getState().addToast(
        'Open cancelled — some changes could not be saved (see earlier save errors).',
        'error',
      );
      return false;
    }
    return true;
  }

  if (answer === 'discard') {
    // Actually discard, not just proceed: leaving either flag set means the
    // NEXT open (of anything) sees phantom dirtiness it can never clear —
    // 'Save & open' would re-run the (now no-op) savers forever and the
    // re-snapshot check above would keep aborting.
    //
    // classicDirty needs no explicit clear here: classicProjectStore.openDirectory
    // calls useClassicLevelStore.getState().reset() as soon as the switch begins
    // (Task 7), which zeroes every dirty domain.
    useEditorStore.getState().markClean();
    // Clearing s1ArtSource also closes a real cross-project hazard: a surviving
    // s1ArtSource points at the OLD project's .nem file via an absolute
    // basePath, and the sprite-art saver fires whenever it's set — so Ctrl+S in
    // the NEW project would silently write edited pixels into the OLD
    // project's file on disk.
    useSpriteStore.getState().setS1ArtSource(null);
    // Also clear the sprite undo history: spriteDirty now includes canUndo, so a
    // leftover history would re-trip the same phantom-dirty trap as the flags
    // above (the next open would keep asking / re-snapshotting as confirm).
    spriteHistory.clear();
    return true;
  }

  return false; // cancel / dismissed / any unrecognized key
}
