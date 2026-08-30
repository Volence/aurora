// Type-only (erased at compile), so the effects codec's own reach back into
// project/adapter cannot make this a runtime import cycle. See S4Project.
import type { EffectsSceneLibrary } from '../formats/effects/scene';
import type { EffectsPresetLibrary } from '../formats/effects/preset';
import type { BgOverrideState } from '../formats/bg-override/bg-override-io';
import type { BgLibraryUnresolvedEntry } from '../formats/bg-library';

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

/**
 * ONE remembered stamp of a library chunk into an aeon section (owner ruling
 * d-18c). The tiles it still owns are named by `SectionChunkLinks.plane`, NOT by
 * this record's footprint — which is the whole point: paint over half a stamp by
 * hand and only the painted tiles stop tracking.
 *
 * `chunkId` is `ChunkDef.id` (a string, project-level). Nothing here copies the
 * chunk's SIZE: a placement resolves against the live `ChunkDef`, so a chunk
 * that was resized cannot leave a stale width behind here to disagree with it.
 */
export interface ChunkPlacementLink {
  /** Stable within its section, `>= 1`. 0 is reserved by the plane for "no
   *  link", so an id is never an array index and never shifts when a sibling
   *  placement is detached. */
  id: number;
  /** `ChunkDef.id` of the library chunk this placement came from. */
  chunkId: string;
  /** Top-left TILE coords of the stamp inside the section. Offsets into the
   *  chunk are `(col - baseCol, row - baseRow)`. */
  baseCol: number;
  baseRow: number;
  /** True when the stamp that created this placement also wrote the two
   *  collision planes (`artOnly: false`). Propagation replays exactly what the
   *  stamp did: an art-only stamp must not grow collision later. */
  collision: boolean;
}

/**
 * A section's chunk-identity layer. `plane` is parallel to
 * `SectionTileGrid.nametable` — one entry per 8px TILE, `0` = unlinked, else the
 * `id` of a placement in `placements`.
 *
 * TILE granularity, not 16px cell, because the art brush writes one nametable
 * word at a time: a cell-indexed plane would have to either break three
 * innocent tiles' links or leave three stale ones on any single-tile edit.
 *
 * Every non-zero plane value MUST name a placement present in `placements` —
 * `core/editing/chunk-links.ts` `danglingPlaneRefs` is the check, and the
 * `.chunklinks.json` parser refuses a document that violates it rather than
 * loading a half-valid layer.
 */
