// THE RASTER TIMELINE — a READ-ONLY lens on where this scene's bands and splits
// land down the 224-line frame (ROADMAP §4.6, "224-line strip, split markers,
// palette stops").
//
// THE DEFECT IT CLOSES. An author sets `vsplit.at` in a spinner and **nothing on
// screen changes**. It is the same shape as the two defects closed earlier on
// 2026-08-28 — the curve ramp was authorable and invisible, priority was
// authorable and invisible — and it is closed the same way: by drawing the
// value, not by describing it.
//
// ═══ THE BOUNDARY THIS FILE IS ON THE VIEW SIDE OF ═══
//
// Aeon is designing N-bands (`docs/superpowers/specs/2026-08-28-raster-band-
// ownership-design.md` at aeon `0bee83c61e9c53ade6899f7389f666720215caf7`,
// reachable from their `origin/master`). That design decides band OWNERSHIP and
// EDGE semantics. So this module DRAWS and does not EDIT: no marker is
// draggable, no split is created or deleted here, and there is **no persisted
// timeline document and no exported type that commits to how splits are owned
// or ordered**. Everything below is a projection of `CameraPreviewPlan`,
// recomputed per repaint and thrown away — the same object the camera preview
// already draws, seen down the frame instead of across it.
//
// ⚠ NO BAND COUNT, NO BAND HEIGHT MINIMUM, NO WIRE SIZE is transcribed from that
// design. It carries five open questions and its height minimum rests on
// `op_work_cyc == 64`, which their §12 still marks UNVERIFIED. A number copied
// out of a moving spec is the copied-pin defect this repo keeps paying for.
//
// ═══ THE COORDINATE-SPACE FINDING — READ THIS BEFORE ADDING A ROW ═══
//
// A layer's top and a split's line are **not the same quantity**, and putting
// both on one 224-line ruler without establishing that they are commensurable
// would produce a picture that looks authoritative and is wrong. Three spaces,
// and aeon names them in exactly these words (`engine/level/scene_dsl.emp`, at
// the revision above):
//
//   1. ACT space. `layer(world_y:)` ensures `world_y >= 0 && world_y < $8000`
//      — "the engine's act-axis span". A layer top is authored HERE.
//   2. PLANE space. `scene_plane_line(s, wy)` maps act -> Plane-B line, ensured
//      into `0 .. 511`. Locked (`v_factor == 15`) it is the IDENTITY; unlocked
//      it is `((wy - v_center) >> v_factor) + v_offset`.
//   3. SCREEN space — the strip's own ruler, 0..223. Step 4a maps plane to
//      screen as `plane_line - (Vscroll_BG mod 512)` EVERY FRAME.
//
// `scene_vsplit_line()`'s own header calls its result "a vertical split's SCREEN
// line" and calls itself "the second hop of two", and its first statement is
//
//     ensure(s.sc_v_factor == 15,
//            "... this scene's Plane B tracks the camera (v_factor {..}), so a
//             layer top has no comptime SCREEN line — Vscroll_BG changes every
//             frame and the fire line is baked ...")
//     return scene_plane_line(s, wy) - s.sc_v_offset
//
// and `scene()` refuses the unlocked-plus-vsplit combination outright, because
// a split "carries ONE baked scroll value at ONE baked fire line, and that line
// is derived at comptime from the layer top, which is a screen line only while
// Vscroll_BG is constant."
//
// **THE ANSWER: the two axes are commensurable exactly when `v_factor == 15`,
// and not otherwise.** On an unlocked scene a layer top does not merely have an
// unknown screen line — it has none until runtime. `rasterTimelineSpaceNotice`
// says that, in the app's own voice, and `spaceCertain` on every row lets the
// draw put those rows in a different visual register: what the strip shows for
// an unlocked scene is where the tops land FOR THE CAMERA AT THE FRAME'S ANCHOR
// RIGHT NOW, which slides the instant the camera moves.
//
// AND WHERE THEY DO MEET, THEY MEET EXACTLY. Under the lock, for every split
// whose fire line is legal, the preview's own band top and the engine's baked
// line are THE SAME NUMBER — not approximately, identically:
//
//   locked  =>  planeTop = world_y  and  vs = v_offset & 511
//   a legal fire line is 3..223, so  planeTop - vs = world_y - v_offset >= 3 > 0
//   `rebasePlaneTopsToScreen` picks k = the LAST band with planeTop <= vs, so a
//   band with planeTop > vs is never band k, never takes the `top = 0` arm, and
//   never takes the `top <= 0 => += 512` wrap; 223 < SCREEN_HEIGHT so the clamp
//   is not reached either. Its screen top is therefore `planeTop - vs`, which is
//   `world_y - v_offset`, which is `fireScreenLineOf` — aeon's
//   `scene_plane_line(s, wy) - s.sc_v_offset`.
//
// `__tests__/raster-timeline.test.ts` sweeps that rather than asserting it once:
// it is the load-bearing claim of the whole strip, and it is the claim a tidy
// false ruler would break silently.
//
// ═══ TWO MECHANISMS, TWO GRAMMARS — A SPLIT IS NOT A BAND ═══
//
// Both are called "raster" and they are shaped differently, so they must not be
// drawn alike:
//
//   • A VERTICAL SPLIT is a **boundary with ONE edge**. One mid-frame write of
//     an absolute value to VSRAM entry 1; no paired restore, no end line. It
//     runs from its line to the bottom of the frame, superseded by the next
//     split if there is one, and undone only by the next frame's top-of-frame
//     write. Drawn here as a rule with a downward flag.
//   • A PALETTE BAND is an **interval with TWO edges** — an ON op and a paired
//     `pal_restore`, which is the whole subject of aeon's N-bands design. Drawn
//     here: NOT AT ALL, and `rasterTimelineAbsences` says so on the strip. An
//     interval drawn as a boundary, or a boundary drawn as an interval, is the
//     picture that looks authoritative and misstates the mechanism.
//
// ═══ NO CLOCK ═══
//
// Everything here is a pure function of the scene and the frame anchor, drawn
// out of a React render that already runs on a store change. Nothing schedules
// anything; MapViewport's measured zero-idle-repaint property is untouched
// because this is not MapViewport.

