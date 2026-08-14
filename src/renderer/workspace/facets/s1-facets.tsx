// Classic (S1 disasm) facet modules — the three facets the s1 profile grants,
// composed entirely from components that already exist. No new UI was written
// here: task 4 populated the registry and task 9 flipped classic off the legacy
// shell onto it, in two commits, so a failure in the registration stayed
// isolated from a failure in the switch-on. This IS what a classic level tab
// renders now.
//
// ---------------------------------------------------------------------------
// THREE FACETS, TWO CANVASES (owner decision, 2026-08-14)
// ---------------------------------------------------------------------------
//   Layout   → ClassicLevelViewport + chunks / selected object / object library
//   Art      → ClassicComposerDock  + chunks / palette grid
//   Palette  → ClassicLevelViewport + palette grid
//
// **LAYOUT IS THE WHOLE MAP FACET.** It briefly was not: `objects` was split off
// it, and what was left could select, MOVE and DELETE an object but not ADD one
// — half a task, not a smaller one. The split's own argument (that Layout was a
// strict superset of Objects, so the second pill was dead weight) is answered
// the other way round now: one pill, everything you do TO the map on it.
//
// The thing Objects looked like it was for — browse the object library, open one
// to edit its ART — already has two homes, and neither is a facet: the
// Explorer's Object Library group and Ctrl+K, both of which open a SPRITE-DOC
// TAB. Object art is edited in tabs. A facet over the same list would be the
// third home, which is the duplication this branch has already deleted twice.
//
// **PALETTE IS BACK, WITH THE MAP AS ITS CANVAS.** The old one was a second name
// for Art — same composer, same column, same status bar, differing in `id`
// alone — and it went with its grant. This one differs in the slot that matters:
// a Genesis palette line is shared by everything drawn with it, so "did that
// recolour break anything?" is a question only the ACT can answer. That is the
// same reason aeon's palette facet survived the identical review
// (facets/palette-facet.tsx), and it makes classic's palette grid reachable at
// all for a palette-only hack — in the Art column it sits under an 82-chunk
// wall, which is how it came to be believed not to exist.
//
// `collision` and `objects` have no module here on purpose: the s1 profile
// grants neither (core/project/s1/index.ts, where both absences are argued).
//
// ---------------------------------------------------------------------------
// WHAT IS STILL OPEN FOR STEP H
// ---------------------------------------------------------------------------
// This block used to be a five-item gap list written before the shell flip. All
// five are now CLOSED, in this file and its neighbours, so the list is gone
// rather than left to contradict the code beside it — a stale "no status bar
// here" three lines above ClassicComposerStatusBar is how a reviewer ends up
// recommending work that already exists, which has burned this branch twice.
//
// Closed at task 9, for the record: the missing status bar (ClassicComposerStatusBar
// below), the empty 44px rail (LevelWorkspace passes `undefined`, EditorShell
// drops the rail), the bottom-strip styling (composer-shared's `dock` is
// `flex: 1` with no borderTop, `dockContent` no longer caps at 380), the blank
// pre-act canvas (ClassicComposerCanvas's empty state), the missing chunk picker
// (ClassicArtPanels), and the collapse toggle that could empty the whole facet.
//
// STILL OPEN, and genuinely step-H shaped:
//
//  1. **The tab body does not fill the height it is given.** `dockContent` grows
//     now, but `tabBody` is `alignItems: flex-start`, so the content is
//     top-anchored under a large empty region. Making the tiers fill their canvas
//     is the composer redesign proper.
//  2. **The palette grid is one component with two hosts** — the Art column and
//     the Palette facet's column — which is right for now (same editor, two
//     judging surfaces) but is the same question aeon's palette facet has open.
//     Whether the two hosts should diverge is step H's to answer.


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
 * LAYOUT's right-hand column: the chunk picker, the selected-object inspector
 * and the object library — everything you do TO the map, on the one facet whose
 * canvas IS the map.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OBJECT SECTIONS ARE BACK (owner decision, 2026-08-14)
 * ---------------------------------------------------------------------------
 * They were here, then they were not, and the round trip is worth writing down
 * because both moves were argued from the same file.
 *
 * They were REMOVED because Objects was then a strict SUBSET of Layout:
 * `facetTools.layout` still carried `place-object` and this column carried the
 * list and the inspector, so there was no task you could do in Objects that you
 * could not do here, and the pill was dead weight. True, and the fix chosen was
 * to shrink Layout to terrain.
 *
 * That left a facet with `select` on it — you could pick an object, DRAG it and
 * DELETE it — and no way to add one, and no readout of what you had picked
 * (aeon's Layout pairs `select` with `AeonPropertiesPanel showObjectSelection`;
 * classic has no properties to show at all, which is what
 * providers/properties-classic.ts exists to say). Half a task is not a smaller
 * task. So the merge goes the other way: `place-object` is back in
 * `facetTools.layout`, the inspector is the selection readout Layout was
 * missing, and `objects` is no longer granted (core/project/s1/index.ts).
 *
 * NO `AeonPropertiesPanel showObjectSelection` EQUIVALENT IS ADDED HERE, and
 * that is not an oversight: that prop exists on aeon's Layout precisely because
 * aeon's Objects facet holds the real editor, so Layout gets a read-only stub.
 * Classic's Layout holds the real editor, so a stub beside it would be the same
 * selection printed twice. (Aeon is untouched by this change — it keeps its
 * Objects facet, so its Layout keeps the stub.)
 *
 * THE ORDER IS TERRAIN, THEN SELECTION, THEN LIBRARY. Chunks first because
 * stamping is the facet's default subject; the inspector above the library
 * because it is about the thing you just clicked, and burying it under a
 * 23-row list is how a readout stops being read. Both grids bound their own
 * height (shared/ChunkGrid, shared/ObjectList) so a section below is never
 * behind a wall of thumbnails — the failure that hid the Art column's palette
 * grid so thoroughly it was reported as missing.
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
 *     Marquee and Paste sections all share the id `aeon.layoutOptions` and are
 *     mutually exclusive contents of one section. Classic's layout set is
 *     `view / stamp-chunk / select` — no marquee, no paste — so there is nothing
 *     to arbitrate and the gate would be pure subtraction.
 *   - Selecting a chunk HERE arms the stamp tool (`pick="stamp"` →
 *     classicLevelStore.selectChunkForStamp, which calls editor.setTool(
 *     'stamp-chunk') when it is not already active), so the picker is the way
 *     INTO stamping. Gating it on stamping is circular: pick `select`, and the
 *     panel that re-arms stamp is the thing that disappears.
 *     THE ARM IS THIS MOUNT'S ALONE. It was briefly the port's, unconditionally,
 *     and the art column inherited it — a screen with no dock and no map quietly
 *     changing the map's tool, which you only discovered on returning to Layout
 *     armed to paint. The circularity argument above is what justifies arming,
 *     and it is an argument about a picker BESIDE A MAP.
 *   - `selectedChunkId` is not stamp state at all: it is also which chunk the
 *     composer's Chunk tab EDITS (components/classic/ChunkTab.tsx). Hiding the
 *     selector for a map tool would hide an art control.
 *
 * **2. `id="classic.chunks"` — engine-scoped and named for the content.** A
 * section id is a key in ONE global panel-state map (shell/panel-state.ts), and
 * the two engines are in one shell, so a shared id is shared COLLAPSE STATE: an
 * unprefixed slot id here would mean collapsing classic's Chunks also collapses
 * aeon's Marquee options, which is not a preference anyone expressed. Aeon has
 * since moved onto the same convention throughout (`aeon.*`), keeping one
 * deliberate reuse — `aeon.layoutOptions`, its self-retitling tool-options slot
 * — and __tests__/section-ids.test.ts is what holds the line now.
 */
function ClassicLayoutPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.chunks" title="Chunks">
        <ChunkPicker pick="stamp" />
      </CollapsibleSection>
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
 * PALETTE's right-hand column: the same grid the Art column mounts, beside the
 * MAP instead of beside the composer. One component, two hosts — see the file
 * header for why that is the point rather than the duplication the old palette
 * facet was.
 *
 * `classic.palette` is the ART column's id and is deliberately NOT reused: a
 * section id keys ONE global panel-state map (shell/panel-state.ts), so sharing
 * it would mean collapsing the grid beside the composer also collapses the one
 * beside the map. Same rule, same shape as `classic.chunks` / `classic.artChunks`.
 */
function ClassicPalettePanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.mapPalette" title="Palette">
        <ClassicPalettePanel />
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
 * That is also what aeon does: one ChunkLibrary, filed under
 * `aeon.layoutOptions` beside the map and `art.chunks` beside the composer. So this is not a new decision
 * about what classic's art facet IS — it is the decision aeon already made,
 * applied to the engine that needs it more (aeon's composer opens a document; the
 * classic Chunk tab edits whatever `selectedChunkId` points at, so without a
 * selector here the facet has no way to change its own subject).
 *
 * `pick="edit"`, not the layout column's `pick="stamp"`: the two columns share
 * the SELECTION and differ in the side-effect. Arming the map's stamp tool from
 * a facet that has neither a map nor a tool dock is a change you cannot see and
 * did not ask for, and it persists — the tool is one shared editorStore field,
 * so the next visit to Layout starts armed to paint terrain.
 *
 * `classic.artChunks`, not the layout column's `classic.chunks`: section ids key
 * ONE global panel-state map (shell/panel-state.ts), so a shared id would mean
 * collapsing the picker beside the composer also collapses it beside the map.
 * Engine-scoped prefix, named for the thing, one id per slot — the convention
 * both engines now follow.
 */
function ClassicArtPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.artChunks" title="Chunks">
        <ChunkPicker pick="edit" />
      </CollapsibleSection>
      <CollapsibleSection id="classic.palette" title="Palette">
        <ClassicPalettePanel />
      </CollapsibleSection>
    </Panel>
  );
}

// mapFacet supplies the engine-neutral MapFacetDock (which resolves classic's
// button set from the s1 manifest's facetTools.layout via toolsForFacet) and
// `mapOverlays: true` — right for both of these, since ClassicLevelViewport IS
// what viewStore.overlays paints on. Canvas and StatusBar are overridden because
// mapFacet's defaults are aeon-bound; ToolDock is not, because it is neutral.
//
// ToolOptions carries classic's contextual hint line, which is keyed on the
// TOOL rather than on the facet — including the branch that explains why a click
// did nothing on BG. Layout offers every tool it has a branch for.
export const s1LayoutFacet: FacetModule = mapFacet('layout', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicLayoutPanels,
});

// SAME CANVAS AS LAYOUT, SAME STATUS BAR, DIFFERENT SUBJECT — which is what
// layout and objects used to be, and is why sharing a canvas was never the
// problem. What made the OLD palette facet a duplicate was sharing EVERY slot
// with `art`; this one shares none with it.
//
// ToolOptions IS mounted, although aeon's palette facet has no options bar and
// this facet offers exactly one tool (`palette` is undeclared in the s1
// manifest, so it takes the shell default `['view']`). The first draft left it
// off — the hint's other branches are all about stamping, placing and selecting
// — and providers/__tests__/map-status-classic.ts caught what that costs:
// classic's map-status port sets `ownHintLine: true` ENGINE-WIDE, on the
// standing claim that every classic map facet explains its own tool, so a facet
// without the bar is a facet where the tool is explained NOWHERE. (Aeon can
// omit it because its port makes no such claim and its status bar still prints
// the generic hint.) The `view` branch reads "drag to pan · right-click
// eyedrops · scroll to zoom", and all three are true here — the eyedrop is
// ungated by tool in ClassicLevelViewport.
//
// NO BottomExtra, where aeon's palette facet takes `PaletteViewer` — and
// here classic genuinely differs rather than lags. Aeon needs that strip because
// its PaletteEditor edits ONE line and `selectedPaletteLine` (what the map and
// the ArtBrowser preview through) is chosen elsewhere; the strip puts choosing
// and editing on one screen. ClassicPalettePanel is already both: all four CRAM
// lines as labelled rows, with the channel sliders opening on the swatch you
// click. PaletteViewer under it would be a second copy of the rows above it —
// literally, and a broken one: it reads projectStore, which is null under a
// classic open, so it renders the bare word "Palette".
export const s1PaletteFacet: FacetModule = mapFacet('palette', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicPalettePanels,
});

// Written out rather than built with mapFacet: this is NOT a map-canvas facet.
// mapFacet hardcodes `mapOverlays: true` and a MapFacetDock, and both would be
// wrong here — the composer never reads viewStore.overlays, so a View menu over
// it is a control that visibly does nothing, and it drives its own tier tabs
// rather than editorStore.tool.
//
// NO ToolDock ON PURPOSE, and that is now a real absence rather than an empty
// one: LevelWorkspace passes `undefined` for a missing dock and EditorShell drops
// the 44px rail instead of drawing a bordered empty column (gap 2).
//
// ONE COMPOSER FACET, and `palette` is not it. There was a `composerFacet(id)`
// factory here producing an `art` and a `palette` module that differed in `id`
// and in nothing else — same canvas, same column, same status bar — and nothing
// downstream read the id, so the Palette pill navigated to a pixel-identical
// screen. That factory is gone for good. The palette facet is granted again but
// is built on the MAP canvas (s1PaletteFacet above), so the two facets now
// overlap in exactly one component — ClassicPalettePanel — and in no slot.
export const s1ArtFacet: FacetModule = {
  id: 'art',
  Canvas: ClassicComposerCanvas,
  RightPanel: ClassicArtPanels,
  StatusBar: ClassicComposerStatusBar,
};

const styles: Record<string, React.CSSProperties> = {
  canvasFill: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' },
  // Centred in the canvas the same way ClassicLevelViewport centres its own —
  // and painted the same colour, which is what `background` is doing here.
  // Without it this inherited the shell's `T.surface`, so with no act loaded the
  // Art facet's canvas sat ~8 levels lighter than the pixel-identical Layout and
  // Objects screens next to it (ClassicLevelViewport paints `T.void`). Three
  // "nothing is open" screens that are not the same screen.
  // On `empty` and not on `canvasFill`: with a document open the canvas belongs
  // to ClassicComposerDock, which paints its own panels, and a colour applied to
  // the wrapper would be a second decision about a surface that is not empty.
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, textAlign: 'center', padding: 24, background: T.void,
  },
};
