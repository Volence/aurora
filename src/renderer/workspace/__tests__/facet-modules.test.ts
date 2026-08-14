// The OffscreenCanvas global that register-facets → MapViewport needs at import
// time is installed by vitest setupFiles (src/test/offscreen-canvas-stub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  // The aeon registration on its own still serves NOTHING for classic. That is
  // what proves the aeon fallback is really gone — the old Canvas-only registry
  // answered aeon's MapViewport here — and it is why the two register functions
  // stayed separate: if one implied the other this could not be asked.
  it('does not fall back to aeon for a classic pair', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    registerAeonFacetModules();
    expect(moduleFor('s1', 'layout')).toBeNull();
  });
});

describe('registerS1FacetModules registers every facet the s1 profile grants', () => {
  // The s1 profile's real grant (core/project/s1/index.ts), as a literal so a
  // profile edit has to come through here — the house style for these.
  const S1_GRANT = ['layout', 'art', 'objects', 'palette'] as const;

  beforeEach(() => { facetModules.clear(); });

  it('serves all four, and nothing outside the grant', async () => {
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    for (const f of S1_GRANT) expect(moduleFor('s1', f), `s1/${f}`).not.toBeNull();
    // A module for an ungranted facet is dead code with no pill: FacetBar shows
    // granted ∩ registered, so it could only ever be reached by a stale session
    // record — and resolveFacet exists to heal exactly that away.
    for (const f of ['rings', 'collision'] as const) {
      expect(moduleFor('s1', f), `s1/${f}`).toBeNull();
    }
  });

  it('leaves aeon untouched — the two registrations are independent', async () => {
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    expect(moduleFor('aeon', 'layout')).toBeNull();
  });

  it('gives every classic module its OWN canvas and status bar, never aeon defaults', async () => {
    // The trap mapFacet's docblock is written against: an engine that overrode
    // only the Canvas would inherit StatusBar: AeonMapStatusBar, whose port
    // reads projectStore — null for a classic open — putting aeon vocabulary
    // over an empty aeon store beside a classic canvas.
    const [{ registerS1FacetModules, registerAeonFacetModules }, { mapFacet }] = await Promise.all([
      import('../register-facets'), import('../facet-registry'),
    ]);
    registerAeonFacetModules();
    registerS1FacetModules();
    const aeonDefaults = mapFacet('layout', {});
    for (const f of S1_GRANT) {
      const m = moduleFor('s1', f)!;
      expect(m.Canvas, `s1/${f}.Canvas`).not.toBe(aeonDefaults.Canvas);
      expect(m.StatusBar, `s1/${f}.StatusBar`).not.toBe(aeonDefaults.StatusBar);
      expect(m.Canvas, `s1/${f}.Canvas`).not.toBe(moduleFor('aeon', f)?.Canvas);
    }
  });

  it('marks only the map facets as overlay-painting', async () => {
    // The composer never reads viewStore.overlays, so a View menu over the art
    // and palette facets would be a control that visibly does nothing.
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    expect(moduleFor('s1', 'layout')?.mapOverlays).toBe(true);
    expect(moduleFor('s1', 'objects')?.mapOverlays).toBe(true);
    expect(moduleFor('s1', 'art')?.mapOverlays).toBeFalsy();
    expect(moduleFor('s1', 'palette')?.mapOverlays).toBeFalsy();
  });

  it('shares one composer surface between art and palette', async () => {
    // Classic's composer is ONE surface with its own internal tabs; merging it
    // with aeon's staged pixel document is step H. Asserted so the sharing reads
    // as a decision rather than a copy-paste nobody meant.
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    expect(moduleFor('s1', 'art')?.Canvas).toBe(moduleFor('s1', 'palette')?.Canvas);
    // …and the two map facets likewise share classic's one level viewport.
    expect(moduleFor('s1', 'layout')?.Canvas).toBe(moduleFor('s1', 'objects')?.Canvas);
  });

  it("leaves the slots Tasks 6 and 7 fill empty rather than half-built", async () => {
    // Layout's ToolOptions is classic's contextual hint line, still inside the
    // viewport's OptionBar (Task 6); layout's RightPanel is missing ChunkPicker
    // (Task 7). Both are recorded as absent so the next task can see what it
    // owes, and so "undefined" here reads as pending rather than as an oversight.
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    expect(moduleFor('s1', 'layout')?.ToolOptions).toBeUndefined();
  });
});

// Every test above calls the register functions ITSELF, so all of them stay
// green against an App that calls neither — and the registry is empty in
// production, every pill vanishes, and the workspace says the engine has no
// editor for anything. App.tsx is .tsx and not collected, so this is the only
// place the wiring can be checked at all.
describe('App registers both engines at mount, before any project can load', () => {
  const source = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8');

  it('calls each register function', () => {
    expect(source).toContain('registerAeonFacetModules();');
    expect(source).toContain('registerS1FacetModules();');
  });

  it('calls them from the mount effect, not from a project-open path', () => {
    // `useEffect(..., [])` — a registration hung off a load would race the first
    // render of a restored session's workspace.
    const mount = source.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[\]\);/);
    expect(mount, 'App has no mount effect').not.toBeNull();
    expect(mount![1]).toContain('registerAeonFacetModules();');
    expect(mount![1]).toContain('registerS1FacetModules();');
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
