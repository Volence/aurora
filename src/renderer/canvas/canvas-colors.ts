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

// --- THE ANGLE MARK: ONE HUE, ONE CASING, EVERY SURFACE ---------------------
//
// There used to be TWO colours for one concept: the map drew the angle in red
// (this constant) and the picker thumbnails drew it in blue
// (`COLLISION_ANGLE_NEEDLE`, 120,190,255). The owner read the picker's blue
// lines and the map's red ticks as unrelated marks, which is what they looked
// like, because they were.
//
// RED-ORANGE WINS THE HUE. Every other lens on this canvas is spoken for:
// white/green/yellow (grids), green/amber/blue fills with a white surface line
// (collision), violet (priority), cyan (parallax guides), magenta (band lens),
// orange (screen frame). Warm red is the only hue the collision family can own
// outright, it is already what the map trained the eye on, and it stays
// distinct from the amber `COLLISION_FILL_TOP` it most often sits over because
// the mark is a thin cased stroke and the fill is a 0.42-alpha wash.
//
// THE CASING IS NOT DECORATION. The overlay is drawn over high-contrast pixel
// art in arbitrary colours, and "I can't see the shape over the art" is the
// complaint that started this. A lone bright stroke vanishes on bright art; a
// lone dark stroke vanishes on dark art. Casing first, core over it — the way
// map labels survive an arbitrary basemap — so at least one of the two always
// contrasts. Same trick, same reason, as `BAND_LENS_LABEL_BG`.
/** Bright core of the angle mark (bar + outward barb). */
export const COLLISION_ANGLE_TICK = 'rgba(255,90,70,1)';
/** Near-black casing stroked UNDER the core so the mark reads over any art. */
export const COLLISION_ANGLE_CASING = 'rgba(8,10,14,0.9)';
export const COLLISION_UNKNOWN = 'rgba(255,0,255,0.5)';           // out-of-range attr index
export const COLLISION_FALLBACK = 'rgba(120,160,220,0.35)';       // flat fill when no tables
export const COLLISION_DIFF = 'rgba(255,120,40,0.95)';            // outline: A/B planes differ here

// ---------- priority lens (classic-overlays drawPriority) ----------
// Marks the EXCEPTION only: high-priority 8x8 tiles (pattern-word bit 15 —
// render above sprites); low-priority tiles stay untouched art. Violet is the
// one hue the collision lens family doesn't use (green/amber/blue fills, white
// line, red ticks), so both lenses stay readable stacked. Same 0.42 fill alpha
// the collision fills proved legible over both light and dark zone art.
/** Translucent veil over each high-priority tile. */
export const PRIORITY_FILL = 'rgba(200, 90, 255, 0.42)';
/** Crisp stroke on high↔low boundaries — the shape read, like the collision
 *  overlay's white surface line (pale enough to register on dark art, violet
 *  enough to survive light art). */
export const PRIORITY_EDGE = 'rgba(245, 215, 255, 0.9)';

// ---------- sprite occlusion ghost (classic-overlays drawObjects) ----------
// The occluded portion of an object preview — sprite pixels the game hides
// behind high-priority plane tiles — stays discoverable as a translucent ghost
// washed with the SAME violet the priority lens uses, so "violet = the high
// plane is in front here" reads as one language across lens and ghost.
/** Violet wash composited source-atop onto the ghost's own pixels. */
export const OCCLUSION_GHOST_TINT = 'rgba(200, 90, 255, 0.55)';
/** Global alpha the tinted ghost is blitted with over the occluding map art. */
export const OCCLUSION_GHOST_ALPHA = 0.4;

