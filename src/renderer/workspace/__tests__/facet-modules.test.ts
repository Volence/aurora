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
  const S1_GRANT = ['layout', 'objects', 'collision', 'palette', 'art'] as const;

  beforeEach(() => { facetModules.clear(); });

  it('serves all five, and nothing outside the grant', async () => {
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    for (const f of S1_GRANT) expect(moduleFor('s1', f), `s1/${f}`).not.toBeNull();
    // A module for an ungranted facet is dead code with no pill: FacetBar shows
    // granted ∩ registered, so it could only ever be reached by a stale session
    // record — and resolveFacet exists to heal exactly that away.
    //
    // `objects`, `palette` and now `collision` have each been on this list at
    // different points and are granted again; what stays off it is `rings` —
    // classic has no editor for it at all (S1 rings are objects in objpos, not
    // a separate layer).
    for (const f of ['rings'] as const) {
      expect(moduleFor('s1', f), `s1/${f}`).toBeNull();
    }
  });

  it('leaves aeon untouched: the two registrations are independent', async () => {
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
    // facet would be a control that visibly does nothing.
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    for (const f of ['layout', 'objects', 'palette'] as const) {
      expect(moduleFor('s1', f)?.mapOverlays, `s1/${f}`).toBe(true);
    }
    expect(moduleFor('s1', 'art')?.mapOverlays).toBeFalsy();
  });

  it('shares one canvas between the three MAP facets, and serves art from its own', async () => {
    // Classic has two canvases for four facets. Three share one
    // (ClassicLevelViewport: layout, objects, palette); `art` is the other, and
    // it is the ONLY facet whose pill changes the scene — which is why
    // core/shell/facets.ts puts it last.
    //
    // SHARING A CANVAS HAS NEVER BEEN THE PROBLEM. What made the OLD palette
    // facet a duplicate was sharing every slot with `art`. So the two halves of
    // this assertion say different things: the map group shares a canvas ON
    // PURPOSE, and the distinct panels below are what make them three screens.
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    const mapCanvas = moduleFor('s1', 'layout')?.Canvas;
    expect(mapCanvas).toBeTypeOf('function');
    for (const f of ['objects', 'palette'] as const) {
      expect(moduleFor('s1', f)?.Canvas, `s1/${f}`).toBe(mapCanvas);
    }
    expect(moduleFor('s1', 'art')?.Canvas).not.toBe(mapCanvas);
  });

  it('mounts the contextual hint line on EVERY map facet', async () => {
    // Task 6 filled the slot this test used to assert empty. The hint is keyed
    // on the TOOL, not the facet, and classic's map-status port suppresses the
    // bar's generic hint ENGINE-WIDE on the strength of these mounts
    // (providers/map-status-classic.ts's `ownHintLine`), so a map facet without
    // it is a facet whose tool is explained nowhere. That is why `palette` has
    // it despite offering only `view`.
    const { registerS1FacetModules, registerAeonFacetModules } = await import('../register-facets');
    registerS1FacetModules();
    const layout = moduleFor('s1', 'layout')?.ToolOptions;
    expect(layout).toBeDefined();
    expect(moduleFor('s1', 'objects')?.ToolOptions).toBe(layout);
    expect(moduleFor('s1', 'palette')?.ToolOptions).toBe(layout);
    // Not aeon's: its map facets have no tool-options bar at all, and inheriting
    // classic's hint vocabulary would be a lie about that canvas. Aeon is
    // registered explicitly — `moduleFor` on an unregistered engine answers
    // null, which would make this assertion pass without proving anything.
    registerAeonFacetModules();
    expect(moduleFor('aeon', 'layout')).not.toBeNull();
    expect(moduleFor('aeon', 'layout')?.ToolOptions).toBeUndefined();
    expect(moduleFor('aeon', 'palette')?.ToolOptions).toBeUndefined();
    // …except Effects (parcel B): its bar carries the two band verbs so the
    // collapsed `New band` section is not the only door to making one. It is
    // NOT classic's hint line — a component of its own.
    expect(moduleFor('aeon', 'parallax')?.ToolOptions).toBeDefined();
    expect(moduleFor('aeon', 'parallax')?.ToolOptions).not.toBe(layout);
  });

  it('gives every facet its own right panel: the columns are what differ', async () => {
    // The three map facets share a canvas, a hint line and a status bar; the
    // COLUMN (and the tool rail) is the whole of the difference between them, so
    // four distinct functions is the minimum for four facets that are not each
    // other. This is also the assertion that would catch the old duplicate
    // palette facet, which shared every slot with `art`. Identity, not content,
    // is all a node test can see here — the source assertions below cover what
    // is actually in each column.
    const { registerS1FacetModules } = await import('../register-facets');
    registerS1FacetModules();
    const panels = S1_GRANT.map((f) => moduleFor('s1', f)?.RightPanel);
    for (const p of panels) expect(p).toBeTypeOf('function');
    expect(new Set(panels).size).toBe(panels.length);
  });
});

