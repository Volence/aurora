// Per-8x8-tile VDP priority mask for the classic (Sonic 1) LevelDoc — the data
// side of the viewport's priority lens.
//
// A block's 4 pattern-name words each carry bit 15, the per-tile priority bit
// (model.ts word layout): a high tile renders ABOVE sprites in the VDP's plane
// compositing. `renderChunk` deliberately drops the bit (render.ts:28-31 — the
// flat chunk bitmap has no low/high plane split), so the lens derives it here
// instead of at rasterize time. Granularity is per 8x8 TILE, not per 16x16
// block: 73 mixed-priority blocks exist across the six zones (SBZ alone has 68,
// 11.3% of its blocks — audit §3.2, docs/reviews/2026-08-21-s1-viewport-lenses-
// audit.md), so a per-block mask would lie about all of them.
//
// FLIP COMPOSITION — the trap (audit §3.3): a chunk cell's xf/yf flips the
// WHOLE 16x16 block — the 2x2 tile ARRANGEMENT as well as each tile's pixels —
// exactly as renderChunk's blitRgba mirrors the composed block buffer. Priority
// is an attribute of the tile POSITION, so only the arrangement mirror matters
// here: the mask for a flipped placement is the unflipped quad mirrored on the
// flipped axes. The BLOCK cell's own xf/yf, by contrast, flips pixels within
// the tile and never moves the tile (or its pri bit) to another quadrant, so it
// is correctly ignored.
//
// Pure core: no canvas, no DOM. drawPriority (classic-overlays.ts) consumes it.

import { chunkIndexForId, type BlockDef, type LevelDoc } from './model';

/** Tiles per chunk edge: a 256px chunk is 32x32 8px tiles. */
export const CHUNK_TILES = 32;

/**
 * Priority of one block placement's 4 tiles, composed with the CHUNK cell's
 * flips, in DISPLAY order [TL, TR, BL, BR]. A missing block yields all-low
 * (mirrors renderChunk's transparent fallback — never throws).
 */
export function blockPriorityQuad(
  block: BlockDef | undefined,
  xf: boolean,
  yf: boolean,
): [boolean, boolean, boolean, boolean] {
  const quad: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  if (!block) return quad;
  for (let i = 0; i < 4; i++) {
    const cell = block.cells[i];
    if (!cell?.pri) continue;
    // Storage order TL,TR,BL,BR → block-local (bx, by); the chunk-cell flip
    // mirrors the arrangement, same axes blitRgba mirrors the pixels on.
    const bx = i & 1;
    const by = i >> 1;
    const dx = xf ? 1 - bx : bx;
    const dy = yf ? 1 - by : by;
    quad[dy * 2 + dx] = true;
  }
  return quad;
}

/**
 * The full 32x32 per-tile priority mask for one chunk (row-major, 1 = high
 * priority). `chunkId` is the S1 ENGINE id (1-based; $00 = air), resolved
 * through chunkIndexForId exactly like renderChunk — air / out-of-range → null
 * (nothing to draw). Out-of-range block refs contribute all-low, matching the
 * renderer's transparent fallback for the same cells.
 */
export function chunkPriorityMask(doc: LevelDoc, chunkId: number): Uint8Array | null {
  const index = chunkIndexForId(doc, chunkId);
  if (index === null) return null;
  const chunk = doc.chunks[index];
  if (!chunk) return null;
  const mask = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
  const cellsPerRow = CHUNK_TILES / 2; // 16 block cells per chunk row
  for (let i = 0; i < chunk.cells.length && i < cellsPerRow * cellsPerRow; i++) {
    const cell = chunk.cells[i];
    if (!cell) continue;
    if (cell.block < 0 || cell.block >= doc.blocks.length) continue;
    const quad = blockPriorityQuad(doc.blocks[cell.block], cell.xf, cell.yf);
    if (!quad[0] && !quad[1] && !quad[2] && !quad[3]) continue;
    const tx = (i % cellsPerRow) * 2;
    const ty = ((i / cellsPerRow) | 0) * 2;
    for (let q = 0; q < 4; q++) {
      if (quad[q]) mask[(ty + (q >> 1)) * CHUNK_TILES + (tx + (q & 1))] = 1;
    }
  }
  return mask;
}
