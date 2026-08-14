// Undo routing for a classic tab is only correct while every classic editing
// surface CLAIMS its facet (classic-surface.ts). The behaviour is proven in
// state/__tests__/history-routing.test.ts; what that test cannot see — the
// renderer has no DOM/component test harness — is whether the components are
// still wired to it. A surface that quietly loses its claim sends Ctrl+Z to the
// other document, reverting an edit the user never asked about, and nothing else
// in the suite would notice.
//
// So the FIRST half of this file is a source-level wiring guard: every file that
// issues a classic edit command must either claim a surface itself or sit inside
// one that does. The SECOND half tests focusClassicSurface's own behaviour —
// which facet a claim lands on, and when it deliberately does nothing.
//
// SCAN ROOTS: this has now been widened TWICE, each time after a relocation
// walked a call site out of the scan rather than out of the codebase.
//   • stage-4 plan 3, task 4: `components/classic` → all of `components/**` and
//     `providers/**`, `.ts` as well as `.tsx` — the engine-neutral slot work
//     moves call sites into shared components and ports.
//   • stage-4 plan 5, task 11: + `workspace/**`. The facet modules live there
//     (`workspace/facets/s1-facets.tsx` composes every classic surface), so a
//     classic command reached from a facet module — the obvious place to put
//     one once classic renders through the shell — was outside the scan.
// Relocating a call site can therefore only change which key it is listed under,
// never whether it is covered. `state/**` and `agent/**` stay out on purpose:
// the stores are where the commands are DEFINED and the agent handler is not a
// UI surface, so neither has a facet to claim.
//
// A widened root that finds nothing new passes for the wrong reason, so
// `every scan root actually contributes files` below asserts each root is real.
// It is deliberately not a filename assertion — the files under these roots move
// every other task; a root going missing is the failure worth catching.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { focusClassicSurface, SURFACE_FACETS, type ClassicSurface } from '../classic-surface';
import { useWorkspaceStore } from '../../../workspace/workspaceStore';
import { toolsForFacet } from '../../../workspace/facet-tools';
import { useSessionStore } from '../../../state/sessionStore';
import { useEditorStore } from '../../../state/editorStore';
import { useProjectStore } from '../../../state/projectStore';
import { useClassicProjectStore } from '../../../state/classicProjectStore';

/** `src/renderer` — paths below are relative to it, POSIX-separated. */
const RENDERER = join(__dirname, '..', '..', '..');
const SCAN_ROOTS = ['components', 'providers', 'workspace'];
const read = (file: string): string => readFileSync(join(RENDERER, file), 'utf8');

/** Every source file under `roots`, recursively, excluding test directories. */
function sourceFiles(roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = join(RENDERER, rel);
    // A root that does not exist yet contributes nothing, so a root can be
    // listed ahead of the directory. `every scan root actually contributes
    // files` is what stops that tolerance from quietly defanging the guard.
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) out.push(child);
    }
  };
  for (const root of roots) walk(root);
  return out;
}

/**
 * Source with comments stripped, so the guard reads CODE and not prose. Two
 * things depend on it: a file that merely names a command in a comment must not
 * be demanded to claim a surface, and a claim that has been commented out must
 * not still satisfy one.
 *
 * (The `[^:]` guard keeps a `https://` inside a string from truncating its line.
 * Nothing subtler is needed — this only decides which identifiers are visible.)
 */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Any REFERENCE to one of the exported classic:* editing commands — not just a
 * call. This used to require a following `(`, which meant a file that passed
 * `classicSetObjects` as a callback issued the command while reading as clean.
 * That is not hypothetical: making the object inspector engine-neutral turned its
 * direct call into exactly such a reference (providers/object-inspector-classic.ts
 * hands it to a pure commit helper), and the narrower regex let it through.
 * Importing one of these IS committing to a surface.
 */
const COMMAND_CALL = /\bclassic(?:Set|Edit|Add)[A-Za-z]*\b/;

/**
 * Every component that commits a classic edit, and the surface whose facet its
 * edits belong to. `{ inside: X }` means the file has no root of its own — it
 * renders inside X's root element, whose capture handler already claims the
 * facet for the whole subtree.
 */
