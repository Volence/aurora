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

function tileAttrs(p: SpritePiece): number {
  return (
    ((p.priority ? 1 : 0) << 15) |
    ((p.palette & 3) << 13) |
    ((p.yFlip ? 1 : 0) << 12) |
    ((p.xFlip ? 1 : 0) << 11) |
    (p.tile & 0x7ff)
  ) & 0xffff;
}

function serializeFrameBlock(frame: SpriteFrame): Uint8Array {
  const bbox = computeFrameBbox(frame.pieces);
  const out = new Uint8Array(6 + frame.pieces.length * 8);
  const dv = new DataView(out.buffer);
  dv.setInt8(0, bbox.xMin);
  dv.setInt8(1, bbox.xMax);
  dv.setInt8(2, bbox.yMin);
  dv.setInt8(3, bbox.yMax);
  dv.setUint16(4, frame.pieces.length, false);
  let o = 6;
  for (const p of frame.pieces) {
    dv.setInt16(o, p.yOffset, false); o += 2;
    out[o++] = sizeCode(p.widthCells, p.heightCells);
    out[o++] = 0; // VDP link byte placeholder (engine fills at runtime)
    dv.setUint16(o, tileAttrs(p), false); o += 2;
    dv.setInt16(o, p.xOffset, false); o += 2;
  }
  return out;
}

/**
 * Serialize frames to the S4 VDP-order mappings binary:
 * word offset table (one per frame, offset from table start) + frame blocks.
 */
export function serializeSpriteMappings(frames: SpriteFrame[]): Uint8Array {
  const tableSize = frames.length * 2;
  const blocks = frames.map(serializeFrameBlock);
  const total = tableSize + blocks.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = tableSize;
  frames.forEach((_, i) => {
    dv.setUint16(i * 2, off, false);
    out.set(blocks[i], off);
    off += blocks[i].length;
  });
  return out;
}
