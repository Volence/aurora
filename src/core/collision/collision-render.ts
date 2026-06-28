// src/core/collision/collision-render.ts

/** The solid run of one 16px-cell column, in cell-local pixels (y from the top,
 *  0..16). null when the column is empty. h>0: solid up from the bottom → y=16-h.
 *  h<0: solid down from the top → y=0. The magnitude is clamped to the 16px cell
 *  so a malformed >16 byte reads as a full block (matching the engine's covers())
 *  instead of bleeding outside the cell. */
export function columnSolidRun(height: number): { y: number; h: number } | null {
  const h = Math.min(16, Math.abs(height));
  if (h === 0) return null;
  if (height > 0) return { y: 16 - h, h };
  return { y: 0, h }; // height < 0
}

const BARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** A 16-char unicode sparkline of a height profile (|height| 0..16 → 0..8 bar). */
export function heightSparkline(heights: Int8Array): string {
  let out = '';
  for (let c = 0; c < 16; c++) {
    const mag = Math.min(16, Math.abs(heights[c] ?? 0));
    out += BARS[Math.round((mag / 16) * 8)];
  }
  return out;
}
