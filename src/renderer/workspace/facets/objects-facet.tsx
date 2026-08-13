// Objects facet — instance placement (spec §5): same canvas, object tools only,
// object palette + inspector on the right. Deliberate delta from the legacy
// every-tool panel set: the map.art ArtBrowser section is dropped here — it's
// layout-editing context, not object-placement context (spec §4).

import React from 'react';
import MapViewport from '../../components/MapViewport';
import ObjectPalette from '../../components/ObjectPalette';
import PropertiesPanel from '../../components/PropertiesPanel';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function ObjectsPanels() {
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Objects">
        <ObjectPalette
          selectedType={0}
          onSelectType={(type, subtype) => useEditorStore.getState().setSelectedObjectTypeId(String(type), subtype)}
        />
      </CollapsibleSection>
      <CollapsibleSection id="map.props" title="Properties"><PropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const objectsFacet: FacetModule = {
  id: 'objects',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="objects" />,
  RightPanel: ObjectsPanels,
  StatusBar: MapStatusBar,
};
