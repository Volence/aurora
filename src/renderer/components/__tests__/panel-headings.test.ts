// One name per section. The panels covered below are ALWAYS mounted inside a
// CollapsibleSection that titles them (workspace/facets/*), and each of them
// also drew a title of its own in the same type — so both engines showed
//
//     CHUNKS            ← the section header
//     CHUNKS (82)       ← the panel's own heading, one row down
//
// and the aeon art column showed TILESET over TILES (919). The count is worth
// keeping and the name is not: the panels now report `82 chunks` / `919 tiles`
// on their status line in count type, and the section header is the only thing
// that shouts.
//
// ---------------------------------------------------------------------------
// THE LIST IS DERIVED, BECAUSE A HAND-WRITTEN ONE ALREADY FAILED
// ---------------------------------------------------------------------------
// This file used to carry `const PANELS = [three file paths]`, and aeon's Rings
// facet shipped with RING PATTERNS drawn twice — one row apart — because
// RingPatternPalette.tsx was not one of the three. The fix that ended this bug
// everywhere else never saw it. That is the exact failure mode of a guard that
// only checks the cases someone remembered to list, and it has bitten this
// branch three times.
//
// So the list is now READ OUT OF THE FACET MODULES: every component mounted as
// the direct child of a `<CollapsibleSection>` in workspace/facets/*.tsx,
// resolved to its source file through that facet's own imports. Adding a
// section to a facet adds its panel to this test with no edit here, and there
// is no way to mount a panel in a titled section without this seeing it.
//
// The derivation itself moved to `./helpers/section-panels` once a SECOND rule
// about these same panels needed it (panel-scrollers.test.ts). One derivation,
// or the next rule gets a third list to forget something in.
//
// A SOURCE scan, like shared-purity.test.ts and classic-surface.test.ts: these
// are .tsx, the suite is node-only, and nothing renders them. `uppercase` +
// `fontWeight: 600` is the marker for heading type in this codebase — it is what
// PanelHeader uses (components/ui), and PanelHeader is the one place entitled to
// it, because it IS the section header.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPONENTS, derivePanels, panelName } from './helpers/section-panels';

const read = (file: string): string => readFileSync(file, 'utf8');

const PANELS = derivePanels();

/**
 * Heading type = bold AND uppercase in ONE style object, which is what
 * PanelHeader is. Both halves are load-bearing: ChunkGrid legitimately
 * uppercases its 8px BLANK cell tag, which is a label on a thumbnail and not a
 * title, so a bare `uppercase` test would forbid the wrong thing.
 *
 * Style objects in these files are flat, so `[^{}]*` is a whole one — once the
 * `${…}` interpolations inside template literals (`padding: `${T.s2} ${T.s4}``)
 * are flattened, since their braces would otherwise cut a block in half.
 */
function headingTypeStyles(source: string): string[] {
  const flat = source.replace(/\$\{[^{}]*\}/g, 'X');
  return (flat.match(/\{[^{}]*\}/g) ?? []).filter(
    // Both spellings of semibold. `T.wSemibold` is the token bridge the VIS7
    // pass moved these sites onto; the raw 600 stays matched so a style object
    // that reverts to the number is still caught as heading type.
    (block) => /fontWeight:\s*(?:600|T\.wSemibold)/.test(block) && /textTransform:\s*['"`]?uppercase/.test(block),
  );
}

describe('a panel inside a CollapsibleSection does not title itself', () => {
  it('derives a list that includes the panels this rule was written for', () => {
    // The failure mode two earlier source guards in this repo actually had — a
    // path that stopped resolving and made every case pass vacuously. Named
    // here in full, so a derivation that silently stops finding them fails.
    const names = PANELS.map(panelName);
    expect(names).toContain('shared/ChunkGrid.tsx');
    expect(names).toContain('art/TilesetPanel.tsx');
    expect(names).toContain('ArtBrowser.tsx');
    // The one the hand-written list omitted, and the reason this is derived.
    expect(names).toContain('RingPatternPalette.tsx');
  });

  it('finds panels across BOTH engines (a classic-only scan would pass vacuously)', () => {
    const names = PANELS.map(panelName);
    expect(names.some((n) => n.startsWith('classic/'))).toBe(true);
    expect(names.some((n) => !n.startsWith('classic/'))).toBe(true);
  });

  /**
   * Panels whose heading type is a SUB-GROUP label rather than the panel's own
   * name — the one thing the source scan cannot tell apart, because both are
   * short uppercase strings in bold.
   *
   * PropertiesPanel is a panel of several labelled groups (PROJECT / ACTIVE
   * SECTION / ART / VIEWPORT) under one `Properties` section header. It never
   * repeats that header, so it is not the bug this file exists for.
   *
   * AN ALLOWLIST IS SAFE HERE IN A WAY THE OLD `PANELS` LIST WAS NOT, and the
   * asymmetry is the whole reason the derivation above was worth writing: an
   * entry MISSING from a list of things to check is a silent pass — which is how
   * RING PATTERNS shipped doubled. An entry missing from an allowlist is a
   * FAILING test. Both lists are hand-maintained; only one of them fails safe.
   */
  const SUBHEADING_PANELS = ['shared/PropertiesPanel.tsx'];

  it.each(PANELS)('%s renders no heading-type text of its own', (file) => {
    const name = panelName(file);
    if (SUBHEADING_PANELS.includes(name)) return;
    expect(headingTypeStyles(read(file))).toEqual([]);
  });

  it('every allowlisted panel is one the derivation still reaches', () => {
    // Otherwise an exemption outlives the panel it was written for and quietly
    // covers whatever takes that path later.
    const names = PANELS.map(panelName);
    for (const allowed of SUBHEADING_PANELS) expect(names).toContain(allowed);
  });

  it('the section header itself still uses heading type', () => {
    // The other half of the rule: this is not "no uppercase anywhere", it is
    // "the section header is the one that says the name". If PanelHeader stopped
    // shouting, the panels above would be nameless rather than un-doubled.
    expect(headingTypeStyles(read(join(COMPONENTS, 'ui/primitives.tsx'))).length).toBeGreaterThan(0);
  });

  it('the chunk grid port supplies a COUNT, not a title', () => {
    // `heading: 'Chunks (82)'` was the field that made the grid draw the second
    // title; renaming it is what forces both engines' ports through this change.
    const model = read(join(COMPONENTS, 'shared/chunk-grid-model.ts'));
    expect(model).toContain('readonly countLabel: string');
    expect(model).not.toMatch(/readonly heading\b/);
  });
});
