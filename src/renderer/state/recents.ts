// THE ONE DOOR to the recent-projects store from the renderer.
//
// Three surfaces list recents (App's welcome screen, HomeTab, Explorer's
// no-project tree) and two record one (useProject's open, aeon-open). Every one
// of them used to call `window.api.getRecentProjects()` and `.catch(() => [])`,
// which is where the store's worst defect became invisible: main answered `[]`
// for a store it could not READ, and an empty list draws exactly like a first
// run. The bytes are safe now (main refuses to overwrite an unreadable store),
// but a user staring at an empty list still has to be told WHY, or their next
// project silently fails to appear in it and the fix (repair the file) is
// undiscoverable.
//
// So the refusal is said HERE, once, in one sentence from shared/recents.ts, and
// the surfaces get the plain array they already wanted.

import { useToastStore } from './toastStore';
import { recentsMayBeOverwritten, recentsRefusalMessage } from '../../shared/recents';
import type { RecentsState } from '../../shared/recents';
import type { RecentProject } from '../../shared/ipc-types';

/**
 * Toast the refusal, if this state is one, and hand back the list.
 *
 * DEDUPED BY MESSAGE, not by a module flag: the welcome screen, the Home tab and
 * the Explorer can all mount within the same second, and three identical
 * ten-second errors is the wall that teaches people to swat toasts. Checking the
 * live stack keeps it to one while a later, genuinely separate occurrence (after
 * the first has expired) is still said out loud - a module-level `told` flag
 * would silence that one forever, and it would leak between tests.
 */
export function noteRecentsState(state: RecentsState): RecentProject[] {
  if (!recentsMayBeOverwritten(state)) {
    const message = recentsRefusalMessage(state);
    const store = useToastStore.getState();
    if (!store.toasts.some((t) => t.message === message)) store.addToast(message, 'error');
  }
  return state.projects;
}

/** List the recents for a surface that renders them. */
export async function loadRecents(): Promise<RecentProject[]> {
  return noteRecentsState(await window.api.getRecentProjects());
}

/**
 * Record a project open. The refusal is surfaced on THIS path too, deliberately:
 * the open is the gesture whose result the user is about to look for in the list,
 * and it is the write that used to destroy the file.
 */
export async function recordRecentProject(dir: string, name: string): Promise<RecentProject[]> {
  return noteRecentsState(await window.api.addRecentProject(dir, name));
}
