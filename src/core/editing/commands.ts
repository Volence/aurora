import type { ObjectPlacement, RingPlacement, Section, Tileset, Palette, Color, Tile, ChunkDef, Act } from '../model/s4-types';

export interface S4Level {
  sections: (Section | null)[];
  tileset?: Tileset;          // zone-level; present when zone commands are used
  palette?: Palette;
  chunkLibrary?: ChunkDef[];  // zone-level; present when set-chunk commands are used
  act?: Act;                  // current act; present when set-bg commands are used
}

export interface EditCommand {
  type: string;
  description: string;
  sectionIndex: number;
}

export interface SetTilesCommand extends EditCommand {
  type: 'set-tiles';
  entries: Array<{ index: number; oldNt: number; newNt: number; oldColl: number; newColl: number }>;
}

export interface SetCollisionCommand extends EditCommand {
  type: 'set-collision';
  entries: Array<{ index: number; oldColl: number; newColl: number }>;
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
  oldCollision: Uint8Array;
  newCollision: Uint8Array;
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
  | SetCollisionCommand
  | SetCollisionEditCommand
  | MoveObjectCommand
  | AddObjectCommand
  | DeleteObjectCommand
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
  | SetSectionBgCommand
  | SetSectionsCommand;