// ---------- collision shape palette (CollisionPalette previews / thumbnails) ----------
/** Neutral teal silhouette fill for a drawn collision shape. */
export const COLLISION_SHAPE_FILL = 'rgba(70,200,150,0.9)';      // shape body — teal
/** Lighter teal surface-line stroke tracing the column tops. */
export const COLLISION_SHAPE_LINE = 'rgba(150,235,205,0.95)';    // surface line — light teal
/** Orange highlight for the solid-side box edges. */
export const COLLISION_SOLID_EDGE = 'rgba(255,150,60,1)';        // solid edges — orange
// NO SECOND ANGLE COLOUR LIVES HERE. `COLLISION_ANGLE_NEEDLE` (blue) used to,
// and a second NAME for one concept is how the picker and the map drifted into
// drawing the same angle byte in two colours AND two directions. The picker,
// the big preview, the paint ghost and both map overlays all import
// `COLLISION_ANGLE_TICK` + `COLLISION_ANGLE_CASING` above. Do not add another.

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
/**
 * Stroke for a marquee that is NOT block-aligned — Catppuccin peach.
 *
 * The selection is art-only when it lands off the 16px collision grid
 * (map-clipboard.ts `isBlockAligned`), and that is a fact about THE RECTANGLE
 * ON SCREEN, so it is said on the rectangle on screen and not only in a panel
 * the author may have collapsed. Warm-vs-teal rather than a second dash
 * pattern: the marquee is already dashed, and two dash rhythms would read as
 * noise where a colour reads as a state.
 */
export const MAP_MARQUEE_ART_ONLY = '#fab387';

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
/**
 * ONE GREEN, TWO STRENGTHS.
 *
 * These were two different greens — a Catppuccin `#a6e3a1` for the selection
 * and the emerald accent for the hover — sitting a few pixels apart in the same
 * grid, which reads as two unrelated states rather than one at two strengths.
 * The comment claiming the first mirrored `--success` was also stale: the token
 * IS the accent (`--success: #34D399`), so nothing was mirroring anything.
 *
 * Selection is the accent at full strength; hover is the same hue at reduced
 * alpha, which is what "you could pick this" should look like next to "this one
 * is picked".
 */
export const TILE_SELECTED = '#34D399';                 // selected brush tile outline (mirrors --accent)
export const TILE_HOVER = 'rgba(52,211,153,0.55)';      // hovered tile — the same green, softer
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

// --- Parallax layer guides (ROADMAP item 43, effects facet) ------------------
//
// Cyan, and deliberately not a hue the map's other overlays own: the tile /
// block / section grids are white / green / yellow, the collision lens is
// green / amber / blue fills with red ticks, and the priority lens is violet.
// A guide has to be legible stacked on all of them at once, because the effects
// facet mounts the ordinary map canvas with whatever overlays the author left on.

/** An enabled layer's world-Y division line. */
export const EFFECTS_GUIDE_LINE = 'rgba(80, 220, 240, 0.75)';
/** `enabled: false` — still drawn (it is still a division), dashed and dim. */
export const EFFECTS_GUIDE_LINE_DISABLED = 'rgba(80, 220, 240, 0.32)';
/** Hovered or being dragged. */
export const EFFECTS_GUIDE_ACTIVE = 'rgba(150, 245, 255, 1)';
/** Backing plate behind the `L0 y=…` label, so it stays readable over art. */
export const EFFECTS_GUIDE_LABEL_BG = 'rgba(10, 12, 18, 0.78)';
export const EFFECTS_GUIDE_LABEL_TEXT = 'rgba(190, 245, 255, 0.95)';

// A GUIDE THE ENGINE WOULD REFUSE (2026-08-28) — held at its bound, or already
// out of range because `v_offset` moved under it.
//
// ⚠ RED, NOT A DIMMER CYAN, and the choice is load-bearing rather than taste.
// The cyan family already carries three states (enabled / disabled / active) and
// a fourth shade of it would be read as a fourth degree of the same axis —
// "less selected" — when the meaning is categorical: the build refuses this. Red
// is also NOT taken on this canvas at guide weight: the collision lens's red is
// a tick mark inside a filled cell, the screen frame is amber, the band lens is
// magenta. It is the one hue whose arrival on a line means only one thing.
export const EFFECTS_GUIDE_REFUSED = 'rgba(255, 96, 96, 0.95)';
/** The plate under the sentence — darker and redder than the label plate, so the
 *  two are distinguishable at a glance without reading either. */
export const EFFECTS_GUIDE_REFUSED_BG = 'rgba(40, 10, 12, 0.90)';
export const EFFECTS_GUIDE_REFUSED_TEXT = 'rgba(255, 205, 200, 0.97)';

