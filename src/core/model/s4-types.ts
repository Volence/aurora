export const SECTION_TILES_WIDE = 256;
export const SECTION_TILES_HIGH = 256;
export const SECTION_PIXEL_SIZE = 2048;
export const BLOCK_TILES = 16;
export const BLOCK_PIXEL_SIZE = 128;
export const BLOCKS_PER_SECTION = 16;

export interface SectionTileGrid {
  width: number;
  height: number;
  nametable: Uint16Array;
  collision: Uint8Array;
}

export function createSectionTileGrid(): SectionTileGrid {
  return {
    width: SECTION_TILES_WIDE,
    height: SECTION_TILES_HIGH,
    nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
    collision: new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
  };
}

export interface NametableEntry {
  tileIndex: number;
  palette: number;
  priority: boolean;
  vFlip: boolean;
  hFlip: boolean;
}

export function packNametableWord(
  tileIndex: number,
  palette: number,
  priority: boolean,
  vFlip: boolean,
  hFlip: boolean,
): number {
  return (
    (tileIndex & 0x7FF) |
    ((hFlip ? 1 : 0) << 11) |
    ((vFlip ? 1 : 0) << 12) |
    ((palette & 0x3) << 13) |
    ((priority ? 1 : 0) << 15)
  );
}

export function unpackNametableWord(word: number): NametableEntry {
  return {
    tileIndex: word & 0x7FF,
    hFlip: (word & 0x0800) !== 0,
    vFlip: (word & 0x1000) !== 0,
    palette: (word >> 13) & 0x3,
    priority: (word & 0x8000) !== 0,
  };
}

export interface ObjectPlacement {
  x: number;
  y: number;
  typeId: string;
  subtype: number;
}

export interface RingPlacement {
  x: number;
  y: number;
}

export interface Section {
  index: number;
  name: string;
  tileGrid: SectionTileGrid;
  objects: ObjectPlacement[];
  rings: RingPlacement[];
  tiles: Tile[] | null;
  paletteRef: string | null;
  parallaxRef: string | null;
  bgLayoutRef: string | null;
  flags: number;
  music: number;
}

export function createSection(index: number, name: string): Section {
  return {
    index,
    name,
    tileGrid: createSectionTileGrid(),
    objects: [],
    rings: [],
    tiles: null,
    paletteRef: null,
    parallaxRef: null,
    bgLayoutRef: null,
    flags: 0,
    music: 0,
  };
}

export interface ChunkDef {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;
  collision: Uint8Array;
}

export function createChunkDef(
  id: string,
  name: string,
  widthTiles: number,
  heightTiles: number,
): ChunkDef {
  const size = widthTiles * heightTiles;
  return {
    id,
    name,
    widthTiles,
    heightTiles,
    nametable: new Uint16Array(size),
    collision: new Uint8Array(size),
  };
}

export interface ObjectDef {
  id: string;
  name: string;
  codeLabel: string;
  sprite?: string;
  defaultSubtype: number;
  properties: Record<string, unknown>;
}

export interface Tile {
  pixels: Uint8Array;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PaletteLine {
  colors: Color[];
}

export interface Palette {
  lines: PaletteLine[];
}

export interface Tileset {
  tiles: Tile[];
  collisionTypes: Uint8Array;
}

export interface Act {
  id: string;
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
  startPosition: { secX: number; secY: number; localX: number; localY: number };
  bgLayout: Uint16Array | null;
  bgTiles: Tile[] | null;
  parallaxRef: string | null;
}

export interface Zone {
  id: string;
  name: string;
  acts: Act[];
  tileset: Tileset;
  palette: Palette;
}

export interface S4Project {
  name: string;
  zones: Zone[];
  objectLibrary: ObjectDef[];
  chunkLibrary: ChunkDef[];
  basePath: string;
}

export const SF_HAS_WATER = 1 << 0;
export const SF_UNDERGROUND = 1 << 1;
export const SF_NO_Y_WRAP = 1 << 2;
export const SF_PRESERVE_STATE = 1 << 3;
