import type { SpriteFrame, SpritePiece } from '../model/sprite-types';
import { sizeCode } from '../model/sprite-types';

export interface FrameBbox { xMin: number; xMax: number; yMin: number; yMax: number; }

/**
 * Flip-invariant bbox over a frame's pieces. Far edges = offset + cells*8.
 * Union, then symmetrize so one box is valid for all 4 flip states (exact for
 * symmetric frames, conservative otherwise). Hard-fails outside signed byte.
 * Mirrors s4_engine tools/convert_s2_mappings.py `_compute_bbox`.
 */
export function computeFrameBbox(pieces: SpritePiece[]): FrameBbox {
  if (pieces.length === 0) return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  let xMin = 127, xMax = -128, yMin = 127, yMax = -128;
  for (const p of pieces) {
    const wpx = p.widthCells * 8;
    const hpx = p.heightCells * 8;
    if (p.xOffset < xMin) xMin = p.xOffset;
    if (p.xOffset + wpx > xMax) xMax = p.xOffset + wpx;
    if (p.yOffset < yMin) yMin = p.yOffset;
    if (p.yOffset + hpx > yMax) yMax = p.yOffset + hpx;
  }
  const sxMin = Math.min(xMin, -xMax);
  const sxMax = Math.max(xMax, -xMin);
  const syMin = Math.min(yMin, -yMax);
  const syMax = Math.max(yMax, -yMin);
  for (const [name, v] of [['x_min', sxMin], ['x_max', sxMax], ['y_min', syMin], ['y_max', syMax]] as const) {
    if (v < -128 || v > 127) {
      throw new Error(`Frame bbox ${name}=${v} exceeds signed byte range [-128,127]`);
    }
  }
  return { xMin: sxMin, xMax: sxMax, yMin: syMin, yMax: syMax };
}
