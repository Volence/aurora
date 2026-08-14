// The OffscreenCanvas global that register-facets → MapViewport needs at import
// time is installed by vitest setupFiles (src/test/offscreen-canvas-stub.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { facetsFor, facetRegistry, registerBuiltinFacets } from '../../../core/shell/facets';
import { facetModules, moduleFor, registerFacetModule } from '../facet-registry';
import { registerAeonFacetModules } from '../register-facets';
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

  it('a facet without a registered module renders nothing (no dead chrome)', () => {
    registerBuiltinFacets();
    // No modules registered at all:
    expect(facetsFor(['layout']).filter((f) => moduleFor('aeon', f.id))).toEqual([]);
  });

  it('a facet granted but module-less FOR THIS ENGINE gets no pill', () => {
    registerBuiltinFacets();
    registerFacetModule(['aeon'], { id: 'layout', Canvas: () => null });
    // s1's profile grants `collision` with no collision editor built. The filter
    // is engine-keyed, so classic shows neither that nor aeon's layout pill —
    // an engine-blind `facetModules.get(f.id)` would have shown both.
    expect(facetsFor(['layout', 'collision']).filter((f) => moduleFor('s1', f.id))).toEqual([]);
    expect(facetsFor(['layout', 'collision']).filter((f) => moduleFor('aeon', f.id)).map((f) => f.id))
      .toEqual(['layout']);
  });
});

// The grants the two profiles actually declare, kept as literals so a profile
// edit has to come through here (same style as the adapter tests).
const AEON_GRANT = ['layout', 'art', 'objects', 'rings', 'collision', 'palette']; // core/project/aeon/index.ts
// NOTE: s1 grants `collision` even though classic has no collision editor yet
// (classicSetColind has no component callers). That mismatch is a known OPEN
// product decision — spec §3.0.3 — and is deliberately NOT resolved here:
// classic still renders through LegacyWorkspace, so nothing user-visible reads
// this grant. Asserted as-is.
const S1_GRANT = ['layout', 'art', 'objects', 'collision', 'palette']; // core/project/s1/index.ts

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
    expect(openCapabilities()?.facets ?? []).toEqual(S1_GRANT);
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
    expect(source).toContain('moduleFor(engine, facetId)');
    expect(source).not.toMatch(/moduleFor\(\s*['"]/);
  });
});
