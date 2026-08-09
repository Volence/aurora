// Bundled Sonic 1 disassembly profile — a hardcoded, pure-data description of the
// stock GitHub s1disasm on-disk layout. It is the single source of truth an
// S1ProjectAdapter resolves against; nothing here does IO.
//
// Transcribed ONCE, at authoring time, from the SonLVL ground-truth INI:
//   s1disasm/Utility Project Files/SonLVL INI Files/SonLVL.rev01.ini
// (SonLVL INIs are a design-time input only — Aurora never parses them at
// runtime; see spec §Non-goals.) Paths are project-relative POSIX (the disasm
// root), i.e. the INI's `../../foo` becomes `foo` and an INI-dir-relative
// `GHZ/x.unc` becomes `Utility Project Files/SonLVL INI Files/GHZ/x.unc`.
//
// Types are named generically (LevelZone/LevelAct/…, not "S1Zone") so a future
// profiles/s2.ts can reuse them unchanged; nothing S2-specific is built here.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A project-relative path that may ship in two revisions. The disasm carries
 * REV00/REV01 variants of a handful of files (some chunk tables, objpos, one
 * background). `path` is the PREFERRED file (REV01 when a pair exists, else the
 * sole file); `rev00Path` is the fallback the adapter uses only when `path` is
 * absent on disk. Fields with no revision pair carry `rev00Path: undefined`.
 */
export interface VariantPath {
  path: string;
  rev00Path?: string;
}

/**
 * One slice of a composed palette, transcribed verbatim from an INI `palette=`
 * triplet `file:srcOffset:destOffset:length`. Offsets/length are in palette
 * ENTRIES (individual CRAM colours, 16 per line); a full palette is 64 entries.
 * e.g. GHZ = Sonic.bin[0..16)→[0..16) then Green Hill Zone.bin[0..48)→[16..64).
 */
export interface PaletteComponent {
  file: string;
  srcOffset: number;
  destOffset: number;
  length: number;
}

/**
 * An animated-art overlay: raw 4bpp tiles blitted into the level tile pool so
 * chunks referencing those slots render (frame animation is out of scope for
 * v1). Transcribed from INI `animtilesN=file:srcOffset:vramAddr:tileCount`.
 *
 * UNITS — both offsets count 8x8 TILES, not bytes (verified against the files):
 *  - `srcTileOffset` is the INI's 2nd field. `Flowers at Ending.unc` is 4096
 *    bytes = 128 tiles and is sliced at offsets 0/32/80 for 16 tiles each; 80 as
 *    a byte offset would be tile-unaligned, so it is a tile offset. Byte offset
 *    into the file = `srcTileOffset * 32`.
 *  - `vramTileIndex` is the INI's 3rd field (e.g. 0x378). Despite looking like a
 *    VRAM byte address it is a tile INDEX: the GHZ entries pack contiguously by
 *    index (stalk@0x358 len4, large@0x35C len16, small@0x36C len12,
 *    waterfall@0x378 len8), which only lines up counting tiles. It is stored
 *    verbatim — do NOT divide by 32. VRAM byte address = `vramTileIndex * 32`.
 */
export interface AnimatedArtEntry {
  file: string;
  srcTileOffset: number;
  vramTileIndex: number;
  tileCount: number;
}

/** One playable act: the full set of files needed to load/render it. */
export interface LevelAct {
  /** 1-based act number within the zone. */
  act: number;
  /** Display name from the INI section header, e.g. "Green Hill Zone Act 1". */
  name: string;
  /**
   * 8x8 tile art file(s), decoded (Nemesis) and concatenated in order. GHZ ships
   * two files; every other zone one. SBZ act 3 borrows LZ art.
   */
  tiles: string[];
  /** map16 block (16x16) definitions — Enigma-compressed. */
  blocks: VariantPath;
  /** map256 chunk (256x256) definitions — Kosinski-compressed. */
  chunks: VariantPath;
  /** collide/{ZONE}.bin — per-chunk collision-block index. */
  colind: VariantPath;
  /** Foreground chunk layout (uncompressed). Per act. */
  fgLayout: VariantPath;
  /** Background chunk layout (uncompressed). Per act in S1 (MZ/SBZ differ). */
  bgLayout: VariantPath;
  /** Object placement list (uncompressed). */
  objpos: VariantPath;
  /** Player start position (top-level "Level Start" file; Credits/SS ignored). */
  startpos: VariantPath;
  /** Composed base palette. */
  palette: PaletteComponent[];
  /** Underwater palette variant, when the act has a water table (LZ acts, SBZ3). */
  waterPalette?: PaletteComponent[];
  /** Animated-art overlays loaded into the tile pool (may be empty). */
  animatedArt: AnimatedArtEntry[];
}

