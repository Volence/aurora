import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import type { Tile, Palette } from '../../src/core/model/s4-types';

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
