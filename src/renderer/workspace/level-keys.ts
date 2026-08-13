// While a sprite-doc tab is active, the (keep-alive, hidden) level editors'
// window-level key handlers must be inert — SpriteMode owns the keyboard.
// Restores the mutual exclusivity master had when sprite mode was a branch
// inside the level workspace. Pure predicate so it's node-testable and every
// canvas handler shares one definition.

import { useSessionStore } from '../state/sessionStore';
import { parseSpriteDocTabId } from '../shell/tabs';

export function levelKeysEnabled(): boolean {
  return parseSpriteDocTabId(useSessionStore.getState().activeId) === null;
}