import type { EffectsScene, EffectsLayer } from '../../core/formats/effects/scene';
import { factorLabel } from '../../core/formats/effects/scene-ui';
import type { CameraPreviewPlan, CameraPreviewBand } from './camera-preview';
import {
  layerTopSpace, fireScreenLineOf, layerEmitsFire, vsplitFieldValue,
  EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX, VSPLIT_LOCK_CLAUSES,
  type LayerTopSpace,
} from '../providers/effects-aeon';
import { SCREEN_HEIGHT } from '../../core/model/screen';
import {
  EFFECTS_GUIDE_LINE, EFFECTS_GUIDE_LINE_DISABLED,
  EFFECTS_GUIDE_LABEL_BG, EFFECTS_GUIDE_LABEL_TEXT,
  EFFECTS_GUIDE_REFUSED, EFFECTS_GUIDE_REFUSED_BG, EFFECTS_GUIDE_REFUSED_TEXT,
  CAMERA_PREVIEW_LABEL_BG, CAMERA_PREVIEW_LABEL_TEXT, CAMERA_PREVIEW_LABEL_WARN,
} from './canvas-colors';

/**
 * How many lines the strip is. `SCREEN_HEIGHT`, not a literal 224 — the ruler IS
 * the frame, and `core/model/screen.ts` is where that number is agreed with
 * aeon's `engine/system/constants.emp`.
 */
export const RASTER_TIMELINE_LINES = SCREEN_HEIGHT;

// ---------------------------------------------------------------------------
// THE STRIP'S OWN GEOMETRY — fixed, integral, and published
//
// ⚠ FIXED INTRINSIC SIZE ON PURPOSE. `devicePixelRatio` under Xvfb has been
// observed at 1 and at 1.35 in one session on this host, and a canvas sized from
// its client rect is then fractional — which presents as an off-by-one in the
// FEATURE when the feature is fine, and cost a full review cycle on this exact
// surface. This canvas has a constant backing store, so `getImageData` here is
// in strip space with no dpr factor and no rounding anywhere. CSS may scale the
// element; nothing measured depends on that.
// ---------------------------------------------------------------------------