const COMMAND_SITES: Record<string, ClassicSurface | { inside: string }> = {
  'components/classic/ClassicLevelViewport.tsx': 'map',
  // Was components/classic/ObjectInspector.tsx until stage-4 plan 3 task 5 made
  // the inspector engine-neutral: the classicSetObjects call moved INTO the port,
  // so this entry moved with it. The widened scan root above is what makes that a
  // rename here rather than a silent loss of coverage.
  'providers/object-inspector-classic.ts': 'map',
  'components/classic/ClassicPalettePanel.tsx': 'art',
  'components/classic/ChunkTab.tsx': { inside: 'components/classic/ClassicComposerDock.tsx' },
  'components/classic/BlockTab.tsx': { inside: 'components/classic/ClassicComposerDock.tsx' },
  'components/classic/TileTab.tsx': { inside: 'components/classic/ClassicComposerDock.tsx' },
};

/** The surface a containing root declares, for the `inside` entries above. */
const CONTAINER_SURFACES: Record<string, ClassicSurface> = {
  'components/classic/ClassicComposerDock.tsx': 'art',
};

describe('classic surfaces claim their facet', () => {
  it('every scan root actually contributes files', () => {
    // `sourceFiles` tolerates a missing root so that a root can be added ahead of
    // the directory existing — which also means a typo, or a directory that gets
    // renamed out from under this list, silently shrinks the scan back down. The
    // enumeration test below would keep passing, because a shrunken scan finds
    // FEWER files, and COMMAND_SITES would just be pruned to match. So assert the
    // roots themselves, per root, with the root named in the failure.
    for (const root of SCAN_ROOTS) {
      expect(sourceFiles([root]), root).not.toEqual([]);
    }
  });

  it('knows about every component that commits a classic edit', () => {
    const found = sourceFiles(SCAN_ROOTS)
      .filter((f) => COMMAND_CALL.test(code(f)))
      .sort();
    // A NEW editing component must be given a surface here (and be wired to
    // classicSurfaceProps), or its edits will be undone from the wrong document.
    expect(found).toEqual(Object.keys(COMMAND_SITES).sort());
  });

  it.each(Object.entries(COMMAND_SITES))('%s claims its surface', (file, site) => {
    const [source, surface] =
      typeof site === 'string'
        ? [code(file), site]
        : [code(site.inside), CONTAINER_SURFACES[site.inside]];
    expect(source).toContain(`classicSurfaceProps('${surface}')`);
  });

  it('the chunk picker deliberately claims NOTHING', () => {
    // The inverse of the test below, and just as deliberate — asserted so the
    // absence reads as a decision rather than as a claim somebody forgot. One
    // selection feeds TWO surfaces: the map's stamp tool and the composer's
    // Chunk tab (ChunkTab.tsx edits `selectedChunkId`). Claiming `map` would
    // repoint undo at the layout every time the user picked a chunk to EDIT;
    // claiming `art` would do the mirror-image damage to stamping. So the picker
    // leaves the facet on whichever surface the user was last working in — see
    // classic-surface.ts's header.
    //
    // Both files, because either could do it: the component through its own root
    // element, the port through `rootProps` (chunk-grid-model.ts). Moving the
    // picker into the Layout facet's right panel (stage-4 plan 5, task 7) does
    // not change the answer — the panel sits BESIDE the composer, so a claim
    // there steals focus from it.
    for (const file of ['components/classic/ChunkPicker.tsx', 'providers/chunk-grid-classic.ts']) {
      expect(code(file), file).not.toContain('classicSurfaceProps');
    }
  });

  it('the object library arms placements on the layout surface', () => {
    // Not an edit site itself (arming is UI state), but the placement click it
    // sets up lands on the map — so it must not leave undo pointed at the art doc.
    // The panel is now the engine-neutral shared/ObjectList, which imports no
    // store: the claim rides in on the classic port's `rootProps`, so THAT is
    // what has to keep declaring it.
    expect(code('providers/object-list-classic.ts')).toContain("classicSurfaceProps('map')");
  });
});

