// Layout facet — the aeon map editor as a facet module. Canvas/dock/panels are
// the former LegacyWorkspace map-branch content, unchanged in behavior; the
// dock is tool-scoped by FACET_TOOLS.layout.

import React from 'react';
import SectionGridNav from '../../components/SectionGridNav';
import ChunkLibrary from '../../components/ChunkLibrary';
import ChunkLinkOptions from '../../components/ChunkLinkOptions';
import MarqueePasteOptions from '../../components/MarqueePasteOptions';
import TileBrushOptions from '../../components/TileBrushOptions';
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
      <CollapsibleSection id="aeon.sections" title="Sections" variant="list"><SectionGridNav /></CollapsibleSection>
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
        <CollapsibleSection id="aeon.layoutOptions" title="Chunks" variant="list"><ChunkLibrary /></CollapsibleSection>
      )}
      {/* CHUNK LINKS gets its OWN slot rather than joining the retitling one
          above, and the reason is the rule that slot's own note states: the
          shared id is correct only for contents that are MUTUALLY EXCLUSIVE.
          This panel is shown at the same time as the Chunks grid, not instead
          of it — the checkbox arms the stamp the grid is picking a source for —
          so a shared collapse preference would be a preference about two
          things. See ChunkLinkOptions.tsx for the d-18c argument. */}
      {!pasting && tool === 'stamp-chunk' && (
        <CollapsibleSection id="aeon.chunkLinks" title="Chunk links"><ChunkLinkOptions /></CollapsibleSection>
      )}
      {(tool === 'marquee' || pasting) && (
        <CollapsibleSection id="aeon.layoutOptions" title={pasting ? 'Paste' : 'Marquee'}>
          <MarqueePasteOptions />
        </CollapsibleSection>
      )}
      {/* THIRD ARM OF THE SAME SLOT, and the shared id is correct for exactly
          the reason the note above gives: these are mutually exclusive contents
          of one retitling slot (a tool is stamp-chunk OR marquee OR a paint
          tool, never two), so a collapse preference here is a preference about
          the slot. Both paint tools share it because they write the same word
          through the same brush — a flip armed for paint-tile that silently
          dropped when you pressed B would be its own small version of the bug
          this panel exists to fix. */}
      {!pasting && (tool === 'paint-tile' || tool === 'paint-block') && (
        <CollapsibleSection id="aeon.layoutOptions" title="Brush">
          <TileBrushOptions />
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
