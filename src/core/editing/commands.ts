import type { ObjectPlacement, RingPlacement, Section, Tileset, Palette, Color, Tile, ChunkDef, ChunkPlacementLink, Act, BgLibraryEntry } from '../model/s4-types';
import type { EffectsScene, EffectsSceneLibrary } from '../formats/effects/scene';
import type { EffectsPreset, EffectsPresetLibrary } from '../formats/effects/preset';
import type { BgOverrideBand, BgOverrideDocument } from '../formats/bg-override/bg-override';
import type { BandSlotPlan } from '../formats/bg-override/bg-anim-band';
import type { RegionsDocument } from '../formats/regions/document';
import type { SectionSidecarTuple } from './migrate-sections';

export interface S4Level {
  sections: (Section | null)[];
  tileset?: Tileset;          // zone-level; present when zone commands are used
  palette?: Palette;
  chunkLibrary?: ChunkDef[];  // zone-level; present when set-chunk commands are used
  bgLibrary?: BgLibraryEntry[]; // project-level; present when set-bg-tiles is used
  act?: Act;                  // current act; present when set-bg commands are used
  /** project-level; present when set-effects-scene is used. The whole library
   *  value, not just its `scenes` array, because a scene id can collide with an
   *  `unreadable` entry and the command has to be able to see that. */
  effectsScenes?: EffectsSceneLibrary;
  /** project-level; present when set-effects-preset is used. The whole library
   *  value for the reason above: a preset id can collide with an `unreadable`
   *  entry and the command has to be able to see that. */
  effectsPresets?: EffectsPresetLibrary;
  /** project-level (one per GAME, not per act); present when band commands are used. */
  bgOverride?: BgOverrideDocument;
}

export interface EditCommand {
  type: string;
  description: string;
  sectionIndex: number;
}

export interface SetTilesCommand extends EditCommand {
  type: 'set-tiles';
  entries: Array<{ index: number; oldNt: number; newNt: number }>;
}

export interface SetCollisionEditCommand extends EditCommand {
  type: 'set-collision-edit';
  plane: 'a' | 'b';
  entries: Array<{ index: number; oldColl: number; newColl: number }>;
  /**
   * The OTHER plane's entries, when ONE gesture wrote both — the "Both planes"
   * collision brush (core/collision/both-planes-paint.ts).
   *
   * There is no second `plane` field on purpose: "the other plane" is
   * `plane === 'a' ? 'b' : 'a'` and a second field could contradict the first.
   * `otherPlane()` is the one place that ternary is spelled.
   *
   * WHY IT RIDES THIS COMMAND RATHER THAN BEING A SECOND ONE. A stroke is one
   * undo step — the property the collision drag has had since it started
   * batching. Two commands would be two undos for one gesture, and an author
   * who pressed undo once would be left with the geometry on exactly one plane,
   * which is the half-finished second plane this feature exists to prevent.
   *
   * Every entry here was merged against ITS OWN plane's destination cell. It is
   * NOT a copy of `entries` with the same words — see both-planes-paint.ts for
   * why a single merge broadcast to two planes is a real defect.
   */
  otherPlaneEntries?: Array<{ index: number; oldColl: number; newColl: number }>;
}

/**
 * Chunk identity — one undoable change to a section's `chunkLinks`
 * (owner ruling d-18c). Emitted by every builder in editing/chunk-links.ts:
 * the stamp's identity child, detach, and the link-break wrapper.
 *
 * A DELTA, not a snapshot, for the same reason `set-tiles` is: a stamp is a few
 * hundred entries and the plane is 64K, and an undo stack of plane snapshots
 * would carry a quarter of a megabyte per stamp.
 *
 * `entries` are plane writes; `addedPlacements`/`removedPlacements` are the
 * record-list half. Placement ids are STABLE and never reused, so the two halves
 * commute and undo is exact: revert restores `oldRef` and swaps the two lists.
 * Nothing here holds an array INDEX into `placements`, which is what would break
 * when a sibling is detached.
 */
export interface SetChunkLinksCommand extends EditCommand {
  type: 'set-chunk-links';
  entries: Array<{ index: number; oldRef: number; newRef: number }>;
  addedPlacements?: ChunkPlacementLink[];
  removedPlacements?: ChunkPlacementLink[];
}

export interface MoveObjectCommand extends EditCommand {
  type: 'move-object';
  objectIndex: number;
  oldX: number; oldY: number;
  newX: number; newY: number;
}

