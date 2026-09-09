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
// composerSaveState is the ONE rule for "can Save write the open composer
// document", shared with the `art-composer` saver in project-runtime and with
// the facet's own Save button, so this guard cannot promise a save the
// coordinator will not perform. See state/art-composer-save.ts.
import { composerSaveState } from '../state/art-composer-save';
// The NARROWER set the sprite saver can actually write, for the same reason
// saveableDirtyCanvasDocIds is imported above: `anySpriteDocDirty` counts every
// dirty sprite document, and a dirty aeon/new sprite with no save-back file is
// not one of them.
import { dirtySpriteDocIds, saveableDirtySpriteDocIds } from '../state/spriteStore';

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
  /**
   * WHY SAVE CANNOT CLEAR IT — one sentence per kind of dirty work in this
   * snapshot that no registered saver can write. Empty when Save reaches
   * everything that is dirty.
   *
   * REQUIRED, not optional-defaulting-to-empty, and that is the point. A
   * snapshot of five booleans conflated "dirty" with "dirty and savable", and
   * the guard read the conflated value as the second: it offered Save & open as
   * the PRIMARY button over work no saver would touch, ran the savers, saw the
   * same dirt in the re-snapshot, and told the user to "save or discard first" —
   * a loop whose only exit throws the work away. A producer that adds a document
   * store now has to answer this question to compile, because the answer it
   * would otherwise inherit by default is the dangerous one.
   */
  unsavable: readonly string[];
  /**
   * Is there at least one dirty domain a saver CAN write? Decides whether the
   * dialog offers Save at all. Not derivable from `unsavable`: that list says
   * what Save cannot reach, and a dialog needs to know whether it reaches
   * anything.
   */
  anySavable: boolean;
}

export type ProjectOpenPlan =
  | { kind: 'proceed' }
  /** `offerSave` false ⇒ the door must not show a Save button: nothing dirty
   *  here has a writer, so the primary would be inert by construction. */
  | { kind: 'confirm'; offerSave: boolean; unsavable: readonly string[] };

export function planProjectOpen(s: OpenDirtySnapshot): ProjectOpenPlan {
  return s.classicDirty || s.aeonDirty || s.spriteDirty || s.canvasDirty || s.artDirty
    ? { kind: 'confirm', offerSave: s.anySavable, unsavable: s.unsavable }
    : { kind: 'proceed' };
}

