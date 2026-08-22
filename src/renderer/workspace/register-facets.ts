// Registers every built facet module (idempotent). App calls this at mount;
// tests call it directly. Grows one line per facet task.

import { registerBuiltinFacets } from '../../core/shell/facets';
import { registerFacetModule } from './facet-registry';
import { layoutFacet } from './facets/layout-facet';
import { artFacet } from './facets/art-facet';
import { objectsFacet } from './facets/objects-facet';
import { ringsFacet } from './facets/rings-facet';
import { collisionFacet } from './facets/collision-facet';
import { paletteFacet } from './facets/palette-facet';
import { effectsFacet } from './facets/effects-facet';
import { s1LayoutFacet, s1ObjectsFacet, s1CollisionFacet, s1PaletteFacet, s1ArtFacet } from './facets/s1-facets';

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  for (const m of [layoutFacet, artFacet, objectsFacet, ringsFacet, collisionFacet, paletteFacet,
    effectsFacet]) {
    registerFacetModule(['aeon'], m);
  }
}

/**
 * Classic's five modules — exactly the five the s1 profile grants, so every pill
 * classic shows leads somewhere and no facet it serves is missing a pill. The
 * list moves WITH the grant in core/project/s1/index.ts: a module for an
 * ungranted facet is unreachable code (FacetBar shows granted ∩ registered), and
 * a grant with no module is a pill that lands on FacetUnavailable.
 *
 * Listed in pill order, which is not a requirement (FacetBar sorts on the
 * descriptor's `order`) but keeps this readable against the grant it mirrors.
 *
 * Registered separately from aeon's rather than merged into one function: the
 * two lists are independent, and a single `registerAllFacetModules` would hide
 * which engine a registration failure came from at the one call site that
 * matters (App's mount).
 */
export function registerS1FacetModules(): void {
  registerBuiltinFacets();
  for (const m of [s1LayoutFacet, s1ObjectsFacet, s1CollisionFacet, s1PaletteFacet, s1ArtFacet]) {
    registerFacetModule(['s1'], m);
  }
}
