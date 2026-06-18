import { floodFill, drawLine, drawRect, ditherValue, mirrorPoints, isLCorner } from './pixel-ops';
import type { PixelBuffer, MirrorMode, DitherPattern } from './pixel-ops';

/**
 * Pure, framework-agnostic pixel-drawing engine shared by the level-art and
 * sprite-art canvases. Owns all gesture logic — Bresenham strokes, mirror, dither,
 * pixel-perfect, line/rect, marquee select+move — over a PixelBuffer, returning an
 * updated buffer (+ selection/pick). No React, no store, no undo: the host applies
 * the result through its own commit path (sprite: setBuffer; composer: diffWrites →
 * its existing command/undo path). Behavior is a faithful extraction of the logic
 * previously inline in SpriteCanvas. See docs/specs/2026-06-18-unified-drawing-core-design.md.
 */

export type ArtTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';
export interface Selection { x: number; y: number; w: number; h: number; }
export interface ToolConfig {
  tool: ArtTool;
  color: number;            // active palette index 0..15
  mirror: MirrorMode | null;
  ditherPattern: DitherPattern;
  ditherSecondary: number;  // 0..15
  pixelPerfect: boolean;
}
export interface Write { x: number; y: number; value: number; }
export type Preview =
  | { kind: 'none' }
  | { kind: 'line' | 'rect' | 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'move'; dx: number; dy: number; sel: Selection };
export interface GestureResult { buffer: PixelBuffer; selection?: Selection | null; pick?: number; start?: { x: number; y: number }; }

interface Pt { x: number; y: number; }

const clone = (b: PixelBuffer): PixelBuffer => ({ width: b.width, height: b.height, data: new Uint8Array(b.data) });
const setPx = (b: PixelBuffer, x: number, y: number, v: number) => { if (x >= 0 && x < b.width && y >= 0 && y < b.height) b.data[y * b.width + x] = v; };
const norm = (x0: number, y0: number, x1: number, y1: number): Selection =>
  ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + 1, h: Math.abs(y1 - y0) + 1 });

/** Endpoint pairs for a mirrored line/rect — apply each symmetry to BOTH endpoints
 *  (not index-paired, which is unsound when dedup changes list length). */
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

/** Pixels that differ between two equal-size buffers (for hosts that commit by write list). */
export function diffWrites(before: PixelBuffer, after: PixelBuffer): Write[] {
  const out: Write[] = [];
  for (let i = 0; i < after.data.length; i++) {
    if (after.data[i] !== before.data[i]) out.push({ x: i % after.width, y: Math.floor(i / after.width), value: after.data[i] });
  }
  return out;
}

export class PixelEditController {
  private cfg: ToolConfig;
  private snapshot: PixelBuffer | null = null;
  private working: PixelBuffer | null = null;
  private path: Pt[] = [];
  private start: Pt | null = null;
  private sel: Selection | null = null;
  private moveRegion: { data: Uint8Array; w: number; h: number; ox: number; oy: number } | null = null;
  private preview_: Preview = { kind: 'none' };
  private active = false;

  constructor(cfg: ToolConfig) { this.cfg = cfg; }
  setConfig(cfg: ToolConfig): void { this.cfg = cfg; }
  get isActive(): boolean { return this.active; }
  preview(): Preview { return this.preview_; }
  workingBuffer(): PixelBuffer | null { return this.working; }

  private paintValue(x: number, y: number): number {
    if (this.cfg.tool === 'eraser') return 0;
    if (this.cfg.tool === 'dither') return ditherValue(this.cfg.ditherPattern, x, y, this.cfg.color, this.cfg.ditherSecondary);
    return this.cfg.color;
  }

