// Sprite-mode undo/redo coordinator.
//
// In sprite mode two histories are live at once: pixel/frame/mode edits land on
// the sprite snapshot history, while a zone-palette edit (slider or copy bridge)
// lands on the level command history. A single Ctrl+Z must undo whichever edit
// came last, so we merge the two timelines by the global edit-sequence stamp
// each history records (see core/editing/edit-seq.ts).
//
// The level command history is a GLOBAL stack shared with map/art mode and is
// NOT cleared on entering sprite mode. To avoid sprite-mode undo reaching back
// into pre-existing map/art edits (which would change the level silently — the
// map isn't even mounted in sprite mode), we capture a baseline of the edit
// clock each time sprite mode is entered and only consider level edits newer
// than it. Sprite pixel/frame edits are always the sprite document's own.
//
// This is sprite-mode-only glue; map/art mode keeps calling the level history
// directly. Both histories still own their own apply/undo — this only chooses
// which one to drive next.
import { editHistory, undo as levelUndo, redo as levelRedo, useEditorStore } from './editorStore';
import { spriteHistory, useSpriteStore } from './spriteStore';
import { useProjectStore, getActiveLevel } from './projectStore';
import { peekEditSeq } from '../../core/editing/edit-seq';

// Edits with seq <= this existed before the current sprite session began; the
// coordinator never touches them. Re-captured on each entry into sprite mode.
let levelBaselineSeq = peekEditSeq();
let prevAppMode = useEditorStore.getState().appMode;
useEditorStore.subscribe((state) => {
  if (state.appMode === 'sprite' && prevAppMode !== 'sprite') levelBaselineSeq = peekEditSeq();
  prevAppMode = state.appMode;
});

/** Level history has a sprite-session undo entry (one made after entering sprite mode). */
function levelHasUndo(): boolean {
  return editHistory.canUndo && editHistory.topUndoSeq() > levelBaselineSeq;
}
/** Level history has a sprite-session redo entry. */
function levelHasRedo(): boolean {
  return editHistory.canRedo && editHistory.topRedoSeq() > levelBaselineSeq;
}

export function spriteModeCanUndo(): boolean {
  return spriteHistory.canUndo || levelHasUndo();
}
export function spriteModeCanRedo(): boolean {
  return spriteHistory.canRedo || levelHasRedo();
}

/** Undo the most-recent edit across the sprite and (this-session) level histories. */
export function spriteModeUndo(): void {
  const level = getActiveLevel(useProjectStore.getState());
  const levelSeq = level && levelHasUndo() ? editHistory.topUndoSeq() : -1;
  const spriteSeq = spriteHistory.canUndo ? spriteHistory.topUndoSeq() : -1;
  if (levelSeq < 0 && spriteSeq < 0) return;
  if (levelSeq > spriteSeq) levelUndo(level!);   // newest edit is a palette edit
  else useSpriteStore.getState().undo();
}

/**
 * Redo the next edit across both histories. Undo always processes newest-first,
 * so the most-recently-undone entry is the OLDEST of the undone set — i.e. the
 * redo-top with the SMALLEST edit-seq. Empty redo stacks count as +Infinity.
 */
export function spriteModeRedo(): void {
  const level = getActiveLevel(useProjectStore.getState());
  const levelSeq = level && levelHasRedo() ? editHistory.topRedoSeq() : Infinity;
  const spriteSeq = spriteHistory.canRedo ? spriteHistory.topRedoSeq() : Infinity;
  if (levelSeq === Infinity && spriteSeq === Infinity) return;
  if (levelSeq < spriteSeq) levelRedo(level!);
  else useSpriteStore.getState().redo();
}
