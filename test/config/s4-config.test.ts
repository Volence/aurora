import { describe, it, expect } from 'vitest';
import { loadS4Config, type S4ProjectConfig } from '../../src/core/config/s4-config';

describe('s4-config', () => {
  it('loads a valid project config', () => {
    const json: S4ProjectConfig = {
      name: 'Sonic 4',
      engine: 's4',
      zones: [{
        id: 'ojz',
        name: 'Orange Juice Zone',
        tileset: 'data/tiles/ojz_tiles.bin',
        palette: 'data/palettes/ojz_palette.bin',
        acts: [{
          id: 'act1',
          gridWidth: 4,
          gridHeight: 3,
          dataPath: 'data/levels/ojz/act1/',
          bgLayout: 'data/bg/ojz_bg.bin',
          bgTiles: 'data/bg/ojz_bg_tiles.bin',
          parallax: 'data/parallax/ojz_default.asm',
          startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
        }],
      }],
      objectLibrary: 'data/objdefs/objects.json',
      chunkLibrary: 'data/chunks/chunks.json',
    };
    const config = loadS4Config(json, '/project');
    expect(config.name).toBe('Sonic 4');
    expect(config.basePath).toBe('/project');
    expect(config.zones.length).toBe(1);
    expect(config.zones[0].acts[0].gridWidth).toBe(4);
  });

  it('retains the raw parsed project.json verbatim', () => {
    const json: S4ProjectConfig = {
      name: 'Sonic 4',
      engine: 's4',
      zones: [{
        id: 'ojz',
        name: 'Orange Juice Zone',
        tileset: 'data/editor/ojz/chunks_tiles.bin',
        palette: 'data/palettes/ojz_palette.bin',
        acts: [{
          id: 'act1',
          gridWidth: 4,
          gridHeight: 3,
          dataPath: 'data/levels/ojz/act1/',
          bgLayout: 'data/bg/ojz_bg.bin',
          bgTiles: 'data/bg/ojz_bg_tiles.bin',
          parallax: null,
          startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
        }],
      }],
      objectLibrary: 'data/objdefs/objects.json',
      chunkLibrary: 'data/editor/ojz/chunks.json',
    };
    const config = loadS4Config(json, '/project');
    expect(config.raw).toBe(json);
    expect(JSON.parse(JSON.stringify(config.raw))).toEqual(json);
  });

  it('survives a tileset retarget through a stringify round-trip', () => {
    const json: S4ProjectConfig = {
      name: 'Sonic 4',
      engine: 's4',
      zones: [{
        id: 'ojz',
        name: 'Orange Juice Zone',
        tileset: 'data/editor/ojz/chunks_tiles.bin',
        palette: 'data/palettes/ojz_palette.bin',
        acts: [{
          id: 'act1',
          gridWidth: 4,
          gridHeight: 3,
          dataPath: 'data/levels/ojz/act1/',
          bgLayout: 'data/bg/ojz_bg.bin',
          bgTiles: 'data/bg/ojz_bg_tiles.bin',
          parallax: 'data/parallax/ojz_default.asm',
          startPosition: { secX: 1, secY: 2, localX: 64, localY: 128 },
        }],
      }],
      objectLibrary: 'data/objdefs/objects.json',
      chunkLibrary: 'data/editor/ojz/chunks.json',
    };
    const config = loadS4Config(json, '/project');

    // The retarget saveProject performs:
    config.raw.zones[0].tileset = 'data/editor/ojz_tiles.bin';

    const roundTripped = JSON.parse(JSON.stringify(config.raw, null, 2)) as S4ProjectConfig;
    expect(roundTripped.zones[0].tileset).toBe('data/editor/ojz_tiles.bin');
    // Every other field is preserved verbatim
    expect(roundTripped.name).toBe('Sonic 4');
    expect(roundTripped.chunkLibrary).toBe('data/editor/ojz/chunks.json');
    expect(roundTripped.zones[0].acts[0]).toEqual(json.zones[0].acts[0]);
    // config.zones shares the raw zone objects, so the retarget is visible there too
    expect(config.zones[0].tileset).toBe('data/editor/ojz_tiles.bin');
  });

  it('rejects config with missing required fields', () => {
    expect(() => loadS4Config({} as any, '/project')).toThrow();
  });

  it('rejects non-s4 engine', () => {
    const json = { name: 'Test', engine: 's2', zones: [] };
    expect(() => loadS4Config(json as any, '/project')).toThrow(/s4/);
  });
});
