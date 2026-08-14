import { describe, it, expect } from 'vitest';
import { aeonObjectRows, mapStamp } from '../object-list-aeon';
import type { ObjectDef } from '../../../core/model/s4-types';

const def = (id: string, name: string, sprite?: string): ObjectDef => ({
  id, name, codeLabel: `Obj_${name}`, defaultSubtype: 0, properties: {},
  ...(sprite ? { sprite } : {}),
});

const library: ObjectDef[] = [
  def('ring', 'Ring'),
  def('enemy', 'Patrolling Enemy', 'enemy_walk'),
  def('spring', 'Spring'),
];

describe('aeonObjectRows', () => {
  it('emits one row per object def, in library order', () => {
    const rows = aeonObjectRows(library, {});
    expect(rows.map((r) => r.key)).toEqual(['ring', 'enemy', 'spring']);
    expect(rows.map((r) => r.label)).toEqual(['Ring', 'Patrolling Enemy', 'Spring']);
  });

  it('uses the string id for both key and badge', () => {
    const rows = aeonObjectRows(library, {});
    expect(rows.map((r) => r.badge)).toEqual(['ring', 'enemy', 'spring']);
  });

  it('titles each row with the id and its code label', () => {
    expect(aeonObjectRows(library, {})[0].title).toBe('ring: Obj_Ring');
  });

  it('sets hasArt from a resolved sprite binding, sidecar first', () => {
    const rows = aeonObjectRows(library, { ring: 'ring_sprite' });
    expect(rows.map((r) => r.hasArt)).toEqual([true, true, false]);
  });

  it('treats a blank sidecar entry as unbound rather than as a binding', () => {
    // The sidecar writer deletes rather than blanks; a stale '' must not read as
    // "bound to ''" — same rule resolveObjectSprite enforces for the Explorer.
    const rows = aeonObjectRows([def('ring', 'Ring')], { ring: '' });
    expect(rows[0].hasArt).toBe(false);
  });

  it('returns [] for an absent library rather than throwing', () => {
    expect(aeonObjectRows(undefined, {})).toEqual([]);
    expect(aeonObjectRows([], {})).toEqual([]);
  });
});

describe('mapStamp', () => {
  // The repaint signal for aeon thumbnails: objectSprites is REPLACED, never
  // mutated, so a stable per-instance stamp is exactly "the previews changed".
  it('is stable for one map instance', () => {
    const m = new Map();
    expect(mapStamp(m)).toBe(mapStamp(m));
  });

  it('differs for a republished map, even with identical contents', () => {
    const a = new Map([['ring', 1]]);
    const b = new Map([['ring', 1]]);
    expect(mapStamp(a)).not.toBe(mapStamp(b));
  });
});
