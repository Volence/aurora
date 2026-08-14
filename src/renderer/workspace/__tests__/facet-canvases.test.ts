// The OffscreenCanvas global that register-facets → MapViewport needs at import
// time is installed by vitest setupFiles (src/test/offscreen-canvas-stub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { facetCanvases, registerFacetCanvas, canvasFor } from '../facet-canvases';

const A = () => null;
const B = () => null;

describe('facetCanvases', () => {
  beforeEach(() => { facetCanvases.clear(); });

  it('resolves a canvas by (engine, facet)', () => {
    registerFacetCanvas('aeon', 'layout', A);
    expect(canvasFor('aeon', 'layout')).toBe(A);
  });

  it('keeps engines independent for the same facet', () => {
    registerFacetCanvas('aeon', 'layout', A);
    registerFacetCanvas('s1', 'layout', B);
    expect(canvasFor('aeon', 'layout')).toBe(A);
    expect(canvasFor('s1', 'layout')).toBe(B);
  });

  it('returns null for an unregistered pair rather than throwing', () => {
    registerFacetCanvas('aeon', 'layout', A);
    expect(canvasFor('s1', 'layout')).toBeNull();
    expect(canvasFor('aeon', 'art')).toBeNull();
  });

  it('returns null when no engine is open', () => {
    registerFacetCanvas('aeon', 'layout', A);
    expect(canvasFor(null, 'layout')).toBeNull();
  });

  it('is register-if-absent, matching the house pattern', () => {
    registerFacetCanvas('aeon', 'layout', A);
    registerFacetCanvas('aeon', 'layout', B);
    expect(canvasFor('aeon', 'layout')).toBe(A);
  });
});

describe('registerAeonFacetModules registers every aeon canvas', () => {
  beforeEach(() => { facetCanvases.clear(); });

  it('covers all six built facets', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    registerAeonFacetModules();
    for (const f of ['layout', 'art', 'objects', 'rings', 'collision', 'palette'] as const) {
      expect(canvasFor('aeon', f), `aeon/${f}`).not.toBeNull();
    }
  });

  it('registers no classic canvases yet', () => {
    expect(canvasFor('s1', 'layout')).toBeNull();
  });
});

// The View menu's overlay toggles paint on MapViewport and nothing else, so the
// workspace header shows them only for facets built by mapFacet(). This is the
// data behind that gate — the header itself is .tsx and not collected.
describe('mapOverlays marks the facets viewStore.overlays actually paints on', () => {
  it('is set on every map facet and absent on the art facet', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    const { facetModules } = await import('../facet-registry');
    registerAeonFacetModules();
    for (const f of ['layout', 'objects', 'rings', 'collision', 'palette'] as const) {
      expect(facetModules.get(f)?.mapOverlays, `${f}.mapOverlays`).toBe(true);
    }
    expect(facetModules.get('art')?.mapOverlays).toBeFalsy();
  });
});
