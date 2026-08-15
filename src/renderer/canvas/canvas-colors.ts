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
/** Real-collision overlay fills, by solidity class (translucent so art shows). */
export const COLLISION_FILL_ALL = 'rgba(80,200,120,0.42)';        // full solid — green
export const COLLISION_FILL_TOP = 'rgba(240,200,70,0.42)';        // jump-through top — amber
export const COLLISION_FILL_SIDES = 'rgba(90,150,240,0.42)';      // walls/ceiling — blue
export const COLLISION_FILL_NONE = 'rgba(160,160,170,0.25)';      // no-solidity shape — faint gray
export const COLLISION_SURFACE_LINE = 'rgba(255,255,255,0.85)';   // crisp top-of-surface stroke
export const COLLISION_ANGLE_TICK = 'rgba(255,80,80,0.9)';        // angle indicator
export const COLLISION_UNKNOWN = 'rgba(255,0,255,0.5)';           // out-of-range attr index
export const COLLISION_FALLBACK = 'rgba(120,160,220,0.35)';       // flat fill when no tables
export const COLLISION_DIFF = 'rgba(255,120,40,0.95)';            // outline: A/B planes differ here

// ---------- collision shape palette (CollisionPalette previews / thumbnails) ----------
/** Neutral teal silhouette fill for a drawn collision shape. */
export const COLLISION_SHAPE_FILL = 'rgba(70,200,150,0.9)';      // shape body — teal
/** Lighter teal surface-line stroke tracing the column tops. */
export const COLLISION_SHAPE_LINE = 'rgba(150,235,205,0.95)';    // surface line — light teal
/** Orange highlight for the solid-side box edges. */
export const COLLISION_SOLID_EDGE = 'rgba(255,150,60,1)';        // solid edges — orange
/** Blue angle needle. */
export const COLLISION_ANGLE_NEEDLE = 'rgba(120,190,255,1)';     // angle needle — blue

// ---------- collision paint hover preview (MapViewport ghost) ----------
/** Translucent silhouette fill for the ghost shape under the cursor. */
export const COLLISION_PREVIEW_FILL = 'rgba(120,220,180,0.5)';   // ghost shape — translucent teal
/** Outline around every block the stroke would change (reuse / brush scope). */
export const COLLISION_PREVIEW_SCOPE = 'rgba(255,255,255,0.45)'; // scope outline — faint white
/** Brighter outline around the cell directly under the cursor. */
export const COLLISION_PREVIEW_PRIMARY = 'rgba(120,190,255,0.95)'; // cursor cell — blue
/** Translucent fill marking cells an erase stroke would clear. */
export const COLLISION_PREVIEW_ERASE = 'rgba(255,90,90,0.4)';    // erase scope — translucent red

// ---------- map object/ring markers (OverlayRenderer) ----------
export const OBJECT_BOX_FILL = 'rgba(255, 100, 100, 0.7)';
export const OBJECT_BOX_STROKE = '#ff4444';
export const OBJECT_LABEL = '#ffffff';
/** Selection ring around the object-tool's currently-selected marker (Task 14). */
export const OBJECT_SELECTED_STROKE = '#94e2d5';
export const RING_FILL = 'rgba(255, 220, 0, 0.8)';
export const RING_STROKE = '#ffaa00';
// Invisible / trigger objects ("ghost markers") — muted blue-gray, dashed, clearly
// distinct from the red hex-box that flags a not-yet-linked id.
export const GHOST_BOX_FILL = 'rgba(120, 130, 160, 0.18)';
export const GHOST_BOX_STROKE = 'rgba(150, 165, 200, 0.7)';
export const GHOST_LABEL = 'rgba(200, 210, 235, 0.95)';
// Classic (S1) level-start spawn marker — pink, distinct from object red + ring yellow.
export const START_MARKER = '#f5c2e7';

// ---------- active-section border (SectionRenderer) ----------
export const ACTIVE_SECTION_BORDER = 'rgba(137, 180, 250, 0.6)';

// ---------- map marquee tool (MapViewport) ----------
/** ~10% alpha fill for the map marquee region (stroke reuses SELECTION_MARQUEE,
 *  the same Catppuccin teal used by the composer's own marquee tool). */
export const MAP_MARQUEE_FILL = 'rgba(148,226,213,0.1)';

// ---------- pixel-editor grids / overlays (PixelViewport, ComposerCanvas) ----------
export const PIXEL_GRID = 'rgba(255,255,255,0.08)';     // per-pixel grid (z>=8)
export const PIXEL_GRID_TILE = 'rgba(255,255,255,0.22)';// 8px tile grid
export const PIXEL_GRID_BLOCK = 'rgba(249,226,175,0.45)';// 128px block grid (mirrors --warning)
// ---------- origination canvas grids (components/canvas/canvas-pane-model) ----------
//
// THE FIRST TWO MUST MATCH PixelViewport's OWN ALPHAS. The canvas draws the same
// grid two ways: through the shared `cell8`/`block` layers when the document's
// gridOrigin is aligned to the pitch, and through CanvasHost's underlay when it
// is not (the shared layers step from the buffer origin and take no offset). If
// the two disagree, nudging gridOrigin by one pixel visibly changes the mesh's
// brightness and the artist reads a functional change into an alignment nudge.
// components/canvas/__tests__/canvas-pane-model.test.ts greps PixelViewport for
// the literals and fails when either side moves.
/** 8px cell mesh — PixelViewport's `cell8` alpha. */
export const CANVAS_GRID_CELL = 'rgba(255,255,255,0.12)';
/** 16px block grid — PixelViewport's `block` alpha, and deliberately brighter
 *  than the cell mesh so the two are still distinguishable when both are drawn
 *  by the underlay. */
