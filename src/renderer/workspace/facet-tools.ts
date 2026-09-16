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
import { openCapabilities } from '../state/open-project';
import { useWorkspaceStore } from './workspaceStore';

/** The SHELL's default tool set per facet — what a facet offers when the open
 *  profile declares nothing for it. Written for aeon, which is why aeon's
 *  manifest declares no facetTools of its own. */
export const FACET_TOOLS: Partial<Record<FacetCapability, readonly EditorTool[]>> = {
  // `stamp-band` (parcel J) sits beside `paint-tile`: both write Plane B's
  // layout words, one slot at a time or one band pattern at a time, and the
  // band is picked from the same Art panel the tile is.
  layout: ['stamp-chunk', 'select', 'view', 'marquee', 'paint-tile', 'paint-block', 'stamp-band'],
  objects: ['place-object', 'select', 'view'],
  rings: ['place-ring', 'select', 'view'],
  collision: ['paint-collision', 'view'],
  palette: ['view'],
  // The Effects lens: View (a pure pan — it leads, so a facet switch lands on
  // it) and the band mark. Item 43 hung the mark on View's mouseup because View
  // was this facet's only tool, and that made every pan-click a band gesture
  // with a wash the owner could not put out (triage 2026-08-26 §A.2/§A.3). The
  // guide drag stays on View: it grabs a LINE, and a miss pans. No scene
  // parameter is edited by clicking the act; the mark writes nothing either.
  // An EMPTY list would have been the other reading, and it is wrong —
  // `toolForFacet` returns the CURRENT tool for an empty set, so arriving here
  // from Layout would leave `stamp-chunk` armed over a canvas with no dock to
  // disarm it from.
  parallax: ['view', 'mark-band'],
  // ═══ THE DISAMBIGUATOR (editor spec §3.1), AND WHY `view` STILL LEADS ═══
  //
  // §3.1's whole point is that "the same drag means marquee in Map, collision
  // brush in Collision, and region rectangle here, and the facet is the only
  // disambiguator". STEP 8B ADDED THE REGION RECTANGLE, so both halves of that
  // sentence are now true here: arriving from Collision DISARMS the collision
  // brush and arriving from Layout DISARMS the marquee (`toolForFacet` falls
  // back to this list's first entry), and the drag this facet's own tool takes
  // means a region and nothing else.
  //
  // ⚠ `view` LEADS DELIBERATELY AND MUST KEEP LEADING. The first entry is the
  // facet DEFAULT, so it is what a facet switch lands on, and a facet switch
  // must land on a pure pan rather than an armed drawing tool — the same call
  // `parallax: ['view', 'mark-band']` made, for the reason written above it: a
  // facet whose arrival state is a document gesture turns every orienting click
  // into an edit. Here that edit would be a CARVE, because the Q1 ruling made
  // carve what every draw does, so the arrival state would be one click away
  // from trimming a region the author had not looked at yet.
  //
  // Step 6 shipped this as `['view']` alone and was right to: `TOOL_IDS`' own
  // `eraser` note (core/project/adapter.ts) records what a vocabulary entry no
  // canvas answers costs — a label, a hint and a dock icon for a button that
  // does nothing. `region` earns its entry now because `MapViewport` answers it.
  //
  // An EMPTY list would be the other reading and it is wrong for the reason
  // spelled out above `parallax`: `toolForFacet` returns the CURRENT tool for an
  // empty set, so arriving from Collision would leave `paint-collision` armed
  // over a canvas with no dock to disarm it from.
  regions: ['view', 'region'],
  // 'art' is absent: the Art facet runs the artStore tool system, not EditorTool.
};

/**
 * The tools the OPEN project's `facet` actually offers: the profile's
 * declaration when its manifest names this facet, else the shell default above.
 *
 * The ONE reader of `CapabilityManifest.facetTools`. Every consumer of "which
 * tools exist here" — the dock, the keyboard scoping, the facet-switch
 * re-scope, classic's chip row — goes through this, so a profile cannot offer a
 * tool in one place and have it rejected in another.
 *
 * Declaration REPLACES the default (see the manifest's docblock) — it does not
 * intersect it, so a profile can name a tool the default set lacks.
 *
 * The worked example used to be classic's layout carrying `place-object`, which
 * an intersection would have deleted. That declaration is gone (it made Objects
 * a strict subset of Layout), and s1's real list is now a strict SUBSET of the
 * default — which means NO shipping profile distinguishes replace from intersect
 * any more, and an intersect regression would pass every real-profile test there
 * is. The rule is still right, so the guard is a SYNTHETIC declaration:
 * __tests__/facet-tools.test.ts, "keeps a declared tool the shell default does
 * NOT have". That test is the reason this sentence can still be trusted.
 */
export function toolsForFacet(facet: FacetCapability): readonly EditorTool[] {
  return openCapabilities()?.facetTools?.[facet] ?? FACET_TOOLS[facet] ?? [];
}

/** Facet switch rule: keep the current tool when the target facet allows it,
 *  else the facet default (spec §4 — switching facets keeps context where
 *  meaningful). Reads the EFFECTIVE set, so a switch under classic can never
 *  land on a tool classic has no implementation for. */
export function toolForFacet(facet: FacetCapability, current: EditorTool): EditorTool {
  const tools = toolsForFacet(facet);
  if (tools.length === 0) return current;
  return tools.includes(current) ? current : tools[0];
}

/** Facet switch action: remember the per-tab facet + fix the tool to the
 *  facet's set (toolForFacet). Lives here (not in FacetBar.tsx) so non-component
 *  callers can import it without pulling in a React component module. */
export function switchFacet(tabId: string, facet: FacetCapability): void {
  useWorkspaceStore.getState().setFacet(tabId, facet);
  useEditorStore.getState().setTool(toolForFacet(facet, useEditorStore.getState().tool));
}
