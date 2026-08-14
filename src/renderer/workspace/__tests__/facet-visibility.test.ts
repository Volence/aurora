// The OffscreenCanvas global that register-facets → MapViewport needs at import
// time is installed by vitest setupFiles (src/test/offscreen-canvas-stub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { facetsFor, facetRegistry, registerBuiltinFacets } from '../../../core/shell/facets';
import { facetModules, moduleFor, registerFacetModule, resolveFacet } from '../facet-registry';
import { facetChrome, isPlaneGated } from '../facet-chrome';
import { registerAeonFacetModules, registerS1FacetModules } from '../register-facets';
import type { FacetCapability } from '../../../core/project/adapter';
import { S1_FACETS } from '../../../core/project/s1';
import { openCapabilities } from '../../state/open-project';
import { useProjectStore } from '../../state/projectStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';

// FacetBar.tsx is .tsx and not collected, so this covers its filter expression
// rather than its render: facetsFor(granted).filter((f) => moduleFor(engine, f.id)).
describe('facet visibility (registered descriptors ∩ granted ∩ has module for the open engine)', () => {
  beforeEach(() => { facetRegistry.clear(); facetModules.clear(); });

  it('aeon manifest shows every facet with a registered module, in order', () => {
    registerBuiltinFacets();
    registerAeonFacetModules();
    const granted = ['layout', 'art', 'objects', 'rings', 'collision', 'palette'] as const;
    const visible = facetsFor([...granted]).filter((f) => moduleFor('aeon', f.id));
    // Grows as facet-module tasks land: Task 10 = ['layout']; Task 11 adds
    // objects/rings/collision/palette; Task 12 adds art — full six, in order.
    expect(visible.map((f) => f.id)).toEqual(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
  });

  it('s1 manifest shows its three facets with a registered module, in order', () => {
    registerBuiltinFacets();
    registerS1FacetModules();
    const visible = facetsFor([...S1_GRANT] as FacetCapability[]).filter((f) => moduleFor('s1', f.id));
    // Registry order, not grant order — the pills follow core/shell/facets so
    // the bar reads the same way under both engines. Here the two orders happen
    // to agree; `palette` is last in the registry (order 50) and last in the
    // grant, and Layout leads under both.
    expect(visible.map((f) => f.id)).toEqual(['layout', 'art', 'palette']);
  });

  it('a facet without a registered module renders nothing (no dead chrome)', () => {
    registerBuiltinFacets();
    // No modules registered at all:
    expect(facetsFor(['layout']).filter((f) => moduleFor('aeon', f.id))).toEqual([]);
  });

  it('every facet the REAL s1 manifest grants has a module — no pill leads nowhere', () => {
    // The cross-check the old literal could not make: this reads the profile
    // (core/project/s1/index.ts) on one side and the renderer's registration on
    // the other, so granting a facet nobody built fails HERE rather than at
    // runtime on a FacetUnavailable screen.
    registerBuiltinFacets();
    registerS1FacetModules();
    for (const f of S1_FACETS) expect(moduleFor('s1', f), `s1/${f}`).not.toBeNull();
  });

  it('a session record naming the dropped `objects` facet heals to a served one', () => {
    // What a grant drop has to survive: a workspace record persisted while
    // classic still granted the facet. There is no pill for it now, so the only
    // way in is a restored record — and the answer must be another CLASSIC facet,
    // never null (which is FacetUnavailable) and never aeon's module.
    //
    // `objects` is the live case since the merge into Layout (2026-08-14), and
    // `layout` is a particularly good answer for it: everything the Objects
    // facet did is on the facet the heal lands on.
    registerBuiltinFacets();
    registerS1FacetModules();
    expect(resolveFacet('s1', [...S1_GRANT] as FacetCapability[], 'objects')).toBe('layout');
    // Same for collision, the case this heal was originally built for.
    expect(resolveFacet('s1', [...S1_GRANT] as FacetCapability[], 'collision')).toBe('layout');
    // …and `palette`, which a record could name from EITHER era, is served
    // again and so must be kept rather than healed away.
    expect(resolveFacet('s1', [...S1_GRANT] as FacetCapability[], 'palette')).toBe('palette');
  });

  it('a facet granted but module-less FOR THIS ENGINE gets no pill', () => {
    registerBuiltinFacets();
    registerFacetModule(['aeon'], { id: 'layout', Canvas: () => null });
    // The stand-in for any facet an engine grants but does not serve. The filter
    // is engine-keyed, so classic shows neither `collision` nor aeon's layout
    // pill — an engine-blind `facetModules.get(f.id)` would have shown both.
    // (s1's own grant no longer names collision; this asserts the MECHANISM,
    // which is what has to keep working for the next unserved grant.)
    expect(facetsFor(['layout', 'collision']).filter((f) => moduleFor('s1', f.id))).toEqual([]);
    expect(facetsFor(['layout', 'collision']).filter((f) => moduleFor('aeon', f.id)).map((f) => f.id))
      .toEqual(['layout']);
  });
});

// The aeon grant is still a literal (same style as the adapter tests). The s1
// one is THE REAL MANIFEST, imported at the top of this file: it used to be a
// literal here too, and the test below that "checked" it fed that literal into
// the store and then asserted the store returned it — an assertion that could
// not fail. Importing the grant makes these cross-checks between the profile
// and the facet registry, with the EXPECTATIONS left as literals so drift
// still has to be typed out by whoever causes it.
const AEON_GRANT = ['layout', 'art', 'objects', 'rings', 'collision', 'palette']; // core/project/aeon/index.ts
const S1_GRANT = S1_FACETS; // core/project/s1/index.ts — the real thing

/** A module that fills every slot — so a `false` below is the RULE's doing. */
const ALL_SLOTS = {
  toolDock: true, toolOptions: true, rightPanel: true,
  bottomExtra: true, statusBar: true, mapOverlays: true,
} as const;
const chromeWithAct = (facet: FacetCapability) => facetChrome(true, facet, ALL_SLOTS);

function resetProjectStores() {
  useClassicProjectStore.setState({ status: 'closed', capabilities: null } as never);
  useProjectStore.setState({ project: null, config: null, capabilities: null } as never);
}

describe("the facet bar's granted list comes from the OPEN engine's manifest", () => {
  // LevelWorkspace itself cannot be rendered here — the renderer has no
  // DOM/component test harness (see components/classic/__tests__/
  // classic-surface.test.ts for the same constraint). So this pairs a
  // behavioural test of the seam with a source-level guard on its consumer.
  beforeEach(resetProjectStores);

  it('aeon open → the aeon profile grant', () => {
    useProjectStore.setState({ project: {}, capabilities: { facets: AEON_GRANT } } as never);
    expect(openCapabilities()?.facets ?? []).toEqual(AEON_GRANT);
  });

  it('classic open → the s1 profile grant, even though projectStore is empty', () => {
    useClassicProjectStore.setState({ status: 'open', capabilities: { facets: S1_GRANT } } as never);
    // A classic open never populates the aeon project store, so the old direct
    // `useProjectStore((s) => s.capabilities?.facets ?? [])` read resolved to []
    // — a facet bar with no pills at all.
    expect(useProjectStore.getState().capabilities).toBeNull();
    // The REAL grant goes in and a LITERAL comes out. Both sides being S1_GRANT
    // is what made this test unable to fail, whatever the manifest said.
    expect(openCapabilities()?.facets ?? []).toEqual(['layout', 'art', 'palette']);
  });

  it('LevelWorkspace resolves it through that seam, not projectStore', () => {
    const source = readFileSync(join(__dirname, '..', 'LevelWorkspace.tsx'), 'utf8');
    expect(source).toContain('useOpenCapabilities()');
    expect(source).not.toMatch(/useProjectStore\([^)]*capabilities/);
  });
});

// The tests above re-implement the filter rather than running the components,
// which the node-only suite cannot mount. That leaves one gap they cannot close:
// a call site that resolves against a LITERAL engine still satisfies every
// behavioural assertion here, because the assertions call moduleFor themselves.
// This is the guard for that — the same source-level shape as the seam check
// above, applied to the two places the engine is actually threaded through.
describe('both production call sites resolve against the OPEN engine, not a literal', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

  it("FacetBar filters pills on its engine prop", () => {
    const source = read('FacetBar.tsx');
    expect(source).toContain('moduleFor(engine, f.id)');
    expect(source).not.toMatch(/moduleFor\(\s*['"]/);
  });

  it('LevelWorkspace resolves the module on the open engine', () => {
    const source = read('LevelWorkspace.tsx');
    expect(source).toContain('useOpenEngine()');
    // On the RESOLVED facet, not the requested one — otherwise the auto-heal
    // below would change the pill and leave the screen where it was.
    expect(source).toContain('moduleFor(engine, resolved)');
    expect(source).not.toMatch(/moduleFor\(\s*['"]/);
  });
});

// The FG/BG plane control is a HEADER control now — the copies the classic
// viewport used to draw above its canvas are gone (stage-4 plan 5, task 6). That
// makes the facets it is offered on the only thing standing between a user and a
// plane they cannot change, and the facet most easily forgotten is `objects`,
// which reads like a facet about placements rather than about planes. It is not:
//
//   - classic gates object editing on the plane (ClassicLevelViewport: select /
//     place-object act only on FG, and fall through to PAN on BG), so without a
//     plane control the objects facet's own tools silently do nothing whenever
//     the plane was last left on BG — a dead tool with no visible cause;
//   - aeon renders only Plane B on BG and draws the object overlay solely in the
//     FG branch (MapViewport), so the same omission strands an aeon user on a
//     canvas where every object is invisible.
//
// Neither failure throws, logs, or fails another test, which is why this one
// exists. It used to read LevelWorkspace's `showPlane` EXPRESSION out of the
// source, because the decision lived inside a .tsx the suite cannot collect. It
// is a pure function now (facet-chrome.ts), so this runs it.
describe('the header offers the plane control on every facet whose canvas is plane-gated', () => {
  it.each(['layout', 'collision', 'objects', 'rings', 'palette'] as const)(
    '%s can switch plane', (facet) => {
      expect(isPlaneGated(facet)).toBe(true);
      expect(chromeWithAct(facet).planeChips).toBe(true);
    });

  it('and `art` does NOT — its canvas is a composer that reads no plane', () => {
    // The other half of the rule. Without it this guard only ever grows, and a
    // chip over the art facet would write editorStore for a canvas that ignores
    // it — the dead chrome the list exists to prevent.
    expect(isPlaneGated('art')).toBe(false);
    expect(chromeWithAct('art').planeChips).toBe(false);
  });

  it('is still gated on the facet being served at all', () => {
    // Chips that write editorStore over a facet with no canvas are dead chrome.
    // LevelWorkspace passes `mod ? resolved : null`, so null IS "unserved".
    expect(facetChrome(true, null, ALL_SLOTS).planeChips).toBe(false);
  });

  it('LevelWorkspace routes the chips through it rather than re-deriving them', () => {
    const source = readFileSync(join(__dirname, '..', 'LevelWorkspace.tsx'), 'utf8');
    expect(source).toContain('chrome.planeChips');
    // The old inline list must not come back beside the shared one.
    expect(source).not.toMatch(/const showPlane\s*=/);
  });
});

// resolveFacet's own behaviour is covered in facet-tools.test.ts. What no test
// can RUN is its consumer — LevelWorkspace is .tsx — so the two properties the
// helper's correctness rests on are asserted at the source level: that the heal
// is written back at all (otherwise the pill and the screen disagree), and that
// the write happens in an effect (a store write in a render body updates one
// component while another renders).
describe("the unserved-facet heal is wired, and wired outside render", () => {
  const source = readFileSync(join(__dirname, '..', 'LevelWorkspace.tsx'), 'utf8');

  it('resolves the requested facet against the open grant', () => {
    expect(source).toContain('resolveFacet(engine, granted, facetId)');
  });

  it('writes the heal back through switchFacet, from inside an effect', () => {
    // The effect BODY has to contain the call — a `switchFacet(...)` sitting in
    // the render body would satisfy a bare `toContain`.
    expect(source).toMatch(
      /React\.useEffect\(\(\) => \{[^}]*switchFacet\(activeId, resolved\)/,
    );
  });
});
