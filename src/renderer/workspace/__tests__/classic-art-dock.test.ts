// Classic's art tool dock and tool options — the pixel chrome of the Art facet.
//
// PART BEHAVIOUR, PART SOURCE SCAN, and the split is not arbitrary. The renderer
// suite is node-only and does not collect .tsx, so nothing here can render a
// component and click a button. What CAN be executed is the tier predicate, which
// is why it was put in a .ts module (level-presence) instead of inlined into the
// two components: the decision itself is testable, and the scans below only have
// to prove that the components ask it and that the facet mounts them.
//
// WHY THE FACET-LEVEL SCAN MATTERS AT ALL: the commit before this one moved tile
// tool selection off TileTab's own Pencil/Fill chips and onto `artStore.tool`,
// whose only writer was aeon's rail. Classic was left drawing with whatever tool
// happened to be armed, with no way to change it — Fill was unreachable from the
// classic composer entirely. A missing ToolDock slot is what that regression LOOKS
// like, so it is worth a standing assertion rather than a memory.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isClassicPixelTier } from '../level-presence';
import { CLASSIC_TILE_TOOLS } from '../../../core/art/tool-config';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const DOCK = read('..', 'components', 'classic', 'ClassicArtToolDock.tsx');
const SHARED_DOCK = read('..', 'shell', 'ArtToolDock.tsx');
const S1_FACETS = read('facets', 's1-facets.tsx');
const WORKSPACE = read('LevelWorkspace.tsx');

/** The three tools artStore holds that the PixelEditController cannot execute —
 *  they act on a document CELL and route through aeon's composer. Spelled out
 *  HERE on purpose: this file is the one that is allowed to name them, because
 *  its whole job is to prove the dock does not. */
const TILE_SPACE_TOOLS = ['tile-stamp', 'collision', 'palette-apply'];

/** A quoted string literal of `name`, in any of the three quote styles. */
const literal = (name: string) => new RegExp(`(['"\`])${name}\\1`);

describe('the pixel tier predicate', () => {
  // The real decision, actually executed. Classic's Art facet is three
  // sub-surfaces — Chunk assigns blocks, Block assigns tiles, Tile has pixels —
  // and only the last one mounts PixelViewport, so only the last one has
  // anything the eight pixel tools can touch.
  it('is true for the tile tier only', () => {
    expect(isClassicPixelTier('tile')).toBe(true);
    expect(isClassicPixelTier('chunk')).toBe(false);
    expect(isClassicPixelTier('block')).toBe(false);
  });
});

describe('ClassicArtToolDock', () => {
  it('renders nothing off the pixel tier', () => {
    // The gate, and that it is the SHARED predicate rather than a second
    // inline `=== 'tile'` that could drift from level-presence's.
    expect(DOCK).toMatch(/if\s*\(\s*!isClassicPixelTier\([^)]*\)\s*\)\s*return\s+null/);
    expect(DOCK).toMatch(/import\s*\{[^}]*\bisClassicPixelTier\b[^}]*\}\s*from\s*'\.\.\/\.\.\/workspace\/level-presence'/);
  });

  it('offers the shared CLASSIC_TILE_TOOLS list', () => {
    expect(DOCK).toMatch(/\bCLASSIC_TILE_TOOLS\b/);
    expect(DOCK).toMatch(/tools=\{CLASSIC_TILE_TOOLS\}/);
  });

  it('spells no tool name of its own', () => {
    // A dock that inlined its list would compile, look identical, and quietly
    // stop tracking `toolConfigFrom`'s coercion — the one thing that stops a
    // tile-space tool armed on aeon's facet from becoming a pencil here.
    for (const t of TILE_SPACE_TOOLS) {
      expect(DOCK, `tile-space tool '${t}' must not be named in the dock`).not.toMatch(literal(t));
    }
    for (const t of CLASSIC_TILE_TOOLS) {
      expect(DOCK, `pixel tool '${t}' must come from CLASSIC_TILE_TOOLS, not a literal`).not.toMatch(literal(t));
    }
  });
});

describe('the shared ArtToolDock takes the subset', () => {
  it('has a tools prop rather than a forked classic dock', () => {
    // Reuse, not a copy: two dock stylings would drift on the first theme edit.
    expect(SHARED_DOCK).toMatch(/tools\?:\s*readonly ArtTool\[\]/);
  });

  it('can draw every tool the classic list names', () => {
    // The prop FILTERS the shared TOOLS table, so a name the table lacks is not
    // a type error — it is a button that silently never appears. This is what
    // catches a pixel tool added to CLASSIC_TILE_TOOLS and nowhere else.
    for (const t of CLASSIC_TILE_TOOLS) {
      expect(SHARED_DOCK, `no dock row for '${t}'`).toMatch(literal(t));
    }
  });
});

describe('s1ArtFacet mounts the pixel chrome', () => {
  it('declares both a ToolDock and a ToolOptions', async () => {
    const { s1ArtFacet } = await import('../facets/s1-facets');
    expect(s1ArtFacet.id).toBe('art');
    expect(s1ArtFacet.ToolDock, 'no ToolDock — classic cannot select a tool').toBeTypeOf('function');
    expect(s1ArtFacet.ToolOptions, 'no ToolOptions — no mirror/dither/pixel-perfect').toBeTypeOf('function');
  });

  it('gates its options bar on the same predicate as the dock', () => {
    expect(S1_FACETS).toMatch(/if\s*\(\s*!isClassicPixelTier\([^)]*\)\s*\)\s*return\s+null/);
    // Classic's capability set, not aeon's full bar: transforms write a
    // pendingAction only aeon's ComposerCanvas consumes, and the zoom control
    // moves a zoom classic's fixed-26px tile canvas never reads.
    expect(S1_FACETS).toMatch(/caps=\{CLASSIC_TILE_CAPS\}/);
  });

  it('suppresses the rail CONTAINER, not just its contents', () => {
    // A component returning null still leaves EditorShell drawing the 44px
    // bordered column around nothing — the failure its `toolDock` docblock
    // exists to describe. LevelWorkspace has to fold the tier into `has`.
    expect(WORKSPACE).toMatch(/toolDock:\s*mod\?\.ToolDock != null && pixelToolsLive/);
    expect(WORKSPACE).toMatch(/toolOptions:\s*mod\?\.ToolOptions != null && pixelToolsLive/);
  });
});
