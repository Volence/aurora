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

  it('rejects config with missing required fields', () => {
    expect(() => loadS4Config({} as any, '/project')).toThrow();
  });

  it('rejects non-s4 engine', () => {
    const json = { name: 'Test', engine: 's2', zones: [] };
    expect(() => loadS4Config(json as any, '/project')).toThrow(/s4/);
  });
});
