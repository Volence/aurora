import { describe, it, expect } from 'vitest';
import {
  bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath,
  serializeBgLibraryIndex, parseBgLibraryIndex, makeBgId,
  mergeBgLibraryIndex, danglingBgRef,
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

// O31 — the two facts a bare `BgLibraryEntry[]` could not carry.
describe('an entry the manifest names and the checkout does not have', () => {
  it('danglingBgRef separates "unbound" from "asks for something absent"', () => {
    const lib = [{ id: 'forest-1' }, { id: 'cave-2' }];
    // The ordinary states, which must NOT read as broken.
    expect(danglingBgRef(null, lib)).toBeNull();
    expect(danglingBgRef('cave-2', lib)).toBeNull();
    // The third state the editor used to collapse into the first.
    expect(danglingBgRef('ghost-3', lib)).toBe('ghost-3');
    // An empty library is not a special case: every ref dangles, and null
    // still does not.
    expect(danglingBgRef('cave-2', [])).toBe('cave-2');
    expect(danglingBgRef(null, [])).toBeNull();
  });

  it('mergeBgLibraryIndex writes names it could not open, in manifest order', () => {
    // The clean-clone shape: nothing loaded, the whole manifest survives.
    expect(mergeBgLibraryIndex([], [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]))
      .toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    // A background authored on top of that manifest APPENDS — it does not
    // replace, which is the erasure this function exists to stop.
    expect(mergeBgLibraryIndex(
      [{ id: 'new', name: 'New' }],
      [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    )).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'new', name: 'New' }]);
  });

  it('the whole-checkout case is byte-for-byte what it always was', () => {
    // ANTI-VACUOUS in the other direction: with nothing unresolved this must be
    // the old `serializeBgLibraryIndex(project.bgLibrary)` exactly, or every
    // save on the authoring machine churns the tracked manifest.
    const lib = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
    expect(serializeBgLibraryIndex(mergeBgLibraryIndex(lib, [])))
      .toBe(serializeBgLibraryIndex(lib));
  });

  it('an id in both is the LOADED entry: re-authoring under the same id wins', () => {
    expect(mergeBgLibraryIndex(
      [{ id: 'a', name: 'A, remade' }],
      [{ id: 'a', name: 'A, as the manifest had it' }],
    )).toEqual([{ id: 'a', name: 'A, remade' }]);
  });

  it('a duplicated id survives the merge exactly once', () => {
    // parseBgLibraryIndex does not dedupe, so a hand-edited manifest can hand
    // this in; emitting it twice would grow the file on every save.
    expect(mergeBgLibraryIndex([], [{ id: 'a', name: 'A' }, { id: 'a', name: 'A again' }]))
      .toEqual([{ id: 'a', name: 'A' }]);
  });
});
