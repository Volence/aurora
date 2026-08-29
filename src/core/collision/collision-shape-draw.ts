// src/core/collision/collision-shape-draw.ts
import type { CollisionProfile, Solidity } from './collision-model';
import { columnSolidRun } from './collision-render';
import { angleMark, drawAngleMark } from './collision-angle-mark';

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

// `needleEndpoints` USED TO LIVE HERE and is deliberately deleted rather than
// left unused. It was a THIRD angle convention (degrees, CCW, negated at every
// call site to undo itself) sitting beside the map overlays' two — and a spare
// convention in the tree is how the picker and the map came to disagree in the
// first place. Angle direction now has exactly one home:
// collision-angle-mark.ts's `angleTangent`, cross-checked against classic's
// `angleNeedle` over all 256 bytes.

/**
 * Visual options for drawCollisionShape.
 *
 * ⚠ THE CALLER OWNS THE STROKE WIDTHS, AND THAT IS THE WHOLE POINT.
 *
 * These widths used to be derived here from `size` as `(size / 16) * k`, which
 * is right for a picker thumbnail — an UNSCALED context where one unit is one
 * screen pixel, and where a 120px preview should look like a scaled-up 22px
 * thumbnail. It is badly wrong for the paint ghost, which draws at `size = 16`
 * into a context already scaled by `zoom`: at zoom 8 a "1.25" came out as TEN
 * screen pixels, and the ghost's angle mark rendered as a blob eight times
 * heavier than the identical mark the map overlay drew in the next cell.
 *
 * Caught by looking at the running app, not by a test — the geometry was right
 * and only the weight was wrong, so every assertion about position passed.
 *
 * So the space is now each call site's explicit decision: the picker passes
 * size-proportional widths, the ghost passes `k / zoom` — the same numbers the
 * map overlay uses — and the two finally match on screen.
 */
export interface ShapeDrawOpts {
  fill: string;
  line: string;
  solidEdge: string;
  /** Bright core of the angle mark. */
  needle: string;
  /** Casing stroked under the angle mark so it reads over arbitrary art. */
  needleCasing: string;
  /** Surface-line stroke width, in the caller's units. */
  lineWidth: number;
  /** Solid-edge stroke width, in the caller's units. */
  solidEdgeWidth: number;
  /** Angle-mark core stroke width, in the caller's units. */
  markCoreWidth: number;
  /** Angle-mark casing stroke width, in the caller's units. Must exceed core. */
  markCasingWidth: number;
  /**
   * How many SCREEN px this caller's 16px collision cell occupies — the picker
   * passes its box size, the paint ghost passes `16 * zoom`.
   *
   * The call site states its BUDGET; `collision-angle-mark.markTier` decides
   * what that budget can carry. A thumbnail and a 120px preview are genuinely
   * different pictures of the same mark, and the difference is one rule in one
   * module rather than an `if (size < …)` at each surface.
   */
  cellScreenPx: number;
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
 *  - the angle mark (a dominant outward stem from the surface, plus a fine
 *    tangent bar at the detail tier, cased) when the profile hasAngle &&
 *    showNeedle — see collision-angle-mark.ts.
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
  ctx.lineWidth = opts.lineWidth;
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
      ctx.lineWidth = opts.solidEdgeWidth;
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

  // 4) The angle mark — a dominant outward stem rooted ON the surface, with a
  //    fine tangent bar beside it wherever the size can carry one.
  //
  // This used to be a centred, symmetric needle sized at `size * 0.32` and
  // routed through `angleDegrees` (which rounds to whole degrees). All three of
  // those are gone, and each for its own reason:
  //   • CENTRED     — it floated at the box middle instead of the edge it
  //                   describes. `angleMark` anchors on the surface.
  //   • SYMMETRIC   — it could not distinguish a floor from the ceiling at the
  //                   same angle. The outward stem can.
  //   • ROUNDED     — whole degrees drifted the thumbnail off the map's own
  //                   direction by up to half a degree. `angleMark` works in
  //                   angle BYTES.
  // See collision-angle-mark.ts for the full account.
  if (opts.showNeedle) {
    const mark = angleMark(profile);
    if (mark) {
      drawAngleMark(ctx, x, y, size, mark, {
        color: opts.needle,
        casing: opts.needleCasing,
        coreWidth: opts.markCoreWidth,
        casingWidth: opts.markCasingWidth,
        cellScreenPx: opts.cellScreenPx,
      });
    }
  }
}
