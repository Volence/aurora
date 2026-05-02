import type { Tile, Block, Chunk, Palette } from '../model/types';

// TODO: This module was part of the legacy S2 chunk sheet importer.
// It needs to be rewritten for the S4 tile-based system.

export interface GridLayout {
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
}

export interface ImportResult {
  tiles: Tile[];
  blocks: Block[];
  chunks: Chunk[];
  tileCount: number;
  blockCount: number;
  chunkCount: number;
  chunkGridPositions: number[];
  warnings: string[];
}

export function importChunkSheet(
  _sourceImage: ImageData,
  _palette: Palette,
  _gridCols: number,
  _gridRows: number,
  _maxTiles: number,
  _selectedChunks: Set<number>,
  _layout: GridLayout,
): ImportResult {
  // Stub: returns empty result
  return {
    tiles: [],
    blocks: [],
    chunks: [],
    tileCount: 0,
    blockCount: 0,
    chunkCount: 0,
    chunkGridPositions: [],
    warnings: ['Chunk sheet import not yet implemented for S4 engine'],
  };
}