export const CANVAS_GRID_BLOCK = 'rgba(255,255,255,0.22)';
/** 256px chunk grid. No shared layer draws this pitch, so there is no alpha to
 *  match; warm and brighter so it reads as structure over the white mesh — the
 *  same role PIXEL_GRID_BLOCK plays for the composer's 128px lines, restated
 *  here rather than borrowed because that constant names a different pitch. */
export const CANVAS_GRID_CHUNK = 'rgba(249,226,175,0.45)';

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
export const CHUNK_AIR_CHECK_A = '#2A2F3A';             // air ($00) picker checker — light square
export const CHUNK_AIR_CHECK_B = '#1B1E26';             // air ($00) picker checker — dark square

// ---------- classic layout stamp tool (ClassicLevelViewport) ----------
/** Fill wash over cells an in-progress stamp gesture has painted (pre-commit). */
export const STAMP_PREVIEW_FILL = 'rgba(120,180,255,0.30)';
/** Outline of those same preview cells. */
export const STAMP_PREVIEW_STROKE = 'rgba(150,200,255,0.95)';
/** Corner glyph marking a layout cell that carries S1's bit-7 loop flag. */
export const LOOP_GLYPH_FILL = 'rgba(255,196,60,0.92)';
export const LOOP_GLYPH_TEXT = '#1A1206';

// ---------- sprite/frame thumbnails (FrameGrid, Timeline) ----------
/** Transparent-pixel checkerboard cells for the sprite/frame thumbnails. */
export const CHECKER_A = '#2a2a3a';
export const CHECKER_B = '#33334a';
/** Out-of-palette / undefined color marker. */
export const OOB_MARKER = '#ff00ff';

// ---------- classic composer dock (ClassicComposerDock, composer-thumbs) ----------
/** Selected block-cell highlight outline in the block-tab 2x2 preview. */
export const COMPOSER_SEL_CELL = '#4FD1C5';
/**
 * Transparent-pixel checker in the tile-tab editor, as RGB channel triples for
 * PixelViewport's `checkerColors`: that compositor writes ImageData bytes, so it
 * takes channels rather than a CSS color string.
 *
 * THE ONLY SPELLING OF THESE TWO SQUARES. There used to be a `COMPOSER_CHECK_A`
 * / `COMPOSER_CHECK_B` pair carrying the same hexes as CSS strings for the
 * hand-rolled tile painter's `ctx.fillStyle`. That painter is gone (H1.3) and the
 * pair went with it (H1.7) — deliberately rather than being left "in case":
 * nothing mechanically tied the two spellings together, so editing one and not
 * the other would have silently changed the checker on whichever surface still
 * read the stale one.
 *
 * ORDER IS [even cell, odd cell] — PixelViewport paints `(x+y)` EVEN with element
 * 0, whereas the hand-rolled painter used the light square for the ODD cell. So
 * the darker square comes first here; swapping them inverts the checker's phase
 * (harmless to read, but it is a visible change, not a cleanup).
 */
export const COMPOSER_CHECK_RGB: [[number, number, number], [number, number, number]] =
  [[0x1C, 0x1C, 0x1C], [0x2A, 0x2A, 0x2A]];
/** Usage-count badge text on thumbnails. */
export const COMPOSER_BADGE_TEXT = '#FFFFFF';
/** Swatch-0 (transparent) checker squares in the color row. */
export const COMPOSER_SWATCH_A = '#333333';
export const COMPOSER_SWATCH_B = '#222222';

// --- Constraint clash tint (2B) ---------------------------------------------
//
// GrafX2's red-tinted clash cells are the precedent (spec §4.3). A fill alone
// disappears at zoom 1, where an 8px cell is 8 screen pixels, and swamps the art
// at zoom 32 — so every clash draws a low-alpha FILL plus a solid 1px OUTLINE:
// the fill carries at high zoom, the outline carries at low.

/** A cell drawing from more than one palette line. Fixed by REDRAWING. */
export const CANVAS_CLASH_FILL = 'rgba(255, 64, 64, 0.28)';
export const CANVAS_CLASH_EDGE = 'rgba(255, 96, 96, 0.9)';
/** A cell drawing from a line this profile does not have. Fixed by
 *  RE-ASSIGNING, which is a different repair, so it does not get the same
 *  colour — an artist who cannot tell the two apart has to inspect every tinted
 *  cell to find out which fix it wants. */
export const CANVAS_RANGE_FILL = 'rgba(255, 176, 32, 0.26)';
export const CANVAS_RANGE_EDGE = 'rgba(255, 196, 64, 0.9)';
