// The everything-is-a-tab session model (spec §3), as pure reducers: the
// rules (Home pinned/uncloseable, open-focuses-existing, close falls to the
// right-then-left neighbor) live here, React/zustand-free, so they are
// testable in isolation. renderer/state/sessionStore.ts wraps these.
//
// Tab ids are stable identities shared with DocumentHistoryHub doc ids:
//   'home' | 'level:<zone>:<act>' | 'doc:<name>' | 'tool:<name>'
// Dirty state is NOT session state — documents/savers own dirtiness; the tab
// strip reads it from there at render time.

export const TAB_KINDS = ['home', 'level', 'sprite-doc', 'art-doc', 'palette-doc', 'tool'] as const;
export type TabKind = (typeof TAB_KINDS)[number];

export interface TabDescriptor {
  readonly id: string;
  readonly kind: TabKind;
  readonly title: string;
}

export interface SessionState {
  tabs: TabDescriptor[];
  activeId: string;
}

export const HOME_TAB: TabDescriptor = { id: 'home', kind: 'home', title: 'Home' };

export function initialSession(): SessionState {
  return { tabs: [HOME_TAB], activeId: HOME_TAB.id };
}

export function openTab(state: SessionState, tab: TabDescriptor): SessionState {
  if (state.tabs.some((t) => t.id === tab.id)) return { ...state, activeId: tab.id };
  return { tabs: [...state.tabs, tab], activeId: tab.id };
}

export function focusTab(state: SessionState, id: string): SessionState {
  return state.tabs.some((t) => t.id === id) ? { ...state, activeId: id } : state;
}

export function closeTab(state: SessionState, id: string): SessionState {
  if (id === HOME_TAB.id) return state;
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  let activeId = state.activeId;
  if (activeId === id) {
    // Right neighbor keeps you "in the flow"; fall back left, then Home.
    activeId = (tabs[idx] ?? tabs[idx - 1] ?? HOME_TAB).id;
  }
  return { tabs, activeId };
}

export function retitleTab(state: SessionState, id: string, title: string): SessionState {
  return { ...state, tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)) };
}

/**
 * Drop tabs whose targets no longer exist (project switch / stale persisted
 * session). Home is always kept and never offered to the predicate; a pruned
 * activeId falls back to Home.
 */
export function pruneSession(
  state: SessionState,
  isValid: (tab: TabDescriptor) => boolean,
): SessionState {
  const tabs = state.tabs.filter((t) => t.id === HOME_TAB.id || isValid(t));
  const activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : HOME_TAB.id;
  return { tabs, activeId };
}
