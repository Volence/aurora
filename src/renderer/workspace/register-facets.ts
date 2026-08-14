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
import { s1LayoutFacet, s1ArtFacet, s1PaletteFacet } from './facets/s1-facets';

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  for (const m of [layoutFacet, artFacet, objectsFacet, ringsFacet, collisionFacet, paletteFacet]) {
    registerFacetModule(['aeon'], m);
  }
}

/**
 * Classic's three modules — exactly the three the s1 profile grants, so every
 * pill classic shows leads somewhere and no facet it serves is missing a pill.
 * The list moves WITH the grant in core/project/s1/index.ts: a module for an
 * ungranted facet is unreachable code (FacetBar shows granted ∩ registered), and
 * a grant with no module is a pill that lands on FacetUnavailable.
 *
 * Registered separately from aeon's rather than merged into one function: the
 * two lists are independent, and a single `registerAllFacetModules` would hide
 * which engine a registration failure came from at the one call site that
 * matters (App's mount).
 */
export function registerS1FacetModules(): void {
  registerBuiltinFacets();
  for (const m of [s1LayoutFacet, s1ArtFacet, s1PaletteFacet]) {
    registerFacetModule(['s1'], m);
  }
}
