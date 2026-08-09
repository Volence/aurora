// Pure overlay-drawing functions for the classic (Sonic 1) level viewport.
//
// Extracted verbatim from ClassicLevelViewport.tsx (Task 14 pre-refactor) so the
// component stays a thin gesture/camera shell over drawing that is otherwise
// straight-line canvas code. These take an already-transformed 2D context (the
// caller has applied `scale(zoom); translate(-cam.x, -cam.y)`) plus the LevelDoc
// and the inverse zoom, and paint the collision / object / start overlays in
// world coordinates. They hold no state and touch no React — behaviour is
// identical to the inline versions they replaced.

import { chunkIndexForId, type LevelDoc } from '../../../core/level-classic/model';
import { columnSolidRun } from '../../../core/collision/collision-render';
import { objectFrameRect } from '../../../core/level-classic/object-sprite';
import type { ObjectSprite } from '../../state/classicObjectArtStore';
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

/**
 * Draw the collision overlay for one visible chunk at layout cell (col, row).
 * `chunkId` is the S1 engine id (1-based; $00 = air draws no collision).
 */
export function drawCollision(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  col: number,
  row: number,
  chunkId: number,
  showAngles: boolean,
): void {
  const index = chunkIndexForId(d, chunkId);
  if (index === null) return; // air / out-of-range → no collision to draw
  const chunk = d.chunks[index];
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

/** Blit an object sprite anchored at (ax, ay) with the object's flips. */
function drawSprite(ctx: CanvasRenderingContext2D, s: ObjectSprite, ax: number, ay: number, xflip: boolean, yflip: boolean): void {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.scale(xflip ? -1 : 1, yflip ? -1 : 1);
  // With the flip scale applied, drawing at (-origin) lands the object origin at
  // the anchor; a negative scale mirrors the frame about that anchor.
  ctx.drawImage(s.bitmap, -s.originX, -s.originY);
  ctx.restore();
}

/**
 * Draw all object placements: their real sprite where its art is linked/loaded
 * (`sprites.get(id)`), else the hex-box fallback. Ring groups ($25) expand to
 * individual rings, drawing the ring SPRITE at each position when loaded (else
 * the circle markers). Selection is a box sized to the drawn frame's bounds.
 *
 * `previewPos`, if given, overrides the selected object's centre only (the live
 * position during an in-progress drag, before the store commit lands on mouseup).
 */
export function drawObjects(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  invZoom: number,
  sprites: Map<number, ObjectSprite>,
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
    const sprite = sprites.get(obj.id) ?? null;
    // Selection box: sized to the drawn frame when a sprite is loaded, else the
    // legacy anchor box. Computed per-object so it tracks flips + frame size.
    let selRect = { left: ox - 11, top: oy - 11, width: 22, height: 22 };

    if (obj.id === RING_OBJ_ID) {
      const positions = ringGroupPositions(obj.subtype, ox, oy);
      if (sprite) {
        for (const p of positions) drawSprite(ctx, sprite, p.x, p.y, obj.xflip, obj.yflip);
        // Selection box spans the whole ring row/column footprint.
        const rects = positions.map((p) => objectFrameRect(sprite, p.x, p.y, obj.xflip, obj.yflip));
        const l = Math.min(...rects.map((r) => r.left));
        const t = Math.min(...rects.map((r) => r.top));
        const r2 = Math.max(...rects.map((r) => r.left + r.width));
        const b2 = Math.max(...rects.map((r) => r.top + r.height));
        selRect = { left: l, top: t, width: r2 - l, height: b2 - t };
      } else {
        ctx.fillStyle = RING_FILL;
        ctx.strokeStyle = RING_STROKE;
        for (const p of positions) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (sprite) {
      drawSprite(ctx, sprite, ox, oy, obj.xflip, obj.yflip);
      selRect = objectFrameRect(sprite, ox, oy, obj.xflip, obj.yflip);
    } else {
      ctx.fillStyle = OBJECT_BOX_FILL;
      ctx.fillRect(ox - 8, oy - 8, 16, 16);
      ctx.strokeStyle = OBJECT_BOX_STROKE;
      ctx.strokeRect(ox - 8, oy - 8, 16, 16);
      ctx.fillStyle = OBJECT_LABEL;
      ctx.fillText(obj.id.toString(16).toUpperCase().padStart(2, '0'), ox, oy + 3 * invZoom);
    }
    if (isSel) {
      // Highlight box around the drawn frame, drawn last so it sits on top.
      ctx.strokeStyle = OBJECT_SELECTED_STROKE;
      ctx.lineWidth = 2 * invZoom;
      const pad = 2 * invZoom;
      ctx.strokeRect(selRect.left - pad, selRect.top - pad, selRect.width + pad * 2, selRect.height + pad * 2);
      ctx.lineWidth = 1 * invZoom;
    }
  });
}

/**
 * Draw the player-spawn crosshair marker.
 *
 * `previewPos`, if given, overrides the spawn point's drawn position (the live
 * position during an in-progress start drag, before the store commit lands on
 * mouseup) — mirroring `drawObjects`' preview override.
 */
export function drawStart(
  ctx: CanvasRenderingContext2D,
  d: LevelDoc,
  invZoom: number,
  previewPos?: { x: number; y: number } | null,
): void {
  const { x, y } = previewPos ?? d.start;
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
