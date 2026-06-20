// src/core/collision/collision-shape-draw.ts
import type { CollisionProfile, Solidity } from './collision-model';
import { angleDegrees } from './collision-model';
import { columnSolidRun } from './collision-render';

export type Edge = 'top' | 'right' | 'bottom' | 'left';

/** Which box edges a solidity class "stops" — the edges to highlight as solid.
 *  'top' stops only the top; 'sides-bottom' the left/right/bottom; 'all' every
 *  edge; 'none' nothing. */
export function solidEdges(solidity: Solidity): Edge[] {
  switch (solidity) {
    case 'top': return ['top'];
    case 'sides-bottom': return ['left', 'right', 'bottom'];
    case 'all': return ['top', 'right', 'bottom', 'left'];
    default: return [];
  }
}

/** Endpoints of an angle needle of half-length L centred at (cx, cy), drawn at
 *  `deg` degrees. Screen-space: +x right, +y DOWN, so the y component is negated
 *  so that 90° points up. The midpoint is always (cx, cy). */
export function needleEndpoints(deg: number, cx: number, cy: number, L: number) {
  const r = (deg * Math.PI) / 180, dx = Math.cos(r) * L, dy = -Math.sin(r) * L;
  return { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy };
}

/** Visual options for drawCollisionShape. */
export interface ShapeDrawOpts {
  fill: string;
  line: string;
  solidEdge: string;
  needle: string;
  showSolidEdges?: boolean;
  showNeedle?: boolean;
}

/** Minimal structural canvas context — just what we draw with, so this module
 *  needs no DOM lib and stays testable/GUI-verifiable. */
export interface ShapeDrawCtx {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
}

/** Draw one collision profile into a size×size box at (x, y):
 *  - the solid silhouette (one filled rect per 16px-cell column, via columnSolidRun),
 *  - a surface line tracing the column tops,
 *  - the solid-side edges (per solidEdges) when showSolidEdges,
 *  - the angle needle (centred, L≈size*0.32) when the profile hasAngle && showNeedle.
 *  GUI-verified, not unit-tested. */
export function drawCollisionShape(
  ctx: ShapeDrawCtx,
  x: number, y: number, size: number,
  profile: CollisionProfile, opts: ShapeDrawOpts,
): void {
  const colW = size / 16;
  const heights = profile.heights;

  // Each column's solid run, computed once (reused by silhouette + surface line).
  const runs = Array.from({ length: 16 }, (_, c) => columnSolidRun(heights[c] ?? 0));

  // 1) Silhouette — one rect per column. columnSolidRun gives the run in
  //    cell-local pixels (0..16); scale to the box.
  ctx.fillStyle = opts.fill;
  for (let c = 0; c < 16; c++) {
    const run = runs[c];
    if (!run) continue;
    const px = x + c * colW;
    const py = y + (run.y / 16) * size;
    const ph = (run.h / 16) * size;
    ctx.fillRect(px, py, colW, ph);
  }

  // 2) Surface line tracing the PLAYER-FACING boundary of each column — the top
  //    of a floor run (height >= 0), the underside of a hanging/ceiling run
  //    (height < 0) — so ceiling/overhang shapes read as a contour hugging the
  //    silhouette instead of a flat line across the box top.
  ctx.strokeStyle = opts.line;
  ctx.lineWidth = Math.max(1, (size / 16) * 1.0);
  ctx.beginPath();
  let penDown = false;
  for (let c = 0; c < 16; c++) {
    const run = runs[c];
    const px = x + (c + 0.5) * colW;
    if (!run) { penDown = false; continue; }
    const surfaceY = (heights[c] ?? 0) >= 0 ? run.y : run.y + run.h;
    const py = y + (surfaceY / 16) * size;
    if (penDown) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    penDown = true;
  }
  ctx.stroke();

  // 3) Solid-side edges.
  if (opts.showSolidEdges) {
    const edges = solidEdges(profile.solidity);
    if (edges.length) {
      ctx.strokeStyle = opts.solidEdge;
      ctx.lineWidth = Math.max(1, (size / 16) * 1.5);
      const x0 = x, y0 = y, x1 = x + size, y1 = y + size;
      ctx.beginPath();
      for (const e of edges) {
        switch (e) {
          case 'top':    ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); break;
          case 'right':  ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); break;
          case 'bottom': ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); break;
          case 'left':   ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); break;
        }
      }
      ctx.stroke();
    }
  }

  // 4) Angle needle, centred in the box.
  if (opts.showNeedle && profile.hasAngle) {
    const deg = angleDegrees(profile);
    if (deg !== null) {
      const cx = x + size / 2, cy = y + size / 2, L = size * 0.32;
      // The engine angle is clockwise in screen space (y down): a small positive
      // angle means the surface DESCENDS to the right. needleEndpoints uses the
      // math (CCW) convention, so negate the angle so the needle lies ALONG the
      // silhouette's actual slope instead of mirroring it.
      const { x1, y1, x2, y2 } = needleEndpoints(-deg, cx, cy, L);
      ctx.strokeStyle = opts.needle;
      ctx.lineWidth = Math.max(1, (size / 16) * 1.5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
}
