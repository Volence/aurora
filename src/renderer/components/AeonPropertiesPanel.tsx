import React from 'react';
import PropertiesPanel from './shared/PropertiesPanel';
import { useAeonPropertiesPort } from '../providers/properties-aeon';

/**
 * Aeon's properties panel: a two-line adapter over the engine-neutral
 * shared/PropertiesPanel (stage-4 plan 5, task 2). Everything aeon-shaped — the
 * sections, the BG library, and the panel's one command — is in
 * providers/properties-aeon.
 *
 * The wrapper exists for the same reason ChunkLibrary's does: the four facets
 * that show this panel keep the store subscriptions in a LEAF rather than in the
 * whole right-hand panel column. Calling the port hook in the facet's panel
 * component instead would re-render every sibling section (the chunk wall, the
 * art browser, the object list) on every viewport pan and every live-edit tick.
 * Cheap today, but the shape is what the remaining plan-5 tasks copy.
 *
 * It also makes the subscription collapsible: CollapsibleSection renders
 * `{!collapsed && children}`, so folding Properties away UNSUBSCRIBES it. A hook
 * called one level up would keep listening to a panel nobody can see.
 *
 * @param showObjectSelection Layout facet only — see the flag's docblock in
 *   providers/properties-aeon.
 */
export default function AeonPropertiesPanel(
  { showObjectSelection = false }: { showObjectSelection?: boolean },
): React.ReactElement | null {
  return <PropertiesPanel port={useAeonPropertiesPort({ showObjectSelection })} />;
}
