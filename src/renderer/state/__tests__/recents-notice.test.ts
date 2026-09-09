// THE OTHER HALF OF RECENTS-CORRUPT-ERASED: the bytes are safe now (main refuses
// to overwrite a store it could not read), and a user in front of an empty list
// still has to be TOLD, or the next project silently fails to appear in it and
// the repair is undiscoverable. An unreadable store draws exactly like a first
// run.
//
// The decision lives in state/recents.ts rather than in the three surfaces that
// list recents, because a sentence duplicated across App.tsx, HomeTab.tsx and
// Explorer.tsx drifts, and because .tsx never executes in the node suite - so a
// toast decided inside a component is a decision no test in this repo can reach.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadRecents, recordRecentProject } from '../recents';
import { useToastStore } from '../toastStore';
import type { RecentsState } from '../../../shared/recents';
import type { RecentProject } from '../../../shared/ipc-types';

const PROJ: RecentProject = { path: '/home/u/proj', name: 'proj', lastOpened: 1 };

function state(over: Partial<RecentsState>): RecentsState {
  return {
    projects: [], read: 'read', reason: null,
    path: '/home/u/.config/aurora/recent-projects.json', dropped: 0,
    ...over,
  };
}

function installWindowApi(answer: RecentsState) {
  const get = vi.fn(async () => answer);
  const add = vi.fn(async () => answer);
  (globalThis as { window?: unknown }).window = {
    api: { getRecentProjects: get, addRecentProject: add },
  };
  return { get, add };
}

const errors = () => useToastStore.getState().toasts.filter((t) => t.type === 'error').map((t) => t.message);

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  vi.useFakeTimers();
});

describe('the renderer says so when the recents store could not be read', () => {
  it('an unreadable store produces an error toast naming the file and the repair', async () => {
    installWindowApi(state({ read: 'unreadable', reason: 'invalid JSON: Unexpected token }' }));
    const list = await loadRecents();
    expect(list).toEqual([]);
    expect(errors()).toHaveLength(1);
    expect(errors()[0]).toContain('/home/u/.config/aurora/recent-projects.json');
    expect(errors()[0]).toContain('invalid JSON');
    // The clause that makes it actionable, and the one a generic "could not load
    // recents" message would omit.
    expect(errors()[0]).toMatch(/has NOT been changed/);
  });

  it('the open path says it too, because that is the write that used to destroy the file', async () => {
    installWindowApi(state({ read: 'unreadable', reason: 'EACCES: permission denied' }));
    await recordRecentProject('/home/u/proj', 'proj');
    expect(errors()).toHaveLength(1);
    expect(errors()[0]).toContain('EACCES');
  });

  it('three surfaces listing the same store produce ONE toast, not three', async () => {
    // App's welcome screen, the Home tab and the Explorer can all mount inside the
    // same second. Three identical ten-second errors is the wall that teaches
    // people to swat toasts.
    installWindowApi(state({ read: 'unreadable', reason: 'EIO' }));
    await loadRecents();
    await loadRecents();
    await loadRecents();
    expect(errors()).toHaveLength(1);
  });

  it('CONTROL: a genuinely absent store is SILENT, and so is a store that read fine', async () => {
    // The vacuity trap for the rows above: a helper that toasted on every empty
    // list would satisfy all three of them and would fire on every first run,
    // where nothing is wrong and there is nothing to act on.
    installWindowApi(state({ read: 'absent' }));
    expect(await loadRecents()).toEqual([]);
    expect(errors()).toEqual([]);

    installWindowApi(state({ read: 'read', projects: [PROJ] }));
    expect(await loadRecents()).toEqual([PROJ]);
    expect(errors()).toEqual([]);
  });

  it('CONTROL: a readable store with rows DROPPED from within it is still silent', async () => {
    // `dropped` is a row-level defect, not a file-level one. Toasting on it would
    // be the same substitution the write gate must not make: the question is
    // whether Aurora SAW the file, never whether anything in it was wrong.
    installWindowApi(state({ read: 'read', projects: [PROJ], dropped: 2 }));
    expect(await loadRecents()).toEqual([PROJ]);
    expect(errors()).toEqual([]);
  });
});
