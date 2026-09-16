// Regions facet — the act through the painted-identity lens (editor spec §3.1).
//
// A LENS, NOT A NEW CANVAS, exactly as the Effects facet is: the canvas stays
// `MapViewport` so the author edits regions with the act they belong to in front
// of them, and the right-hand column is the list, the bindings rows and the
// status line. That is why this is `mapFacet` and not a canvas-swapping facet.
//
// ⚠ NOTHING HERE DRAWS ON THE CANVAS YET. §3.4's map overlay — the per-region
// hue, the union outline, the label at the top-left — is STEP 8, together with
// the world-space marquee and carve. Selecting a list row writes
// `editorStore.selectedRegionId`, which is the state step 8's overlay reads; the
// state is put in the right place now rather than moved out of a component
// later.
//
// ═══ THE DISAMBIGUATOR (§3.1), AND WHAT STEP 6 CAN HONESTLY ASSERT ═════════
//
// §3.1: "the same drag means marquee in Map, collision brush in Collision, and
// region rectangle here, and the facet is the only disambiguator." The region
// rectangle is step 8's, so `FACET_TOOLS.regions` is `['view']` and there is no
// `region` ToolId — see that file's note for why an unanswered tool id is worse
// than none. The half that IS true today, and that the CDP harness reads, is
// that arriving here disarms whatever the previous facet had armed.

import React from 'react';
import RegionsPanel from '../../components/regions/RegionsPanel';
import { mapFacet, type FacetModule } from '../facet-registry';

export const regionsFacet: FacetModule = mapFacet('regions', {
  RightPanel: () => React.createElement(RegionsPanel),
});
