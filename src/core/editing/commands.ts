import type { ObjectPlacement, RingPlacement, Section, Tileset, Palette, Color, Tile, ChunkDef, Act, BgLibraryEntry } from '../model/s4-types';

export interface S4Level {
  sections: (Section | null)[];
  tileset?: Tileset;          // zone-level; present when zone commands are used
  palette?: Palette;
  chunkLibrary?: ChunkDef[];  // zone-level; present when set-chunk commands are used
  bgLibrary?: BgLibraryEntry[]; // project-level; present when set-bg-tiles is used
  act?: Act;                  // current act; present when set-bg commands are used
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
  // Whole-plane swap of the act's zone-wide background (Plane B): 64x32
  // nametable plus its own tile blob (a separate tile space from the zone
  // tileset — layout indices are local to the BG blob).
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

export interface SetSectionsCommand extends EditCommand {
  type: 'set-sections';
  // Whole-act snapshot of the section grid: width/height plus the flat
  // row-major sections array. One uniform command makes every structural op
  // (add/remove/resize/move/paste) undoable. Operates on level.act in place.
  oldGridWidth: number; oldGridHeight: number; oldSections: (Section | null)[];
  newGridWidth: number; newGridHeight: number; newSections: (Section | null)[];
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
  | SetSectionBgCommand
  | SetSectionsCommand;
