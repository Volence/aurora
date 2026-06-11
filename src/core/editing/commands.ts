import type { ObjectPlacement, RingPlacement, Section, Tileset, Palette, Color, Tile } from '../model/s4-types';

export interface S4Level {
  sections: (Section | null)[];
  tileset?: Tileset;   // zone-level; present when zone commands are used
  palette?: Palette;
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

export type AnyCommand =
  | SetTilesCommand
  | SetCollisionCommand
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
  | SetTilesetTilesCommand;
