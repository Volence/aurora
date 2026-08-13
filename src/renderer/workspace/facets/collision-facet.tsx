// Collision facet — collision painting (spec §5): same canvas, collision tool
// only, the collision shape palette on the right (no Properties section — the
// old map branch had none for the collision tool either).

import React from 'react';
import MapViewport from '../../components/MapViewport';
import CollisionPalette from '../../components/CollisionPalette';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function CollisionPanels() {
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Collision">
        <CollisionPalette variant="map" />
      </CollapsibleSection>
    </Panel>
  );
}

export const collisionFacet: FacetModule = {
  id: 'collision',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="collision" />,
  RightPanel: CollisionPanels,
  StatusBar: MapStatusBar,
};
