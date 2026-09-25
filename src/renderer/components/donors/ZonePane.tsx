// One zoomable, pannable view of a section grid: the donor zone above, the
// target clip act below. Both are pictures made of per-section bitmaps.
//
// GESTURES. Wheel zooms about the cursor; a right- or middle-button drag pans;
// a left-button drag is the pane's own gesture (the marquee on the donor pane)
// and a left click without a drag is its click (placing the paste on the target
// pane). A left drag shorter than DRAG_SLOP_PX is a click, so a hand that
// shakes on a click does not draw a one-cell marquee.
//
// A published paint report (`lastZonePaneReport`) carries the view transform,
// the canvas rect and dpr, so a CDP harness can aim integer client pixels at
// world points and derive back what it hit, rather than trusting its own math.

import React from 'react';
import { T } from '../ui/theme';
import type { PxRect } from '../../../core/formats/donors/donor-tree';
import {
  DONOR_CROP_EDGE, DONOR_CROP_SHADE, DONOR_MARK, DONOR_MARK_FAINT, DONOR_MARK_FAINT_FILL, DONOR_MARK_FILL,
  DONOR_MARK_WARN, DONOR_WORLD_EDGE,
} from '../../canvas/canvas-colors';

export interface PaneBitmap { x: number; y: number; size: number; bitmap: ImageBitmap }

export interface PaneView { scale: number; ox: number; oy: number }

export interface ZonePaneReport {
  pane: string;
  view: PaneView;
  rect: { left: number; top: number; width: number; height: number };
  dpr: number;
  bitmaps: number;
  worldW: number;
  worldH: number;
  paints: number;
}

const reports = new Map<string, ZonePaneReport>();
/** The last paint of the named pane, for the debug hooks. */
export function lastZonePaneReport(pane: string): ZonePaneReport | null {
  return reports.get(pane) ?? null;
}

const DRAG_SLOP_PX = 4;
const MIN_SCALE = 1 / 64;
const MAX_SCALE = 8;

export interface ZonePaneProps {
  pane: string;
  worldW: number;
  worldH: number;
  bitmaps: readonly PaneBitmap[];
  /** Rectangle whose OUTSIDE is dimmed (the donor crop). */
  crop?: PxRect | null;
  /** Rectangles outlined in the accent colour (marquee, pasted clips). */
  outlines?: ReadonlyArray<{ rect: PxRect; label?: string; tone?: 'accent' | 'warning' | 'faint' }>;
  /** The rectangle a view should fit on first show; defaults to the whole world. */
  fitTo?: PxRect | null;
  onDrag?: (a: { x: number; y: number }, b: { x: number; y: number }, done: boolean) => void;
  onClickWorld?: (p: { x: number; y: number }) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

function fitView(w: number, h: number, r: PxRect): PaneView {
  const margin = 16;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE,
    Math.min((w - margin * 2) / r.w, (h - margin * 2) / r.h)));
  return { scale, ox: r.x - (w / scale - r.w) / 2, oy: r.y - (h / scale - r.h) / 2 };
}

