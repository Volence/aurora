import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useViewStore } from '../state/viewStore';
import { isTypingTarget } from '../shell/typing-target';
import { useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel as getStoreActiveLevel } from '../state/projectStore';
import { rasterizeAeonChunkNative } from '../providers/chunk-grid-aeon';
import { useEditorStore, executeCommand, setCommandInvalidationListener, RING_PATTERNS, type EditorTool } from '../state/editorStore';
import { useAeonHistoryVersion } from '../hooks/useHistoryVersion';
import { useArtStore } from '../state/artStore';
import { useSessionStore } from '../state/sessionStore';
import { switchFacet, toolsForFacet } from '../workspace/facet-tools';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { levelKeysEnabled } from '../workspace/level-keys';
import { useToastStore } from '../state/toastStore';
import { useAetherStore } from '../state/aetherStore';
import { warpTargetFor } from '../../core/aether/warp-math';
import { openDocumentGuarded } from './art/open-document';
import { resolveEscape } from './map-escape';
import { docFromTile, docFromSectionRegion } from '../../core/art/composer-buffer';
import { seedDocCollisionFromSection } from '../../core/art/composer-collision';
import type { AnyCommand, S4Level, SetTilesCommand } from '../../core/editing/commands';
import { buildStampCommand } from '../../core/editing/map-stamp';
import { snapMarquee, copyFromSection, buildPasteCommand } from '../../core/editing/map-clipboard';
import type { PasteLayers } from '../../core/editing/map-clipboard';
import { SectionRenderer } from '../canvas/SectionRenderer';
import {
  bandPreview, refreshBandPreview, resolveDisplayedBg, resolveBandLens,
} from '../providers/bganim-preview-aeon';
import type { DisplayedBgSource } from '../providers/bganim-preview-aeon';
import {
  drawBandLens, drawBandLensLabel, bandLensAnchor, cellAtWorld,
  publishBandLensReport, publishBandMark,
} from '../canvas/band-lens';
import {
  coverageSummary, coverageSubject, coverageBounds, markFromLayoutWord,
} from '../providers/band-coverage';
import { documentBands, bandSlotBases } from '../../core/formats/bg-override/bg-anim-band';
import { bandTileCount } from '../../core/formats/bg-override/bg-override';
import { writeBgOverrideLayoutWord } from '../../core/formats/bg-override/bg-override-view';
import { LAYOUT_TILE_INDEX_MASK } from '../../core/formats/bg-override/bg-override';
import { editorPanToCameraPx } from '../../core/formats/bg-override/bganim-preview';
import { OverlayRenderer } from '../canvas/OverlayRenderer';
import type { SectionOverlayInfo } from '../canvas/OverlayRenderer';
import {
  drawLayerGuides, guideAtCanvasY, canvasYToWorldY, canvasYToLayerTop, layerGuideGeometry,
  publishGuideReport,
} from '../canvas/effects-guides';
import {
  drawScreenFrame, screenFrameEdgeAt, dragScreenFrame, publishScreenFrameReport,
  type ScreenFrameAnchor,
} from '../canvas/screen-frame';
import {
  resolveSelectedScene, setLayerFieldCommand, clampLayerTop, layerTopSpace,
} from '../providers/effects-aeon';
import type { EffectsScene } from '../../core/formats/effects/scene';
import type { FacetCapability } from '../../core/project/adapter';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE, unpackNametableWord } from '../../core/model/s4-types';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
import type { Section, ObjectPlacement, RingPlacement } from '../../core/model/s4-types';
import { T } from './ui';
import CollisionLegend from './CollisionLegend';
import {
  CANVAS_VOID,
  COLLISION_SHAPE_LINE, COLLISION_SOLID_EDGE, COLLISION_ANGLE_NEEDLE,
  COLLISION_PREVIEW_FILL, COLLISION_PREVIEW_SCOPE, COLLISION_PREVIEW_PRIMARY, COLLISION_PREVIEW_ERASE,
  SELECTION_MARQUEE, MAP_MARQUEE_FILL,
} from '../canvas/canvas-colors';
import { angleDegrees, isAir, isKnownProfile } from '../../core/collision/collision-model';
import { cellTileIndices } from '../../core/collision/collision-cell';
import { collisionPaintTargets } from '../../core/collision/collision-paint';
import { unpackCollisionCell, selectedCollisionWord } from '../../core/collision/collision-cell-word';
import { resolveCell, resolvePlaneWords, ensureCollisionPlanes, SECTION_PLANE_WORDS } from '../../core/collision/collision-cell-resolve';
import { drawCollisionShape } from '../../core/collision/collision-shape-draw';
import type { ShapeDrawCtx, ShapeDrawOpts } from '../../core/collision/collision-shape-draw';
import { heightSparkline } from '../../core/collision/collision-render';

export const sectionRenderer = new SectionRenderer();

// Translucent variant of the shape draw opts for the collision paint ghost.
const COLLISION_PREVIEW_OPTS: ShapeDrawOpts = {
  fill: COLLISION_PREVIEW_FILL,
  line: COLLISION_SHAPE_LINE,
  solidEdge: COLLISION_SOLID_EDGE,
  needle: COLLISION_ANGLE_NEEDLE,
  showSolidEdges: true,
  showNeedle: true,
};
const overlayRenderer = new OverlayRenderer();

/**
 * The facet the parallax guides belong to. `FACET_CAPABILITIES`' key for the
 * effects lens (workspace/facets/effects-facet.tsx mounts `mapFacet('parallax')`).
 */
const EFFECTS_FACET: FacetCapability = 'parallax';

/**
 * The scene whose layers draw as world-Y guides, or null for "no guides".
 *
 * ONE RESOLUTION, READ AT CALL TIME. The draw pass, the hit test and the commit
 * all call this, so a guide can never be drawn from one scene and dragged
 * against another. Reading state here rather than closing over it is what lets
 * `redraw` stay dependency-free (its own docblock's rule).
 *
 * `resolveSelectedScene` is the panel's own fallback, imported rather than
 * re-implemented — see its docblock.
 */
function activeGuideScene(): EffectsScene | null {
  const tabId = useSessionStore.getState().activeId;
  if (useWorkspaceStore.getState().facetFor(tabId) !== EFFECTS_FACET) return null;
  const library = useProjectStore.getState().project?.effectsScenes;
  if (!library) return null;
  return resolveSelectedScene(library, useEditorStore.getState().selectedEffectsSceneId);
}

/** True while the author is standing in the effects lens. The gate both effects overlays share. */
function inEffectsFacet(): boolean {
  const tabId = useSessionStore.getState().activeId;
  return useWorkspaceStore.getState().facetFor(tabId) === EFFECTS_FACET;
}

/**
 * The band lens for the CURRENT repaint, or null.
 *
 * Same shape and same reasoning as `activeGuideScene` above: ONE RESOLUTION,
 * READ AT CALL TIME, so the draw pass and the click gesture can never be looking
 * at different subjects, and `redraw` stays dependency-free.
 *
 * THE FACET IS THE GATE, and there is deliberately no overlay toggle: the lens
 * exists because the author is in the parallax lens with a band or a candidate
 * marked, and a toggle would be a second thing to find before the feature could
 * be discovered at all. (It is the guides' argument, and the guides' precedent.)
 */
function activeBandLens(): ReturnType<typeof resolveBandLens> | null {
  if (!inEffectsFacet()) return null;
  const lens = resolveBandLens();
  return lens.range === null ? null : lens;
}

/**
 * Everything a click on the BG plane needs to resolve into a mark, read fresh.
 *
 * ⚠ IT RESOLVES THE BACKGROUND THROUGH `resolveDisplayedBg`, so the word a click
 * reads is the word the cell the author is LOOKING AT was painted from. Reading
 * `doc.layout` directly would be right whenever the override is on screen and
 * silently wrong whenever it is not — a click on someone else's picture seeding
 * this document's slot numbers.
 */
function bandMarkContext(): {
  layout: Uint16Array;
  planeCols: number;
  planeRows: number;
  bases: number[];
  counts: number[];
  firstPromotableSlot: number;
  blobTileCount: number;
  /** The band list as it was read, so a commit can tell whether it moved. */
  witness: string;
} | null {
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);
  const holder = state.project?.bgOverride ?? null;
  const doc = holder?.doc ?? null;
  if (!act || !doc) return null;
  const resolved = resolveDisplayedBg(
    act, state.project?.bgLibrary ?? [],
    useEditorStore.getState().activeSectionIndex, holder,
  );
  // Only the override's own picture can be clicked into slot numbers. Anything
  // else is a different blob at the same indices — see `resolveBandLens`.
  if (!resolved || resolved.source !== 'override') return null;
  if (resolved.layout.length % BG_WIDTH !== 0) return null;
  const bands = documentBands(doc);
  const counts = bands.map((b) => bandTileCount(b));
  const bases = bandSlotBases(bands);
  return {
    layout: resolved.layout,
    planeCols: BG_WIDTH,
    planeRows: resolved.layout.length / BG_WIDTH,
    bases,
    counts,
    // `bandSlotBases`' tail IS the animated slot count — where the next band
    // would go, which is `bandBudget.firstPromotableSlot` by the same walk.
    firstPromotableSlot: bases[bases.length - 1],
    blobTileCount: doc.tiles.length,
    witness: JSON.stringify({ bases, counts, tiles: doc.tiles.length }),
  };
}

interface CtxMenuState {
  x: number;             // container-local px
  y: number;
  sectionIndex: number;  // map location under the cursor
  col: number;
  row: number;
}

