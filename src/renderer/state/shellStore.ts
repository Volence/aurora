// Shell-chrome state that isn't session state: the explorer's rail/full
// toggle (Ctrl+B, spec §3). Persisted like panel collapse state.

import { create } from 'zustand';

const KEY = 'aurora.shell.explorer-collapsed';

function loadCollapsed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

interface ShellState {
  explorerCollapsed: boolean;
  toggleExplorer: () => void;
}

export const useShellStore = create<ShellState>((set) => ({
  explorerCollapsed: typeof localStorage !== 'undefined' ? loadCollapsed() : false,
  toggleExplorer: () =>
    set((s) => {
      const next = !s.explorerCollapsed;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return { explorerCollapsed: next };
    }),
}));