export interface SectionChunkLinks {
  placements: ChunkPlacementLink[];
  plane: Uint32Array;
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
  /**
   * CHUNK IDENTITY (owner ruling d-18c, 2026-08-29): which library chunk each
   * stamped tile still comes from. `null`/absent = this section has no linked
   * stamp, which is what every section saved before this field existed reads as.
   *
   * The classic half of the editor keeps chunk identity by storing a GRID OF
   * CHUNK IDS as the level itself (level-classic/model.ts `LayoutGrid.cells`) —
   * the "never flatten" document. Aeon cannot copy that shape: an aeon section's
   * `tileGrid.nametable` IS the exported artifact and a chunk is a
   * variable-size footprint, not one layout cell. So identity rides BESIDE the
   * nametable, at the same per-tile granularity the paint brush writes at, which
   * is what lets one hand-painted tile stop tracking while the rest of the
   * placement keeps propagating.
   *
   * See core/editing/chunk-links.ts for every operation on this and
   * core/formats/section-chunk-links.ts for the `.chunklinks.json` sidecar.
   */
  chunkLinks?: SectionChunkLinks | null;
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
  bgLayoutRef: string | null;
  /**
   * Effects scene assigned to this section: null = the act default (`Act.sceneRef`,
   * and below that the engine's own hand-authored default), else an id from the
   * editor effects library. Persisted through the meta sidecar's `sceneRef`
   * (src/core/formats/section-meta.ts), which aeon's effects generator also reads.
   *
   * Section-level and act-level assignment deliberately share ONE name and ONE
   * semantics (empyrean AURORA_EFFECTS_SCHEMA.md §4) — `Act.sceneRef` is the
   * same kind of value at the next scope out, not a different mechanism.
   *
   * There used to be a `parallaxRef` beside this field. It was DEAD — written
   * only by createSection and cloneSection, read by nothing, persisted by
   * neither the sidecar nor project.json — and it was an active trap: the
   * effects survey wired ruling Q4 to it by mistake, because a per-section
   * `parallaxRef` looks exactly like what a per-section scene assignment would
   * be named. Deleted with the act-level re-point.
   */
  sceneRef: string | null;
  /**
   * Raster-preset binding for this section: null = "this section keeps its
   * hand-authored raster channel", else a preset-document id (empyrean
   * docs/AURORA_EFFECTS_SCHEMA.md §3.1, adjudicated 2026-08-30). Persisted
   * through the meta sidecar's `rasterRef`
   * (src/core/formats/section-meta.ts), which aeon's effects generator will
   * read; absent and explicit-null are the same state, exactly as for
   * `sceneRef`.
   *
   * ⚠ NOT `effectsRef`, which stays RESERVED and UNSPENT: a preset document
   * can only supply the raster channel of aeon's eight-channel EffectsPreset,
   * so `effectsRef`'s promise of a TOTAL binding is deliberately kept for the
   * day the document is total.
   *
   * ⚠ NOTHING IN AURORA WRITES THIS, and that is not the `parallaxRef` trap
   * described above. `parallaxRef` was dead because it was written by the
   * constructors and persisted by NOTHING; this one is loaded from the sidecar
   * and written back to it, which is the entire reason it exists — aeon
   * authors the binding, and Aurora's job is to not erase it. There is no
   * per-section raster select in the UI and no `assign_section_preset` agent
   * tool; ROADMAP row 93 tracks the authoring half.
   */
  rasterRef: string | null;
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
    bgLayoutRef: null,
    sceneRef: null,
    rasterRef: null,
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
  /**
   * The act's DEFAULT effects scene: null = no editor assignment, which leaves
   * the engine's hand-authored `act_parallax_config` (act_descriptor.emp)
   * standing untouched; else an id from the editor effects library, the same id
   * space `Section.sceneRef` draws from.
   *
   * Read from the act entry's `sceneRef` in project.json (empyrean
   * AURORA_EFFECTS_SCHEMA.md §4, aeon `7bff8488`). `null` and ABSENT mean the
   * same thing and the loader collapses them.
   *
   * NOT a file path. This field used to be `parallaxRef`, carrying project.json's
   * `parallax` key — a path to a .asm file. aeon deleted that key and replaced it
   * with `sceneRef` in one edit, no interim fossil, and the contract renamed the
   * reader rather than re-valuing it precisely so that no reader can mistake a
   * scene id for a path.
   *
   * Aurora does not WRITE this key. The save re-serialises the raw parsed
   * project.json (`LoadedS4Config.raw`), so whatever aeon put here round-trips
   * untouched; there is no act-level assignment UI yet.
   */
  sceneRef: string | null;
  /**
   * The act's GENERATED-DATA directory — project.json's `stripPath`, verbatim
   * and project-root-relative, or null when the act declares none.
   *
   * A plain fact about the act, not a verdict, and it is on the model for one
   * reason: it is the only thing that binds the per-GAME BG override document
   * (`{dataRoot}editor_bg_override.json`) to a particular ACT. aeon's
   * `inject_editor_bg.py` reads that one file and writes `zone_bg.bin` /
   * `bg_tiles.bin` into ONE hardcoded directory; the act that owns that
   * directory is the act the override governs, and every other act keeps its
   * library / act-default background. `actBindsBgOverride` (core/formats/
   * bg-override/bg-override-binding.ts) is the one reader.
   *
   * Aurora does not WRITE this key — the save re-serialises the raw parsed
   * project.json, exactly as it does for `sceneRef`.
   */
  stripPath: string | null;
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
  /**
   * The BG-library entries the zone's MANIFEST names and this checkout cannot
   * open — `{zone}_bglib.json` listed them, one or both of their binaries was
   * unreadable or absent.
   *
   * NOT AN ERROR LIST. It is the difference between "this project has N
   * backgrounds" and "this project was opened without seeing N of them", and
   * those two used to be one array. `load` dropped a bodyless entry with a
   * `console.warn` and produced a shorter `bgLibrary`; downstream, a section
   * whose `bgLayoutRef` names a dropped entry falls back to the act default,
   * `list_bgs` reports a library that does not contain the id its own section
   * column prints, and `save` rewrites the manifest from the survivors. Every
   * one of those is a correct reading of a `bgLibrary` that never carried the
   * fact.
   *
   * REQUIRED, on the same rule `effectsScenes` states below: an optional field
   * reads downstream as "nothing was missing", which is a different claim from
   * "nobody looked".
   *
   * ORDINARILY EMPTY, and empty is not a special case — it is what an authoring
   * checkout with every body present looks like, and every consumer must treat
   * the empty array as "the library is whole" without a second flag.
   */
  bgLibraryUnresolved: BgLibraryUnresolvedEntry[];
  basePath: string;
  /**
   * The editor effects-scene library — `{dataRoot}editor/effects/<id>.json`,
   * one scene per file (empyrean AURORA_EFFECTS_SCHEMA.md §2). Sections point
   * at entries by id via `Section.sceneRef` (null = the act default), exactly
   * as `bgLayoutRef` points into `bgLibrary`.
   *
   * REQUIRED, not optional. There is one constructor of S4Project in the tree
   * (aeon/load.ts's loadFullProject), and an optional field would let a future
   * second one omit it — which reads downstream as "this project has no scenes"
   * and, at save time, writes nothing. The whole-library value (not a bare
   * array) because `unreadable` is load-bearing on the WRITE path: a scene file
   * that exists and did not parse must never be overwritten, and that fact has
   * to travel with the scenes it is about.
   *
   * The type is IMPORTED from the codec rather than mirrored here. A structural
   * copy was the first shape and it does not survive contact with TypeScript:
   * `EffectsScene` is an interface, so it is not assignable to a mirror carrying
   * an index signature, and a mirror WITHOUT one would have to enumerate the
   * scene's fields — the one thing the codec's design forbids. The import is
   * `import type`, so it is erased at compile and opens no runtime cycle even
   * though scene.ts reaches back to project/adapter for `FileAccess`.
   */
  effectsScenes: EffectsSceneLibrary;
  /**
   * The RASTER PRESET library — `{dataRoot}editor/effects/presets/<id>.json`,
   * one document per raster program.
   *
   * A DIFFERENT DOCUMENT FROM A SCENE, not a sub-shape of one. A scene is a
   * `parallax_config`; a preset's raster program is a channel of an
   * `EffectsPreset` bound per SECTION. A `bands` key on a scene file is refused
   * by the scene loader, so these cannot be merged even if the directories
   * suggest it.
   *
   * REQUIRED, on exactly the rule `effectsScenes` states above: an optional
   * field reads downstream as "this project has no presets", which is a
   * different fact from "this project was loaded without looking".
   */
  effectsPresets: EffectsPresetLibrary;
  /**
   * The BG override document — `{dataRoot}editor_bg_override.json`, ONE PER
   * GAME rather than per zone or per act (aeon EFFECTS_CONSUMER_CONTRACT.md
   * §1.1). It carries the Plane B layout, its tile blob, and the BgAnim bands
   * that animate a prefix of that blob.
   *
   * REQUIRED, and a HOLDER rather than the bare document, for two different
   * reasons that both matter:
   *
   *   • required, on the same rule `effectsScenes` states above — an optional
   *     field reads downstream as "this project has no override" and, at save
   *     time, writes nothing.
   *
   *   • a holder, because a band edit REPLACES the document (the plan appliers
   *     are pure functions returning a new one) and an S4Level is a fresh view
   *     object built per gesture. Writing the new document into the view would
   *     be thrown away with the view; writing it into this object, which the
   *     project owns, is the edit. `unreadable` and `loadedText` ride along for
   *     the write path, exactly as `EffectsSceneLibrary.unreadable` does.
   */
  bgOverride: BgOverrideState;
}

export const SF_HAS_WATER = 1 << 0;
export const SF_UNDERGROUND = 1 << 1;
export const SF_NO_Y_WRAP = 1 << 2;
export const SF_PRESERVE_STATE = 1 << 3;