export default function MapViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverBarRef = useRef<HTMLDivElement>(null);
  // The block under the cursor in collision-paint mode (cell units), for the
  // ghost preview. `alt` latches the live Alt key (propagate to matching blocks).
  const previewHoverRef = useRef<{ sectionIndex: number; cellCol: number; cellRow: number; alt: boolean } | null>(null);
  const isDragging = useRef(false);
  /**
   * The BG paint gesture in flight: which background, and the first-seen old
   * value per tile. Committed as ONE command on release — see endBgStroke.
   *
   * `source` is what decides WHICH command that is, and it is here rather than
   * derived at release for the reason `bgRef` already was: the resolution can
   * move mid-gesture (a section switch, a band edit), and a stroke that recorded
   * against one background and committed against another would revert cells
   * nobody painted. A change of either field flushes the stroke and starts a new
   * one.
   */
  const bgStroke = useRef<
    { source: DisplayedBgSource; bgRef: string | null;
      entries: Map<number, { oldNt: number; newNt: number }> } | null
  >(null);
  /** One refusal toast per gesture, not one per cell. Cleared with the stroke. */
  const bgRefusalShown = useRef(false);
  /**
   * The FG tile / collision paint gesture in flight — same rule as bgStroke.
   *
   * A DRAG IS ONE EDIT. Each cell used to execute its own command, so a 60-cell
   * drag put 60 entries on a 200-deep stack and a few drags evicted the whole
   * session's history — while Ctrl+Z undid the stroke one cell at a time.
   * Classic coalesces its equivalent correctly; this is that.
   */
  const paintStroke = useRef<
    | { kind: 'tiles'; sectionIndex: number; entries: Map<number, { oldNt: number; newNt: number }> }
    | { kind: 'collision'; sectionIndex: number; plane: 'a' | 'b'; blocks: number; entries: Map<number, { oldColl: number; newColl: number }> }
    | null
  >(null);
  // Screen pos at mousedown — used to tell a View-mode click (select the section
  // under the cursor) from a pan-drag.
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const isPaintDragging = useRef(false);
  const lastPaintedCell = useRef<string | null>(null);
  // Collision paint mode latched at mousedown (Alt = propagate to every matching
  // block; default = just the clicked block), so toggling Alt mid-drag can't
  // switch a single stroke between local and reuse.
  const paintPropagate = useRef(false);
  // Marquee tool: the drag-start tile + section, fixed for the whole drag so the
  // marquee always resolves against the section the drag STARTED in even if the
  // cursor wanders over another section's world space.
  const marqueeDragStart = useRef<{ sectionIndex: number; col: number; row: number } | null>(null);
  const isMarqueeDragging = useRef(false);
  // Paste mode (editorStore `pasting`): the hovered section + even-snapped
  // footprint origin for the ghost preview and click-to-commit. Purely local
  // render state (like previewHoverRef) — nothing outside MapViewport needs
  // the exact hovered cell, only whether pasting is active (store).
  const pasteHoverRef = useRef<{ sectionIndex: number; baseCol: number; baseRow: number } | null>(null);
  /**
   * Where a stamp would land, in the same shape as the paste ghost.
   *
   * Aeon had no stamp preview at all: you picked a chunk out of a wall of
   * seventy thumbnails and clicked blind, learning where it went only by
   * undoing. Classic has had one; this closes the gap the owner reported.
   */
  const stampHoverRef = useRef<{ sectionIndex: number; baseCol: number; baseRow: number; chunkId: string } | null>(null);
  /** Rasterised chunk art for the ghost, cached so a mousemove is not a re-render. */
  const stampGhostRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragTarget = useRef<{
    type: 'object' | 'ring';
    sectionIndex: number;
    index: number;
    startX: number;
    startY: number;
  } | null>(null);

  /**
   * The parallax-guide drag in flight (ROADMAP item 43): which layer of which
   * scene, and where it currently sits.
   *
   * ═══ WHY IT CARRIES A WITNESS ═══
   *
   * A gesture can outlive the thing it started on, and this repo has been bitten
   * by exactly that: a window-level KEYDOWN handler switched the open document
   * with no pointer event at all, and the in-flight drag wrote stale indices
   * into the NEW document, once per mousemove. `sceneId` + `index` are a stale
   * pair the moment a layer is added or removed, or a different project is
   * opened — and `layers[3]` still resolves afterwards, so the write would
   * SUCCEED against the wrong layer rather than fail loudly.
   *
   * `witness` is the grabbed layer serialized at mousedown. The commit re-reads
   * `scenes[sceneId].layers[index]`, compares, and writes nothing if it differs.
   * A drag whose subject moved commits nothing; it does not commit to whatever
   * is at that index now.
   *
   * A REF, NOT STATE, so a mousemove is not a React render. The live preview
   * repaints through `redraw()`, which reads this ref at call time.
   */
  const guideDrag = useRef<
    { sceneId: string; index: number; startWorldY: number; worldY: number; witness: string } | null
  >(null);
  /**
   * The guide under the cursor. STATE, not a ref, because it drives the
   * container's `cursor` as well as the highlight — one source for both, so they
   * cannot disagree about which guide is hot. `setGuideHover` is its only
   * writer, and it fires on CROSSING a guide, not on every mousemove.
   *
   * `guideHoverRef` is a RENDER-TIME MIRROR of it, not a second source, and it
   * exists for the reason `previewVersionRef` below does: `redraw` also runs
   * from outside a render (the resize observer, the band clock) and is
   * deliberately dependency-free, so it cannot close over a state value without
   * capturing one forever.
   */
  const [guideHover, setGuideHover] = useState<number | null>(null);
  const guideHoverRef = useRef<number | null>(null);
  guideHoverRef.current = guideHover;

  // ---- The screen frame (triage 2026-08-26 row G) --------------------------
  // Same shape as the guide drag, for the same reasons: a REF for the drag in
  // flight (a mousemove is not a React render; `redraw` reads it at call time
  // and the store is written ONCE on release), STATE for the hover because it
  // drives the container's cursor, and a render-time mirror of that state so
  // the dependency-free `redraw` can read it.
  const frameDrag = useRef<
    { startAnchor: ScreenFrameAnchor; pressWorld: { x: number; y: number }; anchor: ScreenFrameAnchor } | null
  >(null);
  const [frameHover, setFrameHover] = useState(false);
  const frameHoverRef = useRef(false);
  frameHoverRef.current = frameHover;
  const screenFrame = useViewStore((s) => s.screenFrame);

  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  const vpX = useViewStore((s) => s.vpX);
  const vpY = useViewStore((s) => s.vpY);
  const zoom = useViewStore((s) => s.zoom);
  const overlays = useViewStore((s) => s.overlays);
  const pan = useViewStore((s) => s.pan);
  const setZoom = useViewStore((s) => s.setZoom);
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const currentActId = useProjectStore((s) => s.currentActId);
  const objectSprites = useProjectStore((s) => s.objectSprites);
  const collisionProfiles = useProjectStore((s) => s.collisionProfiles);
  // Two repaint clocks: committed edits arrive through the undo hub, live ones
  // (a drag in flight, a direct BG tile write) through the editor store.
  // Scoped to this act's layout + zone-art documents: every dependency of this
  // effect chain is a full section re-prerender, so an unrelated document's
  // undo pointer must not reach it.
  const historyVersion = useAeonHistoryVersion();
  const liveEditVersion = useEditorStore((s) => s.liveEditVersion);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const selection = useEditorStore((s) => s.selection);

  // ---- Parallax layer guides (ROADMAP item 43) ----------------------------
  // THE FACET IS THE GATE, and there is deliberately no overlay toggle of its
  // own: guides exist because the author is standing in the parallax lens with a
  // scene selected, and a toggle would be a second thing to find before the
  // feature could be discovered at all.
  //
  // BOTH OF THESE ARE SUBSCRIBED, not read through getState() inside `redraw`,
  // and that is the whole reason they are here: `redraw` is dependency-free by
  // design, so nothing about a facet switch or a scene pick would repaint the
  // canvas on its own. Adding them to the visual effect's deps below is a
  // state-change repaint like `activeSectionIndex`, not a clock — MapViewport's
  // measured zero-idle-repaint property is untouched.
  const activeTabId = useSessionStore((s) => s.activeId);
  const activeFacet = useWorkspaceStore((s) => s.facetFor(activeTabId));
  const selectedEffectsSceneId = useEditorStore((s) => s.selectedEffectsSceneId);

  // ---- The band lens (ROADMAP item 43 part 2) ------------------------------
  // Subscribed for the same reason the two above are: `redraw` is dependency-
  // free by design, so nothing about marking a band or moving the candidate
  // would repaint the canvas on its own. Both are discrete state changes — a
  // click on a cell, a click on a card, a keystroke in the form — never a tick,
  // so this is a state-change repaint like `activeSectionIndex` and the
  // viewport's zero-idle-repaint property is untouched.
  const bandLensTarget = useEditorStore((s) => s.bandLensTarget);
  const bandCandidate = useEditorStore((s) => s.bandCandidate);
  /**
   * The cell a press landed on, held from mousedown to mouseup.
   *
   * A REF, NOT STATE — a press is not a React render. It carries a WITNESS of
   * the band list and blob size as they were at mousedown, because a band
   * command RENUMBERS `tiles` and rewrites every layout word: if the document
   * moves between press and release (an undo through the window keydown
   * listener, a synthetic click on Demote — the non-pointer paths item 43 part 1
   * enumerates), the slot this cell named is not the slot it names now, and
   * seeding from it would mark a range the author never pointed at. The commit
   * re-reads and drops the mark rather than writing through a stale word.
   */
  const bandMark = useRef<
    { cell: number; word: number; witness: string } | null
  >(null);

  // ---- BgAnim band preview state (ROADMAP item 42) -------------------------
  // The game frame the preview is showing. Zero (level init) whenever playback
  // is off, so the static view IS the band's rest state — the same picture the
  // author sees with the toggle down, and the same one `phases[0]` bakes.
  const bandFrameRef = useRef(0);
  // The step key the last repaint drew at, so the clock repaints on a STEP
  // change rather than on a tick.
  const bandKeyRef = useRef('');
  // How many DRAWABLE bands read the clock. STATE, not a ref, because the clock
  // effect mounts on it: a band appearing (or being licensed by a background
  // change) has to start the clock, and a ref would not re-run the effect.
  const [timerBands, setTimerBands] = useState(0);
  // The render-time edit clock the preview's prepare signature is keyed on.
  // Held in a ref because `redraw` also runs from the clock's rAF — outside a
  // render — and must see the last rendered value rather than close over one
  // set forever.
  const previewVersionRef = useRef('');
  previewVersionRef.current = `${historyVersion}:${liveEditVersion}`;

  /** Re-derive the preview and keep the clock's mount condition in step. */
  const syncBandPreview = useCallback(() => {
    const snapshot = refreshBandPreview(previewVersionRef.current);
    setTimerBands((prev) => (prev === snapshot.timerBands ? prev : snapshot.timerBands));
  }, []);

  // Collision paint ghost: on a separate canvas layered over the map, draw a
  // translucent preview of the selected shape under the cursor plus an outline of
  // every block the stroke would change (single block / propagate set / brush area).
  // Reads everything fresh so it can be called from the render effect (pan/zoom/
  // version realign) and from mousemove (cell change). Clears when not painting.
  const drawCollisionPreview = useCallback(() => {
    const pcv = previewCanvasRef.current, container = containerRef.current;
    if (!pcv || !container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width), h = Math.floor(rect.height);
    if (pcv.width !== w || pcv.height !== h) { pcv.width = w; pcv.height = h; }
    const ctx = pcv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, pcv.width, pcv.height);

    // Marquee selection: drawn whenever one is committed, independent of the
    // active tool (Ctrl+C copy works without the marquee tool staying active,
    // so the selection stays visible after switching tools).
    const marquee = useEditorStore.getState().marquee;
    if (marquee) {
      const mOffset = sectionRenderer.sectionWorldOffset(marquee.sectionIndex);
      const { vpX: mvpX, vpY: mvpY, zoom: mZoom } = useViewStore.getState();
      const mx = mOffset.x + marquee.col * 8, my = mOffset.y + marquee.row * 8;
      const mw = marquee.w * 8, mh = marquee.h * 8;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.scale(mZoom, mZoom);
      ctx.translate(-mvpX, -mvpY);
      ctx.fillStyle = MAP_MARQUEE_FILL;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = SELECTION_MARQUEE;
      ctx.lineWidth = 2 / mZoom;
      ctx.setLineDash([4 / mZoom, 4 / mZoom]);
      ctx.strokeRect(mx, my, mw, mh);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Stamp ghost: the CHUNK'S ACTUAL ART, translucent, at the snapped origin,
    // plus a footprint outline.
    //
    // Deliberately unlike the paste ghost below, which is footprint-only by an
    // earlier decision. Different question: a paste's contents are what you
    // just copied and still remember, whereas a stamp's contents are one of
    // seventy library thumbnails you picked a moment ago — so "which chunk"
    // matters as much as "where", and only the art answers it.
    {
      const stampHover = stampHoverRef.current;
      if (stampHover && useEditorStore.getState().tool === 'stamp-chunk') {
        const liveProject = useProjectStore.getState().project;
        const chunk = liveProject?.chunkLibrary.find((c) => c.id === stampHover.chunkId);
        const zone = getCurrentZone(useProjectStore.getState());
        if (chunk && zone) {
          // Keyed on liveEditVersion so editing the chunk's art re-rasterises the
          // ghost rather than showing a stale picture of it.
          const key = `${chunk.id}:${useEditorStore.getState().liveEditVersion}:${zone.id}`;
          if (stampGhostRef.current?.key !== key) {
            // NATIVE size, not the thumbnail rasterizer: the ghost canvas is
            // sized to the chunk's own footprint below, and the fixed 128x128
            // buffer threw RangeError on img.data.set for every marquee-saved
            // chunk smaller than 16x16 tiles — from mousemove that ate the
            // ghost, and re-thrown inside the render effect after the stamp
            // click it unmounted the whole React root (the owner's crash).
            const rgba = rasterizeAeonChunkNative(chunk, zone.tileset.tiles, zone.palette);
            if (rgba) {
              const px = chunk.widthTiles * 8, py = chunk.heightTiles * 8;
              const off = document.createElement('canvas');
              off.width = px; off.height = py;
              const octx = off.getContext('2d');
              if (octx) {
                // createImageData + set, matching TilesetPanel: the rasterizer
                // hands back a Uint8ClampedArray, and the ImageData constructor
                // wants its own buffer type.
                const img = octx.createImageData(px, py);
                img.data.set(rgba);
                octx.putImageData(img, 0, 0);
                stampGhostRef.current = { key, canvas: off };
              }
            }
          }
          const sOffset = sectionRenderer.sectionWorldOffset(stampHover.sectionIndex);
          const { vpX: svpX, vpY: svpY, zoom: sZoom } = useViewStore.getState();
          const sx = sOffset.x + stampHover.baseCol * 8, sy = sOffset.y + stampHover.baseRow * 8;
          const sw = chunk.widthTiles * 8, sh = chunk.heightTiles * 8;
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.scale(sZoom, sZoom);
          ctx.translate(-svpX, -svpY);
          const ghost = stampGhostRef.current;
          if (ghost && ghost.key === key) {
            ctx.globalAlpha = 0.55;      // clearly a preview, still readable as art
            ctx.drawImage(ghost.canvas, sx, sy, sw, sh);
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = SELECTION_MARQUEE;
          ctx.lineWidth = 2 / sZoom;
          ctx.strokeRect(sx, sy, sw, sh);
          ctx.restore();
        }
      }
    }

    // Paste ghost: the clipboard footprint as a translucent fill + outline at
    // the hovered even-snapped origin, plus per-cell shading where the
    // clipboard's collision is nonzero when a collision overlay is visible.
    // Footprint-only — deliberately NOT a full art preview (placement aid).
    if (useEditorStore.getState().pasting) {
      const pasteHover = pasteHoverRef.current;
      const clip = useEditorStore.getState().mapClipboard;
      if (pasteHover && clip) {
        const pOffset = sectionRenderer.sectionWorldOffset(pasteHover.sectionIndex);
        const { vpX: pvpX, vpY: pvpY, zoom: pZoom } = useViewStore.getState();
        const px = pOffset.x + pasteHover.baseCol * 8, py = pOffset.y + pasteHover.baseRow * 8;
        const pw = clip.widthTiles * 8, ph = clip.heightTiles * 8;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.scale(pZoom, pZoom);
        ctx.translate(-pvpX, -pvpY);
        ctx.fillStyle = MAP_MARQUEE_FILL;
        ctx.fillRect(px, py, pw, ph);

        const ov = useViewStore.getState().overlays;
        if (ov.showCollision || ov.showCollisionPathB) {
          const showB = ov.showCollisionPathB && !ov.showCollision;
          const plane = showB ? clip.collisionB : clip.collisionA;
          const cellsW = clip.widthTiles >> 1, cellsH = clip.heightTiles >> 1;
          ctx.fillStyle = COLLISION_PREVIEW_FILL;
          for (let cy = 0; cy < cellsH; cy++) {
            for (let cx = 0; cx < cellsW; cx++) {
              if (plane[cy * cellsW + cx] === 0) continue;
              ctx.fillRect(px + cx * 16, py + cy * 16, 16, 16);
            }
          }
        }

        ctx.strokeStyle = SELECTION_MARQUEE;
        ctx.lineWidth = 2 / pZoom;
        ctx.setLineDash([4 / pZoom, 4 / pZoom]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    const hover = previewHoverRef.current;
    if (!hover
      || useEditorStore.getState().tool !== 'paint-collision'
      || useEditorStore.getState().editingLayer === 'bg') return;

    const act = getCurrentAct(useProjectStore.getState());
    const section = act?.sections[hover.sectionIndex];
    if (!section) return;

    const profiles = useProjectStore.getState().collisionProfiles;
    const profileIdx = useEditorStore.getState().selectedCollisionProfile;
    const brush = useEditorStore.getState().collisionBrushSize;
    const cellsW = SECTION_TILES_WIDE / 2, cellsH = SECTION_TILES_HIGH / 2;
    const { primary, all } = collisionPaintTargets({
      cellCol: hover.cellCol, cellRow: hover.cellRow, brush, propagate: hover.alt,
      nametable: section.tileGrid.nametable, width: SECTION_TILES_WIDE, cellsW, cellsH,
    });
    const offset = sectionRenderer.sectionWorldOffset(hover.sectionIndex);
    const { vpX, vpY, zoom } = useViewStore.getState();
    const erasing = profileIdx === 0;
    // Ghost the flipped/solidity-shaded shape exactly as it will paint + bake.
    const est = useEditorStore.getState();
    const ghostWord = selectedCollisionWord({
      shape: profileIdx, entryFlipX: est.selectedCollisionEntryFlipX, userXFlip: est.selectedCollisionXFlip,
      yFlip: est.selectedCollisionYFlip, solidity: est.selectedCollisionSolidity,
    });
    const profile = erasing ? null : resolveCell(profiles, ghostWord).profile;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);

    // Scope: outline every block the stroke would change (erase tints red).
    const inset = 0.5 / zoom;
    for (const t of all) {
      const wx = offset.x + t.cellCol * 16, wy = offset.y + t.cellRow * 16;
      if (erasing) { ctx.fillStyle = COLLISION_PREVIEW_ERASE; ctx.fillRect(wx, wy, 16, 16); }
      ctx.strokeStyle = COLLISION_PREVIEW_SCOPE;
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(wx + inset, wy + inset, 16 - 2 * inset, 16 - 2 * inset);
    }

    // The shape ghost at the cursor cell + a brighter outline.
    const wx = offset.x + primary.cellCol * 16, wy = offset.y + primary.cellRow * 16;
    if (profile) drawCollisionShape(ctx as unknown as ShapeDrawCtx, wx, wy, 16, profile, COLLISION_PREVIEW_OPTS);
    ctx.strokeStyle = COLLISION_PREVIEW_PRIMARY;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(wx + 0.75 / zoom, wy + 0.75 / zoom, 16 - 1.5 / zoom, 16 - 1.5 / zoom);

    ctx.restore();
  }, []);

  // Rebuild only the BG entry from the resolved background of the ACTIVE
  // section (the BG override on the act it binds; else bgLayoutRef -> library
  // entry; else act default). Lighter than reloadAllSections — used when the
  // active section or its assignment changes (FG canvases are untouched).
  const reloadBg = useCallback(() => {
    const state = useProjectStore.getState();
    const zone = getCurrentZone(state);
    const act = getCurrentAct(state);
    if (!zone || !act) return;

    sectionRenderer.clearBg();
    const resolved = resolveDisplayedBg(
      act,
      state.project?.bgLibrary ?? [],
      useEditorStore.getState().activeSectionIndex,
      state.project?.bgOverride ?? null,
    );
    if (resolved) {
      const bgHeight = Math.floor(resolved.layout.length / BG_WIDTH);
      if (bgHeight > 0) {
        sectionRenderer.loadBg(resolved.layout, BG_WIDTH, bgHeight, resolved.tiles, zone.palette.lines);
      }
    }
  }, []);

  // Re-prerender the tile art and repaint every section + bg from current
  // project state. Stable callback: reads stores via getState so it can also be
  // invoked from the command-invalidation listener (palette/tileset changes
  // invalidate the prerendered tile bitmaps baked into each TileRenderer).
  //
  // `structural` distinguishes the two reasons the canvases go stale:
  //  • true  — the GRID changed (sections added/removed/resized/moved/pasted),
  //    or we are loading a different act/project. The section->canvas map has
  //    to be torn down and the grid dimensions reset.
  //  • false — only COLOURS or TILE PIXELS changed (set-palette-line,
  //    set-tileset-tiles). Every nametable, every grid dimension and every
  //    section->canvas binding is still valid, so the canvases are repainted
  //    in place: no setGrid, no clearSections, and loadSection reuses the
  //    existing 16 MB OffscreenCanvas instead of allocating a new one.
  const loadAllSections = useCallback((structural: boolean) => {
    const state = useProjectStore.getState();
    const zone = getCurrentZone(state);
    const act = getCurrentAct(state);
    if (!zone || !act) return;

    // Defence in depth: an in-place rebuild is only sound while the renderer's
    // idea of the grid still matches the act. Anything else falls back to the
    // full structural path rather than painting into a stale layout.
    const inPlace = structural
      ? false
      : sectionRenderer.sectionCount() > 0
        && sectionRenderer.getGridWidth() === act.gridWidth
        && sectionRenderer.getGridHeight() === act.gridHeight;

    if (!inPlace) {
      sectionRenderer.setGrid(act.gridWidth, act.gridHeight);
      sectionRenderer.clearSections();
    }
    // Prerender the zone tileset ONCE; sections share it (the per-section
    // prerender re-rendered the whole atlas for every section at load).
    sectionRenderer.prepareTiles(zone.tileset.tiles, zone.palette.lines);

    // Unified atlas: section nametables index into the zone tileset. The
    // section.tiles override is kept for future per-section art, but nothing
    // assigns it today (the load-time atlas migration nulls legacy pins).
    for (let i = 0; i < act.sections.length; i++) {
      const section = act.sections[i];
      if (!section) continue;
      if (section.tiles) {
        sectionRenderer.loadSection(i, section.tileGrid, section.tiles, zone.palette.lines);
      } else {
        sectionRenderer.loadSection(i, section.tileGrid); // reuse shared prerender
      }
    }

    reloadBg();
  }, [reloadBg]);

  /** Full rebuild — for structural (grid/section-set) changes and act loads. */
  const reloadAllSections = useCallback(() => loadAllSections(true), [loadAllSections]);

  /**
   * Colour/pixel-only rebuild. set-palette-line and set-tileset-tiles change
   * what tiles LOOK like, never where they are, so the grid and the section
   * canvases survive; only the baked bitmaps have to be redrawn.
   */
  const rebuildTileArt = useCallback(() => loadAllSections(false), [loadAllSections]);

  // Load all sections + bg when project/act changes
  useEffect(() => {
    reloadAllSections();
  }, [project, currentZoneId, currentActId, reloadAllSections]);

  // A marquee/paste from a different act or zone is stale (and pasting into
  // the wrong act would be actively dangerous) — clear both whenever the
  // act/zone identity changes. Deliberately NOT keyed on `project` (which the
  // effect above IS keyed on for reload) — edits mutate the project in place
  // without changing this identity, so this only fires on an actual act/zone
  // switch, not on every command.
  useEffect(() => {
    useEditorStore.getState().setMarquee(null);
    useEditorStore.getState().setPasting(false);
  }, [currentZoneId, currentActId]);

  // Re-resolve the displayed BG when the active section changes — its
  // bgLayoutRef may point at a different library entry (or the act default).
  useEffect(() => {
    reloadBg();
  }, [activeSectionIndex, reloadBg]);

  // Centralized renderer-cache invalidation: every command executed/undone/redone
  // (UI tools, keyboard undo/redo, or the agent handler) lands here so the
  // section canvases never go stale.
  useEffect(() => {
    setCommandInvalidationListener((cmd: AnyCommand) => {
      switch (cmd.type) {
        case 'set-tiles':
          sectionRenderer.markDirty(cmd.sectionIndex, cmd.entries.map(e => e.index));
          break;
        case 'set-tileset-tiles':
        case 'set-palette-line':
          // Colours / tile pixels only. These are baked into the prerendered
          // bitmaps, so the sections must be repainted — but the nametables and
          // the grid are untouched, so this takes the in-place path rather than
          // tearing down and reallocating every section canvas.
          rebuildTileArt();
          break;
        case 'set-sections':
          // A structural grid change (add/remove/resize/move/paste) re-indexes
          // the whole grid — full rebuild.
          reloadAllSections();
          break;
        case 'set-bg-tiles':
        case 'set-bg-override-layout':
          // Per-tile: repaint just those, the same way the live stroke does.
          // Sound for the override too, because the command's applier writes the
          // canvas's mirror through the same writer the stroke used — the array
          // the renderer is holding is already correct by the time this runs.
          sectionRenderer.markBgDirty(cmd.entries.map((e) => e.index));
          break;
        case 'set-bg-override-band':
          // A band insert/remove RENUMBERS the whole tile blob and rewrites every
          // layout word that named a moved tile, and it does so by replacing the
          // DOCUMENT. On the act that binds the override the viewport is painting
          // that document, so nothing here is still valid — re-resolve, do not
          // dirty cells. (Before the canvas painted the override this case did
          // not exist, because a band edit could not change what was on screen.)
          reloadBg();
          break;
        case 'set-bg':
          // The BG entry's canvas and TileRenderer are built from the
          // resolved layout/tiles arrays in loadBg — rebuild from the new
          // arrays. FG canvases are untouched by both commands.
        case 'set-section-bg':
          // Which BG the viewport composites depends on the active section's
          // ref — re-resolve against the library/act default.
          reloadBg();
          break;
        default:
          // set-chunk thumbnail invalidation is a store concern handled in
          // editorStore (bumpStoreVersions) so it survives Art mode.
          // Objects/rings AND the collision overlay (incl. set-collision-edit)
          // are drawn by the OverlayRenderer from live state every frame; the
          // history-clock bump already re-renders them — no markDirty needed.
          break;
      }
    });
    return () => setCommandInvalidationListener(null);
  }, [reloadAllSections, rebuildTileArt, reloadBg]);

  /**
   * Paint the map canvas from CURRENT store state. ONE draw body, called from
   * three places: the visual-change effect below, the ResizeObserver, and the
   * BgAnim playback clock.
   *
   * DELIBERATELY DEPENDENCY-FREE. Everything it needs — viewport, overlays,
   * layer, active section, project — is read through `getState()` at call time,
   * so the callback identity never changes and the clock cannot capture a stale
   * one. That is also why the resize path can share it: it had its own
   * near-copy of this body, which had already drifted (it passed `undefined`
   * for the object sprites, so a window resize silently downgraded every object
   * preview to a box until the next real repaint).
   *
   * `canvas.width = rect.width` stays the first thing it does: it is both the
   * clear and the marker the CDP repaint harnesses count.
   */
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.imageSmoothingEnabled = false;

    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    if (!act) {
      ctx.fillStyle = CANVAS_VOID;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const view = useViewStore.getState();
    const ed = useEditorStore.getState();
    const overlayOpts = view.overlays;
    const viewport = { x: view.vpX, y: view.vpY, width: canvas.width, height: canvas.height, zoom: view.zoom };

    syncBandPreview();

    // The band overlay goes over Plane B and UNDER the foreground, because that
    // is where the art it replaces lives. Drawing it after the FG composite
    // would put background tiles on top of the level.
    const drawBands = () => {
      if (!overlayOpts.playAnimatedArt) return;
      bandPreview.draw(ctx, viewport, {
        cameraXPx: editorPanToCameraPx(view.vpX),
        cameraYPx: editorPanToCameraPx(view.vpY),
        gameFrame: bandFrameRef.current,
      });
    };

    if (ed.editingLayer === 'bg') {
      sectionRenderer.renderBg(ctx, viewport);
      drawBands();
    } else {
      // showBgPlane: paint Plane B first, then composite the foreground over
      // it (empty FG words are transparent in the section canvases). Only
      // composite when a BG is actually loaded — otherwise render() must
      // clear the canvas itself or stale frames ghost through.
      const bgVisible = overlayOpts.showBgPlane && sectionRenderer.hasBg();
      if (bgVisible) {
        sectionRenderer.renderBg(ctx, viewport);
        drawBands();
      }
      sectionRenderer.render(ctx, viewport, ed.activeSectionIndex, !bgVisible);

      const sectionInfos: SectionOverlayInfo[] = [];
      for (let i = 0; i < act.sections.length; i++) {
        const section = act.sections[i];
        if (!section) continue;
        const offset = sectionRenderer.sectionWorldOffset(i);
        sectionInfos.push({ section, offsetX: offset.x, offsetY: offset.y });
      }

      overlayRenderer.render(ctx, sectionInfos, overlayOpts, viewport, state.objectSprites, state.collisionProfiles);
    }

    // THE BAND LENS (ROADMAP item 43 part 2), under the guides and over
    // everything else, in BOTH branches for the guides' reason one block down:
    // it is authoring chrome about the background, and an author in the effects
    // facet is free to be on either layer. A tint that vanished on a layer
    // switch would read as a bug in the tint.
    //
    // NO CLOCK. This is inside the pass that already repaints on a pan, a zoom,
    // a store change and an undo; it schedules nothing.
    // THE SCREEN FRAME (triage 2026-08-26 row G), UNDER the lens and the guides:
    // it is a reference, not chrome about a document, so the things that ARE
    // about the document draw over it. In both layer branches, like them.
    //
    // NO CLOCK. Inside the same pass; schedules nothing. A drag in flight reads
    // the ref, otherwise the store's pinned anchor.
    if (overlayOpts.showScreenFrame) {
      const fd = frameDrag.current;
      const anchor = fd ? fd.anchor : view.screenFrame;
      const rect = drawScreenFrame(ctx, viewport, anchor, { active: fd !== null || frameHoverRef.current });
      publishScreenFrameReport({ active: true, anchor, rect, dragging: fd !== null });
    } else {
      publishScreenFrameReport({ active: false, anchor: null, rect: null, dragging: false });
    }

    const lens = activeBandLens();
    if (lens && lens.range) {
      const cells = lens.coverage?.cells ?? [];
      const drawn = drawBandLens(ctx, viewport, cells);
      // THE CAPTION, and it leads with WHAT THE WASH IS rather than with slot
      // arithmetic. The first person to see this lens read the tint as
      // information and could not tell what information — so line 1 is
      // `coverageSubject` ("highlighted: the cells band 0 animates"), carrying a
      // swatch of the wash's own colour, anchored beside the coverage instead of
      // in the opposite corner. Line 2 is the SHAPE, in the same neutral words
      // the panel prints. It is on the canvas at all because both band sections
      // arrive collapsed (item 45), so an author who clicks a cell on arrival
      // would otherwise have a wash whose range lives inside a shut box.
      drawBandLensLabel(ctx, viewport, [
        coverageSubject(lens.kind ?? 'candidate', lens.bandIndex, lens.range),
        lens.reason !== null ? lens.reason.slice(0, 96)
          : lens.coverage ? coverageSummary(lens.coverage) : '',
      ].filter((s) => s !== ''),
      bandLensAnchor(viewport, coverageBounds(cells)));
      publishBandLensReport({
        active: true, kind: lens.kind, bandIndex: lens.bandIndex,
        range: { base: lens.range.base, count: lens.range.count },
        cells: cells.length, drawn,
        largestSlotCells: lens.coverage?.largest?.cells ?? null,
        reason: lens.reason,
      });
    } else {
      publishBandLensReport({
        active: false, kind: null, bandIndex: null, range: null,
        cells: 0, drawn: 0, largestSlotCells: null, reason: null,
      });
    }

    // Parallax layer guides, LAST and in BOTH branches (ROADMAP item 43). Last
    // because a world-Y division is authoring chrome, not art: it has to stay
    // readable over the foreground it divides. Both branches because the effects
    // facet leaves the author free to be on the BG layer, and a guide that
    // vanishes when they switch layers reads as a bug in the guide.
    const guideScene = activeGuideScene();
    if (guideScene) {
      const drag = guideDrag.current;
      // A LOCKED scene's tops are screen lines (aeon scene_plane_line: identity
      // mapping), so its guides are drawn from the viewport's top edge — until
      // the screen frame (parcel G) lands and gives them a real 224-line frame
      // to sit in — and carry a caption saying so. The provider decides.
      const opts = {
        dragIndex: drag && drag.sceneId === guideScene.id ? drag.index : null,
        dragWorldY: drag?.worldY,
        hoverIndex: guideHoverRef.current,
        space: layerTopSpace(guideScene),
      };
      drawLayerGuides(ctx, viewport, guideScene.layers, opts);
      publishGuideReport({
        active: true, sceneId: guideScene.id, space: opts.space,
        rows: layerGuideGeometry(guideScene.layers, viewport, opts),
        dragIndex: opts.dragIndex, hoverIndex: opts.hoverIndex,
      });
    } else {
      publishGuideReport({
        active: false, sceneId: null, space: null, rows: [], dragIndex: null, hoverIndex: null,
      });
    }

    // Realign the collision paint ghost after any pan/zoom/version change.
    drawCollisionPreview();
  }, [drawCollisionPreview, syncBandPreview]);

  // Re-render when anything visual changes
  useEffect(() => {
    redraw();
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, activeSectionIndex, editingLayer, historyVersion, liveEditVersion, selection, objectSprites, collisionProfiles,
    // Parallax guides (item 43): the facet gate, the scene pick and the hover
    // highlight. Each is a discrete state change — a pill click, a list click,
    // the cursor crossing a line — never a tick.
    activeFacet, selectedEffectsSceneId, guideHover,
    // The band lens (item 43 part 2): the mark and the candidate geometry.
    // ⚠ `bandCandidate` is BELT-AND-BRACES and measured to be so: dropping it
    // alone turns no harness row red, because `setBandCandidate` also writes a
    // fresh `{kind:'candidate'}` into `bandLensTarget`, whose identity change
    // already carries the repaint. It stays because a future setter that
    // preserved that identity would silently kill the live update, and because
    // a dependency list should name what the pass reads.
    bandLensTarget, bandCandidate,
    // The screen frame (row G): its pinned anchor (written once per release)
    // and the edge hover. Discrete changes, never a tick.
    screenFrame, frameHover,
    redraw]);

  // Handle resize. The observer repaints through the SAME `redraw` the visual
  // effect uses — it used to carry its own copy of the draw body, which had
  // already drifted from it (no object sprites, and now no band overlay). One
  // body means a resize cannot show a different picture from a repaint.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  // ---- BgAnim band playback (ROADMAP item 42) ------------------------------
  // The clock, and it is DELIBERATELY SMALL. Classic's shape
  // (ClassicLevelViewport's animated-art clock) copied LOCALLY, not hoisted:
  // there is no shared play-clock service in this tree and the preview-posture
  // ruling §2 Q3 says not to grow one for wave 1.
  //
  // WHAT IT REFUSES TO DO IS THE POINT:
  //
  //  • It returns BEFORE scheduling anything unless playback is on AND a
  //    drawable band actually reads the clock. The viewport's measured
  //    zero-idle-repaint property is CONDITIONED by this parcel, not spent:
  //    with the toggle off, no rAF exists at all.
  //  • `camera_x` / `camera_y` bands never reach here. Their phase is a pure
  //    function of the pan, and the draw effect already repaints on a pan —
  //    `timerBandCount` is the count of DRAWABLE TIMER bands for exactly that
  //    reason. A camera band scrolling on a wall clock would be a preview of a
  //    driver model the engine does not have.
  //  • It repaints on the STEP KEY, not on the tick. At the default rate_shift
  //    that is ~15 repaints/s against 60 ticks.
  //  • `t0` is taken at toggle-on, so playback is deterministic from game-frame
  //    0 every time — the state the static view already shows.
  useEffect(() => {
    bandFrameRef.current = 0;
    bandKeyRef.current = '';
    if (!overlays.playAnimatedArt || timerBands === 0) return;

    const t0 = performance.now();
    let handle = 0;
    const tick = () => {
      const t = Math.floor(((performance.now() - t0) * 60) / 1000);
      bandFrameRef.current = t;
      const view = useViewStore.getState();
      const key = bandPreview.stepKey({
        cameraXPx: editorPanToCameraPx(view.vpX),
        cameraYPx: editorPanToCameraPx(view.vpY),
        gameFrame: t,
      });
      if (key !== bandKeyRef.current) {
        bandKeyRef.current = key;
        redraw();
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      // Toggle-off restores the static view with no explicit repaint of its
      // own: flipping the overlay key re-renders, the visual effect repaints,
      // and the draw pass simply skips the overlay. Nothing was ever written to
      // the BG canvas, the blob, or the document.
      bandFrameRef.current = 0;
      bandKeyRef.current = '';
    };
  }, [overlays.playAnimatedArt, timerBands, redraw]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // The level pane is keep-alive (display:none) under an active sprite-doc
      // or canvas-doc tab, so this window handler stays registered. Bail while
      // that editor owns the keyboard: the shortcuts BELOW are this pane's own
      // (map clipboard, tool letters), and firing them from a tab whose pane is
      // hidden acts on a document the user cannot see. Undo is not among them —
      // it was hoisted to LevelWorkspace — so the "one Ctrl+Z fires both" story
      // this comment used to tell was wrong twice over. See level-keys.ts.
      if (!levelKeysEnabled()) return;

      // Typing into an input/textarea/contentEditable (e.g. the CommandPalette
      // search box) must not fire map shortcuts — 'm' switching to the marquee
      // tool mid-keystroke was the reported symptom.
      const target = e.target as HTMLElement | null;
      // The shared rule, not a fourth copy: this one used to miss the input-TYPE
      // filter, so a focused range slider counted as typing and swallowed every
      // map key while it had focus.
      if (isTypingTarget(target)) {
        return;
      }

      const state = useProjectStore.getState();
      const act = getCurrentAct(state);
      // Must include zone tileset/palette so the commands issued below reach the
      // zone data (set-palette-line / set-tileset-tiles) as well as the act's.
      const level: S4Level | null = getStoreActiveLevel(state);

      // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are NOT handled here — LevelWorkspace
      // owns the one level-undo binding for both engines (see its comment).

      // Copy the marquee selection to the map clipboard. Works regardless of
      // which tool is active — the marquee tool doesn't need to stay selected
      // for a copy to land (only Escape-while-marquee-active clears it).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const marquee = useEditorStore.getState().marquee;
        if (marquee) {
          const section = act?.sections[marquee.sectionIndex];
          if (section) {
            const clip = copyFromSection(section, marquee.col, marquee.row, marquee.w, marquee.h);
            useEditorStore.getState().setMapClipboard(clip);
            useToastStore.getState().addToast(
              `Copied ${marquee.w / 2}×${marquee.h / 2} blocks`, 'success',
            );
          }
          // Only claim the shortcut (and swallow browser text-copy) when there was
          // actually a marquee to copy — a no-op Ctrl+C (nothing selected) falls
          // through so text selections elsewhere on the page still copy normally.
          e.preventDefault();
          return;
        }
      }

      // Enter paste mode (ghost preview + click-to-commit, see handleMouseDown/
      // handleMouseMove) when there's something to paste. A no-op Ctrl+V (empty
      // map clipboard) falls through, mirroring the Ctrl+C no-op above.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (useEditorStore.getState().mapClipboard) {
          useEditorStore.getState().setPasting(true);
          e.preventDefault();
          return;
        }
      }

      // Save the marquee region as a new chunk composer document — the
      // marquee-tool counterpart to Ctrl+C's clipboard copy (design #6 §4.1's
      // "save as chunk" commit). Plain 's' normally switches to the select
      // tool (see the switch below); conflict-free binding chosen deliberately:
      // Ctrl+S/Cmd+S is the browser save dialog, so when the marquee TOOL is
      // active and a marquee is committed, unmodified 's' means "save as
      // chunk" instead of "switch to select" (switching tools away from
      // marquee via 's' is moot anyway — you're already using it).
      if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        const ed = useEditorStore.getState();
        if (ed.tool === 'marquee' && ed.marquee) {
          const marquee = ed.marquee;
          const section = act?.sections[marquee.sectionIndex];
          if (section) {
            const doc = docFromSectionRegion(section, marquee.col, marquee.row, marquee.w, marquee.h);
            seedDocCollisionFromSection(doc, section, marquee.col, marquee.row);
            if (openDocumentGuarded({
              doc,
              liveTileIndex: null,
              chunkId: null,
              name: `marquee (${marquee.col},${marquee.row})`,
              dirty: true, // copied off the map and not yet in the library
            })) {
              switchFacet(useSessionStore.getState().activeId, 'art');
            }
          }
          e.preventDefault();
          return;
        }
      }

      // F7 — play from cursor (DSVEdit's convention). Warps the RUNNING game to
      // wherever the mouse is on the map.
      //
      // The cursor position comes from `lastMouse` rather than from a hovered
      // cell, because a warp is to a POINT, not to a tile: rounding to the tile
      // grid would put the player up to 7px from where they were told to appear,
      // and the whole feature is "put me exactly there".
      if (e.key === 'F7') {
        e.preventDefault();
        const world = screenToWorld(lastMouse.current.x, lastMouse.current.y);
        // Read the act FRESH from the store rather than the closure. This
        // handler is installed by an effect keyed on [pan, setZoom, zoom], so a
        // captured `act` goes stale the moment the user switches act without
        // touching the camera — and a stale act means clamping the warp to the
        // wrong bounds. The Delete branch below reads its selection the same
        // way for the same reason.
        const liveAct = getCurrentAct(useProjectStore.getState());
        const target = warpTargetFor(world.x, world.y, {
          gridWidth: liveAct?.gridWidth ?? 0, gridHeight: liveAct?.gridHeight ?? 0,
        });
        void useAetherStore.getState().warp(target.x, target.y).then((msg) => {
          if (msg) useToastStore.getState().addToast(msg, msg.startsWith('Warped') ? 'success' : 'info');
        });
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && level) {
        const { selection: sel } = useEditorStore.getState();
        if (sel) {
          const sec = act?.sections[sel.sectionIndex];
          if (sec) {
            if (sel.type === 'object' && sec.objects[sel.index]) {
              executeCommand({
                type: 'delete-object',
                description: 'Delete object',
                sectionIndex: sel.sectionIndex,
                objectIndex: sel.index,
                object: { ...sec.objects[sel.index] },
              }, level);
            } else if (sel.type === 'ring' && sec.rings[sel.index]) {
              executeCommand({
                type: 'delete-ring',
                description: 'Delete ring',
                sectionIndex: sel.sectionIndex,
                ringIndex: sel.index,
                ring: { ...sec.rings[sel.index] },
              }, level);
            }
          }
          useEditorStore.getState().setSelection(null);
          e.preventDefault();
          return;
        }
      }

      // Facet-scoped tool hotkeys: only switch to a tool the ACTIVE facet's
      // dock offers (FACET_TOOLS), so e.g. 'o' in the palette facet doesn't
      // silently arm place-object with no dock highlight (finding 2). Matching
      // the dock, hotkeys for OTHER facets' tools are simply ignored (they do
      // NOT switch facets). `allowed` undefined (the 'art' facet runs its own
      // tool system and never mounts MapViewport, plus any future non-facet
      // context) => default-allow, so nothing non-facet breaks.
      const setToolScoped = (t: EditorTool) => {
        const facet = useWorkspaceStore.getState().facetFor(useSessionStore.getState().activeId);
        const allowed = toolsForFacet(facet);
        // Empty = the facet declares no EditorTool set at all ('art' runs the
        // artStore tool system and never mounts MapViewport, plus any future
        // non-facet context) => default-allow, as before.
        if (allowed.length > 0 && !allowed.includes(t)) return;
        useEditorStore.getState().setTool(t);
      };

      // A MODIFIED KEY IS SOMEBODY ELSE'S CHORD, all of them, not the three
      // that happened to be noticed. Two window keydown listeners fire for one
      // event, so Ctrl+B toggled the Explorer AND armed paint-block — the next
      // map click wrote nametable entries the user never asked for — while
      // Ctrl+K opened the command palette AND armed stamp-chunk. The browser
      // zoom chords (Ctrl+±/0) reached the map's zoom the same way. Escape
      // carries no modifier of its own and stays below; the arrows are the
      // map's own pan and are equally not Ctrl-chords.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const step = 64;
      switch (e.key) {
        case 'ArrowLeft': pan(step, 0); e.preventDefault(); break;
        case 'ArrowRight': pan(-step, 0); e.preventDefault(); break;
        case 'ArrowUp': pan(0, step); e.preventDefault(); break;
        case 'ArrowDown': pan(0, -step); e.preventDefault(); break;
        case '=': case '+': setZoom(zoom * 1.5); e.preventDefault(); break;
        case '-': setZoom(zoom / 1.5); e.preventDefault(); break;
        case '0': setZoom(1); e.preventDefault(); break;
        case 'v': setToolScoped('view'); break;
        case 's': setToolScoped('select'); break;
        case 'o': setToolScoped('place-object'); break;
        case 'r': setToolScoped('place-ring'); break;
        case 't': setToolScoped('paint-tile'); break;
        case 'b': setToolScoped('paint-block'); break;
        case 'c': setToolScoped('paint-collision'); break;
        case 'k': setToolScoped('stamp-chunk'); break;
        case 'm': setToolScoped('marquee'); break;
        case 'Escape': {
          // The order lives in `resolveEscape` (paste, then marquee from any
          // tool, then the band lens in the Effects facet) so the node suite can
          // pin it; this branch only acts on the verdict. The lens needs no
          // explicit repaint: `bandLensTarget` is in the repaint effect's deps.
          const ed = useEditorStore.getState();
          switch (resolveEscape(ed, inEffectsFacet())) {
            case 'paste':
              ed.setPasting(false);
              pasteHoverRef.current = null;
              drawCollisionPreview();
              break;
            case 'marquee':
              ed.setMarquee(null);
              drawCollisionPreview();
              break;
            case 'lens':
              ed.setBandLensTarget(null);
              break;
            case null:
              break;
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pan, setZoom, zoom]);

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { vpX, vpY, zoom } = useViewStore.getState();
    return {
      x: vpX + (clientX - rect.left) / zoom,
      // canvas/effects-guides owns the Y mapping, and this CALLS it rather than
      // repeating it: the parallax guides draw with its inverse, and two copies
      // of the same arithmetic in two files is exactly how a guide comes to land
      // a few pixels off the row it prints (ROADMAP item 43).
      y: canvasYToWorldY(clientY - rect.top, vpY, zoom),
    };
  }

  function worldToSectionTile(worldX: number, worldY: number): {
    sectionIndex: number;
    col: number;
    row: number;
    tileIndex: number;
    localX: number;
    localY: number;
  } | null {
    const sectionIndex = sectionRenderer.sectionAtWorld(worldX, worldY);
    if (sectionIndex < 0) return null;
    const offset = sectionRenderer.sectionWorldOffset(sectionIndex);
    const localX = worldX - offset.x;
    const localY = worldY - offset.y;
    const col = Math.floor(localX / 8);
    const row = Math.floor(localY / 8);
    if (col < 0 || col >= SECTION_TILES_WIDE || row < 0 || row >= SECTION_TILES_HIGH) return null;
    return { sectionIndex, col, row, tileIndex: row * SECTION_TILES_WIDE + col, localX, localY };
  }

  function worldToBgTile(worldX: number, worldY: number): { col: number; row: number; tileIndex: number } | null {
    const bg = sectionRenderer.getBg();
    if (!bg) return null;
    const col = Math.floor(worldX / 8);
    const row = Math.floor(worldY / 8);
    if (col < 0 || col >= bg.width || row < 0 || row >= bg.height) return null;
    return { col, row, tileIndex: row * bg.width + col };
  }

  function paintBgTile(worldX: number, worldY: number): void {
    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    if (!act) return;

    // Paint the RESOLVED layout — the same array loadBg handed the renderer
    // (held by reference, so markBgDirty repaints from it). WHICH file that
    // array belongs to is `resolved.source`, and it decides where the stroke is
    // recorded: the BG override document on the act aeon bakes it into, else the
    // library entry the active section displays (additive store state, like
    // chunk edits in Art mode), else the act's own plane.
    const activeSection = useEditorStore.getState().activeSectionIndex;
    const overrideHolder = state.project?.bgOverride ?? null;
    const resolved = resolveDisplayedBg(
      act, state.project?.bgLibrary ?? [], activeSection, overrideHolder,
    );
    if (!resolved) return;

    const tile = worldToBgTile(worldX, worldY);
    if (!tile) return;

    // THE BACKGROUND PICK, not the foreground one. The word's low bits are a
    // BLOB-LOCAL index into `resolved.tiles`, and the zone tileset the FG picker
    // shows is different art of a different length — arming a BG stroke from it
    // was ROADMAP item 47, and the picker is now sourced from this same resolved
    // blob (providers/tile-picker-source.ts).
    const { selectedBgTileIndex, selectedPaletteLine } = useEditorStore.getState();
    const selectedTileIndex = selectedBgTileIndex;
    const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);

    // THE ONE REFUSAL, and it is loud. A nametable word's low bits are an index
    // into the blob the ROM bakes; the override's blob is only as long as the
    // document says. An index past its end is not a tile — the consumer rebases
    // it into VRAM anyway, so it bakes cleanly and ships whatever art happens to
    // sit at that slot. There is no clamp that would be honest here (any tile we
    // chose would be a tile the author did not pick), so the cell is left alone
    // and the reason is put on screen. Word 0 is the format's blank escape and
    // is always legal, whatever the blob's length.
    //
    // ITEM 47 DID NOT MAKE THIS DEAD. The picker can no longer offer an
    // out-of-blob index, but a pick SURVIVES a blob that shrinks under it (a
    // band removal replaces `doc.tiles`), and `__dbg.setSelectedTile` arms one
    // directly. This is the last line of defence, not the first.
    const doc = resolved.source === 'override' ? overrideHolder?.doc ?? null : null;
    if (doc !== null && newNt !== 0 && (newNt & LAYOUT_TILE_INDEX_MASK) >= doc.tiles.length) {
      if (!bgRefusalShown.current) {
        bgRefusalShown.current = true;
        useToastStore.getState().addToast(
          `Tile ${selectedTileIndex} is outside this background. The act's background is the ` +
          `${doc.tiles.length}-tile blob in editor_bg_override.json — the one the ROM is built ` +
          'from — and this pick is past its end, so there is no tile there to paint. ' +
          `Nothing was painted. Pick again from the Art panel, which is showing this ` +
          `background's ${doc.tiles.length} tiles.`,
          'warning',
        );
      }
      return;
    }

    if (resolved.layout[tile.tileIndex] === newNt) return;

    // The stroke paints LIVE and records as it goes; the whole gesture becomes
    // ONE command when the button is released (endBgStroke). Painting through
    // per-tile commands instead would put 60 entries on a 200-deep stack for one
    // drag; painting through none — which is what this used to do — left the
    // mutation outside history entirely, so the next Ctrl+Z reverted whatever
    // act-scoped command happened to precede the strokes.
    const bgRef = resolved.source === 'library' ? resolved.libraryId : null;
    if (!bgStroke.current
        || bgStroke.current.source !== resolved.source
        || bgStroke.current.bgRef !== bgRef) {
      endBgStroke();
      bgStroke.current = { source: resolved.source, bgRef, entries: new Map() };
    }
    // FIRST value wins: a stroke crossing its own path must undo to what was
    // there before the gesture, not to what the gesture itself put down.
    if (!bgStroke.current.entries.has(tile.tileIndex)) {
      bgStroke.current.entries.set(tile.tileIndex, { oldNt: resolved.layout[tile.tileIndex], newNt });
    } else {
      bgStroke.current.entries.get(tile.tileIndex)!.newNt = newNt;
    }

    if (doc !== null) {
      // The document AND the canvas's mirror of it, through the one writer.
      // Writing `resolved.layout` alone would paint a picture the file does not
      // carry; writing `doc.layout` alone would change the file and not the
      // screen. Both are the silent failure this parcel exists to remove.
      writeBgOverrideLayoutWord(doc, tile.tileIndex, newNt);
    } else {
      resolved.layout[tile.tileIndex] = newNt;
    }
    sectionRenderer.markBgDirty([tile.tileIndex]);
    useEditorStore.getState().markDirty();
    useEditorStore.getState().bumpLiveEdit();
  }

  /**
   * Record one cell of a paint gesture and apply it live.
   *
   * FIRST value wins per index: a stroke crossing its own path must undo to
   * what was there before the gesture, not to what the gesture put down.
   * A change of section or plane flushes the stroke and starts a new one —
   * one command per contiguous run, never one spanning two sections.
   */
  function recordPaint(
    kind: 'tiles' | 'collision', sectionIndex: number, plane: 'a' | 'b',
    changes: Array<{ index: number; oldValue: number; newValue: number }>,
  ): void {
    const cur = paintStroke.current;
    const sameRun = cur && cur.kind === kind && cur.sectionIndex === sectionIndex
      && (cur.kind !== 'collision' || cur.plane === plane);
    if (!sameRun) {
      endPaintStroke();
      paintStroke.current = kind === 'tiles'
        ? { kind, sectionIndex, entries: new Map() }
        : { kind, sectionIndex, plane, blocks: 0, entries: new Map() };
    }
    const stroke = paintStroke.current!;
    if (stroke.kind === 'collision') stroke.blocks++;
    for (const c of changes) {
      const seen = stroke.entries.get(c.index) as { oldNt?: number; oldColl?: number; newNt?: number; newColl?: number } | undefined;
      if (seen) {
        if (stroke.kind === 'tiles') seen.newNt = c.newValue; else seen.newColl = c.newValue;
      } else if (stroke.kind === 'tiles') {
        stroke.entries.set(c.index, { oldNt: c.oldValue, newNt: c.newValue });
      } else {
        stroke.entries.set(c.index, { oldColl: c.oldValue, newColl: c.newValue });
      }
    }
    // No command yet, so nothing bumps the history clock — the overlay and the
    // dirty dot need saying explicitly.
    useEditorStore.getState().markDirty();
    useEditorStore.getState().bumpLiveEdit();
  }

  /**
   * Commit a parallax-guide drag as ONE undo step (ROADMAP item 43). Idempotent
   * — the release arrives from the container's mouseup AND the window listener.
   *
   * THREE THINGS IT REFUSES TO DO.
   *
   *  1. A NO-OP COMMITS NOTHING. Released on the row it started from, this
   *     returns before building a command at all. (`setLayerFieldCommand` would
   *     also return null — `editSceneCommand` JSON-compares before and after —
   *     but relying on that would make "one press puts nothing on the stack" a
   *     property of a function two modules away rather than of this gesture.)
   *  2. IT DOES NOT WRITE THROUGH A STALE INDEX. `witness` is the layer as it
   *     was at mousedown; if `layers[index]` is not that layer any more, its
   *     subject moved under it and the drag is dropped. See guideDrag's
   *     docblock for the defect this is the fix for.
   *  3. IT DOES NOT MUTATE THE SCENE DIRECTLY. The write is the same
   *     `setLayerFieldCommand` the panel's spinner runs, through the same
   *     `executeCommand`, so undo/redo, dirty-tracking and serialization are
   *     the ones that already exist rather than a second set that looks right.
   */
  function endGuideDrag(): void {
    const drag = guideDrag.current;
    guideDrag.current = null;
    if (!drag) return;
    // Repaint out of the drag's live preview and back onto the document, even
    // when nothing below commits — otherwise a dropped drag leaves the guide
    // painted where the cursor left it.
    redraw();
    if (drag.worldY === drag.startWorldY) return;
    const library = useProjectStore.getState().project?.effectsScenes;
    if (!library) return;
    const scene = library.scenes.find((s) => s.id === drag.sceneId);
    const layer = scene?.layers[drag.index];
    if (!layer || JSON.stringify(layer) !== drag.witness) return;
    const level = getActiveLevel();
    if (!level) return;
    const cmd = setLayerFieldCommand(library, drag.sceneId, drag.index, 'world_y', drag.worldY);
    if (cmd) executeCommand(cmd, level);
  }

  /**
   * Release the screen frame (row G): ONE store write for the whole gesture,
   * then a repaint off the ref and onto the store. No command — the frame is a
   * session reference, not document state, so it is not on the undo stack.
   */
  function endFrameDrag(): void {
    const fd = frameDrag.current;
    frameDrag.current = null;
    if (!fd) return;
    if (fd.anchor.x !== fd.startAnchor.x || fd.anchor.y !== fd.startAnchor.y) {
      useViewStore.getState().setScreenFrame(fd.anchor.x, fd.anchor.y);
    } else {
      redraw();
    }
  }

  /**
   * Commit a band-lens MARK (ROADMAP item 43 part 2) — the click half of the
   * lens, and the "I mark somewhere" the owner asked for.
   *
   * FOUR THINGS IT REFUSES TO DO.
   *
   *  1. IT WRITES NOTHING TO THE DOCUMENT. A mark moves the EDITOR's idea of
   *     what the lens is showing and nothing else; no layout word, no band, no
   *     undo entry. The only document writes on this surface remain the panel's
   *     two commands, `promoteBandCommand` and `addBandCommand`.
   *  2. IT DOES NOT WRITE THROUGH A STALE WORD. A band command RENUMBERS the
   *     blob and rewrites every layout word, so the slot a cell named at
   *     mousedown may be a different slot by mouseup. The witness is the band
   *     list and blob size as they were; the word is re-read; either moving
   *     drops the mark rather than seeding from arithmetic that no longer holds.
   *  3. IT DOES NOT INVENT A SLOT FOR A BLANK CELL. A layout word of exactly 0
   *     is the consumer's blank escape and does NOT mean `tiles[0]` — seeding 0
   *     from it would silently mark the first ANIMATED slot from a cell that
   *     draws nothing.
   *  4. IT NEEDS NO REFUSAL MACHINERY, because a seeded base is legal by
   *     construction: `markFromLayoutWord` clamps to `firstPromotableSlot`, and
   *     an animated slot becomes a band SELECTION rather than a candidate.
   */
  function commitBandMark(): void {
    const mark = bandMark.current;
    bandMark.current = null;
    if (!mark || !inEffectsFacet()) return;
    const ctxt = bandMarkContext();
    const stale = !ctxt || ctxt.witness !== mark.witness || ctxt.layout[mark.cell] !== mark.word;
    if (stale) {
      publishBandMark({ kind: 'dropped', cell: mark.cell, slot: null, value: null });
      return;
    }
    const ed = useEditorStore.getState();
    const decided = markFromLayoutWord(
      mark.word, ctxt.bases, ctxt.counts, ctxt.firstPromotableSlot, ctxt.blobTileCount,
    );
    if (decided.kind === 'band') {
      ed.setBandLensTarget({ kind: 'band', index: decided.index });
      publishBandMark({ kind: 'band', cell: mark.cell, slot: decided.slot, value: decided.index });
      return;
    }
    if (decided.kind === 'candidate') {
      ed.setBandCandidate({ staticBase: decided.staticBase });
      publishBandMark({ kind: 'candidate', cell: mark.cell, slot: decided.slot, value: decided.staticBase });
      return;
    }
    // `blank` and `out-of-blob` name no promotable slot. The mark changes
    // nothing and whatever the lens was showing stays — a click that does
    // nothing is the honest answer here, and the report says WHICH nothing.
    publishBandMark({
      kind: decided.kind, cell: mark.cell,
      slot: decided.kind === 'out-of-blob' ? decided.slot : null, value: null,
    });
  }

  /** Commit the FG tile / collision stroke as one undo step. Idempotent. */
  function endPaintStroke(): void {
    const stroke = paintStroke.current;
    paintStroke.current = null;
    if (!stroke || stroke.entries.size === 0) return;
    const level = getActiveLevel();
    if (!level) return;
    if (stroke.kind === 'tiles') {
      executeCommand({
        type: 'set-tiles',
        description: `Paint ${stroke.entries.size} tile${stroke.entries.size === 1 ? '' : 's'}`,
        sectionIndex: stroke.sectionIndex,
        entries: [...stroke.entries].map(([index, e]) => ({ index, ...e })),
      }, level);
    } else {
      executeCommand({
        type: 'set-collision-edit',
        plane: stroke.plane,
        description: `Paint collision ${stroke.plane.toUpperCase()} (${stroke.blocks} block${stroke.blocks === 1 ? '' : 's'})`,
        sectionIndex: stroke.sectionIndex,
        entries: [...stroke.entries].map(([index, e]) => ({ index, ...e })),
      }, level);
    }
  }

  /** Commit the BG stroke as one undo step. Idempotent — the release can arrive
   *  from the container's own mouseup AND from the window listener. */
  function endBgStroke(): void {
    const stroke = bgStroke.current;
    bgStroke.current = null;
    bgRefusalShown.current = false;
    if (!stroke || stroke.entries.size === 0) return;
    const level = getActiveLevel();
    if (!level) return;
    const n = stroke.entries.size;
    const description = `Paint ${n} background tile${n === 1 ? '' : 's'}`;
    if (stroke.source === 'override') {
      // A DIFFERENT FILE, so a different command — see SetBgOverrideLayoutCommand.
      // `sectionIndex: -1` because the document is per-game and the plane is
      // act-wide, matching set-bg-override-band beside it.
      executeCommand({
        type: 'set-bg-override-layout',
        description,
        sectionIndex: -1,
        entries: [...stroke.entries].map(([index, e]) => ({
          index, oldWord: e.oldNt, newWord: e.newNt,
        })),
      }, level);
      return;
    }
    executeCommand({
      type: 'set-bg-tiles',
      description,
      // The BG plane is act-wide, not per-section; the field is required by
      // EditCommand and the active section is the honest answer to "where was
      // the artist" for the description.
      sectionIndex: useEditorStore.getState().activeSectionIndex,
      bgRef: stroke.bgRef,
      entries: [...stroke.entries].map(([index, e]) => ({ index, oldNt: e.oldNt, newNt: e.newNt })),
    }, level);
  }

  function getActiveLevel(): S4Level | null {
    return getStoreActiveLevel(useProjectStore.getState());
  }

  // Paint collision at the 16px block under `info` with the selected profile.
  // Default: only the clicked block ("just here"). `propagate` (Alt): every
  // block in the section with the SAME tiles (reuse), explicit opt-in. The
  // block is the 2×2 tiles at (cellCol,cellRow); a paint sets all four 8px
  // sub-tiles. One undoable set-collision-edit command.
  function paintCollisionCell(info: { sectionIndex: number; col: number; row: number }, propagate: boolean) {
    const section = getSectionByIndex(info.sectionIndex);
    if (!section) return;
    const plane = useEditorStore.getState().collisionPaintPlane;
    // Lazily seed both planes (pack the engine baseline into cell words) if missing —
    // shared with the stamp paths via ensureCollisionPlanes.
    ensureCollisionPlanes(section);
    const ce = (plane === 'b' ? section.collisionEditB : section.collisionEdit)!;
    const cellCol = info.col >> 1, cellRow = info.row >> 1;
    const cellKey = `${info.sectionIndex}:${cellCol}:${cellRow}`;
    if (lastPaintedCell.current === cellKey) return; // same cursor cell — skip
    lastPaintedCell.current = cellKey;

    // The painted value is a packed 16-bit cell word: selected shape + flip +
    // solidity. Air (shape 0 / erase) is always the bare 0 word, never solidity bits.
    const est = useEditorStore.getState();
    const word = selectedCollisionWord({
      shape: est.selectedCollisionProfile, entryFlipX: est.selectedCollisionEntryFlipX,
      userXFlip: est.selectedCollisionXFlip, yFlip: est.selectedCollisionYFlip, solidity: est.selectedCollisionSolidity,
    });
    const brush = useEditorStore.getState().collisionBrushSize;
    const cellsW = SECTION_TILES_WIDE / 2, cellsH = SECTION_TILES_HIGH / 2;

    // Cheap no-op guard for the expensive reuse scan: if the clicked block is
    // already fully the selected word, its matches were painted when first
    // touched — return before collisionPaintTargets does the per-section scan.
    if (brush === 1 && propagate) {
      const clicked = cellTileIndices(cellCol, cellRow, SECTION_TILES_WIDE);
      if (clicked.every((i) => ce[i] === word)) return;
    }

    // Same target set the hover preview shows (collisionPaintTargets) — paint and
    // preview share one source of truth so they can't drift.
    const { all: targets } = collisionPaintTargets({
      cellCol, cellRow, brush, propagate,
      nametable: section.tileGrid.nametable, width: SECTION_TILES_WIDE, cellsW, cellsH,
    });
    const entries: Array<{ index: number; oldColl: number; newColl: number }> = [];
    for (const t of targets) {
      for (const index of cellTileIndices(t.cellCol, t.cellRow, SECTION_TILES_WIDE)) {
        const oldColl = ce[index];
        if (oldColl !== word) entries.push({ index, oldColl, newColl: word });
      }
    }
    if (entries.length === 0) return;
    // Live, and recorded: a collision drag is one edit, not one per cell. (The
    // per-cell "this block"/"N matching blocks" wording went with it — the
    // command now names how many blocks the whole gesture covered.)
    for (const e of entries) ce[e.index] = e.newColl;
    recordPaint('collision', info.sectionIndex, plane,
      entries.map((e) => ({ index: e.index, oldValue: e.oldColl, newValue: e.newColl })));
    useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
  }

  function getSectionByIndex(idx: number): Section | null {
    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    return act?.sections[idx] ?? null;
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const tool = useEditorStore.getState().tool;

    // Right-click opens the context menu; never paint/drag from it.
    if (e.button === 2) return;

    // Paste mode takes priority over whatever tool is active — a click commits
    // the paste and STAYS in paste mode for repeat pastes (Escape exits).
    // Left-click only (button 0) — middle-click must still fall through to pan.
    if (useEditorStore.getState().pasting && e.button === 0) {
      const clip = useEditorStore.getState().mapClipboard;
      const hover = pasteHoverRef.current;
      const level = getActiveLevel();
      if (clip && hover && level) {
        const section = getSectionByIndex(hover.sectionIndex);
        if (section) {
          ensureCollisionPlanes(section);
          // Modifiers override the sticky pasteLayers setting for THIS click only.
          const layers: PasteLayers = e.altKey ? 'art' : e.shiftKey ? 'collision'
            : useEditorStore.getState().pasteLayers;
          const cmd = buildPasteCommand({
            clip, section, sectionIndex: hover.sectionIndex,
            baseCol: hover.baseCol, baseRow: hover.baseRow, layers,
            description: `Paste ${clip.widthTiles / 2}×${clip.heightTiles / 2} blocks at (${hover.baseCol}, ${hover.baseRow})`,
          });
          if (cmd) {
            executeCommand(cmd, level);
            const tilesChild = cmd.commands.find((c): c is SetTilesCommand => c.type === 'set-tiles');
            const dirtyIndices = tilesChild ? tilesChild.entries.map((entry) => entry.index) : [];
            sectionRenderer.markDirty(hover.sectionIndex, dirtyIndices);
          }
          useEditorStore.getState().setActiveSectionIndex(hover.sectionIndex);
        }
      }
      e.preventDefault();
      return;
    }

    // A parallax guide under the cursor takes the press (ROADMAP item 43).
    // AFTER paste mode, BEFORE every tool. Paste keeps its priority because it
    // is a mode the author explicitly entered and can Escape; the tools do not,
    // because the effects facet offers `view` and nothing else, so a guide grab
    // that ran after the pan branch would never run at all. It costs nothing
    // anywhere else: null unless the author is standing in the effects lens
    // within GUIDE_GRAB_PX of a line.
    if (e.button === 0) {
      const scene = activeGuideScene();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (scene && rect) {
        const { vpY, zoom } = useViewStore.getState();
        const idx = guideAtCanvasY(e.clientY - rect.top, scene.layers,
          { x: 0, y: vpY, width: rect.width, height: rect.height, zoom }, layerTopSpace(scene));
        if (idx !== null) {
          const layer = scene.layers[idx];
          guideDrag.current = {
            sceneId: scene.id, index: idx,
            startWorldY: layer.world_y, worldY: layer.world_y,
            // The witness the commit compares against — see guideDrag's docblock.
            witness: JSON.stringify(layer),
          };
          setGuideHover(idx);
          e.preventDefault();
          return;
        }
      }
    }

    // THE SCREEN FRAME'S EDGE takes the press (row G). AFTER the guides (a
    // guide is about the document, the frame is a reference, so the guide
    // wins where they overlap), BEFORE every tool for the guides' reason. Costs
    // nothing while hidden: the gate is the toggle, so a hidden frame never
    // hit-tests and cannot steal a click from a tool. EDGE only — the interior
    // falls through to the tool exactly as if the frame were not there.
    if (e.button === 0) {
      const view = useViewStore.getState();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (view.overlays.showScreenFrame && rect) {
        const vp = { x: view.vpX, y: view.vpY, width: rect.width, height: rect.height, zoom: view.zoom };
        if (screenFrameEdgeAt(e.clientX - rect.left, e.clientY - rect.top, view.screenFrame, vp)) {
          frameDrag.current = {
            startAnchor: view.screenFrame,
            pressWorld: screenToWorld(e.clientX, e.clientY),
            anchor: view.screenFrame,
          };
          setFrameHover(true);
          e.preventDefault();
          return;
        }
      }
    }

    // THE BAND-LENS MARK (ROADMAP item 43 part 2). It RECORDS and FALLS THROUGH
    // — it never takes the press.
    //
    // That is the whole design of this branch. The effects facet's only tool is
    // `view`, so taking the press here would kill panning on the one facet the
    // lens lives in; and a mark is a CLICK, which is not knowable until the
    // button comes up. So the press notes which cell it landed on, the pan
    // proceeds exactly as before, and `handleMouseUp` decides whether the
    // gesture was a click and commits.
    bandMark.current = null;
    if (e.button === 0 && inEffectsFacet()) {
      const ctxt = bandMarkContext();
      if (ctxt) {
        const world = screenToWorld(e.clientX, e.clientY);
        const hit = cellAtWorld(world.x, world.y, ctxt.planeCols, ctxt.planeRows);
        if (hit) {
          bandMark.current = {
            cell: hit.cell, word: ctxt.layout[hit.cell], witness: ctxt.witness,
          };
        }
      }
    }

    if (tool === 'view' || e.button === 1) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      downPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    const level = getActiveLevel();
    if (!level) return;

    const world = screenToWorld(e.clientX, e.clientY);

    if (tool === 'select') {
      const state = useProjectStore.getState();
      const act = getCurrentAct(state);
      if (!act) return;

      // Search all sections for hit
      for (let secIdx = 0; secIdx < act.sections.length; secIdx++) {
        const section = act.sections[secIdx];
        if (!section) continue;
        const offset = sectionRenderer.sectionWorldOffset(secIdx);

        const objIdx = section.objects.findIndex(
          (o) => Math.abs((o.x + offset.x) - world.x) < 16 && Math.abs((o.y + offset.y) - world.y) < 16
        );
        if (objIdx >= 0) {
          useEditorStore.getState().setActiveSectionIndex(secIdx);
          useEditorStore.getState().setSelection({ type: 'object', sectionIndex: secIdx, index: objIdx });
          dragTarget.current = {
            type: 'object', sectionIndex: secIdx, index: objIdx,
            startX: section.objects[objIdx].x, startY: section.objects[objIdx].y,
          };
          isDragging.current = true;
          lastMouse.current = { x: e.clientX, y: e.clientY };
          e.preventDefault();
          return;
        }

        const ringIdx = section.rings.findIndex(
          (r) => Math.abs((r.x + offset.x) - world.x) < 12 && Math.abs((r.y + offset.y) - world.y) < 12
        );
        if (ringIdx >= 0) {
          useEditorStore.getState().setActiveSectionIndex(secIdx);
          useEditorStore.getState().setSelection({ type: 'ring', sectionIndex: secIdx, index: ringIdx });
          dragTarget.current = {
            type: 'ring', sectionIndex: secIdx, index: ringIdx,
            startX: section.rings[ringIdx].x, startY: section.rings[ringIdx].y,
          };
          isDragging.current = true;
          lastMouse.current = { x: e.clientX, y: e.clientY };
          e.preventDefault();
          return;
        }
      }

      useEditorStore.getState().setSelection(null);
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (tool === 'paint-tile') {
      if (useEditorStore.getState().editingLayer === 'bg') {
        paintBgTile(world.x, world.y);
        isPaintDragging.current = true;
        e.preventDefault();
        return;
      }

      const info = worldToSectionTile(world.x, world.y);
      if (!info) return;
      const section = getSectionByIndex(info.sectionIndex);
      if (!section) return;

      const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
      const oldNt = section.tileGrid.nametable[info.tileIndex];
      const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
      if (oldNt !== newNt) {
        // The gesture starts here and commits on release — one command whether
        // it turns out to be a click or a sixty-cell drag.
        section.tileGrid.nametable[info.tileIndex] = newNt;
        recordPaint('tiles', info.sectionIndex, 'a',
          [{ index: info.tileIndex, oldValue: oldNt, newValue: newNt }]);
        sectionRenderer.markDirty(info.sectionIndex, [info.tileIndex]);
      }
      useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }

    if (tool === 'paint-block') {
      const info = worldToSectionTile(world.x, world.y);
      if (!info) return;
      const section = getSectionByIndex(info.sectionIndex);
      if (!section) return;

      const baseCol = Math.floor(info.col / 2) * 2;
      const baseRow = Math.floor(info.row / 2) * 2;
      const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
      const entries: Array<{ index: number; oldNt: number; newNt: number }> = [];
      const dirtyIndices: number[] = [];

      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const c = baseCol + dc;
          const r = baseRow + dr;
          if (c >= SECTION_TILES_WIDE || r >= SECTION_TILES_HIGH) continue;
          const idx = r * SECTION_TILES_WIDE + c;
          const oldNt = section.tileGrid.nametable[idx];
          const tileOffset = dr * 2 + dc;
          const newNt = ((selectedTileIndex + tileOffset) & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
          if (oldNt !== newNt) {
            entries.push({ index: idx, oldNt, newNt });
            dirtyIndices.push(idx);
          }
        }
      }

      if (entries.length > 0) {
        executeCommand({
          type: 'set-tiles',
          description: `Paint block at (${baseCol}, ${baseRow})`,
          sectionIndex: info.sectionIndex,
          entries,
        }, level);
        sectionRenderer.markDirty(info.sectionIndex, dirtyIndices);
      }
      useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }

    if (tool === 'stamp-chunk') {
      const { selectedChunkId } = useEditorStore.getState();
      const liveProject = useProjectStore.getState().project;
      const chunk = liveProject?.chunkLibrary.find(c => c.id === selectedChunkId);
      if (!chunk) { e.preventDefault(); return; }

      const info = worldToSectionTile(world.x, world.y);
      if (!info) { e.preventDefault(); return; }
      const section = getSectionByIndex(info.sectionIndex);
      if (!section) { e.preventDefault(); return; }

      const baseCol = Math.floor(info.col / chunk.widthTiles) * chunk.widthTiles;
      const baseRow = Math.floor(info.row / chunk.heightTiles) * chunk.heightTiles;

      // Lazily seed both collision planes before stamping — the stamp writes both
      // (unless Alt/artOnly), mirroring paintCollisionCell's seed-on-first-touch.
      ensureCollisionPlanes(section);

      const cmd = buildStampCommand({
        chunk, section, sectionIndex: info.sectionIndex,
        baseCol, baseRow, artOnly: e.altKey,
        description: `Stamp chunk ${selectedChunkId} at (${baseCol}, ${baseRow})`,
      });

      if (cmd) {
        executeCommand(cmd, level);
        const tilesChild = cmd.commands.find((c): c is SetTilesCommand => c.type === 'set-tiles');
        const dirtyIndices = tilesChild ? tilesChild.entries.map((entry) => entry.index) : [];
        sectionRenderer.markDirty(info.sectionIndex, dirtyIndices);
      }
      useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
      e.preventDefault();
      return;
    }

    if (tool === 'paint-collision') {
      const info = worldToSectionTile(world.x, world.y);
      if (!info) return;
      // Claim the section HERE, before painting, not only inside
      // paintCollisionCell's success path. That call is real (it is the last
      // line of the function) but it sits behind four early returns — the
      // same-cell dedupe, the already-that-shape guard, an empty entry list and
      // a null level — so a click that changed nothing left `activeSectionIndex`
      // pointing at whatever the last OTHER tool touched.
      //
      // That matters because the Collision facet has no SectionGridNav and its
      // palette carries two WHOLESALE destructive buttons keyed on that index
      // (CollisionPalette's Reset and Clear), so a Clear could wipe a section
      // the user was not looking at. Every other tool branch in this handler
      // claims its section unconditionally; this one now does too.
      useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
      lastPaintedCell.current = null;
      paintPropagate.current = e.altKey; // latch the mode for the whole stroke
      paintCollisionCell(info, paintPropagate.current);
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }

    if (tool === 'marquee') {
      const info = worldToSectionTile(world.x, world.y);
      if (!info) { e.preventDefault(); return; }
      const section = getSectionByIndex(info.sectionIndex);
      if (!section) { e.preventDefault(); return; }

      marqueeDragStart.current = { sectionIndex: info.sectionIndex, col: info.col, row: info.row };
      isMarqueeDragging.current = true;
      const snap = snapMarquee(info.col, info.row, info.col, info.row);
      useEditorStore.getState().setMarquee({ sectionIndex: info.sectionIndex, ...snap });
      drawCollisionPreview();
      e.preventDefault();
      return;
    }

    if (tool === 'place-object') {
      const secIdx = sectionRenderer.sectionAtWorld(world.x, world.y);
      if (secIdx < 0) return;
      const section = getSectionByIndex(secIdx);
      if (!section) return;

      const offset = sectionRenderer.sectionWorldOffset(secIdx);
      const { selectedObjectTypeId, selectedObjectSubtype } = useEditorStore.getState();
      const obj: ObjectPlacement = {
        x: Math.round(world.x - offset.x),
        y: Math.round(world.y - offset.y),
        typeId: selectedObjectTypeId ?? '0',
        subtype: selectedObjectSubtype,
      };
      executeCommand({
        type: 'add-object',
        description: `Place object ${selectedObjectTypeId}`,
        sectionIndex: secIdx,
        object: obj,
      }, level);
      useEditorStore.getState().setActiveSectionIndex(secIdx);
      e.preventDefault();
      return;
    }

    if (tool === 'place-ring') {
      const secIdx = sectionRenderer.sectionAtWorld(world.x, world.y);
      if (secIdx < 0) return;
      const section = getSectionByIndex(secIdx);
      if (!section) return;

      const offset = sectionRenderer.sectionWorldOffset(secIdx);
      const patternIdx = useEditorStore.getState().selectedRingPattern;
      const pattern = RING_PATTERNS[patternIdx] || RING_PATTERNS[0];
      const localX = Math.round(world.x - offset.x);
      const localY = Math.round(world.y - offset.y);

      if (pattern.offsets.length === 1) {
        executeCommand({
          type: 'add-ring',
          description: 'Place ring',
          sectionIndex: secIdx,
          ring: { x: localX, y: localY },
        }, level);
      } else {
        const rings = pattern.offsets.map(o => ({ x: localX + o.dx, y: localY + o.dy }));
        executeCommand({
          type: 'add-rings',
          description: `Place ${pattern.name} rings`,
          sectionIndex: secIdx,
          rings,
        }, level);
      }
      useEditorStore.getState().setActiveSectionIndex(secIdx);
      e.preventDefault();
      return;
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const tool = useEditorStore.getState().tool;

    // ---- Parallax guides (ROADMAP item 43) --------------------------------
    // A DRAG IN FLIGHT PREVIEWS; IT DOES NOT EDIT. The document is untouched
    // until release, so the undo stack gets ONE entry for the gesture instead of
    // one per mousemove. The preview is the ref plus a repaint — `redraw` reads
    // `guideDrag.current` at call time.
    if (guideDrag.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const scene = activeGuideScene();
      if (rect && scene && scene.id === guideDrag.current.sceneId) {
        const { vpY, zoom } = useViewStore.getState();
        // The SAME clamp the spinner routes through, in the SAME space the
        // guide was drawn in, so a drag cannot author a top a typed value
        // could not — and a locked layer stops at the plane's last line.
        const space = layerTopSpace(scene);
        const next = clampLayerTop(scene, canvasYToLayerTop(e.clientY - rect.top,
          { x: 0, y: vpY, width: rect.width, height: rect.height, zoom }, space));
        if (next !== guideDrag.current.worldY) {
          guideDrag.current.worldY = next;
          redraw();
        }
      }
      return;
    }

    // The screen frame's drag (row G): the same preview-through-ref shape as
    // the guide drag above. The store is written once, on release.
    if (frameDrag.current) {
      const fd = frameDrag.current;
      const next = dragScreenFrame(fd.startAnchor, fd.pressWorld, screenToWorld(e.clientX, e.clientY));
      if (next.x !== fd.anchor.x || next.y !== fd.anchor.y) {
        fd.anchor = next;
        redraw();
      }
      return;
    }

    // Paste mode: track the hovered even-snapped footprint origin for the
    // ghost preview. Independent of the active tool — takes priority over any
    // drag state so the ghost can't get stuck showing a stale cell.
    if (useEditorStore.getState().pasting) {
      const world = screenToWorld(e.clientX, e.clientY);
      const info = worldToSectionTile(world.x, world.y);
      if (info) {
        const baseCol = Math.floor(info.col / 2) * 2;
        const baseRow = Math.floor(info.row / 2) * 2;
        const prev = pasteHoverRef.current;
        if (!prev || prev.sectionIndex !== info.sectionIndex || prev.baseCol !== baseCol || prev.baseRow !== baseRow) {
          pasteHoverRef.current = { sectionIndex: info.sectionIndex, baseCol, baseRow };
          drawCollisionPreview();
        }
      } else if (pasteHoverRef.current) {
        pasteHoverRef.current = null;
        drawCollisionPreview();
      }
      return;
    }

    {
      // Hover: which guide is grabbable here. AFTER the paste branch, for the
      // same reason the press is (paste is an explicit mode); before every
      // tool, for the same reason too.
      //
      // Repaints only when the answer CHANGES — crossing a line, not moving
      // along one.
      const scene = activeGuideScene();
      const rect = canvasRef.current?.getBoundingClientRect();
      let next: number | null = null;
      if (scene && rect) {
        const { vpY, zoom } = useViewStore.getState();
        next = guideAtCanvasY(e.clientY - rect.top, scene.layers,
          { x: 0, y: vpY, width: rect.width, height: rect.height, zoom }, layerTopSpace(scene));
      }
      if (next !== guideHoverRef.current) setGuideHover(next);
      // A press on a guide never reaches the tool branches below, so a hover
      // over one must not either — otherwise the pan tool's grab cursor and the
      // hover bar argue with the guide the author is about to grab.
      if (next !== null) return;

      // The screen frame's edge hover (row G), AFTER the guide (same order as
      // the press), gated on the toggle so a hidden frame is never consulted.
      // State changes only on CROSSING an edge.
      const view = useViewStore.getState();
      let onEdge = false;
      if (view.overlays.showScreenFrame && rect) {
        const vp = { x: view.vpX, y: view.vpY, width: rect.width, height: rect.height, zoom: view.zoom };
        onEdge = screenFrameEdgeAt(e.clientX - rect.left, e.clientY - rect.top, view.screenFrame, vp);
      }
      if (onEdge !== frameHoverRef.current) setFrameHover(onEdge);
      if (onEdge) return;
    }

    // Stamp ghost: track where the chunk would land, snapped to its own size.
    if (tool === 'stamp-chunk') {
      const { selectedChunkId } = useEditorStore.getState();
      const chunk = useProjectStore.getState().project?.chunkLibrary.find((c) => c.id === selectedChunkId);
      const world = screenToWorld(e.clientX, e.clientY);
      const info = chunk ? worldToSectionTile(world.x, world.y) : null;
      if (chunk && info) {
        // The same snap the stamp itself uses — a preview that lands somewhere
        // other than the stamp is worse than no preview.
        const baseCol = Math.floor(info.col / chunk.widthTiles) * chunk.widthTiles;
        const baseRow = Math.floor(info.row / chunk.heightTiles) * chunk.heightTiles;
        const prev = stampHoverRef.current;
        if (!prev || prev.sectionIndex !== info.sectionIndex || prev.baseCol !== baseCol
            || prev.baseRow !== baseRow || prev.chunkId !== chunk.id) {
          stampHoverRef.current = { sectionIndex: info.sectionIndex, baseCol, baseRow, chunkId: chunk.id };
          drawCollisionPreview();
        }
      } else if (stampHoverRef.current) {
        stampHoverRef.current = null;
        drawCollisionPreview();
      }
    } else if (stampHoverRef.current) {
      stampHoverRef.current = null;
      drawCollisionPreview();
    }

    // Marquee dragging — always resolved against the drag-START section's
    // local tile space (not whatever section the cursor currently sits over),
    // so dragging out of the section still extends/clamps the same marquee.
    // snapMarquee clamps to [0, SECTION_TILES_WIDE/HIGH) itself.
    if (isMarqueeDragging.current && tool === 'marquee' && marqueeDragStart.current) {
      const world = screenToWorld(e.clientX, e.clientY);
      const start = marqueeDragStart.current;
      const offset = sectionRenderer.sectionWorldOffset(start.sectionIndex);
      const col = Math.floor((world.x - offset.x) / 8);
      const row = Math.floor((world.y - offset.y) / 8);
      const snap = snapMarquee(start.col, start.row, col, row);
      useEditorStore.getState().setMarquee({ sectionIndex: start.sectionIndex, ...snap });
      drawCollisionPreview();
      return;
    }

    // Paint dragging
    if (isPaintDragging.current && (tool === 'paint-tile' || tool === 'paint-collision')) {
      const world = screenToWorld(e.clientX, e.clientY);

      // BG layer paint drag
      if (tool === 'paint-tile' && useEditorStore.getState().editingLayer === 'bg') {
        paintBgTile(world.x, world.y);
        return;
      }

      const level = getActiveLevel();
      if (!level) return;
      const info = worldToSectionTile(world.x, world.y);
      if (!info) return;
      const section = getSectionByIndex(info.sectionIndex);
      if (!section) return;

      if (tool === 'paint-tile') {
        const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
        const oldNt = section.tileGrid.nametable[info.tileIndex];
        const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
        if (oldNt !== newNt) {
          // Live, and recorded: the whole drag becomes one command on release.
          section.tileGrid.nametable[info.tileIndex] = newNt;
          recordPaint('tiles', info.sectionIndex, 'a',
            [{ index: info.tileIndex, oldValue: oldNt, newValue: newNt }]);
          sectionRenderer.markDirty(info.sectionIndex, [info.tileIndex]);
        }
      } else {
        paintCollisionCell(info, paintPropagate.current); // latched mode (not live Alt)
      }
      return;
    }

    // Drag object/ring
    if (isDragging.current && dragTarget.current && tool === 'select') {
      const target = dragTarget.current;
      const section = getSectionByIndex(target.sectionIndex);
      if (!section) return;
      const world = screenToWorld(e.clientX, e.clientY);
      const offset = sectionRenderer.sectionWorldOffset(target.sectionIndex);

      if (target.type === 'object') {
        const obj = section.objects[target.index];
        if (obj) {
          obj.x = Math.round(world.x - offset.x);
          obj.y = Math.round(world.y - offset.y);
        }
      } else {
        const ring = section.rings[target.index];
        if (ring) {
          ring.x = Math.round(world.x - offset.x);
          ring.y = Math.round(world.y - offset.y);
        }
      }
      useEditorStore.getState().bumpLiveEdit();
      return;
    }

    // Pan
    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      pan(dx, dy);
      return;
    }

    // Hover info
    const bar = hoverBarRef.current;
    if (!bar) return;
    const world = screenToWorld(e.clientX, e.clientY);
    bar.style.display = 'flex';

    if (useEditorStore.getState().editingLayer === 'bg') {
      const bgTile = worldToBgTile(world.x, world.y);
      if (bgTile) {
        bar.innerHTML = `BG | Tile (${bgTile.col}, ${bgTile.row}) | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
      } else {
        bar.innerHTML = `BG | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
      }
    } else {
      const info = worldToSectionTile(world.x, world.y);
      if (info) {
        let extra = '';
        const overlays = useViewStore.getState().overlays;
        if (overlays.showCollision || overlays.showCollisionPathB) {
          const act = getCurrentAct(useProjectStore.getState());
          const section = act?.sections[info.sectionIndex] ?? null;
          if (section) {
            // Snap to the 16px cell's top-left tile (both tiles share the byte).
            const cellCol = Math.floor(info.col / 2) * 2;
            const cellRow = Math.floor(info.row / 2) * 2;
            // In the A/B diff (both overlays on) the base shown is A, so report A.
            const pathB = overlays.showCollisionPathB && !overlays.showCollision;
            // Same bound the overlay uses, and the same one this readout
            // indexes with below (cellRow * SECTION_TILES_WIDE + cellCol) —
            // never an array's own length (ROADMAP §5.1 item 10).
            const len = SECTION_PLANE_WORDS;
            const words = pathB
              ? resolvePlaneWords(section.collisionEditB, section.engineCollisionB ?? section.engineCollision, len)
              : resolvePlaneWords(section.collisionEdit, section.engineCollision, len);
            const word = words[cellRow * SECTION_TILES_WIDE + cellCol];
            const profiles = useProjectStore.getState().collisionProfiles;
            const path = pathB ? 'B' : 'A';
            const c = unpackCollisionCell(word);
            const rc = resolveCell(profiles, word);
            const flips = `${c.xFlip ? ' ⇄' : ''}${c.yFlip ? ' ⇅' : ''}`;
            if (rc.air) {
              extra = ` | Coll ${path}: air`;
            } else if (!profiles) {
              extra = ` | Coll ${path} #${c.shape}${flips} (tables not loaded)`;
            } else if (rc.known) {
              const p = rc.profile!;
              const deg = angleDegrees(p);
              extra = ` | Coll ${path} #${c.shape}${flips} ${p.solidity} ${deg === null ? '—' : deg + '°'} ${heightSparkline(p.heights)}`;
            } else {
              extra = ` | Coll ${path} #${c.shape}${flips} (unknown)`;
            }
          }
        }
        bar.innerHTML = `Sec ${info.sectionIndex} | Tile (${info.col}, ${info.row}) | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}${extra}`;

        // Collision paint ghost: track the hovered block; redraw only when the
        // cell (or Alt) changes, so it stays cheap while the mouse moves.
        if (useEditorStore.getState().tool === 'paint-collision') {
          const cc = info.col >> 1, cr = info.row >> 1;
          const prev = previewHoverRef.current;
          if (!prev || prev.sectionIndex !== info.sectionIndex || prev.cellCol !== cc
              || prev.cellRow !== cr || prev.alt !== e.altKey) {
            previewHoverRef.current = { sectionIndex: info.sectionIndex, cellCol: cc, cellRow: cr, alt: e.altKey };
            drawCollisionPreview();
          }
        } else if (previewHoverRef.current) {
          previewHoverRef.current = null;
          drawCollisionPreview();
        }
      } else {
        bar.innerHTML = `Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
        if (previewHoverRef.current) { previewHoverRef.current = null; drawCollisionPreview(); }
      }
    }
  }, [pan, drawCollisionPreview, redraw]);

  /**
   * End whatever gesture is in flight, wherever the button was released.
   *
   * A drag that leaves the viewport used to be DISCARDED: `onMouseLeave` nulled
   * `dragTarget`, there was no window listener and no pointer capture, so
   * releasing outside left the object drawn at its new position with no
   * command, no dirty flag, an empty undo stack and a Ctrl+S that did nothing —
   * the placement was gone at the next load, and closing prompted nothing. The
   * classic composer fixed the identical bug with a window mouseup
   * (composer-shared.tsx documents it); this is the same move, and it makes
   * mouseleave a pause rather than a cancel.
   *
   * Idempotent: the container's own onMouseUp fires first when the release
   * happens inside, and this must be harmless a second time.
   */
  const finishGesture = useCallback(() => {
    endGuideDrag();
    endFrameDrag();
    endBgStroke();
    endPaintStroke();
    isPaintDragging.current = false;
    isMarqueeDragging.current = false;
    marqueeDragStart.current = null;

    if (dragTarget.current && isDragging.current) {
      const target = dragTarget.current;
      const section = getSectionByIndex(target.sectionIndex);
      const level = getActiveLevel();

      if (section && level) {
        if (target.type === 'object') {
          const obj = section.objects[target.index];
          if (obj && (obj.x !== target.startX || obj.y !== target.startY)) {
            const finalX = obj.x, finalY = obj.y;
            obj.x = target.startX;
            obj.y = target.startY;
            executeCommand({
              type: 'move-object',
              description: 'Move object',
              sectionIndex: target.sectionIndex,
              objectIndex: target.index,
              oldX: target.startX, oldY: target.startY,
              newX: finalX, newY: finalY,
            }, level);
          }
        } else {
          const ring = section.rings[target.index];
          if (ring && (ring.x !== target.startX || ring.y !== target.startY)) {
            const finalX = ring.x, finalY = ring.y;
            ring.x = target.startX;
            ring.y = target.startY;
            executeCommand({
              type: 'move-ring',
              description: 'Move ring',
              sectionIndex: target.sectionIndex,
              ringIndex: target.index,
              oldX: target.startX, oldY: target.startY,
              newX: finalX, newY: finalY,
            }, level);
          }
        }
      }
      dragTarget.current = null;
    }
    isDragging.current = false;
  }, []);

  // Wherever the button comes up, the gesture ends there — including outside
  // this component entirely.
  useEffect(() => {
    const onUp = (): void => finishGesture();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [finishGesture]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // A guide release is not a map click. The `view`-tool branch below turns a
    // barely-moved press into "select the section under the cursor", and the
    // effects facet's only tool IS `view` — so without this, nudging a guide by
    // two pixels would also change the active section under the author.
    if (guideDrag.current) { downPos.current = null; bandMark.current = null; finishGesture(); return; }
    isPaintDragging.current = false;
    // A click with no drag already committed a 2x2-tile marquee at mousedown —
    // mouseup just ends the drag; the final marquee (set live on mousemove)
    // stays in the store.
    isMarqueeDragging.current = false;
    marqueeDragStart.current = null;

    // View tool: a click (pointer barely moved) selects the section under the
    // cursor — a pan-drag does not.
    if (useEditorStore.getState().tool === 'view' && downPos.current) {
      const dx = e.clientX - downPos.current.x;
      const dy = e.clientY - downPos.current.y;
      if (dx * dx + dy * dy < 25) { // moved < 5px → treat as a click
        const world = screenToWorld(e.clientX, e.clientY);
        const secIdx = sectionRenderer.sectionAtWorld(world.x, world.y);
        const act = getCurrentAct(useProjectStore.getState());
        if (secIdx >= 0 && act && act.sections[secIdx]) {
          useEditorStore.getState().setActiveSectionIndex(secIdx);
        }
        commitBandMark();
      }
    }
    downPos.current = null;
    bandMark.current = null;

    // The commit itself lives in finishGesture, which the window listener also
    // calls — one body, so a release inside and a release outside can never
    // commit different things.
    finishGesture();
  }, [finishGesture]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const { zoom } = useViewStore.getState();
      setZoom(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    }
  }, [setZoom]);

  // ---------- right-click context menu (Art mode entry points) ----------

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // always suppress the browser menu over the map
    if (useEditorStore.getState().editingLayer === 'bg') { setCtxMenu(null); return; }
    const world = screenToWorld(e.clientX, e.clientY);
    const info = worldToSectionTile(world.x, world.y);
    const container = containerRef.current;
    if (!info || !container) { setCtxMenu(null); return; }
    const rect = container.getBoundingClientRect();
    setCtxMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      sectionIndex: info.sectionIndex,
      col: info.col,
      row: info.row,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the context menu on click-away or Escape.
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = () => setCtxMenu(null);
    // Inert under a sprite-doc tab like the main handler above (finding 1) — the
    // hidden map can't have an open context menu anyway, but keep every level
    // window keydown gated by the one predicate.
    const onKey = (e: KeyboardEvent) => { if (!levelKeysEnabled()) return; if (e.key === 'Escape') setCtxMenu(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  /** Open the 8×8 tile under the cursor as a live-tile document in Art mode. */
  const handleEditTile = useCallback((m: CtxMenuState) => {
    setCtxMenu(null);
    const section = getSectionByIndex(m.sectionIndex);
    if (!section) return;
    const word = section.tileGrid.nametable[m.row * SECTION_TILES_WIDE + m.col];
    const tileIndex = unpackNametableWord(word).tileIndex;
    if (!openDocumentGuarded({
      doc: docFromTile(tileIndex),
      liveTileIndex: tileIndex,
      chunkId: null,
      name: `tile #${tileIndex}`,
      dirty: false,
    })) return;
    switchFacet(useSessionStore.getState().activeId, 'art');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Open the block-aligned 128×128 (16×16-tile) region under the cursor as a
   * NEW unsaved chunk document (a copy — saving never writes back to the map).
   */
  const handleEditBlock = useCallback((m: CtxMenuState) => {
    setCtxMenu(null);
    const section = getSectionByIndex(m.sectionIndex);
    if (!section) return;
    const bx = Math.floor(m.col / 16);
    const by = Math.floor(m.row / 16);
    const baseCol = bx * 16, baseRow = by * 16;
    const doc = docFromSectionRegion(section, baseCol, baseRow, 16, 16);
    // Carry the map's real collision into the doc so Save writes it to the
    // chunk — without this, capture -> save -> stamp-back would ERASE map
    // collision (chunk air is authoritative over its footprint on stamp).
    seedDocCollisionFromSection(doc, section, baseCol, baseRow);
    if (!openDocumentGuarded({
      doc,
      liveTileIndex: null,
      chunkId: null,
      name: `block (${bx},${by})`,
      dirty: true, // copied off the map and not yet in the library
    })) return;
    switchFacet(useSessionStore.getState().activeId, 'art');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tool = useEditorStore((s) => s.tool);
  // A guide under the cursor outranks the tool's cursor, because a press there
  // grabs the guide rather than doing what the tool says — and the cursor is the
  // only thing on screen that says so before the author commits to the press.
  const cursor = guideHover !== null ? 'ns-resize'
    : frameHover ? 'move'
    : tool === 'view' ? 'grab'
    : tool === 'select' ? 'default'
    : tool === 'place-object' || tool === 'place-ring' ? 'crosshair'
    : tool === 'paint-tile' || tool === 'paint-block' || tool === 'paint-collision' ? 'cell'
    : tool === 'stamp-chunk' ? 'cell'
    : tool === 'marquee' ? 'crosshair'
    : 'default';

  const state = useProjectStore.getState();
  const act = getCurrentAct(state);
  if (!act) {
    return (
      <div style={styles.empty}>
        {/* Says the true thing. This read "Open a project to view sections",
            which is false wherever it can actually be seen: a MapViewport only
            mounts inside a LEVEL TAB, and a level tab only exists once a project
            is open — its name is in the title bar and its Explorer is on the
            left. What is missing is the ACT (a read that failed, a restore still
            in flight, `__dbg.resetLevel()` — see workspace/level-presence.ts).
            Word-for-word classic's ClassicLevelViewport copy, because these are
            the same state of the same shell and the user should not have to
            learn that the two engines describe it differently. */}
        <span>Open a level from the Explorer, or press Ctrl+K.</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ ...styles.container, cursor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        // A PAUSE, NOT A CANCEL. This used to null `dragTarget` and clear
        // `isDragging`, which threw away an object/ring move the moment the
        // cursor crossed the edge — and painting stopped mid-stroke with the
        // gesture's command never committed. The gesture now survives until the
        // button comes up (finishGesture, on the window), so leaving and coming
        // back is continuous and releasing outside still commits.
        if (hoverBarRef.current) hoverBarRef.current.style.display = 'none';
        // The guide HIGHLIGHT is a hover, so it clears here — but a guide DRAG
        // is a gesture, and gestures survive leaving the viewport (finishGesture
        // on the window commits it). Clearing the highlight mid-drag would only
        // dim the line the author is still holding, so it is left alone.
        if (!guideDrag.current && guideHoverRef.current !== null) setGuideHover(null);
        if (previewHoverRef.current) { previewHoverRef.current = null; drawCollisionPreview(); }
        if (pasteHoverRef.current) { pasteHoverRef.current = null; drawCollisionPreview(); }
      }}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <canvas id="map-canvas" ref={canvasRef} style={styles.canvas} />
      <canvas ref={previewCanvasRef} style={styles.previewCanvas} />
      <CollisionLegend />
      <div ref={hoverBarRef} style={{ ...styles.hoverBar, display: 'none' }} />
      {ctxMenu && (
        <div
          style={{ ...styles.ctxMenu, left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button style={styles.ctxItem} onClick={() => handleEditTile(ctxMenu)}>
            Edit tile in Art mode
          </button>
          <button style={styles.ctxItem} onClick={() => handleEditBlock(ctxMenu)}>
            Edit 128×128 chunk region
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: T.void,
  },
  canvas: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    imageRendering: 'pixelated',
  },
  previewCanvas: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    imageRendering: 'pixelated', pointerEvents: 'none',
  },
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: T.textLo, background: T.void,
  },
  hoverBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '4px 12px', background: 'rgba(17, 17, 27, 0.9)',
    borderTop: `1px solid ${T.border}`,
    fontSize: T.tXs, fontFamily: T.fontMono, color: T.textBase,
    gap: 6, alignItems: 'center',
    pointerEvents: 'none',
  },
  ctxMenu: {
    position: 'absolute', zIndex: 20,
    display: 'flex', flexDirection: 'column',
    minWidth: 190, padding: 4,
    background: T.void, border: `1px solid ${T.borderStrong}`, borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  },
  ctxItem: {
    padding: '6px 10px', textAlign: 'left' as const,
    background: 'transparent', color: T.textHi,
    border: 'none', borderRadius: 4,
    cursor: 'pointer', fontSize: T.tSm,
  },
};
