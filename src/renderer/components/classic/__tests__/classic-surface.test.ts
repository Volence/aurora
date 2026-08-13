// Undo routing for a classic tab is only correct while every classic editing
// surface CLAIMS its facet (classic-surface.ts). The behaviour is proven in
// state/__tests__/history-routing.test.ts; what that test cannot see — the
// renderer has no DOM/component test harness — is whether the components are
// still wired to it. A surface that quietly loses its claim sends Ctrl+Z to the
// other document, reverting an edit the user never asked about, and nothing else
// in the suite would notice.
//
// So this is a source-level wiring guard: every file that issues a classic edit
// command must either claim a surface itself or sit inside one that does.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClassicSurface } from '../classic-surface';

const DIR = join(__dirname, '..');
const read = (file: string): string => readFileSync(join(DIR, file), 'utf8');

/** Any call to one of the exported classic:* editing commands. */
const COMMAND_CALL = /\bclassic(?:Set|Edit|Add)[A-Za-z]*\(/;

/**
 * Every component that commits a classic edit, and the surface whose facet its
 * edits belong to. `{ inside: X }` means the file has no root of its own — it
 * renders inside X's root element, whose capture handler already claims the
 * facet for the whole subtree.
 */
const COMMAND_SITES: Record<string, ClassicSurface | { inside: string }> = {
  'ClassicLevelViewport.tsx': 'map',
  'ObjectInspector.tsx': 'map',
  'ClassicPalettePanel.tsx': 'art',
  'ChunkTab.tsx': { inside: 'ClassicComposerDock.tsx' },
  'BlockTab.tsx': { inside: 'ClassicComposerDock.tsx' },
  'TileTab.tsx': { inside: 'ClassicComposerDock.tsx' },
};

/** The surface a containing root declares, for the `inside` entries above. */
const CONTAINER_SURFACES: Record<string, ClassicSurface> = {
  'ClassicComposerDock.tsx': 'art',
};

describe('classic surfaces claim their facet', () => {
  it('knows about every component that commits a classic edit', () => {
    const found = readdirSync(DIR)
      .filter((f) => f.endsWith('.tsx') && COMMAND_CALL.test(read(f)))
      .sort();
    // A NEW editing component must be given a surface here (and be wired to
    // classicSurfaceProps), or its edits will be undone from the wrong document.
    expect(found).toEqual(Object.keys(COMMAND_SITES).sort());
  });

  it.each(Object.entries(COMMAND_SITES))('%s claims its surface', (file, site) => {
    const [source, surface] =
      typeof site === 'string'
        ? [read(file), site]
        : [read(site.inside), CONTAINER_SURFACES[site.inside]];
    expect(source).toContain(`classicSurfaceProps('${surface}')`);
  });

  it('the object library arms placements on the layout surface', () => {
    // Not an edit site itself (arming is UI state), but the placement click it
    // sets up lands on the map — so it must not leave undo pointed at the art doc.
    expect(read('ObjectLibraryPanel.tsx')).toContain("classicSurfaceProps('map')");
  });
});
