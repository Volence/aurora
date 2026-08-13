// Per-facet allowed tool sets (spec §4: one tool system, facet-scoped docks).
// The facets share one MapViewport + one editorStore.tool; this module is the
// single source of which tools each facet offers. First entry = facet default.
//
// Also home of the facet-switch action (switchFacet: setFacet + tool re-scope),
// so non-component callers — the agent-handler (Task 14), ChunkLibrary /
// MapViewport call sites (Task 12) — never import a .tsx to switch facets. This
// makes facet-tools store-coupled; no cycle results (editorStore/workspaceStore
// do not import facet-tools).

import type { FacetCapability } from '../../core/project/adapter';
import { useEditorStore, type EditorTool } from '../state/editorStore';
import { useWorkspaceStore } from './workspaceStore';

export const FACET_TOOLS: Partial<Record<FacetCapability, readonly EditorTool[]>> = {
  layout: ['stamp-chunk', 'select', 'view', 'marquee', 'paint-tile', 'paint-block'],
  objects: ['place-object', 'select', 'view'],
  rings: ['place-ring', 'select', 'view'],
  collision: ['paint-collision', 'view'],
  palette: ['view'],
  // 'art' is absent: the Art facet runs the artStore tool system, not EditorTool.
};

/** Facet switch rule: keep the current tool when the target facet allows it,
 *  else the facet default (spec §4 — switching facets keeps context where
 *  meaningful). */
export function toolForFacet(facet: FacetCapability, current: EditorTool): EditorTool {
  const tools = FACET_TOOLS[facet];
  if (!tools || tools.length === 0) return current;
  return tools.includes(current) ? current : tools[0];
}

/** Facet switch action: remember the per-tab facet + fix the tool to the
 *  facet's set (toolForFacet). Lives here (not in FacetBar.tsx) so non-component
 *  callers can import it without pulling in a React component module. */
export function switchFacet(tabId: string, facet: FacetCapability): void {
  useWorkspaceStore.getState().setFacet(tabId, facet);
  useEditorStore.getState().setTool(toolForFacet(facet, useEditorStore.getState().tool));
}
