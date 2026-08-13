// Per-facet allowed tool sets (spec §4: one tool system, facet-scoped docks).
// The facets share one MapViewport + one editorStore.tool; this module is the
// single source of which tools each facet offers. First entry = facet default.

import type { FacetCapability } from '../../core/project/adapter';
import type { EditorTool } from '../state/editorStore';

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
