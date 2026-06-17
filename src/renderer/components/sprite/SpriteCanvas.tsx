import React, { useEffect, useRef, useState } from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { useArtStore } from '../../state/artStore';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { floodFill, drawLine, drawRect, ditherValue, mirrorPoints, isLCorner } from '../../../core/art/pixel-ops';
import type { PixelBuffer, MirrorMode } from '../../../core/art/pixel-ops';

/** A piece outline to overlay, in sprite-pixel coords. */
export interface OverlayRect { x: number; y: number; w: number; h: number; }

interface Pt { x: number; y: number; }
type Preview =
  | { kind: 'line' | 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'move'; dx: number; dy: number }
  | null;

function clone(b: PixelBuffer): PixelBuffer {
  return { width: b.width, height: b.height, data: new Uint8Array(b.data) };
}
function setPx(b: PixelBuffer, x: number, y: number, v: number) {
  if (x >= 0 && x < b.width && y >= 0 && y < b.height) b.data[y * b.width + x] = v;
}
function norm(x0: number, y0: number, x1: number, y1: number) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 };
}
/** Endpoint pairs for a mirrored line/rect — apply each symmetry to BOTH endpoints
 *  (NOT index-paired, which is unsound when dedup changes list length). */
function mirrorEndpointPairs(w: number, h: number, a: Pt, b: Pt, mode: MirrorMode | null): Array<{ a: Pt; b: Pt }> {
  if (!mode) return [{ a, b }];
  const fns: Array<(p: Pt) => Pt> = [(p) => p];
  if (mode === 'h' || mode === 'both') fns.push((p) => ({ x: w - 1 - p.x, y: p.y }));
  if (mode === 'v' || mode === 'both') fns.push((p) => ({ x: p.x, y: h - 1 - p.y }));
  if (mode === 'both') fns.push((p) => ({ x: w - 1 - p.x, y: h - 1 - p.y }));
  const out: Array<{ a: Pt; b: Pt }> = [];
  const seen = new Set<string>();
  for (const f of fns) {
    const aa = f(a), bb = f(b);
    const key = `${aa.x},${aa.y},${bb.x},${bb.y}`;
    if (!seen.has(key)) { seen.add(key); out.push({ a: aa, b: bb }); }
  }
  return out;
}

/**
 * Sprite pixel canvas with the full craft toolset (pencil/eraser/fill/eyedropper/
 * line/rect/select/dither), mirror + pixel-perfect, marquee select+move, and
 * scroll + zoom. Renders the active frame, a checkerboard under transparency, an
 * 8px cell grid, optional piece overlay, and live tool previews. Paint color +
 * palette line come from artStore (shared with PaletteEditor).
 */
