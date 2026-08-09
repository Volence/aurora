import { describe, it, expect } from 'vitest';
import { collisionDataPathCandidates } from '../../src/core/config/s4-config';

// The engine repo's engine/game split moved data/ under games/<game>/ — the
// old root-relative 'data/collision/' default silently 404s there, so the
// loader needs candidates derived from where the project's act data actually
// lives.
describe('collisionDataPathCandidates', () => {
  it('derives games/<game>/data/collision/ from the act dataPath', () => {
    const raw = {
      zones: [{ acts: [{ dataPath: 'games/sonic4/data/editor/ojz/act1/' }] }],
    } as never;
    expect(collisionDataPathCandidates(raw)).toEqual([
      'games/sonic4/data/collision/',
      'data/collision/',
    ]);
  });

  it('puts an explicit collisionDataPath first', () => {
    const raw = {
      collisionDataPath: 'custom/coll/',
      zones: [{ acts: [{ dataPath: 'games/sonic4/data/editor/ojz/act1/' }] }],
    } as never;
    expect(collisionDataPathCandidates(raw)[0]).toBe('custom/coll/');
  });

  it('root-relative dataPath dedupes into the legacy fallback', () => {
    const raw = { zones: [{ acts: [{ dataPath: 'data/editor/ojz/act1/' }] }] } as never;
    expect(collisionDataPathCandidates(raw)).toEqual(['data/collision/']);
  });

  it('no data/ segment → legacy fallback only; gamedata/ is not a data/ segment', () => {
    const raw = { zones: [{ acts: [{ dataPath: 'gamedata/levels/act1/' }] }] } as never;
    expect(collisionDataPathCandidates(raw)).toEqual(['data/collision/']);
  });
});
