// Regions facet — the act through the painted-identity lens (editor spec §3.1).
//
// A LENS, NOT A NEW CANVAS, exactly as the Effects facet is: the canvas stays
// `MapViewport` so the author edits regions with the act they belong to in front
// of them, and the right-hand column is the list, the bindings rows and the
// status line. That is why this is `mapFacet` and not a canvas-swapping facet.
//
// THE CANVAS HALF IS NOT IN THIS FILE. §3.4's map overlay (the per-region hue,
// the union outline) is `canvas/region-overlay.ts`, and the world-space
// marquee and carve are `components/map-region-gesture.ts` over
// `core/editing/region-marquee.ts`, all step 8. Selecting a list row writes
// `editorStore.selectedRegionId`, which is the state that overlay reads.
//
// ═══ THE DISAMBIGUATOR (§3.1) ══════════════════════════════════════════════
//
// §3.1: "the same drag means marquee in Map, collision brush in Collision, and
// region rectangle here, and the facet is the only disambiguator." The tools
// this facet offers are `FACET_TOOLS.regions` in `workspace/facet-tools.ts`;
// read them there rather than here. (ROADMAP row 212, 2026-09-25: this header
// said "NOTHING HERE DRAWS ON THE CANVAS YET" and that `FACET_TOOLS.regions` is
// `['view']` with no `region` ToolId. Step 8B added the rectangle and the
// table has read `['view', 'region']` since; the snapshot had no reader.)

import React from 'react';
import RegionsPanel from '../../components/regions/RegionsPanel';
import { mapFacet, type FacetModule } from '../facet-registry';

export const regionsFacet: FacetModule = mapFacet('regions', {
  RightPanel: () => React.createElement(RegionsPanel),
});
