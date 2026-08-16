// src/core/art/canvas-resolve.ts
//
// PIXELS -> AN ABSTRACT TILE/BLOCK/CHUNK COMPOSITION. Pure geometry: this module
// imports no document type and reaches no store. Everything it produces is
// expressed in local HANDLES, not pool ids, because it has no pool.
//
// It refuses nothing and is TOTAL over its input. Every refusal in commit — the
// palette gate, the clash gate, allocation exhaustion, the pool ceilings — lives
// in classic-commit-plan.ts, which also guarantees this module's preconditions:
// a region that is 256-aligned and inside the canvas.
//
// WHAT IS DEDUPED, AND WHY THE TWO TIERS DIFFER:
//
//   tiles  — FLIP-AWARE, via tile-canon. This is the scarce tier (a zone's pool
//            is 454-882 tiles of base art) and the shipped data leans on the
//            VDP's H and V bits heavily, so folding mirrors is where the
//            conservation actually is.
//   blocks — EXACT. Flip-merging blocks would need the flips of the chunk cell
//            each one displaces, because the engine orients the collision
//            heightmap from those bits (see the spec's D3.3) — and that is
//            document knowledge this module does not have. Blocks are also the
//            roomy tier (422-828 free of 1024), so exact dedup costs little.
//
// CHUNK CELLS ARE EMITTED UNFLIPPED, and the planner pre-mirrors with
// `mirrorBlock`. Same reason: keeping the displaced cell's flips is what keeps
// its inherited collision oriented the way it already was, and only the planner
// knows what those flips were.

import type { PixelBuffer } from './pixel-ops';
import { paletteLineOf, isTransparent } from './canvas-doc';
import { CELL, TILE_ENTRIES, readCellEntries, canonicalTile } from './tile-canon';

/** A chunk is 16x16 blocks of 2x2 tiles — 256px on a side. Hardware. */
export const CHUNK_PX = 256;
/** Blocks across a chunk, and cells across a block. */
const BLOCKS_PER_CHUNK_SIDE = 16;
const CELLS_PER_BLOCK_SIDE = 2;
const BLOCK_PX = CELL * CELLS_PER_BLOCK_SIDE; // 16

export interface ResolvedTile {
  /** Canonical key from tile-canon — equal for two cells that are one tile under some flip. */
  key: string;
  /** The canonical entries, 64 of them, ready to pack into 32 bytes. */
  entries: Uint8Array;
  /** Every entry is 0. The planner maps these to pool tile 0 and never allocates. */
  blank: boolean;
}

export interface ResolvedBlockCell {
  tileHandle: number;
  /** Orientation taking the canonical tile back to what was drawn here. */
  xf: boolean;
  yf: boolean;
  /** The single palette line this cell draws from; 0 for an all-transparent cell. */
  palLine: number;
}

/** 4 cells, TL TR BL BR — the same order as BlockDef. */
export interface ResolvedBlock { cells: ResolvedBlockCell[]; blank: boolean }

export interface ResolvedChunkCell { blockHandle: number; xf: boolean; yf: boolean }

/** 256 cells, row-major 16x16 — the same order as ChunkDef256. */
export interface ResolvedChunk { cells: ResolvedChunkCell[] }

export interface CanvasResolution {
  tiles: ResolvedTile[];
  blocks: ResolvedBlock[];
  /** One per 256x256 region cell, row-major across the region. */
  chunks: ResolvedChunk[];
}

/**
 * Pixel-space, and 256-aligned. The planner validates that; this assumes it.
 *
 * NO gridOrigin. Commit works on whole chunks, and a chunk is 256px, so the
 * region's own origin fixes every cell boundary inside it. Threading the
 * canvas's grid origin in as well would give two answers to "where does this
 * cell start" — the overlay's and this module's — and they would drift.
 */
export interface ResolveRegion { x: number; y: number; chunksWide: number; chunksHigh: number }

/** The palette line a cell draws from: the one its non-transparent pixels use.
 *  Transparent pixels have no line (canvasIndex folds every entry-0 spelling to
 *  0), so an all-transparent cell is line 0 rather than a clash. The planner's
 *  clash gate has already established there is at most one. */
function cellPaletteLine(pixels: PixelBuffer, x0: number, y0: number): number {
  for (let y = 0; y < CELL; y++) {
    const row = (y0 + y) * pixels.width + x0;
    for (let x = 0; x < CELL; x++) {
      const v = pixels.data[row + x];
      if (!isTransparent(v)) return paletteLineOf(v);
    }
  }
  return 0;
}

