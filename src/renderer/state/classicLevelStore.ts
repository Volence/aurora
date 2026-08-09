// classicLevelStore — the currently-open classic (Sonic 1) level: which act is
// selected and its loaded LevelDoc.
//
// TASK 11 SCOPE (read-only): this store holds only {ref, doc, status, error}.
// Selecting an act in the zone tree calls `openAct`, which reads the LevelDoc
// through the ProjectHandle held in classicProjectStore
// (handle.levels.read(ref)) and transitions loading → ready | error.
//
// FORWARD-COMPATIBLE (Task 12): the editing commands land here on the shared
// undo history and will add `dirty` domain tracking + mutation actions. The
// state shape ({ref, doc, status}) is chosen so those additions are additive —
// Task 12 layers commands over the same `doc` this task loads. Keep the read
// path (`openAct`) intact when editing lands.

import { create } from 'zustand';
import type { LevelDoc, ZoneActRef } from '../../core/project/adapter';
import { useClassicProjectStore } from './classicProjectStore';

export type ClassicLevelStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ClassicLevelState {
  /** The act currently selected in the zone tree (even while loading/errored). */
  ref: ZoneActRef | null;
  /** The loaded document, present only in the 'ready' state. */
  doc: LevelDoc | null;
  status: ClassicLevelStatus;
  /** Human-readable failure reason when status === 'error'. */
  error: string | null;

  /** Select + load an act. Reads through the open project's handle. */
  openAct: (ref: ZoneActRef) => Promise<void>;
  reset: () => void;
}

const IDLE = {
  ref: null,
  doc: null,
  status: 'idle' as ClassicLevelStatus,
  error: null,
};

// A monotonically-increasing token guards against a slow read for act A landing
// after the user has already selected act B — only the latest request commits.
let loadToken = 0;

export const useClassicLevelStore = create<ClassicLevelState>((set) => ({
  ...IDLE,

  openAct: async (ref: ZoneActRef): Promise<void> => {
    const token = ++loadToken;
    // Unavailable acts carry their resolution reason — surface it directly
    // rather than attempting a read the handle would reject.
    if (!ref.available) {
      set({ ref, doc: null, status: 'error', error: ref.reason ?? 'act unavailable' });
      return;
    }
    const handle = useClassicProjectStore.getState().handle;
    if (!handle || !handle.levels) {
      set({ ref, doc: null, status: 'error', error: 'no classic project is open' });
      return;
    }
    set({ ref, doc: null, status: 'loading', error: null });
    try {
      const doc = await handle.levels.read(ref);
      if (token !== loadToken) return; // superseded by a newer selection
      set({ ref, doc, status: 'ready', error: null });
    } catch (e) {
      if (token !== loadToken) return;
      set({ ref, doc: null, status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  reset: () => {
    loadToken++; // invalidate any in-flight read
    set({ ...IDLE });
  },
}));
