import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import type { Tile, Palette, Act } from '../../src/core/model/s4-types';
import { createChunkDef, createSection } from '../../src/core/model/s4-types';

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

describe('batch command', () => {
  it('applies child commands in order and undoes them in reverse, as one step', () => {
    const level = makeLevel();
    level.tileset!.tiles.push({ pixels: new Uint8Array(64) }); // tiles 0,1 both blank
    const history = new EditHistory();
    history.execute({
      type: 'batch',
      description: 'art: edit 2 tiles',
      sectionIndex: -1,
      commands: [
        { type: 'set-tileset-tiles', description: 't0', sectionIndex: -1, at: 0,
          oldTiles: [{ pixels: new Uint8Array(64) }], newTiles: [{ pixels: new Uint8Array(64).fill(5) }] },
        { type: 'set-tileset-tiles', description: 't1', sectionIndex: -1, at: 1,
          oldTiles: [{ pixels: new Uint8Array(64) }], newTiles: [{ pixels: new Uint8Array(64).fill(7) }] },
      ],
    }, level);
    expect(level.tileset!.tiles[0].pixels[0]).toBe(5);
    expect(level.tileset!.tiles[1].pixels[0]).toBe(7);
    history.undo(level); // single undo reverts both
    expect(level.tileset!.tiles[0].pixels[0]).toBe(0);
    expect(level.tileset!.tiles[1].pixels[0]).toBe(0);
    history.redo(level);
    expect(level.tileset!.tiles[0].pixels[0]).toBe(5);
    expect(level.tileset!.tiles[1].pixels[0]).toBe(7);
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

describe('set-bg command', () => {
  function makeAct(): Act {
    return {
      id: 'act1', gridWidth: 1, gridHeight: 1, sections: [],
      startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
      bgLayout: null, bgTiles: null, parallaxRef: null,
    };
  }

  function levelWithAct(): { level: S4Level; act: Act } {
    const act = makeAct();
    const level = { ...makeLevel(), act };
    return { level, act };
  }

  it('applies and undoes a null -> data background swap', () => {
    const { level, act } = levelWithAct();
    const history = new EditHistory();
    const newLayout = new Uint16Array(64 * 32);
    newLayout[0] = 0x2001; // tile 1, palette 1
    const newTiles: Tile[] = [
      { pixels: new Uint8Array(64) },
      { pixels: new Uint8Array(64).fill(5) },
    ];
    history.execute({
      type: 'set-bg', description: 'agent: set background', sectionIndex: -1,
      oldLayout: null, newLayout,
      oldTiles: null, newTiles,
    }, level);
    expect(act.bgLayout).not.toBeNull();
    expect(act.bgLayout![0]).toBe(0x2001);
    expect(act.bgTiles).toHaveLength(2);
    expect(act.bgTiles![1].pixels[0]).toBe(5);
    history.undo(level);
    expect(act.bgLayout).toBeNull();
    expect(act.bgTiles).toBeNull();
    history.redo(level);
    expect(act.bgLayout![0]).toBe(0x2001);
    expect(act.bgTiles![1].pixels[0]).toBe(5);
  });

  it('restores the previous background on undo of a data -> data swap', () => {
    const { level, act } = levelWithAct();
    act.bgLayout = new Uint16Array(64 * 32).fill(0x0001);
    act.bgTiles = [{ pixels: new Uint8Array(64).fill(1) }, { pixels: new Uint8Array(64).fill(2) }];
    const history = new EditHistory();
    history.execute({
      type: 'set-bg', description: 'agent: set background', sectionIndex: -1,
      oldLayout: new Uint16Array(act.bgLayout),
      newLayout: new Uint16Array(64 * 32).fill(0x0002),
      oldTiles: act.bgTiles.map(t => ({ pixels: new Uint8Array(t.pixels) })),
      newTiles: [{ pixels: new Uint8Array(64).fill(9) }],
    }, level);
    expect(act.bgLayout![100]).toBe(0x0002);
    expect(act.bgTiles).toHaveLength(1);
    history.undo(level);
    expect(act.bgLayout![100]).toBe(0x0001);
    expect(act.bgTiles).toHaveLength(2);
    expect(act.bgTiles![1].pixels[0]).toBe(2);
  });

  it('deep-copies: mutating command payload after execute does not affect the act', () => {
    const { level, act } = levelWithAct();
    const history = new EditHistory();
    const newLayout = new Uint16Array(64 * 32);
    const newTiles: Tile[] = [{ pixels: new Uint8Array(64) }];
    history.execute({
      type: 'set-bg', description: 'set bg', sectionIndex: -1,
      oldLayout: null, newLayout, oldTiles: null, newTiles,
    }, level);
    newLayout[7] = 0xBEEF;
    newTiles[0].pixels[7] = 15;
    expect(act.bgLayout![7]).toBe(0);
    expect(act.bgTiles![0].pixels[7]).toBe(0);
  });

  it('throws when level lacks act', () => {
    const level = makeLevel(); // no act
    const history = new EditHistory();
    expect(() => history.execute({
      type: 'set-bg', description: 'set bg', sectionIndex: -1,
      oldLayout: null, newLayout: new Uint16Array(64 * 32),
      oldTiles: null, newTiles: [{ pixels: new Uint8Array(64) }],
    }, level)).toThrow('set-bg requires level.act');
  });
});

describe('set-section-bg command', () => {
  function levelWithSection(): { level: S4Level; section: ReturnType<typeof createSection> } {
    const section = createSection(0, 'Sec0');
    const level: S4Level = { ...makeLevel(), sections: [section] };
    return { level, section };
  }

  it('applies, undoes, and redoes a null -> id assignment', () => {
    const { level, section } = levelWithSection();
    const history = new EditHistory();
    history.execute({
      type: 'set-section-bg', description: 'assign forest bg', sectionIndex: 0,
      oldRef: null, newRef: 'forest-1718000000',
    }, level);
    expect(section.bgLayoutRef).toBe('forest-1718000000');
    history.undo(level);
    expect(section.bgLayoutRef).toBeNull();
    history.redo(level);
    expect(section.bgLayoutRef).toBe('forest-1718000000');
  });

  it('restores the previous id on undo of an id -> id swap and supports clearing to null', () => {
    const { level, section } = levelWithSection();
    section.bgLayoutRef = 'cave-1';
    const history = new EditHistory();
    history.execute({
      type: 'set-section-bg', description: 'swap bg', sectionIndex: 0,
      oldRef: 'cave-1', newRef: 'forest-2',
    }, level);
    expect(section.bgLayoutRef).toBe('forest-2');
    history.execute({
      type: 'set-section-bg', description: 'back to act default', sectionIndex: 0,
      oldRef: 'forest-2', newRef: null,
    }, level);
    expect(section.bgLayoutRef).toBeNull();
    history.undo(level);
    expect(section.bgLayoutRef).toBe('forest-2');
    history.undo(level);
    expect(section.bgLayoutRef).toBe('cave-1');
  });

  it('is a safe no-op on a null section slot', () => {
    const level: S4Level = { ...makeLevel(), sections: [null] };
    const history = new EditHistory();
    expect(() => history.execute({
      type: 'set-section-bg', description: 'assign bg', sectionIndex: 0,
      oldRef: null, newRef: 'forest-1',
    }, level)).not.toThrow();
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