/** 1 strip pixel per screen line — the ruler is 1:1 so no aim needs a scale. */
export const RASTER_TIMELINE_SCALE = 1;
/** Canvas-local Y of screen line 0. Room above for the header line. */
export const RASTER_TIMELINE_ORIGIN_Y = 16;
/** The band column: left edge and width, in strip px. */
export const RASTER_TIMELINE_STRIP_X = 34;
export const RASTER_TIMELINE_STRIP_W = 26;
/** Where a split's rule starts and how far it runs. */
export const RASTER_TIMELINE_RULE_X = RASTER_TIMELINE_STRIP_X - 6;
/** Overall canvas size, derived from the pieces above. */
export const RASTER_TIMELINE_W = 258;
export const RASTER_TIMELINE_H =
  RASTER_TIMELINE_ORIGIN_Y + RASTER_TIMELINE_LINES * RASTER_TIMELINE_SCALE + 30;

/** Canvas-local Y of a screen line. The one transform, and it is exact. */
export function lineToStripY(line: number): number {
  return RASTER_TIMELINE_ORIGIN_Y + line * RASTER_TIMELINE_SCALE;
}

// ---------------------------------------------------------------------------
// The view-model. LOCAL, per-render, and deliberately not a document shape.
// ---------------------------------------------------------------------------

/**
 * One band's extent on the strip — a projection of `CameraPreviewBand`, not a
 * second model of one. Every field is either copied from the plan or is
 * arithmetic on the strip's own ruler.
 */
export interface RasterTimelineBandRow {
  layer: number;
  screenTop: number;
  screenBottom: number;
  /** Canvas-local Y of `screenTop`, and the height in strip px. */
  y: number;
  h: number;
  enabled: boolean;
  /** `fb` is the locked factor — this band will not move for any camera X. */
  locked: boolean;
  /** This band showed the band above's scroll (`.band_disabled` inheritance). */
  inherited: boolean;
  label: string;
  /**
   * ⚠ FALSE means this row's screen position DOES NOT EXIST outside this
   * instant — the scene's Plane B tracks the camera, so the top is an act
   * coordinate that Step 4a re-maps every frame. The draw puts these in a
   * different register; see the file docblock.
   */
  spaceCertain: boolean;
}

/**
 * One vertical split, as the ENGINE fires it: a **boundary with one edge**.
 *
 * `line` is `fireScreenLineOf` — aeon's `scene_vsplit_line`, which is the baked
 * comptime number, NOT a position read off the preview. Where both exist they
 * are identical (see the docblock's derivation, swept in the tests); where they
 * differ the scene does not build, and `refusal` is why.
 */
export interface RasterTimelineSplitRow {
  layer: number;
  /** The baked SCREEN line the fire lands on. May be outside 0..223. */
  line: number;
  /** `vsplit.at` — the Plane-B ROW scrolled to from `line` down. A PAYLOAD, not a position. */
  at: number;
  /** Canvas-local Y of `line`, or null when the line is off the strip. */
  y: number | null;
  /** The engine's own refusal for this split, or null. */
  refusal: string | null;
}

/** What the strip is showing, in one throwaway bundle. */
export interface RasterTimelineView {
  sceneId: string;
  space: LayerTopSpace;
  bands: RasterTimelineBandRow[];
  splits: RasterTimelineSplitRow[];
  /** Sentences the strip must say for this scene. Empty is the common case. */
  notices: string[];
  /** Mechanisms this strip does not draw. Never empty. */
  absent: string[];
}

/**
 * The strip's caption when a layer top has no screen line at all.
 *
 * ⚠ NOT A HEDGE — a statement of what the engine believes. `scene_vsplit_line`
 * refuses to compute a screen line for this scene, in those words; drawing the
 * tops on a screen ruler anyway and saying nothing would be inventing a fact.
 */
