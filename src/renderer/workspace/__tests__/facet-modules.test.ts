// The OffscreenCanvas global that register-facets → MapViewport needs at import
// time is installed by vitest setupFiles (src/test/offscreen-canvas-stub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { facetModules, registerFacetModule, moduleFor, mapFacet } from '../facet-registry';

const Stub = () => null;

describe('engine-keyed facet modules', () => {
  beforeEach(() => { facetModules.clear(); });

  it('resolves a module per (engine, facet) pair', () => {
    registerFacetModule(['aeon'], { id: 'layout', Canvas: Stub });
    expect(moduleFor('aeon', 'layout')).not.toBeNull();
    expect(moduleFor('s1', 'layout')).toBeNull();
  });

  it('registers one module for several engines where they have converged', () => {
    registerFacetModule(['aeon', 's1'], { id: 'objects', Canvas: Stub });
    expect(moduleFor('aeon', 'objects')).toBe(moduleFor('s1', 'objects'));
  });

  it('returns null rather than another engine module for an unregistered pair', () => {
    registerFacetModule(['aeon'], { id: 'rings', Canvas: Stub });
    expect(moduleFor('s1', 'rings')).toBeNull();
  });

  it('registers if absent, so HMR and repeated boot do not duplicate', () => {
    const a = { id: 'layout' as const, Canvas: Stub };
    const b = { id: 'layout' as const, Canvas: () => null };
    registerFacetModule(['aeon'], a);
    registerFacetModule(['aeon'], b);
    expect(moduleFor('aeon', 'layout')).toBe(a);
  });

  it('returns null when no engine is open', () => {
    registerFacetModule(['aeon'], { id: 'layout', Canvas: Stub });
    expect(moduleFor(null, 'layout')).toBeNull();
  });

  it('throws on an empty engine list rather than registering nothing', () => {
    // Otherwise the facet just has no pill anywhere, which is indistinguishable
    // from "not built yet" — a registration bug is always a bug.
    expect(() => registerFacetModule([], { id: 'layout', Canvas: Stub })).toThrow(/no engines/);
    expect(moduleFor('aeon', 'layout')).toBeNull();
  });
});

// The defaults mapFacet fills in are AEON's: MapViewport, and a status bar over
// useAeonMapStatusPort (which reads projectStore — null for a classic open, so
// it degrades to aeon vocabulary over an empty store rather than throwing).
// Every one of them must therefore be overridable, which is why they live in the
// spread-last slots object and not in positional parameters.
describe('mapFacet slots override the aeon defaults', () => {
  it('takes the caller Canvas and StatusBar over the built-in ones', () => {
    const Own = () => null;
    const OwnBar = () => null;
    const dflt = mapFacet('layout', { RightPanel: Stub });
    const mine = mapFacet('layout', { Canvas: Own, StatusBar: OwnBar, RightPanel: Stub });
    expect(mine.Canvas).toBe(Own);
    expect(mine.StatusBar).toBe(OwnBar);
    expect(mine.Canvas).not.toBe(dflt.Canvas);
    expect(mine.StatusBar).not.toBe(dflt.StatusBar);
  });

  it('keeps the shared shape an override does not touch', () => {
    const m = mapFacet('collision', { Canvas: () => null, RightPanel: Stub });
    expect(m.id).toBe('collision');
    expect(m.mapOverlays).toBe(true);
    // MapFacetDock is engine-neutral (shared editorStore.tool + toolsForFacet on
    // the open profile), so it is NOT something an engine has to replace.
    expect(m.ToolDock).toBeTypeOf('function');
    // Un-overridden, so still aeon's bar — the thing Task 4 must remember to pass.
    expect(m.StatusBar).toBe(mapFacet('layout', {}).StatusBar);
  });
});

describe('registerAeonFacetModules registers every aeon facet', () => {
  beforeEach(() => { facetModules.clear(); });

  it('covers all six built facets', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    registerAeonFacetModules();
    for (const f of ['layout', 'art', 'objects', 'rings', 'collision', 'palette'] as const) {
      expect(moduleFor('aeon', f), `aeon/${f}`).not.toBeNull();
    }
  });

  // Inverted by Task 4, which registers s1's modules — at which point this
  // becomes the assertion that classic is served rather than that it is not.
  // Until then it is what proves the aeon fallback is really gone: the old
  // Canvas-only registry answered aeon's MapViewport here.
  it('registers no classic modules yet, and does not fall back to aeon', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    registerAeonFacetModules();
    expect(moduleFor('s1', 'layout')).toBeNull();
  });
});

// The View menu's overlay toggles paint on MapViewport and nothing else, so the
// workspace header shows them only for facets built by mapFacet(). This is the
// data behind that gate — the header itself is .tsx and not collected.
describe('mapOverlays marks the facets viewStore.overlays actually paints on', () => {
  beforeEach(() => { facetModules.clear(); });

  it('is set on every map facet and absent on the art facet', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    registerAeonFacetModules();
    for (const f of ['layout', 'objects', 'rings', 'collision', 'palette'] as const) {
      expect(moduleFor('aeon', f)?.mapOverlays, `${f}.mapOverlays`).toBe(true);
    }
    expect(moduleFor('aeon', 'art')?.mapOverlays).toBeFalsy();
  });
});
