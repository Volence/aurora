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
//
// ---------------------------------------------------------------------------
// KNOWN CHROME GAPS FOR THE SHELL FLIP (Task 9)
// ---------------------------------------------------------------------------
// None of these is visible yet — classic still renders through LegacyWorkspace —
// and none is fixed here, because all four are step-H shaped: they are about how
// classic's composer becomes a first-class canvas, which is the piece the spec
// flags as the hardest and possibly not fully shareable. Recorded together so
// whoever flips the shell reads one list instead of rediscovering them one
// screen at a time.
//
//  1. **No status bar on art/palette.** The slot is empty, so the bottom of the
//     screen goes blank when you leave a map facet. Giving them the map bar
//     would be worse, not better: it speaks the LEVEL tool vocabulary and its
//     zoom control drives viewStore.zoom, which the composer does not read — a
//     bar of controls that visibly do nothing. The composer needs its own.
//  2. **No tool dock on art/palette.** LevelWorkspace fills the slot with a
//     `<span />`, so EditorShell's 44px rail renders as an empty vertical strip
//     down the left edge. Correct as data — the composer drives its own internal
//     tabs, not editorStore.tool — but it reads as a broken column.
//  3. **The composer is styled as a bottom strip, not a canvas.** ClassicComposerDock's
//     `styles.dock` (components/classic/composer-shared.tsx) carries a `borderTop`
//     for the strip it currently sits in, and `dockContent` is capped at
//     `maxHeight: 380`. In the canvas slot that is a top-anchored panel with a
//     stray rule above it and a large empty region below. ClassicComposerCanvas
//     below fixes only the flex sizing — the rest is the dock's own styling and
//     belongs to whoever redesigns it.
//  4. **Both classic surfaces render nothing before an act loads.** ClassicComposerDock
//     and ClassicPalettePanel each `return null` when the doc is not ready. As a
//     bottom strip that was an absent strip; as the whole canvas it is a blank
//     screen with no explanation. An empty state is wanted here.
//  5. **The art facet has no chunk picker, so picking WHICH chunk to edit means
//     a trip to Layout.** `selectedChunkId` is one piece of state serving two
//     jobs — the map's stamp and the composer's Chunk tab — and task 7 put its
//     one selector in the Layout panel. In the legacy shell both were on screen
//     at once, so this was free. Aeon has the same section in both places
//     (`map.palette` and `art.chunks`, one ChunkLibrary); classic could simply
//     mount ChunkPicker in ClassicArtPanels too, but choosing that is choosing
//     what classic's art facet IS, which is step H's call and not this one's.

