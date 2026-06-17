import { parseSpriteMappings } from './sprite-mappings-import';
import { parseTiles } from '../formats/tiles';
import { renderFrameToIndices } from '../art/sprite-render';
import type { SpriteFrame } from '../model/sprite-types';
import type { Tile } from '../model/s4-types';

/**
 * Parse a DPLC stream into, per frame, the ordered list of SOURCE art-tile indices
 * that frame loads into VRAM. A mapping piece's tile index (relative to the art base)
 * indexes into this list. Format (engine/objects/dplc.asm): word offset table, then
 * per frame `dc.w entry_count` + entries `(count-1)<<12 | tileStart`.
 * See docs/specs/2026-06-16-sprite-mode-design.md §2.4.
 */
export function parseDPLC(bytes: Uint8Array): number[][] {
  if (bytes.length < 2) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstOffset = dv.getUint16(0, false);
  if (firstOffset < 2 || firstOffset % 2 !== 0 || firstOffset > bytes.length) return [];
  const frameCount = firstOffset / 2;
  const out: number[][] = [];
  for (let f = 0; f < frameCount; f++) {
    const off = dv.getUint16(f * 2, false);
    const local: number[] = [];
    if (off + 2 <= bytes.length) {
      const entryCount = dv.getUint16(off, false);
      let o = off + 2;
      for (let e = 0; e < entryCount && o + 2 <= bytes.length; e++) {
        const w = dv.getUint16(o, false);
        o += 2;
        const count = ((w >> 12) & 0xf) + 1;
        const start = w & 0x0fff;
        for (let t = 0; t < count; t++) local.push(start + t);
      }
    }
    out.push(local);
  }
  return out;
}

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
/** Shared canvas bounds (size + origin) over all frames' piece bounding boxes. */
function frameBounds(frames: SpriteFrame[]): { width: number; height: number; originX: number; originY: number } {
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
  return {
    width: Math.max(8, Math.ceil((maxX - minX) / 8) * 8),
    height: Math.max(8, Math.ceil((maxY - minY) / 8) * 8),
    originX: -minX,
    originY: -minY,
  };
}

export function reconstructSpriteFrames(mappingsBytes: Uint8Array, artBytes: Uint8Array): ReconstructedSprite {
  const frames = parseSpriteMappings(mappingsBytes);
  const tiles = parseTiles(artBytes);
  const { width, height, originX, originY } = frameBounds(frames);
  const out = frames.map((f) => renderFrameToIndices(f, tiles, width, height, originX, originY));
  if (out.length === 0) out.push(new Uint8Array(width * height));
  return { width, height, originX, originY, frames: out };
}

/**
 * Reconstruct a DPLC (streaming-art) sprite — Sonic/Tails/Knuckles. Each frame's
 * mapping tile indices are resolved through that frame's DPLC source-tile list
 * before rendering, so frame-local indices map to the right tiles in the full art.
 * Pair the UNOPTIMIZED dplc with the UNCOMPRESSED art (the optimizer rearranges both).
 */
export function reconstructDPLCSprite(mappingsBytes: Uint8Array, dplcBytes: Uint8Array, artBytes: Uint8Array): ReconstructedSprite {
  const frames = parseSpriteMappings(mappingsBytes);
  const dplc = parseDPLC(dplcBytes);
  const art = parseTiles(artBytes);
  const blank: Tile = { pixels: new Uint8Array(64) };
  const { width, height, originX, originY } = frameBounds(frames);
  const out = frames.map((f, i) => {
    const localToSource = dplc[i] ?? [];
    const frameTiles: Tile[] = localToSource.map((src) => art[src] ?? blank);
    return renderFrameToIndices(f, frameTiles, width, height, originX, originY);
  });
  if (out.length === 0) out.push(new Uint8Array(width * height));
  return { width, height, originX, originY, frames: out };
}
