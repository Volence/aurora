// A LONG LIST MUST NOT BURY THE SECTIONS UNDER IT.
//
// A facet's right-hand column is a scrolling stack of titled CollapsibleSections
// (workspace/facets/*). A section whose content grows with the DATA pushes every
// section below it off the bottom, and because the column's own scrollbar is the
// only one on screen, the way down is *through* the grid:
//
//     CHUNKS      ← 82 thumbnails, 1264px of content in a 260px-wide column
//     …
//     PALETTE     ← header at y=1338 in a 774px column
//
// Those are measured numbers, off the running app with the cap removed. The
// classic Art facet's palette editor was reported by the owner as NOT EXISTING,
// because nobody scrolls two screens through a chunk wall to find out. The
// Layout/Objects merge (2026-08-14) made it worse by putting three sections in
// one column, which is what forced the fix.
//
// THE RULE: a panel that scrolls its own content must BOUND that scroll. Then
// the column's scrollbar only has to travel a few hundred px per section, and
// every section HEADER is reachable without reading a grid.
//
// Two guards, because they fail on different mistakes:
//
//  1. DERIVED, over every panel the facet modules mount (transitively, via
//     ./helpers/section-panels — the same derivation the heading rule uses, for
//     the same reason: a hand-written list of panels has already missed one in
//     this repo). Any `overflow: auto` in these files must be bounded. This one
//     catches a NEW scroller added unbounded.
//
//  2. NAMED, over the panels whose item count is unbounded by nature. This
//     one catches the opposite mistake: a scroller DELETED, leaving the panel to
//     grow freely again with no `overflow` for guard 1 to notice. A style
//     property that vanishes is invisible to a rule about style properties that
//     are present.
//
// A source scan, like panel-headings.test.ts beside it: these are .tsx, the
// suite is node-only, and nothing renders them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPONENTS, derivePanels, panelName } from './helpers/section-panels';

const read = (file: string): string => readFileSync(file, 'utf8');

const PANELS = derivePanels();

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
/** …and one that says how tall it may get before doing so. */
const BOUNDED = /(?:maxHeight|height):\s*(?!['"`]?(?:auto|100%|fit-content))/;

describe('a scrolling panel inside a CollapsibleSection bounds its height', () => {
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
    const unbounded = styleBlocks(read(file))
      .filter((b) => SCROLLS.test(b) && !BOUNDED.test(b))
      // `overflow: hidden`-adjacent clipping wrappers are not scrollers and are
      // filtered by SCROLLS already; what is left here is a real scrollbar with
      // no ceiling. Reported whole, so the failure names the offending block.
      .map((b) => b.replace(/\s+/g, ' ').trim());
    expect(unbounded, `${panelName(file)} has an unbounded scroller`).toEqual([]);
  });

  it('every exempt panel is one the derivation still reaches', () => {
    // Otherwise an exemption outlives the panel it was written for and quietly
    // covers whatever takes that path later.
    const names = PANELS.map(panelName);
    for (const exempt of VESTIGIAL_SCROLLERS) expect(names).toContain(exempt);
  });
});

// The mirror guard. Guard 1 only sees a scroller that EXISTS; delete the
// `overflowY` and the panel silently goes back to growing to whatever the data
// says, which is the original bug and would leave guard 1 green.
describe('the panels whose item count is unbounded by nature scroll internally', () => {
  const UNBOUNDED_BY_NATURE = [
    // 82 chunks in S1 GHZ, up to 256 under aeon. Mounted in FOUR columns:
    // classic Layout, classic Art, aeon Layout, aeon Art.
    'shared/ChunkGrid.tsx',
    // Classic's object types / aeon's object palette — 3084px of rows for S1,
    // measured. Since the Objects merge it is the LAST of three sections in
    // classic's Layout column, so anything added below it depends on this cap.
    'shared/ObjectList.tsx',
    // Up to MAX_ACT_SECTIONS = 48 cells; at a grid width of 2 that is 24 rows,
    // above Chunks / Art / Properties in aeon's Layout column.
    'SectionGridNav.tsx',
    // RING_PATTERNS, above Properties in aeon's Rings column.
    'RingPatternPalette.tsx',
  ];

  it.each(UNBOUNDED_BY_NATURE)('%s has a bounded scroller, capped by the shared constant', (name) => {
    // Named, not derived — being data-driven is not a property of the source.
    //
    // The block must be bounded BY SECTION_LIST_MAX_HEIGHT, not merely by some
    // number. Checking the two separately (a bounded scroller somewhere, the
    // identifier somewhere in the file) passed a planted `maxHeight: 999`,
    // because the import line still carried the name. One assertion over one
    // block is what actually says "these columns share a cap".
    const file = join(COMPONENTS, name);
    const capped = styleBlocks(read(file))
      .filter((b) => SCROLLS.test(b) && /maxHeight:\s*SECTION_LIST_MAX_HEIGHT/.test(b));
    expect(capped.length, `${name} declares no scroller capped by the shared constant`)
      .toBeGreaterThan(0);
  });

  it('every named panel is one the derivation still reaches', () => {
    // Otherwise an entry outlives the column it was written for and this
    // describe block guards a file nothing mounts.
    const names = PANELS.map(panelName);
    for (const n of UNBOUNDED_BY_NATURE) expect(names).toContain(n);
  });

  it('the shared cap is a real number in one place', () => {
    // The case above names the constant; this is the constant existing, so a
    // rename to something undefined fails here rather than at runtime. The
    // argument for the NUMBER lives beside it (components/ui/primitives.tsx).
    expect(read(join(COMPONENTS, 'ui/primitives.tsx')))
      .toMatch(/export const SECTION_LIST_MAX_HEIGHT = \d+;/);
  });
});
