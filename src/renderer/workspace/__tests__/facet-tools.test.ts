import { describe, it, expect, afterEach } from 'vitest';
import { FACET_TOOLS, toolsForFacet, toolForFacet, switchFacet } from '../facet-tools';
import { TOOL_LABELS } from '../tool-meta';
import { TOOL_IDS } from '../../../core/project/adapter';
import { useWorkspaceStore } from '../workspaceStore';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore } from '../../state/projectStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';

/** The s1 profile's real declaration (core/project/s1/index.ts), as a literal so
 *  a profile edit has to come through here — same style as the adapter tests. */
const S1_LAYOUT_TOOLS = ['view', 'stamp-chunk', 'select'];

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
//
// The worked example used to be classic's layout carrying `place-object`, which
// an intersection would have deleted. Task 9 removed it — it made Objects a
// strict subset of Layout — so s1's real declaration is now a SUBSET of the
// default and no longer distinguishes replace from intersect on its own. The
// guard is kept with a SYNTHETIC declaration below, because the seam is still
// the thing that would break silently.
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

  it('keeps a declared tool the shell default does NOT have (replace, not intersect)', () => {
    // Synthetic, and deliberately so: no shipping profile currently declares a
    // tool outside the default, so an intersect regression would pass every
    // other test in this file. place-object is the right probe because the shell
    // default for layout genuinely lacks it.
    expect(FACET_TOOLS.layout).not.toContain('place-object');
    openClassic({ layout: ['view', 'place-object'] });
    expect(toolsForFacet('layout')).toEqual(['view', 'place-object']);
  });

  it("s1's real layout declaration drops the tools classic cannot drive", () => {
    // The direction the declaration is actually used for today: subtracting
    // marquee / paint-tile / paint-block, which classic has no implementation of.
    openClassic({ layout: S1_LAYOUT_TOOLS });
    for (const t of ['marquee', 'paint-tile', 'paint-block']) {
      expect(toolsForFacet('layout')).not.toContain(t);
    }
    // …and place-object is on OBJECTS, undeclared, straight from the default.
    expect(toolsForFacet('objects')).toContain('place-object');
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
    // …and place-object, which is now the OBJECTS facet's, is clamped away on a
    // switch to layout rather than left resident with no button to show it.
    // This is the exact stranding the clamp exists for, and task 9 created the
    // case by removing place-object from classic's layout declaration.
    expect(toolForFacet('layout', 'place-object')).toBe('view');
    // It survives a switch to the facet that DOES declare it.
    expect(toolForFacet('objects', 'place-object')).toBe('place-object');
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
