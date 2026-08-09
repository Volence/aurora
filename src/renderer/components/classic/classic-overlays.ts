// Pure overlay-drawing functions for the classic (Sonic 1) level viewport.
//
// Extracted verbatim from ClassicLevelViewport.tsx (Task 14 pre-refactor) so the
// component stays a thin gesture/camera shell over drawing that is otherwise
// straight-line canvas code. These take an already-transformed 2D context (the
// caller has applied `scale(zoom); translate(-cam.x, -cam.y)`) plus the LevelDoc
// and the inverse zoom, and paint the collision / object / start overlays in
// world coordinates. They hold no state and touch no React — behaviour is
// identical to the inline versions they replaced.

import type { LevelDoc } from '../../../core/level-classic/model';
import { columnSolidRun } from '../../../core/collision/collision-render';
import { CHUNK_PX, ringGroupPositions } from './viewport-math';
import {
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK,
  OBJECT_BOX_FILL, OBJECT_BOX_STROKE, OBJECT_LABEL, RING_FILL, RING_STROKE, START_MARKER,
  OBJECT_SELECTED_STROKE,
} from '../../canvas/canvas-colors';

/** S1 ring object id — expands into a visible ring group (Ring_Main rule). */
export const RING_OBJ_ID = 0x25;

function solidityFill(solidity: number): string {
  switch (solidity) {
    case 1: return COLLISION_FILL_TOP;
    case 2: return COLLISION_FILL_SIDES;
    case 3: return COLLISION_FILL_ALL;
    default: return COLLISION_FILL_NONE;
  }
}

/** Draw the collision overlay for one visible chunk at layout cell (col, row). */
export function drawCollision(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  col: number,
  row: number,
  chunkId: number,
  showAngles: boolean,
): void {
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
}

/**
 * Draw all object markers (ring groups expand to individual rings).
 *
 * When `selectedIndex` is a valid index it gets a highlight ring drawn on top;
 * `previewPos`, if given, overrides that object's centre only (the live position
 * during an in-progress drag, before the store commit lands on mouseup).
 */
export function drawObjects(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  invZoom: number,
  selectedIndex?: number | null,
  previewPos?: { x: number; y: number } | null,
): void {
  ctx.lineWidth = 1 * invZoom;
  ctx.font = `${8 * invZoom}px monospace`;
  ctx.textAlign = 'center';
  d.objects.forEach((obj, i) => {
    const isSel = selectedIndex != null && i === selectedIndex;
    const ox = isSel && previewPos ? previewPos.x : obj.x;
    const oy = isSel && previewPos ? previewPos.y : obj.y;
    if (obj.id === RING_OBJ_ID) {
      // Expand a ring group to its individual rings (S1 Ring_Main rule).
      ctx.fillStyle = RING_FILL;
      ctx.strokeStyle = RING_STROKE;
      for (const p of ringGroupPositions(obj.subtype, ox, oy)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = OBJECT_BOX_FILL;
      ctx.fillRect(ox - 8, oy - 8, 16, 16);
      ctx.strokeStyle = OBJECT_BOX_STROKE;
      ctx.strokeRect(ox - 8, oy - 8, 16, 16);
      ctx.fillStyle = OBJECT_LABEL;
      ctx.fillText(obj.id.toString(16).toUpperCase().padStart(2, '0'), ox, oy + 3 * invZoom);
    }
    if (isSel) {
      // Highlight ring around the marker anchor, drawn last so it sits on top.
      ctx.strokeStyle = OBJECT_SELECTED_STROKE;
      ctx.lineWidth = 2 * invZoom;
      ctx.strokeRect(ox - 11, oy - 11, 22, 22);
      ctx.lineWidth = 1 * invZoom;
    }
  });
}

/** Draw the player-spawn crosshair marker. */
export function drawStart(ctx: CanvasRenderingContext2D, d: LevelDoc, invZoom: number): void {
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
}
