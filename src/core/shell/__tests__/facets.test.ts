import { describe, it, expect, beforeEach } from 'vitest';
import { facetRegistry, registerBuiltinFacets, facetsFor } from '../facets';

describe('facets', () => {
  beforeEach(() => {
    facetRegistry.clear();
    registerBuiltinFacets();
  });

  it('registers the seven built-in facets', () => {
    expect(facetRegistry.list().map((f) => f.id)).toEqual([
      'layout', 'objects', 'parallax', 'rings', 'collision', 'palette', 'art',
    ]);
  });

  it('puts the canvas-SWAPPING facet last, behind the six that share the map', () => {
    // The ordering rule, asserted rather than left to the docblock (see
    // BUILTIN_FACETS). Five facets are lenses over one map viewport and `art`
    // replaces the canvas with a composer, so `art` last is what makes a pill
    // press inside the group read as a tool/panel swap over a scene that stays
    // put. `art` sat SECOND until 2026-08-14, which put the one real scene
    // change in the middle of the group that isn't one.
    // `parallax` (the Effects lens) joined the map group on 2026-08-22: its
    // right-hand column is the scene editor and its canvas is the same act.
    const MAP_FACETS = ['layout', 'objects', 'parallax', 'rings', 'collision', 'palette'];
    const byOrder = facetRegistry.list()
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((f) => f.id);
    // The map group is CONTIGUOUS and `art` is behind all of it: every facet
    // before the last position shares the canvas, and the last position is the
    // swap. Written as a partition rather than a literal sequence so reordering
    // WITHIN the map group (which is free) does not fail this.
    expect(byOrder[byOrder.length - 1]).toBe('art');
    expect(byOrder.slice(0, -1).sort()).toEqual([...MAP_FACETS].sort());
  });

  it('registerBuiltinFacets is idempotent (safe to call from multiple entry points)', () => {
    registerBuiltinFacets();
    expect(facetRegistry.list()).toHaveLength(7);
  });

  it('facetsFor returns only capability-granted facets, in order', () => {
    // S1 profile: no rings facet (S1 rings are objects — spec §4) and no
    // collision facet (classic has no collision editor — see the grant's
    // comment in core/project/s1/index.ts).
    // Fed in a DIFFERENT order from the registry's, so this also shows the sort
    // is the registry's business and not the caller's.
    const s1 = facetsFor(['layout', 'art', 'objects', 'palette']);
    expect(s1.map((f) => f.id)).toEqual(['layout', 'objects', 'palette', 'art']);
  });

  it('facetsFor includes rings for an aeon-style capability list', () => {
    const aeon = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(aeon.map((f) => f.id)).toEqual(['layout', 'objects', 'rings', 'collision', 'palette', 'art']);
  });

  it("orders aeon's Effects pill between Objects and Rings", () => {
    // The aeon grant, in full. Stated as the whole real list rather than a pair
    // so it also says the Effects pill does not displace anything.
    const aeon = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette', 'parallax']);
    expect(aeon.map((f) => f.id))
      .toEqual(['layout', 'objects', 'parallax', 'rings', 'collision', 'palette', 'art']);
  });

  it('a capability with no registered facet renders nothing (no dead chrome)', () => {
    // `parallax` used to be the example here and is now BUILT (the Effects
    // facet). `events` and `preview` are the two remaining declared-but-unbuilt
    // capabilities — FACET_CAPABILITIES exists precisely so a profile can name
    // one before its facet is written.
    expect(facetsFor(['events'])).toEqual([]);
    expect(facetsFor(['preview'])).toEqual([]);
  });

  it('a later-registered facet slots in by order, not registration sequence', () => {
    // 35 sits between `collision` (30) and `palette` (40) — the slot the
    // ordering docblock names for `events`, and the same shape the built-in
    // `parallax` (15) now occupies for real.
    facetRegistry.register({ id: 'events', label: 'Events', order: 35 });
    const ids = facetsFor(['layout', 'events', 'palette']).map((f) => f.id);
    expect(ids).toEqual(['layout', 'events', 'palette']);
  });

  it('S1 capability list yields no rings facet; aeon yields rings', () => {
    const s1Facets = facetsFor(['layout', 'art', 'objects', 'palette']);
    const aeonFacets = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(s1Facets.some((f) => f.id === 'rings')).toBe(false);
    expect(aeonFacets.some((f) => f.id === 'rings')).toBe(true);
  });
});
