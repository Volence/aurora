// Classic (S1 disasm) facet modules — the four facets the s1 profile grants,
// composed entirely from components that already exist. No new UI was written
// here: task 4 populated the registry and task 9 flipped classic off the legacy
// shell onto it, in two commits, so a failure in the registration stayed
// isolated from a failure in the switch-on. This IS what a classic level tab
// renders now.
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
// KNOWN CHROME GAPS — 1-3 OPEN, 4 AND 5 CLOSED AT TASK 9
// ---------------------------------------------------------------------------
// All of these became visible when task 9 flipped the shell, and all are
// confined to the ART and PALETTE facets — the two map facets took the flip with
// full chrome (dock, options, status bar, panels).
//
// 1-3 STAY OPEN for step H: each is about how classic's composer becomes a
// first-class canvas, which the spec flags as the hardest piece and possibly not
// fully shareable. Recorded together so whoever takes step H reads one list
// instead of rediscovering them one screen at a time.
//
// 4 AND 5 WERE FIXED AT TASK 9, because neither is really about the redesign.
// 5 was a workflow that came out of the re-home SLOWER than the shell it
// replaced, which is a regression rather than unfinished work; 4 was a blank
// window that read as a crash. Both fixes are recorded at their sites below
// (ClassicArtPanels and ClassicComposerCanvas) and kept here so the numbering
// still matches anything that cites this list.
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
//  4. FIXED (task 9). **The composer rendered nothing before an act loaded.**
//     ClassicComposerDock `return null`s until the doc is ready — an absent
//     bottom strip before, a blank window as the canvas. ClassicComposerCanvas
//     now carries the same three-state empty message the map viewport does.
//     ClassicPalettePanel still `return null`s, but it sits in a titled
//     CollapsibleSection, so it reads as an empty section rather than a blank
//     screen; left alone.
//  5. FIXED (task 9). **The art facet had no chunk picker**, so picking WHICH
//     chunk to edit meant a trip to Layout — slower than the legacy shell, where
//     the picker sat under the composer. ChunkPicker is now mounted in
//     ClassicArtPanels as well, under `classic.artChunks`; the argument is at
//     that function.

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
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { Panel, CollapsibleSection, StatusBar, T } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

/** The neutral status bar bound to CLASSIC's port. The aeon default baked into
 *  `mapFacet` reads projectStore, which is null for a classic open — it would
 *  render aeon vocabulary over an empty store beside a classic canvas rather
 *  than throw, so supplying this is not optional. */
function ClassicMapStatusBar(): React.ReactElement {
  return <MapStatusBar port={useClassicMapStatusPort()} />;
}

/**
 * The composer facets' status bar (gap 1, closed at task 9).
 *
 * NOT the map's. MapStatusBar speaks the LEVEL tool vocabulary and carries a zoom
 * control bound to viewStore.zoom, which the composer never reads — mounting it
 * here would put a row of controls under the composer that visibly do nothing,
 * which is worse than the blank slot it replaces. So this reports and does not
 * act: the open act on the left, the ART POOL SIZES on the right.
 *
 * The pools are the composer's actual subject — tiles, blocks and chunks are the
 * three things its three tabs edit — and they are NOT what the breadcrumb in the
 * dock header says. That says which ONE of each is selected; this says how many
 * there are. Repeating the breadcrumb down here is the duplication
 * map-status-classic already refused for the stamp hint.
 *
 * `doc.tiles` is a raw byte buffer at 32 bytes per 8x8 4bpp tile — the same
 * arithmetic ClassicComposerDock does to clamp its tile selection.
 */