// ---------------------------------------------------------------------------
// The claim itself. Everything above is source-level wiring; this is behaviour.
// ---------------------------------------------------------------------------
// Classic has FOUR facets and TWO surfaces, because each surface is the canvas
// of a pair (layout+objects share ClassicLevelViewport; art+palette share the
// composer). A surface claiming ONE facet made the other half of each pair
// unreachable: the claim fires on every pointer-down, so lighting the Objects
// pill and then clicking the map wrote `layout` straight back.

const LEVEL_TAB = 'level:ghz:1';

/** The s1 profile's real declaration (core/project/s1/index.ts), as a literal so
 *  a profile edit has to come through here — the style facet-tools.test.ts uses. */
const S1_LAYOUT_TOOLS = ['view', 'stamp-chunk', 'select'];

/** No project open ⇒ toolsForFacet falls to the SHELL defaults. `openClassic`
 *  below is how a test asks for classic's declared sets instead. */
function closeProjects(): void {
  useClassicProjectStore.setState({ status: 'closed', capabilities: null } as never);
  useProjectStore.setState({ project: null, config: null, capabilities: null } as never);
}

function openClassic(): void {
  useClassicProjectStore.setState({
    status: 'open',
    capabilities: {
      facets: ['layout', 'art', 'objects', 'palette'],
      facetTools: { layout: S1_LAYOUT_TOOLS },
    },
  } as never);
}

const facet = (): string => useWorkspaceStore.getState().facetFor(LEVEL_TAB);
const tool = (): string => useEditorStore.getState().tool;

describe('focusClassicSurface', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useSessionStore.setState({ activeId: LEVEL_TAB } as never);
    // editorStore has no reset() and `tool` is a cross-engine singleton, so it is
    // restored by hand — same as classicLevelStore.test.ts's beforeEach.
    useEditorStore.setState({ tool: 'view', selection: null, pasting: false } as never);
    closeProjects();
  });
  // Both stores get put back, not just the projects: a claim can re-scope the
  // tool, and `tool` is a cross-engine singleton with no reset() — leaving one
  // set makes some OTHER suite order-dependent, which is a bad way to find out.
  afterEach(() => {
    closeProjects();
    useEditorStore.setState({ tool: 'view', selection: null, pasting: false } as never);
  });

  it('claims the surface primary when the facet is on the OTHER surface', () => {
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'art');
    focusClassicSurface('map');
    expect(facet()).toBe('layout');

    focusClassicSurface('art');
    expect(facet()).toBe('art');
  });

  // The two the 1:1 map got wrong. Without them, Objects and Palette are pills
  // you can light but not work in.
  it('leaves OBJECTS alone when the user clicks in the map', () => {
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'objects');
    focusClassicSurface('map');
    expect(facet()).toBe('objects');
  });

  it('leaves PALETTE alone when the user clicks in the composer', () => {
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'palette');
    focusClassicSurface('art');
    expect(facet()).toBe('palette');
  });

  it('from ANY starting facet, a claim lands in one the surface serves', () => {
    // The closure property, read off the real SURFACE_FACETS: after clicking in
    // a surface you are always in one of ITS facets — you either already were
    // (the no-op) or you moved to its primary. Deliberately weaker than the two
    // cases above, which is why those are spelled out separately: this says
    // nothing about WHICH of the pair, and a 1:1 map would satisfy it too. What
    // it catches is a set gaining a facet its surface cannot actually edit.
    for (const start of ['layout', 'objects', 'art', 'palette'] as const) {
      for (const [surface, served] of Object.entries(SURFACE_FACETS)) {
        useWorkspaceStore.getState().setFacet(LEVEL_TAB, start);
        focusClassicSurface(surface as ClassicSurface);
        expect(served, `${start} + ${surface}`).toContain(facet());
      }
    }
  });

  it('writes nothing at all when the facet is already served', () => {
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'objects');
    const before = useWorkspaceStore.getState().record;
    focusClassicSurface('map');
    // Object identity, not equality: a redundant setFacet would replace the
    // record and wake the session-persistence subscription — a localStorage
    // write on every pointer-down in the level.
    expect(useWorkspaceStore.getState().record).toBe(before);
  });

  it('is a no-op when the active tab is not a level tab', () => {
    // The classic pane stays mounted but hidden while a sprite doc is active; a
    // hidden surface must never repoint another document's undo.
    useSessionStore.setState({ activeId: 'doc:sprite:s1:18' } as never);
    focusClassicSurface('art');
    expect(useWorkspaceStore.getState().record).toEqual({});
  });
});

