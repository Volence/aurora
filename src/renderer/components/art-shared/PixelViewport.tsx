import React, { useEffect, useRef, useState } from 'react';
import { pixelAt } from '../../../core/art/viewport-coords';
import type { PixelEditController, GestureResult, Selection } from '../../../core/art/pixel-edit-controller';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Color } from '../../../core/model/s4-types';

export type GridKind = 'pixel' | 'cell8' | 'tile' | 'block';
export interface ViewportOverlay {
  kind: 'outline' | 'marquee';
  x: number; y: number; w: number; h: number; // pixel coords
  color?: string;
}
export interface PixelViewportLayers {
  checkerboard?: boolean;                 // draw a checkerboard under transparent (index 0) pixels
  checkerScale?: number;                  // checker square size in px (1 = sprite, 2 = level art)
  checkerColors?: [[number, number, number], [number, number, number]]; // [A, B] RGB
  grids?: GridKind[];
  tilePx?: number;                        // px per 'tile' grid line (default 8)
  blockPx?: number;                       // px per 'block' grid line (default 16)
  repeat?: { tilesX: number; tilesY: number } | null; // seamless tiling preview (editable = center tile)
}
export interface HostPointer {
  down(pixel: { x: number; y: number }, e: React.PointerEvent): void;
  move(pixel: { x: number; y: number }, e: React.PointerEvent): void;
  up(pixel: { x: number; y: number } | null, e: React.PointerEvent): void;
}
export interface PixelViewportProps {
  buffer: PixelBuffer;                    // editable pixel indices (host-resolved)
  palette: (Color | undefined)[];         // single-line palette (index 0 transparent)
  paletteLines?: (Color | undefined)[][]; // multi-line palette (level art) — used with lineMap
  lineMap?: Uint8Array;                   // per-pixel palette-line index (level art)
  zoom: number;
  controller: PixelEditController;        // pointer input is routed here (pixel tools)
  selection?: Selection | null;           // committed selection (dashed)
  layers?: PixelViewportLayers;
  overlays?: ViewportOverlay[];           // host-supplied static overlays (e.g. piece outlines)
  drawOverlay?: (ctx: CanvasRenderingContext2D, zoom: number) => void; // escape hatch (e.g. collision HUD), origin-translated
  hostPointer?: HostPointer | null;       // when set, pointer routes here instead of the controller (tile-space tools)
  onCommit: (result: GestureResult) => void;
  onPick?: (value: number) => void;
  style?: React.CSSProperties;
}

const SPRITE_CHECKER: [[number, number, number], [number, number, number]] = [[42, 42, 58], [51, 51, 74]];

/**
 * Data-model-agnostic pixel canvas: renders a palette-indexed buffer at a zoom with
 * configurable layers (checkerboard, grids, repeat-tiling, overlays) and routes pointer
 * input to a PixelEditController — or to a host hook for non-pixel (tile-space) tools.
 * Supports per-pixel palette lines (level art's multi-palette cells) and seamless repeat
 * preview. Shared by the level-art and sprite-art surfaces. It knows nothing about docs,
 * atlases, undo, or tiles — the host provides pixels + overlays and applies results.
 * See docs/specs/2026-06-18-unified-drawing-core-design.md.
 */
