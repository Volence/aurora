// Chunk prerender for the classic (Sonic 1) LevelDoc — resolves a chunk id to a
// flat 256x256 RGBA buffer by walking chunk → block → tile, composing chunk-cell
// and block-cell flips, applying palette lines, and honoring transparent color 0.
//
// Pure core: no canvas, no DOM, no ImageData. Callers (the classic viewport, the
// chunk-picker thumbnails, the composer docks) wrap the returned
// Uint8ClampedArray in ImageData themselves. Called per chunk on invalidation,
// so a plain double loop is fine.
//
// This module is now classic's ADAPTER onto the shared rasterizer in
// `core/art/rasterize.ts` — it owns the S1-specific shape (4bpp packed pool,
// block indirection, 1-based chunk ids, raw CRAM palettes) and delegates the
// per-pixel and per-rect work. `core/art/__tests__/rasterize.test.ts` proves the
// output is byte-identical to the pre-extraction implementation.
//
// Classic palettes stay raw CRAM words the whole way: they are converted
// straight to an RGBA lookup table by `lutFromCramWords` and never pass through
// the aeon `Color` model, which is lossy in both directions and would break the
// byte-identity the save path's recompose self-check depends on.
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

import {
  TILE_PX,
  TILE_RGBA_BYTES,
  blitRgba,
  drawTileInto,
  lutFromCramWords,
  rasterizeTile,
  unpack4bppTile,
  type PaletteLut,
} from '../art/rasterize';
import { chunkIndexForId, type LevelDoc } from './model';

const BLOCK_PX = 16;
const CHUNK_PX = 256;

/**
 * Lazily built LUT per palette line, reused across a whole chunk render. The
 * pre-extraction code decoded a CRAM word per non-transparent PIXEL — up to a
 * quarter of a million `decodeGenesisColor` calls (each allocating an object)
 * for one 256x256 chunk.
 */
function lutCache(doc: LevelDoc): (pal: number) => PaletteLut {
  const cache: (PaletteLut | undefined)[] = [];
  return (pal) => {
    let lut = cache[pal];
    if (lut === undefined) {
      lut = lutFromCramWords(doc.palettes[pal] ?? doc.palettes[0] ?? new Uint16Array(16));
      cache[pal] = lut;
    }
    return lut;
  };
}

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
  const indices = unpack4bppTile(tiles, tileIndex);
  if (!indices) return new Uint8ClampedArray(TILE_RGBA_BYTES); // zeroed = transparent
  return rasterizeTile(indices, lutFromCramWords(palette), xf, yf);
}

/** Shared body of renderBlock, with the caller's per-render palette LUT cache. */
function drawBlock(doc: LevelDoc, blockId: number, lutFor: (pal: number) => PaletteLut): Uint8ClampedArray {
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
  const indices = new Uint8Array(TILE_PX * TILE_PX); // scratch, reused per cell
  for (let i = 0; i < 4; i++) {
    const cell = block.cells[i];
    if (!cell) continue;
    if (!unpack4bppTile(doc.tiles, cell.tile, indices)) continue; // out of pool → transparent
    const [bx, by] = positions[i];
    drawTileInto(out, BLOCK_PX, bx * TILE_PX, by * TILE_PX, indices, lutFor(cell.pal), cell.xf, cell.yf);
  }
  return out;
}

/**
 * Render a 16x16 block (4 tile cells in TL, TR, BL, BR order) to an RGBA buffer.
 * A missing block yields a transparent buffer. Exported for the composer dock's
 * block thumbnails / block-tab preview (renderChunk uses it internally per cell).
 */
export function renderBlock(doc: LevelDoc, blockId: number): Uint8ClampedArray {
  return drawBlock(doc, blockId, lutCache(doc));
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

  const lutFor = lutCache(doc);

  // Memo distinct block renders for this call: a chunk has up to 256 cells but
  // usually far fewer distinct blocks. Flips are applied per-cell in blitRgba
  // below, so the cached unflipped block buffer is safe to reuse across cells.
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
      blockBuf = drawBlock(doc, cell.block, lutFor);
      blockCache.set(cell.block, blockBuf);
    }
    blitRgba(out, CHUNK_PX, blockBuf, BLOCK_PX, BLOCK_PX, cx * BLOCK_PX, cy * BLOCK_PX, cell.xf, cell.yf);
  }
  return out;
}
