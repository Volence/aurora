import { describe, it, expect } from 'vitest';
import { groupEntriesByZone } from '../report-grouping';
import type { ResolutionEntry } from '../../../../core/project/report';

const E = (key: string, status: ResolutionEntry['status'] = 'resolved'): ResolutionEntry => ({
  key,
  path: `${key}.bin`,
  status,
});

describe('groupEntriesByZone', () => {
  it('buckets act-owned entries under their zone and flat keys under global', () => {
    const entries = [
      E('ghz.act1.fgLayout'),
      E('ghz.act2.blocks', 'missing'),
      E('mz.act1.chunks'),
      E('collision.normal'),
      E('collision.rotated'),
    ];
    const groups = groupEntriesByZone(entries, ['ghz', 'mz', 'syz']);
    expect(groups.map((g) => g.id)).toEqual(['ghz', 'mz', 'global']);

    const ghz = groups.find((g) => g.id === 'ghz')!;
    expect(ghz.total).toBe(2);
    expect(ghz.resolved).toBe(1);

    const global = groups.find((g) => g.id === 'global')!;
    expect(global.total).toBe(2);
    expect(global.resolved).toBe(2);
  });

  it('preserves zoneOrder and omits empty zones; global is always last', () => {
    const entries = [E('mz.act1.tiles.0'), E('ghz.act1.tiles.0'), E('unknownkey.x')];
    const groups = groupEntriesByZone(entries, ['ghz', 'mz', 'syz']);
    // ghz before mz (zoneOrder), syz omitted (empty), global (unknownkey) last.
    expect(groups.map((g) => g.id)).toEqual(['ghz', 'mz', 'global']);
  });

  it('returns [] for no entries', () => {
    expect(groupEntriesByZone([], ['ghz'])).toEqual([]);
  });
});
