// src/renderer/canvas/canvas-colors.ts
//
// The canvas analog of styles/theme.css. Canvas 2D contexts
// (ctx.fillStyle / strokeStyle / shadowColor / createPattern) CANNOT read CSS
// custom properties cheaply, so every color drawn onto a canvas lives here as a
// named constant. This is the ONLY module (besides theme.css) allowed to hold
// raw hex — it is exempt from the no-raw-hex guardrail.
//
// Where a value mirrors a design token from theme.css, the mirroring token is
// noted in a comment. The hex is duplicated here intentionally: a single
// canvas-side source of truth is preferred over per-call CSS-var resolution.

// ---------- backdrops ----------
/** Opaque canvas backdrop (mirrors --void / T.void). */
export const CANVAS_VOID = '#0A0C12';
/** Hard black clear for offscreen section/bg compositors. */
export const CANVAS_BLACK = '#000000';

// ---------- map grids (OverlayRenderer) ----------
export const GRID_TILE = 'rgba(255, 255, 255, 0.06)';   // 8px tile grid
export const GRID_BLOCK = 'rgba(0, 200, 100, 0.25)';    // 128px block grid
export const GRID_SECTION = 'rgba(255, 255, 0, 0.3)';   // section grid

// ---------- collision overlay palette (OverlayRenderer) ----------
/** Out-of-range / unknown collision type marker. */
export const COLLISION_OOB = 'rgba(255, 0, 255, 0.3)';
/** Collision type → translucent fill. Indexed by collision id (1..7). */
export const COLLISION_PALETTE: Record<number, string> = {
  1: 'rgba(0, 128, 255, 0.3)',
  2: 'rgba(255, 0, 0, 0.3)',
  3: 'rgba(0, 255, 0, 0.3)',
  4: 'rgba(255, 128, 0, 0.3)',
  5: 'rgba(128, 0, 255, 0.3)',
  6: 'rgba(255, 255, 0, 0.3)',
  7: 'rgba(0, 255, 255, 0.3)',
};

// ---------- map object/ring markers (OverlayRenderer) ----------
export const OBJECT_BOX_FILL = 'rgba(255, 100, 100, 0.7)';
export const OBJECT_BOX_STROKE = '#ff4444';
export const OBJECT_LABEL = '#ffffff';
export const RING_FILL = 'rgba(255, 220, 0, 0.8)';
export const RING_STROKE = '#ffaa00';

// ---------- active-section border (SectionRenderer) ----------
export const ACTIVE_SECTION_BORDER = 'rgba(137, 180, 250, 0.6)';

// ---------- pixel-editor grids / overlays (PixelViewport, ComposerCanvas) ----------
export const PIXEL_GRID = 'rgba(255,255,255,0.08)';     // per-pixel grid (z>=8)
export const PIXEL_GRID_TILE = 'rgba(255,255,255,0.22)';// 8px tile grid
export const PIXEL_GRID_BLOCK = 'rgba(249,226,175,0.45)';// 128px block grid (mirrors --warning)
/** Selection marquee (mirrors Catppuccin teal accent). */
export const SELECTION_MARQUEE = '#94e2d5';
/** Tool preview stroke (mirrors Catppuccin pink). */
export const PREVIEW_STROKE = '#f5c2e7';
/** Default piece/overlay outline + HUD text (mirrors --warning / T.warning). */
export const OVERLAY_OUTLINE = '#f9e2af';

// ---------- collision HUD (ComposerCanvas) ----------
export const HUD_CHIP_BG = 'rgba(17,17,27,0.85)';       // corner chip background
export const HUD_CELL_BG = 'rgba(17,17,27,0.65)';       // per-cell collision pill
export const HUD_COLL_ZERO = '#6E7589';                 // collision 0 text (mirrors --text-lo)
export const HUD_COLL_NONZERO = '#f9e2af';              // collision >0 text (mirrors --warning)

// ---------- tile/chunk browser grids (TilesetPanel, ArtBrowser, ChunkLibrary) ----------
export const TILE_SELECTED = '#a6e3a1';                 // selected brush tile outline (mirrors --success)
export const TILE_HOVER = '#34D399';                    // hovered tile outline (mirrors --accent)
export const CHUNK_LABEL_BG = 'rgba(0,0,0,0.6)';        // chunk index label backdrop
export const CHUNK_LABEL_TEXT = '#E8EAF2';              // chunk index label (mirrors --text-hi)

// ---------- sprite/frame thumbnails (FrameGrid, Timeline) ----------
/** Transparent-pixel checkerboard cells for the sprite/frame thumbnails. */
export const CHECKER_A = '#2a2a3a';
export const CHECKER_B = '#33334a';
/** Out-of-palette / undefined color marker. */
export const OOB_MARKER = '#ff00ff';
