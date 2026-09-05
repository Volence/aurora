// PARALLAX LAYER GUIDES — the world-Y half of ROADMAP item 43.
//
// A parallax LAYER is a world-Y division: schema §2.2's `world_y` is "the
// act-axis coordinate at which this layer takes over". The panel exposes it as a
// spinner, which is a number with no relationship to the act on screen beside
// it. This module is the other spelling: a horizontal line drawn ACROSS the map
// canvas at that world Y, which the author drags.
//
// ⚠ THIS IS NOT THE BAND TOOL. ROADMAP row 43 splits the owner's ask in two and
// says explicitly not to fold them together. A BgAnim band is a tile-SLOT range
// of the override blob, resolved by a marquee — a different model over a
// different document, and it is deliberately absent from this file. Nothing here
// is scaffolding for it.
//
// ═══ ONE TRANSFORM, AND THIS IS IT ═══
//
// `MapViewport.screenToWorld` used to spell the pan/zoom mapping inline. A
// second copy of that arithmetic living in an overlay is the defect this module
// is shaped to prevent: it drifts on the first change to either, and the symptom
// is a guide that lands a few pixels off the row it reports — which looks like
// rounding rather than a bug. So `worldYToCanvasY`/`canvasYToWorldY` are defined
// HERE, they are exact inverses by construction, and `screenToWorld` CALLS the
// latter. There is no second transform to drift from.
//
// ═══ WHY THE AXIS LINES UP AT ALL ═══
//
// `world_y` is "act-axis coordinate; the engine-wide ceiling is $8000"
// (AURORA_EFFECTS_SCHEMA.md §2.2). The map canvas's world Y is act-axis too, and
// that is derived rather than assumed: `SectionRenderer.sectionWorldOffset(i)`
// is `(col, row) * SECTION_PIXEL_SIZE`, so section (0,0) sits at world (0,0) —
// the act's own origin — and the draw pass composes every section under one
// `ctx.scale(zoom); ctx.translate(-vpX, -vpY)`. The same derivation is written
// out at length in core/aether/warp-math.ts and core/formats/bg-override/
// bganim-preview.ts, which both already depend on it. Identity, no offset.

import type { EffectsLayer } from '../../core/formats/effects/scene';
import { rowRemapOf, rowRemapHeightLines } from '../../core/formats/effects/scene-ui';
import type { LayerTopSpace } from '../providers/effects-aeon';
import {
  EFFECTS_GUIDE_LINE, EFFECTS_GUIDE_LINE_DISABLED, EFFECTS_GUIDE_ACTIVE,
  EFFECTS_GUIDE_LABEL_BG, EFFECTS_GUIDE_LABEL_TEXT,
  EFFECTS_GUIDE_REFUSED, EFFECTS_GUIDE_REFUSED_BG, EFFECTS_GUIDE_REFUSED_TEXT,
  EFFECTS_SURFACE_LINE, EFFECTS_SURFACE_CASING,
  EFFECTS_SURFACE_LABEL_BG, EFFECTS_SURFACE_LABEL_TEXT,
} from './canvas-colors';