export default function SpriteCanvas({ overlayRects }: { overlayRects?: OverlayRect[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buffer = useSpriteStore((s) => s.frames[s.currentIndex]);
  const zoom = useSpriteStore((s) => s.zoom);
  const tool = useSpriteStore((s) => s.tool);
  const mirror = useSpriteStore((s) => s.mirror);
  const pixelPerfect = useSpriteStore((s) => s.pixelPerfect);
  const ditherPattern = useSpriteStore((s) => s.ditherPattern);
  const ditherSecondary = useSpriteStore((s) => s.ditherSecondary);
  const selection = useSpriteStore((s) => s.selection);
  const selectedColor = useArtStore((s) => s.selectedColor);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion);
  const override = useSpriteStore((s) => s.paletteOverride);

  const zone = getCurrentZone(useProjectStore.getState());
  const colors = override ?? zone?.palette.lines[paletteLine]?.colors ?? [];

  const drawing = useRef(false);
  const snapshot = useRef<PixelBuffer | null>(null);
  const path = useRef<Pt[]>([]);
  const start = useRef<Pt | null>(null);
  const moveRegion = useRef<{ data: Uint8Array; w: number; h: number; ox: number; oy: number } | null>(null);
  const [preview, setPreview] = useState<Preview>(null);

  // ---- render ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height, data } = buffer;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = data[y * width + x];
        if (idx === 0) ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#33334a';
        else { const c = colors[idx]; ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : '#ff00ff'; }
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    }
    // 8px cell grid
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= width; gx += 8) { ctx.beginPath(); ctx.moveTo(gx * zoom + 0.5, 0); ctx.lineTo(gx * zoom + 0.5, height * zoom); ctx.stroke(); }
    for (let gy = 0; gy <= height; gy += 8) { ctx.beginPath(); ctx.moveTo(0, gy * zoom + 0.5); ctx.lineTo(width * zoom, gy * zoom + 0.5); ctx.stroke(); }
    // piece overlay
    if (overlayRects?.length) {
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
      for (const r of overlayRects) ctx.strokeRect(r.x * zoom + 1, r.y * zoom + 1, r.w * zoom - 2, r.h * zoom - 2);
    }
    // committed selection
    if (selection) {
      ctx.strokeStyle = '#94e2d5'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(selection.x * zoom + 0.5, selection.y * zoom + 0.5, selection.w * zoom, selection.h * zoom);
      ctx.setLineDash([]);
    }
    // live preview
    if (preview) {
      ctx.strokeStyle = '#f5c2e7'; ctx.lineWidth = 1.5;
      if (preview.kind === 'line') { ctx.beginPath(); ctx.moveTo((preview.x0 + 0.5) * zoom, (preview.y0 + 0.5) * zoom); ctx.lineTo((preview.x1 + 0.5) * zoom, (preview.y1 + 0.5) * zoom); ctx.stroke(); }
      else if (preview.kind === 'rect' || preview.kind === 'marquee') {
        const n = norm(preview.x0, preview.y0, preview.x1, preview.y1);
        if (preview.kind === 'marquee') ctx.setLineDash([4, 3]);
        ctx.strokeRect(n.x * zoom + 0.5, n.y * zoom + 0.5, n.w * zoom, n.h * zoom);
        ctx.setLineDash([]);
      } else if (preview.kind === 'move' && selection) {
        ctx.setLineDash([4, 3]);
        ctx.strokeRect((selection.x + preview.dx) * zoom + 0.5, (selection.y + preview.dy) * zoom + 0.5, selection.w * zoom, selection.h * zoom);
        ctx.setLineDash([]);
      }
    }
  }, [buffer, zoom, colors, overlayRects, selection, preview]);

  function pixelAt(e: React.PointerEvent): Pt | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / zoom);
    const y = Math.floor((e.clientY - r.top) / zoom);
    if (x < 0 || x >= buffer.width || y < 0 || y >= buffer.height) return null;
    return { x, y };
  }

  function paintValue(x: number, y: number): number {
    if (tool === 'eraser') return 0;
    if (tool === 'dither') return ditherValue(ditherPattern, x, y, selectedColor, ditherSecondary);
    return selectedColor;
  }

  /** Rebuild the working buffer from the snapshot + the (pixel-perfect-filtered) path. */
  function renderStroke() {
    const snap = snapshot.current;
    if (!snap) return;
    const buf = clone(snap);
    for (const p of path.current) {
      const v = paintValue(p.x, p.y);
      for (const m of mirror ? mirrorPoints(buf.width, buf.height, p.x, p.y, mirror) : [p]) setPx(buf, m.x, m.y, v);
    }
    useSpriteStore.getState().setBuffer(buf);
  }

  function pushPathPoint(p: Pt) {
    const pts = path.current;
    const last = pts[pts.length - 1];
    if (last) {
      // interpolate (Bresenham) between samples so fast drags stay connected
      let x0 = last.x, y0 = last.y; const x1 = p.x, y1 = p.y;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        if (!(x0 === last.x && y0 === last.y)) addPoint({ x: x0, y: y0 });
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    } else {
      addPoint(p);
    }
  }
  function addPoint(p: Pt) {
    const pts = path.current;
    const last = pts[pts.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    pts.push(p);
    // pixel-perfect: drop the middle of an L-corner
    if (pixelPerfect && pts.length >= 3 && isLCorner(pts[pts.length - 3], pts[pts.length - 2], pts[pts.length - 1])) {
      pts.splice(pts.length - 2, 1);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return; // left only; let middle/right pan/scroll
    const p = pixelAt(e);
    if (!p) return;
    const st = useSpriteStore.getState();

    // Instantaneous tools: no drag, so don't capture the pointer.
    if (tool === 'eyedropper') {
      useArtStore.getState().setSelectedColor(buffer.data[p.y * buffer.width + p.x]);
      return;
    }
    if (tool === 'fill') {
      st.setBuffer(floodFill(buffer, p.x, p.y, paintValue(p.x, p.y)));
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;

    if (tool === 'line' || tool === 'rect') {
      snapshot.current = clone(buffer); start.current = p; setPreview({ kind: tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    if (tool === 'select') {
      if (selection && p.x >= selection.x && p.x < selection.x + selection.w && p.y >= selection.y && p.y < selection.y + selection.h) {
        // start moving the selection: cut its pixels
        const reg = new Uint8Array(selection.w * selection.h);
        const snap = clone(buffer);
        for (let yy = 0; yy < selection.h; yy++) for (let xx = 0; xx < selection.w; xx++) {
          reg[yy * selection.w + xx] = buffer.data[(selection.y + yy) * buffer.width + (selection.x + xx)];
          setPx(snap, selection.x + xx, selection.y + yy, 0); // clear original
        }
        moveRegion.current = { data: reg, w: selection.w, h: selection.h, ox: p.x, oy: p.y };
        snapshot.current = snap;
        setPreview({ kind: 'move', dx: 0, dy: 0 });
      } else {
        start.current = p; setPreview({ kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }
      return;
    }
    // pencil / eraser / dither
    snapshot.current = clone(buffer); path.current = []; pushPathPoint(p); renderStroke();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = pixelAt(e);
    if (!p) return;
    const s = start.current;
    if (tool === 'line' || tool === 'rect') { if (s) setPreview({ kind: tool, x0: s.x, y0: s.y, x1: p.x, y1: p.y }); return; }
    if (tool === 'select') {
      const mv = moveRegion.current;
      if (mv) setPreview({ kind: 'move', dx: p.x - mv.ox, dy: p.y - mv.oy });
      else if (s) setPreview({ kind: 'marquee', x0: s.x, y0: s.y, x1: p.x, y1: p.y });
      return;
    }
    pushPathPoint(p); renderStroke();
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drawing.current) return;
    drawing.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = pixelAt(e) ?? start.current;
    const st = useSpriteStore.getState();

    if ((tool === 'line' || tool === 'rect') && snapshot.current && start.current && p) {
      let buf = snapshot.current;
      for (const { a, b } of mirrorEndpointPairs(buf.width, buf.height, start.current, p, mirror)) {
        buf = tool === 'line' ? drawLine(buf, a.x, a.y, b.x, b.y, selectedColor)
          : drawRect(buf, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 1, Math.abs(b.y - a.y) + 1, selectedColor, true);
      }
      st.setBuffer(buf);
    } else if (tool === 'select') {
      const mv = moveRegion.current;
      if (mv && snapshot.current && p) {
        const dx = p.x - mv.ox, dy = p.y - mv.oy;
        const buf = clone(snapshot.current);
        for (let yy = 0; yy < mv.h; yy++) for (let xx = 0; xx < mv.w; xx++) {
          const v = mv.data[yy * mv.w + xx]; if (v !== 0) setPx(buf, selection!.x + dx + xx, selection!.y + dy + yy, v);
        }
        st.setBuffer(buf);
        st.setSelection({ x: selection!.x + dx, y: selection!.y + dy, w: mv.w, h: mv.h });
        moveRegion.current = null;
      } else if (start.current && p) {
        const n = norm(start.current.x, start.current.y, p.x, p.y);
        st.setSelection(n.w > 1 || n.h > 1 ? n : null);
      }
    }
    snapshot.current = null; path.current = []; start.current = null; moveRegion.current = null; setPreview(null);
  }

  return (
    <canvas
      ref={canvasRef}
      width={buffer.width * zoom}
      height={buffer.height * zoom}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ imageRendering: 'pixelated', cursor: 'crosshair', boxShadow: '0 0 0 1px #45475a', display: 'block' }}
    />
  );
}