/** Live snapshot helper (kept beside the planner so the two stay in lockstep). */
export function currentOpenDirtySnapshot(): OpenDirtySnapshot {
  const classicDirty = Object.values(useClassicLevelStore.getState().dirty).some(Boolean);
  const aeonDirty = useEditorStore.getState().dirty;
  const spriteDirty = anySpriteDocDirty();
  const dirtyCanvases = dirtyCanvasDocIds();
  const saveableCanvases = saveableDirtyCanvasDocIds();
  const artDirty = useArtStore.getState().open?.dirty === true;

  // THE GAP BETWEEN "DIRTY" AND "SAVABLE", stated once, per surface. Each of
  // these three has a dirty predicate that is deliberately WIDER than its
  // saver's, so each can present the guard with work Save will not write:
  //   • canvas — dirtyCanvasDocIds vs saveableDirtyCanvasDocIds (no file target)
  //   • sprite — anySpriteDocDirty vs saveableDirtySpriteDocIds (no save-back)
  //   • art    — open.dirty vs composerSaveState() (see that function)
  // The sentences are the ones the tab-close doors already use for the first two
  // (tab-activation/canvas.ts, tab-activation/sprite.ts), so a user meets the
  // same explanation wherever the same document blocks them.
  //
  // WHAT IS ASSUMED SAVABLE HERE, AND WHY THAT IS NOT PROVEN. `classicDirty` and
  // `aeonDirty` are counted savable outright, but their savers do not read those
  // flags: classic-level fires on `openEngine() === 's1'` and aeon-project on
  // `openEngine() === 'aeon'` (state/project-runtime.ts). So a dirty
  // classicLevelStore with no classic project resident, or a dirty editorStore
  // with no aeon project, would be a FOURTH instance of this same defect — Save
  // offered over work its saver will skip. Deriving these two from `openEngine()`
  // instead would be the stricter reading, and it is deliberately not done here:
  // no reproduction of either state was found (classicProjectStore.openDirectory
  // resets the level store on a switch, and editorStore.dirty is set by commands
  // that need a resident project), and tightening it on an unreproduced case
  // would drop the Save button in states this guard is right about today. If a
  // reproduction turns up, this is the line to change and the shape to copy.
  const unsavable: string[] = [];
  const noFileCanvases = dirtyCanvases.length - saveableCanvases.length;
  if (noFileCanvases > 0) {
    unsavable.push(`${noFileCanvases} canvas(es) have no file yet, so Save cannot write them.`);
  }
  const saveableSprites = saveableDirtySpriteDocIds().length;
  const noTargetSprites = dirtySpriteDocIds().length - saveableSprites;
  if (noTargetSprites > 0) {
    unsavable.push(`${noTargetSprites} edited sprite(s) have no save-back file; export them `
      + 'from the sprite editor to keep those edits.');
  }
  const art = composerSaveState();
  if (art.kind === 'blocked') unsavable.push(art.why);

  return {
    classicDirty,
    aeonDirty,
    spriteDirty,
    canvasDirty: dirtyCanvases.length > 0,
    artDirty,
    unsavable,
    anySavable: classicDirty || aeonDirty || saveableSprites > 0
      || saveableCanvases.length > 0 || art.kind === 'savable',
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
 * THE TWO DOORS ON THIS PERIMETER, and their copy in one place.
 *
 * Project-open and window-close ask the same question of the same snapshot with
 * the same three buttons; the only difference is the verb. Keeping the wording
 * here rather than at each `ask()` is what stopped the close door from silently
 * lacking a branch the open door had: `unsavedBlockedMessage` used to exist only
 * on the open side, so a close aborted by an unsavable document got the generic
 * "save or discard them first" — advice that cannot be followed.
 */
export type PerimeterAction = 'open' | 'close';

const ACTION_COPY: Record<PerimeterAction, {
  body: string; save: string; discard: string; cancelled: string;
}> = {
  open: {
    body: 'Opening a project discards unsaved edits and undo history in the current one.',
    save: 'Save & open',
    discard: 'Discard & open',
    cancelled: 'Open cancelled',
  },
  close: {
    body: 'Closing Aurora discards unsaved edits and undo history.',
    save: 'Save & close',
    discard: 'Discard & close',
    cancelled: 'Close cancelled',
  },
};

/**
 * The dialog body: the generic warning, plus every sentence naming work Save
 * cannot write, plus what to do about it — BEFORE the user presses anything.
 *
 * The old dialog said only the first part, so a user with an unsavable document
 * learned that Save could not help by pressing Save and reading a toast. When
 * NOTHING is savable the Save button is gone entirely (see the ask sites), and
 * the last sentence has to say so or a missing primary button reads as a bug.
 */
export function unsavedDialogBody(
  action: PerimeterAction, plan: { offerSave: boolean; unsavable: readonly string[] },
): string {
  const copy = ACTION_COPY[action];
  if (plan.unsavable.length === 0) return copy.body;
  const tail = plan.offerSave
    ? `Save cannot cover all of it, so anything left needs ${copy.discard}.`
    : `Nothing here can be saved, so ${copy.discard} or Cancel are the only ways out.`;
  return `${copy.body} ${plan.unsavable.join(' ')} ${tail}`;
}

/**
 * Why the post-save re-snapshot is aborting.
 *
 * The generic sentence assumes the user CAN act on "save them first". Three
 * surfaces can present dirty work no saver will write — a canvas with no file
 * target, a sprite with no save-back file, a composer document with no writer
 * (see currentOpenDirtySnapshot) — and each survives the save, re-fails the
 * re-snapshot, and blocks forever. Aborting IS the right outcome (the work is
 * real and unpersisted), but the generic copy sends that user round a loop with
 * no exit, so the reasons are appended, naming Discard as the way past.
 *
 * APPENDED, NOT SUBSTITUTED: a failed classic save and an unsavable canvas can
 * both be true at once, and both sentences are then accurate. This is reachable
 * only in that MIXED case now — when nothing at all is savable the dialog no
 * longer offers Save, so there is no failed save to report.
 */
export function unsavedBlockedMessage(
  action: PerimeterAction, snap: OpenDirtySnapshot,
): string {
  const copy = ACTION_COPY[action];
  const base = `${copy.cancelled}: unsaved changes remain (save or discard them first).`;
  if (snap.unsavable.length === 0) return base;
  return `${base} ${snap.unsavable.join(' ')} Use ${copy.discard} to drop them.`;
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
  const plan = planProjectOpen(snap);
  if (plan.kind === 'proceed') {
    endDocumentSession();
    return true;
  }

  // NO SAVE BUTTON WHEN NOTHING CAN BE SAVED. Same shape the two tab-close doors
  // already use (tab-activation/canvas.ts and sprite.ts drop their Save when the
  // document has nowhere to go), and the array literal stays inline because
  // shell/__tests__/confirm-dialog-focus.test.ts walks these sites in the AST and
  // expands both branches of exactly this spread.
  const answer = await useConfirmStore.getState().ask({
    title: 'Unsaved changes',
    body: unsavedDialogBody('open', plan),
    buttons: [
      ...(plan.offerSave
        ? [{ key: 'save', label: 'Save & open', tone: 'primary' as const }] : []),
      { key: 'discard', label: 'Discard & open', tone: 'danger' as const },
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
    const after = currentOpenDirtySnapshot();
    if (planProjectOpen(after).kind === 'confirm') {
      useToastStore.getState().addToast(unsavedBlockedMessage('open', after), 'error');
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