export default function ZonePane(props: ZonePaneProps): React.ReactElement {
  const { pane, worldW, worldH, bitmaps, crop, outlines, fitTo, onDrag, onClickWorld, children, style } = props;
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const viewRef = React.useRef<PaneView | null>(null);
  const sizeRef = React.useRef({ w: 0, h: 0 });
  const paintsRef = React.useRef(0);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const fitKey = fitTo ? `${fitTo.x},${fitTo.y},${fitTo.w},${fitTo.h}` : `${worldW}x${worldH}`;

  const paint = React.useCallback(() => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas || !view) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const sx = (x: number) => (x - view.ox) * view.scale;
    const sy = (y: number) => (y - view.oy) * view.scale;
    for (const b of bitmaps) {
      ctx.drawImage(b.bitmap, sx(b.x), sy(b.y), b.size * view.scale, b.size * view.scale);
    }
    if (crop) {
      ctx.fillStyle = DONOR_CROP_SHADE;
      const cx0 = sx(crop.x); const cy0 = sy(crop.y);
      const cx1 = sx(crop.x + crop.w); const cy1 = sy(crop.y + crop.h);
      ctx.fillRect(0, 0, w, Math.max(0, cy0));
      ctx.fillRect(0, cy1, w, Math.max(0, h - cy1));
      ctx.fillRect(0, cy0, Math.max(0, cx0), cy1 - cy0);
      ctx.fillRect(cx1, cy0, Math.max(0, w - cx1), cy1 - cy0);
      ctx.strokeStyle = DONOR_CROP_EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx0 + 0.5, cy0 + 0.5, cx1 - cx0 - 1, cy1 - cy0 - 1);
    }
    // The world's own edge, so an empty act still reads as a place.
    ctx.strokeStyle = DONOR_WORLD_EDGE;
    ctx.strokeRect(sx(0) + 0.5, sy(0) + 0.5, worldW * view.scale - 1, worldH * view.scale - 1);
    for (const o of outlines ?? []) {
      const col = o.tone === 'warning' ? DONOR_MARK_WARN : o.tone === 'faint' ? DONOR_MARK_FAINT : DONOR_MARK;
      const x = sx(o.rect.x); const y = sy(o.rect.y);
      const rw = o.rect.w * view.scale; const rh = o.rect.h * view.scale;
      ctx.fillStyle = o.tone === 'faint' ? DONOR_MARK_FAINT_FILL : DONOR_MARK_FILL;
      ctx.fillRect(x, y, rw, rh);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));
      if (o.label) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = col;
        ctx.fillText(o.label, x + 4, y + 13);
      }
    }
    paintsRef.current += 1;
    const r = canvas.getBoundingClientRect();
    reports.set(pane, {
      pane, view: { ...view }, dpr, bitmaps: bitmaps.length, worldW, worldH, paints: paintsRef.current,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  }, [bitmaps, crop, outlines, pane, worldW, worldH]);

  // Size the backing store to the element at the device pixel ratio.
  React.useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(wrap.clientWidth));
      const h = Math.max(1, Math.floor(wrap.clientHeight));
      sizeRef.current = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (!viewRef.current) viewRef.current = fitView(w, h, fitTo ?? { x: 0, y: 0, w: worldW, h: worldH });
      paint();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint]);

  // A new world (another zone, another act) is fitted afresh.
  React.useEffect(() => {
    const { w, h } = sizeRef.current;
    if (w > 1 && h > 1) {
      viewRef.current = fitView(w, h, fitTo ?? { x: 0, y: 0, w: worldW, h: worldH });
      paint();
      force();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  React.useEffect(() => { paint(); }, [paint]);

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const view = viewRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / view.scale + view.ox, y: (clientY - r.top) / view.scale + view.oy };
  };

  const drag = React.useRef<{ button: number; x0: number; y0: number; w0: { x: number; y: number };
    view0: PaneView; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!viewRef.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { button: e.button, x0: e.clientX, y0: e.clientY, w0: toWorld(e.clientX, e.clientY),
      view0: { ...viewRef.current }, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !viewRef.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) >= DRAG_SLOP_PX) d.moved = true;
    if (!d.moved) return;
    if (d.button === 0) {
      onDrag?.(d.w0, toWorld(e.clientX, e.clientY), false);
    } else {
      viewRef.current = { scale: d.view0.scale,
        ox: d.view0.ox - (e.clientX - d.x0) / d.view0.scale, oy: d.view0.oy - (e.clientY - d.y0) / d.view0.scale };
      paint();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.button === 0) {
      if (d.moved) onDrag?.(d.w0, toWorld(e.clientX, e.clientY), true);
      else onClickWorld?.(toWorld(e.clientX, e.clientY));
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const p = toWorld(e.clientX, e.clientY);
    const k = e.deltaY < 0 ? 1.25 : 1 / 1.25;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * k));
    const r = canvasRef.current!.getBoundingClientRect();
    viewRef.current = { scale, ox: p.x - (e.clientX - r.left) / scale, oy: p.y - (e.clientY - r.top) / scale };
    paint();
  };

  return (
    <div ref={wrapRef} data-zone-pane={pane}
         style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', background: T.void, ...style }}>
      <canvas ref={canvasRef} data-zone-pane-canvas={pane}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}
              style={{ position: 'absolute', left: 0, top: 0, cursor: onDrag ? 'crosshair' : 'default' }} />
      {children}
    </div>
  );
}
