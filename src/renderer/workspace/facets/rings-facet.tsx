// Rings facet — ring-pattern placement (spec §5): same canvas, ring tools only,
// ring pattern palette + inspector on the right. Deliberate delta from the
// legacy every-tool panel set: the map.art ArtBrowser section is dropped here
// — it's layout-editing context, not ring-placement context (spec §4).

import React from 'react';
import RingPatternPalette from '../../components/RingPatternPalette';
import PropertiesPanel from '../../components/PropertiesPanel';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { mapFacet, type FacetModule } from '../facet-registry';

function RingsPanels() {
  // Reactive subscription (not a getState() read) so the highlighted swatch
  // stays in sync with selection changes made elsewhere.
  const selectedRingPattern = useEditorStore((s) => s.selectedRingPattern);
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="map.palette" title="Ring Patterns">
        <RingPatternPalette
          selectedIndex={selectedRingPattern}
          onSelect={(index) => useEditorStore.getState().setSelectedRingPattern(index)}
        />
      </CollapsibleSection>
      <CollapsibleSection id="map.props" title="Properties"><PropertiesPanel /></CollapsibleSection>
    </Panel>
  );
}

export const ringsFacet: FacetModule = mapFacet('rings', { RightPanel: RingsPanels });
