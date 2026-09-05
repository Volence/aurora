import { describe, it, expect } from 'vitest';
import { classicObjectRows } from '../object-list-classic';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';

describe('classicObjectRows', () => {
  it('emits one row per named PLACEABLE S1 object (id ≤ $7F), in S1_OBJECT_LIST order', () => {
    // The objpos id byte's bit 7 is the remember-state flag, so the FZ/SBZ2
    // boss actors ($82-$86, named only for their sprite docs) must NOT be
    // offered for placement.
    const placeable = S1_OBJECT_LIST.filter((o) => o.id <= 0x7f);
    expect(placeable.length).toBeLessThan(S1_OBJECT_LIST.length); // $82+ exist and are excluded
    const rows = classicObjectRows('');
    expect(rows).toHaveLength(placeable.length);
    expect(rows.map((r) => r.key)).toEqual(placeable.map((o) => String(o.id)));
    expect(rows.map((r) => r.label)).toEqual(placeable.map((o) => o.name));
  });

  it('badges rows with the $XX hex, so the filter finds an id', () => {
    const bridge = classicObjectRows('').find((r) => r.label === 'Bridge');
    expect(bridge?.badge).toBe(s1ObjectHex(0x11));
    expect(bridge?.key).toBe('17'); // decimal 0x11 — the key is the id stringified
  });

  it('sets hasArt exactly when resolveObjectArt resolves for the zone', () => {
    for (const zone of ['', 'GHZ']) {
      const rows = classicObjectRows(zone);
      for (const row of rows) {
        expect(row.hasArt).toBe(resolveObjectArt(Number(row.key), zone) !== undefined);
      }
    }
  });

  it('resolves zone art overrides: a zone can link an id the base does not', () => {
    // Guards against the provider dropping the `zone` argument: if any id gains
    // art in a zone, the zoned row set must be a strict superset of the base one.
    const base = classicObjectRows('').filter((r) => r.hasArt).map((r) => r.key);
    const ghz = classicObjectRows('GHZ').filter((r) => r.hasArt).map((r) => r.key);
    for (const key of base) expect(ghz).toContain(key);
  });

  it('titles each row with the placement action and its hex', () => {
    const bridge = classicObjectRows('').find((r) => r.label === 'Bridge');
    expect(bridge?.title).toBe('Place Bridge ($11)');
  });
});
