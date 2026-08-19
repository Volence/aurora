import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useViewStore } from '../state/viewStore';
import { isTypingTarget } from '../shell/typing-target';
import { useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel as getStoreActiveLevel } from '../state/projectStore';
import { rasterizeAeonChunk } from '../providers/chunk-grid-aeon';
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
import { docFromTile, docFromSectionRegion } from '../../core/art/composer-buffer';
import { seedDocCollisionFromSection } from '../../core/art/composer-collision';
import type { AnyCommand, S4Level, SetTilesCommand } from '../../core/editing/commands';
import { buildStampCommand } from '../../core/editing/map-stamp';
import { snapMarquee, copyFromSection, buildPasteCommand } from '../../core/editing/map-clipboard';
import type { PasteLayers } from '../../core/editing/map-clipboard';
import { SectionRenderer } from '../canvas/SectionRenderer';
import { OverlayRenderer } from '../canvas/OverlayRenderer';
import type { SectionOverlayInfo } from '../canvas/OverlayRenderer';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE, unpackNametableWord } from '../../core/model/s4-types';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
import type { Section, ObjectPlacement, RingPlacement, Act, Tile, BgLibraryEntry } from '../../core/model/s4-types';
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
import { resolveCell, resolvePlaneWords, ensureCollisionPlanes } from '../../core/collision/collision-cell-resolve';
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
 * Resolve which background (Plane B) the viewport should display for the
 * ACTIVE section: its bgLayoutRef names a BG-library entry, null (or a
 * dangling id) falls back to the act default. Returns null when no BG exists
 * at all.
 */
