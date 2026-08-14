// A LONG LIST MUST NOT BURY THE SECTIONS UNDER IT.
//
// A facet's right-hand column is a stack of titled CollapsibleSections
// (workspace/facets/*). A section whose content grows with the DATA pushes every
// section below it off the bottom, and the way down is *through* the grid:
//
//     CHUNKS      ← 82 thumbnails, 1264px of content in a 260px-wide column
//     …
//     PALETTE     ← header at y=1338 in a 774px column
//
// Those are measured numbers, off the running app. The classic Art facet's
// palette editor was reported by the owner as NOT EXISTING, because nobody
// scrolls two screens through a chunk wall to find out.
//
// THE INVARIANT IS UNCHANGED. WHAT ENFORCES IT IS NOT.
//
// The first fix was a shared `SECTION_LIST_MAX_HEIGHT = 260` on each list, and
// it worked by wasting: classic's Layout column showed one 260px chunk grid
// with its own scrollbar over half a screen of empty column, and Objects showed
// a capped list over ~500px of nothing. It forced scrolling in exactly the
// cases with room to spare, because a fixed number cannot know how much room
// there is.
//
// THE MODEL NOW: the column is a real flex column with a real height, and its
// sections divide that height.
//
//   1. Panel is `display: flex; flexDirection: column; minHeight: 0`. The
//      `minHeight: 0` is load-bearing — EditorShell already stretches this box
//      to the canvas row, but a flex item refuses to shrink below its content
//      without it, so the column used to grow past the bottom of the window and
//      `flex: 1` on anything inside it measured against a height nobody could
//      see. THAT is why a fixed cap looked like the only thing that worked.
//   2. A section DECLARES which kind it is: `variant="list"` for a panel whose
//      height is set by the data, `content` (the default) for a form or a
//      toggle row. Declared at the call site, because the alternative — a list
//      of component names the layout matches against — is the hand-maintained
//      pattern that has now failed three times on this branch.
//   3. A list section is `flex: 1 1 0; maxHeight: max-content` with a floor.
//      Grow makes one list fill the column and two split what the content
//      sections leave; `max-content` stops a SHORT list stretching into a tall
//      empty box, and flexbox re-divides the surplus among the lists that want
//      it (§9.7), so this is max-min fairness rather than a clamp. The floor
//      (SECTION_LIST_MIN_HEIGHT) is where a genuinely over-subscribed column —
//      aeon's Layout has 601px of forms in 721px — hands the deficit to Panel's
//      own scrollbar instead of squeezing a list down to 8px of visible rows.
//   4. So a list panel's own scroller carries `minHeight: 0` and no number: its
//      ceiling arrives from the column.
//
// The rules below are that model, made checkable, plus the one thing that has
// to stay true whatever the model is: NO SCROLLER MAY GROW WITHOUT BOUND.
//
// A source scan, like panel-headings.test.ts beside it: these are .tsx, the
// suite is node-only, and nothing renders them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPONENTS, derivePanels, deriveSections, panelName } from './helpers/section-panels';

const read = (file: string): string => readFileSync(file, 'utf8');

const PANELS = derivePanels();
const SECTIONS = deriveSections();

/**
 * Flat style blocks, with `${…}` interpolations flattened first so a template
 * literal's braces cannot cut a block in half. Same helper shape as
 * panel-headings.test.ts's — style objects in these files are one level deep.
 */
function styleBlocks(source: string): string[] {
  return (source.replace(/\$\{[^{}]*\}/g, 'X').match(/\{[^{}]*\}/g) ?? []);
}

