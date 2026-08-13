// Installs the OffscreenCanvas global before the component modules load below
// (register-facets pulls in MapViewport, which touches it at import). Must be
// the first import — ESM evaluates imports in source order.
import './offscreen-canvas-stub';
import { describe, it, expect, beforeEach } from 'vitest';
import { facetsFor, facetRegistry, registerBuiltinFacets } from '../../../core/shell/facets';
import { facetModules } from '../facet-registry';
import { registerAeonFacetModules } from '../register-facets';

describe('facet visibility (registered descriptors ∩ granted ∩ has module)', () => {
  beforeEach(() => { facetRegistry.clear(); facetModules.clear(); });

  it('aeon manifest shows every facet with a registered module, in order', () => {
    registerBuiltinFacets();
    registerAeonFacetModules();
    const granted = ['layout', 'art', 'objects', 'rings', 'collision', 'palette'] as const;
    const visible = facetsFor([...granted]).filter((f) => facetModules.get(f.id));
    // Grows as facet-module tasks land: Task 10 = ['layout']; Task 11 adds
    // objects/rings/collision/palette; Task 12 adds art (full six).
    expect(visible.map((f) => f.id)).toEqual(['layout']);
  });

  it('a facet without a registered module renders nothing (no dead chrome)', () => {
    registerBuiltinFacets();
    // No modules registered at all:
    expect(facetsFor(['layout']).filter((f) => facetModules.get(f.id))).toEqual([]);
  });
});