function resolveActiveBg(
  act: Act,
  bgLibrary: BgLibraryEntry[],
  activeSectionIndex: number,
): { layout: Uint16Array; tiles: Tile[] } | null {
  const ref = act.sections[activeSectionIndex]?.bgLayoutRef ?? null;
  if (ref !== null) {
    const entry = bgLibrary.find(b => b.id === ref);
    if (entry) return { layout: entry.layout, tiles: entry.tiles };
  }
  if (act.bgLayout && act.bgTiles) return { layout: act.bgLayout, tiles: act.bgTiles };
  return null;
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
  /** The BG paint gesture in flight: which background, and the first-seen old
   *  value per tile. Committed as ONE command on release — see endBgStroke. */
  const bgStroke = useRef<{ bgRef: string | null; entries: Map<number, { oldNt: number; newNt: number }> } | null>(null);
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
            const rgba = rasterizeAeonChunk(chunk, zone.tileset.tiles, zone.palette);
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
  // section (bgLayoutRef -> library entry, else act default). Lighter than
  // reloadAllSections — used when the active section or its assignment
  // changes (FG canvases are untouched).
  const reloadBg = useCallback(() => {
    const state = useProjectStore.getState();
    const zone = getCurrentZone(state);
    const act = getCurrentAct(state);
    if (!zone || !act) return;

    sectionRenderer.clearBg();
    const resolved = resolveActiveBg(
      act,
      state.project?.bgLibrary ?? [],
      useEditorStore.getState().activeSectionIndex,
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
          // Per-tile: repaint just those, the same way the live stroke does.
          sectionRenderer.markBgDirty(cmd.entries.map((e) => e.index));
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

  // Re-render when anything visual changes
  useEffect(() => {
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

    const viewport = { x: vpX, y: vpY, width: canvas.width, height: canvas.height, zoom };

    if (editingLayer === 'bg') {
      sectionRenderer.renderBg(ctx, viewport);
    } else {
      // showBgPlane: paint Plane B first, then composite the foreground over
      // it (empty FG words are transparent in the section canvases). Only
      // composite when a BG is actually loaded — otherwise render() must
      // clear the canvas itself or stale frames ghost through.
      const bgVisible = overlays.showBgPlane && sectionRenderer.hasBg();
      if (bgVisible) sectionRenderer.renderBg(ctx, viewport);
      sectionRenderer.render(ctx, viewport, activeSectionIndex, !bgVisible);

      const sectionInfos: SectionOverlayInfo[] = [];
      for (let i = 0; i < act.sections.length; i++) {
        const section = act.sections[i];
        if (!section) continue;
        const offset = sectionRenderer.sectionWorldOffset(i);
        sectionInfos.push({ section, offsetX: offset.x, offsetY: offset.y });
      }

      overlayRenderer.render(ctx, sectionInfos, overlays, viewport, useProjectStore.getState().objectSprites, useProjectStore.getState().collisionProfiles);
    }
    // Realign the collision paint ghost after any pan/zoom/version change.
    drawCollisionPreview();
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, activeSectionIndex, editingLayer, historyVersion, liveEditVersion, selection, objectSprites, collisionProfiles, drawCollisionPreview]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = container.getBoundingClientRect();
      canvas.width = r.width;
      canvas.height = r.height;

      const state = useProjectStore.getState();
      const act = getCurrentAct(state);
      if (!act) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      const viewport = { x: vpX, y: vpY, width: canvas.width, height: canvas.height, zoom };
      const layer = useEditorStore.getState().editingLayer;

      if (layer === 'bg') {
        sectionRenderer.renderBg(ctx, viewport);
      } else {
        const bgVisible = overlays.showBgPlane && sectionRenderer.hasBg();
        if (bgVisible) sectionRenderer.renderBg(ctx, viewport);
        sectionRenderer.render(ctx, viewport, useEditorStore.getState().activeSectionIndex, !bgVisible);
        const sectionInfos: SectionOverlayInfo[] = [];
        for (let i = 0; i < act.sections.length; i++) {
          const section = act.sections[i];
          if (!section) continue;
          const offset = sectionRenderer.sectionWorldOffset(i);
          sectionInfos.push({ section, offsetX: offset.x, offsetY: offset.y });
        }
        overlayRenderer.render(ctx, sectionInfos, overlays, viewport, undefined, useProjectStore.getState().collisionProfiles);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, editingLayer, historyVersion, liveEditVersion]);

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
          // Pasting wins first: Escape exits paste mode without touching the
          // marquee (Ctrl+C leaves the marquee committed for repeat copies, and
          // exiting paste shouldn't discard it). Otherwise Escape clears a
          // committed marquee regardless of the active tool — the marquee stays
          // visible/copyable after switching tools (see the Ctrl+C comment
          // above), so Escape must be able to clear it from any tool too.
          const ed = useEditorStore.getState();
          if (ed.pasting) {
            ed.setPasting(false);
            pasteHoverRef.current = null;
            drawCollisionPreview();
          } else if (ed.marquee) {
            ed.setMarquee(null);
            drawCollisionPreview();
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
      y: vpY + (clientY - rect.top) / zoom,
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
    // (held by reference, so markBgDirty repaints from it). When the active
    // section displays a library BG, this edits that library entry in place
    // (additive store state, like chunk edits in Art mode).
    const activeSection = useEditorStore.getState().activeSectionIndex;
    const resolved = resolveActiveBg(act, state.project?.bgLibrary ?? [], activeSection);
    if (!resolved) return;

    const tile = worldToBgTile(worldX, worldY);
    if (!tile) return;

    const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
    const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
    if (resolved.layout[tile.tileIndex] === newNt) return;

    // The stroke paints LIVE and records as it goes; the whole gesture becomes
    // ONE command when the button is released (endBgStroke). Painting through
    // per-tile commands instead would put 60 entries on a 200-deep stack for one
    // drag; painting through none — which is what this used to do — left the
    // mutation outside history entirely, so the next Ctrl+Z reverted whatever
    // act-scoped command happened to precede the strokes.
    const bgRef = act.sections[activeSection]?.bgLayoutRef ?? null;
    if (!bgStroke.current || bgStroke.current.bgRef !== bgRef) {
      endBgStroke();
      bgStroke.current = { bgRef, entries: new Map() };
    }
    // FIRST value wins: a stroke crossing its own path must undo to what was
    // there before the gesture, not to what the gesture itself put down.
    if (!bgStroke.current.entries.has(tile.tileIndex)) {
      bgStroke.current.entries.set(tile.tileIndex, { oldNt: resolved.layout[tile.tileIndex], newNt });
    } else {
      bgStroke.current.entries.get(tile.tileIndex)!.newNt = newNt;
    }

    resolved.layout[tile.tileIndex] = newNt;
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
    if (!stroke || stroke.entries.size === 0) return;
    const level = getActiveLevel();
    if (!level) return;
    executeCommand({
      type: 'set-bg-tiles',
      description: `Paint ${stroke.entries.size} background tile${stroke.entries.size === 1 ? '' : 's'}`,
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
            const len = section.engineCollision?.length ?? section.tileGrid.nametable.length;
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
  }, [pan, drawCollisionPreview]);

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
      }
    }
    downPos.current = null;

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
  const cursor = tool === 'view' ? 'grab'
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
