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
