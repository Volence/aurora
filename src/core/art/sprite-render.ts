import type { Tile } from '../model/s4-types';
import type { SpriteFrame } from '../model/sprite-types';
import type { Color } from '../model/s4-types';

/**
 * Reconstruct a frame's pixel-index bitmap from its pieces + tile pool — the
 * inverse of decomposeFrame (so a loaded sprite becomes editable). Tiles within a
 * piece are VDP column-major (`tile + col*heightCells + row`); xFlip/yFlip flip
 * the whole piece (cell order + per-tile pixels). Transparent (0) pixels do not
 * overwrite, so overlapping pieces compose. Pass the SAME origin used to decompose
 * (it cancels: a piece lands back at its original grid cell).
 */
export function renderFrameToIndices(
  frame: SpriteFrame, tiles: Tile[], width: number, height: number, originX: number, originY: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (const p of frame.pieces) {
    const w = p.widthCells, h = p.heightCells;
    for (let oc = 0; oc < w; oc++) {
      for (let or = 0; or < h; or++) {
        const sc = p.xFlip ? w - 1 - oc : oc;
        const sr = p.yFlip ? h - 1 - or : or;
        const tile = tiles[p.tile + sc * h + sr];
        if (!tile) continue;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const spx = p.xFlip ? 7 - px : px;
            const spy = p.yFlip ? 7 - py : py;
            const v = tile.pixels[spy * 8 + spx];
            if (v === 0) continue;
            const dx = p.xOffset + originX + oc * 8 + px;
            const dy = p.yOffset + originY + or * 8 + py;
            if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
            out[dy * width + dx] = v;
          }
        }
      }
    }
  }
  return out;
}

/**
 * Convert a pixel-index bitmap to RGBA bytes using a palette line. Index 0 is
 * transparent (alpha 0). For object previews and canvas rendering.
 */
export function indicesToRGBA(indices: Uint8Array, colors: Color[]): Uint8Array {
  const out = new Uint8Array(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx === 0) continue; // transparent (alpha stays 0)
    const c = colors[idx];
    out[i * 4] = c ? c.r : 255;
    out[i * 4 + 1] = c ? c.g : 0;
    out[i * 4 + 2] = c ? c.b : 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}
