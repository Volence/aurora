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
//
// SCAN ROOT (stage-4 plan 3, task 4): this used to read only
// `components/classic`, which meant moving a classic call site into a shared
// component or a provider silently escaped the guard — exactly what the
// engine-neutral slot work does. It now walks ALL of `components/**` and
// `providers/**`, `.ts` as well as `.tsx`, so relocating a call site cannot
// smuggle it out of coverage; it can only change which key it is listed under.
// `state/**` and `agent/**` stay out on purpose: the stores are where the
// commands are DEFINED and the agent handler is not a UI surface, so neither has
// a facet to claim.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClassicSurface } from '../classic-surface';

/** `src/renderer` — paths below are relative to it, POSIX-separated. */
const RENDERER = join(__dirname, '..', '..', '..');
const SCAN_ROOTS = ['components', 'providers'];
const read = (file: string): string => readFileSync(join(RENDERER, file), 'utf8');

/** Every source file under `roots`, recursively, excluding test directories. */
function sourceFiles(roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = join(RENDERER, rel);
    // A root that does not exist yet contributes nothing. This cannot defang the
    // guard: the enumeration test below asserts an exact file list, so a root
    // that disappears takes its known call sites with it and fails loudly.
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

/** Any call to one of the exported classic:* editing commands. */
const COMMAND_CALL = /\bclassic(?:Set|Edit|Add)[A-Za-z]*\(/;

/**
 * Every component that commits a classic edit, and the surface whose facet its
 * edits belong to. `{ inside: X }` means the file has no root of its own — it
 * renders inside X's root element, whose capture handler already claims the
 * facet for the whole subtree.
 */
const COMMAND_SITES: Record<string, ClassicSurface | { inside: string }> = {
  'components/classic/ClassicLevelViewport.tsx': 'map',
  'components/classic/ObjectInspector.tsx': 'map',
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
  it('knows about every component that commits a classic edit', () => {
    const found = sourceFiles(SCAN_ROOTS)
      .filter((f) => COMMAND_CALL.test(read(f)))
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
    // The panel is now the engine-neutral shared/ObjectList, which imports no
    // store: the claim rides in on the classic port's `rootProps`, so THAT is
    // what has to keep declaring it.
    expect(read('providers/object-list-classic.ts')).toContain("classicSurfaceProps('map')");
  });
});
