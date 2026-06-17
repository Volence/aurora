import React, { useEffect, useRef } from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { useArtStore } from '../../state/artStore';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { floodFill, drawLine } from '../../../core/art/pixel-ops';
import type { PixelBuffer } from '../../../core/art/pixel-ops';

/**
 * Sprite pixel canvas (chunk 1). Renders the active frame buffer scaled by zoom,
 * with a checkerboard under transparent (index 0) pixels and an 8px tile-cell grid.
 * Pencil/eraser drag-draws via pixel-ops drawLine; fill uses floodFill. Paint
 * color + palette line come from artStore (shared with the PaletteEditor picker).
 */
export default function SpriteCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buffer = useSpriteStore((s) => s.buffer);
  const zoom = useSpriteStore((s) => s.zoom);
  const tool = useSpriteStore((s) => s.tool);
  const selectedColor = useArtStore((s) => s.selectedColor);
  const paletteLine = useArtStore((s) => s.paletteLine);
  // Re-render when palette colors change.
  useArtStore((s) => s.paletteVersion);

  const zone = getCurrentZone(useProjectStore.getState());
  const colors = zone?.palette.lines[paletteLine]?.colors ?? [];

  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Paint the buffer to the canvas whenever it (or zoom/palette) changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height, data } = buffer;
    ctx.imageSmoothingEnabled = false;
    // checkerboard backdrop for transparency
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = data[y * width + x];
        if (idx === 0) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#33334a';
        } else {
          const c = colors[idx];
          ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : '#ff00ff';
        }
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }
    // 8px tile-cell grid
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= width; gx += 8) {
      ctx.beginPath(); ctx.moveTo(gx * zoom + 0.5, 0); ctx.lineTo(gx * zoom + 0.5, height * zoom); ctx.stroke();
    }
    for (let gy = 0; gy <= height; gy += 8) {
      ctx.beginPath(); ctx.moveTo(0, gy * zoom + 0.5); ctx.lineTo(width * zoom, gy * zoom + 0.5); ctx.stroke();
    }
  }, [buffer, zoom, colors]);

  function pixelAt(e: React.PointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);
    if (x < 0 || x >= buffer.width || y < 0 || y >= buffer.height) return null;
    return { x, y };
  }

  function applyStroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const value = tool === 'eraser' ? 0 : selectedColor;
    let next: PixelBuffer;
    if (tool === 'fill') {
      next = floodFill(buffer, to.x, to.y, value);
    } else {
      next = drawLine(buffer, from.x, from.y, to.x, to.y, value);
    }
    useSpriteStore.getState().setBuffer(next);
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = pixelAt(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = p;
    applyStroke(p, p);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current || tool === 'fill') return;
    const p = pixelAt(e);
    if (!p) return;
    const from = lastRef.current ?? p;
    applyStroke(from, p);
    lastRef.current = p;
  }

  function onPointerUp(e: React.PointerEvent) {
    drawingRef.current = false;
    lastRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  return (
    <canvas
      ref={canvasRef}
      width={buffer.width * zoom}
      height={buffer.height * zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ imageRendering: 'pixelated', cursor: 'crosshair', boxShadow: '0 0 0 1px #45475a' }}
    />
  );
}
