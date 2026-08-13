// Per-tab workspace UI state (active facet, viewport snapshot) — the renderer
// half of core/shell/session-persistence's WorkspaceRecord. Keyed by tab id.
// Session restore seeds it (Task 16); the facet bar and tab activation write it.

import { create } from 'zustand';
import type { FacetCapability } from '../../core/project/adapter';
import type { WorkspaceRecord } from '../../core/shell/session-persistence';

export interface TabView { x: number; y: number; zoom: number }

interface WorkspaceState {
  record: WorkspaceRecord;
  facetFor: (tabId: string) => FacetCapability;
  viewFor: (tabId: string) => TabView | null;
  setFacet: (tabId: string, facet: FacetCapability) => void;
  setView: (tabId: string, view: TabView) => void;
  /** Session restore: replace the whole record. */
  seed: (record: WorkspaceRecord) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  record: {},
  facetFor: (tabId) => get().record[tabId]?.facet ?? 'layout',
  viewFor: (tabId) => get().record[tabId]?.view ?? null,
  setFacet: (tabId, facet) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], facet } } })),
  setView: (tabId, view) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], view } } })),
  seed: (record) => set({ record }),
  reset: () => set({ record: {} }),
}));
