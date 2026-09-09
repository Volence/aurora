// The recent-projects store's READ STATE, and the one gate every writer of that
// store must pass. Shared (no fs, no electron) because main OWNS the file and the
// renderer has to TELL THE USER about it, and a refusal said in two voices drifts.
//
// ABSENT AND UNREADABLE ARE NOT THE SAME ANSWER. `getRecentProjects` used to
// answer `[]` for a JSON syntax error, for an EACCES and for a genuine first run
// alike, and `addRecentProject` read through that, unshifted one row and wrote
// the result back unconditionally: the next project you opened after a corrupt
// hand-edit replaced your whole list with a single entry, silently, with no
// backup. `removeRecentProject` was worse in intent - the user asks to drop ONE
// entry and every entry the reader could not see goes with it.
//
// Same rule and the same reason as the classic sidecar's `SidecarRead`
// (core/project/mapping.ts) and aeon's `section.unreadable` + `understood()` gate
// (core/project/aeon/save.ts): a file Aurora could not READ is one it must not
// overwrite. Three answers, not two:
//
//   'absent'     - no store file. An empty list is the TRUTH, and writing one
//                  creates the store, which is the whole point of a first run.
//   'read'       - the file parsed. `projects` is what it says. `dropped` may
//                  still count rows discarded from WITHIN it, and a store with
//                  one unusable row is STILL safe to write.
//   'unreadable' - the file is there and Aurora could not turn it into a list.
//                  The user's list is still on disk; Aurora just cannot see it.

import type { RecentProject } from './ipc-types';

export type RecentsRead = 'absent' | 'read' | 'unreadable';

/**
 * What the recents store is, and WHY it is that.
 *
 * Every field is REQUIRED, `read` above all: a producer that forgets to say
 * which of the three answers this is must fail to compile, because the answer a
 * reader would otherwise assume ('read', the writable one) is the dangerous one.
 */
export interface RecentsState {
  /** The list, newest first. Empty for 'absent' AND for 'unreadable' - which is
   *  exactly why `read` exists: the emptiness means opposite things. */
  projects: RecentProject[];
  read: RecentsRead;
  /** Why Aurora could not read it, when `read` is 'unreadable'; null otherwise.
   *  Carried rather than logged because the sentence shown to the user names it. */
  reason: string | null;
  /** Absolute path of the store file, so the refusal can name the file the user
   *  has to go and fix. */
  path: string;
  /** Rows discarded from within a store that DID parse (no usable `path`). Not a
   *  reason to refuse a write - see recentsMayBeOverwritten. */
  dropped: number;
}

/**
 * THE WRITE GATE. Every writer of the recents store passes this before producing
 * any bytes.
 *
 * KEYED ON `read`, NEVER ON `projects.length`. An empty list is the correct
 * contents of a first-run store and gating on emptiness would make a first run
 * unable to record anything, forever. And never on `dropped` either: a store
 * that parsed with one junk row is a store Aurora CAN see, so refusing it would
 * strand the list permanently over a row that names no project. The question is
 * never "was anything wrong"; it is "did Aurora see what is in this file".
 */
export function recentsMayBeOverwritten(state: RecentsState): boolean {
  return state.read !== 'unreadable';
}

/**
 * The refusal, in one place and one voice: what happened, that nothing was lost,
 * what Aurora will not do until it is fixed, and what to DO about it.
 *
 * The last clause is the part that matters. A message that only says "could not
 * read your recents" leaves the user looking at an empty list with no idea that
 * the file behind it is intact, and no idea why their next project did not
 * appear in it.
 */
export function recentsRefusalMessage(state: RecentsState): string {
  const why = state.reason ? ` (${state.reason})` : '';
  return `Aurora could not read your recent-projects list${why}. `
    + `Your list is still on disk and has NOT been changed, and Aurora will not record `
    + `the projects you open until it can read it again. Fix or delete ${state.path}, `
    + `then restart Aurora.`;
}
