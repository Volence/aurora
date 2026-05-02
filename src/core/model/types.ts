// Re-export S4 types as the canonical model
export type {
  Tile,
  Color,
  PaletteLine,
  Palette,
  Section,
  SectionTileGrid,
  ObjectPlacement,
  RingPlacement,
  ChunkDef,
  ObjectDef,
  Tileset,
  Act,
  Zone,
  S4Project,
} from './s4-types';

export {
  createSection,
  createSectionTileGrid,
  createChunkDef,
  packNametableWord,
  unpackNametableWord,
  SECTION_TILES_WIDE,
  SECTION_TILES_HIGH,
  SECTION_PIXEL_SIZE,
  BLOCK_TILES,
  BLOCK_PIXEL_SIZE,
  BLOCKS_PER_SECTION,
  SF_HAS_WATER,
  SF_UNDERGROUND,
  SF_NO_Y_WRAP,
  SF_PRESERVE_STATE,
} from './s4-types';

// Legacy types for backwards-compat with import/export modules (S2-era Tile->Block->Chunk hierarchy)
export interface TileRef {
  tileIndex: number;
  xFlip: boolean;
  yFlip: boolean;
  palette: number;
  priority: boolean;
}

export interface Block {
  tiles: TileRef[];
}

export interface BlockRef {
  blockIndex: number;
  xFlip: boolean;
  yFlip: boolean;
  solidTop: boolean;
  solidAll: boolean;
}

export interface Chunk {
  blocks: BlockRef[];
}
