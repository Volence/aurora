import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { FACET_TOOLS, toolsForFacet, toolForFacet, switchFacet, resolveFacet } from '../facet-tools';
import { TOOL_LABELS } from '../tool-meta';
import { TOOL_IDS, type FacetCapability } from '../../../core/project/adapter';
import { facetModules, registerFacetModule } from '../facet-registry';
import { useWorkspaceStore } from '../workspaceStore';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore } from '../../state/projectStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';

/** The s1 profile's real declaration (core/project/s1/index.ts), as a literal so
 *  a profile edit has to come through here — same style as the adapter tests. */
const S1_LAYOUT_TOOLS = ['view', 'stamp-chunk', 'select', 'place-object'];

function closeProjects() {
  useClassicProjectStore.setState({ status: 'closed', capabilities: null } as never);
  useProjectStore.setState({ project: null, config: null, capabilities: null } as never);
}
function openClassic(facetTools: unknown) {
  useClassicProjectStore.setState({
    status: 'open', capabilities: { facets: ['layout'], facetTools },
  } as never);
}

describe('facet tool sets', () => {
  it('every facet lists its tools with the default first', () => {
    expect(FACET_TOOLS.layout![0]).toBe('stamp-chunk');
    expect(FACET_TOOLS.objects![0]).toBe('place-object');
    expect(FACET_TOOLS.rings![0]).toBe('place-ring');
    expect(FACET_TOOLS.collision![0]).toBe('paint-collision');
    expect(FACET_TOOLS.palette![0]).toBe('view');
  });
  it('keeps the current tool when the target facet allows it', () => {
    expect(toolForFacet('objects', 'select')).toBe('select');
    expect(toolForFacet('layout', 'view')).toBe('view');
  });
  it('falls to the facet default when the current tool is foreign', () => {
    expect(toolForFacet('rings', 'stamp-chunk')).toBe('place-ring');
    expect(toolForFacet('collision', 'place-object')).toBe('paint-collision');
  });

  it('switchFacet records the tab facet and re-scopes the tool to the facet set', () => {
    useWorkspaceStore.getState().reset();
    // A tool foreign to the target facet is re-scoped to the facet default.
    useEditorStore.getState().setTool('stamp-chunk');
    switchFacet('level:x:1', 'collision');
    expect(useWorkspaceStore.getState().facetFor('level:x:1')).toBe('collision');
    expect(useEditorStore.getState().tool).toBe('paint-collision');
    // A tool the target facet allows is kept.
    useEditorStore.getState().setTool('view');
    switchFacet('level:x:1', 'collision');
    expect(useEditorStore.getState().tool).toBe('view');
  });
});

// The profile seam (spec §3.6): a profile declares the tools its facets offer,
// and that declaration REPLACES the shell default rather than intersecting it.
// The intersect rule the spec's prose asked for would delete `place-object`
// from classic's layout — the one tool the declaration exists to add — so these
// cases are the guard on that direction, not just on the plumbing.
describe('toolsForFacet — profile declaration over shell default', () => {
  afterEach(closeProjects);

  it('falls back to the shell default when no project is open', () => {
    closeProjects();
    expect(toolsForFacet('layout')).toEqual(FACET_TOOLS.layout);
    expect(toolsForFacet('collision')).toEqual(FACET_TOOLS.collision);
  });

  it("uses the profile's list, in the profile's order, for a facet it declares", () => {
    openClassic({ layout: S1_LAYOUT_TOOLS });
    expect(toolsForFacet('layout')).toEqual(S1_LAYOUT_TOOLS);
  });

  it('keeps place-object, which an intersection with the default would drop', () => {
    // The regression this whole seam exists to prevent: the shell's default
    // layout set has no place-object, so intersecting would leave classic's map
    // unable to arm a placement at all.
    expect(FACET_TOOLS.layout).not.toContain('place-object');
    openClassic({ layout: S1_LAYOUT_TOOLS });
    expect(toolsForFacet('layout')).toContain('place-object');
  });

  it('a declared profile still gets the default for facets it does NOT name', () => {
    openClassic({ layout: S1_LAYOUT_TOOLS });
    expect(toolsForFacet('collision')).toEqual(FACET_TOOLS.collision);
    expect(toolsForFacet('palette')).toEqual(FACET_TOOLS.palette);
  });

  it('aeon declares nothing, so every facet keeps the default', () => {
    closeProjects();
    useProjectStore.setState({ project: {}, capabilities: { facets: ['layout'] } } as never);
    expect(toolsForFacet('layout')).toEqual(FACET_TOOLS.layout);
    expect(toolsForFacet('objects')).toEqual(FACET_TOOLS.objects);
  });

  it("'art' offers no EditorTool at all, under either engine", () => {
    closeProjects();
    expect(toolsForFacet('art')).toEqual([]);
    openClassic({ layout: S1_LAYOUT_TOOLS });
    expect(toolsForFacet('art')).toEqual([]);
  });

  it('a facet switch under classic never lands on a tool classic cannot drive', () => {
    openClassic({ layout: S1_LAYOUT_TOOLS });
    // marquee/paint-tile/paint-block are shell defaults classic has no
    // implementation for; the declared default (first entry) takes over.
    expect(toolForFacet('layout', 'marquee')).toBe('view');
    expect(toolForFacet('layout', 'paint-block')).toBe('view');
    // …while a declared tool is still kept across the switch.
    expect(toolForFacet('layout', 'place-object')).toBe('place-object');
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

describe('tool labels', () => {
  it('names every tool in the vocabulary exactly once', () => {
    // Record<ToolId, string> makes this exhaustive at compile time; the runtime
    // check catches a union member added to TOOL_IDS with the map not rebuilt
    // (which type-checks only until someone widens the map's type).
    expect(Object.keys(TOOL_LABELS).sort()).toEqual([...TOOL_IDS].sort());
    expect(new Set(Object.values(TOOL_LABELS)).size).toBe(TOOL_IDS.length);
  });
});
