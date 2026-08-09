import React, { useRef, useEffect, useState, useCallback } from 'react';
import { T, Chip, OptionBar, Divider } from '../ui';
import { useClassicLevelStore, classicSetLayoutCells } from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import { renderChunk } from '../../../core/level-classic/render';
import { columnSolidRun } from '../../../core/collision/collision-render';
import type { LevelDoc } from '../../../core/level-classic/model';
import {
  CHUNK_PX, visibleChunkRange, layoutCellAt, ringGroupPositions, screenToWorld,
  worldToLayoutCell, addStampCell, stampAccumToCells, type StampCell,
} from './viewport-math';
import {
  CANVAS_VOID,
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK,
  OBJECT_BOX_FILL, OBJECT_BOX_STROKE, OBJECT_LABEL, RING_FILL, RING_STROKE, START_MARKER,
} from '../../canvas/canvas-colors';

const RING_OBJ_ID = 0x25;

type Plane = 'fg' | 'bg';
interface Overlays {
  collision: boolean;
  objects: boolean;
  start: boolean;
  angles: boolean;
}
interface Camera {
  x: number;
  y: number;
  zoom: number;
}

function solidityFill(solidity: number): string {
  switch (solidity) {
    case 1: return COLLISION_FILL_TOP;
    case 2: return COLLISION_FILL_SIDES;
    case 3: return COLLISION_FILL_ALL;
    default: return COLLISION_FILL_NONE;
  }
}

/**
 * Read-only classic (Sonic 1) level viewport (Task 11). Composes the FG/BG chunk
 * layout from `renderChunk` prerenders (cached per chunk id — read-only, so the
 * cache is only invalidated when the whole doc changes), with a pan/zoom camera
 * and toggleable collision / object / start overlays.
 *
 * CAMERA MATH is duplicated (not shared) from the map viewport's `useViewStore` +
 * MapViewport render effect (src/renderer/state/viewStore.ts): `cam.x/cam.y` is
 * the world coordinate at the canvas top-left, `zoom` scales world→screen, so the
 * draw transform is `scale(zoom); translate(-cam.x, -cam.y)` and screen→world is
 * `cam.x + screenPx/zoom`. That store is coupled to aeon's overlay set and
 * projectStore, so per the task we keep an isolated local copy rather than
 * refactoring the aeon camera this task. The visible-chunk / layout-index /
 * ring-expansion logic lives in the unit-tested `./viewport-math`.
 */
