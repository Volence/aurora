// Zustand wrapper over the pure tab-session reducers (core/shell/session.ts).
// All rules live in core; this store only holds state and delegates, so the
// session behavior stays testable without React.

import { create } from 'zustand';
import {
  type SessionState, type TabDescriptor,
  initialSession, openTab, closeTab, focusTab, retitleTab,
} from '../../core/shell/session';

interface SessionStore extends SessionState {
  open: (tab: TabDescriptor) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  retitle: (id: string, title: string) => void;
  reset: () => void;
  /** Swap the whole session atomically (project switch / session restore). */
  replace: (next: SessionState) => void;
}

const asState = (s: SessionStore): SessionState => ({ tabs: s.tabs, activeId: s.activeId });

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialSession(),
  open: (tab) => set((s) => openTab(asState(s), tab)),
  close: (id) => set((s) => closeTab(asState(s), id)),
  focus: (id) => set((s) => focusTab(asState(s), id)),
  retitle: (id, title) => set((s) => retitleTab(asState(s), id, title)),
  reset: () => set(initialSession()),
  replace: (next) => set({ tabs: next.tabs, activeId: next.activeId }),
}));
