// Registers every built facet module (idempotent). App calls this at mount;
// tests call it directly. Grows one line per facet task.

import { registerBuiltinFacets } from '../../core/shell/facets';
import { registerFacetModule } from './facet-registry';
import { registerFacetCanvas } from './facet-canvases';
import { layoutFacet } from './facets/layout-facet';
import { artFacet } from './facets/art-facet';
import { objectsFacet } from './facets/objects-facet';
import { ringsFacet } from './facets/rings-facet';
import { collisionFacet } from './facets/collision-facet';
import { paletteFacet } from './facets/palette-facet';

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  for (const m of [layoutFacet, artFacet, objectsFacet, ringsFacet, collisionFacet, paletteFacet]) {
    registerFacetModule(m);
    // The Canvas on each module IS aeon's canvas today; classic registers its
    // own when it is re-homed. Sourcing it from the module keeps one definition.
    registerFacetCanvas('aeon', m.id, m.Canvas);
  }
}
