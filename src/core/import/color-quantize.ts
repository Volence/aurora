import type { Palette, Color } from '../model/types';

export interface QuantizedTile {
  pixels: Uint8Array;       // 64 palette indices (0-15)
  paletteLine: number;      // which palette line (0-3)
  totalError: number;       // sum of squared color distances
}

function colorDistSq(a: Color, b: Color): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function nearestColorIndex(r: number, g: number, b: number, line: Color[]): { index: number; dist: number } {
  let bestIdx = 0;
  let bestDist = Infinity;
  // Skip index 0 (transparent) for opaque pixels
  for (let i = 1; i < line.length; i++) {
    const c = line[i];
    const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { index: bestIdx, dist: bestDist };
}

/**
 * Quantize an 8×8 pixel region to the best-fit palette line.
 * rgba: 256 bytes (8×8 × 4 channels) of RGBA pixel data.
 */
export function quantizeTile(rgba: Uint8ClampedArray, palette: Palette): QuantizedTile {
  let bestLine = 0;
  let bestError = Infinity;
  let bestPixels: Uint8Array | null = null;

  for (let line = 0; line < palette.lines.length; line++) {
    const colors = palette.lines[line].colors;
    const pixels = new Uint8Array(64);
    let totalError = 0;

    for (let i = 0; i < 64; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      const a = rgba[i * 4 + 3];

      if (a < 128) {
        pixels[i] = 0;
        continue;
      }

      const { index, dist } = nearestColorIndex(r, g, b, colors);
      pixels[i] = index;
      totalError += dist;
    }

    if (totalError < bestError) {
      bestError = totalError;
      bestLine = line;
      bestPixels = pixels;
    }
  }

  return {
    pixels: bestPixels!,
    paletteLine: bestLine,
    totalError: bestError,
  };
}

/**
 * Check if an 8×8 region is fully transparent or black (all zeros).
 */
export function isTileBlank(rgba: Uint8ClampedArray): boolean {
  for (let i = 0; i < 64; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    if (a >= 128 && (r > 8 || g > 8 || b > 8)) return false;
  }
  return true;
}