import React from 'react';
import ClassicLevelViewport from '../../components/classic/ClassicLevelViewport';
import ClassicMapToolOptions from '../../components/classic/ClassicMapToolOptions';
import ClassicComposerDock from '../../components/classic/ClassicComposerDock';
import ClassicPalettePanel from '../../components/classic/ClassicPalettePanel';
import ClassicObjectInspector from '../../components/classic/ClassicObjectInspector';
import ClassicObjectList from '../../components/classic/ClassicObjectList';
import ChunkPicker from '../../components/classic/ChunkPicker';
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
 * The right-hand column for both map facets. `chunks` is the ONE delta between
 * them: the chunk picker is layout's, matching aeon, whose ChunkLibrary sits in
 * the same slot of the same column (facets/layout-facet.tsx). Everything below it
 * is shared — classic has ONE object surface, and the inspector plus the library
 * are what it puts beside the map on either facet.
 *
 * Every section mounts a LEAF that resolves its own port, never a port hook in
 * this column — see the wrappers' docblocks and ChunkLibrary.tsx:12-15.
 *
 * ---------------------------------------------------------------------------
 * THREE DECISIONS THIS SECTION MAKES (stage-4 plan 5, task 7)
 * ---------------------------------------------------------------------------
 * **1. `layout: 'panel'`, not the bottom strip's `'strip'`.** Classic's thumbs are
 * a fixed 56px, so four fit a row of this 260px column with room to spare; the
 * strip's 148px-capped wall in a column that has the whole window's height would
 * be a worse picker than the one it replaces. The port takes the layout as an
 * argument because it is a fact about the SLOT, not about S1 — see the hook.
 *
 * **2. No visibility gate. Aeon's is `tool === 'stamp-chunk' && !pasting`; this
 * is mounted unconditionally, and the divergence is deliberate.**
 *   - Aeon's gate is a SLOT ARBITER, not a stamp-visibility rule: its Chunks,
 *     Marquee and Paste sections all share the id `map.palette` and are mutually
 *     exclusive contents of one section. Classic's `facetTools.layout` is
 *     `view / stamp-chunk / select / place-object` (core/project/s1/index.ts) —
 *     no marquee, no paste — so there is nothing to arbitrate and the gate would
 *     be pure subtraction.
 *   - Selecting a chunk ARMS the stamp tool (classicLevelStore.selectChunkForStamp
 *     calls editor.setTool('stamp-chunk') when it is not already active), so the
 *     picker is the way INTO stamping. Gating it on stamping is circular: pick
 *     `select`, and the panel that re-arms stamp is the thing that disappears.
 *     (The tool dock's stamp button is still a way back, so this is a detour
 *     rather than a dead end — but it is a detour aeon does not have to take,
 *     because aeon's selection does not arm anything.)
 *   - `selectedChunkId` is not stamp state at all: it is also which chunk the
 *     composer's Chunk tab EDITS (components/classic/ChunkTab.tsx). Hiding the
 *     selector for a map tool would hide an art control.
 *
 * **3. `id="classic.chunks"` — a CONTENT id, classic's convention, not aeon's
 * slot-position `map.palette`.** A section id is a key in ONE global panel-state
 * map (shell/panel-state.ts), and the two engines are moving into one shell, so
 * a shared id is shared COLLAPSE STATE ACROSS ENGINES: `map.palette` here would
 * mean collapsing classic's Chunks also collapses aeon's Marquee options, which
 * is not a preference anyone expressed. Aeon's reuse is coherent within aeon
 * precisely because those three are one section that retitles itself — and even
 * aeon does not carry it across facet FAMILIES (its art facet files the same
 * ChunkLibrary under `art.chunks`). So: engine-scoped prefix, named for the
 * thing, matching the three `classic.*` ids already here rather than making a
 * fourth section redefine them.
 *
 * One consequence of splitting the column in two: the facets no longer share a
 * RightPanel component identity, so switching layout⇄objects now REMOUNTS it and
 * the object list's filter box resets. That is what aeon already does (its two
 * map facets have separate panel components), and the alternative is a column
 * that reads the active facet to decide its own contents.
 */
function ClassicMapPanels({ chunks }: { chunks?: boolean }): React.ReactElement {
  return (
    <Panel width={260} scroll>
      {chunks && (
        <CollapsibleSection id="classic.chunks" title="Chunks">
          <ChunkPicker />
        </CollapsibleSection>
      )}
      <CollapsibleSection id="classic.object" title="Selected Object">
        <ClassicObjectInspector />
      </CollapsibleSection>
      <CollapsibleSection id="classic.objects" title="Objects">
        <ClassicObjectList />
      </CollapsibleSection>
    </Panel>
  );
}

// Two module-level identities, so each facet's RightPanel is a stable component
// type rather than a fresh closure per render (which would remount the column on
// every parent render, not just on a facet switch).
function ClassicLayoutPanels(): React.ReactElement {
  return <ClassicMapPanels chunks />;
}

function ClassicObjectsPanels(): React.ReactElement {
  return <ClassicMapPanels />;
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
//
// ToolOptions carries classic's contextual hint line, on BOTH map facets rather
// than layout alone: the hint is keyed on the TOOL, not the facet, and every
// tool the objects facet offers (place-object, select, view) has a branch in it
// — including the one that explains why a click did nothing on BG. Withholding
// it from objects would hide the hint exactly where it is most needed.
export const s1LayoutFacet: FacetModule = mapFacet('layout', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicLayoutPanels,
});

export const s1ObjectsFacet: FacetModule = mapFacet('objects', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicObjectsPanels,
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
