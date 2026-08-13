// Layout facet — the aeon map editor as a facet module. Canvas/dock/panels are
// the former LegacyWorkspace map-branch content, unchanged in behavior; the
// dock is tool-scoped by FACET_TOOLS.layout.

import React from 'react';
import MapViewport from '../../components/MapViewport';
import SectionGridNav from '../../components/SectionGridNav';
import ChunkLibrary from '../../components/ChunkLibrary';
import MarqueePasteOptions from '../../components/MarqueePasteOptions';
import ArtBrowser from '../../components/ArtBrowser';
import PaletteViewer from '../../components/PaletteViewer';
import PropertiesPanel from '../../components/PropertiesPanel';
import MapStatusBar from '../../shell/MapStatusBar';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { MapFacetDock } from '../MapFacetDock';
import type { FacetModule } from '../facet-registry';

function LayoutPanels() {
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.sections" title="Sections"><SectionGridNav /></CollapsibleSection>
      {/* Same paste-suppression rule as the old map branch (see the original
          LegacyWorkspace comment): pasting overrides every tool's options panel. */}
      {!pasting && tool === 'stamp-chunk' && (
        <CollapsibleSection id="map.palette" title="Chunks"><ChunkLibrary /></CollapsibleSection>
      )}
      {(tool === 'marquee' || pasting) && (
        <CollapsibleSection id="map.palette" title={pasting ? 'Paste' : 'Marquee'}>
          <MarqueePasteOptions />
        </CollapsibleSection>
      )}
      <CollapsibleSection id="map.art" title="Art"><ArtBrowser /></CollapsibleSection>
      <CollapsibleSection id="map.props" title="Properties"><PropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const layoutFacet: FacetModule = {
  id: 'layout',
  Canvas: MapViewport,
  ToolDock: () => <MapFacetDock facet="layout" />,
  RightPanel: LayoutPanels,
  BottomExtra: PaletteViewer,
  StatusBar: MapStatusBar,
};
