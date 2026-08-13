// Palette facet — the level through a palette lens: view-only canvas, the
// single palette editor (spec §4) as the panel content.

import React from 'react';
import MapViewport from '../../components/MapViewport';
import PaletteEditor from '../../components/art/PaletteEditor';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function PalettePanels() {
  return (
    <Panel width={280} scroll>
      <CollapsibleSection id="palette.editor" title="Palette">
        <PaletteEditor />
      </CollapsibleSection>
    </Panel>
  );
}

export const paletteFacet: FacetModule = {
  id: 'palette',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="palette" />,
  RightPanel: PalettePanels,
  StatusBar: MapStatusBar,
};