export default function ClassicLevelViewport() {
  const status = useClassicLevelStore((s) => s.status);
  const doc = useClassicLevelStore((s) => s.doc);
  const ref = useClassicLevelStore((s) => s.ref);
  const error = useClassicLevelStore((s) => s.error);
  // Per-chunk content versions (Task 12): edits bump only the chunks they touch
  // (or the whole epoch), so the chunk-art cache below invalidates precisely.
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  // Task 13 layout-editing UI state (select|stamp + the stamp/eyedrop chunk id).
  const tool = useClassicLevelStore((s) => s.tool);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const setTool = useClassicLevelStore((s) => s.setTool);
  const setSelectedChunkId = useClassicLevelStore((s) => s.setSelectedChunkId);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  // Cached canvas backing-store size. Written ONLY by the measure/ResizeObserver
  // path below — the render pass reads it and never resizes the canvas (assigning
  // width/height reinitializes the backing store) nor forces layout via
  // getBoundingClientRect, so drags stay cheap.
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [, forceRedraw] = useState(0);
  const redraw = useCallback(() => forceRedraw((n) => n + 1), []);

  const [plane, setPlane] = useState<Plane>('fg');
  const [overlays, setOverlays] = useState<Overlays>({
    collision: false, objects: true, start: true, angles: false,
  });
  const toggle = (k: keyof Overlays) => setOverlays((o) => ({ ...o, [k]: !o[k] }));

  // Per-chunk prerender cache (chunkId → {offscreen canvas, version key}). A cached
  // canvas is reused while its content version is unchanged; edits bump the version
  // of only the affected chunk(s) (or the epoch, for edits that touch all chunk
  // art), so a single-chunk edit rebuilds just that one canvas. The whole cache is
  // wiped only when a DIFFERENT act is loaded (ref identity changes) — edits keep
  // the same ref, so they never wipe it. (Version values are process-unique, so a
  // reload's fresh epoch also can't collide with a prior level's cached keys.)
  //
  // UNDO CAVEAT (tempered): this holds only the LATEST canvas per chunk id, keyed
  // by its current version. Undo/redo restore an OLDER version value, whose key
  // won't match the stored one, so an undo re-renders the affected chunk(s) rather
  // than reusing a retained pre-edit canvas. That is correct (the render is
  // deterministic in the doc), just not free — a bounded LRU keyed by version
  // would make undo a cache hit, but isn't worth the memory for v1.
  const chunkCache = useRef<Map<number, { canvas: HTMLCanvasElement; key: string }>>(new Map());
  useEffect(() => {
    chunkCache.current = new Map();
  }, [ref]);

  const getChunkCanvas = useCallback(
    (d: LevelDoc, chunkId: number, key: string): HTMLCanvasElement => {
      const cache = chunkCache.current;
      const hit = cache.get(chunkId);
      if (hit && hit.key === key) return hit.canvas;
      const c = hit?.canvas ?? document.createElement('canvas');
      c.width = CHUNK_PX;
      c.height = CHUNK_PX;
      const cctx = c.getContext('2d');
      if (cctx) {
        // createImageData + data.set avoids the ImageData ctor's ArrayBuffer-typed
        // overload rejecting the core's Uint8ClampedArray<ArrayBufferLike> (repo
        // pattern — see TilesetPanel/ArtBrowser).
        const img = cctx.createImageData(CHUNK_PX, CHUNK_PX);
        img.data.set(renderChunk(d, chunkId));
        cctx.putImageData(img, 0, 0);
      }
      cache.set(chunkId, { canvas: c, key });
      return c;
    },
    [],
  );

  // Fit the level's height into the canvas on a fresh doc, anchored top-left.
  useEffect(() => {
    if (!doc) return;
    const grid = plane === 'bg' ? doc.bg : doc.fg;
    const container = containerRef.current;
    const h = container?.clientHeight ?? 600;
    const levelPxH = grid.height * CHUNK_PX;
    const zoom = Math.max(0.125, Math.min(2, levelPxH > 0 ? h / levelPxH : 1));
    camRef.current = { x: 0, y: 0, zoom };
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, plane]);

  // ---- overlay drawing -----------------------------------------------------
  const drawCollision = useCallback(
    (ctx: CanvasRenderingContext2D, d: LevelDoc, col: number, row: number, chunkId: number, showAngles: boolean) => {
      const chunk = d.chunks[chunkId];
      if (!chunk) return;
      const baseX = col * CHUNK_PX;
      const baseY = row * CHUNK_PX;
      const heights = d.collision.shapes.heights;
      const angles = d.collision.shapes.angles;
      for (let i = 0; i < 256; i++) {
        const cell = chunk.cells[i];
        if (!cell || cell.solidity === 0) continue;
        const shapeIndex = d.collision.colind[cell.block] ?? 0;
        if (shapeIndex === 0) continue; // shape 0 = empty (no collision)
        const cols = heights[shapeIndex];
        if (!cols) continue;
        const cx = baseX + (i % 16) * 16;
        const cy = baseY + ((i / 16) | 0) * 16;
        ctx.fillStyle = solidityFill(cell.solidity);
        for (let c = 0; c < 16; c++) {
          // Chunk-cell X flip mirrors which column height applies.
          const sc = cell.xf ? 15 - c : c;
          const run = columnSolidRun(cols[sc]);
          if (!run) continue;
          // Chunk-cell Y flip mirrors the run vertically within the 16px cell.
          const ry = cell.yf ? 16 - run.y - run.h : run.y;
          ctx.fillRect(cx + c, cy + ry, 1, run.h);
        }
        if (showAngles) {
          const ang = angles[shapeIndex] ?? 0;
          const a = (ang / 256) * Math.PI * 2;
          const mx = cx + 8, my = cy + 8, len = 6;
          ctx.strokeStyle = COLLISION_ANGLE_TICK;
          ctx.lineWidth = 1 / ctx.getTransform().a;
          ctx.beginPath();
          ctx.moveTo(mx - Math.cos(a) * len, my + Math.sin(a) * len);
          ctx.lineTo(mx + Math.cos(a) * len, my - Math.sin(a) * len);
          ctx.stroke();
        }
      }
      // Crisp surface line along each column's collidable edge.
      ctx.strokeStyle = COLLISION_SURFACE_LINE;
      ctx.lineWidth = 1 / ctx.getTransform().a;
      for (let i = 0; i < 256; i++) {
        const cell = chunk.cells[i];
        if (!cell || cell.solidity === 0) continue;
        const shapeIndex = d.collision.colind[cell.block] ?? 0;
        if (shapeIndex === 0) continue;
        const cols = heights[shapeIndex];
        if (!cols) continue;
        const cx = baseX + (i % 16) * 16;
        const cy = baseY + ((i / 16) | 0) * 16;
        for (let c = 0; c < 16; c++) {
          const sc = cell.xf ? 15 - c : c;
          const h = cols[sc];
          const run = columnSolidRun(h);
          if (!run) continue;
          let surfaceY = h >= 0 ? run.y : run.y + run.h;
          if (cell.yf) surfaceY = 16 - surfaceY;
          ctx.beginPath();
          ctx.moveTo(cx + c, cy + surfaceY);
          ctx.lineTo(cx + c + 1, cy + surfaceY);
          ctx.stroke();
        }
      }
    },
    [],
  );

  const drawObjects = useCallback((ctx: CanvasRenderingContext2D, d: LevelDoc, invZoom: number) => {
    ctx.lineWidth = 1 * invZoom;
    ctx.font = `${8 * invZoom}px monospace`;
    ctx.textAlign = 'center';
    for (const obj of d.objects) {
      if (obj.id === RING_OBJ_ID) {
        // Expand a ring group to its individual rings (S1 Ring_Main rule).
        ctx.fillStyle = RING_FILL;
        ctx.strokeStyle = RING_STROKE;
        for (const p of ringGroupPositions(obj.subtype, obj.x, obj.y)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        continue;
      }
      ctx.fillStyle = OBJECT_BOX_FILL;
      ctx.fillRect(obj.x - 8, obj.y - 8, 16, 16);
      ctx.strokeStyle = OBJECT_BOX_STROKE;
      ctx.strokeRect(obj.x - 8, obj.y - 8, 16, 16);
      ctx.fillStyle = OBJECT_LABEL;
      ctx.fillText(obj.id.toString(16).toUpperCase().padStart(2, '0'), obj.x, obj.y + 3 * invZoom);
    }
  }, []);

  const drawStart = useCallback((ctx: CanvasRenderingContext2D, d: LevelDoc, invZoom: number) => {
    const { x, y } = d.start;
    ctx.strokeStyle = START_MARKER;
    ctx.fillStyle = START_MARKER;
    ctx.lineWidth = 2 * invZoom;
    // Crosshair + ring so the spawn point reads distinctly from object markers.
    const r = 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r - 4, y); ctx.lineTo(x + r + 4, y);
    ctx.moveTo(x, y - r - 4); ctx.lineTo(x, y + r + 4);
    ctx.stroke();
    ctx.font = `${9 * invZoom}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('START', x + r + 6, y - r);
  }, []);

  // ---- main render effect --------------------------------------------------
  // Pure draw pass: clears + composes using the cached size. It never resizes the
  // canvas or calls getBoundingClientRect (see measure() below), so redraws during
  // a drag do no synchronous layout and don't reallocate the backing store.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return; // not yet measured — measure() will redraw
    ctx.imageSmoothingEnabled = false;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = CANVAS_VOID;
    ctx.fillRect(0, 0, w, h);
    if (!doc) return;

    const cam = camRef.current;
    const grid = plane === 'bg' ? doc.bg : doc.fg;
    const invZoom = 1 / cam.zoom;

    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const range = visibleChunkRange(cam.x, cam.y, w, h, cam.zoom, grid.width, grid.height);

    // Chunk layer.
    for (let row = range.startRow; row < range.endRow; row++) {
      for (let col = range.startCol; col < range.endCol; col++) {
        const cell = layoutCellAt(grid, col, row);
        if (cell === undefined) continue;
        const chunkId = cell & 0x7f; // strip S1's bit-7 loop flag
        const key = `${chunkEpoch}:${chunkVersions.get(chunkId) ?? 0}`;
        ctx.drawImage(getChunkCanvas(doc, chunkId, key), col * CHUNK_PX, row * CHUNK_PX);
      }
    }

    // Collision / object / start overlays are all FG concepts (S1 collision,
    // object placement and the spawn point live on the foreground plane).
    if (plane === 'fg') {
      // Collision overlay (per visible chunk).
      if (overlays.collision) {
        for (let row = range.startRow; row < range.endRow; row++) {
          for (let col = range.startCol; col < range.endCol; col++) {
            const cell = layoutCellAt(grid, col, row);
            if (cell === undefined) continue;
            drawCollision(ctx, doc, col, row, cell & 0x7f, overlays.angles);
          }
        }
      }
      if (overlays.objects) drawObjects(ctx, doc, invZoom);
      if (overlays.start) drawStart(ctx, doc, invZoom);
    }

    // Stamp-gesture preview: highlight the cells the in-progress drag has painted
    // so far (the store commit lands on mouseup). Read from a ref, so it repaints
    // whenever the stroke calls redraw(). Nothing draws when not stamping.
    const stroke = strokeRef.current;
    if (stroke && stroke.size > 0) {
      ctx.fillStyle = 'rgba(120,180,255,0.30)';
      ctx.strokeStyle = 'rgba(150,200,255,0.95)';
      ctx.lineWidth = 2 * invZoom;
      for (const c of stroke.values()) {
        ctx.fillRect(c.x * CHUNK_PX, c.y * CHUNK_PX, CHUNK_PX, CHUNK_PX);
        ctx.strokeRect(c.x * CHUNK_PX, c.y * CHUNK_PX, CHUNK_PX, CHUNK_PX);
      }
    }
  });

  // ---- resize → measure → redraw -------------------------------------------
  // The ONLY place the canvas backing store is (re)sized. It reads the container
  // rect (forcing layout) here, off the render path, then triggers a redraw. Runs
  // on mount, whenever the container resizes, and when `status` flips (the canvas
  // is conditionally mounted, so a fresh element needs re-measuring).
  useEffect(() => {
    const measure = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const prev = sizeRef.current;
      sizeRef.current = { w, h };
      // Assigning width/height reinitializes the backing store — only do it when
      // the size actually changed (or the canvas element was just remounted).
      if (canvas.width !== w || canvas.height !== h || prev.w !== w || prev.h !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    };
    measure();
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [redraw, status]);

  // ---- pan / zoom / stamp --------------------------------------------------
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  // The active stamp gesture's accumulated cells (null when not stamping). Keyed
  // by linear cell index so wiggling over a cell dedupes → ONE undo step per drag,
  // committed on mouseUp. A ref (not state): mutated during the drag, drawn from
  // the render effect, and reset without a partial command on cancel.
  const strokeRef = useRef<Map<number, StampCell> | null>(null);

  // The layout cell (col,row) under a mouse event, using the shared camera math.
  const cellUnderCursor = useCallback((e: React.MouseEvent): { col: number; row: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { x, y } = screenToWorld(camRef.current, e.clientX - rect.left, e.clientY - rect.top);
    return worldToLayoutCell(x, y);
  }, []);

  const activeGrid = useCallback(() => {
    const d = useClassicLevelStore.getState().doc;
    if (!d) return null;
    return plane === 'bg' ? d.bg : d.fg;
  }, [plane]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only; right-click eyedrops (below)
    if (tool === 'stamp') {
      const grid = activeGrid();
      const cell = cellUnderCursor(e);
      if (!grid || !cell) return;
      const acc = new Map<number, StampCell>();
      addStampCell(acc, cell.col, cell.row, grid.width, grid.height);
      strokeRef.current = acc;
      redraw();
      return;
    }
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [tool, activeGrid, cellUnderCursor, redraw]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const stroke = strokeRef.current;
    if (stroke) {
      const grid = activeGrid();
      const cell = cellUnderCursor(e);
      if (grid && cell && addStampCell(stroke, cell.col, cell.row, grid.width, grid.height)) redraw();
      return;
    }
    if (!dragging.current) return;
    const cam = camRef.current;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    // A screen drag delta is a world delta scaled by 1/zoom: convert it with the
    // shared screenToWorld using a zero-origin camera, then pan by its negation.
    const d = screenToWorld({ x: 0, y: 0, zoom: cam.zoom }, dx, dy);
    cam.x = Math.max(0, cam.x - d.x);
    cam.y = Math.max(0, cam.y - d.y);
    redraw();
  }, [activeGrid, cellUnderCursor, redraw]);

  // Commit the stamp gesture as ONE undoable command (or cancel with none pending).
  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || stroke.size === 0) { redraw(); return; }
    const cells = stampAccumToCells(stroke, useClassicLevelStore.getState().selectedChunkId);
    const res = classicSetLayoutCells(plane, cells);
    if (!res.ok) useToastStore.getState().addToast(`Stamp failed: ${res.error}`, 'error');
    redraw();
  }, [plane, redraw]);

  // Mouse-up ends whichever gesture is active. Mouse-leave CANCELS a stamp stroke
  // cleanly (no partial command) but also ends a pan.
  const onMouseUp = useCallback(() => {
    if (strokeRef.current) { endStroke(); return; }
    dragging.current = false;
  }, [endStroke]);
  const onMouseLeave = useCallback(() => {
    // Abandon an in-progress stamp without committing (spec: mouseleave cancels).
    strokeRef.current = null;
    dragging.current = false;
    redraw();
  }, [redraw]);

  // Right-click eyedrops the chunk under the cursor into the stamp selection. It
  // reads the ACTIVE plane's layout cell (the same id used when stamping either
  // plane), stripping S1's bit-7 loop flag. preventDefault suppresses the browser
  // context menu.
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const grid = activeGrid();
    const cell = cellUnderCursor(e);
    if (!grid || !cell) return;
    const raw = layoutCellAt(grid, cell.col, cell.row);
    if (raw === undefined) return;
    setSelectedChunkId(raw & 0x7f);
  }, [activeGrid, cellUnderCursor, setSelectedChunkId]);

  // Escape cancels an in-progress stamp stroke (spec: escape cancels cleanly).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && strokeRef.current) {
        strokeRef.current = null;
        redraw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redraw]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.125, Math.min(8, cam.zoom * factor));
    // Zoom about the cursor: keep the world point under the pointer fixed.
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x: worldX, y: worldY } = screenToWorld(cam, sx, sy);
    cam.x = Math.max(0, worldX - sx / newZoom);
    cam.y = Math.max(0, worldY - sy / newZoom);
    cam.zoom = newZoom;
    redraw();
  }, [redraw]);

  // ---- render --------------------------------------------------------------
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <OptionBar>
        <span style={{ color: T.textLo }}>Tool</span>
        <Chip active={tool === 'select'} onClick={() => setTool('select')} title="Pan / navigate (drag to pan)">Select</Chip>
        <Chip active={tool === 'stamp'} onClick={() => setTool('stamp')} title="Paint the selected chunk onto layout cells (drag)">Stamp</Chip>
        <Divider />
        <span style={{ color: T.textLo }}>Plane</span>
        <Chip active={plane === 'fg'} onClick={() => setPlane('fg')}>FG</Chip>
        <Chip active={plane === 'bg'} onClick={() => setPlane('bg')}>BG</Chip>
        <Divider />
        <span style={{ color: T.textLo }}>Overlays</span>
        <Chip active={overlays.collision} onClick={() => toggle('collision')}>Collision</Chip>
        <Chip active={overlays.angles} onClick={() => toggle('angles')} disabled={!overlays.collision}>Angles</Chip>
        <Chip active={overlays.objects} onClick={() => toggle('objects')}>Objects</Chip>
        <Chip active={overlays.start} onClick={() => toggle('start')}>Start</Chip>
        <span style={{ flex: 1 }} />
        <span style={{ color: T.textFaint }}>
          {tool === 'stamp'
            ? `stamp $${selectedChunkId.toString(16).toUpperCase().padStart(2, '0')} · drag to paint · right-click eyedrops · scroll to zoom`
            : 'drag to pan · right-click eyedrops · scroll to zoom'}
        </span>
      </OptionBar>
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, background: T.void }}
      >
        {status === 'ready' && doc ? (
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onContextMenu={onContextMenu}
            onWheel={onWheel}
            style={{ position: 'absolute', inset: 0, cursor: tool === 'stamp' ? 'crosshair' : 'grab' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: status === 'error' ? T.error : T.textLo, fontSize: 13, textAlign: 'center', padding: 24,
          }}>
            {status === 'loading' && `Loading ${ref?.label ?? 'level'}…`}
            {status === 'error' && <span style={{ whiteSpace: 'pre-line' }}>{error ?? 'Failed to load level'}</span>}
            {status === 'idle' && 'Select an act from the tree to view it.'}
          </div>
        )}
      </div>
    </div>
  );
}
