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
const TILE_TAB = read('..', 'components', 'classic', 'TileTab.tsx');

/**
 * TileTab with comments stripped. The zoom guards below ask whether the file
 * DOES something, and TileTab's docblocks discuss `artStore.zoom`, the old 26px
 * grid and the hooks at length — every one of those assertions would pass on
 * prose alone if it read the raw source. (Same helper, same reason, as
 * components/classic/__tests__/classic-surface.test.ts.)
 */
const TILE_TAB_CODE = TILE_TAB
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

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
    // Classic's capability set, not aeon's full bar: `brushSpace`,
    // `repeatPreview` and `paletteLine` are controls TileTab does not read.
    expect(S1_FACETS).toMatch(/caps=\{CLASSIC_TILE_CAPS\}/);
  });

  // THE CROSS-ENGINE SLOT. `artStore.pendingAction` is one string every art host
  // shares. Turning classic's transform capability on is only safe while classic
  // also CONSUMES it, and consuming it is only safe while the slot is cleared on
  // every path — an action left behind fires on whatever art host mounts next,
  // against a document the user was not looking at when they clicked. Neither
  // half can be executed here (TileTab is .tsx), so both are pinned by scan.
  it('classic declares the transform capability and TileTab consumes the action', async () => {
    const { CLASSIC_TILE_CAPS } = await import('../../shell/ArtToolOptions');
    expect(CLASSIC_TILE_CAPS.transforms, 'transforms are off again').not.toBe(false);
    expect(TILE_TAB, 'TileTab does not read pendingAction').toMatch(/s\.pendingAction/);
    expect(TILE_TAB, 'TileTab does not resolve the action').toMatch(/resolveTileTransform\(/);
  });

  it('clears the pending action unconditionally, not only after a successful write', () => {
    // `finally` is the assertion: a `clearAction()` sitting after an early
    // `return` (locked tile, refused rotate, unknown action) is the exact bug
    // this shape exists to prevent.
    expect(TILE_TAB).toMatch(/finally\s*\{\s*useArtStore\.getState\(\)\.clearAction\(\);\s*\}/);
  });

  it('suppresses the rail CONTAINER, not just its contents', () => {
    // A component returning null still leaves EditorShell drawing the 44px
    // bordered column around nothing — the failure its `toolDock` docblock
    // exists to describe. LevelWorkspace has to fold the tier into `has`.
    expect(WORKSPACE).toMatch(/toolDock:\s*mod\?\.ToolDock != null && pixelToolsLive/);
    expect(WORKSPACE).toMatch(/toolOptions:\s*mod\?\.ToolOptions != null && pixelToolsLive/);
  });
});

// A CAPABILITY IS A CLAIM ABOUT THE HOST. `CLASSIC_TILE_CAPS.zoom` says "my
// canvas answers to `artStore.zoom`" — turn it on over a canvas that draws at a
// constant and the bar grows a readout that counts up beside a picture that
// never moves, which is exactly the state H1.5 shipped and H1.6 fixed. The two
// halves cannot be executed together here (the cap is a .ts value, the canvas is
// .tsx and there is no DOM), so the cap is imported and RUN while the wiring on
// the other side is pinned by scan. Neither half is worth much alone.
describe('the tile editor zooms and pans', () => {
  it('declares the zoom capability', async () => {
    const { CLASSIC_TILE_CAPS } = await import('../../shell/ArtToolOptions');
    expect(CLASSIC_TILE_CAPS.zoom, 'the zoom control is hidden from classic again').toBe(true);
  });

  it('renders at the store zoom, not a constant', () => {
    // The subscription: without it the canvas would not even re-render when the
    // option bar's +/- moved the number.
    expect(TILE_TAB_CODE, 'TileTab does not subscribe to artStore.zoom')
      .toMatch(/useArtStore\(\(s\)\s*=>\s*s\.zoom\)/);
    // And the zoom prop actually handed to the viewport. A number here — the old
    // `zoom={PX}` shape — is the whole regression: it compiles, it draws, and the
    // readout silently stops meaning anything.
    const prop = /<PixelViewport[\s\S]*?\bzoom=\{([^}]*)\}/.exec(TILE_TAB_CODE);
    expect(prop, 'no PixelViewport zoom prop found at all').not.toBeNull();
    expect(prop![1].trim(), 'the viewport is drawn at a hardcoded zoom').not.toMatch(/\d/);
  });

  it('keeps no canvas dimension of its own', () => {
    // `PX = 26` (→ a 208px canvas) and anything sized off it. The tile strip's
    // `size={26}` thumbnails are NOT this — they are a browse strip, not the
    // canvas — so this asks about declared constants rather than the digits.
    const decls = [...TILE_TAB_CODE.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(\d+)\s*;/g)];
    for (const [, name, value] of decls) {
      expect(Number(value), `const ${name} = ${value} — a canvas is ${'`8 * zoom`'}, not a constant`)
        .not.toBeOneOf([26, 208]);
    }
  });

  it('caps the zoom through the shared rule', () => {
    // An 8x8 tile cannot reach the ceiling from a 2..64 store clamp — the point
    // is that the host does not REASON about that. `cappedZoom` is the same rule
    // aeon's composer applies, and the value it returns must be the one the
    // viewport renders AND hit-tests with.
    expect(TILE_TAB_CODE, 'TileTab does not import the shared cap')
      .toMatch(/import\s*\{\s*cappedZoom\s*\}\s*from\s*'\.\.\/art-shared\/zoom-cap'/);
    expect(TILE_TAB_CODE).toMatch(/cappedZoom\(\s*zoom\s*,/);
  });

  it('adopts the shared pan/zoom hooks over one scroller', () => {
    // Both hooks drive a scroll container, so they must be handed the SAME ref,
    // and that ref must be attached to something. A hook pointed at a ref that
    // is never mounted is a silent no-op: `scrollerRef.current` is null in the
    // effect, it returns early, and no listener is ever bound.
    expect(TILE_TAB_CODE).toMatch(/useAnchoredZoom\(\s*scrollerRef\s*,/);
    expect(TILE_TAB_CODE).toMatch(/useHandPan\(\s*scrollerRef\s*\)/);
    expect(TILE_TAB_CODE, 'scrollerRef is never attached to an element').toMatch(/ref=\{scrollerRef\}/);
  });

  it('does not reintroduce a canvas border', () => {
    // PixelViewport's hit-test subtracts only `rect.left/top`, and a border is
    // INSIDE that rect — one CSS px of border offsets every click, which at low
    // zoom is a whole art pixel. The ring has to stay a box-shadow.
    expect(TILE_TAB_CODE, "the canvas style must keep border: 'none'").toMatch(/border:\s*'none'/);
  });

  it('does not repaint the tile strip on zoom', () => {
    // The browse strip is ~1000 thumbnails keyed on two fine clocks. Folding a
    // zoom into that key would redraw all of them on every wheel notch, for a
    // strip whose thumbnails are a fixed size and cannot change with zoom.
    const key = /const versionKeyFor\s*=[^\n]*\n?/.exec(TILE_TAB_CODE);
    expect(key, 'versionKeyFor is gone — check what the strip is keyed on now').not.toBeNull();
    expect(key![0], 'the tile strip key depends on zoom').not.toMatch(/zoom/i);
  });
});
