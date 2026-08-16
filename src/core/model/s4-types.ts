export const SECTION_TILES_WIDE = 256;
export const SECTION_TILES_HIGH = 256;
export const SECTION_PIXEL_SIZE = 2048;
export const BLOCK_TILES = 16;
export const BLOCK_PIXEL_SIZE = 128;
export const BLOCKS_PER_SECTION = 16;
/** Engine cap: an act's grid_w * grid_h must be <= this (s4_engine constants.asm
 *  MAX_ACT_SECTIONS; the ROM build asserts it). The editor must not exceed it. */
export const MAX_ACT_SECTIONS = 48;

export interface SectionTileGrid {
  width: number;
  height: number;
  nametable: Uint16Array;
}

export function createSectionTileGrid(): SectionTileGrid {
  return {
    width: SECTION_TILES_WIDE,
    height: SECTION_TILES_HIGH,
    nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
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
  /** Section-LOCAL pixel coordinates, 0..$7FF (SECTION_PIXEL_SIZE - 1). The
   *  exporter hard-fails outside that range (core/export/entity-data.ts). */
  x: number;
  y: number;
  typeId: string;
  subtype: number;
  /** Horizontal / vertical mirror, packed into the placement word's OEF_XFLIP /
   *  OEF_YFLIP bits on export. Optional because every act saved before these
   *  existed omits them, and `.objects.json` is a straight JSON round-trip of
   *  this interface — absent reads back as undefined and exports as unflipped. */
  xflip?: boolean;
  yflip?: boolean;
}

export interface RingPlacement {
  x: number;
  y: number;
}

export interface Section {
  index: number;
  name: string;
  tileGrid: SectionTileGrid;
  /** Read-only per-cell engine collision attr indices (0-255), loaded from the
   *  baked strips — the game's ground-truth collision. Used by the collision VIEW
   *  and as the seed for collisionEdit when no .collattr.bin exists.
   *  null when no strip source is available. `engineCollision` is path A;
   *  `engineCollisionB` is the alternate plane (dual-layer/loop sections). */
  engineCollision?: Uint8Array | null;
  engineCollisionB?: Uint8Array | null;
  /** Editable path-A collision plane — TILE-indexed: widthTiles*heightTiles
   *  16-bit words, one per 8px TILE, with all four sub-tiles of a 16px cell
   *  holding the same word (collision-cell-word.ts: base-bank shape | X/Y-flip |
   *  per-plane solidity). The authored resolution is 16px; the array is at tile
   *  resolution because that is what the strip codec and overlay sample. Keep
   *  every write 2x2-uniform — ChunkDef.collisionA is CELL-indexed, so crossing
   *  between them needs cellTileIndices, never a raw copy.
   *  Seeded from a saved .collattr.bin (16-bit BE) or packed from engineCollision;
   *  rendered by the view and written by set-collision-edit. The bake resolves the
   *  flags into the runtime 1-byte attr index. Separate from engineCollision
   *  (read-only strip reference). */
  collisionEdit?: Uint16Array | null;
  /** Editable path-B collision plane (the alternate/loop layer), mirror of
   *  collisionEdit. Seeded from engineCollisionB or a saved .collattrb.bin. */
  collisionEditB?: Uint16Array | null;
  objects: ObjectPlacement[];
  rings: RingPlacement[];
  /**
   * Suffixes of this section's files that EXIST on disk but Aurora could not
   * read or parse — `'objects.json'`, `'rings.json'`, `'tiles.bin'`.
   *
   * Absent and unreadable are not the same fact, and the loader used to
   * conflate them: a truncated hand-edit or a merge-conflict marker in
   * objects.json opened the project with zero objects in that section, said
   * nothing, and the next save wrote `[]` over every placement. The in-memory
   * value for such a file is a PLACEHOLDER, not the user's data, so the save
   * plan omits it — Aurora does not overwrite what it never understood.
   */
  unreadable?: string[];
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
  /** Dual-plane authored collision: one 16-bit cell word (collision-cell-word.ts)
   *  per 16px cell — (widthTiles/2)*(heightTiles/2) words, i.e. CELL-indexed.
   *
   *  NOT the same indexing as Section.collisionEdit/collisionEditB, which are
   *  TILE-indexed (widthTiles*heightTiles, 4x larger, every cell's four
   *  sub-tiles holding the same word). A stamp must EXPAND cell -> 4 tiles via
   *  collision/collision-cell.ts's cellTileIndices; a copyWithin/set() fast path
   *  between the two silently corrupts the plane. (An earlier version of this
   *  comment claimed they "copy verbatim" — they do not.) */
  collisionA: Uint16Array;
  collisionB: Uint16Array;
}

/** Count of 16px collision cells in a widthTiles x heightTiles chunk (one cell
 *  per 2x2 tile block). */
export function chunkCellCount(widthTiles: number, heightTiles: number): number {
  return (widthTiles >> 1) * (heightTiles >> 1);
}

export function createChunkDef(
  id: string,
  name: string,
  widthTiles: number,
  heightTiles: number,
): ChunkDef {
  const size = widthTiles * heightTiles;
  const cellCount = chunkCellCount(widthTiles, heightTiles);
  return {
    id,
    name,
    widthTiles,
    heightTiles,
    nametable: new Uint16Array(size),
    collisionA: new Uint16Array(cellCount),
    collisionB: new Uint16Array(cellCount),
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

/**
 * A named background in the project BG library. Sections reference entries by
 * id via Section.bgLayoutRef (null = the act default act.bgLayout/bgTiles,
 * which conceptually participates as id null). Layout indices are LOCAL to
 * the entry's tile blob, matching the act-default BG convention.
 */
export interface BgLibraryEntry {
  id: string;
  name: string;
  layout: Uint16Array;
  tiles: Tile[];
}

export interface S4Project {
  name: string;
  zones: Zone[];
  objectLibrary: ObjectDef[];
  chunkLibrary: ChunkDef[];
  bgLibrary: BgLibraryEntry[];
  basePath: string;
}

export const SF_HAS_WATER = 1 << 0;
export const SF_UNDERGROUND = 1 << 1;
export const SF_NO_Y_WRAP = 1 << 2;
export const SF_PRESERVE_STATE = 1 << 3;
