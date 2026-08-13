import { describe, it, expect } from 'vitest';
import { FACET_TOOLS, toolForFacet } from '../facet-tools';

describe('facet tool sets', () => {
  it('every facet lists its tools with the default first', () => {
    expect(FACET_TOOLS.layout![0]).toBe('stamp-chunk');
    expect(FACET_TOOLS.objects![0]).toBe('place-object');
    expect(FACET_TOOLS.rings![0]).toBe('place-ring');
    expect(FACET_TOOLS.collision![0]).toBe('paint-collision');
    expect(FACET_TOOLS.palette![0]).toBe('view');
  });
  it('keeps the current tool when the target facet allows it', () => {
    expect(toolForFacet('objects', 'select')).toBe('select');
    expect(toolForFacet('layout', 'view')).toBe('view');
  });
  it('falls to the facet default when the current tool is foreign', () => {
    expect(toolForFacet('rings', 'stamp-chunk')).toBe('place-ring');
    expect(toolForFacet('collision', 'place-object')).toBe('paint-collision');
  });
});
