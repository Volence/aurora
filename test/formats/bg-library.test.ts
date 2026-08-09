import { describe, it, expect } from 'vitest';
import {
  bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath,
  serializeBgLibraryIndex, parseBgLibraryIndex, makeBgId,
} from '../../src/core/formats/bg-library';

describe('bg library persistence helpers', () => {
  it('builds editor-owned paths under the given project data root', () => {
    expect(bgLibIndexPath('data/', 'OJZ')).toBe('data/editor/OJZ_bglib.json');
    expect(bgLibLayoutPath('data/', 'OJZ', 'forest-1718000000')).toBe('data/editor/OJZ_bg_forest-1718000000.bin');
    expect(bgLibTilesPath('data/', 'OJZ', 'forest-1718000000')).toBe('data/editor/OJZ_bg_forest-1718000000_tiles.bin');
    // Post-split engine layout: the library lands inside the game's data tree.
    expect(bgLibIndexPath('games/sonic4/data/', 'ojz')).toBe('games/sonic4/data/editor/ojz_bglib.json');
  });

  it('round-trips the index (id/name metadata only)', () => {
    const text = serializeBgLibraryIndex([
      { id: 'forest-1', name: 'Forest' },
      { id: 'cave-2', name: 'Deep Cave' },
    ]);
    expect(parseBgLibraryIndex(text)).toEqual([
      { id: 'forest-1', name: 'Forest' },
      { id: 'cave-2', name: 'Deep Cave' },
    ]);
  });

  it('parse tolerates malformed entries and non-array roots', () => {
    expect(parseBgLibraryIndex('{}')).toEqual([]);
    expect(parseBgLibraryIndex('[{"id":"ok","name":"Ok"},{"id":5},null,"x"]'))
      .toEqual([{ id: 'ok', name: 'Ok' }]);
  });

  it('makeBgId slugs the name and appends the timestamp', () => {
    expect(makeBgId('Forest Canopy!', 1718000000)).toBe('forest-canopy-1718000000');
    expect(makeBgId('***', 42)).toBe('bg-42'); // empty slug falls back
    expect(makeBgId('forest')).toMatch(/^forest-\d+$/);
  });
});
