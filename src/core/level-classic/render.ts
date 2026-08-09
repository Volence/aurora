// Chunk prerender for the classic (Sonic 1) LevelDoc — resolves a chunk id to a
// flat 256x256 RGBA buffer by walking chunk → block → tile, composing chunk-cell
// and block-cell flips, applying palette lines, and honoring transparent color 0.
//
// Pure core: no canvas, no DOM, no ImageData. Callers (Task 11's viewport, Task
// 13's chunk-picker thumbnails) wrap the returned Uint8ClampedArray in ImageData
// themselves. Called per chunk on invalidation, so a plain double loop is fine.
//
// Flip composition mirrors SonLVLAPI's RedrawChunk / RedrawBlock
//   /home/volence/sonic_hacks/programs/SonLVL/SonLVLAPI/LevelData.cs (2691, 2729):
//   a block is rendered from its 4 tiles (each tile flipped by its own xf/yf),
//   then the WHOLE 16x16 block is flipped by the chunk cell's xf/yf — which
//   mirrors both the 2x2 tile arrangement AND each tile's pixels. Two flips that
//   land on the same axis cancel to natural pixels but a mirrored cell position.
//
// BlockCell.pri is intentionally ignored here: priority only affects plane/
// sprite compositing at draw time, not this flat per-chunk image. The flat chunk
// bitmap this returns carries no low/high plane split, so pri has no effect.
//
// CRAM→RGB conversion is delegated to the shared decodeGenesisColor helper
//   (src/core/formats/palette.ts) — a 0BGR 3-3-3 word decoder — rather than
//   re-deriving the bit math here.

import { decodeGenesisColor } from '../formats/palette';
import { chunkIndexForId, type LevelDoc } from './model';

const TILE_PX = 8;
const BLOCK_PX = 16;
const CHUNK_PX = 256;
const TILE_BYTES = 32; // 8x8 @ 4bpp packed
const TILE_ROW_BYTES = 4; // 8 px / 2 px-per-byte

/**
 * Render a single 8x8 tile with a palette line to an RGBA buffer (256 bytes).
 * `palette` is a 16-entry line of raw Genesis CRAM words. Color index 0 is
 * transparent (alpha 0). `xf`/`yf` mirror the tile's pixels. An out-of-range
 * tile index yields a fully transparent buffer (never throws).
 */
export function renderTile(
  tiles: Uint8Array,
  tileIndex: number,
  palette: Uint16Array,
  xf: boolean,
  yf: boolean,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(TILE_PX * TILE_PX * 4); // zeroed = transparent
  const base = tileIndex * TILE_BYTES;
  if (tileIndex < 0 || base + TILE_BYTES > tiles.length) return out;

  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      // 4bpp packed: high nibble is the left (even-x) pixel.
      const byte = tiles[base + y * TILE_ROW_BYTES + (x >> 1)];
      const index = (x & 1) === 0 ? (byte >> 4) & 0xf : byte & 0xf;
      if (index === 0) continue; // transparent — leave alpha 0

      const dx = xf ? TILE_PX - 1 - x : x;
      const dy = yf ? TILE_PX - 1 - y : y;
      const o = (dy * TILE_PX + dx) * 4;
      const c = decodeGenesisColor(palette[index] ?? 0);
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * Copy an RGBA source rect into a destination buffer at (dx, dy), optionally
 * mirroring the source horizontally/vertically. Straight overwrite (chunk cells
 * tile disjoint regions, so no compositing is needed).
 */
function blit(
  dest: Uint8ClampedArray,
  destW: number,
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  xf: boolean,
  yf: boolean,
): void {
  for (let y = 0; y < srcH; y++) {
    const sy = yf ? srcH - 1 - y : y;
    for (let x = 0; x < srcW; x++) {
      const sx = xf ? srcW - 1 - x : x;
      const so = (sy * srcW + sx) * 4;
      const doff = ((dy + y) * destW + (dx + x)) * 4;
      dest[doff] = src[so];
      dest[doff + 1] = src[so + 1];
      dest[doff + 2] = src[so + 2];
      dest[doff + 3] = src[so + 3];
    }
  }
}

/**
 * Render a 16x16 block (4 tile cells in TL, TR, BL, BR order) to an RGBA buffer.
 * A missing block yields a transparent buffer.
 */
function renderBlock(doc: LevelDoc, blockId: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(BLOCK_PX * BLOCK_PX * 4);
  const block = doc.blocks[blockId];
  if (!block) return out;

  // TL, TR, BL, BR → (bx, by) in the 2x2 cell grid.
  const positions = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  for (let i = 0; i < 4; i++) {
    const cell = block.cells[i];
    if (!cell) continue;
    const [bx, by] = positions[i];
    const palette = doc.palettes[cell.pal] ?? doc.palettes[0] ?? new Uint16Array(16);
    const tileBuf = renderTile(doc.tiles, cell.tile, palette, cell.xf, cell.yf);
    blit(out, BLOCK_PX, tileBuf, TILE_PX, TILE_PX, bx * TILE_PX, by * TILE_PX, false, false);
  }
  return out;
}

/**
 * Render a chunk to a 256x256 RGBA buffer (262144 bytes). `chunkId` is the S1
 * ENGINE id (1-based; $00 = air): it is resolved to a file-order chunk index via
 * chunkIndexForId, so id 0 and any id past the pool render fully transparent.
 * Resolves each of the 256 chunk cells (16x16, row-major) to a block, applies the
 * chunk cell's xf/yf to the whole 16x16 block, and tiles the results. Out-of-range
 * block refs also render transparent — never throws (the renderer tolerates
 * transient invalid state during editing).
 */
export function renderChunk(doc: LevelDoc, chunkId: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4);
  const index = chunkIndexForId(doc, chunkId);
  if (index === null) return out; // air ($00) or out-of-range → transparent
  const chunk = doc.chunks[index];
  if (!chunk) return out;

  // Memo distinct block renders for this call: a chunk has up to 256 cells but
  // usually far fewer distinct blocks. Flips are applied per-cell in blit below,
  // so the cached unflipped block buffer is safe to reuse across cells.
  const blockCache = new Map<number, Uint8ClampedArray>();

  const cellsPerRow = CHUNK_PX / BLOCK_PX; // 16
  for (let i = 0; i < chunk.cells.length && i < cellsPerRow * cellsPerRow; i++) {
    const cell = chunk.cells[i];
    if (!cell) continue;
    if (cell.block < 0 || cell.block >= doc.blocks.length) continue; // out-of-range → transparent

    const cx = i % cellsPerRow;
    const cy = (i / cellsPerRow) | 0;
    let blockBuf = blockCache.get(cell.block);
    if (blockBuf === undefined) {
      blockBuf = renderBlock(doc, cell.block);
      blockCache.set(cell.block, blockBuf);
    }
    blit(out, CHUNK_PX, blockBuf, BLOCK_PX, BLOCK_PX, cx * BLOCK_PX, cy * BLOCK_PX, cell.xf, cell.yf);
  }
  return out;
}
