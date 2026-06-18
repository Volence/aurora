import { describe, it, expect } from 'vitest';
import { discoverSpriteSets } from '../../../src/core/import/sprite-discovery';

describe('discoverSpriteSets', () => {
  it('skdisasm per-sprite folder: pairs Map/DPLC/art by shared name', () => {
    const sets = discoverSpriteSets([
      'General/Sprites/Clamer/Map - Clamer.asm',
      'General/Sprites/Clamer/DPLC - Clamer.asm',
      'General/Sprites/Clamer/Clamer.bin',
      'General/Sprites/Clamer/Clamer Shot.bin',
    ]);
    expect(sets).toEqual([{
      name: 'Clamer', game: 's3k',
      mappings: 'General/Sprites/Clamer/Map - Clamer.asm',
      dplc: 'General/Sprites/Clamer/DPLC - Clamer.asm',
      art: 'General/Sprites/Clamer/Clamer.bin',
    }]);
  });

  it('s2disasm split dirs: pairs mappings/sprite with mappings/spriteDPLC by basename', () => {
    const sets = discoverSpriteSets([
      's2.asm/mappings/sprite/obj08.asm',
      's2.asm/mappings/spriteDPLC/obj08.asm',
      's2.asm/mappings/sprite/obj0B.asm', // no DPLC sibling
    ]);
    expect(sets).toContainEqual({
      name: 'obj08', game: 's2',
      mappings: 's2.asm/mappings/sprite/obj08.asm',
      dplc: 's2.asm/mappings/spriteDPLC/obj08.asm',
      art: undefined,
    });
    expect(sets).toContainEqual({
      name: 'obj0B', game: 's2',
      mappings: 's2.asm/mappings/sprite/obj0B.asm',
      dplc: undefined, art: undefined,
    });
  });

  it('s1disasm _maps: lists mapping files, excludes _MapMacros and DPLC scripts', () => {
    const sets = discoverSpriteSets([
      's1disasm/_maps/Ball Hog.asm',
      's1disasm/_maps/_MapMacros.asm',
      's1disasm/_maps/Sonic - Dynamic Gfx Script.asm',
    ]);
    expect(sets.map((s) => s.name)).toEqual(['Ball Hog']);
    expect(sets[0]).toMatchObject({ game: 's1', mappings: 's1disasm/_maps/Ball Hog.asm' });
  });

  it('sorts by name and ignores unrelated files', () => {
    const sets = discoverSpriteSets([
      'x/Map - Beta.asm', 'x/Map - Alpha.asm', 'readme.txt', 'code/player.asm',
    ]);
    expect(sets.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
  });
});
