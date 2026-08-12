// Facet descriptors for the level workspace (spec §4/§9). A facet is a lens
// over one level; which facets a workspace shows is registered-facets ∩ the
// project profile's capability list. Renderer components (canvas view, right
// panel, tool set) attach to these ids in later stages — core owns only the
// descriptor and the gating rule, so it stays fs- and React-free.

import { createRegistry, type Registry } from './registry';

/** Capability keys a profile may grant (spec §7). Superset of built-in facets:
 *  parallax/events/preview are declared now so profiles can be authored against
 *  them, but have no built-in facet until their stages land (no dead chrome). */
export type FacetCapability =
  | 'layout' | 'art' | 'objects' | 'rings' | 'collision' | 'palette'
  | 'parallax' | 'events' | 'preview';

export interface FacetDescriptor {
  readonly id: FacetCapability;
  readonly label: string;
  /** Display position in the facet bar; ascending. Built-ins use gaps of 10 so
   *  future facets (parallax 25, events 45, …) slot between without renumbering. */
  readonly order: number;
}

export const facetRegistry: Registry<FacetDescriptor> = createRegistry<FacetDescriptor>('Facet');

const BUILTIN_FACETS: FacetDescriptor[] = [
  { id: 'layout', label: 'Layout', order: 0 },
  { id: 'art', label: 'Art', order: 10 },
  { id: 'objects', label: 'Objects', order: 20 },
  { id: 'rings', label: 'Rings', order: 30 },
  { id: 'collision', label: 'Collision', order: 40 },
  { id: 'palette', label: 'Palette', order: 50 },
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
