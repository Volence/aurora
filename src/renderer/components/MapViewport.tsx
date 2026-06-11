import React, { useRef, useEffect, useCallback } from 'react';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel as getStoreActiveLevel } from '../state/projectStore';
import { useEditorStore, executeCommand, undo, redo, setCommandInvalidationListener, RING_PATTERNS } from '../state/editorStore';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import { SectionRenderer } from '../canvas/SectionRenderer';
import { OverlayRenderer } from '../canvas/OverlayRenderer';
import type { SectionOverlayInfo } from '../canvas/OverlayRenderer';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import type { Section, ObjectPlacement, RingPlacement } from '../../core/model/s4-types';

export const sectionRenderer = new SectionRenderer();
const overlayRenderer = new OverlayRenderer();

export default function MapViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverBarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isPaintDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const dragTarget = useRef<{
    type: 'object' | 'ring';
    sectionIndex: number;
    index: number;
    startX: number;
    startY: number;
  } | null>(null);

  const vpX = useViewStore((s) => s.vpX);
  const vpY = useViewStore((s) => s.vpY);
  const zoom = useViewStore((s) => s.zoom);
  const overlays = useViewStore((s) => s.overlays);
  const pan = useViewStore((s) => s.pan);
  const setZoom = useViewStore((s) => s.setZoom);
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const currentActId = useProjectStore((s) => s.currentActId);
  const historyVersion = useEditorStore((s) => s.historyVersion);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const selection = useEditorStore((s) => s.selection);

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
    sectionRenderer.clearBg();

    // Unified atlas: section nametables index into the zone tileset. The
    // section.tiles override is kept for future per-section art, but nothing
    // assigns it today (the load-time atlas migration nulls legacy pins).
    for (let i = 0; i < act.sections.length; i++) {
      const section = act.sections[i];
      if (!section) continue;
      const tiles = section.tiles ?? zone.tileset.tiles;
      sectionRenderer.loadSection(i, section.tileGrid, tiles, zone.palette.lines);
    }

    if (act.bgLayout && act.bgTiles) {
      const bgWidth = 64;
      const bgHeight = Math.floor(act.bgLayout.length / bgWidth);
      if (bgHeight > 0) {
        sectionRenderer.loadBg(act.bgLayout, bgWidth, bgHeight, act.bgTiles, zone.palette.lines);
      }
    }
  }, []);

  // Load all sections + bg when project/act changes
  useEffect(() => {
    reloadAllSections();
  }, [project, currentZoneId, currentActId, reloadAllSections]);

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
          // Tile pixels / palette are baked into per-section TileRenderer
          // caches at load time — re-prerender everything.
          reloadAllSections();
          break;
        default:
          // Objects/rings are drawn by the OverlayRenderer from live state
          // every frame; the historyVersion bump already re-renders them.
          break;
      }
    });
    return () => setCommandInvalidationListener(null);
  }, [reloadAllSections]);

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
      ctx.fillStyle = '#11111b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const viewport = { x: vpX, y: vpY, width: canvas.width, height: canvas.height, zoom };

    if (editingLayer === 'bg') {
      sectionRenderer.renderBg(ctx, viewport);
    } else {
      sectionRenderer.render(ctx, viewport, activeSectionIndex);

      const sectionInfos: SectionOverlayInfo[] = [];
      for (let i = 0; i < act.sections.length; i++) {
        const section = act.sections[i];
        if (!section) continue;
        const offset = sectionRenderer.sectionWorldOffset(i);
        sectionInfos.push({ section, offsetX: offset.x, offsetY: offset.y });
      }

      overlayRenderer.render(ctx, sectionInfos, overlays, viewport);
    }
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, activeSectionIndex, editingLayer, historyVersion, selection]);

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
        sectionRenderer.render(ctx, viewport, useEditorStore.getState().activeSectionIndex);
        const sectionInfos: SectionOverlayInfo[] = [];
        for (let i = 0; i < act.sections.length; i++) {
          const section = act.sections[i];
          if (!section) continue;
          const offset = sectionRenderer.sectionWorldOffset(i);
          sectionInfos.push({ section, offsetX: offset.x, offsetY: offset.y });
        }
        overlayRenderer.render(ctx, sectionInfos, overlays, viewport);
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

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (level) undo(level);
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
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
    if (!act?.bgLayout) return;

    const tile = worldToBgTile(worldX, worldY);
    if (!tile) return;

    const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
    const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
    if (act.bgLayout[tile.tileIndex] !== newNt) {
      act.bgLayout[tile.tileIndex] = newNt;
      sectionRenderer.markBgDirty([tile.tileIndex]);
      useEditorStore.getState().markDirty();
      useEditorStore.getState().bumpVersion();
    }
  }

  function getActiveLevel(): S4Level | null {
    return getStoreActiveLevel(useProjectStore.getState());
  }

  function getSectionByIndex(idx: number): Section | null {
    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    return act?.sections[idx] ?? null;
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const tool = useEditorStore.getState().tool;

    if (tool === 'view' || e.button === 1) {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
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
      const section = getSectionByIndex(info.sectionIndex);
      if (!section) return;

      const { selectedCollisionType } = useEditorStore.getState();
      const oldColl = section.tileGrid.collision[info.tileIndex];
      if (oldColl !== selectedCollisionType) {
        executeCommand({
          type: 'set-collision',
          description: `Paint collision at (${info.col}, ${info.row})`,
          sectionIndex: info.sectionIndex,
          entries: [{ index: info.tileIndex, oldColl, newColl: selectedCollisionType }],
        }, level);
      }
      useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
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
        const { selectedCollisionType } = useEditorStore.getState();
        const oldColl = section.tileGrid.collision[info.tileIndex];
        if (oldColl !== selectedCollisionType) {
          executeCommand({
            type: 'set-collision',
            description: `Paint collision at (${info.col}, ${info.row})`,
            sectionIndex: info.sectionIndex,
            entries: [{ index: info.tileIndex, oldColl, newColl: selectedCollisionType }],
          }, level);
        }
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
        bar.innerHTML = `Sec ${info.sectionIndex} | Tile (${info.col}, ${info.row}) | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
      } else {
        bar.innerHTML = `Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
      }
    }
  }, [pan]);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    isPaintDragging.current = false;

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
    >
      <canvas id="map-canvas" ref={canvasRef} style={styles.canvas} />
      <div ref={hoverBarRef} style={{ ...styles.hoverBar, display: 'none' }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: '#11111b',
  },
  canvas: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    imageRendering: 'pixelated',
  },
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#6c7086', background: '#11111b',
  },
  hoverBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '4px 12px', background: 'rgba(17, 17, 27, 0.9)',
    borderTop: '1px solid #313244',
    fontSize: 11, fontFamily: 'monospace', color: '#a6adc8',
    gap: 6, alignItems: 'center',
    pointerEvents: 'none',
  },
};