export interface AddObjectCommand extends EditCommand {
  type: 'add-object';
  object: ObjectPlacement;
}

export interface DeleteObjectCommand extends EditCommand {
  type: 'delete-object';
  objectIndex: number;
  object: ObjectPlacement;
}

/**
 * Replace one placement's PROPERTIES in place — type, subtype, flips, and the
 * coordinates a drag would otherwise carry. Whole-placement swap rather than a
 * field delta, so a multi-field edit is still one undo step and the object keeps
 * its index (a delete+add pair would re-order the section's object list, which
 * the exporter's first-encounter type table is sensitive to).
 *
 * Distinct from `move-object`, which stays a coordinate-only command because the
 * viewport's drag path coalesces on it.
 */
export interface SetObjectCommand extends EditCommand {
  type: 'set-object';
  objectIndex: number;
  oldObject: ObjectPlacement;
  newObject: ObjectPlacement;
}

export interface MoveRingCommand extends EditCommand {
  type: 'move-ring';
  ringIndex: number;
  oldX: number; oldY: number;
  newX: number; newY: number;
}

export interface AddRingCommand extends EditCommand {
  type: 'add-ring';
  ring: RingPlacement;
}

export interface AddRingsCommand extends EditCommand {
  type: 'add-rings';
  rings: RingPlacement[];
}

export interface DeleteRingCommand extends EditCommand {
  type: 'delete-ring';
  ringIndex: number;
  ring: RingPlacement;
}

export interface MoveObjectsCommand extends EditCommand {
  type: 'move-objects';
  moves: Array<{ objectIndex: number; oldX: number; oldY: number; newX: number; newY: number }>;
}

export interface MoveRingsCommand extends EditCommand {
  type: 'move-rings';
  moves: Array<{ ringIndex: number; oldX: number; oldY: number; newX: number; newY: number }>;
}

export interface DeleteObjectsCommand extends EditCommand {
  type: 'delete-objects';
  items: Array<{ objectIndex: number; object: ObjectPlacement }>;
}

export interface DeleteRingsCommand extends EditCommand {
  type: 'delete-rings';
  items: Array<{ ringIndex: number; ring: RingPlacement }>;
}

export interface SetPaletteLineCommand extends EditCommand {
  type: 'set-palette-line';
  line: number;
  oldColors: Color[];
  newColors: Color[];
}

export interface SetTilesetTilesCommand extends EditCommand {
  type: 'set-tileset-tiles';
  at: number;                  // first tileset index written
  oldTiles: (Tile | null)[];   // null = slot did not exist (appended)
  newTiles: Tile[];
}

export interface SetChunkCommand extends EditCommand {
  type: 'set-chunk';
  chunkId: string;
  oldNametable: Uint16Array;
  newNametable: Uint16Array;
  oldCollisionA: Uint16Array;
  newCollisionA: Uint16Array;
  oldCollisionB: Uint16Array;
  newCollisionB: Uint16Array;
}

export interface SetBgCommand extends EditCommand {
  type: 'set-bg';
  // Whole-plane swap of the act's zone-wide background (Plane B): a 64-column
  // nametable plus its own tile blob (a separate tile space from the zone
  // tileset — layout indices are local to the BG blob).
  //
  // The HEIGHT is not fixed and this command does not care: the engine's plane
  // is 64x64 and the legacy 64x32 shape is still legal, so the arrays below are
  // swapped whole and every consumer measures `layout.length / BG_WIDTH`. This
  // comment said "64x32" until ROADMAP item 8; that was the stale belief the
  // agent path enforced.
  oldLayout: Uint16Array | null;
  newLayout: Uint16Array | null;
  oldTiles: Tile[] | null;
  newTiles: Tile[] | null;
}

/**
 * Per-tile edits to the RESOLVED background plane — the drag path's command.
 *
 * `set-bg` above is a whole-plane swap, and nothing on the painting path ever
 * built one: BG strokes wrote the resolved nametable directly, marking the
 * project dirty with no command at all. The data saved (to
 * `<zone>_<act>_bg.bin`), so the mutation was durable — but the next Ctrl+Z
 * popped whatever act-scoped command happened to precede the strokes and
 * silently reverted THAT instead.
 *
 * `bgRef` names which background was painted, because the viewport resolves it
 * per section: a library entry id, or null for the act's own bgLayout. Undo has
 * to reach the same array the stroke did, and the active section may have moved
 * on by then.
 */