export function resolveCanvasRegion(
  pixels: PixelBuffer, region: ResolveRegion,
): CanvasResolution {
  const tiles: ResolvedTile[] = [];
  const tileHandleOf = new Map<string, number>();
  const blocks: ResolvedBlock[] = [];
  const blockHandleOf = new Map<string, number>();
  const chunks: ResolvedChunk[] = [];
  const scratch = new Uint8Array(TILE_ENTRIES);

  const internTile = (x0: number, y0: number): { handle: number; xf: boolean; yf: boolean } => {
    const canon = canonicalTile(readCellEntries(pixels, x0, y0, scratch));
    let handle = tileHandleOf.get(canon.key);
    if (handle === undefined) {
      // The scratch buffer is reused, so the stored entries must be a copy —
      // otherwise every interned tile ends up aliasing the last cell scanned.
      const entries = new Uint8Array(TILE_ENTRIES);
      for (let i = 0; i < TILE_ENTRIES; i++) entries[i] = canon.key.charCodeAt(i);
      handle = tiles.length;
      tiles.push({ key: canon.key, entries, blank: entries.every((e) => e === 0) });
      tileHandleOf.set(canon.key, handle);
    }
    return { handle, xf: canon.xf, yf: canon.yf };
  };

  const internBlock = (bx: number, by: number): number => {
    const cells: ResolvedBlockCell[] = [];
    for (let cy = 0; cy < CELLS_PER_BLOCK_SIDE; cy++) {
      for (let cx = 0; cx < CELLS_PER_BLOCK_SIDE; cx++) {
        const x0 = bx + cx * CELL, y0 = by + cy * CELL;
        const t = internTile(x0, y0);
        cells.push({
          tileHandle: t.handle, xf: t.xf, yf: t.yf, palLine: cellPaletteLine(pixels, x0, y0),
        });
      }
    }
    const key = blockKey(cells);
    let handle = blockHandleOf.get(key);
    if (handle === undefined) {
      handle = blocks.length;
      blocks.push({ cells, blank: cells.every((c) => tiles[c.tileHandle].blank) });
      blockHandleOf.set(key, handle);
    }
    return handle;
  };

  for (let ky = 0; ky < region.chunksHigh; ky++) {
    for (let kx = 0; kx < region.chunksWide; kx++) {
      const ox = region.x + kx * CHUNK_PX, oy = region.y + ky * CHUNK_PX;
      const cells: ResolvedChunkCell[] = [];
      for (let by = 0; by < BLOCKS_PER_CHUNK_SIDE; by++) {
        for (let bx = 0; bx < BLOCKS_PER_CHUNK_SIDE; bx++) {
          cells.push({
            blockHandle: internBlock(ox + bx * BLOCK_PX, oy + by * BLOCK_PX),
            // Unflipped by construction — see the header.
            xf: false, yf: false,
          });
        }
      }
      chunks.push({ cells });
    }
  }

  return { tiles, blocks, chunks };
}

/** Structural identity of a block: dedup is EXACT, so every field counts. */
function blockKey(cells: ResolvedBlockCell[]): string {
  return cells.map((c) => `${c.tileHandle}:${c.xf ? 1 : 0}${c.yf ? 1 : 0}:${c.palLine}`).join('|');
}

/**
 * The block that, once the chunk cell's flip is applied, renders what `b`
 * renders unflipped.
 *
 * A chunk-cell flip mirrors the WHOLE block, which both reorders which cell sits
 * where and flips the tile inside it — so this does both. It is an involution,
 * which is what lets the planner apply it without a direction to get backwards.
 *
 * `palLine` is carried unchanged: a mirror moves cells, it does not recolour
 * them.
 */
export function mirrorBlock(b: ResolvedBlock, xf: boolean, yf: boolean): ResolvedBlock {
  if (!xf && !yf) return b;
  const cells: ResolvedBlockCell[] = [];
  for (let cy = 0; cy < CELLS_PER_BLOCK_SIDE; cy++) {
    for (let cx = 0; cx < CELLS_PER_BLOCK_SIDE; cx++) {
      const sx = xf ? CELLS_PER_BLOCK_SIDE - 1 - cx : cx;
      const sy = yf ? CELLS_PER_BLOCK_SIDE - 1 - cy : cy;
      const src = b.cells[sy * CELLS_PER_BLOCK_SIDE + sx];
      cells.push({
        tileHandle: src.tileHandle,
        xf: xf ? !src.xf : src.xf,
        yf: yf ? !src.yf : src.yf,
        palLine: src.palLine,
      });
    }
  }
  return { cells, blank: b.blank };
}