export interface LevelZone {
  /** Short lowercase key, e.g. 'ghz'. Used for ZoneActRef.zone + report keys. */
  id: string;
  /** Display name, e.g. "Green Hill Zone". */
  name: string;
  acts: LevelAct[];
}

/** The three global collision lookup tables, shared by every act. */
export interface GlobalCollision {
  /** Collision Array (Normal) — height map per collision block. */
  normal: string;
  /** Collision Array (Rotated) — width map per collision block. */
  rotated: string;
  /** Angle Map — surface angle per collision block. */
  angleMap: string;
}

export interface ClassicProfile {
  zones: LevelZone[];
  collision: GlobalCollision;
}

// ---------------------------------------------------------------------------
// Builders (pure, run once at module init — still "pure data")
// ---------------------------------------------------------------------------

function v(path: string, rev00Path?: string): VariantPath {
  return rev00Path === undefined ? { path } : { path, rev00Path };
}

/** Base composition shared by every zone: Sonic line 0 + a 48-entry zone palette. */
const SONIC_LINE0: PaletteComponent = {
  file: 'palette/Sonic.bin',
  srcOffset: 0,
  destOffset: 0,
  length: 16,
};
function basePalette(zoneFile: string): PaletteComponent[] {
  return [SONIC_LINE0, { file: `palette/${zoneFile}`, srcOffset: 0, destOffset: 16, length: 48 }];
}

const INI_DIR = 'Utility Project Files/SonLVL INI Files';

// --- Per-zone shared data --------------------------------------------------

const GHZ_TILES = ['artnem/8x8 - GHZ1.nem', 'artnem/8x8 - GHZ2.nem'];
const GHZ_PALETTE = basePalette('Green Hill Zone.bin');
// animtiles1-8 from [Green Hill Zone Act 1] (identical across GHZ acts).
// 5-8 are the ending-flower overlays the INI also lists under GHZ.
const GHZ_ANIM: AnimatedArtEntry[] = [
  { file: 'artunc/GHZ Waterfall.unc', srcTileOffset: 0, vramTileIndex: 0x378, tileCount: 8 },
  { file: 'artunc/GHZ Flower Large.unc', srcTileOffset: 0, vramTileIndex: 0x35c, tileCount: 16 },
  { file: 'artunc/GHZ Flower Small.unc', srcTileOffset: 0, vramTileIndex: 0x36c, tileCount: 12 },
  { file: `${INI_DIR}/GHZ/GHZ Flower Stalk.unc`, srcTileOffset: 0, vramTileIndex: 0x358, tileCount: 4 },
  { file: `${INI_DIR}/END/Flowers at Ending.unc`, srcTileOffset: 80, vramTileIndex: 0x340, tileCount: 16 },
  { file: `${INI_DIR}/END/Flowers at Ending.unc`, srcTileOffset: 32, vramTileIndex: 0x380, tileCount: 16 },
  { file: `${INI_DIR}/END/Flowers at Ending.unc`, srcTileOffset: 0, vramTileIndex: 0x390, tileCount: 16 },
  { file: `${INI_DIR}/END/Ending - Flowers.unc`, srcTileOffset: 0, vramTileIndex: 0x3a0, tileCount: 37 },
];

const MZ_TILES = ['artnem/8x8 - MZ.nem'];
const MZ_PALETTE = basePalette('Marble Zone.bin');
const MZ_ANIM: AnimatedArtEntry[] = [
  { file: 'artunc/MZ Lava Surface.unc', srcTileOffset: 0, vramTileIndex: 0x2e2, tileCount: 8 },
  { file: `${INI_DIR}/MZ/MZ Lava.bin`, srcTileOffset: 0, vramTileIndex: 0x2d2, tileCount: 16 },
  { file: 'artunc/MZ Background Torch.unc', srcTileOffset: 0, vramTileIndex: 0x2f2, tileCount: 6 },
];

const SYZ_TILES = ['artnem/8x8 - SYZ.nem'];
const SYZ_PALETTE = basePalette('Spring Yard Zone.bin');

