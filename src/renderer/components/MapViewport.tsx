import React, { useRef, useEffect, useCallback } from 'react';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { useEditorStore, executeCommand, undo, redo, RING_PATTERNS } from '../state/editorStore';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import { SectionRenderer } from '../canvas/SectionRenderer';
import { OverlayRenderer } from '../canvas/OverlayRenderer';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
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
  const dragTarget = useRef<{ type: 'object' | 'ring'; index: number; startX: number; startY: number } | null>(null);

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
  const selection = useEditorStore((s) => s.selection);

  // Load tileset + section when project/act/section changes
  useEffect(() => {
    const state = useProjectStore.getState();
    const zone = getCurrentZone(state);
    const act = getCurrentAct(state);
    if (!zone || !act) return;

    // Load tileset into renderer
    sectionRenderer.loadTileset(zone.tileset.tiles, zone.palette.lines);

    // Load active section
    const section = act.sections[activeSectionIndex];
    if (section) {
      sectionRenderer.loadSection(section.tileGrid);
    }
  }, [project, currentZoneId, currentActId, activeSectionIndex]);

  // Re-render when history changes (edits happened)
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

    const section = act.sections[activeSectionIndex];
    if (!section) {
      ctx.fillStyle = '#11111b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Render section tiles
    sectionRenderer.render(ctx, {
      x: vpX, y: vpY,
      width: canvas.width, height: canvas.height,
      zoom,
    });

    // Render overlays
    const viewport = { x: vpX, y: vpY, width: canvas.width, height: canvas.height, zoom };
    overlayRenderer.render(
      ctx,
      section.objects,
      section.rings,
      overlays,
      viewport,
    );
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, activeSectionIndex, historyVersion, selection]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      const state = useProjectStore.getState();
      const act = getCurrentAct(state);
      const section = act?.sections[useEditorStore.getState().activeSectionIndex];
      if (section) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          sectionRenderer.render(ctx, {
            x: vpX, y: vpY,
            width: canvas.width, height: canvas.height,
            zoom,
          });
          overlayRenderer.render(ctx, section.objects, section.rings, overlays, {
            x: vpX, y: vpY, width: canvas.width, height: canvas.height, zoom,
          });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId, activeSectionIndex, historyVersion]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = useProjectStore.getState();
      const act = getCurrentAct(state);
      const section = act?.sections[useEditorStore.getState().activeSectionIndex];

      // Build S4Level for undo/redo
      const level: S4Level | null = act ? { sections: act.sections } : null;

      // Undo/redo
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

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && level && section) {
        const { selection: sel } = useEditorStore.getState();
        if (sel) {
          if (sel.type === 'object' && section.objects[sel.index]) {
            executeCommand({
              type: 'delete-object',
              description: `Delete object`,
              sectionIndex: sel.sectionIndex,
              objectIndex: sel.index,
              object: { ...section.objects[sel.index] },
            }, level);
          } else if (sel.type === 'ring' && section.rings[sel.index]) {
            executeCommand({
              type: 'delete-ring',
              description: 'Delete ring',
              sectionIndex: sel.sectionIndex,
              ringIndex: sel.index,
              ring: { ...section.rings[sel.index] },
            }, level);
          }
          useEditorStore.getState().setSelection(null);
          e.preventDefault();
          return;
        }
      }

      // Navigation
      const step = 64;
      switch (e.key) {
        case 'ArrowLeft': pan(step, 0); e.preventDefault(); break;
        case 'ArrowRight': pan(-step, 0); e.preventDefault(); break;
        case 'ArrowUp': pan(0, step); e.preventDefault(); break;
        case 'ArrowDown': pan(0, -step); e.preventDefault(); break;
        case '=': case '+': setZoom(zoom * 1.5); e.preventDefault(); break;
        case '-': setZoom(zoom / 1.5); e.preventDefault(); break;
        case '0': setZoom(1); e.preventDefault(); break;
        // Tool shortcuts
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

  function worldToTile(worldX: number, worldY: number): { col: number; row: number; index: number } {
    const col = Math.floor(worldX / 8);
    const row = Math.floor(worldY / 8);
    const index = row * SECTION_TILES_WIDE + col;
    return { col, row, index };
  }

  function getActiveLevel(): S4Level | null {
    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    return act ? { sections: act.sections } : null;
  }

  function getActiveSection(): Section | null {
    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    const idx = useEditorStore.getState().activeSectionIndex;
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

    const section = getActiveSection();
    const level = getActiveLevel();
    if (!section || !level) return;

    const world = screenToWorld(e.clientX, e.clientY);
    const sectionIdx = useEditorStore.getState().activeSectionIndex;

    if (tool === 'select') {
      // Try to find object near click
      const objIdx = section.objects.findIndex(
        (o) => Math.abs(o.x - world.x) < 16 && Math.abs(o.y - world.y) < 16
      );
      if (objIdx >= 0) {
        useEditorStore.getState().setSelection({ type: 'object', sectionIndex: sectionIdx, index: objIdx });
        dragTarget.current = {
          type: 'object', index: objIdx,
          startX: section.objects[objIdx].x, startY: section.objects[objIdx].y,
        };
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      // Try rings
      const ringIdx = section.rings.findIndex(
        (r) => Math.abs(r.x - world.x) < 12 && Math.abs(r.y - world.y) < 12
      );
      if (ringIdx >= 0) {
        useEditorStore.getState().setSelection({ type: 'ring', sectionIndex: sectionIdx, index: ringIdx });
        dragTarget.current = {
          type: 'ring', index: ringIdx,
          startX: section.rings[ringIdx].x, startY: section.rings[ringIdx].y,
        };
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      useEditorStore.getState().setSelection(null);
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (tool === 'paint-tile') {
      const tile = worldToTile(world.x, world.y);
      if (tile.index >= 0 && tile.index < section.tileGrid.nametable.length) {
        const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
        const oldNt = section.tileGrid.nametable[tile.index];
        const oldColl = section.tileGrid.collision[tile.index];
        // Pack nametable word: tile index + palette line
        const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
        if (oldNt !== newNt) {
          executeCommand({
            type: 'set-tiles',
            description: `Paint tile at (${tile.col}, ${tile.row})`,
            sectionIndex: sectionIdx,
            entries: [{ index: tile.index, oldNt, newNt, oldColl, newColl: oldColl }],
          }, level);
          sectionRenderer.markDirty([tile.index]);
        }
      }
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }

    if (tool === 'paint-block') {
      // Paint a 16x16 (2x2 tile) area
      const tile = worldToTile(world.x, world.y);
      const baseCol = Math.floor(tile.col / 2) * 2;
      const baseRow = Math.floor(tile.row / 2) * 2;
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
          sectionIndex: sectionIdx,
          entries,
        }, level);
        sectionRenderer.markDirty(dirtyIndices);
      }
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }

    if (tool === 'stamp-chunk') {
      // TODO: stamp chunk from chunk library
      e.preventDefault();
      return;
    }

    if (tool === 'paint-collision') {
      const tile = worldToTile(world.x, world.y);
      if (tile.index >= 0 && tile.index < section.tileGrid.collision.length) {
        const { selectedCollisionType } = useEditorStore.getState();
        const oldColl = section.tileGrid.collision[tile.index];
        if (oldColl !== selectedCollisionType) {
          executeCommand({
            type: 'set-collision',
            description: `Paint collision at (${tile.col}, ${tile.row})`,
            sectionIndex: sectionIdx,
            entries: [{ index: tile.index, oldColl, newColl: selectedCollisionType }],
          }, level);
        }
      }
      isPaintDragging.current = true;
      e.preventDefault();
      return;
    }

    if (tool === 'place-object') {
      const { selectedObjectTypeId, selectedObjectSubtype } = useEditorStore.getState();
      const obj: ObjectPlacement = {
        x: Math.round(world.x),
        y: Math.round(world.y),
        typeId: selectedObjectTypeId ?? '0',
        subtype: selectedObjectSubtype,
      };
      executeCommand({
        type: 'add-object',
        description: `Place object ${selectedObjectTypeId}`,
        sectionIndex: sectionIdx,
        object: obj,
      }, level);
      e.preventDefault();
      return;
    }

    if (tool === 'place-ring') {
      const patternIdx = useEditorStore.getState().selectedRingPattern;
      const pattern = RING_PATTERNS[patternIdx] || RING_PATTERNS[0];
      const localX = Math.round(world.x);
      const localY = Math.round(world.y);

      if (pattern.offsets.length === 1) {
        executeCommand({
          type: 'add-ring',
          description: 'Place ring',
          sectionIndex: sectionIdx,
          ring: { x: localX, y: localY },
        }, level);
      } else {
        const rings = pattern.offsets.map(o => ({ x: localX + o.dx, y: localY + o.dy }));
        executeCommand({
          type: 'add-rings',
          description: `Place ${pattern.name} rings`,
          sectionIndex: sectionIdx,
          rings,
        }, level);
      }
      e.preventDefault();
      return;
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const tool = useEditorStore.getState().tool;

    // Paint dragging for tile/collision tools
    if (isPaintDragging.current && (tool === 'paint-tile' || tool === 'paint-collision')) {
      const section = getActiveSection();
      const level = getActiveLevel();
      if (!section || !level) return;
      const sectionIdx = useEditorStore.getState().activeSectionIndex;
      const world = screenToWorld(e.clientX, e.clientY);
      const tile = worldToTile(world.x, world.y);

      if (tile.index >= 0 && tile.index < section.tileGrid.nametable.length) {
        if (tool === 'paint-tile') {
          const { selectedTileIndex, selectedPaletteLine } = useEditorStore.getState();
          const oldNt = section.tileGrid.nametable[tile.index];
          const oldColl = section.tileGrid.collision[tile.index];
          const newNt = (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13);
          if (oldNt !== newNt) {
            executeCommand({
              type: 'set-tiles',
              description: `Paint tile at (${tile.col}, ${tile.row})`,
              sectionIndex: sectionIdx,
              entries: [{ index: tile.index, oldNt, newNt, oldColl, newColl: oldColl }],
            }, level);
            sectionRenderer.markDirty([tile.index]);
          }
        } else {
          const { selectedCollisionType } = useEditorStore.getState();
          const oldColl = section.tileGrid.collision[tile.index];
          if (oldColl !== selectedCollisionType) {
            executeCommand({
              type: 'set-collision',
              description: `Paint collision at (${tile.col}, ${tile.row})`,
              sectionIndex: sectionIdx,
              entries: [{ index: tile.index, oldColl, newColl: selectedCollisionType }],
            }, level);
          }
        }
      }
      return;
    }

    // Drag object/ring
    if (isDragging.current && dragTarget.current && tool === 'select') {
      const section = getActiveSection();
      if (!section) return;
      const world = screenToWorld(e.clientX, e.clientY);
      const target = dragTarget.current;

      if (target.type === 'object') {
        const obj = section.objects[target.index];
        if (obj) { obj.x = Math.round(world.x); obj.y = Math.round(world.y); }
      } else {
        const ring = section.rings[target.index];
        if (ring) { ring.x = Math.round(world.x); ring.y = Math.round(world.y); }
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
    const tile = worldToTile(world.x, world.y);
    bar.style.display = 'flex';
    bar.innerHTML = `Tile (${tile.col}, ${tile.row}) | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
  }, [pan]);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    isPaintDragging.current = false;

    // Commit object/ring drag
    if (dragTarget.current && isDragging.current) {
      const section = getActiveSection();
      const level = getActiveLevel();
      const target = dragTarget.current;
      const sectionIdx = useEditorStore.getState().activeSectionIndex;

      if (section && level) {
        if (target.type === 'object') {
          const obj = section.objects[target.index];
          if (obj && (obj.x !== target.startX || obj.y !== target.startY)) {
            const finalX = obj.x, finalY = obj.y;
            obj.x = target.startX;
            obj.y = target.startY;
            executeCommand({
              type: 'move-object',
              description: `Move object`,
              sectionIndex: sectionIdx,
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
              sectionIndex: sectionIdx,
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
      <canvas ref={canvasRef} style={styles.canvas} />
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
