// Collision facet — collision painting (spec §5): same canvas, collision tool
// only, the collision shape palette on the right. Properties is kept for
// parity with the legacy branch, which rendered it unconditionally for every
// tool (including paint-collision). Deliberate delta from that legacy every-
// tool panel set: the map.art ArtBrowser section is dropped here — it's
// layout-editing context, not collision context (spec §4).
//
// NO SECTION NAVIGATOR HERE, and that is a judgement rather than an oversight.
// CollisionPalette's Sec N / Reset / Clear row acts on
// `editorStore.activeSectionIndex`, and Reset and Clear are wholesale, so "which
// section is active" matters more on this facet than anywhere else. The obvious
// fix — mount Layout's SectionGridNav — mounts the wrong component: it is the
// act-STRUCTURE editor (insert / remove / move-by-drag / copy-paste / resize the
// grid), so it would put layout restructuring on the collision facet, which is
// the same panel bleed the ArtBrowser was dropped for. (components/SectionList
// is a pure navigator but is legacy and mounted nowhere.)
//
// What closes the actual hole is the canvas claiming the section it paints:
// MapViewport's paint-collision branch now sets activeSectionIndex before it
// paints rather than only on a successful edit, so the index follows the user's
// last collision click. Guarded in components/__tests__/section-claim.test.ts.
// A collision-appropriate section READOUT/picker is still a fair design ask.

import React from 'react';
import CollisionPalette from '../../components/CollisionPalette';
import AeonPropertiesPanel from '../../components/AeonPropertiesPanel';
import { Panel, CollapsibleSection } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

function CollisionPanels() {
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Collision">
        <CollisionPalette variant="map" />
      </CollapsibleSection>
      {/* Subscriptions live in the AeonPropertiesPanel leaf, not this column. */}
      <CollapsibleSection id="map.props" title="Properties"><AeonPropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const collisionFacet: FacetModule = mapFacet('collision', { RightPanel: CollisionPanels });