const LZ_TILES = ['artnem/8x8 - LZ.nem'];
const LZ_PALETTE = basePalette('Labyrinth Zone.bin');
const LZ_WATER_PALETTE: PaletteComponent[] = [
  { file: 'palette/Sonic - LZ Underwater.bin', srcOffset: 0, destOffset: 0, length: 16 },
  { file: 'palette/Labyrinth Zone Underwater.bin', srcOffset: 16, destOffset: 16, length: 48 },
];

const SLZ_TILES = ['artnem/8x8 - SLZ.nem'];
const SLZ_PALETTE = basePalette('Star Light Zone.bin');

const SBZ_TILES = ['artnem/8x8 - SBZ.nem'];
const SBZ_ANIM: AnimatedArtEntry[] = [
  { file: 'artunc/SBZ Background Smoke.unc', srcTileOffset: 0, vramTileIndex: 0x448, tileCount: 6 },
  { file: 'artunc/SBZ Background Smoke.unc', srcTileOffset: 0, vramTileIndex: 0x44e, tileCount: 6 },
  { file: 'artunc/SBZ Background Smoke.unc', srcTileOffset: 0, vramTileIndex: 0x454, tileCount: 6 },
  { file: 'artunc/SBZ Background Smoke.unc', srcTileOffset: 0, vramTileIndex: 0x45a, tileCount: 6 },
];

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

