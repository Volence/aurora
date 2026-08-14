// Classic (S1 disasm) facet modules — the four facets the s1 profile grants,
// composed entirely from components that already exist. No new UI was written
// here: task 4 populated the registry and task 9 flipped classic off the legacy
// shell onto it, in two commits, so a failure in the registration stayed
// isolated from a failure in the switch-on. This IS what a classic level tab
// renders now.
//
// ---------------------------------------------------------------------------
// FOUR FACETS, TWO CANVASES — AND THE PILL ORDER IS WHY FOUR WORKS
// ---------------------------------------------------------------------------
//   Layout   → ClassicLevelViewport + chunks
//   Objects  → ClassicLevelViewport + selected object / object library
//   Palette  → ClassicLevelViewport + palette grid
//   Art      → ClassicComposerDock  + chunks / palette grid
//
// Three of the four share ONE canvas and differ only in their column and their
// tools; `art` is the one that swaps the canvas outright. core/shell/facets.ts
// orders the pills so those three are adjacent and `art` is LAST, which is what
// makes a press inside the group read as what it is — the tools and the panel
// changing over a scene that does not move.
//
// **THE OBJECTS FACET WAS BRIEFLY MERGED INTO LAYOUT, AND THAT IS REVERTED.**
// The merge (2026-08-14) argued that Layout with `select` but no `place-object`
// was half a task: you could pick an object, drag it and delete it, and not add
// one. That was a true observation with the wrong cure. `art` sat SECOND in the
// pill row at the time, so stepping Layout → Objects crossed the single facet
// that replaces the canvas, and the two lenses on one act felt further apart
// than they are. Move `art` to the end and the distance goes away; the facets
// were never the problem. Reversed with the owner the same week, having run
// both.
//
// So Layout is TERRAIN (`view / stamp-chunk / select`, chunk picker) and Objects
// is PLACEMENT (the shell default `place-object / select / view`, the library
// and the inspector) — the same division aeon uses. `select` is on both, so an
// object can be nudged or deleted without leaving terrain work, and the View
// menu's Objects overlay means you always SEE them.
//
// KNOWN CONSEQUENCE, flagged rather than papered over: a selection made on
// Layout shows in the CANVAS (the viewport draws the highlight) and has no
// panel readout, because classic has no properties surface at all
// (providers/properties-classic.ts exists to say so). Aeon's Layout fills that
// gap with `AeonPropertiesPanel showObjectSelection`; adding a classic stub is a
// step-H question about what classic's properties surface IS, not something to
// answer by moving the whole inspector back and recreating the subset.
//
// **PALETTE HAS THE MAP AS ITS CANVAS.** An older palette facet was a second
// name for Art — same composer, same column, same status bar, differing in `id`
// alone — and it went with its grant. This one differs in the slot that matters:
// a Genesis palette line is shared by everything drawn with it, so "did that
// recolour break anything?" is a question only the ACT can answer. That is the
// same reason aeon's palette facet survived the identical review
// (facets/palette-facet.tsx), and it makes classic's palette grid reachable at
// all for a palette-only hack — in the Art column it sits under an 82-chunk
// wall, which is how it came to be believed not to exist.
//
// `collision` and `rings` have no module here on purpose: the s1 profile grants
// neither (core/project/s1/index.ts, where both absences are argued).
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
//  3. **Layout's column is ONE section.** It is now a chunk grid that fills the
//     column (`variant="list"`), which is what CLOSED the half-empty-column
//     complaint the 260px cap created — but one section is still one section.
//     That is not a reason to move sections back into it — a column filled to
//     look busy is how Objects became a subset of Layout the first time — but it
//     IS the honest state of the screen. The two candidates are both step-H
//     shaped: classic has no properties surface for the selection Layout's
//     `select` tool makes, and no layer/plane panel. Recorded rather than
//     filled.


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
 * LAYOUT's right-hand column: the chunk picker, and nothing else. Layout is
 * TERRAIN; the object library and the inspector are the Objects facet's
 * (ClassicObjectsPanels below).
 *
 * ---------------------------------------------------------------------------
 * THE OBJECT SECTIONS HAVE BEEN HERE AND NOT HERE TWICE. THAT IS THE NOTE.
 * ---------------------------------------------------------------------------
 * They were here, alongside `place-object` on `facetTools.layout`, which made
 * Objects a strict SUBSET of Layout — nothing you could do there that you could
 * not do here, so the pill was dead weight. They were REMOVED for that, which
 * split the facets cleanly and left Layout able to select, move and delete an
 * object but not add one. They were then put BACK, merging Objects into Layout
 * on the argument that half a task is not a smaller task. That merge is what
 * this file reverts.
 *
 * WHY THE SPLIT IS RIGHT AFTER ALL: none of the three moves above touched the
 * thing that actually made Layout → Objects feel wrong, which was the PILL
 * ORDER. `art` — the only classic facet that replaces the canvas — sat between
 * them, so a step between two lenses on one act crossed the single genuine
 * scene change. `art` is last now (core/shell/facets.ts) and Objects sits
 * immediately after Layout over an identical canvas: the map does not move, the
 * column and the rail change, and that reads as what it is.
 *
 * NO SELECTION READOUT IS ADDED HERE to compensate. Aeon's Layout passes
 * `AeonPropertiesPanel showObjectSelection` because aeon HAS a properties
 * surface; classic has none (providers/properties-classic.ts is the statement of
 * that), so the honest options are a stub that prints an id or nothing, and
 * inventing classic's properties surface is step H's. The canvas draws the
 * selection highlight, so a selection made here is not invisible.
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
      <CollapsibleSection id="classic.chunks" title="Chunks" variant="list">
        <ChunkPicker pick="stamp" />
      </CollapsibleSection>
    </Panel>
  );
}