// --- The BgAnim band lens (ROADMAP item 43 part 2, effects facet) -------------
//
// MAGENTA, AND IT WAS TESTED ON THE PERSON WHO COMMISSIONED THE FEATURE.
//
// THE ONE-SENTENCE DEFENCE: it has to be unmistakably an OVERLAY over OJZ's
// grey-on-black background art, and every value-based alternative — a pale
// wash, a neutral haze — reads as more of that art rather than as something
// laid on top of it.
//
// ⚠ IT WAS CHANGED TO A COOL NEAR-NEUTRAL AND CHANGED BACK, and the round trip
// is worth recording because both halves are evidence.
//
// The worry was that hot magenta would read as an ALARM, which the ruling on
// this surface forbids — a footprint is NEUTRAL INFORMATION, and whether a
// range that paints 964 cells is the look wanted is the owner's call, not this
// canvas's to pre-judge. Asked directly, he said the opposite: the magenta "did
// read as 'something/information', nothing scary — just didn't know what it
// was". So the alarm reading was never there. THE REAL DEFECT WAS THAT NOTHING
// NAMED THE WASH, and it is fixed where it belongs — see `band-lens.ts`'s
// caption (a swatch of this exact colour, anchored beside the coverage) and the
// band panel's `LensSwatch`.
//
// The neutral was then built and MEASURED on the live OJZ background, and it
// lost on figure/ground: at `rgba(214,224,238,0.30)` a covered cell over the
// dark sky came out at `rgb(65,68,72)`, which is the same value range as the
// grey block art beside it. A lens that can be mistaken for the picture is
// worse than one that is obviously not.
//
// The secondary argument — that magenta collides with `COLLISION_UNKNOWN`, the
// palette's word for an out-of-range attr index — was weighed and is not
// load-bearing: that constant is CLASSIC-only and this lens is aeon-side, so
// they essentially never share a screen.
//
// Nothing here brightens, thickens or shifts as a footprint grows — every
// covered cell draws identically whether the range owns one or a thousand.

/** Fill over a background cell whose word names a slot in the marked range. */
export const BAND_LENS_FILL = 'rgba(255, 90, 200, 0.34)';
/**
 * Hairline around the same cells, so ONE cell stays legible at low zoom where
 * an 8px fill over busy art is a smudge. Same role as `COLLISION_SURFACE_LINE`
 * and `PRIORITY_EDGE`: the fill is the area, the edge is the shape.
 */
export const BAND_LENS_EDGE = 'rgba(255, 150, 220, 0.85)';
/** Backing plate behind the caption. */
export const BAND_LENS_LABEL_BG = 'rgba(10, 12, 18, 0.82)';
export const BAND_LENS_LABEL_TEXT = 'rgba(255, 200, 235, 0.95)';

// --- The screen frame (triage 2026-08-26 row G) ------------------------------
//
// ORANGE, and it is the one warm hue left. The map's other overlays own white /
// green / yellow (grids), green / amber / blue with red ticks (collision lens),
// violet (priority), cyan (parallax guides) and magenta (band lens). The frame
// is a reference the author lays AGAINST those — a guide at a screen line, a
// band's footprint against what one screen sees — so it has to stay legible
// stacked on every one of them at once. Orange collides with none of them and
// is the only warm, unsaturated-enough hue that does not read as an alarm.
//
// Same alpha and label plate as the guides, so the two reference families read
// as one language: a line, a small label, a backing plate over the art.

/** The frame's 1px outline. */
export const SCREEN_FRAME_LINE = 'rgba(255, 170, 60, 0.85)';
/** Hovered on an edge or being dragged. */
export const SCREEN_FRAME_ACTIVE = 'rgba(255, 210, 120, 1)';
/** Backing plate behind the `screen 320x224 @ x,y` label. */
export const SCREEN_FRAME_LABEL_BG = 'rgba(10, 12, 18, 0.78)';
export const SCREEN_FRAME_LABEL_TEXT = 'rgba(255, 220, 160, 0.95)';

// ---- The in-frame camera composite (camera-preview.ts) --------------------
// Its captions sit ON the composited background, so they need a heavier plate
// than the guides' — a guide label lands on the map, this one lands on art the
// author is judging and must not be mistaken for part of it.
/** Plate behind a band caption inside the frame. */
export const CAMERA_PREVIEW_LABEL_BG = 'rgba(12, 14, 18, 0.82)';
/** A band caption's text. */
export const CAMERA_PREVIEW_LABEL_TEXT = 'rgba(215, 226, 238, 0.95)';
/** The absence line, and a LOCKED band's caption — both are "read this twice". */
export const CAMERA_PREVIEW_LABEL_WARN = 'rgba(240, 198, 116, 0.98)';
