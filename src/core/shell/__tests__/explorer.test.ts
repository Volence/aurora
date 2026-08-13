import { describe, it, expect } from 'vitest';
import { filterExplorer, type ExplorerGroupModel } from '../explorer';

const groups: ExplorerGroupModel[] = [
  {
    id: 'levels', label: 'Levels',
    items: [
      { id: 'level:ghz:1', label: 'Green Hill Act 1' },
      { id: 'level:lz:2', label: 'Labyrinth Act 2' },
    ],
  },
  {
    id: 'objects', label: 'Object Library',
    items: [
      { id: 'obj:75', label: 'Buzz Bomber', hint: '$4B' },
      { id: 'obj:68', label: 'Chopper', hint: '$44' },
    ],
  },
];

describe('filterExplorer', () => {
  it('empty / whitespace query returns groups untouched', () => {
    expect(filterExplorer(groups, '')).toBe(groups);
    expect(filterExplorer(groups, '   ')).toBe(groups);
  });

  it('narrows to matching rows, case-insensitive, dropping empty groups', () => {
    const out = filterExplorer(groups, 'buzz');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('objects');
    expect(out[0].items.map((i) => i.label)).toEqual(['Buzz Bomber']);
  });

  it('matches on hint too (hex ids)', () => {
    const out = filterExplorer(groups, '$44');
    expect(out[0].items.map((i) => i.label)).toEqual(['Chopper']);
  });

  it('keeps multiple groups when both match', () => {
    const out = filterExplorer(groups, 'b');       // laByrinth, Buzz BomBer …
    expect(out.map((g) => g.id)).toEqual(['levels', 'objects']);
  });

  it('no matches → empty list', () => {
    expect(filterExplorer(groups, 'zzz')).toEqual([]);
  });
});
