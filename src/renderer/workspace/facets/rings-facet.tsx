// Rings facet — ring-pattern placement (spec §5): same canvas, ring tools only,
// ring pattern palette + inspector on the right. Deliberate delta from the
// legacy every-tool panel set: the map.art ArtBrowser section is dropped here
// — it's layout-editing context, not ring-placement context (spec §4).

import React from 'react';
import MapViewport from '../../components/MapViewport';
import RingPatternPalette from '../../components/RingPatternPalette';
import PropertiesPanel from '../../components/PropertiesPanel';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function RingsPanels() {
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Ring Patterns">
        {/* selectedIndex via getState() — verbatim from the legacy map branch; its non-reactivity is pre-existing behavior */}
        <RingPatternPalette
          selectedIndex={useEditorStore.getState().selectedRingPattern}
          onSelect={(index) => useEditorStore.getState().setSelectedRingPattern(index)}
        />
      </CollapsibleSection>
      <CollapsibleSection id="map.props" title="Properties"><PropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const ringsFacet: FacetModule = {
  id: 'rings',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="rings" />,
  RightPanel: RingsPanels,
  StatusBar: MapStatusBar,
};
