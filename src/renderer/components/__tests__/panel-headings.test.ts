// One name per section. The panels below are ALWAYS mounted inside a
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
// A SOURCE scan, like shared-purity.test.ts and classic-surface.test.ts: these
// are .tsx, the suite is node-only, and nothing renders them. `uppercase` +
// `letterSpacing` is the marker for heading type in this codebase — it is what
// PanelHeader uses (components/ui), and PanelHeader is the one place entitled to
// it, because it IS the section header.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPONENTS = join(__dirname, '..');

/** Panels whose every mount is inside a CollapsibleSection. */
const PANELS = [
  'shared/ChunkGrid.tsx',
  'art/TilesetPanel.tsx',
  'ArtBrowser.tsx',
];

const read = (file: string): string => readFileSync(join(COMPONENTS, file), 'utf8');

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
    (block) => /fontWeight:\s*600/.test(block) && /textTransform:\s*['"`]?uppercase/.test(block),
  );
}

describe('a panel inside a CollapsibleSection does not title itself', () => {
  it('reads the panels it claims to (a wrong path would pass vacuously)', () => {
    // The failure mode two earlier source guards in this repo actually had.
    expect(read('shared/ChunkGrid.tsx')).toContain('ChunkGrid');
    expect(read('art/TilesetPanel.tsx')).toContain('TilesetPanel');
    expect(read('ArtBrowser.tsx')).toContain('ArtBrowser');
  });

  it.each(PANELS)('%s renders no heading-type text of its own', (file) => {
    expect(headingTypeStyles(read(file))).toEqual([]);
  });

  it('the section header itself still uses heading type', () => {
    // The other half of the rule: this is not "no uppercase anywhere", it is
    // "the section header is the one that says the name". If PanelHeader stopped
    // shouting, the panels above would be nameless rather than un-doubled.
    expect(headingTypeStyles(read('ui/primitives.tsx')).length).toBeGreaterThan(0);
  });

  it('the chunk grid port supplies a COUNT, not a title', () => {
    // `heading: 'Chunks (82)'` was the field that made the grid draw the second
    // title; renaming it is what forces both engines' ports through this change.
    const model = read('shared/chunk-grid-model.ts');
    expect(model).toContain('readonly countLabel: string');
    expect(model).not.toMatch(/readonly heading\b/);
  });
});