export interface SetBgTilesCommand extends EditCommand {
  type: 'set-bg-tiles';
  bgRef: string | null;
  entries: Array<{ index: number; oldNt: number; newNt: number }>;
}

/**
 * Paint background cells in `editor_bg_override.json` — the plane the ROM is
 * actually built from (docs/decisions.jsonl d-12).
 *
 * A SEPARATE COMMAND FROM `set-bg-tiles`, not a third value of its `bgRef`, and
 * the reason is the write path rather than the data. `set-bg-tiles` edits an
 * in-memory array the act or the BG library owns and the save plan re-serialises
 * to `<zone>_bg_<id>.bin`; this edits a JSON document that has its own codec, its
 * own sole-writer ruling, its own "the file exists and did not parse, do not
 * touch it" refusal, and its own consumer. Overloading one command's `bgRef`
 * with a sentinel would put the two paths one typo apart — and the failure mode
 * that typo produces is the one this whole parcel exists to remove: a stroke
 * that paints on screen and lands in a file nobody bakes.
 *
 * `entries` carry WORDS, not tile indices: a nametable word is an index plus the
 * palette/priority/flip attributes the consumer preserves, and undo has to
 * restore all of it.
 *
 * `sectionIndex` is -1. The document is per-GAME and the plane is act-wide, so
 * this is act-ambient exactly like `set-bg-override-band` beside it.
 */
export interface SetBgOverrideLayoutCommand extends EditCommand {
  type: 'set-bg-override-layout';
  entries: Array<{ index: number; oldWord: number; newWord: number }>;
}

export interface SetSectionBgCommand extends EditCommand {
  type: 'set-section-bg';
  // Assign which background (Plane B) the section displays: null = the act
  // default (act.bgLayout/bgTiles), otherwise an S4Project.bgLibrary entry
  // id. Only the ref swaps in history — library entries themselves are
  // additive store state outside undo (addBgToLibrary), like the chunk
  // library.
  oldRef: string | null;
  newRef: string | null;
}

/**
 * Create, replace or delete ONE scene in the project's effects-scene library.
 *
 * ONE COMMAND FOR ALL THREE, keyed by id with two nullable halves: `oldScene`
 * null = the scene did not exist (create), `newScene` null = it goes away
 * (delete), both present = an edit. That shape falls straight out of the codec's
 * design — a scene document is opaque here, and enumerating "which field
 * changed" would rebuild the field list the codec deliberately refuses to have.
 * A single whole-document swap also makes every scene edit ONE undo step by
 * construction, however many form controls a gesture happened to touch.
 *
 * Both halves are DEEP COPIES the caller owns (cloneEffectsScene), never aliases
 * of the library's live object: a command holding the same object it is meant to
 * restore restores nothing.
 *
 * `sectionIndex` is -1 — this is act-ambient, like set-bg. It records on the ACT
 * stack rather than the zone's, the same place set-bg-tiles records its
 * project-level bgLibrary edits; scenes are project-level and there is no
 * project-level history to record on.
 */
export interface SetEffectsSceneCommand extends EditCommand {
  type: 'set-effects-scene';
  sceneId: string;
  oldScene: EffectsScene | null;
  newScene: EffectsScene | null;
}

/**
 * Assign which effects scene a section uses — `Section.sceneRef`, the key the
 * meta sidecar already persists (empyrean AURORA_EFFECTS_SCHEMA.md §3; the
 * sidecar half landed at 61d4b80). null = the act default.
 *
 * A SEPARATE COMMAND from `set-section-bg` rather than a field on it, even though
 * the two are the same shape over the same sidecar. They are independent
 * assignments an author makes at different times, and folding them together would
 * make changing a background undo a scene assignment made three steps earlier.
 */
/**
 * Replace one RASTER PRESET document wholesale — `presets/<id>.json`.
 *
 * THE SAME SHAPE AS `set-effects-scene`, ON THE SAME REASONING, and deliberately
 * not folded into it. A preset is a different document in a different directory
 * against a different schema; sharing a command type would mean one `apply` that
 * has to ask which library it is looking at, and the first time that question is
 * answered wrong an author's scene is overwritten by a preset.
 *
 * Both halves are DEEP COPIES the caller owns, never aliases of the library's
 * live object: a command holding the same object it is meant to restore restores
 * nothing. A null/null pair is a create (old null) or a delete (new null).
 *
 * `sectionIndex` is -1 — act-ambient, like `set-effects-scene`. Presets are
 * project-level and there is no project-level history to record on.
 */
