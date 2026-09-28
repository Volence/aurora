// PIXELVIEWPORT'S OWN CHROME, ON ITS CANVAS'S PIXEL GRID (ROADMAP row 240 (a)).
//
// PixelViewport sizes its backing store in CSS px (no `devicePixelRatio`) and lets the
// browser upscale the bitmap `pixelated`, so the only pixel grid a stroke on it can reach
// is the backing store's own: scale 1. Row 239 (d) ruled the same for the composer's
// priority lens, which draws on this canvas (composer-priority-lens.ts passes `dpr: 1`).
// At a display dpr other than 1 no stroke here can be whole DEVICE pixels; that is the
// canvas's limit, not the rule's.
//
// The chrome is drawn in the doc frame, translated to the editable origin, and every
// stroke goes through the shared helpers at scale 1 with the origin added back in, so a
// stroke's edges are whole backing-store pixels wherever the origin falls:
//
//   - the grids (1 px) through `segmentsOnDeviceGrid`;
//   - the 1 px marquee overlays and the selection through `strokeCssRectOnDeviceGrid`;
//   - the 2 px outline overlays, which were INSET strokes (`x + 1`, `w - 2`), through
//     `strokeCssRectInsetOnDeviceGrid`;
//   - the gesture preview (1.5 px) through the same helpers.
//
// AT AN INTEGER ZOOM (every zoom the hosts give: artStore and spriteStore keep integers,
// `cappedZoom` floors) THE GRIDS, THE MARQUEES, THE SELECTION AND THE 2 px OUTLINES DRAW
// EXACTLY WHAT THEY DID: master's `+ 0.5` and `+ 1` / `- 2` were already the helpers'
// answers there. Only the preview changes: 1.5 px centred half a pixel inside the edge
// had both edges on quarter pixels, and is now 2 whole pixels centred ON the edge (the
// shared helpers' rule for an even width), or, for a slanted line, drawn where it was.

import {
  segmentsOnDeviceGrid, strokeCssRectOnDeviceGrid, strokeCssRectInsetOnDeviceGrid,
  type DeviceMapping,
} from '../../canvas/device-grid';
import type { Preview, Selection } from '../../../core/art/pixel-edit-controller';

/** The one scale a stroke on PixelViewport's CSS-sized backing store can be whole in. */
export const PIXEL_VIEWPORT_STORE_SCALE = 1;

/** Preview stroke width, CSS (= backing-store) px. */
export const PREVIEW_STROKE_PX = 1.5;

export interface ChromeFrame {
  ctx: CanvasRenderingContext2D;
  /** The editable origin the context is translated to, backing-store px. */
  originX: number;
  originY: number;
  zoom: number;
}

const S = PIXEL_VIEWPORT_STORE_SCALE;

/** The doc frame (translated to the origin) mapped to the backing store. */
function storeMapping(f: ChromeFrame): DeviceMapping {
  return { a: S, d: S, e: f.originX * S, f: f.originY * S };
}

/** Grid lines every `stepPx` doc pixels over a `width` x `height` doc, 1 px wide. */
export function drawGridLines(
  f: ChromeFrame, width: number, height: number, stepPx: number, style: string,
): void {
  const { zoom } = f;
  const path = segmentsOnDeviceGrid(f.ctx, S, storeMapping(f));
  path.strokeStyle = style;
  path.lineWidth = 1;
  for (let gx = 0; gx <= width; gx += stepPx) {
    path.beginPath(); path.moveTo(gx * zoom, 0); path.lineTo(gx * zoom, height * zoom); path.stroke();
  }
  for (let gy = 0; gy <= height; gy += stepPx) {
    path.beginPath(); path.moveTo(0, gy * zoom); path.lineTo(width * zoom, gy * zoom); path.stroke();
  }
}

/** Outline the doc-pixel rect (x, y, w, h) at `cssWidth`, centred on its edges. */
export function strokeDocRect(f: ChromeFrame, x: number, y: number, w: number, h: number, cssWidth: number): void {
  const { zoom } = f;
  strokeCssRectOnDeviceGrid(f.ctx, f.originX + x * zoom, f.originY + y * zoom, w * zoom, h * zoom, cssWidth, S);
}

/** Outline the INSIDE of the doc-pixel rect (x, y, w, h) at `cssWidth`. */
export function strokeDocRectInset(f: ChromeFrame, x: number, y: number, w: number, h: number, cssWidth: number): void {
  const { zoom } = f;
  strokeCssRectInsetOnDeviceGrid(f.ctx, f.originX + x * zoom, f.originY + y * zoom, w * zoom, h * zoom, cssWidth, S);
}

/**
 * The gesture preview. A line runs pixel centre to pixel centre, as it always did; its
 * axis-aligned case is snapped, a slanted one drawn where it was. A rect, marquee or move
 * outlines the doc-pixel rect it covers. The caller sets the colour; the dash for a
 * marquee or a move is set and cleared here, as it was.
 */
export function drawPreview(f: ChromeFrame, pv: Preview): void {
  const { ctx, zoom } = f;
  if (pv.kind === 'none') return;
  if (pv.kind === 'line') {
    const path = segmentsOnDeviceGrid(ctx, S, storeMapping(f));
    path.strokeStyle = ctx.strokeStyle as string;
    path.lineWidth = PREVIEW_STROKE_PX;
    path.beginPath();
    path.moveTo((pv.x0 + 0.5) * zoom, (pv.y0 + 0.5) * zoom);
    path.lineTo((pv.x1 + 0.5) * zoom, (pv.y1 + 0.5) * zoom);
    path.stroke();
  } else if (pv.kind === 'rect' || pv.kind === 'marquee') {
    const nx = Math.min(pv.x0, pv.x1), ny = Math.min(pv.y0, pv.y1);
    const nw = Math.abs(pv.x1 - pv.x0) + 1, nh = Math.abs(pv.y1 - pv.y0) + 1;
    if (pv.kind === 'marquee') ctx.setLineDash([4, 3]);
    strokeDocRect(f, nx, ny, nw, nh, PREVIEW_STROKE_PX);
    ctx.setLineDash([]);
  } else if (pv.kind === 'move') {
    ctx.setLineDash([4, 3]);
    strokeDocRect(f, pv.sel.x + pv.dx, pv.sel.y + pv.dy, pv.sel.w, pv.sel.h, PREVIEW_STROKE_PX);
    ctx.setLineDash([]);
  }
}

/** The selection marquee: 1 px, dashed [4, 3]. */
export function drawSelection(f: ChromeFrame, selection: Selection): void {
  f.ctx.setLineDash([4, 3]);
  strokeDocRect(f, selection.x, selection.y, selection.w, selection.h, 1);
  f.ctx.setLineDash([]);
}