/**
 * OBJECTS' right-hand column: the inspector and the library, which are this
 * facet's alone. Together with `place-object` (the shell default set, which
 * classic does not override) they are what makes Objects a facet rather than a
 * second name for Layout.
 *
 * THE INSPECTOR SITS ABOVE THE LIBRARY because it is about the thing you just
 * clicked, and burying a readout under a 23-row list is how it stops being read.
 * The inspector is a CONTENT section and the library a LIST one, so the form
 * takes its natural height and the rows take everything under it: neither
 * section is behind a wall of the other — the failure that hid the Art column's
 * palette grid so thoroughly it was reported as missing — and neither is a
 * short box over an empty column, which is what capping the list at a fixed
 * 260px did to this exact screen.
 */
function ClassicObjectsPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.object" title="Selected Object">
        <ClassicObjectInspector />
      </CollapsibleSection>
      <CollapsibleSection id="classic.objects" title="Objects" variant="list">
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
      <CollapsibleSection id="classic.artChunks" title="Chunks" variant="list">
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
// ToolOptions carries classic's contextual hint line on ALL THREE map facets
// rather than layout alone: the hint is keyed on the TOOL, not the facet, and
// every tool any of them offers has a branch in it — including the one that
// explains why a click did nothing on BG. Withholding it from a facet would hide
// the hint exactly where that facet's tool is the only thing to explain.
export const s1LayoutFacet: FacetModule = mapFacet('layout', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicLayoutPanels,
});

// SAME CANVAS AS LAYOUT, SAME STATUS BAR, SAME HINT BAR — the COLUMN and the
// RAIL are the whole difference, and that is the point rather than a shortfall.
// Objects declares no facetTools, so it takes the shell default
// ['place-object', 'select', 'view']; classic implements all three.
//
// This module was deleted in the merge (2026-08-14) and is restored: the merge's
// complaint was about the pill ORDER, not about this facet — see the file
// header. Sharing a canvas with Layout has never been the problem; sharing every
// slot is, which is what the old composer-based palette facet did.
export const s1ObjectsFacet: FacetModule = mapFacet('objects', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicObjectsPanels,
});

// SAME CANVAS AS LAYOUT AND OBJECTS, SAME STATUS BAR, DIFFERENT SUBJECT. What
// made the OLD palette facet a duplicate was sharing EVERY slot with `art`; this
// one shares none with it.
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