export interface SetEffectsPresetCommand extends EditCommand {
  type: 'set-effects-preset';
  presetId: string;
  oldPreset: EffectsPreset | null;
  newPreset: EffectsPreset | null;
}

export interface SetSectionSceneCommand extends EditCommand {
  type: 'set-section-scene';
  oldRef: string | null;
  newRef: string | null;
}

/**
 * Assign which RASTER PRESET a section uses — `Section.rasterRef`, the fourth
 * key of the meta sidecar (empyrean AURORA_EFFECTS_SCHEMA.md §3.1, adjudicated
 * 2026-08-30; the sidecar half landed at 7b1d15a0). null = "this section keeps
 * its hand-authored raster channel".
 *
 * NAMED AFTER THE FIELD, like both its siblings — `bgLayoutRef` has
 * `set-section-bg` and `sceneRef` has `set-section-scene`, so `rasterRef` gets
 * `set-section-raster`. It assigns a PRESET DOCUMENT ID and is not a band edit:
 * editing the bands inside a preset is `set-effects-preset`, which is scoped to
 * the project's preset library and not to any section at all.
 *
 * ⚠ THE FIELD IS `rasterRef`, NEVER `effectsRef`. A preset document supplies
 * only the RASTER channel of aeon's eight-channel EffectsPreset, so the narrow
 * binding carries the narrow name and `effectsRef` stays reserved and unspent
 * for the day the document is total (core/formats/section-meta.ts states the
 * ruling). A command that wrote `effectsRef` would spend that reservation
 * silently.
 *
 * A SEPARATE COMMAND from `set-section-scene`, on the reason that command
 * states about `set-section-bg`: three independent assignments over one sidecar,
 * made at different times, and folding any two together would make changing one
 * undo the other.
 */
export interface SetSectionRasterCommand extends EditCommand {
  type: 'set-section-raster';
  oldRef: string | null;
  newRef: string | null;
}

/**
 * Add or remove ONE BgAnim band in `editor_bg_override.json` — and, in the same
 * undo step, the tile renumbering and layout rewrite that go with it.
 *
 * ONE COMMAND, NOT THREE, and that is the entire reason this command type
 * exists. A band's animated slots are a PREFIX of `tiles`, so inserting a band
 * inserts tiles at the front-ward end of the blob, renumbers every static tile
 * after them, and invalidates every `layout` word that named one. A history that
 * could undo the `anims` half without the `tiles` half would leave a document
 * that passes every consumer assert, bakes cleanly, and ships silently corrupt
 * art — the accident aeon already suffered once (docs/BUGS.md TOOL-01).
 *
 * `adding` NAMES THE DIRECTION rather than the `oldX`/`newX` pair the neighbours
 * use. Both halves of that pair would be whole ~400 KB documents, and a history
 * of 200 of them is not a history; the plan below is the difference instead, and
 * it is SYMMETRIC — each layout entry records both its with-band and its
 * without-band word, so apply and undo are the same two functions with their
 * arguments swapped rather than two implementations that can disagree.
 *
 * `band` is a DEEP COPY the command owns, phases and all: it is the only record
 * of the removed art, and a command holding the same object it is meant to
 * restore restores nothing.
 *
 * `sectionIndex` is -1 — the document is per-game, so this is act-ambient like
 * `set-effects-scene`, and records on the act stack for the same reason.
 */
export interface SetBgOverrideBandCommand extends EditCommand {
  type: 'set-bg-override-band';
  /** true = the command's forward direction ADDS the band; false = it REMOVES it. */
  adding: boolean;
  band: BgOverrideBand;
  plan: BandSlotPlan;
}

/**
 * Write the PIXELS of one or more `tiles[i]` in `editor_bg_override.json`.
 *
 * THE PREFIX RULE RIDES IN THE APPLIER, NOT IN THE COMMAND. A slot inside the
 * animated prefix (`0 .. Σ(cols*rows)`) is mirrored by its band's `phases[0]`,
 * and aeon's `validate_band_coherence` refuses a file where the two differ. The
 * command records only the tile halves; `writeBgOverrideTile` (the one writer)
 * lands each pixel array in the tile AND in the owning band's phase 0, on apply
 * and on undo alike — so the phase half can never be recorded, restored or
 * forgotten separately from the tile half. A write past the prefix touches no
 * band.
 *
 * `sectionIndex` is -1 — act-ambient, like every override command.
 */
