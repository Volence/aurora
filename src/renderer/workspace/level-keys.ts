// While a sprite-doc tab is active, the (keep-alive, hidden) level editors'
// window-level key handlers must be inert — SpriteMode owns the keyboard.
// Restores the mutual exclusivity master had when sprite mode was a branch
// inside the level workspace. Pure predicate so it's node-testable and every
// canvas handler shares one definition.

import { useSessionStore } from '../state/sessionStore';
import { isSpriteDocTabId } from '../shell/tabs';

export function levelKeysEnabled(): boolean {
  // isSpriteDocTabId, not parseSpriteDocTabId: the "New Sprite…" tab mounts
  // SpriteMode exactly like an engine-bound one, so the level handlers must be
  // just as inert under it or one Ctrl+Z fires both.
  return !isSpriteDocTabId(useSessionStore.getState().activeId);
}
