// src/core/art/classic-surface-buffer.ts
//
// Composes classic's referenced-by-id art into ONE editable pixel surface, and
// records where every 8x8 cell came from so a write can be resolved back down.
//
// Flip composition lives here and ONLY here: a chunk cell's flip mirrors the whole
// 16x16 block, which both reorders which block cell sits where AND mirrors the tile
// inside it. Getting that wrong produces plausible-looking but wrong pixels, so it
// is isolated in one pure function with direct test coverage.
//
// Pure core — no fs, no DOM, no store.

import type { PixelBuffer } from './pixel-ops';
import { tileToBuffer } from './classic-tile-buffer';
import { chunkIndexForId, type LevelDoc } from '../level-classic/model';

const TILE_PX = 8;

/** One 8x8 cell of a composed surface, and the document location it came from. */
export interface SurfaceCell {
  /** Index into `doc.chunks[i].cells`, or null when the surface is a bare block. */
  chunkCellIndex: number | null;
  blockId: number;
  /** 0..3 — index into `BlockDef.cells` (TL, TR, BL, BR). */
  blockCellIndex: number;
  tileIndex: number;
  /** COMPOSED orientation: the block cell's flip XORed with the chunk cell's. */
  xf: boolean;
  yf: boolean;
  pal: number;
}

export interface SurfaceProvenance {
  /** Row-major, length cellsX * cellsY. */
  cells: SurfaceCell[];
  cellsX: number;
  cellsY: number;
  /** The chunk this surface composes, as an index into doc.chunks; null for a block. */
  chunkIndex: number | null;
}

export interface Surface {
  buffer: PixelBuffer;
  provenance: SurfaceProvenance;
}

/** Blit one tile into the surface at a cell position, honouring the composed flips. */
function blitCell(
  out: PixelBuffer, doc: LevelDoc, c: SurfaceCell, cellX: number, cellY: number,
): void {
  const tile = tileToBuffer(doc.tiles, c.tileIndex);
  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const sx = c.xf ? TILE_PX - 1 - px : px;
      const sy = c.yf ? TILE_PX - 1 - py : py;
      const dx = cellX * TILE_PX + px;
      const dy = cellY * TILE_PX + py;
      out.data[dy * out.width + dx] = tile.data[sy * TILE_PX + sx];
    }
  }
}

function composeFrom(doc: LevelDoc, cells: SurfaceCell[], cellsX: number, cellsY: number,
  chunkIndex: number | null): Surface {
  const buffer: PixelBuffer = {
    width: cellsX * TILE_PX,
    height: cellsY * TILE_PX,
    data: new Uint8Array(cellsX * cellsY * TILE_PX * TILE_PX),
  };
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      blitCell(buffer, doc, cells[cy * cellsX + cx], cx, cy);
    }
  }
  return { buffer, provenance: { cells, cellsX, cellsY, chunkIndex } };
}

/** Compose one 16x16 block into a 2x2-cell surface. */
export function buildBlockSurface(doc: LevelDoc, blockId: number): Surface {
  const block = doc.blocks[blockId];
  const cells: SurfaceCell[] = [];
  for (let i = 0; i < 4; i++) {
    const bc = block?.cells[i];
    cells.push({
      chunkCellIndex: null,
      blockId,
      blockCellIndex: i,
      tileIndex: bc?.tile ?? 0,
      xf: bc?.xf ?? false,
      yf: bc?.yf ?? false,
      pal: bc?.pal ?? 0,
    });
  }
  return composeFrom(doc, cells, 2, 2, null);
}

/**
 * Compose one 256x256 chunk into a 32x32-cell surface.
 *
 * `chunkIndex` is a FILE-ORDER index into `doc.chunks`, not an engine id — use
 * `chunkIndexForId` to convert a layout byte first.
 *
 * The flip rule, stated once: a chunk cell's xflip mirrors the whole 16x16 block.
 * That means (a) the left and right sub-tiles trade places, and (b) each tile is
 * itself mirrored. (a) is the `srcSx` lookup; (b) is the XOR into `xf`. Doing only
 * one of the two is the classic way to get this wrong, and it looks almost right.
 */
export function buildChunkSurface(doc: LevelDoc, chunkIndex: number): Surface {
  const chunk = doc.chunks[chunkIndex];
  const cellsX = 32, cellsY = 32;
  const cells: SurfaceCell[] = new Array(cellsX * cellsY);

  // Index legend, because four loop variables over two nested grids is easy to
  // transpose: by/bx range over the chunk's 16x16 grid of BLOCKS; sy/sx range over
  // the 2x2 grid of TILE cells inside each block. Hence the two different strides —
  // `by * 16 + bx` indexes the chunk's own cell array, while the surface is
  // `(by * 2 + sy) * cellsX + (bx * 2 + sx)` because it is twice as wide in cells.
  for (let by = 0; by < 16; by++) {
    for (let bx = 0; bx < 16; bx++) {
      const chunkCellIndex = by * 16 + bx;
      const cc = chunk?.cells[chunkCellIndex];
      const blockId = cc?.block ?? 0;
      const cxf = cc?.xf ?? false;
      const cyf = cc?.yf ?? false;
      const block = doc.blocks[blockId];

      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          // (a) the chunk flip reorders which block cell sits at this sub-position
          const srcSx = cxf ? 1 - sx : sx;
          const srcSy = cyf ? 1 - sy : sy;
          const blockCellIndex = srcSy * 2 + srcSx;
          const bc = block?.cells[blockCellIndex];

          cells[(by * 2 + sy) * cellsX + (bx * 2 + sx)] = {
            chunkCellIndex,
            blockId,
            blockCellIndex,
            tileIndex: bc?.tile ?? 0,
            // (b) ...and mirrors the tile within it
            xf: (bc?.xf ?? false) !== cxf,
            yf: (bc?.yf ?? false) !== cyf,
            pal: bc?.pal ?? 0,
          };
        }
      }
    }
  }
  return composeFrom(doc, cells, cellsX, cellsY, chunkIndex);
}

/** Convenience: compose by ENGINE chunk id (layout byte), returning null for air. */
export function buildChunkSurfaceById(doc: LevelDoc, chunkId: number): Surface | null {
  const idx = chunkIndexForId(doc, chunkId);
  return idx === null ? null : buildChunkSurface(doc, idx);
}

export interface TileHit {
  /** Index into provenance.cells. */
  cellIndex: number;
  tileIndex: number;
  /** Coordinates within the STORED tile (flips undone), 0..7. */
  tx: number;
  ty: number;
}

/**
 * Resolve a surface pixel to the stored tile pixel it is drawn from.
 *
 * This is the EXACT inverse of `blitCell` above, and lives beside it so the two
 * can be read against each other — an inverse that drifts from its forward map is
 * the kind of bug that produces plausible-looking wrong pixels.
 */
export function surfaceToTile(p: SurfaceProvenance, x: number, y: number): TileHit | null {
  if (x < 0 || y < 0 || x >= p.cellsX * TILE_PX || y >= p.cellsY * TILE_PX) return null;
  const cellIndex = (y >> 3) * p.cellsX + (x >> 3);
  const c = p.cells[cellIndex];
  if (!c) return null;
  const px = x & 7, py = y & 7;
  return {
    cellIndex,
    tileIndex: c.tileIndex,
    tx: c.xf ? TILE_PX - 1 - px : px,
    ty: c.yf ? TILE_PX - 1 - py : py,
  };
}