export interface SetBgOverrideTilesCommand extends EditCommand {
  type: 'set-bg-override-tiles';
  tiles: Array<{ index: number; oldPixels: number[]; newPixels: number[] }>;
}

/**
 * Write whole phase BANKS of one BgAnim band: `phases[bank]` for each entry.
 * Bank 0 is the rest state, so an entry for bank 0 also rewrites the band's
 * prefix tiles (through the same writer as above). A `regenerate-shift` is this
 * command with banks 1..7 derived from phase 0 by the shift fill.
 *
 * `sectionIndex` is -1 — act-ambient, like every override command.
 */
export interface SetBgOverridePhasesCommand extends EditCommand {
  type: 'set-bg-override-phases';
  bandIndex: number;
  banks: Array<{ bank: number; oldTiles: number[][]; newTiles: number[][] }>;
}

/**
 * Set or clear `default_off` on one BgAnim band.
 *
 * ⚠ THE ONLY COMMAND IN THIS FILE THAT CHANGES WHAT THE RELEASE ROM DOES AND
 * NOTHING ELSE. Every other override command moves art, slots or pixels, and
 * an author can see the result. This one moves a key the emitter reads: a band
 * carrying it is not counted into the act's own `BgAnim_Table`, so a
 * single-band act emits a count of zero and BG animation is off at boot in
 * every shape, release included. Nothing on screen changes, which is exactly
 * why the surface that offers it has to say what does.
 *
 * BOTH VALUES ARE `boolean | undefined` AND THE `undefined` IS LOAD-BEARING:
 * absent is the contract's default, so clearing DELETES the key and undo of a
 * set has to restore absence rather than write `false`. A `boolean` pair would
 * quietly convert every clear into a written `false`, which is Aurora freezing
 * aeon's default into a document that never spelled it.
 *
 * `sectionIndex` is -1 — act-ambient, like every override command.
 */
export interface SetBgOverrideDefaultOffCommand extends EditCommand {
  type: 'set-bg-override-default-off';
  bandIndex: number;
  oldValue: boolean | undefined;
  newValue: boolean | undefined;
}

export interface SetSectionsCommand extends EditCommand {
  type: 'set-sections';
  // Whole-act snapshot of the section grid: width/height plus the flat
  // row-major sections array. One uniform command makes every structural op
  // (add/remove/resize/move/paste) undoable. Operates on level.act in place.
  oldGridWidth: number; oldGridHeight: number; oldSections: (Section | null)[];
  newGridWidth: number; newGridHeight: number; newSections: (Section | null)[];
}

/**
 * Replace this act's WHOLE regions document — `{dataPath}regions.json`.
 *
 * ═══ ONE COMMAND PER GESTURE, AND WHY IT IS THE WHOLE DOCUMENT ═════════════
 *
 * The editor spec's §3.3 asks for exactly this shape, and the reason is the
 * owner's Q1 ruling (2026-09-14T14:54:34Z, "cut right away"): drawing a region
 * over another TRIMS the other at once, so a single drag can split three
 * neighbouring regions into nine rectangles, and "Migrate sections" rewrites
 * every region in the act. A per-rect delta would make one gesture N undo
 * steps, and Ctrl+Z would walk backwards through the middle of a carve, leaving
 * the act in a state no author ever drew. A whole-document swap makes "one
 * gesture is one undo step" true BY CONSTRUCTION rather than by discipline at
 * every call site.
 *
 * The document is small — tens of rectangles, not the hundreds of thousands of
 * cells a tile plane carries — so the memory argument that forces deltas on
 * `set-tiles` does not arise here. It is the same trade `set-effects-scene`
 * made, for the same reason, and this is deliberately its shape.
 *
 * ═══ BOTH HALVES ARE DEEP COPIES THE CALLER OWNS ══════════════════════════
 *
 * `cloneRegionsDocument` (core/formats/regions/act-regions.ts), never an alias
 * of the object on the act: a command holding the very object it is meant to
 * restore restores nothing. That defect is recorded on `set-effects-scene` and
 * is not re-learned here.
 *
 * ═══ NULL MEANS "NO REGIONS DOCUMENT", ON PURPOSE ═════════════════════════
 *
 * `oldDocument` null = the act had none (creating the first region); `newDocument`
 * null = the author deleted the last one. The contract's `regions` array is
 * `minItems: 1`, so "a document with no regions" is not a value that exists —
 * absent is how the file says it, and null is how the model says it.
 *
 * `sectionIndex` is -1: ACT-AMBIENT, like `set-effects-scene` and
 * `set-section-scene`. The regions of an act are not the property of any one
 * section — the shipped night region straddles a section line, which is the
 * whole point of identity by rectangle — so there is no section to record on.
 * `commandDocId` (renderer/state/editorStore.ts) routes it to the current act's
 * document, which is where act-scoped history lives.
 */