export function rasterTimelineSpaceNotice(
  scene: Pick<EffectsScene, 'v_factor'>,
): string | null {
  if (layerTopSpace(scene) === 'screen') return null;
  return `Plane B tracks the camera (v_factor ${scene.v_factor}), so a layer top has no `
    + 'fixed screen line — these rows are where the tops land for THIS camera only, '
    + 'and the engine refuses a split on this scene.';
}

/**
 * The refusal for one split, or null.
 *
 * TWO ENGINE RULES, and they are different failures:
 *   • an unlocked scene cannot carry a split at all (`scene()`'s two-writer
 *     ensure) — the split has no baked line to draw;
 *   • a locked scene's fire must land on `3..223` (`fire()`), because lines
 *     0..2 belong to the priming records.
 *
 * ⚠ THE FIRST ARM COMPOSES THE PROVIDER'S CLAUSES (ROADMAP row 80). It used to
 * carry its own wording, which named ONE of the engine's two remedies and never
 * named the mechanism — and it was, until row 80, the ONLY thing in Aurora that
 * said anything about this combination, in a collapsible section away from the
 * controls that create it. `VSPLIT_LOCK_CLAUSES` is now the single declaration
 * and the panel's two sentences compose the same words; see the block above
 * `vsplitLockAdvisory` in `providers/effects-aeon.ts`.
 */
export function splitRefusal(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset'>, layer: Pick<EffectsLayer, 'world_y' | 'vsplit'>,
): string | null {
  if (layerTopSpace(scene) !== 'screen') {
    // Phrased to follow the strip's own subject ("Layer N's split …"), which is
    // why the clause itself carries no subject.
    return `cannot be baked: ${VSPLIT_LOCK_CLAUSES.sceneIs(scene.v_factor)}, so it has no fire `
      + `line and the build refuses the WHOLE SCENE. ${VSPLIT_LOCK_CLAUSES.mechanism} `
      + VSPLIT_LOCK_CLAUSES.remedies;
  }
  const line = fireScreenLineOf(scene, layer.world_y);
  if (line >= EFFECTS_FIRE_LINE_MIN && line <= EFFECTS_FIRE_LINE_MAX) return null;
  return `fires on screen line ${line}, outside ${EFFECTS_FIRE_LINE_MIN}..${EFFECTS_FIRE_LINE_MAX} `
    + `(lines 0-${EFFECTS_FIRE_LINE_MIN - 1} belong to the priming records). The build refuses it.`;
}

/**
 * What this strip does not draw. Never empty — see the two-grammars block.
 *
 * ⚠ SHORT PHRASES, BECAUSE THIS IS DRAWN. The first build put the whole
 * interval-versus-boundary sentence in here and the canvas truncated it to
 * "palette bands (an interval with tw…" — an honesty line that cannot be read is
 * not an honesty line. The canvas says WHAT is missing; `RASTER_TIMELINE_GRAMMAR`
 * below says WHY the two mechanisms are not interchangeable, in prose beside the
 * strip where a sentence has room to be a sentence.
 */
export function rasterTimelineAbsences(): string[] {
  return ['palette bands', 'per-line deform'];
}

/**
 * THE SENTENCE THE STRIP'S SHAPE DEPENDS ON, for the panel to render beside it.
 *
 * Two mechanisms are both called "raster" and they are shaped differently. A
 * reader who takes the split rules for band edges has the wrong model of the
 * hardware, and that is a worse outcome than not drawing them at all.
 */
export const RASTER_TIMELINE_GRAMMAR =
  'Read-only. A split is ONE edge: from its line to the bottom of the frame, until the next '
  + 'split supersedes it — there is no paired restore and no end line. A palette band is an '
  + 'INTERVAL with two edges, and those are not drawn yet.';

/**
 * The whole view, derived from the plan the camera preview draws from.
 *
 * ⚠ IT TAKES THE PLAN RATHER THAN RE-DERIVING FROM THE SCENE. That is the point
 * of the parcel: the strip has to be the SAME OBJECT the frame shows, seen a
 * different way. A second walk over `scene.layers` would drift from the preview
 * on the first change to either, and the symptom would be a strip that disagrees
 * with the rectangle beside it about where a band starts.
 *
 * The SPLITS are the exception and they come from the scene, because they are
 * not a plan quantity: the plan carries `vsplitAt` only for the bands it could
 * place, and a split the engine REFUSES has no band to hang off. Drawing only
 * the ones the preview placed would hide exactly the ones that break the build.
 */