/** A style block that turns itself into a scroller. */
const SCROLLS = /overflow(?:Y|X)?:\s*['"`](?:auto|scroll)/;
/** …bounded by a number of its own (`maxHeight: 148` on the bottom chunk strip). */
const CAPPED = /(?:maxHeight|height):\s*(?!['"`]?(?:auto|100%|fit-content|max-content))/;
/** …or bounded by the column, which requires permission to shrink below content. */
const SHRINKABLE = /minHeight:\s*0\b/;

/** The sections whose subtree includes `file`, whatever they declare themselves to be. */
const sectionsReaching = (file: string) => SECTIONS.filter((s) => s.reaches.includes(file));

describe('the column is a flex column with a height its sections can divide', () => {
  const primitives = read(join(COMPONENTS, 'ui/primitives.tsx'));
  const collapsible = read(join(COMPONENTS, 'ui/CollapsibleSection.tsx'));

  it('Panel binds its own height', () => {
    // Without `minHeight: 0` the column grows past the window and every share
    // of it computed below is a share of a height nobody can see. This is the
    // single line that made a fixed px cap unnecessary.
    // Not `styleBlocks`: Panel's style object spreads conditional sub-objects
    // (`...(width ? { width } : {})`), so the innermost-braces scan cuts it up.
    const panel = primitives.match(/export function Panel\b[\s\S]*?\}>\{children\}/)?.[0];
    expect(panel, 'Panel is no longer the component this rule describes').toBeTruthy();
    const flat = panel!.replace(/\s+/g, ' ');
    expect(flat, 'Panel is not a flex column').toMatch(/flexDirection:\s*['"`]column/);
    expect(flat, 'Panel is a flex column with no bound height').toMatch(SHRINKABLE);
  });

  it('a list section claims a share of the column and hands back what it does not use', () => {
    const listStyle = collapsible.match(/const LIST_SECTION[^=]*=\s*(\{[^}]*\})/)?.[1];
    expect(listStyle, 'CollapsibleSection declares no LIST_SECTION style').toBeTruthy();
    const flat = listStyle!.replace(/\s+/g, ' ');
    // Grow — otherwise one list over an empty half-column, the failure the cap had.
    expect(flat, 'a list section does not grow into the column').toMatch(/flex:\s*['"`]1 1 0/);
    // …but not past its content, or a two-row filter result draws a tall empty box.
    expect(flat, 'a short list section would stretch into dead space').toMatch(/maxHeight:\s*['"`]max-content/);
    // …and not below a floor, or an over-subscribed column leaves a list
    // technically present and 8px tall (measured, aeon Layout). Below the floor
    // the deficit belongs to Panel's own scrollbar.
    expect(flat, 'a list section has no floor — it can be squeezed to nothing')
      .toMatch(/minHeight:\s*SECTION_LIST_MIN_HEIGHT/);
    const floor = Number(collapsible.match(/const SECTION_LIST_MIN_HEIGHT = (\d+);/)?.[1]);
    expect(floor, 'the floor is not a number in one place').toBeGreaterThan(0);
    // A FLOOR, not the ceiling it replaced. Anything approaching a column's
    // height stops being "the least a list may be squeezed to" and starts being
    // the old fixed-height bug from the other direction.
    expect(floor, 'the floor is large enough to be a de-facto fixed height').toBeLessThan(260);
  });

  it('a content section still takes its natural height and nothing more', () => {
    const contentStyle = collapsible.match(/const CONTENT_SECTION[^=]*=\s*(\{[^}]*\})/)?.[1];
    expect(contentStyle, 'CollapsibleSection declares no CONTENT_SECTION style').toBeTruthy();
    expect(contentStyle!.replace(/\s+/g, ' ')).toMatch(/flexShrink:\s*0/);
    expect(contentStyle!, 'a content section grows — a form would stretch').not.toMatch(/flex(?:Grow)?:\s*['"`]?[1-9]/);
  });

  it('the fixed cap is gone from the tree, not merely unused', () => {
    // It was imported by four panels and is the thing this model replaces; a
    // surviving definition is an invitation to reach for it again.
    for (const file of [...PANELS, join(COMPONENTS, 'ui/primitives.tsx')]) {
      expect(read(file), `${panelName(file)} still mentions SECTION_LIST_MAX_HEIGHT`)
        .not.toMatch(/SECTION_LIST_MAX_HEIGHT/);
    }
  });
});

describe('a scrolling panel inside a CollapsibleSection cannot grow without bound', () => {
  it('derives a list that includes the panel this rule was written for', () => {
    // The vacuous-pass failure mode two earlier source guards in this repo
    // actually had. ChunkGrid is the one that shipped the bug, and it is only
    // reachable TRANSITIVELY — no facet mounts it directly.
    expect(PANELS.map(panelName)).toContain('shared/ChunkGrid.tsx');
    expect(PANELS.map(panelName)).toContain('shared/ObjectList.tsx');
  });

  it('finds scrollers at all (a regex drift would pass vacuously)', () => {
    const scrollers = PANELS.filter((f) => styleBlocks(read(f)).some((b) => SCROLLS.test(b)));
    expect(scrollers.map(panelName).length).toBeGreaterThan(0);
  });

  /**
   * Panels whose `overflow: auto` is VESTIGIAL — the content is a fixed set of
   * groups, not a data-driven list, so the declaration can never engage and a
   * cap on it would only add a nested scrollbar to a short readout.
   *
   * An allowlist is safe here in the way panel-headings.test.ts's
   * SUBHEADING_PANELS is: an entry missing from a list of things to CHECK is a
   * silent pass, an entry missing from an allowlist is a failing test. The
   * `every exempt panel is still reachable` case below is what keeps that true.
   */
  const VESTIGIAL_SCROLLERS = ['shared/PropertiesPanel.tsx'];

  it.each(PANELS)('%s bounds every scroller it declares', (file) => {
    if (VESTIGIAL_SCROLLERS.includes(panelName(file))) return;
    // A scroller bounded by the COLUMN is only bounded if every section that
    // mounts this panel actually gives it a share to be bounded by. A list
    // panel dropped into a content section is the original bug wearing the new
    // model's clothes: `minHeight: 0` with nothing above it to bind against.
    const hosts = sectionsReaching(file);
    const columnBounded = hosts.length > 0 && hosts.every((s) => s.variant === 'list');
    const unbounded = styleBlocks(read(file))
      .filter((b) => SCROLLS.test(b) && !CAPPED.test(b) && !(columnBounded && SHRINKABLE.test(b)))
      // `overflow: hidden`-adjacent clipping wrappers are not scrollers and are
      // filtered by SCROLLS already; what is left here is a real scrollbar with
      // no ceiling — neither a number of its own nor a column to shrink into.
      .map((b) => b.replace(/\s+/g, ' ').trim());
    const where = hosts.map((s) => `${s.id}=${s.variant}`).join(' ') || 'no section';
    expect(unbounded, `${panelName(file)} has an unbounded scroller (mounted in: ${where})`).toEqual([]);
  });

  it('every exempt panel is one the derivation still reaches', () => {
    // Otherwise an exemption outlives the panel it was written for and quietly
    // covers whatever takes that path later.
    const names = PANELS.map(panelName);
    for (const exempt of VESTIGIAL_SCROLLERS) expect(names).toContain(exempt);
  });
});

// The mirror guard. The rule above only sees a scroller that EXISTS, and only
// asks whether it is bounded. This one asks the two questions the model turns
// on: is the panel MOUNTED as a list, and does it still scroll rather than push?
// Delete the `overflowY`, or drop the `variant`, and the panel silently goes
// back to growing to whatever the data says — which is the original bug, and
// which the rule above would pass, because a style property that vanishes is
// invisible to a rule about style properties that are present.
describe('the panels whose item count is unbounded by nature are mounted as lists', () => {
  const UNBOUNDED_BY_NATURE = [
    // 82 chunks in S1 GHZ, up to 256 under aeon. Mounted in FOUR columns:
    // classic Layout, classic Art, aeon Layout, aeon Art.
    'shared/ChunkGrid.tsx',
    // Classic's object types / aeon's object palette — 3084px of rows for S1,
    // measured. It is the last of two sections in classic's Objects column.
    'shared/ObjectList.tsx',
    // Up to MAX_ACT_SECTIONS = 48 cells; at a grid width of 2 that is 24 rows,
    // above Chunks / Art / Properties in aeon's Layout column.
    'SectionGridNav.tsx',
    // RING_PATTERNS, above Properties in aeon's Rings column.
    'RingPatternPalette.tsx',
  ];

  it.each(UNBOUNDED_BY_NATURE)('%s is only ever mounted in a variant="list" section', (name) => {
    // Named, not derived — being data-driven is not a property of the source.
    const hosts = sectionsReaching(join(COMPONENTS, name));
    expect(hosts.length, `${name} is mounted in no facet section at all`).toBeGreaterThan(0);
    const content = hosts.filter((s) => s.variant !== 'list');
    expect(content.map((s) => `${s.facet}:${s.id}`),
      `${name} is mounted in a content section, which gives it no height to shrink into`).toEqual([]);
  });

  it.each(UNBOUNDED_BY_NATURE)('%s scrolls its own rows instead of pushing the column', (name) => {
    const file = join(COMPONENTS, name);
    const shrinkable = styleBlocks(read(file)).filter((b) => SCROLLS.test(b) && SHRINKABLE.test(b));
    expect(shrinkable.length,
      `${name} declares no scroller that may shrink into its section — its rows would push whatever is under it off the bottom`)
      .toBeGreaterThan(0);
  });

  it('every named panel is one the derivation still reaches', () => {
    // Otherwise an entry outlives the column it was written for and this
    // describe block guards a file nothing mounts.
    const names = PANELS.map(panelName);
    for (const n of UNBOUNDED_BY_NATURE) expect(names).toContain(n);
  });
});
