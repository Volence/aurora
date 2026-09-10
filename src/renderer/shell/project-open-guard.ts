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
// openEngine, not a local re-derivation: it is the ONE answer to "which project
// is open" (see its header) and it is literally the classic-level and
// aeon-project savers' `isDirty`, so this guard cannot promise a save either of
// them will skip. A per-feature copy of that question is what open-project.ts
// exists to prevent.
import { openEngine } from '../state/open-project';
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
  // THE ENGINE, read ONCE, because it is the classic-level and aeon-project
  // savers' OWN `isDirty` (state/project-runtime.ts) and therefore the only
  // honest answer to "will Save write this". Two reads could not disagree here,
  // but one name says what the two terms below have in common.
  const engine = openEngine();
  const spriteDirty = anySpriteDocDirty();
  const dirtyCanvases = dirtyCanvasDocIds();
  const saveableCanvases = saveableDirtyCanvasDocIds();
  const artDirty = useArtStore.getState().open?.dirty === true;

  // THE GAP BETWEEN "DIRTY" AND "SAVABLE", stated once, per surface. Each of
  // these FIVE has a dirty predicate that is deliberately WIDER than its
  // saver's, so each can present the guard with work Save will not write:
  //   • canvas  — dirtyCanvasDocIds vs saveableDirtyCanvasDocIds (no file target)
  //   • sprite  — anySpriteDocDirty vs saveableDirtySpriteDocIds (no save-back)
  //   • art     — open.dirty vs composerSaveState() (see that function)
  //   • classic — classicLevelStore.dirty vs openEngine() === 's1'   (see below)
  //   • aeon    — editorStore.dirty       vs openEngine() === 'aeon' (see below)
  // The sentences are the ones the tab-close doors already use for the first two
  // (tab-activation/canvas.ts, tab-activation/sprite.ts), so a user meets the
  // same explanation wherever the same document blocks them.
  //
  // ⚠ AND THE FOURTH AND FIFTH SURFACES, WHICH USED TO BE ASSUMED SAVABLE.
  // `classicDirty` and `aeonDirty` were counted savable outright, but their
  // savers do not read those flags: classic-level fires on `openEngine() === 's1'`
  // and aeon-project on `openEngine() === 'aeon'` (state/project-runtime.ts).
  // Each is now paired with the saver's OWN predicate, which is the shape the
  // three surfaces above already use.
  //
  // THE REPRODUCTION TWO EARLIER PASSES COULD NOT FIND, and what it measured
  // (2026-09-09; project-open-guard.dirty-domains.test.ts):
  //
  //   `openEngine()` gives CLASSIC PRECEDENCE — `status === 'open'` wins before
  //   `project !== null` is even read — so a classic open over a resident, dirty
  //   AEON project leaves `aeonDirty` true and the aeon saver skipping. Driven
  //   through `classicProjectStore.openDirectory` itself (the exact body of the
  //   `__aurora.classic.openDir` debug hook, the only unguarded door left), the
  //   PRE-FIX guard then offered "Save & open" as the PRIMARY, ran the savers,
  //   watched the aeon impl never fire, re-read the same dirt and told the user
  //   "unsaved changes remain (save or discard them first)" — the inert-Save loop
  //   whose only exit throws the work away, in the exact form the three surfaces
  //   above were fixed for.
  //
  // NOT A USER GESTURE, and that is written here rather than left implied: no
  // production road reaches it (the census below still holds, and it is what
  // makes this a hardening rather than a bug fix). It IS reachable in dev and by
  // the CDP harnesses, which drive that hook every run.
  //
  // THE CLASSIC HALF IS DEFENSIVE ONLY — `classicDirty` implies
  // `openEngine() === 's1'` by construction (see CLASSIC below), so its term can
  // fire only in a state nothing constructs today. It is written the same way
  // anyway: this snapshot's whole history is a surface that was narrower than the
  // thing it guarded, and a term whose absence depends on a census one refactor
  // away from being wrong is the same bet that lost four times already.
  //
  // ── WHAT THE SECOND LOOK ADDED (2026-09-09) ─────────────────────────────
  //
  // The paragraph above used to give its reason as "classicProjectStore
  // .openDirectory resets the level store on a switch, and editorStore.dirty is
  // set by commands that need a resident project". Right about the conclusion,
  // wrong about the extent, so both halves are restated from the census rather
  // than from the two mechanisms that came to mind first.
  //
  // CLASSIC. The reason is stronger than the reset. `classicLevelStore.dirty` has
  // exactly one writer, `applyCommit`, reached only through `commitLayout` and
  // `commitArt`, and both of those call `requireClassicHistory` FIRST, which
  // throws unless the classic project is open. So `classicDirty` implies
  // `openEngine() === 's1'` by construction, which also covers the case the reset
  // alone would not: an edit that lands late, after a switch has begun.
  //
  // AEON. "commands that need a resident project" names two of the nine
  // production `markDirty()` call sites (executeCommand and
  // executeAmbientCommand). The other seven are not commands at all: chunk
  // library import twice, the composer's new-chunk save, the marquee paste, and
  // three gesture-time sites in MapViewport. The conclusion survives on a wider
  // basis than the original sentence gave it: all nine sit on surfaces that mount
  // only on the aeon branch (workspace/facet-registry.ts's mapFacet defaults are
  // aeon-bound and all five s1 facets override Canvas with their own), and
  // `openEngine()` can flip from 'aeon' to 's1' only through
  // `classicProjectStore.openDirectory`, whose production callers are
  // `useProject.openPath` (guarded by confirmProjectOpen, which markCleans on
  // discard and refuses to proceed while the re-snapshot is dirty), the Project
  // Setup tab's re-validate (a classic project is already open there, so the
  // engine was already 's1'), and the agent's `classic-open-project` (which
  // refuses outright on any dirt). `useProjectStore.reset()` has no production
  // caller, so `project` never returns to null and `openEngine()` never falls
  // back to null with an aeon project's dirt still resident.
  //
  // WHERE A REPRODUCTION WOULD COME FROM, since the state is constructible: the
  // two DEBUG hooks that open a project with no guard at all, `__aurora.classic
  // .openDir` and `__aurora.aeon.open` (renderer/debug-hooks.ts). Those are the
  // only unguarded doors left, and neither is a user gesture.
  //
  // ── ONE MECHANISM ABOVE MOVED (2026-09-10, UX seat A's F6) ───────────────
  // The AEON paragraph's "`openEngine()` can flip from 'aeon' to 's1' only
  // through `classicProjectStore.openDirectory`" still holds: that is the
  // aeon-to-classic direction and nothing added a second way to take it.
  //
  // What changed is the OTHER direction. `openAeonProject` (state/aeon-open.ts)
  // now closes a resident classic project itself, first thing, rather than
  // inheriting the close from `openDirectory`'s 'not-classic' branch one
  // statement earlier on the user road. It is written up there; the reason it is
  // repeated here is that this census reasons from those mechanisms, and a
  // census that quotes a mechanism which has since moved is exactly the rot the
  // §2 test below exists to catch in the CALLERS and cannot catch in the prose.
  //
  // NO NEW DISCARD ROAD, which is the question a reader of this file will ask.
  // That close resets `classicLevelStore` and so zeroes `classicDirty`. It is
  // reachable from two places and neither is new: the user road, where
  // `openDirectory` had already reset the same store before `openAeonProject`
  // was called at all, and the unguarded debug door, which discarded that work
  // regardless. No production caller reaches it with unsaved classic edits that
  // `confirmProjectOpen` has not already asked about.
  //
  // ⚠ AND THE STATED RISK OF TIGHTENING DID NOT SURVIVE THE LOOK EITHER, so do
  // not quote it as the reason. "It would drop the Save button in states this
  // guard is right about today" has no example: the classic-level saver's own
  // `isDirty` is `openEngine() === 's1'` and does not consult `classicDirty` at
  // all, so `classicDirty` true implies that saver fires; the aeon term would
  // become the aeon saver's own predicate, which is the shape the canvas, sprite
  // and composer terms already use. The honest reason to leave this alone is the
  // narrower one: with no reproduction there is nothing to verify a change
  // against, and a guard edit whose only evidence is an argument is how a
  // correct-looking rule gets applied in the wrong scope later.
  //
  // ── AND THAT REASON IS SPENT (2026-09-09) ────────────────────────────────
  // There is a reproduction now, and it is verified against: the change is made,
  // and the "would drop the Save button" risk has its own CONTROL rows in the
  // test file — the same aeon dirt with no classic project open still offers Save
  // and a save still clears it, and the same classic dirt with a classic project
  // open still offers Save. That is what the two `engine ===` terms cost, stated
  // as a measurement rather than as an argument.
  const unsavable: string[] = [];
  // The two savers' own predicates, verbatim. A dirty domain whose saver will not
  // fire is unsavable in exactly the sense the canvas/sprite/art terms mean.
  const classicSavable = classicDirty && engine === 's1';
  const aeonSavable = aeonDirty && engine === 'aeon';
  if (classicDirty && !classicSavable) {
    unsavable.push('Unsaved classic level edits are resident with no classic project open, '
      + 'so Save cannot write them.');
  }
  if (aeonDirty && !aeonSavable) {
    // WHY THIS ONE NAMES THE CLASSIC PROJECT: `engine` is 's1' here in every
    // reachable case (classic precedence), and "the aeon project is not the open
    // one" is unreadable to someone looking at a classic project on screen.
    unsavable.push(engine === 's1'
      ? 'Unsaved aeon project edits are resident while a CLASSIC project is open, so the '
        + 'aeon saver skips them and Save cannot write them.'
      : 'Unsaved aeon project edits are resident with no aeon project open, '
        + 'so Save cannot write them.');
  }
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
    anySavable: classicSavable || aeonSavable || saveableSprites > 0
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
 * THE THIRD DOOR ON THIS PERIMETER, and the one with no buttons: an agent tool
 * asking to open a project over resident unsaved work (agent/agent-handler.ts's
 * `classic-open-project`). It refuses outright — correct, since there is no UI to
 * confirm through — and its refusal is the only thing the caller gets to read.
 *
 * WHY IT IS HERE AND NOT AT THAT CALL SITE. The two dialog doors' copy was
 * centralised for a reason recorded above: `unsavedBlockedMessage` lived only on
 * the open side, so the close door silently lacked a branch. This door had the
 * same hole in a third form — it told the caller unconditionally to "Save first",
 * which is exactly the advice that cannot be followed when nothing dirty has a
 * writer (a canvas with no file, a sprite with no save-back, a composer document
 * with no writer — see currentOpenDirtySnapshot). An agent obeying it saves, sees
 * the same dirt, and retries forever.
 *
 * SAME DECISION AS THE DIALOGS, SAME SENTENCES, DIFFERENT TAIL. `offerSave` drops
 * the save instruction on exactly the condition that drops the Save BUTTON, and
 * the `unsavable` sentences are the shared ones, verbatim. The tail is its own
 * because the dialogs' tails name buttons ("Discard & open") and an agent has
 * none: what it can do is stop and put the question to the user.
 */
export function unsavedAgentRefusal(
  plan: { offerSave: boolean; unsavable: readonly string[] },
): string {
  // Every dirty domain the snapshot covers, not the three the old sentence named:
  // canvas and composer documents block this door too and were unlisted, so a
  // caller went looking through the wrong stores for what was holding it.
  const base = 'Unsaved changes present (classic / aeon / sprite / canvas / composer).';
  const how = plan.offerSave
    ? 'Save first (Ctrl+S / save tools) or have the user discard, then retry.'
    : 'None of it can be saved, so saving will not clear this: the user has to discard '
      + 'it in the app before a retry can succeed.';
  return plan.unsavable.length === 0
    ? `${base} ${how}`
    : `${base} ${plan.unsavable.join(' ')} ${how}`;
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
