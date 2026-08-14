// Layout facet — the aeon map editor as a facet module. Canvas/dock/panels are
// the former LegacyWorkspace map-branch content, unchanged in behavior; the
// dock is tool-scoped by FACET_TOOLS.layout.

import React from 'react';
import SectionGridNav from '../../components/SectionGridNav';
import ChunkLibrary from '../../components/ChunkLibrary';
import MarqueePasteOptions from '../../components/MarqueePasteOptions';
import ArtBrowser from '../../components/ArtBrowser';
import PaletteViewer from '../../components/PaletteViewer';
import AeonPropertiesPanel from '../../components/AeonPropertiesPanel';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { mapFacet, type FacetModule } from '../facet-registry';

function LayoutPanels() {
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="aeon.sections" title="Sections"><SectionGridNav /></CollapsibleSection>
      {/* Same paste-suppression rule as the old map branch (see the original
          LegacyWorkspace comment): pasting overrides every tool's options panel. */}
      {/* ONE id for these two, and that reuse IS deliberate: they are mutually
          exclusive contents of a single slot that retitles itself, so a shared
          collapse preference is a preference about the slot and matches what
          you see. That is the ONLY place the reuse holds — `map.palette` used
          to name this slot and was copied into rings, collision and objects
          too, where the sections are neither exclusive nor the same content, so
          collapsing Chunks here silently collapsed Ring Patterns two facets
          over. Engine-scoped and named for the slot, per the convention
          classic's `classic.chunks` / `classic.artChunks` established. */}
      {!pasting && tool === 'stamp-chunk' && (
        <CollapsibleSection id="aeon.layoutOptions" title="Chunks"><ChunkLibrary /></CollapsibleSection>
      )}
      {(tool === 'marquee' || pasting) && (
        <CollapsibleSection id="aeon.layoutOptions" title={pasting ? 'Paste' : 'Marquee'}>
          <MarqueePasteOptions />
        </CollapsibleSection>
      )}
      <CollapsibleSection id="aeon.art" title="Art"><ArtBrowser /></CollapsibleSection>
      {/* The object readout is on HERE and nowhere else: Layout offers the
          `select` tool, and this panel is the only thing in the facet that shows
          what you picked. The Objects facet has the real editor instead.
          The panel's store subscriptions live in the AeonPropertiesPanel leaf,
          not in this column — see that file. */}
      <CollapsibleSection id="aeon.props" title="Properties"><AeonPropertiesPanel showObjectSelection /></CollapsibleSection>
    </Panel>
  );
}

export const layoutFacet: FacetModule = mapFacet('layout', {
  RightPanel: LayoutPanels,
  BottomExtra: PaletteViewer,
});