/** The map viewport, in the shape the draw pass already has one. */
export interface GuideViewport {
  /** World X of the canvas's left edge (`vpX`). */
  x: number;
  /** World Y of the canvas's top edge (`vpY`). */
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/**
 * World Y -> canvas-local Y (px from the canvas's top edge).
 *
 * The exact inverse of `canvasYToWorldY`, and the ONLY place either direction is
 * written. See the file docblock.
 */
export function worldYToCanvasY(worldY: number, vpY: number, zoom: number): number {
  return (worldY - vpY) * zoom;
}

/** Canvas-local Y -> world Y. `screenToWorld` is this, plus `rect.top`. */
export function canvasYToWorldY(canvasY: number, vpY: number, zoom: number): number {
  return vpY + canvasY / zoom;
}

// ═══ TWO SPACES, ONE ORIGIN, AND THE ORIGIN IS THE PLANE'S ═══
//
// ⚠ THIS BLOCK SAID THE OPPOSITE EARLIER ON 2026-08-27 AND WAS WRONG. It is
// written as a correction rather than quietly replaced, because the wrong rule
// is the one a reader arrives with and it shipped for half a day.
//
// THE RULE THAT SHIPPED (row 65): a locked scene's guides are measured from the
// SCREEN FRAME's top edge, less `v_offset` — "line 32 is line 32 wherever the
// camera is". The owner disproved it on screen the same day: *"if I move the
// viewport it drags the layers which I don't want"*, and *"I can't drag a layer
// below the viewport when I need them here"*, pointing at flower art well below
// the frame.
//
// THE RULE NOW, AND IT IS THE ENGINE'S: a locked layer's top is a PLANE ROW, it
// is FIXED ON THE ART, and its guide belongs at the map's own world Y for that
// plane row — which is that row's own number, because the plane is drawn at
// world (0,0). THE ORIGIN IS 0, IN BOTH SPACES.
//
// The derivation, all four steps in aeon:
//
//   1. LOCKED, THE PLANE DOES NOT TRACK THE CAMERA AT ALL.
//      `Parallax_Step5_Vscroll`'s `.v_locked` arm is
//      `move.w pcfg_v_offset(a0), d2` -> `Parallax_Current_Vscroll_BG`: the
//      whole-plane vertical scroll IS `v_offset`, a scene constant, and
//      `Camera_Y` is not read on that arm at all. (parallax.emp, in its own
//      words: "locked: BG = vOffset (static, ignores camera + lerp)".)
//   2. SO THE SCREEN IS A FIXED WINDOW ON THE PLANE. Step 4a puts plane line
//      `vs = Vscroll_BG & 511` at the screen's top row, so the display shows
//      plane rows `v_offset .. v_offset+223` — the same rows, forever, whatever
//      the camera does vertically.
//   3. AND A LAYER TOP IS A PLANE ROW. `scene_plane_line` is the identity under
//      the lock ("For a locked plane the authoring space IS the plane"), so top
//      80 is plane row 80, permanently.
//   4. THE MAP DRAWS THE PLANE AT WORLD ORIGIN. `SectionRenderer.renderBg` is
//      `ctx.drawImage(this.bg.canvas, 0, 0)` under the viewport transform, so
//      plane row P sits at map world Y = P.
//
// WHERE THE OLD RULE'S `- v_offset` CAME FROM, because it is a real quantity and
// it is easy to put back by accident. `scene_vsplit_line(s, wy) =
// scene_plane_line(s, wy) - v_offset` is the SCREEN line a vsplit FIRES on — the
// number bounded to 3..223, which `fireScreenLineOf` computes and
// `fireLineAdvisory` reports. It is a property OF a layer, not a layer's
// POSITION. A guide is drawn where the layer IS; the fire line is what the layer
// BECOMES. Subtracting it from the position was the confusion, and the symptom
// was guides riding a rectangle instead of sitting on the art.
//
// WHAT THE FRAME BECOMES INSTEAD — not nothing. Consequence (2) says the frame's
// top edge IS plane row `v_offset`, so on a locked scene the frame's VERTICAL
// position is the scene's own `v_offset` field, and dragging it edits the
// document. Its HORIZONTAL position is still `Camera_X`, a session reference,
// because `Decode_Factor_A(camX)` reads the camera on every band, every frame.
// ⚠ THE TWO AXES OF ONE RECTANGLE THEREFORE MEAN DIFFERENT KINDS OF THING on a
// locked scene: X is a camera position, Y is a scene field. That reads oddly and
// it is exactly what the engine says — the lock's entire content is that the
// vertical stopped being about the camera. `MapViewport.frameAnchorFor` owns
// that resolution; this module only has to know the guides are not in it.
//
// STILL REJECTED, and now for a better reason than before:
//   - `vp.y`, the original stand-in — not a world position at all, so the whole
//     guide set slid on every pan. The bug row 65 was opened on.
//   - the SCREEN FRAME's top edge — row 65's answer. It makes the guides move
//     when the camera moves, which is precisely what a LOCKED plane does not do.

/**
 * World Y that line 0 of `space` sits at. **Zero, in both spaces** — see the
 * block above.
 *
 * ⚠ IT KEPT ITS NAME AND LOST ITS ARGUMENTS ON PURPOSE. Deleting it outright
 * would delete the only place the refutation is written down, and the next
 * person to think "the guides should follow the camera" will think it at this
 * exact line. Dropping the `origin` parameter makes every call site that still
 * passes one a TYPE ERROR — which is how the stale ones were found rather than
 * left compiling. The same trick row 65 played with the argument ORDER, for the
 * same reason, one rule later.
 */
export function guideOriginWorldY(_space: LayerTopSpace): number {
  return 0;
}

/** Canvas-local Y -> a layer top in `space` (the drag's inverse of `layerGuideGeometry`). */
export function canvasYToLayerTop(
  canvasY: number, vp: GuideViewport, space: LayerTopSpace,
): number {
  return canvasYToWorldY(canvasY, vp.y, vp.zoom) - guideOriginWorldY(space);
}

/** The one-line caption the guide layer carries so the space is visible; null when act. */
export function guideCaption(space: LayerTopSpace): string | null {
  return space === 'screen' ? 'plane rows — fixed on the background, not on the frame' : null;
}

/**
 * How close, in SCREEN px, the cursor has to be to a guide to grab it.
 *
 * Screen px rather than world px on purpose: the grab zone is a fingertip, and a
 * fingertip does not shrink when the author zooms out. In world units a fixed
 * tolerance would be ~1px of slack at zoom 8 (ungrabbable) and ~40px at zoom
 * 0.2 (every guide overlapping every other).
 */
export const GUIDE_GRAB_PX = 6;

/**
 * Which guide the cursor is on, or null. Nearest wins when two overlap, and a
 * tie goes to the LATER layer — the one drawn on top, so the answer matches
 * what the author sees.
 */
export function guideAtCanvasY(
  canvasY: number, layers: readonly EffectsLayer[], vp: GuideViewport,
  space: LayerTopSpace = 'act',
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  const origin = guideOriginWorldY(space);
  for (let i = 0; i < layers.length; i++) {
    const d = Math.abs(worldYToCanvasY(origin + layers[i].world_y, vp.y, vp.zoom) - canvasY);
    if (d <= GUIDE_GRAB_PX && d <= bestDist) { best = i; bestDist = d; }
  }
  return best;
}

/** A layer is enabled unless the document says otherwise (schema default true). */
export function layerIsEnabled(layer: Pick<EffectsLayer, 'enabled'>): boolean {
  return layer.enabled !== false;
}

export interface GuideDrawOptions {
  /** The layer being dragged right now, drawn at `dragWorldY` instead of its own. */
  dragIndex?: number | null;
  dragWorldY?: number;
  /** The layer under the cursor, drawn brighter. */
  hoverIndex?: number | null;
  /**
   * Which space the tops are in (`layerTopSpace(scene)`); act when omitted.
   *
   * It changes the LABEL and the CAPTION and nothing about the POSITION: both
   * spaces are drawn at world origin now. See the origin block above for why the
   * `origin` field that used to sit here is gone.
   */
  space?: LayerTopSpace;
  /**
   * The bound's own sentence, per layer index — `guideBoundNotice`'s output,
   * resolved by the caller because only it holds the scene.
   *
   * ⚠ THE CALLER RESOLVES IT, THIS MODULE ONLY DRAWS IT. A draw pass that
   * computed its own advisory would be a second opinion about an engine rule
   * living in a file about pixels, and the whole point of the provider's shared
   * clauses is that there is exactly one opinion.
   */
  notices?: ReadonlyMap<number, GuideNotice>;
}

/** The provider's `GuideBoundNotice`, narrowed to what a canvas needs. */
export interface GuideNotice {
  tone: 'held' | 'illegal';
  text: string;
}

/** Where one guide row ends up on the canvas — the shape the debug probe reports. */
export interface GuideGeometry {
  index: number;
  worldY: number;
  canvasY: number;
  enabled: boolean;
  onScreen: boolean;
  /**
   * The bound's sentence for this row, or null.
   *
   * PUBLISHED, NOT RE-DERIVED, for the reason the whole report exists (see
   * `GuideReport`): a harness that recomputed this from the scene would prove
   * two copies of one arithmetic agree, which stays true when nothing is drawn.
   */
  notice: GuideNotice | null;
}

/**
 * The guides' geometry for a viewport, in draw order.
 *
 * Split out from `drawLayerGuides` so the node suite can assert placement
 * without a canvas, and so `__dbg` can report exactly what was drawn rather than
 * a harness re-deriving it (a harness that recomputes the answer it is checking
 * proves only that two copies of the same arithmetic agree).
 */
export function layerGuideGeometry(
  layers: readonly EffectsLayer[], vp: GuideViewport, opts: GuideDrawOptions = {},
): GuideGeometry[] {
  const out: GuideGeometry[] = [];
  const origin = guideOriginWorldY(opts.space ?? 'act');
  for (let i = 0; i < layers.length; i++) {
    const worldY = (opts.dragIndex === i && typeof opts.dragWorldY === 'number')
      ? opts.dragWorldY : layers[i].world_y;
    // `worldY` stays the DOCUMENT's number (a screen line on a locked scene);
    // only the canvas position knows which origin it is measured from.
    const canvasY = worldYToCanvasY(origin + worldY, vp.y, vp.zoom);
    out.push({
      index: i,
      worldY,
      canvasY,
      enabled: layerIsEnabled(layers[i]),
      onScreen: canvasY >= 0 && canvasY <= vp.height,
      notice: opts.notices?.get(i) ?? null,
    });
  }
  return out;
}

// ═══ `plane_y` GETS A REFERENT: THE ROW OF THE AUTHOR'S OWN BG ART ═══
//
// THE PROBLEM THIS EXISTS FOR, in the closing finding of the parcel that made
// the field authorable (docs/reviews/2026-09-05-rowremap-author.md section 6
// item 3): "`plane_y` has no help beyond its range. The box refuses past 511 and
// says why, but nothing anywhere relates the number to the strip, to the
// anchored split, or to the art." A control that can only say what a number is
// NOT is honest and useless.
//
// AEON'S OWN DEFINITION, quoted rather than paraphrased
// (engine/level/parallax.emp:391-393, read at a2bb5904):
//
//     brm_plane_y   the BG PLANE LINE at which this layer's art paints the
//                   surface the effect is about. Half of the perspective
//                   quantity: the BG's image of that surface is at screen line
//                   `brm_plane_y - Vscroll_BG`.
//
// So it is a row of the BACKGROUND ART, and the author is the only party who
// knows which row that is. Drawing the rule puts the question in a form a person
// can answer by looking: is that on my waterline?
//
// ⚠ THE SCREEN LINE IS A DIFFERENT QUANTITY AND IS DELIBERATELY NOT DRAWN HERE.
// `plane_y - Vscroll_BG` is where the surface lands on the SCREEN, and its second
// term is a per-frame runtime value; the camera preview inside the screen frame
// is the surface that models that. What this rule marks is the term the document
// owns, and that term has no camera in it at all.
//
// ═══ WHY WORLD Y IS THE PLANE ROW, IN BOTH SPACES, WITH NO LOCK TEST ═══
//
// `SectionRenderer.renderBg` is `ctx.drawImage(this.bg.canvas, 0, 0)` under the
// viewport transform, so plane row P sits at map world Y = P. That is a fact
// about how the MAP composites Plane B, not about a scene's vertical mapping, so
// it holds on a locked scene and an unlocked one alike. The layer guides above
// needed a whole correction block to establish their origin (see it); this rule
// needs none, because it was never measured from a layer.
//
// ⚠ AND IT DOES NOT MOVE WHEN `v_offset` MOVES. That is the same trap row 65 fell
// into for the guides and is worth naming here before someone re-derives it:
// `v_offset` is where the SCREEN sits on the plane, and this rule is a row OF the
// plane. Subtracting it would weld the waterline to the view box.

/** Where one `plane_y` rule ends up, and what the label says about it. */
export interface SurfaceGeometry {
  /** The layer whose `rowRemap` names this line. */
  index: number;
  /** The document's `plane_y`, a Plane-B row. */
  planeY: number;
  /** `1 << height_shift`, shown so the two numbers of the key read together. */
  heightLines: number;
  canvasY: number;
  onScreen: boolean;
}

/**
 * The `plane_y` rules for a viewport, in layer order.
 *
 * Split from the draw for the reason `layerGuideGeometry` is: the node suite can
 * assert placement without a canvas, and `__dbg` reports what was DRAWN rather
 * than letting a harness recompute the answer it is checking.
 *
 * A layer with no `rowRemap`, or with `"none"`, contributes nothing. A DISABLED
 * layer still contributes one, for the reason a disabled layer still draws a
 * guide: the panel still lists the field and the author is still editing it.
 */
export function surfaceGeometry(
  layers: readonly EffectsLayer[], vp: GuideViewport,
): SurfaceGeometry[] {
  const out: SurfaceGeometry[] = [];
  for (let i = 0; i < layers.length; i++) {
    const rr = rowRemapOf(layers[i].rowRemap);
    if (rr === null) continue;
    // No origin term. See the block above: the plane is drawn at world 0.
    const canvasY = worldYToCanvasY(rr.plane_y, vp.y, vp.zoom);
    out.push({
      index: i,
      planeY: rr.plane_y,
      heightLines: rowRemapHeightLines(rr.height_shift),
      canvasY,
      onScreen: canvasY >= 0 && canvasY <= vp.height,
    });
  }
  return out;
}

/** The caption that says what the white rule IS, or null when none is drawn. */
export function surfaceCaption(rows: readonly SurfaceGeometry[]): string | null {
  if (rows.length === 0) return null;
  return 'white rule = plane_y, the BG art row the remap treats as the surface';
}

/**
 * Draw the `plane_y` rules over the already-composed map.
 *
 * NO CLOCK, NO STATE, for the reason `drawLayerGuides` states: this runs inside
 * the draw pass that already repaints on a pan, a zoom, a store change and an
 * undo. MapViewport's measured zero-idle-repaint property is untouched.
 *
 * DRAWN AFTER THE GUIDES so a `plane_y` sitting exactly on a layer top is still
 * visible, which is the case the seed value produces: the rowRemap parcel seeded
 * `plane_y` from the strip's own top, so the two coincide on a fresh document and
 * the referent would be invisible on the one scene most likely to be opened.
 */
export function drawSurfaceMarks(
  ctx: CanvasRenderingContext2D, vp: GuideViewport, rows: readonly SurfaceGeometry[],
): void {
  if (rows.length === 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const row of rows) {
    if (!row.onScreen) continue;
    // Half-pixel offset, same reason as the guides: a 1px line on an integer
    // coordinate straddles two device rows and smears.
    const y = Math.round(row.canvasY) + 0.5;

    // The casing first, unbroken, so the dashes read on white art as well as on
    // black. A dashed white line alone vanishes over OJZ's bright water tiles,
    // which is exactly the art this key is for.
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(vp.width, y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = EFFECTS_SURFACE_CASING;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(vp.width, y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = EFFECTS_SURFACE_LINE;
    // A long dash, not the guides' short one: the two dash patterns are what
    // separate a referent from a division at a glance, before either label is
    // read.
    ctx.setLineDash([12, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // The label names the KEY, not just the number, because the whole defect is
    // that the number related to nothing. `H=` rides along so the band height
    // and the surface row are read together, which is how they are authored.
    const text = `L${row.index} plane_y=${row.planeY} (surface, H=${row.heightLines})`;
    const w = ctx.measureText(text).width;
    // Right-hand column, so it never collides with the guides' left-hand labels
    // on a scene where a top and a plane_y coincide.
    const boxX = Math.max(4, vp.width - w - 16);
    const boxY = row.canvasY < 16 ? y + 2 : y - 15;
    ctx.fillStyle = EFFECTS_SURFACE_LABEL_BG;
    ctx.fillRect(boxX, boxY, w + 8, 13);
    ctx.fillStyle = EFFECTS_SURFACE_LABEL_TEXT;
    ctx.fillText(text, boxX + 4, boxY + 7);
  }

  // Said once, bottom-right, ABOVE the guides' own caption. A white rule with no
  // sentence is a mystery overlay, and the sentence is the half that converts the
  // number in the box into a question the author can answer.
  const caption = surfaceCaption(rows);
  if (caption !== null) {
    const w = ctx.measureText(caption).width;
    ctx.fillStyle = EFFECTS_SURFACE_LABEL_BG;
    ctx.fillRect(vp.width - w - 12, vp.height - 32, w + 8, 13);
    ctx.fillStyle = EFFECTS_SURFACE_LABEL_TEXT;
    ctx.fillText(caption, vp.width - w - 8, vp.height - 32 + 7);
  }
  ctx.restore();
}

/**
 * Greedy word wrap against the context's CURRENT font, in canvas px.
 *
 * Measured rather than estimated from a character count: the plate carries a
 * sentence with numbers in it, and a monospace assumption over a proportional
 * `system-ui` overflows on exactly the wide lines it should be protecting.
 */
export function wrapNoticeText(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    // A single word wider than the plate still gets its own line rather than an
    // infinite loop or a dropped word — it overhangs, which is visible and
    // recoverable, where silence is not.
    if (line !== '' && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** Width the notice plate is allowed, given the viewport. */
const NOTICE_MAX_W = 460;
const NOTICE_LINE_H = 13;

/**
 * The refusal plate: the guide's own sentence, beside the guide it is about.
 *
 * ⚠ IT IS PLACED RELATIVE TO THE GUIDE, NOT PARKED IN A CORNER, and that is the
 * requirement rather than a preference. The bug being fixed is that the author
 * pushed against a wall HERE and the explanation was elsewhere (or nowhere); a
 * sentence in the bottom-right is a second elsewhere. It sits under the line
 * when there is room below and over it when there is not, and it is clamped
 * into the viewport so a guide near an edge cannot push it off-canvas — the one
 * failure mode that would return this parcel to silence.
 */
function drawNoticePlate(
  ctx: CanvasRenderingContext2D, vp: GuideViewport, row: GuideGeometry, text: string,
): void {
  const maxW = Math.max(120, Math.min(NOTICE_MAX_W, vp.width - 24));
  const lines = wrapNoticeText(ctx, text, maxW - 12);
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12);
  const h = lines.length * NOTICE_LINE_H + 8;
  const below = row.canvasY + 8;
  const y = Math.round(below + h <= vp.height - 4 ? below : Math.max(4, row.canvasY - h - 8));
  const x = Math.round(Math.max(4, Math.min(vp.width - w - 4, 8)));

  ctx.fillStyle = EFFECTS_GUIDE_REFUSED_BG;
  ctx.fillRect(x, y, w, h);
  // A left rule in the refusal colour: the plate has to be attributable to the
  // red line above it at a glance, before any of it is read.
  ctx.fillStyle = EFFECTS_GUIDE_REFUSED;
  ctx.fillRect(x, y, 2, h);
  ctx.fillStyle = EFFECTS_GUIDE_REFUSED_TEXT;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + 8, y + 4 + i * NOTICE_LINE_H + NOTICE_LINE_H / 2);
  }
}

/**
 * Draw the guides over the already-composed map.
 *
 * NO CLOCK, NO STATE. This runs inside the draw pass that already repaints on a
 * pan, a zoom, a store change and an undo — the same pass everything else on
 * this canvas comes out of. MapViewport's measured zero-idle-repaint property
 * (37/37) is untouched: nothing here schedules anything.
 *
 * A DISABLED LAYER STILL DRAWS ONE. It is still a world-Y division the author is
 * editing and the panel still lists it; a canvas that hides it disagrees with
 * the panel about what the scene contains. It draws dashed and dim instead.
 */
export function drawLayerGuides(
  ctx: CanvasRenderingContext2D, vp: GuideViewport,
  layers: readonly EffectsLayer[], opts: GuideDrawOptions = {},
): void {
  const rows = layerGuideGeometry(layers, vp, opts);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const row of rows) {
    if (!row.onScreen) continue;
    const active = opts.dragIndex === row.index || opts.hoverIndex === row.index;
    // Half-pixel offset: a 1px line on an integer coordinate straddles two
    // device rows and renders as a 2px smear.
    const y = Math.round(row.canvasY) + 0.5;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(vp.width, y);
    ctx.lineWidth = active || row.notice !== null ? 2 : 1;
    // REFUSAL OUTRANKS SELECTION. A guide that is both hovered and unbakeable
    // must read as unbakeable: "which line am I touching" is answerable from the
    // cursor, "which line kills the build" is answerable from nothing else.
    ctx.strokeStyle = row.notice !== null ? EFFECTS_GUIDE_REFUSED
      : active ? EFFECTS_GUIDE_ACTIVE
        : row.enabled ? EFFECTS_GUIDE_LINE : EFFECTS_GUIDE_LINE_DISABLED;
    ctx.setLineDash(row.enabled ? [] : [5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // The label says WHICH layer and WHAT row, because a bare line answers
    // neither and the panel spinner it mirrors is 300px away.
    const text = `L${row.index} y=${Math.round(row.worldY)}${row.enabled ? '' : ' (off)'}`;
    const w = ctx.measureText(text).width;
    // Below the line when the line is near the top edge, above it otherwise, so
    // a guide at world 0 does not print its label off-canvas.
    const boxY = row.canvasY < 16 ? y + 2 : y - 15;
    ctx.fillStyle = row.notice !== null ? EFFECTS_GUIDE_REFUSED_BG : EFFECTS_GUIDE_LABEL_BG;
    ctx.fillRect(4, boxY, w + 8, 13);
    ctx.fillStyle = row.notice !== null ? EFFECTS_GUIDE_REFUSED
      : active ? EFFECTS_GUIDE_ACTIVE : EFFECTS_GUIDE_LABEL_TEXT;
    ctx.fillText(text, 8, boxY + 7);
  }

  // THE SENTENCE, and only ONE of them.
  //
  // ⚠ AT MOST ONE PLATE ON SCREEN, EVER. `v_offset` can put several layers out
  // of range in one drag of the view box, and four stacked paragraphs of the
  // same rule is the "advisory becomes decoration" failure — the author skips
  // all of them and the one they needed goes with the rest. Every refused LINE
  // is still marked red above, so nothing is hidden: the count is visible, the
  // explanation is said once.
  //
  // The dragged row wins, because it is the row the author is asking about right
  // now; otherwise the topmost refused row on screen.
  const noticeRow = rows.find((r) => r.notice !== null && r.index === opts.dragIndex)
    ?? rows.filter((r) => r.notice !== null && r.onScreen)
      .sort((a, b) => a.canvasY - b.canvasY)[0];
  if (noticeRow !== undefined && noticeRow.notice !== null) {
    const refusedCount = rows.filter((r) => r.notice !== null).length;
    const head = `L${noticeRow.index} ${noticeRow.notice.text}`
      + (refusedCount > 1 ? ` (${refusedCount} layers are refused; the rest are marked)` : '');
    drawNoticePlate(ctx, vp, noticeRow, head);
  }
  // The space, said once on the layer itself: a set of lines that stay put
  // while the act pans under them needs a sentence explaining why, or it
  // reads as a guide that forgot to scroll. Bottom-right, out of the labels'
  // column and the band lens's corner.
  const caption = guideCaption(opts.space ?? 'act');
  if (caption !== null) {
    const w = ctx.measureText(caption).width;
    const boxX = vp.width - w - 12;
    const boxY = vp.height - 17;
    ctx.fillStyle = EFFECTS_GUIDE_LABEL_BG;
    ctx.fillRect(boxX, boxY, w + 8, 13);
    ctx.fillStyle = EFFECTS_GUIDE_LABEL_TEXT;
    ctx.fillText(caption, boxX + 4, boxY + 7);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew
// ---------------------------------------------------------------------------

/**
 * The guides as of the last completed map repaint.
 *
 * A PUBLISH, NOT A RE-DERIVATION, and the distinction is the point. A CDP
 * harness has no way to read a line off a canvas except by sampling pixels, and
 * the obvious alternative — having the probe recompute the geometry from the
 * view store and the scene — proves only that two copies of the same arithmetic
 * agree, which is true even when the draw pass never ran. `__dbg.aeon.guides()`
 * reports THIS, which MapViewport writes at the end of its draw body, so a
 * harness row can tell "drawn at y=…" from "would be drawn at y=… if anything
 * were drawing". Same shape as the classic viewport's camera publish behind
 * `__dbg.view()`.
 *
 * `active: false` is a real answer, not an absence: it is what a facet with no
 * guides reports, which is what makes "Layout draws none" a row that can fail.
 */
export interface GuideReport {
  /** Whether the last repaint drew guides at all. */
  active: boolean;
  /** The scene they came from, when active. */
  sceneId: string | null;
  /** The space the rows were drawn in (`layerTopSpace(scene)`); null when inactive. */
  space: LayerTopSpace | null;
  rows: GuideGeometry[];
  /**
   * The `plane_y` rules drawn this repaint, empty when the scene authors no
   * remap. PUBLISHED rather than re-derivable for the reason the whole report
   * exists: a harness that recomputed it from the scene would prove two copies
   * of one sum agree, which stays true when nothing is drawn.
   */
  surfaces: SurfaceGeometry[];
  dragIndex: number | null;
  hoverIndex: number | null;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

let lastReport: GuideReport = {
  active: false, sceneId: null, space: null, rows: [], surfaces: [],
  dragIndex: null, hoverIndex: null, paints: 0,
};

export function publishGuideReport(r: Omit<GuideReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastGuideReport(): GuideReport {
  return lastReport;
}
