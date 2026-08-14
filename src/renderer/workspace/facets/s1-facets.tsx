// Classic (S1 disasm) facet modules — the four facets the s1 profile grants,
// composed entirely from components that already exist. No new UI is written
// here: this task populates the registry, and Task 9 is what flips classic off
// LegacyWorkspace onto it. Nothing user-visible changes yet, which is the point
// — a failure in the registration is isolated from a failure in the switch-on.
//
// ART AND PALETTE SHARE ONE CANVAS. Classic's composer is a single surface with
// its own internal Chunk/Block/Tile tabs, and its palette grid edits the same
// zone-art document; splitting them across two canvases would mean inventing a
// classic art surface this step has no mandate to design. Merging that composer
// with aeon's staged pixel document is step H, which the spec flags as the
// hardest piece of the overhaul and possibly not fully shareable. This step
// re-homes it unchanged and leaves the two facets pointing at the same surface,
// distinguished only by which pill is lit.
//
// `collision` has no module here on purpose: the s1 profile no longer grants it
// (core/project/s1/index.ts).

import React from 'react';
import ClassicLevelViewport from '../../components/classic/ClassicLevelViewport';
import ClassicComposerDock from '../../components/classic/ClassicComposerDock';
import ClassicPalettePanel from '../../components/classic/ClassicPalettePanel';
import ClassicObjectInspector from '../../components/classic/ClassicObjectInspector';
import ClassicObjectList from '../../components/classic/ClassicObjectList';
import MapStatusBar from '../../components/shared/MapStatusBar';
import { useClassicMapStatusPort } from '../../providers/map-status-classic';
import { Panel, CollapsibleSection } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

/** The neutral status bar bound to CLASSIC's port. The aeon default baked into
 *  `mapFacet` reads projectStore, which is null for a classic open — it would
 *  render aeon vocabulary over an empty store beside a classic canvas rather
 *  than throw, so supplying this is not optional. */
function ClassicMapStatusBar(): React.ReactElement {
  return <MapStatusBar port={useClassicMapStatusPort()} />;
}

/**
 * The classic composer as a canvas. The fill wrapper is layout, not decoration:
 * the shell's canvas slot is a ROW flex container, and the dock's own style is
 * `flexShrink: 0` in a column — written for the bottom strip it currently lives
 * in — so dropped in bare it would size to its content's width and leave the
 * rest of the canvas blank. A column that grows gives it the same footing
 * MapViewport and ComposerCanvas get.
 *
 * `overflow: auto` because the dock is as tall as its open tab needs; the map
 * canvases scroll their own content, this one does not.
 */
function ClassicComposerCanvas(): React.ReactElement {
  return (
    <div style={styles.canvasFill}>
      <ClassicComposerDock />
    </div>
  );
}

/**
 * The right-hand column for both map facets. Identical for layout and objects
 * for now — classic has ONE object surface, and the inspector plus the library
 * are what it puts beside the map. The deltas the plan reserves are Task 6
 * (layout's ToolOptions: the contextual hint line still inside the viewport's
 * OptionBar) and Task 7 (layout's ChunkPicker section, which is still mounted by
 * the legacy shell). Neither is forward-referenced here — importing a component
 * that does not exist yet does not compile, so this file only ever names what is
 * already written.
 *
 * Both sections mount a LEAF that resolves its own port, never a port hook in
 * this column — see the wrappers' docblocks and ChunkLibrary.tsx:12-15.
 */
function ClassicMapPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.object" title="Selected Object">
        <ClassicObjectInspector />
      </CollapsibleSection>
      <CollapsibleSection id="classic.objects" title="Objects">
        <ClassicObjectList />
      </CollapsibleSection>
    </Panel>
  );
}

/** The right-hand column for both art facets. */
function ClassicArtPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.palette" title="Palette">
        <ClassicPalettePanel />
      </CollapsibleSection>
    </Panel>
  );
}

// mapFacet supplies the engine-neutral MapFacetDock (which resolves classic's
// button set from the s1 manifest's facetTools.layout via toolsForFacet) and
// `mapOverlays: true`. Canvas and StatusBar are overridden because its defaults
// are aeon-bound; ToolDock is not, because it is already neutral.
export const s1LayoutFacet: FacetModule = mapFacet('layout', {
  Canvas: ClassicLevelViewport,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicMapPanels,
});

export const s1ObjectsFacet: FacetModule = mapFacet('objects', {
  Canvas: ClassicLevelViewport,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicMapPanels,
});

// Written out rather than built with mapFacet: these are NOT map-canvas facets.
// mapFacet hardcodes `mapOverlays: true` and a MapFacetDock, and both would be
// wrong here — the composer never reads viewStore.overlays, so a View menu over
// it is a control that visibly does nothing, and it drives its own tabs rather
// than editorStore.tool. No StatusBar either: classic's status line reports the
// open ACT, which the composer is not editing at that granularity, and inventing
// a composer status bar is new UI this step does not write.
const composerFacet = (id: 'art' | 'palette'): FacetModule => ({
  id,
  Canvas: ClassicComposerCanvas,
  RightPanel: ClassicArtPanels,
});

export const s1ArtFacet: FacetModule = composerFacet('art');
export const s1PaletteFacet: FacetModule = composerFacet('palette');

const styles: Record<string, React.CSSProperties> = {
  canvasFill: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' },
};