export function rasterTimelineView(
  scene: EffectsScene, plan: CameraPreviewPlan,
): RasterTimelineView {
  const space = layerTopSpace(scene);
  const certain = space === 'screen';
  const bands: RasterTimelineBandRow[] = plan.bands.map((b: CameraPreviewBand) => {
    const h = Math.max(0, b.screenBottom - b.screenTop) * RASTER_TIMELINE_SCALE;
    return {
      layer: b.layer,
      screenTop: b.screenTop,
      screenBottom: b.screenBottom,
      y: lineToStripY(b.screenTop),
      h,
      enabled: scene.layers[b.layer]?.enabled !== false,
      locked: b.locked,
      inherited: b.inherited,
      label: `L${b.layer} ${factorLabel(b.factor)}`,
      spaceCertain: certain,
    };
  });

  const splits: RasterTimelineSplitRow[] = [];
  for (let i = 0; i < scene.layers.length; i++) {
    const layer = scene.layers[i];
    if (!layerEmitsFire(layer)) continue;
    const at = vsplitFieldValue(layer);
    if (at === null) continue;           // unreachable past layerEmitsFire; narrows the type
    const line = fireScreenLineOf(scene, layer.world_y);
    const refusal = splitRefusal(scene, layer);
    const onStrip = certain && line >= 0 && line < RASTER_TIMELINE_LINES;
    splits.push({ layer: i, line, at, y: onStrip ? lineToStripY(line) : null, refusal });
  }

  const notices: string[] = [];
  const spaceNote = rasterTimelineSpaceNotice(scene);
  if (spaceNote !== null) notices.push(spaceNote);

  return { sceneId: scene.id, space, bands, splits, notices, absent: rasterTimelineAbsences() };
}

// ---------------------------------------------------------------------------
// The draw
// ---------------------------------------------------------------------------

const STRIP_BG = 'rgba(10, 12, 18, 1)';
const PRIMING_FILL = 'rgba(255, 96, 96, 0.20)';
const RULER_TEXT = 'rgba(150, 165, 185, 0.9)';
const RULER_TICK = 'rgba(150, 165, 185, 0.35)';
/** The band column, cycled so adjacent bands are distinguishable without a legend. */
const BAND_FILLS = [
  'rgba(80, 220, 240, 0.38)',
  'rgba(80, 220, 240, 0.20)',
];
const SPLIT_LINE = 'rgba(255, 170, 60, 0.95)';
const SPLIT_TEXT = 'rgba(255, 220, 160, 0.98)';

/** Where every ruler tick goes. 32 is the shipped scenes' own spacing (0/32/80/112/160). */
const RULER_STEP = 32;

/** Below this height a band has no middle worth aiming at, and the label goes to its top. */
const LABEL_MID_MIN_H = 20;

/**
 * What one draw actually put down — counted while drawing, never re-derived.
 *
 * `fills` is band rectangles ACTUALLY issued and `markers` is split rules
 * ACTUALLY stroked, so a strip that planned everything and drew nothing reports
 * zeroes. See `RasterTimelineReport`.
 */
export interface RasterTimelineDrawCounts { fills: number; markers: number }