  private addPoint(p: Pt): void {
    const last = this.path[this.path.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    this.path.push(p);
    if (this.cfg.pixelPerfect && this.path.length >= 3
      && isLCorner(this.path[this.path.length - 3], this.path[this.path.length - 2], this.path[this.path.length - 1])) {
      this.path.splice(this.path.length - 2, 1);
    }
  }

  private pushPathPoint(p: Pt): void {
    const last = this.path[this.path.length - 1];
    if (!last) { this.addPoint(p); return; }
    // interpolate (Bresenham) between samples so fast drags stay connected
    let x0 = last.x, y0 = last.y; const x1 = p.x, y1 = p.y;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (!(x0 === last.x && y0 === last.y)) this.addPoint({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  private renderStroke(): void {
    if (!this.snapshot) return;
    const b = clone(this.snapshot);
    for (const p of this.path) {
      const v = this.paintValue(p.x, p.y);
      for (const m of this.cfg.mirror ? mirrorPoints(b.width, b.height, p.x, p.y, this.cfg.mirror) : [p]) setPx(b, m.x, m.y, v);
    }
    this.working = b;
  }

  /** Start a gesture. Returns a result immediately for instantaneous tools
   *  (fill/eyedropper); otherwise begins a drag and returns null. */
  begin(buffer: PixelBuffer, x: number, y: number, selection: Selection | null): GestureResult | null {
    this.sel = selection;
    if (this.cfg.tool === 'eyedropper') return { buffer, pick: buffer.data[y * buffer.width + x], start: { x, y } };
    if (this.cfg.tool === 'fill') return { buffer: floodFill(buffer, x, y, this.paintValue(x, y)), start: { x, y } };

    this.active = true;
    this.snapshot = clone(buffer);
    this.start = { x, y };
    this.path = [];
    this.moveRegion = null;
    this.preview_ = { kind: 'none' };

    const t = this.cfg.tool;
    if (t === 'line' || t === 'rect') {
      this.preview_ = { kind: t, x0: x, y0: y, x1: x, y1: y };
    } else if (t === 'select') {
      if (selection && x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
        // grab inside the selection → start moving: cut its pixels out of the snapshot
        const reg = new Uint8Array(selection.w * selection.h);
        for (let yy = 0; yy < selection.h; yy++) for (let xx = 0; xx < selection.w; xx++) {
          reg[yy * selection.w + xx] = buffer.data[(selection.y + yy) * buffer.width + (selection.x + xx)];
          setPx(this.snapshot, selection.x + xx, selection.y + yy, 0);
        }
        this.moveRegion = { data: reg, w: selection.w, h: selection.h, ox: x, oy: y };
        this.preview_ = { kind: 'move', dx: 0, dy: 0, sel: selection };
      } else {
        this.preview_ = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y };
      }
    } else {
      // pencil / eraser / dither
      this.pushPathPoint({ x, y });
      this.renderStroke();
    }
    return null;
  }

  move(x: number, y: number): void {
    if (!this.active) return;
    const t = this.cfg.tool;
    if (t === 'line' || t === 'rect') {
      if (this.start) this.preview_ = { kind: t, x0: this.start.x, y0: this.start.y, x1: x, y1: y };
      return;
    }
    if (t === 'select') {
      const mv = this.moveRegion;
      if (mv && this.sel) this.preview_ = { kind: 'move', dx: x - mv.ox, dy: y - mv.oy, sel: this.sel };
      else if (this.start) this.preview_ = { kind: 'marquee', x0: this.start.x, y0: this.start.y, x1: x, y1: y };
      return;
    }
    this.pushPathPoint({ x, y });
    this.renderStroke();
  }

  /** Finalize the gesture at the final pointer position. Resets internal state. */
  end(x: number, y: number): GestureResult {
    const result = this.finish(x, y);
    this.active = false;
    this.snapshot = null;
    this.working = null;
    this.path = [];
    this.start = null;
    this.moveRegion = null;
    this.preview_ = { kind: 'none' };
    return result;
  }

  private finish(x: number, y: number): GestureResult {
    return { ...this.finishInner(x, y), start: this.start ?? undefined };
  }

  private finishInner(x: number, y: number): GestureResult {
    const t = this.cfg.tool;
    const snap = this.snapshot!;
    if (t === 'line' || t === 'rect') {
      let b = snap;
      if (this.start) {
        for (const { a, b: bb } of mirrorEndpointPairs(snap.width, snap.height, this.start, { x, y }, this.cfg.mirror)) {
          b = t === 'line'
            ? drawLine(b, a.x, a.y, bb.x, bb.y, this.cfg.color)
            : drawRect(b, Math.min(a.x, bb.x), Math.min(a.y, bb.y), Math.abs(bb.x - a.x) + 1, Math.abs(bb.y - a.y) + 1, this.cfg.color, true);
        }
      }
      return { buffer: b };
    }
    if (t === 'select') {
      const mv = this.moveRegion;
      if (mv && this.sel) {
        const dx = x - mv.ox, dy = y - mv.oy;
        const b = clone(snap);
        for (let yy = 0; yy < mv.h; yy++) for (let xx = 0; xx < mv.w; xx++) {
          const v = mv.data[yy * mv.w + xx];
          if (v !== 0) setPx(b, this.sel.x + dx + xx, this.sel.y + dy + yy, v);
        }
        return { buffer: b, selection: { x: this.sel.x + dx, y: this.sel.y + dy, w: mv.w, h: mv.h } };
      }
      if (this.start) {
        const n = norm(this.start.x, this.start.y, x, y);
        return { buffer: snap, selection: n.w > 1 || n.h > 1 ? n : null };
      }
      return { buffer: snap, selection: this.sel };
    }
    // strokes: the working buffer is the result
    return { buffer: this.working ?? snap };
  }
}
