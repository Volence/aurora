// While a sprite-doc OR canvas-doc tab is active, the (keep-alive, hidden) level
// editors' window-level key handlers must be inert — that editor owns the
// keyboard.
// Restores the mutual exclusivity master had when sprite mode was a branch
// inside the level workspace. Pure predicate so it's node-testable and every
// canvas handler shares one definition.
//
// WHAT ACTUALLY BREAKS WITHOUT IT — corrected after the Task 14 CDP run, which
// reverted this guard and measured the result. The failure everyone had written
// down, here and in four other comments, was "one Ctrl+Z fires both the sprite
// (or canvas) undo AND the hidden level undo". THAT CANNOT HAPPEN. Both handlers
// call `focusedHistory()`, and `focusedDocId()` returns the ACTIVE TAB's own
// document for a sprite-doc or canvas-doc tab (editorStore.ts) — so the level
// pane's handler does not resolve to a level document at all. It resolves to the
// same stack the focused editor's handler does.
//
// The real defect is a DOUBLE CONSUME: two registered handlers, one stack, so a
// single Ctrl+Z pops TWO undo entries. Two strokes vanish per press; the level
// document is never touched. Both the sprite and canvas halves of the old claim
// were wrong in exactly this way, and for the same reason — SpriteMode and
// CanvasMode both drive `focusedHistory()`, neither has a private stack.
//
// The guard is unchanged and still load-bearing. Only the reason was wrong.

import { useSessionStore } from '../state/sessionStore';
import { isSpriteDocTabId, isCanvasDocTabId } from '../shell/tabs';

export function levelKeysEnabled(): boolean {
  // isSpriteDocTabId, not parseSpriteDocTabId: the "New Sprite…" tab mounts
  // SpriteMode exactly like an engine-bound one, so the level handlers must be
  // just as inert under it or one Ctrl+Z consumes two of that sprite's undo
  // entries. A canvas-doc tab mounts CanvasMode for the same reason and gets the
  // same treatment.
  const activeId = useSessionStore.getState().activeId;
  return !isSpriteDocTabId(activeId) && !isCanvasDocTabId(activeId);
}
