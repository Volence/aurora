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

/**
 * THE COLUMN'S ORDER IS LOAD-BEARING: EVERY TOOL-CONDITIONAL SECTION SITS BELOW
 * THE ART SECTION, AND THAT IS A BUG FIX, NOT A PREFERENCE.
 *
 * The Art section hosts a DOUBLE CLICK (ArtBrowser's strip opens a background
 * slot in the composer — ROADMAP row 57) and a DRAG (the range that aims a band
 * promotion). A double click is two hit tests a moment apart, so it only works
 * while the thing it is aimed at STAYS WHERE IT WAS between them.
 *
 * It did not. The first press/release of a double click is an ordinary click:
 * `ArtBrowser.handleClick` picks the slot and arms `paint-tile`, which used to
 * MOUNT the "Brush" section IMMEDIATELY ABOVE this one — 144.56px of it,
 * measured — so the strip slid down out from under the cursor and the second
 * click landed on the band-card row that had taken its place. That armed
 * `stamp-band`, which un-mounted Brush and put the strip back, so a before/after
 * reading says nothing moved. `dblclick` never reached the strip's container at
 * all: the composer was unreachable from the human gesture, and the author was
 * left holding a stamp they never asked for.
 *
 * THE RULE THAT REPLACES IT, stated so a future section knows where to go:
 *
 *   A section whose PRESENCE depends on the tool must not precede a section
 *   that hosts a multi-step pointer gesture, when a gesture in that section can
 *   change the tool.
 *
 * Both halves are true here and only here in this app: `ArtBrowser` is the one
 * panel that calls `setTool` from a pointer handler, and this is the one facet
 * column with tool-conditional section membership. The rule is held by
 * `workspace/__tests__/panel-gesture-order.test.ts`, which derives both halves
 * from source rather than from this comment, and the gesture itself by
 * `scratchpad/bganim-tile-door-harness.mjs`, which drives the real double click
 * under CDP and asserts the strip's box does not move between the two halves —
 * the two facts that were false. Neither a reorder here nor a new `setTool` in a
 * panel can put the defect back quietly.
 *
 * THREE FIXES WERE REJECTED and the reasons matter more than the choice:
 *   * reserving the slot's space always — the arms have different heights
 *     (a 144px Brush, a flex chunk grid), so arming still reflowed;
 *   * moving the open gesture off `dblclick`, or capturing the pointer — the
 *     panel would still move under the cursor, and the next gesture added to
 *     this column would find the same fault waiting;
 *   * any "wait and see whether a second click arrives" before arming the tool —
 *     a timer over a live fault, which treats the symptom and keeps the cause.
 *
 * THE RESIDUE, stated rather than implied: `aeon.sections` above is a `list`
 * section (`flex: 1 1 0`, floor `SECTION_LIST_MIN_HEIGHT`). In a column with
 * between 0 and one Brush-height of slack it can still SHRINK when an options
 * section mounts, which would move Art up. Measured on this app's column it does
 * not — the nav sits at its natural height with surplus below, and at 1280x700
 * it sits on its floor, and neither regime moves (both runs are in
 * docs/reviews/2026-09-03-art-strip-doubleclick.md §D). Nothing here can rule
 * out the narrow band in between; only reserving the space could, and that costs
 * the chunk grid its column.
 */
function LayoutPanels() {
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  return (
    <Panel width={240} scroll>
      <CollapsibleSection id="aeon.sections" title="Sections" variant="list"><SectionGridNav /></CollapsibleSection>
      {/* THE GESTURE HOST, AND IT GOES ABOVE THE TOOL-CONDITIONAL SLOT — see
          this component's docblock. Its only neighbour above is unconditional,
          so arming a tool from the strip cannot move the strip. */}
      <CollapsibleSection id="aeon.art" title="Art"><ArtBrowser /></CollapsibleSection>
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
