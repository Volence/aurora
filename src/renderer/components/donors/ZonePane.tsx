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
  DONOR_CROP_EDGE, DONOR_CROP_SHADE, DONOR_LABEL_CHIP, DONOR_LABEL_FAINT, DONOR_MARK, DONOR_MARK_FAINT,
  DONOR_MARK_FAINT_FILL, DONOR_MARK_FILL, DONOR_MARK_WARN, DONOR_WORLD_EDGE,
} from '../../canvas/canvas-colors';
import { fitView, MAX_SCALE, MIN_SCALE, type PaneView } from './pane-view';
import { layoutLabels, type LabelBox, type LabelItem } from './pane-labels';
import { outlineNamesAt } from './pane-hover';

export type { PaneView } from './pane-view';

export interface PaneBitmap { x: number; y: number; size: number; bitmap: ImageBitmap }

/**
 * One outlined rectangle. `dashed` draws a 2px DASHED edge with no fill, and
 * `tag` a second, smaller label under `label`: the target pane's refused-subject
 * outline (row 213 (b)), tone 'warning', tag = the refusal's rule.
 */
export interface PaneOutline {
  rect: PxRect;
  label?: string;
  tone?: 'accent' | 'warning' | 'faint';
  dashed?: boolean;
  tag?: string;
  /**
   * What the pane's hover names this outline by, when it is not `label`: a
   * refused-subject outline's "<rule tag>: <subject label>" (row 236 (a)).
   * Never drawn on the canvas; the on-canvas words are `label` and `tag`.
   */
  hover?: string;
}

/** The dash of a refused-subject outline, in screen pixels. */
export const OUTLINE_DASH: readonly number[] = [6, 4];

export interface ZonePaneReport {
  pane: string;
  view: PaneView;
  rect: { left: number; top: number; width: number; height: number };
  dpr: number;
  bitmaps: number;
  worldW: number;
  worldH: number;
  paints: number;
  /** The outlines this paint drew, in world pixels, as the pane was given them. */
  outlines: PaneOutline[];
  /**
   * ROW 235 (b): every label and tag this paint laid out (pane-labels.ts), in
   * CSS px from the canvas's top-left. `box` is the opaque chip it printed on
   * (null when hidden, or when an identical twin at the same corner printed
   * it); `fg` and `bg` are the text and chip colours, so a reader of the canvas
   * can tell the label's own pixels from anything else.
   */
  labels: Array<{ text: string; kind: 'label' | 'tag'; outline: number; box: LabelBox | null; line: number | null;
    hidden: boolean; twinOf: number | null; fg: string; bg: string }>;
}

const reports = new Map<string, ZonePaneReport>();
/** The last paint of the named pane, for the debug hooks. */
export function lastZonePaneReport(pane: string): ZonePaneReport | null {
  return reports.get(pane) ?? null;
}

const DRAG_SLOP_PX = 4;
const LABEL_FONT = '11px sans-serif';
const TAG_FONT = 'bold 10px sans-serif';

export interface ZonePaneProps {
  pane: string;
  worldW: number;
  worldH: number;
  bitmaps: readonly PaneBitmap[];
  /** Rectangle whose OUTSIDE is dimmed (the donor crop). */
  crop?: PxRect | null;
  /** Rectangles outlined in the accent colour (marquee, pasted clips), or dashed in warning (a refused subject). */
  outlines?: ReadonlyArray<PaneOutline>;
  /** The rectangle a view should fit on first show; defaults to the whole world. */
  fitTo?: PxRect | null;
  onDrag?: (a: { x: number; y: number }, b: { x: number; y: number }, done: boolean) => void;
  onClickWorld?: (p: { x: number; y: number }) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** The text colour of an outline's label: its tone, opaque (a faint label is read over a chip, not blended). */
function labelColour(o: PaneOutline): string {
  return o.tone === 'warning' ? DONOR_MARK_WARN : o.tone === 'faint' ? DONOR_LABEL_FAINT : DONOR_MARK;
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
    // PASS 1: every outline's fill and edge. Labels go on top in pass 2, so no
    // later rectangle's fill or edge can cross a chip.
    const items: LabelItem[] = [];
    (outlines ?? []).forEach((o, i) => {
      const col = o.tone === 'warning' ? DONOR_MARK_WARN : o.tone === 'faint' ? DONOR_MARK_FAINT : DONOR_MARK;
      const x = sx(o.rect.x); const y = sy(o.rect.y);
      const rw = o.rect.w * view.scale; const rh = o.rect.h * view.scale;
      if (!o.dashed) {
        ctx.fillStyle = o.tone === 'faint' ? DONOR_MARK_FAINT_FILL : DONOR_MARK_FILL;
        ctx.fillRect(x, y, rw, rh);
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.setLineDash(o.dashed ? [...OUTLINE_DASH] : []);
      ctx.strokeRect(x + 1, y + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));
      ctx.setLineDash([]);
      const rect = { x, y, w: rw, h: rh };
      if (o.label) {
        ctx.font = LABEL_FONT;
        items.push({ text: o.label, kind: 'label', outline: i, rect, line: 0, width: ctx.measureText(o.label).width });
      }
      // A rule tag wants the SECOND line: a refused rectangle is always also
      // drawn by another outline that carries the id on the first (the clip's
      // faint one, or the pending paste's accent one); the layout keeps it off
      // that id ("C4" over "ehz_2x" read "C4z_2x" in the row-213 harness shot).
      if (o.tag) {
        ctx.font = TAG_FONT;
        items.push({ text: o.tag, kind: 'tag', outline: i, rect, line: 1, width: ctx.measureText(o.tag).width });
      }
    });
    // PASS 2: the labels, laid out so none is drawn over another (pane-labels.ts).
    const laid = layoutLabels(items);
    const labels: ZonePaneReport['labels'] = [];
    for (const l of laid) {
      const o = (outlines ?? [])[l.outline];
      const fg = labelColour(o);
      labels.push({ text: l.text, kind: l.kind, outline: l.outline, box: l.box ? { ...l.box } : null, line: l.placedLine,
        hidden: l.hidden, twinOf: l.twinOf, fg, bg: DONOR_LABEL_CHIP });
      if (!l.box || !l.baseline) continue;
      ctx.fillStyle = DONOR_LABEL_CHIP;
      ctx.fillRect(l.box.x, l.box.y, l.box.w, l.box.h);
      ctx.font = l.kind === 'tag' ? TAG_FONT : LABEL_FONT;
      ctx.fillStyle = fg;
      ctx.fillText(l.text, l.baseline.x, l.baseline.y);
    }
    paintsRef.current += 1;
    const r = canvas.getBoundingClientRect();
    reports.set(pane, {
      pane, view: { ...view }, dpr, bitmaps: bitmaps.length, worldW, worldH, paints: paintsRef.current,
      outlines: (outlines ?? []).map((o) => ({ ...o, rect: { ...o.rect } })),
      labels,
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
    if (!d && viewRef.current && canvasRef.current) {
      // Every name under the pointer (pane-hover.ts), so a label the layout had
      // to hide is still one hover away (row 235 (b)).
      const title = outlineNamesAt(outlines ?? [], toWorld(e.clientX, e.clientY)).join('\n');
      if (canvasRef.current.title !== title) canvasRef.current.title = title;
    }
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
