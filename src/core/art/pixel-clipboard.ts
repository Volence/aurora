// src/core/art/pixel-clipboard.ts
import type { PixelBuffer } from './pixel-ops';

/** A copied rectangular region of palette indices. */
export interface ClipRegion { w: number; h: number; data: Uint8Array; }

interface Rect { x: number; y: number; w: number; h: number; }

/** Extract the selection rectangle of indices (clamped to the buffer). Returns
 *  null if the clamped region is empty. */
export function copyRegion(buffer: PixelBuffer, sel: Rect): ClipRegion | null {
  const x0 = Math.max(0, sel.x), y0 = Math.max(0, sel.y);
  const x1 = Math.min(buffer.width, sel.x + sel.w), y1 = Math.min(buffer.height, sel.y + sel.h);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    data[y * w + x] = buffer.data[(y0 + y) * buffer.width + (x0 + x)];
  }
  return { w, h, data };
}

/** A copy of `buffer` with the selection rect zeroed (transparent). For cut. */
export function clearRegion(buffer: PixelBuffer, sel: Rect): PixelBuffer {
  const out: PixelBuffer = { width: buffer.width, height: buffer.height, data: new Uint8Array(buffer.data) };
  const x0 = Math.max(0, sel.x), y0 = Math.max(0, sel.y);
  const x1 = Math.min(buffer.width, sel.x + sel.w), y1 = Math.min(buffer.height, sel.y + sel.h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.data[y * buffer.width + x] = 0;
  return out;
}

/** A copy of `buffer` with `clip` stamped at (px,py). Index 0 in the clip is
 *  transparent (skipped), mirroring the move gesture; out-of-bounds pixels are
 *  clipped. The destination palette colors the result (indices preserved). */
export function pasteRegion(buffer: PixelBuffer, clip: ClipRegion, px: number, py: number): PixelBuffer {
  const out: PixelBuffer = { width: buffer.width, height: buffer.height, data: new Uint8Array(buffer.data) };
  for (let y = 0; y < clip.h; y++) for (let x = 0; x < clip.w; x++) {
    const v = clip.data[y * clip.w + x];
    if (v === 0) continue;
    const dx = px + x, dy = py + y;
    if (dx < 0 || dy < 0 || dx >= buffer.width || dy >= buffer.height) continue;
    out.data[dy * buffer.width + dx] = v;
  }
  return out;
}
