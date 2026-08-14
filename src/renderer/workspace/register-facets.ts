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

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  for (const m of [layoutFacet, artFacet, objectsFacet, ringsFacet, collisionFacet, paletteFacet]) {
    registerFacetModule(['aeon'], m);
  }
}
