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
import { openCapabilities, type OpenEngine } from '../state/open-project';
import { useWorkspaceStore } from './workspaceStore';
// Import cycle, on purpose and benign: facet-registry → MapFacetDock →
// facet-tools → facet-registry. Nothing here reads a facet-registry binding at
// module-init time — `moduleFor` is called only from inside resolveFacet — so
// the partially-initialised module a cycle hands back is never observed. The
// alternative was a `served` predicate parameter every call site would have to
// build from moduleFor anyway, which moves the coupling without removing it.
import { moduleFor } from './facet-registry';

/** The SHELL's default tool set per facet — what a facet offers when the open
 *  profile declares nothing for it. Written for aeon, which is why aeon's
 *  manifest declares no facetTools of its own. */
export const FACET_TOOLS: Partial<Record<FacetCapability, readonly EditorTool[]>> = {
  layout: ['stamp-chunk', 'select', 'view', 'marquee', 'paint-tile', 'paint-block'],
  objects: ['place-object', 'select', 'view'],
  rings: ['place-ring', 'select', 'view'],
  collision: ['paint-collision', 'view'],
  palette: ['view'],
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
 * Declaration REPLACES the default (see the manifest's docblock): classic's
 * layout needs `place-object`, which the default set does not contain, so
 * intersecting would delete the tool the declaration exists to add.
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

/**
 * Which facet the shell can ACTUALLY show for `requested`: `requested` itself
 * when the open engine both grants and serves it, else the first facet in the
 * grant that it does serve, else null.
 *
 * A facet is "served" only if it is BOTH granted and has a module. That is the
 * same set FacetBar shows pills for: the bar's extra term — the facet
 * DESCRIPTOR registry — cannot narrow it, because registerBuiltinFacets
 * registers a descriptor for every FacetCapability there is and both register
 * functions call it.
 *
 * Registration alone is not enough: a session saved while s1 still granted
 * `collision` reopens naming a facet with no pill, and honouring it would put a
 * screen up that the bar cannot represent.
 *
 * Lives here rather than in LevelWorkspace because a decision inside a component
 * is a decision the node-only suite cannot test — and the interesting cases
 * (grant/registration disagreeing, the idempotence the effect's loop-freedom
 * rests on) are all in this function.
 *
 * Null is a real answer, not a failure to find one: the served set can
 * legitimately be empty — a new engine whose modules are not written yet — and
 * LevelWorkspace's FacetUnavailable is the honest terminal state for that.
 */
export function resolveFacet(
  engine: OpenEngine | null,
  granted: readonly FacetCapability[],
  requested: FacetCapability,
): FacetCapability | null {
  if (!engine) return null;
  const served = (f: FacetCapability) => granted.includes(f) && moduleFor(engine, f) !== null;
  if (served(requested)) return requested;
  // Grant order, not registry order: the grant is the profile's own statement of
  // what this engine leads with, and `granted` is what the caller already has.
  return granted.find(served) ?? null;
}

/** Facet switch action: remember the per-tab facet + fix the tool to the
 *  facet's set (toolForFacet). Lives here (not in FacetBar.tsx) so non-component
 *  callers can import it without pulling in a React component module. */
export function switchFacet(tabId: string, facet: FacetCapability): void {
  useWorkspaceStore.getState().setFacet(tabId, facet);
  useEditorStore.getState().setTool(toolForFacet(facet, useEditorStore.getState().tool));
}
