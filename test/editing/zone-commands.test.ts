import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import type { Tile, Palette } from '../../src/core/model/s4-types';
import { createChunkDef } from '../../src/core/model/s4-types';

function makeLevel(): S4Level {
  const palette: Palette = {
    lines: Array.from({ length: 4 }, () => ({
      colors: Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 })),
    })),
  };
  const tiles: Tile[] = [{ pixels: new Uint8Array(64) }];
  return { sections: [], tileset: { tiles, collisionTypes: new Uint8Array(0) }, palette };
}

describe('set-palette-line command', () => {
  it('applies and undoes a palette line swap', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const newColors = Array.from({ length: 16 }, (_, i) => ({ r: i * 10, g: 0, b: 0, a: 255 }));
    history.execute({
      type: 'set-palette-line',
      description: 'agent: set palette line 1',
      sectionIndex: -1,
      line: 1,
      oldColors: level.palette!.lines[1].colors.map(c => ({ ...c })),
      newColors,
    }, level);
    expect(level.palette!.lines[1].colors[5].r).toBe(50);
    history.undo(level);
    expect(level.palette!.lines[1].colors[5].r).toBe(0);
  });
});

describe('set-tileset-tiles command', () => {
  it('appends tiles and removes them on undo', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const newTile: Tile = { pixels: new Uint8Array(64).fill(3) };
    history.execute({
      type: 'set-tileset-tiles',
      description: 'agent: write 1 tile',
      sectionIndex: -1,
      at: 1,
      oldTiles: [null],          // null = appended (didn't exist before)
      newTiles: [newTile],
    }, level);
    expect(level.tileset!.tiles.length).toBe(2);
    expect(level.tileset!.tiles[1].pixels[0]).toBe(3);
    history.undo(level);
    expect(level.tileset!.tiles.length).toBe(1);
  });

  it('replaces existing tiles and restores them on undo', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const replacement: Tile = { pixels: new Uint8Array(64).fill(7) };
    history.execute({
      type: 'set-tileset-tiles',
      description: 'agent: replace tile 0',
      sectionIndex: -1,
      at: 0,
      oldTiles: [{ pixels: new Uint8Array(level.tileset!.tiles[0].pixels) }],
      newTiles: [replacement],
    }, level);
    expect(level.tileset!.tiles[0].pixels[0]).toBe(7);
    history.undo(level);
    expect(level.tileset!.tiles[0].pixels[0]).toBe(0);
  });
});

describe('set-chunk command', () => {
  function levelWithChunk() {
    const level = makeLevel();
    const chunk = createChunkDef('c1', 'Chunk 1', 2, 2);
    (level as { chunkLibrary?: unknown }).chunkLibrary = [chunk];
    return { level, chunk };
  }

  it('applies and undoes nametable+collision swaps', () => {
    const { level, chunk } = levelWithChunk();
    const history = new EditHistory();
    const newNt = new Uint16Array([1, 2, 3, 4]);
    const newColl = new Uint8Array([5, 6, 7, 8]);
    history.execute({
      type: 'set-chunk', description: 'edit chunk', sectionIndex: -1,
      chunkId: 'c1',
      oldNametable: new Uint16Array(chunk.nametable), newNametable: newNt,
      oldCollision: new Uint8Array(chunk.collision), newCollision: newColl,
    }, level);
    expect(Array.from(chunk.nametable)).toEqual([1, 2, 3, 4]);
    expect(Array.from(chunk.collision)).toEqual([5, 6, 7, 8]);
    history.undo(level);
    expect(Array.from(chunk.nametable)).toEqual([0, 0, 0, 0]);
    expect(Array.from(chunk.collision)).toEqual([0, 0, 0, 0]);
    history.redo(level);
    expect(Array.from(chunk.nametable)).toEqual([1, 2, 3, 4]);
  });

  it('throws when level lacks chunkLibrary or the chunk id is unknown', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const cmd = {
      type: 'set-chunk' as const, description: 'x', sectionIndex: -1, chunkId: 'nope',
      oldNametable: new Uint16Array(0), newNametable: new Uint16Array(0),
      oldCollision: new Uint8Array(0), newCollision: new Uint8Array(0),
    };
    expect(() => history.execute(cmd, level)).toThrow(/chunkLibrary/);
    (level as { chunkLibrary?: unknown }).chunkLibrary = [];
    expect(() => history.execute(cmd, level)).toThrow(/nope/);
  });
});

describe('zone commands against a level missing zone fields', () => {
  it('throws when set-palette-line is executed without level.palette', () => {
    const level: S4Level = { sections: [] }; // no palette/tileset (e.g. sections-only view)
    const history = new EditHistory();
    expect(() => history.execute({
      type: 'set-palette-line',
      description: 'set palette line 0',
      sectionIndex: -1,
      line: 0,
      oldColors: [],
      newColors: Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 })),
    }, level)).toThrow('set-palette-line requires level.palette');
  });

  it('throws when set-tileset-tiles is executed without level.tileset', () => {
    const level: S4Level = { sections: [] };
    const history = new EditHistory();
    expect(() => history.execute({
      type: 'set-tileset-tiles',
      description: 'write 1 tile',
      sectionIndex: -1,
      at: 0,
      oldTiles: [null],
      newTiles: [{ pixels: new Uint8Array(64) }],
    }, level)).toThrow('set-tileset-tiles requires level.tileset');
  });
});