// The facet columns are .tsx and never rendered by the suite, so WHAT is in them
// can only be checked at the source level. Comments are stripped first, so the
// long rationale docblock in that file cannot satisfy any of these.
const S1_FACETS_SOURCE = readFileSync(join(__dirname, '..', 'facets', 's1-facets.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** One column function's body, so an assertion about a column cannot be
 *  satisfied by a mount in a DIFFERENT column of the same file. */
function column(name: string): string {
  const start = S1_FACETS_SOURCE.indexOf(`function ${name}(`);
  expect(start, `${name} not found in s1-facets.tsx`).toBeGreaterThan(-1);
  const end = S1_FACETS_SOURCE.indexOf('\n}', start);
  expect(end, `${name} has no end`).toBeGreaterThan(start);
  return S1_FACETS_SOURCE.slice(start, end);
}

// WHAT IS IN EACH CLASSIC COLUMN. Every one of these was a live bug at some
// point on this branch, and none of them fails anything else: a column is a
// list of JSX tags, so a section that moves out simply stops rendering.
describe('the s1 columns hold what their facets are for', () => {
  it('LAYOUT is TERRAIN: the chunk picker, and no object sections', () => {
    // The object sections have moved in and out of this column twice. They are
    // OUT: Layout is terrain and Objects is placement, the division aeon uses.
    // Carrying the list and the inspector here (alongside `place-object` on
    // facetTools.layout) is what made Objects a strict subset of Layout, and is
    // what the 2026-08-14 merge briefly re-created before it was reversed.
    const layout = column('ClassicLayoutPanels');
    expect(layout).toMatch(/<ChunkPicker\s+pick="stamp"/);
    expect(layout).not.toContain('ClassicObjectInspector');
    expect(layout).not.toContain('ClassicObjectList');
  });

  it('LAYOUT has no selection stub either: classic has no properties surface', () => {
    // Aeon's Layout passes `AeonPropertiesPanel showObjectSelection` as a
    // read-only readout for the selection its `select` tool makes. Classic has
    // no properties surface at all (providers/properties-classic.ts is the
    // statement of that), so there is nothing to mount; inventing one is step
    // H's. Guarded so a future "Layout looks thin" impulse has to argue with
    // this line rather than quietly add an aeon panel to a classic column.
    expect(column('ClassicLayoutPanels')).not.toContain('showObjectSelection');
  });

  it('OBJECTS carries the inspector and the library: placement, not terrain', () => {
    // The facet's whole content. Deleted in the merge and restored: what made
    // Layout → Objects feel like a scene change was the pill ORDER (`art` sat
    // between them), not the split. Asserted against a chunk picker as well, so
    // this column cannot drift back into being a second Layout.
    const objects = column('ClassicObjectsPanels');
    expect(objects).toContain('<ClassicObjectInspector />');
    expect(objects).toContain('<ClassicObjectList />');
    expect(objects).not.toContain('ChunkPicker');
  });

  it('PALETTE carries the palette grid and nothing of the composer', () => {
    const palette = column('ClassicPalettePanels');
    expect(palette).toContain('<ClassicPalettePanel />');
    // The old palette facet WAS the art column. If this ever holds a chunk
    // picker again it has drifted back into being a second Art screen.
    expect(palette).not.toContain('ChunkPicker');
  });

  it('ART still carries both of its sections', () => {
    const art = column('ClassicArtPanels');
    expect(art).toMatch(/<ChunkPicker\s+pick="edit"/);
    expect(art).toContain('<ClassicPalettePanel />');
  });

  it('no column function is left without a facet to mount it', () => {
    // A column with no module is dead code that reads like a facet, which is how
    // duplicate screens keep getting re-created on this branch. Derived rather
    // than listed: every `function Classic*Panels` in the file must appear as
    // some module's RightPanel.
    const declared = [...S1_FACETS_SOURCE.matchAll(/function (Classic\w*Panels)\(/g)]
      .map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(S1_FACETS_SOURCE, name).toMatch(new RegExp(`RightPanel:\\s*${name},`));
    }
  });
});

describe('the s1 columns mount the chunk picker', () => {
  const source = S1_FACETS_SOURCE;

  it('mounts ChunkPicker with no layout override, taking its panel default', () => {
    // `layout="strip"` was the legacy bottom dock's business (ClassicProjectView,
    // deleted at task 9 along with the prop itself). In a 260px column the strip
    // caps the wall at 148px and crams the badge, the hint and the loop toggle
    // onto the heading row.
    expect(source).toMatch(/<ChunkPicker\s/);
    expect(source).not.toMatch(/<ChunkPicker\s+layout/);
  });

  it('the ART column selects WITHOUT arming the map\'s stamp tool', () => {
    // The regression this exists for: both mounts shared one port whose select
    // called selectChunkForStamp, which calls editor.setTool('stamp-chunk').
    // On the Art facet — no dock, no map — that looked harmless, but the tool is
    // one shared editorStore field, so picking a chunk to EDIT left you armed to
    // PAINT the moment you returned to Layout.
    //
    // Read positionally: the layout column is declared before the art column, so
    // the first mount is the map's and the second the composer's.
    const picks = [...source.matchAll(/<ChunkPicker\s+pick="(\w+)"/g)].map((m) => m[1]);
    expect(picks).toEqual(['stamp', 'edit']);
    // No mount may leave it unsaid: an unset `pick` is the silent-arming shape
    // this replaced, so ChunkPicker declares it required and every mount states it.
    expect(source).not.toContain('<ChunkPicker />');
  });

  it('files the section under a classic.* content id, not aeon\'s map.palette', () => {
    // Section ids are keys in ONE global panel-state map (shell/panel-state.ts),
    // and both engines are moving into one shell: reusing aeon's slot id would
    // make collapsing classic's Chunks collapse aeon's Marquee options too.
    expect(source).toContain('id="classic.chunks"');
    expect(source).not.toMatch(/id="map\./);
  });

  it('mounts it in BOTH columns, under DISTINCT section ids', () => {
    // The picker sits beside the map (its stamp target) and beside the composer
    // (the chunk the Chunk tab edits) — one selection, two jobs, so one mount is
    // a trip to the other facet every time you change subject (task 9, gap 5).
    const mounts = source.match(/<ChunkPicker\s/g) ?? [];
    expect(mounts).toHaveLength(2);
    // Distinctness is the whole point of having two ids: panel-state is ONE
    // global map, so a shared id would make collapsing the picker beside the
    // composer also collapse it beside the map — the same leak that kept classic
    // off aeon's `map.palette`.
    expect(source).toContain('id="classic.artChunks"');
    const ids = source.match(/id="classic\.[A-Za-z]+"/g) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mounts it unconditionally: no `tool === stamp-chunk` gate', () => {
    // Aeon's gate arbitrates a shared slot (Chunks / Marquee / Paste, all
    // `map.palette`); classic grants neither marquee nor paste, and its picker
    // ARMS the stamp tool, so gating it on stamping is circular. Asserted on the
    // one identifier that could only appear here to build such a gate.
    expect(source).not.toContain('stamp-chunk');
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

  it('is null when the engine serves nothing granted: FacetUnavailable stays', () => {
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