// switchFacet re-scopes editorStore.tool. That is exactly right on a real
// surface change and exactly wrong on a redundant one — resetting the tool
// mid-interaction, on a pointer-down, is the worst possible time. The
// already-served check above is what prevents it; these pin that down.
describe('focusClassicSurface and the shared tool', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useSessionStore.setState({ activeId: LEVEL_TAB } as never);
    useEditorStore.setState({ tool: 'view', selection: null, pasting: false } as never);
    openClassic();
  });
  afterEach(() => {
    closeProjects();
    useEditorStore.setState({ tool: 'view', selection: null, pasting: false } as never);
  });

  it('does not touch the tool when the facet is already served', () => {
    // `place-object` is the sharp case: it belongs to OBJECTS and is absent from
    // classic's declared layout set, so a leaked switchFacet('layout') would
    // clamp it away to 'view' — loudly visible. Staying put is the whole point.
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'objects');
    useEditorStore.getState().setTool('place-object');
    focusClassicSurface('map');
    expect(facet()).toBe('objects');
    expect(tool()).toBe('place-object');
  });

  it('re-scopes the tool to CLASSIC\'s declared set on a real surface change', () => {
    // Coming back to the map from the composer lands on LAYOUT, whose declared
    // set is terrain-only since task 9 — so a resident `place-object` is clamped
    // to the layout default rather than left armed on a facet with no button for
    // it. (Before task 9 classic's layout declared place-object and this
    // asserted it survived; the split is what changed the right answer.)
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'art');
    useEditorStore.getState().setTool('place-object');
    focusClassicSurface('map');
    expect(facet()).toBe('layout');
    expect(tool()).toBe('view');
  });

  it('but a placement survives when the map claim lands on OBJECTS', () => {
    // The mirror of the case above, and the reason the clamp is not a loss:
    // Objects is where place-object lives, so working there and clicking the map
    // keeps the armed tool.
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'objects');
    useEditorStore.getState().setTool('place-object');
    focusClassicSurface('map');
    expect(facet()).toBe('objects');
    expect(tool()).toBe('place-object');
  });

  it('never leaves the user holding a tool the dock will not show', () => {
    // The whole reason this goes through switchFacet rather than setFacet. The
    // tool is a cross-engine singleton, and the composer facets re-scope nothing
    // (empty set), so a tool outside classic's vocabulary can be resident when
    // the user clicks back into the map — `paint-tile` is in the SHELL's layout
    // default but not in classic's declaration. Landing on layout must clamp it
    // to the facet default, `view`, because the dock has no button for it: a
    // resident tool with no button is a mode the user cannot see or leave.
    expect(S1_LAYOUT_TOOLS).not.toContain('paint-tile');
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'art');
    useEditorStore.setState({ tool: 'paint-tile' } as never);
    focusClassicSurface('map');
    expect(facet()).toBe('layout');
    expect(tool()).toBe(S1_LAYOUT_TOOLS[0]); // 'view' — the declaration's default
  });

  it('leaves the tool alone when moving INTO the composer', () => {
    // `art` has no EditorTool set at all (the composer drives its own tabs), so
    // toolsForFacet('art') is empty and toolForFacet returns the current tool
    // untouched. The user gets it back when they return to the map.
    useWorkspaceStore.getState().setFacet(LEVEL_TAB, 'layout');
    useEditorStore.getState().setTool('stamp-chunk');
    focusClassicSurface('art');
    expect(facet()).toBe('art');
    expect(tool()).toBe('stamp-chunk');
  });

  it('the declared layout set is the one the tool dock shows', () => {
    // The re-scope and the dock must not be able to disagree — both go through
    // toolsForFacet — so a tool that survives a claim is a tool with a button.
    expect(toolsForFacet('layout')).toEqual(S1_LAYOUT_TOOLS);
  });
});
