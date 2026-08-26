import { describe, it, expect, afterEach } from 'vitest';
import { FACET_TOOLS, toolsForFacet, toolForFacet, switchFacet } from '../facet-tools';
import { TOOL_LABELS, TOOL_KEYS, dockOrder } from '../tool-meta';
import { TOOL_IDS } from '../../../core/project/adapter';
import { useWorkspaceStore } from '../workspaceStore';
import { useEditorStore, type EditorTool } from '../../state/editorStore';
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
// an intersection would have deleted. It has come and gone three times now —
// removed when Objects was split off Layout, restored when Objects merged back
// in, removed again when that merge was reversed (2026-08-14) — so s1's real
// declaration is a strict SUBSET of the default again and no longer
// distinguishes replace from intersect on its own. The SYNTHETIC guard below is
// what holds the rule, and the churn above is why it is not hung on a shipping
// profile.
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
    expect(toolsForFacet('layout')).not.toContain('place-object');
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
    // …and place-object, which is the OBJECTS facet's, is clamped away on a
    // switch to layout rather than left resident with no button to show it.
    // This is the exact stranding the clamp exists for. The assertion has
    // flipped with the manifest twice; it is spelled out on both facets rather
    // than folded together so the next flip has to state which way it went.
    expect(toolForFacet('layout', 'place-object')).toBe('view');
    // It survives a switch to the facet that DOES offer it (undeclared, so the
    // shell default ['place-object','select','view']).
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

// The RAIL's order, which is not the facet's tool order. `toolsForFacet` puts
// the facet DEFAULT first, and the two profiles disagree about where View sits
// in that list — classic declares layout as `view / stamp-chunk / select`, the
// shell default for objects is `place-object / select / view`. Rendered in that
// order, View was the top button on Layout and the bottom button on Objects, so
// the armed tool moved under the cursor on every facet switch.
describe('dockOrder', () => {
  it('is stable across facets whose sets overlap', () => {
    const layout = dockOrder(['view', 'stamp-chunk', 'select']);
    const objects = dockOrder(['place-object', 'select', 'view']);
    // Every tool both rails carry appears in the same relative order on both.
    const shared = layout.filter((t) => objects.includes(t));
    expect(shared).toEqual(objects.filter((t) => layout.includes(t)));
    // And specifically: View is not first on one rail and last on the other.
    expect(layout.indexOf('view')).toBe(0);
    expect(objects.indexOf('view')).toBe(0);
  });

  it('does not change WHICH tools a facet offers', () => {
    const set: readonly EditorTool[] = ['place-ring', 'select', 'view'];
    expect([...dockOrder(set)].sort()).toEqual([...set].sort());
  });

  it('leaves the facet DEFAULT alone — that is toolsForFacet\'s first entry', () => {
    // The two orders are decoupled on purpose: sorting the buttons must not
    // change what a facet arms when you switch to it.
    expect(toolForFacet('objects', 'stamp-chunk')).toBe('place-object');
  });

  it('orders by the one vocabulary, so an unknown tool cannot reshuffle a rail', () => {
    expect(dockOrder([...TOOL_IDS])).toEqual([...TOOL_IDS]);
  });
});

// THE EFFECTS FACET HAS A SECOND TOOL (triage 2026-08-26 §A.3, parcel B).
// Item 43 hung the band mark on View's mouseup because View was the facet's only
// tool, and that made every pan-click a band gesture. The mark is a tool now;
// View leads (pure pan) and `mark-band` sits beside it.
describe('effects facet tools', () => {
  it('offers View first and Mark band second — nothing else', () => {
    expect(FACET_TOOLS.parallax).toEqual(['view', 'mark-band']);
  });
  it('mark-band is offered by NO other facet', () => {
    for (const [facet, tools] of Object.entries(FACET_TOOLS)) {
      if (facet === 'parallax') continue;
      expect(tools, facet).not.toContain('mark-band');
    }
  });
});

// THE LAYOUT FACET GAINS THE BAND STAMP (triage 2026-08-26 §A.8, parcel J).
// It writes Plane B's layout — the same file `paint-tile` in the BG layer
// writes — so it lives beside that tool, in the facet whose Art panel is the
// picker the band is chosen from. It is a TOOL and not a paint-tile mode so a
// dock button, a letter and a status-bar hint say it exists (the lesson of §A.3).
describe('band stamp tool', () => {
  it('is offered by the layout facet, after paint-tile', () => {
    const layout = FACET_TOOLS.layout!;
    expect(layout).toContain('stamp-band');
    expect(layout.indexOf('stamp-band')).toBeGreaterThan(layout.indexOf('paint-tile'));
    expect(layout[0]).not.toBe('stamp-band');
  });
  it('is offered by NO other facet', () => {
    for (const [facet, tools] of Object.entries(FACET_TOOLS)) {
      if (facet === 'layout') continue;
      expect(tools, facet).not.toContain('stamp-band');
    }
  });
  it('has a label, a hint and a letter no other tool answers to', () => {
    expect(TOOL_LABELS['stamp-band']).toBe('Stamp Band');
    expect(TOOL_KEYS['stamp-band']).toMatch(/^[a-z]$/);
    const others = TOOL_IDS.filter((t) => t !== 'stamp-band').map((t) => TOOL_KEYS[t]);
    expect(others).not.toContain(TOOL_KEYS['stamp-band']);
  });
});

// THE KEYBOARD LETTERS LIVE IN A TABLE, NOT A SWITCH. `MapViewport`'s hotkey
// branch used to spell them as `case 'v'` … `case 'm'`, which no test could
// enumerate; `TOOL_KEYS` is that table lifted out so uniqueness can be asserted
// over the SAME data the viewport reads. Derived from FACET_TOOLS × TOOL_KEYS,
// never typed: the letter parcel B reserves for mark-band must not collide with
// any letter another facet's tool already answers to.
describe('tool keys', () => {
  it('assigns every tool exactly one lowercase letter', () => {
    expect(Object.keys(TOOL_KEYS).sort()).toEqual([...TOOL_IDS].sort());
    for (const k of Object.values(TOOL_KEYS)) expect(k).toMatch(/^[a-z]$/);
  });
  it('no two tools share a letter, across every facet', () => {
    const letters = TOOL_IDS.map((t) => TOOL_KEYS[t]);
    expect(new Set(letters).size).toBe(TOOL_IDS.length);
  });
  it("mark-band's letter collides with nothing the layout facet answers to", () => {
    const layoutLetters = FACET_TOOLS.layout!.map((t) => TOOL_KEYS[t]);
    expect(layoutLetters).not.toContain(TOOL_KEYS['mark-band']);
  });
  it('within each facet the letters are distinct (the dock is what the key arms)', () => {
    for (const [facet, tools] of Object.entries(FACET_TOOLS)) {
      const letters = tools.map((t) => TOOL_KEYS[t]);
      expect(new Set(letters).size, facet).toBe(letters.length);
    }
  });
  it('keeps the letters the viewport has always answered to', () => {
    // The pre-parcel switch, transcribed so a table edit that silently rebinds
    // an old letter has to come through here.
    expect(TOOL_KEYS).toMatchObject({
      view: 'v', select: 's', 'place-object': 'o', 'place-ring': 'r', 'paint-tile': 't',
      'paint-block': 'b', 'paint-collision': 'c', 'stamp-chunk': 'k', marquee: 'm',
    });
  });
});
