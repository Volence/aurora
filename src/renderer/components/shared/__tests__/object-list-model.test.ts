import { describe, it, expect } from 'vitest';
import { filterRows, type ObjectRow } from '../object-list-model';

const rows: ObjectRow[] = [
  { key: '11', badge: '$11', label: 'Bridge' },
  { key: '18', badge: '$18', label: 'Platform' },
  { key: 'enemy', badge: 'enemy', label: 'Patrolling Enemy' },
];

describe('filterRows', () => {
  it('returns every row for an empty filter', () => {
    expect(filterRows(rows, '')).toHaveLength(3);
  });

  it('matches the label case-insensitively', () => {
    expect(filterRows(rows, 'bri').map((r) => r.key)).toEqual(['11']);
    expect(filterRows(rows, 'BRI').map((r) => r.key)).toEqual(['11']);
  });

  it('matches the badge too, so hex ids are findable', () => {
    expect(filterRows(rows, '$18').map((r) => r.key)).toEqual(['18']);
  });

  it('matches the key, so an aeon string id is findable', () => {
    expect(filterRows(rows, 'enemy').map((r) => r.key)).toEqual(['enemy']);
  });

  it('trims whitespace rather than matching nothing', () => {
    expect(filterRows(rows, '  bridge  ').map((r) => r.key)).toEqual(['11']);
  });

  it('returns an empty array on no match, not every row', () => {
    expect(filterRows(rows, 'zzz')).toEqual([]);
  });

  it('preserves source order', () => {
    expect(filterRows(rows, '').map((r) => r.key)).toEqual(['11', '18', 'enemy']);
  });
});
