// Pure core preview pipeline for a classic (Sonic 1) object's sprite: turn a
// parsed mappings frame + decoded art tiles into an indexed 4bpp bitmap with its
// signed origin, then (renderer-side) to RGBA via a live palette line. This
// reuses the SAME sprite machinery the Sprite mode read path uses —
// `parseAsmMappings` (mappings `.asm` call-site parser), `nemesisDecompress` /
// `parseTiles`, and `renderFrameToIndices` (Task 15's inverse renderer).
//
// Pure core: no fs, no canvas, no DOM. The renderer reads the art/map files
// (classic-object-art.ts) and wraps the returned indices in an ImageBitmap; the
// headless render script (render-classic-act.mjs) does the same with fs.

import { parseAsmMappings } from '../import/asm-mappings';
import { parseTiles } from '../formats/tiles';
import { nemesisDecompress } from '../compress/nemesis';
import { renderFrameToIndices } from '../art/sprite-render';
import type { ObjectArtCompression } from '../project/profiles/s1-object-art';
import type { SpriteFrame } from '../model/sprite-types';
import type { Tile } from '../model/s4-types';
import type { S1ObjectEntry } from '../formats/classic/s1-objpos';

/** An object frame rendered to a palette-indexed bitmap + its signed origin. */
export interface RenderedObjectFrame {
  /** width*height indices (0 = transparent); 4bpp values 0..15. */
  indices: Uint8Array;
  width: number;
  height: number;
  /** Origin offset: the object's (x,y) maps to (originX, originY) in the bitmap. */
  originX: number;
  originY: number;
}

/** Decode an object's 8x8 art file into tiles (nemesis-compressed or raw 4bpp). */
export function decodeObjectArt(bytes: Uint8Array, compression: ObjectArtCompression): Tile[] {
  const raw = compression === 'nemesis' ? nemesisDecompress(bytes) : bytes;
  return parseTiles(raw);
}

/**
 * Tight bounds of ONE frame's pieces (its own bounding box — NOT the shared
 * multi-frame canvas the Sprite editor uses). A frame with no pieces yields an
 * 8x8 origin-0 box so callers never divide by zero.
 */
function frameBounds(frame: SpriteFrame): { minX: number; minY: number; width: number; height: number } {
  if (frame.pieces.length === 0) return { minX: 0, minY: 0, width: 8, height: 8 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of frame.pieces) {
    minX = Math.min(minX, p.xOffset);
    minY = Math.min(minY, p.yOffset);
    maxX = Math.max(maxX, p.xOffset + p.widthCells * 8);
    maxY = Math.max(maxY, p.yOffset + p.heightCells * 8);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Render one frame of a sprite (by index into its frame table) to an indexed
 * bitmap sized to that frame's own bounding box. `originX/Y = -minX/-minY`, so
 * placing the bitmap's top-left at `(obj.x - originX, obj.y - originY)` puts the
 * object origin where the engine's signed piece offsets expect it. An
 * out-of-range frame index yields an empty 8x8 frame (never throws).
 */
export function renderObjectFrame(
  frames: SpriteFrame[], tiles: Tile[], frameIndex: number,
): RenderedObjectFrame {
  const frame = frames[frameIndex];
  if (!frame) return { indices: new Uint8Array(64), width: 8, height: 8, originX: 0, originY: 0 };
  const { minX, minY, width, height } = frameBounds(frame);
  const originX = -minX;
  const originY = -minY;
  const indices = renderFrameToIndices(frame, tiles, width, height, originX, originY);
  return { indices, width, height, originX, originY };
}

/** Convenience: decode art + parse mappings text + render the declared frame. */
export function renderObjectFrameFromFiles(
  mapAsmText: string, artBytes: Uint8Array, compression: ObjectArtCompression, frameIndex: number,
): RenderedObjectFrame {
  const frames = parseAsmMappings(mapAsmText);
  const tiles = decodeObjectArt(artBytes, compression);
  return renderObjectFrame(frames, tiles, frameIndex);
}

/** An axis-aligned world-space rectangle (top-left + size). */
export interface WorldRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The world-space rectangle a rendered object frame occupies when anchored at
 * (anchorX, anchorY) with the object's flips. The unflipped bitmap top-left sits
 * at `(anchor - origin)`; an X/Y flip mirrors the frame about the anchor, so the
 * bitmap's flipped top-left moves to `anchor - (size - origin)`. This is the
 * selection box and the frame-bounds hit-test region.
 */
export function objectFrameRect(
  bounds: { width: number; height: number; originX: number; originY: number },
  anchorX: number,
  anchorY: number,
  xflip: boolean,
  yflip: boolean,
): WorldRect {
  const left = xflip ? anchorX - (bounds.width - bounds.originX) : anchorX - bounds.originX;
  const top = yflip ? anchorY - (bounds.height - bounds.originY) : anchorY - bounds.originY;
  return { left, top, width: bounds.width, height: bounds.height };
}

/** Whether a world point falls inside a rect (inclusive of the top-left edge). */
export function pointInRect(rect: WorldRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
}

/** Object entry subset used for hit-testing (position + flips). */
export type HitObject = Pick<S1ObjectEntry, 'x' | 'y' | 'xflip' | 'yflip' | 'id' | 'subtype'>;