export function drawRasterTimeline(
  ctx: CanvasRenderingContext2D, view: RasterTimelineView,
): RasterTimelineDrawCounts {
  const counts: RasterTimelineDrawCounts = { fills: 0, markers: 0 };
  const x = RASTER_TIMELINE_STRIP_X;
  const w = RASTER_TIMELINE_STRIP_W;
  const top = RASTER_TIMELINE_ORIGIN_Y;
  const bottom = lineToStripY(RASTER_TIMELINE_LINES);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = STRIP_BG;
  ctx.fillRect(0, 0, RASTER_TIMELINE_W, RASTER_TIMELINE_H);
  ctx.font = '9px system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // ── the ruler ───────────────────────────────────────────────────────────
  ctx.fillStyle = RULER_TEXT;
  ctx.fillText(`screen lines 0..${RASTER_TIMELINE_LINES - 1}`, 2, 7);
  for (let line = 0; line <= RASTER_TIMELINE_LINES; line += RULER_STEP) {
    const y = Math.round(lineToStripY(Math.min(line, RASTER_TIMELINE_LINES - 1))) + 0.5;
    ctx.strokeStyle = RULER_TICK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = RULER_TEXT;
    ctx.fillText(String(Math.min(line, RASTER_TIMELINE_LINES - 1)), 2, y);
  }

  // ── the bands ───────────────────────────────────────────────────────────
  //
  // A DISABLED BAND STILL DRAWS. It still owns its rows — the engine's
  // `.band_disabled` arm gives it the band above's scroll rather than skipping
  // it — so a strip that omitted it would disagree with the frame about which
  // rows exist. Dimmed and hatched, never absent.
  for (const b of view.bands) {
    if (b.h <= 0) continue;
    const y = Math.round(b.y);
    const h = Math.round(b.h);
    ctx.fillStyle = b.enabled ? BAND_FILLS[b.layer % BAND_FILLS.length] : EFFECTS_GUIDE_LINE_DISABLED;
    ctx.fillRect(x, y, w, h);
    counts.fills++;
    // ⚠ THE UNCERTAIN REGISTER. On an unlocked scene these rows are this
    // camera's, not the scene's, so they are hatched: a different KIND of mark,
    // not a paler version of the same one.
    if (!b.spaceCertain) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = 'rgba(10, 12, 18, 0.85)';
      ctx.lineWidth = 2;
      for (let d = -h; d < w + h; d += 6) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d + h, y + h);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = EFFECTS_GUIDE_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + w, y + 0.5);
    ctx.stroke();

    const extra = (b.locked ? ' locked' : '') + (b.inherited ? ' inherit' : '')
      + (b.enabled ? '' : ' (off)');
    const text = `${b.label}${extra}`;
    ctx.fillStyle = EFFECTS_GUIDE_LABEL_BG;
    const tw = ctx.measureText(text).width;
    // ⚠ AT THE BAND'S MIDDLE, NOT ITS TOP. A split fires at its layer's own top,
    // so a label at the top sits exactly where that split's caption goes — and
    // the first build lost L1's and L2's labels underneath them entirely, which
    // left an author unable to tell which band was which. The middle is also the
    // truer place: the label names an INTERVAL, and the rules name EDGES.
    const ty = h >= LABEL_MID_MIN_H
      ? Math.round(y + h / 2)
      : Math.min(bottom - 6, y + 6);
    ctx.fillRect(x + w + 4, ty - 6, tw + 6, 12);
    ctx.fillStyle = b.locked ? CAMERA_PREVIEW_LABEL_WARN : EFFECTS_GUIDE_LABEL_TEXT;
    ctx.fillText(text, x + w + 7, ty);
  }

  // ── the priming rows ────────────────────────────────────────────────────
  // Lines 0..2 are the raster program's priming records; no fire may land
  // there. Marked so a split near the top reads as near a WALL.
  ctx.fillStyle = PRIMING_FILL;
  ctx.fillRect(x, top, w, EFFECTS_FIRE_LINE_MIN * RASTER_TIMELINE_SCALE);

  // ── the splits: ONE EDGE EACH ───────────────────────────────────────────
  //
  // ⚠ THE GRAMMAR IS THE POINT. A rule with a downward flag and NO closing
  // edge, because the mechanism has none: the split writes VSRAM entry 1 once
  // and that value stands to the bottom of the frame unless a later split
  // supersedes it. Anything that looked like a bracket would be a lie about a
  // paired restore this mechanism does not have.
  for (const s of view.splits) {
    if (s.y === null) continue;
    const y = Math.round(s.y) + 0.5;
    const refused = s.refusal !== null;
    ctx.strokeStyle = refused ? EFFECTS_GUIDE_REFUSED : SPLIT_LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(RASTER_TIMELINE_RULE_X, y);
    ctx.lineTo(RASTER_TIMELINE_W - 4, y);
    ctx.stroke();
    counts.markers++;
    // The downward flag — "from here DOWN", the sentence the row's title uses.
    ctx.fillStyle = refused ? EFFECTS_GUIDE_REFUSED : SPLIT_LINE;
    ctx.beginPath();
    ctx.moveTo(RASTER_TIMELINE_RULE_X, y);
    ctx.lineTo(RASTER_TIMELINE_RULE_X + 7, y);
    ctx.lineTo(RASTER_TIMELINE_RULE_X + 3.5, y + 6);
    ctx.closePath();
    ctx.fill();

    const text = `L${s.layer} split -> B row ${s.at}  (line ${s.line})`;
    const tw = ctx.measureText(text).width;
    const ty = y < bottom - 14 ? y + 8 : y - 8;
    ctx.fillStyle = refused ? EFFECTS_GUIDE_REFUSED_BG : CAMERA_PREVIEW_LABEL_BG;
    ctx.fillRect(RASTER_TIMELINE_RULE_X, ty - 6, tw + 6, 12);
    ctx.fillStyle = refused ? EFFECTS_GUIDE_REFUSED_TEXT : SPLIT_TEXT;
    ctx.fillText(text, RASTER_TIMELINE_RULE_X + 3, ty);
  }

  // ── the strip's own honesty line ────────────────────────────────────────
  //
  // ⚠ NOT OPTIONAL CHROME, for `camera-preview.ts`'s reason: inside this
  // rectangle the app is making a claim about what the ROM would do, and this
  // line is the boundary of the claim, said to the person the claim is made to.
  ctx.fillStyle = CAMERA_PREVIEW_LABEL_WARN;
  // ⚠ NOT TRUNCATED. The phrases are short (see `rasterTimelineAbsences`)
  // precisely so this fits; if a future absence makes it overflow, the fix is a
  // shorter phrase, never an ellipsis — half an honesty line reads as chrome.
  ctx.fillText(`not drawn: ${view.absent.join('; ')}`, 2, bottom + 8);
  if (view.splits.length === 0) {
    ctx.fillStyle = CAMERA_PREVIEW_LABEL_TEXT;
    ctx.fillText('no Plane B splits in this scene', 2, bottom + 20);
  }
  ctx.restore();
  return counts;
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// reason `effects-guides.ts`'s report block states at length: a probe that
// recomputed this from the stores would prove two copies of one arithmetic
// agree, which stays true when nothing is drawn.
// ---------------------------------------------------------------------------

