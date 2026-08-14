// Collision facet — collision painting (spec §5): same canvas, collision tool
// only, the collision shape palette on the right. Properties is kept for
// parity with the legacy branch, which rendered it unconditionally for every
// tool (including paint-collision). Deliberate delta from that legacy every-
// tool panel set: the map.art ArtBrowser section is dropped here — it's
// layout-editing context, not collision context (spec §4).

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