export const s1Profile: ClassicProfile = {
  collision: {
    normal: 'collide/Collision Array (Normal).bin',
    rotated: 'collide/Collision Array (Rotated).bin',
    angleMap: 'collide/Angle Map.bin',
  },
  zones: [
    {
      id: 'ghz',
      name: 'Green Hill Zone',
      acts: [
        {
          act: 1,
          name: 'Green Hill Zone Act 1',
          tiles: GHZ_TILES,
          blocks: v('map16/GHZ.eni'),
          chunks: v('map256/GHZ.kos'),
          colind: v('collide/GHZ.bin'),
          fgLayout: v('levels/ghz1.bin'),
          bgLayout: v('levels/ghzbg.bin'),
          objpos: v('objpos/ghz1.bin'),
          startpos: v('startpos/ghz1.bin'),
          palette: GHZ_PALETTE,
          animatedArt: GHZ_ANIM,
        },
        {
          act: 2,
          name: 'Green Hill Zone Act 2',
          tiles: GHZ_TILES,
          blocks: v('map16/GHZ.eni'),
          chunks: v('map256/GHZ.kos'),
          colind: v('collide/GHZ.bin'),
          fgLayout: v('levels/ghz2.bin'),
          bgLayout: v('levels/ghzbg.bin'),
          objpos: v('objpos/ghz2.bin'),
          startpos: v('startpos/ghz2.bin'),
          palette: GHZ_PALETTE,
          animatedArt: GHZ_ANIM,
        },
        {
          act: 3,
          name: 'Green Hill Zone Act 3',
          tiles: GHZ_TILES,
          blocks: v('map16/GHZ.eni'),
          chunks: v('map256/GHZ.kos'),
          colind: v('collide/GHZ.bin'),
          fgLayout: v('levels/ghz3.bin'),
          bgLayout: v('levels/ghzbg.bin'),
          objpos: v('objpos/ghz3 (REV01).bin', 'objpos/ghz3 (REV00).bin'),
          startpos: v('startpos/ghz3.bin'),
          palette: GHZ_PALETTE,
          animatedArt: GHZ_ANIM,
        },
      ],
    },
    {
      id: 'mz',
      name: 'Marble Zone',
      acts: [
        {
          act: 1,
          name: 'Marble Zone Act 1',
          tiles: MZ_TILES,
          blocks: v('map16/MZ.eni'),
          chunks: v('map256/MZ (REV01).kos', 'map256/MZ (REV00).kos'),
          colind: v('collide/MZ.bin'),
          fgLayout: v('levels/mz1.bin'),
          bgLayout: v('levels/mz1bg.bin'),
          objpos: v('objpos/mz1 (REV01).bin', 'objpos/mz1 (REV00).bin'),
          startpos: v('startpos/mz1.bin'),
          palette: MZ_PALETTE,
          animatedArt: MZ_ANIM,
        },
        {
          act: 2,
          name: 'Marble Zone Act 2',
          tiles: MZ_TILES,
          blocks: v('map16/MZ.eni'),
          chunks: v('map256/MZ (REV01).kos', 'map256/MZ (REV00).kos'),
          colind: v('collide/MZ.bin'),
          fgLayout: v('levels/mz2.bin'),
          bgLayout: v('levels/mz2bg.bin'),
          objpos: v('objpos/mz2.bin'),
          startpos: v('startpos/mz2.bin'),
          palette: MZ_PALETTE,
          animatedArt: MZ_ANIM,
        },
        {
          act: 3,
          name: 'Marble Zone Act 3',
          tiles: MZ_TILES,
          blocks: v('map16/MZ.eni'),
          chunks: v('map256/MZ (REV01).kos', 'map256/MZ (REV00).kos'),
          colind: v('collide/MZ.bin'),
          fgLayout: v('levels/mz3.bin'),
          bgLayout: v('levels/mz3bg.bin'),
          objpos: v('objpos/mz3.bin'),
          startpos: v('startpos/mz3.bin'),
          palette: MZ_PALETTE,
          animatedArt: MZ_ANIM,
        },
      ],
    },
    {
      id: 'syz',
      name: 'Spring Yard Zone',
      acts: [
        {
          act: 1,
          name: 'Spring Yard Zone Act 1',
          tiles: SYZ_TILES,
          blocks: v('map16/SYZ.eni'),
          chunks: v('map256/SYZ.kos'),
          colind: v('collide/SYZ.bin'),
          fgLayout: v('levels/syz1.bin'),
          bgLayout: v('levels/syzbg (REV01).bin', 'levels/syzbg (REV00).bin'),
          objpos: v('objpos/syz1.bin'),
          startpos: v('startpos/syz1.bin'),
          palette: SYZ_PALETTE,
          animatedArt: [],
        },
        {
          act: 2,
          name: 'Spring Yard Zone Act 2',
          tiles: SYZ_TILES,
          blocks: v('map16/SYZ.eni'),
          chunks: v('map256/SYZ.kos'),
          colind: v('collide/SYZ.bin'),
          fgLayout: v('levels/syz2.bin'),
          bgLayout: v('levels/syzbg (REV01).bin', 'levels/syzbg (REV00).bin'),
          objpos: v('objpos/syz2.bin'),
          startpos: v('startpos/syz2.bin'),
          palette: SYZ_PALETTE,
          animatedArt: [],
        },
        {
          act: 3,
          name: 'Spring Yard Zone Act 3',
          tiles: SYZ_TILES,
          blocks: v('map16/SYZ.eni'),
          chunks: v('map256/SYZ.kos'),
          colind: v('collide/SYZ.bin'),
          fgLayout: v('levels/syz3.bin'),
          bgLayout: v('levels/syzbg (REV01).bin', 'levels/syzbg (REV00).bin'),
          objpos: v('objpos/syz3 (REV01).bin', 'objpos/syz3 (REV00).bin'),
          startpos: v('startpos/syz3.bin'),
          palette: SYZ_PALETTE,
          animatedArt: [],
        },
      ],
    },
    {
      id: 'lz',
      name: 'Labyrinth Zone',
      acts: [
        {
          act: 1,
          name: 'Labyrinth Zone Act 1',
          tiles: LZ_TILES,
          blocks: v('map16/LZ.eni'),
          chunks: v('map256/LZ.kos'),
          colind: v('collide/LZ.bin'),
          fgLayout: v('levels/lz1.bin'),
          bgLayout: v('levels/lzbg.bin'),
          objpos: v('objpos/lz1 (REV01).bin', 'objpos/lz1 (REV00).bin'),
          startpos: v('startpos/lz1.bin'),
          palette: LZ_PALETTE,
          waterPalette: LZ_WATER_PALETTE,
          animatedArt: [],
        },
        {
          act: 2,
          name: 'Labyrinth Zone Act 2',
          tiles: LZ_TILES,
          blocks: v('map16/LZ.eni'),
          chunks: v('map256/LZ.kos'),
          colind: v('collide/LZ.bin'),
          fgLayout: v('levels/lz2.bin'),
          bgLayout: v('levels/lzbg.bin'),
          objpos: v('objpos/lz2.bin'),
          startpos: v('startpos/lz2.bin'),
          palette: LZ_PALETTE,
          waterPalette: LZ_WATER_PALETTE,
          animatedArt: [],
        },
        {
          act: 3,
          name: 'Labyrinth Zone Act 3',
          tiles: LZ_TILES,
          blocks: v('map16/LZ.eni'),
          chunks: v('map256/LZ.kos'),
          colind: v('collide/LZ.bin'),
          fgLayout: v('levels/lz3.bin'),
          bgLayout: v('levels/lzbg.bin'),
          objpos: v('objpos/lz3 (REV01).bin', 'objpos/lz3 (REV00).bin'),
          startpos: v('startpos/lz3.bin'),
          palette: LZ_PALETTE,
          waterPalette: LZ_WATER_PALETTE,
          animatedArt: [],
        },
      ],
    },
    {
      id: 'slz',
      name: 'Star Light Zone',
      acts: [
        {
          act: 1,
          name: 'Star Light Zone Act 1',
          tiles: SLZ_TILES,
          blocks: v('map16/SLZ.eni'),
          chunks: v('map256/SLZ.kos'),
          colind: v('collide/SLZ.bin'),
          fgLayout: v('levels/slz1.bin'),
          bgLayout: v('levels/slzbg.bin'),
          objpos: v('objpos/slz1.bin'),
          startpos: v('startpos/slz1.bin'),
          palette: SLZ_PALETTE,
          animatedArt: [],
        },
        {
          act: 2,
          name: 'Star Light Zone Act 2',
          tiles: SLZ_TILES,
          blocks: v('map16/SLZ.eni'),
          chunks: v('map256/SLZ.kos'),
          colind: v('collide/SLZ.bin'),
          fgLayout: v('levels/slz2.bin'),
          bgLayout: v('levels/slzbg.bin'),
          objpos: v('objpos/slz2.bin'),
          startpos: v('startpos/slz2.bin'),
          palette: SLZ_PALETTE,
          animatedArt: [],
        },
        {
          act: 3,
          name: 'Star Light Zone Act 3',
          tiles: SLZ_TILES,
          blocks: v('map16/SLZ.eni'),
          chunks: v('map256/SLZ.kos'),
          colind: v('collide/SLZ.bin'),
          fgLayout: v('levels/slz3.bin'),
          bgLayout: v('levels/slzbg.bin'),
          objpos: v('objpos/slz3.bin'),
          startpos: v('startpos/slz3.bin'),
          palette: SLZ_PALETTE,
          animatedArt: [],
        },
      ],
    },
    {
      id: 'sbz',
      name: 'Scrap Brain Zone',
      acts: [
        {
          act: 1,
          name: 'Scrap Brain Zone Act 1',
          tiles: SBZ_TILES,
          blocks: v('map16/SBZ.eni'),
          chunks: v('map256/SBZ (REV01).kos', 'map256/SBZ (REV00).kos'),
          colind: v('collide/SBZ.bin'),
          fgLayout: v('levels/sbz1.bin'),
          bgLayout: v('levels/sbz1bg.bin'),
          objpos: v('objpos/sbz1 (REV01).bin', 'objpos/sbz1 (REV00).bin'),
          startpos: v('startpos/sbz1.bin'),
          palette: basePalette('SBZ Act 1.bin'),
          animatedArt: SBZ_ANIM,
        },
        {
          act: 2,
          name: 'Scrap Brain Zone Act 2',
          tiles: SBZ_TILES,
          blocks: v('map16/SBZ.eni'),
          chunks: v('map256/SBZ (REV01).kos', 'map256/SBZ (REV00).kos'),
          colind: v('collide/SBZ.bin'),
          fgLayout: v('levels/sbz2.bin'),
          bgLayout: v('levels/sbz2bg.bin'),
          objpos: v('objpos/sbz2.bin'),
          startpos: v('startpos/sbz2.bin'),
          palette: basePalette('SBZ Act 2.bin'),
          animatedArt: SBZ_ANIM,
        },
        {
          // Scrap Brain Zone Act 3 is internally Labyrinth-style (the engine's
          // "LZ act 4"): it borrows LZ tiles/blocks/chunks/collision + lzbg, but
          // keeps its own fg layout, objects and SBZ3 palettes.
          act: 3,
          name: 'Scrap Brain Zone Act 3',
          tiles: LZ_TILES,
          blocks: v('map16/LZ.eni'),
          chunks: v('map256/LZ.kos'),
          colind: v('collide/LZ.bin'),
          fgLayout: v('levels/sbz3.bin'),
          bgLayout: v('levels/lzbg.bin'),
          objpos: v('objpos/sbz3.bin'),
          startpos: v('startpos/sbz3.bin'),
          palette: basePalette('SBZ Act 3.bin'),
          waterPalette: [
            { file: 'palette/Sonic - SBZ3 Underwater.bin', srcOffset: 0, destOffset: 0, length: 16 },
            { file: 'palette/SBZ Act 3 Underwater.bin', srcOffset: 16, destOffset: 16, length: 48 },
          ],
          animatedArt: [],
        },
      ],
    },
  ],
};
