// Which chunk thumbnails a command actually invalidates.
//
// The aeon chunk grid used to repaint EVERY thumbnail on one global clock
// (editorStore.chunkLibraryVersion), so a single tile-pixel edit re-rasterized
// the whole library — 256 chunks x 256 cells x 64 pixels. Classic has had
// per-chunk invalidation since its picker was written; this is the pure function
// that lets aeon have it too, and these tests pin the three edges that make it
// worth having: an edit to ONE chunk touches one thumbnail, an edit to a tile
// touches only the chunks that draw that tile, and an edit to a palette line
// touches only the chunks with a cell on that line.

import { describe, it, expect } from 'vitest';
import { chunkIdsAffectedByCommand } from '../chunk-invalidation';
import { packNametableWord } from '../../model/s4-types';
import type { ChunkDef, Tile } from '../../model/s4-types';
import type { AnyCommand } from '../commands';

/** A 2x1 chunk whose two cells are (tileIndex, paletteLine) pairs. */
function chunk(id: string, cells: Array<[number, number]>): ChunkDef {
  return {
    id,
    name: id,
    widthTiles: cells.length,
    heightTiles: 1,
    nametable: Uint16Array.from(cells.map(([t, p]) => packNametableWord(t, p, false, false, false))),
    collisionA: new Uint16Array(cells.length),
    collisionB: new Uint16Array(cells.length),
  };
}

const tile = (v: number): Tile => ({ pixels: new Uint8Array(64).fill(v) });

const LIBRARY: ChunkDef[] = [
  chunk('a', [[0, 0], [5, 0]]),   // draws tiles 0 and 5, palette line 0
  chunk('b', [[9, 1], [9, 1]]),   // draws tile 9, palette line 1
  chunk('c', [[5, 2], [12, 3]]),  // tiles 5 and 12, palette lines 2 and 3
];

const affected = (cmd: unknown): string[] =>
  chunkIdsAffectedByCommand(cmd as AnyCommand, LIBRARY).sort();

describe('chunkIdsAffectedByCommand', () => {
  it('names exactly the edited chunk for set-chunk', () => {
    expect(affected({
      type: 'set-chunk', description: 'edit', sectionIndex: -1, chunkId: 'b',
      oldNametable: new Uint16Array(2), newNametable: new Uint16Array(2),
      oldCollisionA: new Uint16Array(2), newCollisionA: new Uint16Array(2),
      oldCollisionB: new Uint16Array(2), newCollisionB: new Uint16Array(2),
    })).toEqual(['b']);
  });

  it('names a set-chunk target that is not in the library yet', () => {
    // Import-then-edit races and undo of a removal both hand us an id the
    // current library does not list; naming it anyway is harmless (the key it
    // bumps is unread) and losing it would strand a stale thumbnail.
    expect(affected({
      type: 'set-chunk', description: 'edit', sectionIndex: -1, chunkId: 'zz',
      oldNametable: new Uint16Array(2), newNametable: new Uint16Array(2),
      oldCollisionA: new Uint16Array(2), newCollisionA: new Uint16Array(2),
      oldCollisionB: new Uint16Array(2), newCollisionB: new Uint16Array(2),
    })).toEqual(['zz']);
  });

  it('names only the chunks that draw an edited tile', () => {
    // Tile 5 is drawn by 'a' and 'c'; 'b' draws only tile 9.
    expect(affected({
      type: 'set-tileset-tiles', description: 'edit tile', sectionIndex: -1,
      at: 5, oldTiles: [tile(0)], newTiles: [tile(1)],
    })).toEqual(['a', 'c']);
  });

  it('covers the whole written range, including appended slots', () => {
    // Writing 4 tiles from index 9 covers 9..12: 'b' (tile 9) and 'c' (tile 12).
    // oldTiles carries nulls for appended slots, so the range comes from the
    // longer of the two arrays.
    expect(affected({
      type: 'set-tileset-tiles', description: 'append', sectionIndex: -1,
      at: 9, oldTiles: [null, null, null, null], newTiles: [tile(1), tile(2), tile(3), tile(4)],
    })).toEqual(['b', 'c']);
  });

  it('names nothing when the edited tile is drawn by no chunk', () => {
    expect(affected({
      type: 'set-tileset-tiles', description: 'edit tile', sectionIndex: -1,
      at: 40, oldTiles: [tile(0)], newTiles: [tile(1)],
    })).toEqual([]);
  });

  it('names only the chunks with a cell on an edited palette line', () => {
    expect(affected({
      type: 'set-palette-line', description: 'recolor', sectionIndex: -1, line: 1,
      oldColors: [], newColors: [],
    })).toEqual(['b']);
    expect(affected({
      type: 'set-palette-line', description: 'recolor', sectionIndex: -1, line: 0,
      oldColors: [], newColors: [],
    })).toEqual(['a']);
  });

  it('names nothing for a command no thumbnail bakes', () => {
    expect(affected({
      type: 'add-object', description: 'add', sectionIndex: 0,
      object: { typeId: 'x', subtype: 0, x: 0, y: 0 },
    })).toEqual([]);
  });

  it('unions a batch, without duplicates', () => {
    expect(affected({
      type: 'batch', description: 'both', sectionIndex: -1,
      commands: [
        { type: 'set-tileset-tiles', description: 't', sectionIndex: -1, at: 5, oldTiles: [tile(0)], newTiles: [tile(1)] },
        { type: 'set-palette-line', description: 'p', sectionIndex: -1, line: 2, oldColors: [], newColors: [] },
        { type: 'add-object', description: 'a', sectionIndex: 0, object: { typeId: 'x', subtype: 0, x: 0, y: 0 } },
      ],
    })).toEqual(['a', 'c']);
  });

  it('tolerates an empty library', () => {
    expect(chunkIdsAffectedByCommand({
      type: 'set-palette-line', description: 'p', sectionIndex: -1, line: 0,
      oldColors: [], newColors: [],
    } as unknown as AnyCommand, [])).toEqual([]);
  });
});
