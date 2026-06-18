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
  checkerboard?: boolean;                 // sprite-style transparency background under index 0
  grids?: GridKind[];                     // grid line overlays
  tilePx?: number;                        // px per 'tile' grid line (default 8)
  blockPx?: number;                       // px per 'block' grid line (default 16)
}
export interface PixelViewportProps {
  buffer: PixelBuffer;                    // pixels to render (host-resolved)
  palette: (Color | undefined)[];         // index → color (index 0 = transparent)
  zoom: number;
  controller: PixelEditController;        // pointer input is routed to it
  selection?: Selection | null;           // committed selection (dashed)
  layers?: PixelViewportLayers;
  overlays?: ViewportOverlay[];           // host-supplied static overlays (e.g. piece outlines)
  drawOverlay?: (ctx: CanvasRenderingContext2D, zoom: number) => void; // escape hatch (e.g. collision HUD)
  onCommit: (result: GestureResult) => void;
  onPick?: (value: number) => void;
  style?: React.CSSProperties;
}

/**
 * Data-model-agnostic pixel canvas: renders a palette-indexed buffer at a zoom with
 * configurable layers (checkerboard, grids, overlays) and routes pointer input to a
 * PixelEditController. It knows nothing about docs, atlases, undo, or tiles — the host
 * provides the pixel buffer + overlays and applies the controller's results. Shared by
 * the level-art and sprite-art surfaces. See docs/specs/2026-06-18-unified-drawing-core-design.md.
 */
export default function PixelViewport({
  buffer, palette, zoom, controller, selection, layers, overlays, drawOverlay, onCommit, onPick, style,
}: PixelViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastValid = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // for pointer-up landing outside
  const [, force] = useState(0);   // bump to re-render during a gesture (controller is mutable)
  const rerender = () => force((n) => n + 1);

  const { width, height } = buffer;
  // During a gesture the working buffer shows the in-progress edit.
  const shown = (controller.isActive && controller.workingBuffer()) || buffer;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const data = shown.data;
    const checker = layers?.checkerboard ?? false;
    ctx.imageSmoothingEnabled = false;

    // pixels (+ checkerboard under transparency)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = data[y * width + x];
        if (idx === 0) {
          if (!checker) { ctx.clearRect(x * zoom, y * zoom, zoom, zoom); continue; }
          ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#33334a';
        } else {
          const c = palette[idx];
          ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : '#ff00ff';
        }
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }

    // grids
    const gridLines = (stepPx: number, alpha: number) => {
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= width; gx += stepPx) { ctx.beginPath(); ctx.moveTo(gx * zoom + 0.5, 0); ctx.lineTo(gx * zoom + 0.5, height * zoom); ctx.stroke(); }
      for (let gy = 0; gy <= height; gy += stepPx) { ctx.beginPath(); ctx.moveTo(0, gy * zoom + 0.5); ctx.lineTo(width * zoom, gy * zoom + 0.5); ctx.stroke(); }
    };
    for (const g of layers?.grids ?? []) {
      if (g === 'pixel' && zoom >= 8) gridLines(1, 0.06);
      else if (g === 'cell8') gridLines(8, 0.12);
      else if (g === 'tile') gridLines(layers?.tilePx ?? 8, 0.18);
      else if (g === 'block') gridLines(layers?.blockPx ?? 16, 0.22);
    }

    // host static overlays (e.g. piece outlines)
    for (const o of overlays ?? []) {
      ctx.strokeStyle = o.color ?? '#f9e2af';
      if (o.kind === 'marquee') { ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(o.x * zoom + 0.5, o.y * zoom + 0.5, o.w * zoom, o.h * zoom); ctx.setLineDash([]); }
      else { ctx.lineWidth = 2; ctx.strokeRect(o.x * zoom + 1, o.y * zoom + 1, o.w * zoom - 2, o.h * zoom - 2); }
    }

    // committed selection
    if (selection) {
      ctx.strokeStyle = '#94e2d5'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(selection.x * zoom + 0.5, selection.y * zoom + 0.5, selection.w * zoom, selection.h * zoom);
      ctx.setLineDash([]);
    }

    // live tool preview from the controller (line/rect/marquee/move geometry)
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
  });

  function localPixel(e: React.PointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return pixelAt(e.clientX - r.left, e.clientY - r.top, zoom, width, height);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return; // left only; middle/right reserved for pan/scroll
    const p = localPixel(e);
    if (!p) return;
    lastValid.current = p;
    const immediate = controller.begin(buffer, p.x, p.y, selection ?? null);
    if (immediate) { // instantaneous tool (fill/eyedropper) — no drag
      if (immediate.pick !== undefined) onPick?.(immediate.pick);
      else onCommit(immediate);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    rerender();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = localPixel(e);
    if (!p) return;
    lastValid.current = p;
    controller.move(p.x, p.y);
    rerender();
  }
  function onPointerUp(e: React.PointerEvent) {
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
      width={width * zoom}
      height={height * zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ imageRendering: 'pixelated', cursor: 'crosshair', boxShadow: '0 0 0 1px #45475a', display: 'block', ...style }}
    />
  );
}