export default function PixelViewport({
  buffer, palette, paletteLines, lineMap, zoom, controller, selection, layers, overlays, drawOverlay, hostPointer, onCommit, onPick, style,
}: PixelViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hostDrawing = useRef(false);
  const lastValid = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const { width, height } = buffer;
  const repeat = layers?.repeat ?? null;
  const tilesX = repeat ? repeat.tilesX : 1;
  const tilesY = repeat ? repeat.tilesY : 1;
  const originX = repeat ? Math.floor(tilesX / 2) * width * zoom : 0;
  const originY = repeat ? Math.floor(tilesY / 2) * height * zoom : 0;
  // During a stroke the controller's working buffer shows the in-progress edit.
  const shown = (controller.isActive && controller.workingBuffer()) || buffer;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const data = shown.data;
    const useLines = !!(paletteLines && lineMap);
    const checker = layers?.checkerboard ?? false;
    const scale = layers?.checkerScale ?? 1;
    const [cA, cB] = layers?.checkerColors ?? SPRITE_CHECKER;

    // Compose the buffer at native resolution into an offscreen image.
    const off = new OffscreenCanvas(width, height);
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const v = data[i];
      let r: number, g: number, b: number;
      if (v === 0) {
        if (!checker) { img.data[i * 4 + 3] = 0; continue; } // fully transparent
        const x = i % width, y = (i / width) | 0;
        const lt = (((x / scale) | 0) + ((y / scale) | 0)) % 2 === 0;
        [r, g, b] = lt ? cA : cB;
      } else {
        const c = useLines ? paletteLines![lineMap![i]]?.[v] : palette[v];
        if (c) { r = c.r; g = c.g; b = c.b; } else { r = 255; g = 0; b = 255; }
      }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = false;
    const cw = tilesX * width * zoom, ch = tilesY * height * zoom;
    ctx.clearRect(0, 0, cw, ch);
    if (repeat) {
      ctx.fillStyle = '#11111b'; ctx.fillRect(0, 0, cw, ch);
      // faint surrounding copies, then the editable center at full opacity
      ctx.globalAlpha = 1 / 3;
      for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
        if (tx === ((tilesX / 2) | 0) && ty === ((tilesY / 2) | 0)) continue;
        ctx.drawImage(off, tx * width * zoom, ty * height * zoom, width * zoom, height * zoom);
      }
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(off, originX, originY, width * zoom, height * zoom);

    // doc-space overlays drawn at the editable origin
    ctx.save();
    ctx.translate(originX, originY);

    const gridLines = (stepPx: number, alpha: number) => {
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 1;
      for (let gx = 0; gx <= width; gx += stepPx) { ctx.beginPath(); ctx.moveTo(gx * zoom + 0.5, 0); ctx.lineTo(gx * zoom + 0.5, height * zoom); ctx.stroke(); }
      for (let gy = 0; gy <= height; gy += stepPx) { ctx.beginPath(); ctx.moveTo(0, gy * zoom + 0.5); ctx.lineTo(width * zoom, gy * zoom + 0.5); ctx.stroke(); }
    };
    for (const gk of layers?.grids ?? []) {
      if (gk === 'pixel' && zoom >= 8) gridLines(1, 0.06);
      else if (gk === 'cell8') gridLines(8, 0.12);
      else if (gk === 'tile') gridLines(layers?.tilePx ?? 8, 0.18);
      else if (gk === 'block') gridLines(layers?.blockPx ?? 16, 0.22);
    }
    for (const o of overlays ?? []) {
      ctx.strokeStyle = o.color ?? '#f9e2af';
      if (o.kind === 'marquee') { ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(o.x * zoom + 0.5, o.y * zoom + 0.5, o.w * zoom, o.h * zoom); ctx.setLineDash([]); }
      else { ctx.lineWidth = 2; ctx.strokeRect(o.x * zoom + 1, o.y * zoom + 1, o.w * zoom - 2, o.h * zoom - 2); }
    }
    if (selection) {
      ctx.strokeStyle = '#94e2d5'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(selection.x * zoom + 0.5, selection.y * zoom + 0.5, selection.w * zoom, selection.h * zoom);
      ctx.setLineDash([]);
    }
    const pv = controller.preview();
    if (pv.kind !== 'none') {
      ctx.strokeStyle = '#f5c2e7'; ctx.lineWidth = 1.5;
      if (pv.kind === 'line') { ctx.beginPath(); ctx.moveTo((pv.x0 + 0.5) * zoom, (pv.y0 + 0.5) * zoom); ctx.lineTo((pv.x1 + 0.5) * zoom, (pv.y1 + 0.5) * zoom); ctx.stroke(); }
      else if (pv.kind === 'rect' || pv.kind === 'marquee') {
        const nx = Math.min(pv.x0, pv.x1), ny = Math.min(pv.y0, pv.y1), nw = Math.abs(pv.x1 - pv.x0) + 1, nh = Math.abs(pv.y1 - pv.y0) + 1;
        if (pv.kind === 'marquee') ctx.setLineDash([4, 3]);
        ctx.strokeRect(nx * zoom + 0.5, ny * zoom + 0.5, nw * zoom, nh * zoom);
        ctx.setLineDash([]);
      } else if (pv.kind === 'move') {
        ctx.setLineDash([4, 3]);
        ctx.strokeRect((pv.sel.x + pv.dx) * zoom + 0.5, (pv.sel.y + pv.dy) * zoom + 0.5, pv.sel.w * zoom, pv.sel.h * zoom);
        ctx.setLineDash([]);
      }
    }
    drawOverlay?.(ctx, zoom);
    ctx.restore();
  });

  function localPixel(e: React.PointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return pixelAt(e.clientX - r.left, e.clientY - r.top, zoom, width, height, repeat ?? undefined);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const p = localPixel(e);
    if (!p) return;
    lastValid.current = p;
    if (hostPointer) {
      e.currentTarget.setPointerCapture(e.pointerId);
      hostDrawing.current = true;
      hostPointer.down(p, e);
      rerender();
      return;
    }
    const immediate = controller.begin(buffer, p.x, p.y, selection ?? null);
    if (immediate) {
      if (immediate.pick !== undefined) onPick?.(immediate.pick);
      else onCommit(immediate);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    rerender();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (hostDrawing.current && hostPointer) { const p = localPixel(e); if (p) { lastValid.current = p; hostPointer.move(p, e); rerender(); } return; }
    if (!drawing.current) return;
    const p = localPixel(e);
    if (!p) return;
    lastValid.current = p;
    controller.move(p.x, p.y);
    rerender();
  }
  function onPointerUp(e: React.PointerEvent) {
    if (hostDrawing.current) { hostDrawing.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ } hostPointer?.up(localPixel(e), e); rerender(); return; }
    if (!drawing.current) return;
    drawing.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const last = localPixel(e) ?? lastValid.current;
    onCommit(controller.end(last.x, last.y));
    rerender();
  }

  return (
    <canvas
      ref={canvasRef}
      width={tilesX * width * zoom}
      height={tilesY * height * zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ imageRendering: 'pixelated', cursor: 'crosshair', boxShadow: '0 0 0 1px #45475a', display: 'block', ...style }}
    />
  );
}