export interface SetRegionsCommand extends EditCommand {
  type: 'set-regions';
  oldDocument: RegionsDocument | null;
  newDocument: RegionsDocument | null;
}

/**
 * MIGRATION FROM SECTIONS — the regions document and every section sidecar it
 * replaces, in ONE undo step (editor spec §4: "One command, `migrate-sections`,
 * one undo step").
 *
 * ═══ WHY IT IS ITS OWN COMMAND AND NOT A BATCH ════════════════════════════
 *
 * Because the two halves must never be apart, and a batch is a list somebody can
 * reorder or partly rebuild. §4's own sentence is the reason: "A half state,
 * where a sidecar carries a ref beside a `regions.json`, is the exact state the
 * generator refuses (§2.5 rule 5), so the command is atomic on the document
 * store even when the save is not." Aurora's save writes a plan file by file and
 * can be interrupted; what this command guarantees is the MODEL — after it, and
 * after any number of undo/redo cycles, an act either has regions and clean
 * sidecars or the sidecars and no regions, never both.
 *
 * It is the argument `set-bg-override-band` already makes one command over, with
 * the same shape: halves that a history able to move them independently would
 * silently corrupt.
 *
 * ⚠ AND THE SIDECAR HALF CARRIES FOUR REFS, NOT TWO. `sceneRef` and `rasterRef`
 * are what the generator refuses beside a regions document; `bgLayoutRef` and
 * `paletteRef` are nulled in the same step because §4 says so and because they
 * had no reader — but they are the fields an undo has to put BACK, so the
 * command records all four. A command that restored two of four would present as
 * "undo lost my background binding".
 *
 * `sectionIndex` is -1: ACT-AMBIENT, like `set-regions`. This command writes
 * EVERY section of the act, so there is no one section to record it on, and
 * `commandDocId` routes an act-scoped command to the act's history.
 */
export interface MigrateSectionsCommand extends EditCommand {
  type: 'migrate-sections';
  /** Null when the act had no regions document, which is the ordinary case. */
  oldDocument: RegionsDocument | null;
  /** Never null: a migration that produced no regions is refused before it becomes a command. */
  newDocument: RegionsDocument;
  /**
   * Every section of the act, with the four sidecar refs before and after.
   * `next` is all-null on every entry; it is spelled out rather than implied so
   * apply and undo read the same pair and cannot drift.
   */
  sections: Array<{
    index: number;
    old: SectionSidecarTuple;
    next: SectionSidecarTuple;
  }>;
}

/**
 * Groups several commands into one undo step. Children apply in order and undo
 * in reverse. Used for multi-tile pixel edits (a stroke/shape crossing several
 * chunk tiles edits each tileset tile, but undoes as a single action).
 */
export interface BatchCommand extends EditCommand {
  type: 'batch';
  commands: AnyCommand[];
}

export type AnyCommand =
  | BatchCommand
  | SetTilesCommand
  | SetCollisionEditCommand
  | SetChunkLinksCommand
  | MoveObjectCommand
  | AddObjectCommand
  | DeleteObjectCommand
  | SetObjectCommand
  | MoveRingCommand
  | AddRingCommand
  | AddRingsCommand
  | DeleteRingCommand
  | MoveObjectsCommand
  | MoveRingsCommand
  | DeleteObjectsCommand
  | DeleteRingsCommand
  | SetPaletteLineCommand
  | SetTilesetTilesCommand
  | SetChunkCommand
  | SetBgCommand
  | SetBgTilesCommand
  | SetBgOverrideLayoutCommand
  | SetSectionBgCommand
  | SetEffectsSceneCommand
  | SetEffectsPresetCommand
  | SetSectionSceneCommand
  | SetSectionRasterCommand
  | SetBgOverrideBandCommand
  | SetBgOverrideTilesCommand
  | SetBgOverridePhasesCommand
  | SetBgOverrideDefaultOffCommand
  | SetRegionsCommand
  | MigrateSectionsCommand
  | SetSectionsCommand;
