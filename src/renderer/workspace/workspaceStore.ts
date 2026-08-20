// Per-tab workspace UI state (active facet, viewport snapshot) — the renderer
// half of core/shell/session-persistence's WorkspaceRecord. Keyed by tab id.
// Session restore seeds it (Task 16); the facet bar and tab activation write it.
//
// Usage note: facetFor/viewFor are keyed getters, not plain state fields —
// components MUST select the RETURN VALUE, e.g.
// `useWorkspaceStore((s) => s.facetFor(tabId))`, never the function reference
// (`s.facetFor` alone). A bare function reference never changes identity
// across set() calls, so selecting it silently skips re-renders (stale UI,
// no error). This store is the codebase's first keyed-getter-in-state shape,
// so there's no existing precedent to copy from.

import { create } from 'zustand';
import type { FacetCapability } from '../../core/project/adapter';
import type { WorkspaceRecord, S1ZoneKey } from '../../core/shell/session-persistence';

export interface TabView { x: number; y: number; zoom: number }

interface WorkspaceState {
  record: WorkspaceRecord;
  facetFor: (tabId: string) => FacetCapability;
  viewFor: (tabId: string) => TabView | null;
  /** The zone/act an s1 sprite-doc tab's checkout resolved against (persisted
   *  tab identity — see S1ZoneKey), or null when never checked out / legacy. */
  s1ZoneFor: (tabId: string) => S1ZoneKey | null;
  setFacet: (tabId: string, facet: FacetCapability) => void;
  setView: (tabId: string, view: TabView) => void;
  setS1Zone: (tabId: string, s1Zone: S1ZoneKey) => void;
  /** Session restore: replace the whole record. */
  seed: (record: WorkspaceRecord) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  record: {},
  facetFor: (tabId) => get().record[tabId]?.facet ?? 'layout',
  viewFor: (tabId) => get().record[tabId]?.view ?? null,
  s1ZoneFor: (tabId) => get().record[tabId]?.s1Zone ?? null,
  setFacet: (tabId, facet) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], facet } } })),
  setView: (tabId, view) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], view } } })),
  setS1Zone: (tabId, s1Zone) =>
    set((s) => ({ record: { ...s.record, [tabId]: { ...s.record[tabId], s1Zone } } })),
  seed: (record) => set({ record }),
  reset: () => set({ record: {} }),
}));
