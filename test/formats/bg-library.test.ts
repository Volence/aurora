import { describe, it, expect } from 'vitest';
import {
  bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath,
  serializeBgLibraryIndex, parseBgLibraryIndex, makeBgId,
} from '../../src/core/formats/bg-library';

describe('bg library persistence helpers', () => {
  it('builds editor-owned paths in the local-index convention directory', () => {
    expect(bgLibIndexPath('OJZ')).toBe('data/editor/OJZ_bglib.json');
    expect(bgLibLayoutPath('OJZ', 'forest-1718000000')).toBe('data/editor/OJZ_bg_forest-1718000000.bin');
    expect(bgLibTilesPath('OJZ', 'forest-1718000000')).toBe('data/editor/OJZ_bg_forest-1718000000_tiles.bin');
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