export interface RasterTimelineReport {
  active: boolean;
  sceneId: string | null;
  space: LayerTopSpace | null;
  /** The strip's own constants, published so a harness never types them. */
  lines: number;
  scale: number;
  originY: number;
  stripX: number;
  stripW: number;
  bands: RasterTimelineBandRow[];
  splits: RasterTimelineSplitRow[];
  notices: string[];
  absent: string[];
  /** Band rectangles actually filled, and split rules actually stroked. */
  fills: number;
  markers: number;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

const INACTIVE: Omit<RasterTimelineReport, 'paints'> = {
  active: false, sceneId: null, space: null,
  lines: RASTER_TIMELINE_LINES, scale: RASTER_TIMELINE_SCALE,
  originY: RASTER_TIMELINE_ORIGIN_Y, stripX: RASTER_TIMELINE_STRIP_X, stripW: RASTER_TIMELINE_STRIP_W,
  bands: [], splits: [], notices: [], absent: [], fills: 0, markers: 0,
};

let lastReport: RasterTimelineReport = { ...INACTIVE, paints: 0 };

export function publishRasterTimelineReport(r: Omit<RasterTimelineReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

/** The inactive publish — what a facet with no scene selected reports. */
export function inactiveRasterTimelineReport(): Omit<RasterTimelineReport, 'paints'> {
  return { ...INACTIVE };
}

export function lastRasterTimelineReport(): RasterTimelineReport {
  return lastReport;
}
