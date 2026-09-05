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
// dirtyCanvasDocIds is the SAME predicate the canvas tab dots read, for the same
// reason anySpriteDocDirty is shared above. saveableDirtyCanvasDocIds is the
// NARROWER set Save All can actually write, and the gap between the two is why
// the post-save message below has a second sentence.
import { useCanvasStore, dirtyCanvasDocIds, saveableDirtyCanvasDocIds } from '../state/canvasStore';
// The aeon composer's document. A leaf store (core types only), so no cycle.
import { useArtStore } from '../state/artStore';

export interface OpenDirtySnapshot {
  classicDirty: boolean;  // any classicLevelStore dirty domain
  aeonDirty: boolean;     // editorStore.dirty (aeon project-wide)
  // anySpriteDocDirty(): the honest unsavedEdits flag of every OPEN sprite
  // document. Was s1ArtSource-only, which both silently discarded an edited
  // aeon/new sprite on open (finding 3) AND phantom-blocked the open on a
  // freshly-opened, unedited checkout — the flag tracks actual unsaved edits, not
  // the checkout target.
  spriteDirty: boolean;
  // dirtyCanvasDocIds().length > 0 — every OPEN canvas document with unsaved
  // edits, background tabs included. Added when resetProjectRuntime started
  // closing canvas documents on a project switch: before that they leaked into
  // the new project (their own bug), after it they died here with no dialog and
  // no toast, which is worse. This is the same divergence finding 3 closed for
  // sprites — the open-guard being narrower than what the tab strip dots —
  // arriving through a store that did not exist when that was written.
  canvasDirty: boolean;
  // useArtStore.getState().open?.dirty — the aeon composer document (New Tile /
  // Block / Chunk). Its strokes live in artStore alone: ComposerCanvas calls
  // markOpenDirty() and no command, so editorStore.dirty stays FALSE and every
  // other field of this snapshot reads clean while a whole unsaved drawing is
  // resident. Same divergence the sprite and canvas fields closed, arriving
  // through the one document store that was never joined to the perimeter.
  artDirty: boolean;
}

export type ProjectOpenPlan = { kind: 'proceed' } | { kind: 'confirm' };

export function planProjectOpen(s: OpenDirtySnapshot): ProjectOpenPlan {
  return s.classicDirty || s.aeonDirty || s.spriteDirty || s.canvasDirty || s.artDirty
    ? { kind: 'confirm' }
    : { kind: 'proceed' };
}

/** Live snapshot helper (kept beside the planner so the two stay in lockstep). */
export function currentOpenDirtySnapshot(): OpenDirtySnapshot {
  return {
    classicDirty: Object.values(useClassicLevelStore.getState().dirty).some(Boolean),
    aeonDirty: useEditorStore.getState().dirty,
    spriteDirty: anySpriteDocDirty(),
    canvasDirty: dirtyCanvasDocIds().length > 0,
    artDirty: useArtStore.getState().open?.dirty === true,
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
 * End the whole document session for the project being replaced: sprite AND
 * canvas. ONE function, called from all three proceed paths, because the bug it
 * exists to prevent is a document store that is torn down on one branch and
 * forgotten on another. That is literally how the canvas hole got in — canvas
 * was added to resetProjectRuntime's teardown but to none of these three, so a
 * dirty canvas died with no dialog. The next document type is added here once.
 *
 * The aeon composer document (artStore.open) was the standing counter-example:
 * this docblock promised the rule while that store was in none of the three
 * teardowns and in none of the dirty predicates, so aeon-open.ts:86 replaced an
 * unsaved drawing outright with no confirm at all.
 *
 * Why tear down at all on the CLEAN path, where nothing is dirty: a surviving
 * document points into the OLD project by absolute path (a sprite checkout's
 * basePath, a CanvasSource.dir), so a later Ctrl+S in the NEW project would
 * write into the old one. And this cannot be left to resetProjectRuntime: that
 * fires from session-lifecycle only when the project KEY actually changes, so
 * an open that ends in 'error' would leave the stale documents resident.
 */
function endDocumentSession(): void {
  closeAllSpriteDocs();
  useCanvasStore.getState().closeAll();
  useArtStore.getState().closeDocument();
}

/**
 * Why the post-save re-snapshot is aborting the open.
 *
 * The generic sentence assumes the user CAN act on "save them first". A canvas
 * with no file target cannot be saved by Ctrl+S or Save All at all — the saver
 * reads saveableDirtyCanvasDocIds, which filters it out — so it survives the
 * save, re-fails the re-snapshot, and blocks the open forever. Aborting IS the
 * right outcome (the work is real and unpersisted), but the generic copy sends
 * that user round a loop with no exit, so the case gets its own sentence naming
 * Discard as the way past. Appended, not substituted: a failed classic save and
 * an unsavable canvas can both be true at once, and both sentences are then
 * accurate. (Task 13's New Canvas flow gives a canvas its file up front, which
 * is what makes this rare rather than routine.)
 */
function openBlockedMessage(): string {
  const base = 'Open cancelled: unsaved changes remain (save or discard them first).';
  const saveable = new Set(saveableDirtyCanvasDocIds());
  const unsavable = dirtyCanvasDocIds().filter((id) => !saveable.has(id));
  if (unsavable.length === 0) return base;
  return `${base} ${unsavable.length} canvas(es) have no file yet, so Save cannot write them; ` +
    'use Discard & open to drop them.';
}

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
    endDocumentSession();
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
      useToastStore.getState().addToast(openBlockedMessage(), 'error');
      return false;
    }
    // Everything persisted — reset the editor so no document survives into the
    // new project (same cross-project write hazard as the clean path above).
    endDocumentSession();
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
    // endDocumentSession drops every sprite and canvas document + its history +
    // unsaved flag, which also closes the cross-project hazard: the surviving
    // s1ArtSource points at the OLD project's .nem and CanvasSource.dir at its
    // root, and the sprite-art / canvas-doc savers would otherwise fire on them.
    // canvasDirty needs no separate clear for the same reason classicDirty does
    // not: the documents themselves go, so the predicate goes false with them.
    endDocumentSession();
    return true;
  }

  return false; // cancel / dismissed / any unrecognized key
}
