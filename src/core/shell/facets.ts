// Facet descriptors for the level workspace (spec §4/§9). A facet is a lens
// over one level; which facets a workspace shows is registered-facets ∩ the
// project profile's capability list. Renderer components (canvas view, right
// panel, tool set) attach to these ids in later stages — core owns only the
// descriptor and the gating rule, so it stays fs- and React-free.

import { createRegistry, type Registry } from './registry';
import type { FacetCapability } from '../project/adapter';

export type { FacetCapability } from '../project/adapter';

export interface FacetDescriptor {
  readonly id: FacetCapability;
  readonly label: string;
  /** Display position in the facet bar; ascending. Built-ins use gaps of 10 so
   *  future facets (parallax 15, events 35, …) slot between without renumbering. */
  readonly order: number;
}

export const facetRegistry: Registry<FacetDescriptor> = createRegistry<FacetDescriptor>('Facet');

/**
 * THE ORDERING RULE: facets that share a CANVAS are adjacent, and the facet that
 * SWAPS the canvas goes last.
 *
 * Five of the six are lenses over the same map viewport — layout, objects,
 * rings, collision and palette all draw the act and differ in their tools and
 * their right-hand column. `art` is the only one that replaces the canvas
 * outright with a composer. So a pill press is one of two quite different
 * gestures, and the bar should say which: inside the map group it swaps the
 * TOOLS AND PANELS over a scene that does not move, and the single step onto
 * `art` is the one place the scene genuinely changes.
 *
 * `art` used to sit second, which put that one real scene change in the MIDDLE
 * of the group that isn't one — so moving Layout → Objects read as crossing it,
 * and every pill press felt like it might take the act away. That is the whole
 * reason the Objects facet was briefly merged into Layout (2026-08-14): the
 * distance was the ordering's, not the facet's. Reordering is the fix; the
 * facets themselves are fine.
 *
 * A new facet therefore does NOT just take the next free number. If its canvas
 * is the map it belongs before `art`; if it swaps the canvas it belongs after —
 * which needs a renumber, and should, because there is no longer one group.
 *
 * Registration order is kept the same as display order so the array reads as the
 * bar reads. `facetsFor` sorts on `order` regardless, so the two cannot drift
 * into disagreeing about the pills — only about how this list scans.
 */
const BUILTIN_FACETS: FacetDescriptor[] = [
  { id: 'layout', label: 'Layout', order: 0 },
  { id: 'objects', label: 'Objects', order: 10 },
  { id: 'rings', label: 'Rings', order: 20 },
  { id: 'collision', label: 'Collision', order: 30 },
  { id: 'palette', label: 'Palette', order: 40 },
  // The canvas swap. Last on purpose — see the rule above.
  { id: 'art', label: 'Art', order: 50 },
];

/** Idempotent: multiple entry points (renderer boot, tests) may call it. */
export function registerBuiltinFacets(): void {
  for (const f of BUILTIN_FACETS) {
    if (!facetRegistry.get(f.id)) facetRegistry.register(f);
  }
}

/** The facet bar for a level workspace: granted ∩ registered, by order. */
export function facetsFor(capabilities: readonly FacetCapability[]): FacetDescriptor[] {
  return facetRegistry
    .list()
    .filter((f) => capabilities.includes(f.id))
    .sort((a, b) => a.order - b.order);
}
