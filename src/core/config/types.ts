// Compression type (legacy S2/S3K config support)
export type CompressionType = 'none' | 'nemesis' | 'kosinski' | 'kosinski-m' | 'enigma' | 'saxman' | 'comper';

/** Reference to a palette file with loading parameters */
export interface PaletteRef {
  path: string;
  srcOffset: number;    // byte offset into palette file
  destOffset: number;   // destination color index (0-63)
  length: number;       // number of colors to load
}

/** Format parameters for tiles */
export interface TileFormat {
  bpp: number;              // bits per pixel (4 for Genesis)
  width: number;            // pixels (8)
  height: number;           // pixels (8)
  compression: CompressionType;
}

/** Format parameters for blocks */
export interface BlockFormat {
  tilesWide: number;        // 2 for 16x16
  tilesHigh: number;        // 2 for 16x16
  refSize: number;          // bytes per tile ref (2)
  compression: CompressionType;
}

/** Format parameters for chunks */
export interface ChunkFormat {
  blocksWide: number;       // 8 for 128x128
  blocksHigh: number;       // 8 for 128x128
  refSize: number;          // bytes per block ref (2)
  compression: CompressionType;
}

/** Format parameters for layouts */
export interface LayoutFormat {
  format: 's2' | 's3k' | 'raw';
  chunkIndexSize: number;   // 1 for S2 (byte), 2 for S3K (word)
  compression: CompressionType;
}

/** Format parameters for object placement */
export interface ObjectFormat {
  entrySize: number;        // bytes per object entry (6)
  terminator: number[];     // e.g. [0xFF, 0xFF]
}

/** Format parameters for ring placement */
export interface RingFormat {
  entrySize: number;        // bytes per ring entry (4)
  terminator: number[];     // e.g. [0xFF, 0xFF, 0xFF, 0xFF]
}

/** Default format settings for an engine version */
export interface FormatDefaults {
  tile: TileFormat;
  block: BlockFormat;
  chunk: ChunkFormat;
  layout: LayoutFormat;
  objects: ObjectFormat;
  rings: RingFormat;
}

/** Section configuration */
export interface SectionConfig {
  index: number;
  name: string;
  layout: string;           // path to layout binary
  objects: string;           // path to object placement
  rings: string;             // path to ring placement
  palette?: PaletteRef[];    // override palette
  width?: number;            // override section width (chunks)
  formatOverrides?: Partial<FormatDefaults>;
}

/** Level configuration */
export interface LevelConfig {
  id: string;
  name: string;
  art: {
    tiles: string;
    tilesCompression?: CompressionType;
    blocks: string;
    blocksCompression?: CompressionType;
    chunks: string;
    chunksCompression?: CompressionType;
  };
  palette: PaletteRef[];
  collisionIndex1?: string;
  collisionIndex2?: string;
  sections: SectionConfig[];
  formatOverrides?: Partial<FormatDefaults>;

  /** Section grid dimensions. Sections are arranged in a 2D grid (row-major order).
   *  gridWidth × gridHeight = number of sections. Default: Nx1 (horizontal strip). */
  gridWidth?: number;
  gridHeight?: number;

  /** Combined object file path (engine loads objects from this, not per-section files) */
  combinedObjects?: string;
  /** Combined ring file path (fallback for non-section zones) */
  combinedRings?: string;
}

/** Subtype preset for an object */
export interface ObjectSubtypeDef {
  name: string;
  value: number;              // subtype byte value
}

/** Object sprite definition for the level editor */
export interface ObjectSpriteDef {
  name: string;
  art: string;                // path to art file (Nemesis-compressed)
  artCompression?: CompressionType;
  mappings: string;           // path to sprite mapping file
  frame?: number;             // which frame to show (default: 0)
  palette?: number;           // override palette line
  subtypes?: ObjectSubtypeDef[];
}

/** Top-level project configuration */
export interface ProjectConfig {
  name: string;
  version: string;          // "S2", "S3K", "S1", "SCE", etc.
  basePath: string;         // root directory for relative paths

  globals: {
    endian: 'big' | 'little';
    objectDefinitions?: string;
    collisionArray1?: string;
    collisionArray2?: string;
    collisionAngles?: string;
  };

  formatDefaults: FormatDefaults;
  levels: LevelConfig[];

  /** Object sprite definitions: maps object type ID (hex string) to sprite info */
  objectSprites?: Record<string, ObjectSpriteDef>;
}

/** Preset defaults for known engine versions */
export const ENGINE_DEFAULTS: Record<string, FormatDefaults> = {
  S2: {
    tile: { bpp: 4, width: 8, height: 8, compression: 'nemesis' },
    block: { tilesWide: 2, tilesHigh: 2, refSize: 2, compression: 'kosinski' },
    chunk: { blocksWide: 8, blocksHigh: 8, refSize: 2, compression: 'kosinski' },
    layout: { format: 's2', chunkIndexSize: 1, compression: 'none' },
    objects: { entrySize: 6, terminator: [0xFF, 0xFF] },
    rings: { entrySize: 4, terminator: [0xFF, 0xFF, 0xFF, 0xFF] },
  },
  S3K: {
    tile: { bpp: 4, width: 8, height: 8, compression: 'nemesis' },
    block: { tilesWide: 2, tilesHigh: 2, refSize: 2, compression: 'kosinski' },
    chunk: { blocksWide: 8, blocksHigh: 8, refSize: 2, compression: 'kosinski' },
    layout: { format: 's3k', chunkIndexSize: 2, compression: 'kosinski' },
    objects: { entrySize: 6, terminator: [0xFF, 0xFF] },
    rings: { entrySize: 4, terminator: [0xFF, 0xFF, 0xFF, 0xFF] },
  },
};
