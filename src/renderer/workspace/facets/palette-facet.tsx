// Palette facet — the level through a palette lens: view-only canvas, the
// single palette editor (spec §4) as the panel content.

import React from 'react';
import PaletteEditor from '../../components/art/PaletteEditor';
import { Panel, CollapsibleSection } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

function PalettePanels() {
  return (
    <Panel width={280} scroll>
      <CollapsibleSection id="palette.editor" title="Palette">
        <PaletteEditor />
      </CollapsibleSection>
    </Panel>
  );
}

export const paletteFacet: FacetModule = mapFacet('palette', { RightPanel: PalettePanels });
