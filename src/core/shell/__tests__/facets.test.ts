import { describe, it, expect, beforeEach } from 'vitest';
import { facetRegistry, registerBuiltinFacets, facetsFor } from '../facets';

describe('facets', () => {
  beforeEach(() => {
    facetRegistry.clear();
    registerBuiltinFacets();
  });

  it('registers the six built-in facets', () => {
    expect(facetRegistry.list().map((f) => f.id)).toEqual([
      'layout', 'art', 'objects', 'rings', 'collision', 'palette',
    ]);
  });

  it('registerBuiltinFacets is idempotent (safe to call from multiple entry points)', () => {
    registerBuiltinFacets();
    expect(facetRegistry.list()).toHaveLength(6);
  });

  it('facetsFor returns only capability-granted facets, in order', () => {
    // S1 profile: no rings facet (S1 rings are objects — spec §4)
    const s1 = facetsFor(['layout', 'art', 'objects', 'collision', 'palette']);
    expect(s1.map((f) => f.id)).toEqual(['layout', 'art', 'objects', 'collision', 'palette']);
  });

  it('facetsFor includes rings for an aeon-style capability list', () => {
    const aeon = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(aeon.map((f) => f.id)).toEqual(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
  });

  it('a capability with no registered facet renders nothing (no dead chrome)', () => {
    expect(facetsFor(['parallax'])).toEqual([]);
  });

  it('a later-registered facet slots in by order, not registration sequence', () => {
    facetRegistry.register({ id: 'parallax', label: 'Parallax', order: 25 });
    const ids = facetsFor(['layout', 'parallax', 'collision']).map((f) => f.id);
    expect(ids).toEqual(['layout', 'parallax', 'collision']);
  });

  it('S1 capability list yields no rings facet; aeon yields rings', () => {
    const s1Facets = facetsFor(['layout', 'art', 'objects', 'collision', 'palette']);
    const aeonFacets = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(s1Facets.some((f) => f.id === 'rings')).toBe(false);
    expect(aeonFacets.some((f) => f.id === 'rings')).toBe(true);
  });
});
