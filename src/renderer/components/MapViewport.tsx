import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel as getStoreActiveLevel } from '../state/projectStore';
import { useEditorStore, executeCommand, undo, redo, setCommandInvalidationListener, RING_PATTERNS } from '../state/editorStore';
import { useArtStore } from '../state/artStore';
import { openDocumentGuarded } from './art/open-document';
import { createDoc, docFromTile } from '../../core/art/composer-buffer';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import { SectionRenderer } from '../canvas/SectionRenderer';
import { OverlayRenderer } from '../canvas/OverlayRenderer';
import type { SectionOverlayInfo } from '../canvas/OverlayRenderer';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE, unpackNametableWord } from '../../core/model/s4-types';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
import type { Section, ObjectPlacement, RingPlacement, Act, Tile, BgLibraryEntry } from '../../core/model/s4-types';
import { T } from './ui';
import CollisionLegend from './CollisionLegend';
import { CANVAS_VOID } from '../canvas/canvas-colors';
import { angleDegrees, isAir, isKnownProfile } from '../../core/collision/collision-model';
import { cellTileIndices } from '../../core/collision/collision-cell';
import { findMatchingBlockCells } from '../../core/collision/collision-block';
import { heightSparkline } from '../../core/collision/collision-render';

export const sectionRenderer = new SectionRenderer();
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
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverBarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  // Screen pos at mousedown — used to tell a View-mode click (select the section
  // under the cursor) from a pan-drag.
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const isPaintDragging = useRef(false);
  const lastPaintedCell = useRef<string | null>(null);
  // Collision paint mode latched at mousedown (Alt = paint just the clicked block),
  // so toggling Alt mid-drag can't switch a single stroke between reuse and local.
  const paintJustHere = useRef(false);
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
  const historyVersion = useEditorStore((s) => s.historyVersion);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const selection = useEditorStore((s) => s.selection);

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

  // Reload (re-prerender) every section + bg from current project state.
  // Stable callback: reads stores via getState so it can also be invoked from
  // the command-invalidation listener (palette/tileset changes invalidate the
  // prerendered tile bitmaps baked into each section's TileRenderer).
  const reloadAllSections = useCallback(() => {
    const state = useProjectStore.getState();
    const zone = getCurrentZone(state);
    const act = getCurrentAct(state);
    if (!zone || !act) return;

    sectionRenderer.setGrid(act.gridWidth, act.gridHeight);
    sectionRenderer.clearSections();
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

  // Load all sections + bg when project/act changes
  useEffect(() => {
    reloadAllSections();
  }, [project, currentZoneId, currentActId, reloadAllSections]);

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
        case 'set-collision':
          sectionRenderer.markDirty(cmd.sectionIndex, cmd.entries.map(e => e.index));
          break;
        case 'set-tileset-tiles':
        case 'set-palette-line':
        case 'set-sections':
          // Tile pixels / palette are baked into per-section TileRenderer
          // caches at load time, and a structural grid change (add/remove/
          // resize/move/paste) re-indexes the whole grid — re-prerender
          // everything.
          reloadAllSections();
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
          // historyVersion bump already re-renders them — no markDirty needed.
          break;
      }
    });
    return () => setCommandInvalidationListener(null);
  }, [reloadAllSections, reloadBg]);

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
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, activeSectionIndex, editingLayer, historyVersion, selection, objectSprites, collisionProfiles]);

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
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, editingLayer, historyVersion]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = useProjectStore.getState();
      const act = getCurrentAct(state);
      // Must include zone tileset/palette so undo/redo of zone commands
      // (set-palette-line / set-tileset-tiles) works from the keyboard path.
      const level: S4Level | null = getStoreActiveLevel(state);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (level) undo(level);
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (level) redo(level);
        e.preventDefault();
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

      const step = 64;
      switch (e.key) {
        case 'ArrowLeft': pan(step, 0); e.preventDefault(); break;
        case 'ArrowRight': pan(-step, 0); e.preventDefault(); break;
        case 'ArrowUp': pan(0, step); e.preventDefault(); break;
        case 'ArrowDown': pan(0, -step); e.preventDefault(); break;
        case '=': case '+': setZoom(zoom * 1.5); e.preventDefault(); break;
        case '-': setZoom(zoom / 1.5); e.preventDefault(); break;
        case '0': setZoom(1); e.preventDefault(); break;
        case 'v': useEditorStore.getState().setTool('view'); break;
        case 's': if (!e.ctrlKey) useEditorStore.getState().setTool('select'); break;
        case 'o': useEditorStore.getState().setTool('place-object'); break;
        case 'r': useEditorStore.getState().setTool('place-ring'); break;
        case 't': useEditorStore.getState().setTool('paint-tile'); break;
        case 'b': useEditorStore.getState().setTool('paint-block'); break;
        case 'c': if (!e.ctrlKey) useEditorStore.getState().setTool('paint-collision'); break;
        case 'k': useEditorStore.getState().setTool('stamp-chunk'); break;
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
    const resolved = resolveActiveBg(
      act, state.project?.bgLibrary ?? [], useEditorStore.getState().activeSectionIndex,
    );
    if (!resolved) return;

    const tile = worldToBgTile(worldX, worldY);
    if (!tile) return;

    const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
    const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
    if (resolved.layout[tile.tileIndex] !== newNt) {
      resolved.layout[tile.tileIndex] = newNt;
      sectionRenderer.markBgDirty([tile.tileIndex]);
      useEditorStore.getState().markDirty();
      useEditorStore.getState().bumpVersion();
    }
  }

  function getActiveLevel(): S4Level | null {
    return getStoreActiveLevel(useProjectStore.getState());
  }

  // Paint collision at the 16px block under `info` with the selected profile.
  // Default: every block in the section with the SAME tiles (reuse). `justHere`
  // (Alt): only the clicked block. The block is the 2×2 tiles at (cellCol,cellRow);
  // a paint sets all four 8px sub-tiles. One undoable set-collision-edit command.
  function paintCollisionCell(info: { sectionIndex: number; col: number; row: number }, justHere: boolean) {
    const section = getSectionByIndex(info.sectionIndex);
    if (!section) return;
    const plane = useEditorStore.getState().collisionPaintPlane;
    // Lazily seed the target plane (clone its engine baseline) if missing.
    if (plane === 'b') {
      if (!section.collisionEditB) section.collisionEditB = section.engineCollisionB
        ? new Uint8Array(section.engineCollisionB) : new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    } else if (!section.collisionEdit) {
      section.collisionEdit = section.engineCollision
        ? new Uint8Array(section.engineCollision) : new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    }
    const ce = (plane === 'b' ? section.collisionEditB : section.collisionEdit)!;
    const cellCol = info.col >> 1, cellRow = info.row >> 1;
    const cellKey = `${info.sectionIndex}:${cellCol}:${cellRow}`;
    if (lastPaintedCell.current === cellKey) return; // same cursor cell — skip
    lastPaintedCell.current = cellKey;

    const profile = useEditorStore.getState().selectedCollisionProfile;
    const brush = useEditorStore.getState().collisionBrushSize;
    const cellsW = SECTION_TILES_WIDE / 2, cellsH = SECTION_TILES_HIGH / 2;

    let targets: Array<{ cellCol: number; cellRow: number }>;
    let label: string;
    if (brush > 1) {
      // Bigger brush: the N×N block area centred on the cursor, painted
      // positionally (no reuse — a multi-block stroke means "this region", not
      // "every matching block"). Ideal for erasing/clearing an area.
      const half = brush >> 1;
      targets = [];
      for (let dr = -half; dr <= half; dr++) {
        for (let dc = -half; dc <= half; dc++) {
          const cc = cellCol + dc, cr = cellRow + dr;
          if (cc >= 0 && cr >= 0 && cc < cellsW && cr < cellsH) targets.push({ cellCol: cc, cellRow: cr });
        }
      }
      label = `${brush}×${brush} area`;
    } else if (justHere) {
      targets = [{ cellCol, cellRow }];
      label = 'this block';
    } else {
      // Cheap no-op guard: if the clicked block is already fully the selected
      // profile, there's nothing to do (its matches were painted when first
      // touched) — return before the per-section match scan.
      const clicked = cellTileIndices(cellCol, cellRow, SECTION_TILES_WIDE);
      if (clicked.every((i) => ce[i] === profile)) return;
      // Default: every block with the same content.
      targets = findMatchingBlockCells(section.tileGrid.nametable, cellCol, cellRow, SECTION_TILES_WIDE, cellsW, cellsH);
      label = `${targets.length} matching blocks`;
    }

    const entries: Array<{ index: number; oldColl: number; newColl: number }> = [];
    for (const t of targets) {
      for (const index of cellTileIndices(t.cellCol, t.cellRow, SECTION_TILES_WIDE)) {
        const oldColl = ce[index];
        if (oldColl !== profile) entries.push({ index, oldColl, newColl: profile });
      }
    }
    if (entries.length === 0) return;
    const level = getActiveLevel();
    if (!level) return;
    executeCommand({
      type: 'set-collision-edit',
      plane,
      description: `Paint collision ${plane.toUpperCase()} (${label})`,
      sectionIndex: info.sectionIndex,
      entries,
    }, level);
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
      const oldColl = section.tileGrid.collision[info.tileIndex];
      const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
      if (oldNt !== newNt) {
        executeCommand({
          type: 'set-tiles',
          description: `Paint tile at (${info.col}, ${info.row})`,
          sectionIndex: info.sectionIndex,
          entries: [{ index: info.tileIndex, oldNt, newNt, oldColl, newColl: oldColl }],
        }, level);
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
      const entries: Array<{ index: number; oldNt: number; newNt: number; oldColl: number; newColl: number }> = [];
      const dirtyIndices: number[] = [];

      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const c = baseCol + dc;
          const r = baseRow + dr;
          if (c >= SECTION_TILES_WIDE || r >= SECTION_TILES_HIGH) continue;
          const idx = r * SECTION_TILES_WIDE + c;
          const oldNt = section.tileGrid.nametable[idx];
          const oldColl = section.tileGrid.collision[idx];
          const tileOffset = dr * 2 + dc;
          const newNt = ((selectedTileIndex + tileOffset) & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
          if (oldNt !== newNt) {
            entries.push({ index: idx, oldNt, newNt, oldColl, newColl: oldColl });
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

      const entries: Array<{ index: number; oldNt: number; newNt: number; oldColl: number; newColl: number }> = [];
      const dirtyIndices: number[] = [];

      for (let r = 0; r < chunk.heightTiles; r++) {
        for (let c = 0; c < chunk.widthTiles; c++) {
          const col = baseCol + c;
          const row = baseRow + r;
          if (col >= SECTION_TILES_WIDE || row >= SECTION_TILES_HIGH) continue;
          const idx = row * SECTION_TILES_WIDE + col;
          const oldNt = section.tileGrid.nametable[idx];
          const oldColl = section.tileGrid.collision[idx];
          const newNt = chunk.nametable[r * chunk.widthTiles + c];
          const newColl = chunk.collision[r * chunk.widthTiles + c];
          if (oldNt !== newNt || oldColl !== newColl) {
            entries.push({ index: idx, oldNt, newNt, oldColl, newColl });
            dirtyIndices.push(idx);
          }
        }
      }

      if (entries.length > 0) {
        executeCommand({
          type: 'set-tiles',
          description: `Stamp chunk ${selectedChunkId} at (${baseCol}, ${baseRow})`,
          sectionIndex: info.sectionIndex,
          entries,
        }, level);
        sectionRenderer.markDirty(info.sectionIndex, dirtyIndices);
      }
      useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
      e.preventDefault();
      return;
    }

    if (tool === 'paint-collision') {
      const info = worldToSectionTile(world.x, world.y);
      if (!info) return;
      lastPaintedCell.current = null;
      paintJustHere.current = e.altKey; // latch the mode for the whole stroke
      paintCollisionCell(info, paintJustHere.current);
      isPaintDragging.current = true;
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
        const oldColl = section.tileGrid.collision[info.tileIndex];
        const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
        if (oldNt !== newNt) {
          executeCommand({
            type: 'set-tiles',
            description: `Paint tile at (${info.col}, ${info.row})`,
            sectionIndex: info.sectionIndex,
            entries: [{ index: info.tileIndex, oldNt, newNt, oldColl, newColl: oldColl }],
          }, level);
          sectionRenderer.markDirty(info.sectionIndex, [info.tileIndex]);
        }
      } else {
        paintCollisionCell(info, paintJustHere.current); // latched mode (not live Alt)
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
      useEditorStore.getState().bumpVersion();
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
            const coll = (pathB
              ? (section.collisionEditB ?? section.engineCollisionB ?? section.engineCollision)
              : (section.collisionEdit ?? section.engineCollision)) ?? section.tileGrid.collision;
            const index = coll[cellRow * SECTION_TILES_WIDE + cellCol];
            const profiles = useProjectStore.getState().collisionProfiles;
            const path = pathB ? 'B' : 'A';
            if (isAir(profiles, index)) {
              extra = ` | Coll ${path}: air`;
            } else if (!profiles) {
              extra = ` | Coll ${path} #${index} (tables not loaded)`;
            } else if (isKnownProfile(profiles, index)) {
              const p = profiles.profiles[index];
              const deg = angleDegrees(p);
              extra = ` | Coll ${path} #${index} ${p.solidity} ${deg === null ? '—' : deg + '°'} ${heightSparkline(p.heights)}`;
            } else {
              extra = ` | Coll ${path} #${index} (unknown)`;
            }
          }
        }
        bar.innerHTML = `Sec ${info.sectionIndex} | Tile (${info.col}, ${info.row}) | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}${extra}`;
      } else {
        bar.innerHTML = `Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
      }
    }
  }, [pan]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isPaintDragging.current = false;

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
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
    useEditorStore.getState().setAppMode('art');
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
    const doc = createDoc(16, 16);
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const idx = (by * 16 + r) * SECTION_TILES_WIDE + (bx * 16 + c);
        const word = section.tileGrid.nametable[idx];
        const cell = doc.cells[r * 16 + c];
        if (word !== 0) {
          const entry = unpackNametableWord(word);
          cell.atlasTile = entry.tileIndex;
          cell.pal = entry.palette;
          cell.hf = entry.hFlip;
          cell.vf = entry.vFlip;
          cell.pri = entry.priority;
        }
        cell.coll = section.tileGrid.collision[idx];
      }
    }
    if (!openDocumentGuarded({
      doc,
      liveTileIndex: null,
      chunkId: null,
      name: `block (${bx},${by})`,
      dirty: true, // copied off the map and not yet in the library
    })) return;
    useEditorStore.getState().setAppMode('art');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tool = useEditorStore((s) => s.tool);
  const cursor = tool === 'view' ? 'grab'
    : tool === 'select' ? 'default'
    : tool === 'place-object' || tool === 'place-ring' ? 'crosshair'
    : tool === 'paint-tile' || tool === 'paint-block' || tool === 'paint-collision' ? 'cell'
    : tool === 'stamp-chunk' ? 'cell'
    : 'default';

  const state = useProjectStore.getState();
  const act = getCurrentAct(state);
  if (!act) {
    return (
      <div style={styles.empty}>
        <span>Open a project to view sections</span>
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
        isPaintDragging.current = false;
        if (dragTarget.current) dragTarget.current = null;
        isDragging.current = false;
        if (hoverBarRef.current) hoverBarRef.current.style.display = 'none';
      }}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <canvas id="map-canvas" ref={canvasRef} style={styles.canvas} />
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
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: T.textLo, background: T.void,
  },
  hoverBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '4px 12px', background: 'rgba(17, 17, 27, 0.9)',
    borderTop: `1px solid ${T.border}`,
    fontSize: 11, fontFamily: 'monospace', color: T.textBase,
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
    cursor: 'pointer', fontSize: 12,
  },
};