function ClassicComposerStatusBar(): React.ReactElement {
  const ref = useClassicLevelStore((s) => s.ref);
  const doc = useClassicLevelStore((s) => s.doc);
  const left = (
    <span style={{ color: T.textBase }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>S1</span>
      {ref ? ` · ${ref.label}` : ''}
    </span>
  );
  const right = doc ? (
    <span>
      {Math.floor(doc.tiles.length / 32)} tiles · {doc.blocks.length} blocks · {doc.chunks.length} chunks
    </span>
  ) : null;
  return <StatusBar left={left} right={right} />;
}

/**
 * The classic composer as a canvas. The fill wrapper is layout, not decoration:
 * the shell's canvas slot is a ROW flex container, and the dock's own style is
 * `flexShrink: 0` in a column — written for the bottom strip it used to live in
 * — so dropped in bare it would size to its content's width and leave the rest
 * of the canvas blank. A column that grows gives it the same footing MapViewport
 * and ComposerCanvas get.
 *
 * `overflow: auto` because the dock is as tall as its open tab needs; the map
 * canvases scroll their own content, this one does not.
 *
 * THE EMPTY STATE IS THIS COMPONENT'S JOB, not the dock's (gap 4, closed at task
 * 9). ClassicComposerDock returns null until the doc is ready, which as a bottom
 * strip was an absent strip — fine — but as the whole canvas was a blank window
 * under a facet bar, with the map facet's own empty state next door making it
 * read as a crash rather than as nothing-open-yet. The three branches and their
 * wording mirror ClassicLevelViewport's deliberately: it is the same three
 * states of the same store, and the user should not have to learn that the two
 * screens describe them differently.
 *
 * The store reads sit HERE rather than in the panel column above — the leaf rule
 * (see ClassicObjectInspector's docblock). `status` and `doc` are exactly what
 * the dock itself subscribes to, so this adds no new churn.
 */
function ClassicComposerCanvas(): React.ReactElement {
  const status = useClassicLevelStore((s) => s.status);
  const doc = useClassicLevelStore((s) => s.doc);
  const ref = useClassicLevelStore((s) => s.ref);
  const error = useClassicLevelStore((s) => s.error);
  const ready = status === 'ready' && doc !== null;
  return (
    <div style={styles.canvasFill}>
      {ready ? (
        <ClassicComposerDock />
      ) : (
        <div style={{ ...styles.empty, color: status === 'error' ? T.error : T.textLo }}>
          {status === 'loading' && `Loading ${ref?.label ?? 'level'}…`}
          {status === 'error' && (
            <span style={{ whiteSpace: 'pre-line' }}>{error ?? 'Failed to load level'}</span>
          )}
          {status === 'idle' && 'Open a level from the Explorer, or press Ctrl+K.'}
        </div>
      )}
    </div>
  );
}

/**
 * LAYOUT's right-hand column: the chunk picker, and nothing else.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OBJECT LIST AND INSPECTOR ARE NOT HERE (task 9)
 * ---------------------------------------------------------------------------
 * They were, until Objects turned out to be a strict SUBSET of Layout: classic's
 * `facetTools.layout` still carried `place-object`, and this column carried the
 * list and the inspector, so there was no task you could do in the Objects facet
 * that you could not do in Layout — which makes the pill dead weight.
 *
 * The root cause was a declaration that predicted its own staleness. The s1
 * manifest's comment said layout carried all four tools "until the workspace
 * re-home splits it into per-facet docks"; the re-home landed and the
 * declaration did not move with it. It has now: layout is
 * `view / stamp-chunk / select` (core/project/s1/index.ts), matching aeon's
 * split, where layout is TERRAIN and objects owns PLACEMENT. You still see
 * objects while editing terrain — that is the View menu's Objects overlay.
 *
 * `select` stays on layout, as it does on aeon's, so an object can be nudged or
 * deleted without leaving terrain work. KNOWN CONSEQUENCE, flagged rather than
 * papered over: aeon's layout pairs `select` with a read-only Properties readout
 * (`AeonPropertiesPanel showObjectSelection`), and classic has no equivalent —
 * providers/properties-classic.ts exists precisely to say classic has no
 * properties to show. So a selection made on classic's Layout shows in the
 * CANVAS (the viewport draws the highlight) but has no panel readout. That is a
 * step-H question — what classic's properties surface is — not one to answer by
 * putting the whole inspector back and recreating the subset.
 *
 * Every section mounts a LEAF that resolves its own port, never a port hook in
 * this column — see the wrappers' docblocks and ChunkLibrary.tsx:12-15.
 *
 * ---------------------------------------------------------------------------
 * TWO DECISIONS THE CHUNK SECTION MAKES (stage-4 plan 5, task 7)
 * ---------------------------------------------------------------------------
 * **1. No visibility gate. Aeon's is `tool === 'stamp-chunk' && !pasting`; this
 * is mounted unconditionally, and the divergence is deliberate.**
 *   - Aeon's gate is a SLOT ARBITER, not a stamp-visibility rule: its Chunks,
 *     Marquee and Paste sections all share the id `map.palette` and are mutually
 *     exclusive contents of one section. Classic's layout set is
 *     `view / stamp-chunk / select` — no marquee, no paste — so there is nothing
 *     to arbitrate and the gate would be pure subtraction.
 *   - Selecting a chunk ARMS the stamp tool (classicLevelStore.selectChunkForStamp
 *     calls editor.setTool('stamp-chunk') when it is not already active), so the
 *     picker is the way INTO stamping. Gating it on stamping is circular: pick
 *     `select`, and the panel that re-arms stamp is the thing that disappears.
 *   - `selectedChunkId` is not stamp state at all: it is also which chunk the
 *     composer's Chunk tab EDITS (components/classic/ChunkTab.tsx). Hiding the
 *     selector for a map tool would hide an art control.
 *
 * **2. `id="classic.chunks"` — a CONTENT id, classic's convention, not aeon's
 * slot-position `map.palette`.** A section id is a key in ONE global panel-state
 * map (shell/panel-state.ts), and the two engines are in one shell, so a shared
 * id is shared COLLAPSE STATE ACROSS ENGINES: `map.palette` here would mean
 * collapsing classic's Chunks also collapses aeon's Marquee options, which is
 * not a preference anyone expressed. Aeon's reuse is coherent within aeon
 * precisely because those three are one section that retitles itself — and even
 * aeon does not carry it across facet FAMILIES (its art facet files the same
 * ChunkLibrary under `art.chunks`).
 */
function ClassicLayoutPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.chunks" title="Chunks">
        <ChunkPicker />
      </CollapsibleSection>
    </Panel>
  );
}

