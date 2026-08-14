// The OffscreenCanvas global that register-facets → MapViewport needs at import
// time is installed by vitest setupFiles (src/test/offscreen-canvas-stub.ts).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { facetModules, registerFacetModule, moduleFor, mapFacet, resolveFacet } from '../facet-registry';
import type { FacetCapability } from '../../../core/project/adapter';

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

  it('mounts the contextual hint line on BOTH map facets', async () => {
    // Task 6 filled the slot this test used to assert empty. The hint is keyed
    // on the TOOL, not the facet — every tool the objects facet offers has a
    // branch in it, including the one that explains a click that did nothing on
    // BG — so withholding it from `objects` would hide it where it helps most.
    // (Layout's RightPanel is still missing ChunkPicker; that is Task 7.)
    const { registerS1FacetModules, registerAeonFacetModules } = await import('../register-facets');
    registerS1FacetModules();
    const layout = moduleFor('s1', 'layout')?.ToolOptions;
    expect(layout).toBeDefined();
    expect(moduleFor('s1', 'objects')?.ToolOptions).toBe(layout);
    // Not aeon's: its map facets have no tool-options bar at all, and inheriting
    // classic's hint vocabulary would be a lie about that canvas. Aeon is
    // registered explicitly — `moduleFor` on an unregistered engine answers
    // null, which would make this assertion pass without proving anything.
    registerAeonFacetModules();
    expect(moduleFor('aeon', 'layout')).not.toBeNull();
    expect(moduleFor('aeon', 'layout')?.ToolOptions).toBeUndefined();
    expect(moduleFor('aeon', 'objects')?.ToolOptions).toBeUndefined();
  });
});

// The auto-heal for a facet the open engine cannot serve. Deliberately NOT the
// deleted aeon fallback: that one lied about the DATA (aeon's viewport over an
// empty classic store while still claiming to be the requested facet). This
// changes the SELECTION, to another facet of the SAME engine, and LevelWorkspace
// makes it non-silent by writing it back through switchFacet so the lit pill
// matches the screen.
describe('resolveFacet', () => {
  const S1_GRANT: readonly FacetCapability[] = ['layout', 'art', 'objects', 'palette'];
  const stub = (id: FacetCapability) => ({ id, Canvas: () => null });

  beforeEach(() => { facetModules.clear(); });
  afterEach(() => { facetModules.clear(); });

  it('keeps the requested facet when this engine serves it', () => {
    registerFacetModule(['s1'], stub('layout'));
    registerFacetModule(['s1'], stub('objects'));
    expect(resolveFacet('s1', S1_GRANT, 'objects')).toBe('objects');
  });

  it('heals a granted-but-unserved facet to the first served one', () => {
    // `art` granted, no s1 art module — the restored-session case.
    registerFacetModule(['s1'], stub('layout'));
    expect(resolveFacet('s1', S1_GRANT, 'art')).toBe('layout');
  });

  it('heals a facet this engine no longer grants, even if a module exists', () => {
    // The exact shape of the dropped collision grant: a session saved while s1
    // still granted `collision` reopens naming a facet outside the new grant.
    // Registration alone must not be enough to keep it, or the shell would show
    // a screen with no pill to match it.
    registerFacetModule(['s1'], stub('layout'));
    registerFacetModule(['s1'], stub('collision'));
    expect(resolveFacet('s1', S1_GRANT, 'collision')).toBe('layout');
  });

  it('takes the first GRANTED facet that is served, in the grant order', () => {
    // layout is granted first but unserved; the answer is the next served grant,
    // not the first registered module.
    registerFacetModule(['s1'], stub('palette'));
    registerFacetModule(['s1'], stub('objects'));
    expect(resolveFacet('s1', S1_GRANT, 'layout')).toBe('objects');
  });

  it('resolves against the OPEN engine, not any engine', () => {
    registerFacetModule(['aeon'], stub('layout'));
    expect(resolveFacet('s1', S1_GRANT, 'layout')).toBeNull();
    expect(resolveFacet('aeon', S1_GRANT, 'layout')).toBe('layout');
  });

  it('is null when the engine serves nothing granted — FacetUnavailable stays', () => {
    expect(resolveFacet('s1', S1_GRANT, 'layout')).toBeNull();
    registerFacetModule(['s1'], stub('rings')); // served but not granted
    expect(resolveFacet('s1', S1_GRANT, 'layout')).toBeNull();
  });

  it('is null with no engine open and with an empty grant', () => {
    registerFacetModule(['s1'], stub('layout'));
    expect(resolveFacet(null, S1_GRANT, 'layout')).toBeNull();
    expect(resolveFacet('s1', [], 'layout')).toBeNull();
  });

  it('is idempotent, so the write-back cannot loop', () => {
    // LevelWorkspace calls switchFacet(tab, resolved) from an effect, which
    // re-renders with facetId === resolved. If resolving THAT produced a
    // different answer the effect would fire again, forever.
    registerFacetModule(['s1'], stub('objects'));
    const once = resolveFacet('s1', S1_GRANT, 'layout');
    expect(once).toBe('objects');
    expect(resolveFacet('s1', S1_GRANT, once!)).toBe(once);
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

  it('calls them from a mount effect, not from a project-open path', () => {
    // A registration hung off a load would race the first render of a restored
    // session's workspace, so the calls have to sit in a `[]`-dep effect.
    //
    // Every effect in the file, each matched INDEPENDENTLY: the body is
    // tempered so it cannot swallow another `useEffect(`. A plain non-greedy
    // `[\s\S]*?` anchored on the first effect would, the moment an effect with a
    // real dep list is added above this one, run from that effect's opening to
    // the mount effect's `}, []);` — spanning both, and quietly proving nothing.
    const EFFECT = /useEffect\(\(\) => \{((?:(?!useEffect\()[\s\S])*?)\}, \[([^\]]*)\]\);/g;
    const mountBodies = [...source.matchAll(EFFECT)]
      .filter(([, , deps]) => deps.trim() === '')
      .map(([, body]) => body);

    expect(mountBodies.length, 'App has no []-dep effect at all').toBeGreaterThan(0);
    expect(mountBodies.some((b) => b.includes('registerAeonFacetModules();')
      && b.includes('registerS1FacetModules();'))).toBe(true);
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
