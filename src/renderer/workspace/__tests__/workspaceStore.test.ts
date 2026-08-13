import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../workspaceStore';

describe('workspaceStore', () => {
  beforeEach(() => useWorkspaceStore.getState().reset());

  it('defaults every tab to the layout facet', () => {
    expect(useWorkspaceStore.getState().facetFor('level:ojz:act1')).toBe('layout');
  });
  it('remembers facet and viewport per tab', () => {
    const s = useWorkspaceStore.getState();
    s.setFacet('level:ojz:act1', 'collision');
    s.setView('level:ojz:act1', { x: 10, y: 20, zoom: 2 });
    s.setFacet('level:ojz:act2', 'art');
    expect(useWorkspaceStore.getState().facetFor('level:ojz:act1')).toBe('collision');
    expect(useWorkspaceStore.getState().viewFor('level:ojz:act1')).toEqual({ x: 10, y: 20, zoom: 2 });
    expect(useWorkspaceStore.getState().facetFor('level:ojz:act2')).toBe('art');
  });
  it('seed replaces the whole record (session restore), reset clears it', () => {
    const s = useWorkspaceStore.getState();
    s.setFacet('a', 'art');
    s.seed({ b: { facet: 'rings' } });
    expect(useWorkspaceStore.getState().facetFor('a')).toBe('layout');
    expect(useWorkspaceStore.getState().facetFor('b')).toBe('rings');
    s.reset();
    expect(useWorkspaceStore.getState().facetFor('b')).toBe('layout');
  });
});