/**
 * OBJECTS' right-hand column: the inspector and the library, which are now this
 * facet's alone. Together with `place-object` (the shell default set, which
 * classic does not override) they are what makes Objects a facet rather than a
 * second name for Layout.
 */
function ClassicObjectsPanels(): React.ReactElement {
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

/**
 * The right-hand column for both art facets.
 *
 * THE CHUNK PICKER IS HERE TOO (gap 5, closed at task 9). `selectedChunkId` is
 * one piece of state doing two jobs — the map's stamp target and the chunk the
 * composer's Chunk tab EDITS (ChunkTab.tsx) — and task 7 gave it a single home in
 * the Layout column. In the legacy bottom strip the picker sat under the composer
 * so both were on screen at once; with one selector in the other facet, choosing
 * which chunk to edit became Layout → click → Art, which is SLOWER than the shell
 * being replaced. A re-home that makes a workflow worse than the thing it
 * replaces is not a re-home, so the picker is mounted in both columns.
 *
 * That is also what aeon does: one ChunkLibrary, filed under `map.palette` beside
 * the map and `art.chunks` beside the composer. So this is not a new decision
 * about what classic's art facet IS — it is the decision aeon already made,
 * applied to the engine that needs it more (aeon's composer opens a document; the
 * classic Chunk tab edits whatever `selectedChunkId` points at, so without a
 * selector here the facet has no way to change its own subject).
 *
 * `classic.artChunks`, not the layout column's `classic.chunks`: section ids key
 * ONE global panel-state map (shell/panel-state.ts), so a shared id would mean
 * collapsing the picker beside the composer also collapses it beside the map.
 * Same reasoning that kept classic off aeon's `map.palette` — engine-scoped
 * prefix, named for the thing, one id per slot.
 */
function ClassicArtPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.artChunks" title="Chunks">
        <ChunkPicker />
      </CollapsibleSection>
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
// it is a control that visibly does nothing, and it drives its own tier tabs
// rather than editorStore.tool.
//
// NO ToolDock ON PURPOSE, and that is now a real absence rather than an empty
// one: LevelWorkspace passes `undefined` for a missing dock and EditorShell drops
// the 44px rail instead of drawing a bordered empty column (gap 2).
const composerFacet = (id: 'art' | 'palette'): FacetModule => ({
  id,
  Canvas: ClassicComposerCanvas,
  RightPanel: ClassicArtPanels,
  StatusBar: ClassicComposerStatusBar,
});

export const s1ArtFacet: FacetModule = composerFacet('art');
export const s1PaletteFacet: FacetModule = composerFacet('palette');

const styles: Record<string, React.CSSProperties> = {
  canvasFill: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' },
  // Centred in the canvas the same way ClassicLevelViewport centres its own.
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, textAlign: 'center', padding: 24,
  },
};
