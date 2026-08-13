// Registers every built facet module (idempotent). App calls this at mount;
// tests call it directly. Grows one line per facet task.

import { registerBuiltinFacets } from '../../core/shell/facets';
import { registerFacetModule } from './facet-registry';
import { layoutFacet } from './facets/layout-facet';

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  registerFacetModule(layoutFacet);
}
