import { parseSpriteMappings } from './sprite-mappings-import';
import { parseTiles } from '../formats/tiles';
import { renderFrameToIndices } from '../art/sprite-render';

export interface ReconstructedSprite {
  width: number;
  height: number;
  originX: number;
  originY: number;
  /** One index bitmap per frame, each width*height (0 = transparent). */
  frames: Uint8Array[];
}

/**
 * Reconstruct editable frame bitmaps from a sprite's engine artifacts
 * (mappings.bin + art.bin). Sizes a single shared canvas to the union of all
 * frames' piece bounding boxes, with a shared origin, so every frame aligns.
 * Pure inverse of the export path — works for editor-exported AND engine sprites
 * (no DPLC handling: art.bin must contain all tiles the mappings reference).
 */
export function reconstructSpriteFrames(mappingsBytes: Uint8Array, artBytes: Uint8Array): ReconstructedSprite {
  const frames = parseSpriteMappings(mappingsBytes);
  const tiles = parseTiles(artBytes);

  let minX = 0, maxX = 8, minY = 0, maxY = 8;
  let any = false;
  for (const f of frames) {
    for (const p of f.pieces) {
      const x0 = p.xOffset, x1 = p.xOffset + p.widthCells * 8;
      const y0 = p.yOffset, y1 = p.yOffset + p.heightCells * 8;
      if (!any) { minX = x0; maxX = x1; minY = y0; maxY = y1; any = true; }
      else { minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1); }
    }
  }

  const width = Math.max(8, Math.ceil((maxX - minX) / 8) * 8);
  const height = Math.max(8, Math.ceil((maxY - minY) / 8) * 8);
  const originX = -minX;
  const originY = -minY;
  const out = frames.map((f) => renderFrameToIndices(f, tiles, width, height, originX, originY));
  // Guarantee at least one (blank) frame so the editor always has something to show.
  if (out.length === 0) out.push(new Uint8Array(width * height));

  return { width, height, originX, originY, frames: out };
}
