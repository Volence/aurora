// THE CAMERA PREVIEW — the screen frame stops being a rectangle and becomes the
// camera.
//
// The owner, on what he wanted: *"I just want it to appear how it would in
// game."* And, decisively, on where it should live: *"I was half thinking a
// different view but I think that's too cumbersome with wanting to do edits and
// having to go back and forth."* So this is not a mode and not a second canvas.
// The authoring map keeps drawing; inside the frame, Plane B is re-composed the
// way the ROM would compose it for a camera at the frame's anchor.
//
// ═══ THIS FILE IS GEOMETRY ONLY ═══
//
// It answers "which rows of the screen show which rows and columns of Plane B",
// and it answers it as plain numbers so the node suite can see it. The blitting
// is `drawCameraPreview` at the bottom, which does nothing this plan does not
// say. The split is the same one `effects-guides.ts` made for
// `layerGuideGeometry`, and for the same reason: a harness that re-derives the
// answer it is checking proves only that two copies of one sum agree.
//
// ═══ THE FOUR TRANSCRIPTIONS, AND WHERE EACH COMES FROM ═══
//
// 1. HORIZONTAL, per band — `decodeFactorScroll` (core/formats/effects/
//    factor-decode.ts), which is `Decode_Factor_A` term for term. A band's
//    Plane-B scroll is `decode(camX, fb)`, so screen column `c` shows plane
//    column `scroll + c`. THE BAND'S OWN FACTOR, so a `FACTOR_1_2` band slides
//    eight times as far as a `FACTOR_1_16` one for the same camera move, and a
//    `FACTOR_LOCKED` band does not slide at all.
//
// 2. A DORMANT BAND INHERITS THE ONE ABOVE IT — `parallax.emp`'s `.band_disabled`
//    arm: `move.w d4, (a3)`, where d4 is the previous band's Plane-B scroll,
//    seeded 0 for band 0. NOT "skipped", which is what a preview would do if it
//    read `enabled: false` as "not there": the band still owns its rows, it just
//    shows the scroll of its neighbour. `layer()`'s guard 5 in scene_dsl.emp is
//    written from this fact ("a disabled band inherits the PREVIOUS band's
//    scroll words instead of decoding its own factor").
//
// 3. VERTICAL, whole-plane — `Parallax_Step5_Vscroll`:
//        v_factor == 15  ->  Vscroll_BG = v_offset          (.v_locked)
//        otherwise       ->  ((camY - v_center) >> v_factor) + v_offset
//    ⚠ THE LOCK IS WHY MOVING THE FRAME VERTICALLY DOES NOTHING to a locked
//    scene's background, and that is CORRECT, not a missing feature: the lock is
//    what buys the scene its vsplits (scene_dsl.emp's two-writer ruling refuses
//    `At(..)` on an unlocked plane). On an unlocked scene it moves — slowly,
//    which is the whole point of the shift.
//
// 4. THE PLANE->SCREEN ROTATION — `Parallax_Update`'s Step 4a. Band tops reach
//    the ROM as PLANE lines and are rebased to SCREEN lines every frame against
//    the current `Vscroll_BG`: find the last band whose plane top is at or above
//    `vs = Vscroll_BG & 511`, start the screen at THAT band, and walk forward
//    wrapping through the list. This is what makes a band top track the art line
//    for line when the plane scrolls vertically. It is transcribed rather than
//    approximated with a subtraction because the wrap is where the one-line-off
//    class lives (parallax.emp's re-glue note says so at length).
//
// 5. THE CURVE RAMP, per LINE — `Parallax_Step4_Fill`'s `.cap_factor_curve_hoist`
//    (parallax.emp:1189-1277) and its `.lp_curve` line loop (:1841-1906).
//    A `curve: To(..)` layer's Plane-B scroll RAMPS down the strip instead of
//    holding one factor. `curveRampRuns` transcribes both halves; the argument
//    for why this needed no clock, and why it was wrongly booked as if it did,
//    is on that function.
//
// ═══ WHAT THIS DOES NOT REPRODUCE ═══
//
// Stated here, stated by `cameraPreviewPlan` in `absent` for the scene at hand,
// and printed on the canvas — because a preview that quietly differs from the
// ROM is worse than one that says what it leaves out.
//
//   • DEFORM, of every kind — per-band `deform`, scene `deform`, and `v_deform`
//     columns. All three are functions of a FRAME COUNTER, and this pass has no
//     clock by construction (the map's measured zero-idle-repaint property).
//   • TRANSITIONS. `Parallax_Transition_Frames` lerps Plane B's scroll between
//     two configs; the editor is never mid-transition, so this is the engine's
//     own `.snap_b` path — the steady state, which is what an author is judging.
//   • PLANE A, SPRITES, PRIORITY, the HUD. The foreground the map already draws
//     over this composite is the world under the frame, which is the camera's
//     view of Plane A only while the band's `fa` is `FACTOR_1`; nothing here
//     applies `fa`.
//   • The LEFT PARTIAL COLUMN and `left_column_mask`. The composite samples the
//     plane continuously and wraps; it does not model the cell-granular column
//     the VDP fetches at the screen's left edge.

import type { EffectsScene, EffectsLayer, EffectsFactor } from '../../core/formats/effects/scene';
import {
  decodeFactorScroll, factorIsLocked, factorRatioLabel, hscrollWord,
} from '../../core/formats/effects/factor-decode';
import { layerTopSpace, planeLineOf, PLANE_LINE_SPAN } from '../providers/effects-aeon';
import { layerIsEnabled } from './effects-guides';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../../core/model/screen';
import type { FrameRect } from './screen-frame';
import {
  CAMERA_PREVIEW_LABEL_BG as CAPTION_BG,
  CAMERA_PREVIEW_LABEL_TEXT as CAPTION_TEXT,
  CAMERA_PREVIEW_LABEL_WARN as CAPTION_WARN,
} from './canvas-colors';

/**
 * How far one arrow key moves the camera, in world pixels.
 *
 * ⚠ SIXTEEN IS DERIVED, NOT CHOSEN FOR FEEL. It is the camera movement that
 * displaces the SLOWEST published band — `FACTOR_1_16` — by exactly one pixel:
 * `decodeFactorScroll(15, 'FACTOR_1_16')` is 0 and `decodeFactorScroll(16, ...)`
 * is 1, which the decoder's own suite asserts. A coarse step that did not land
 * on that boundary would move the far band by one pixel on some presses and none
 * on others, which is precisely the ambiguity slow parallax is hard to judge
 * through in the first place.
 *
 * `FACTOR_1_32` needs thirty-two and so takes two coarse presses. 16 was taken
 * over 32 deliberately: it makes the COMMON case land on a boundary every press
 * and the rare one every other press, rather than the reverse.
 */
export const CAMERA_KEY_STEP_FINE = 1;
export const CAMERA_KEY_STEP_COARSE = 16;

// ---------------------------------------------------------------------------
// THE CURVE RAMP — transcription 5. See `curveRampRuns`.
// ---------------------------------------------------------------------------

/**
 * A run of consecutive screen rows inside one band that share a scroll value.
 *
 * The ramp is a per-LINE quantity and the draw is a per-RECT blit, so the line
 * values are coalesced into runs. This is not an approximation: two adjacent
 * lines are in one run only when the accumulator produced the SAME word for
 * both, so every row is still drawn at the exact scroll its line has.
 */
export interface CurveRun {
  /** First screen row of the run, absolute (not relative to the band's top). */
  screenTop: number;
  /** How many rows the run covers; always >= 1. */
  rows: number;
  /** Plane-B columns scrolled past the screen's left edge for these rows. */
  scrollX: number;
}

/** `asr.w`/`add.w` sign-extension — the signed word every `.w` here works in. */
function toWord(v: number): number {
  return ((v | 0) << 16) >> 16;
}

/**
 * A curve layer's per-line Plane-B scroll, as runs — `.cap_factor_curve_hoist`
 * plus `.lp_curve`, transcribed.
 *
 * ═══ THIS NEEDED NO CLOCK, AND THE BOOKING THAT SAID IT DID WAS WRONG ═══
 *
 * `viewStore.showCameraPreview` (now `viewStore.parallaxPreview`) said "no
 * curve ramps, no deform (both need a
 * clock this pass does not have)". Deform does: its line loops index a table by
 * `Parallax_Deform_Phase_FG`/`_BG`, which `Parallax_Update` advances by
 * `speed` every frame. A CURVE READS NO SUCH THING. Every input to the hoist is
 * `Camera_X` and the two shadow band tops, and every input to the line loop is
 * the hoist's three parked words plus the line index — measured by reading the
 * whole span `parallax.emp:1189-1277` and `:1841-1906` for a phase or frame
 * reference and finding none. A ramp is a function of POSITION. The map's
 * measured zero-idle-repaint property is therefore not in the way of it, and
 * this file's own booking note (which gave a different and better reason — the
 * truncation, below) is the one that was right about the obstacle.
 *
 * ═══ WHY IT IS A TRANSCRIPTION AND NOT A LERP ═══
 *
 * The obvious shape — `base + (far - base) * i / span` — is off by up to a
 * pixel at nearly every row, and a curve exists precisely for the rows between
 * its ends. Two things make the engine's answer different from a lerp:
 *
 *   • THE ARITHMETIC HAPPENS IN HSCROLL-WORD SPACE, WHICH IS NEGATED. The
 *     engine ramps the buffer word, `-decode`, and floor division is NOT
 *     symmetric under negation: `floor(-7/2)` is -4 while `-floor(7/2)` is -3.
 *     Ramping the un-negated preview scroll would be off by one on exactly the
 *     rows whose division does not divide evenly, and only for ramps of one
 *     sign — the shape of bug that looks like "it is nearly right".
 *     So: convert in, ramp, convert out. `hscrollWord` is the conversion.
 *   • THE REMAINDER IS CARRIED, NOT DROPPED. `divs.w` truncates toward zero and
 *     the engine then normalises the pair to a FLOOR (`add.w d4,d2 / subq.w
 *     #1,d1` when the remainder came back negative), because `.lp_curve`'s
 *     correction is one-directional: `err += rem; if (err >= span) { err -=
 *     span; acc += 1 }`. `step`/`rem` below are that normalised pair, which is
 *     plain floor division and a non-negative remainder.
 *
 * ═══ THE THREE INPUTS, AND WHERE EACH COMES FROM ═══
 *
 *   `baseScrollX`  the band's FLAT scroll, un-negated. The engine seeds the
 *                  accumulator from `Parallax_Shadow_Scroll_B` for the band,
 *                  which is the post-inheritance word — so a DORMANT band
 *                  carrying a curve ramps away from the band above's scroll,
 *                  not from its own `fb`. Passing `bandScrollsX`'s value keeps
 *                  that property instead of re-deriving it and losing it.
 *   `span`         the LAYER's on-screen line span: the next band's screen top
 *                  less this one's, or `SCREEN_HEIGHT` for the last. The engine
 *                  divides by the layer's span and not by a split half, on
 *                  purpose (design §2: "an anchor split inside a curve layer
 *                  CONTINUES the curve"). The plan here is pre-split — one band
 *                  per layer — so the two spans are the same quantity.
 *   `to`           the far-end factor, decoded against the same `camX` the base
 *                  was, then negated: `.curve_to_negate`'s `neg.w`.
 *
 * A span of 0 or less returns `[]` — the engine's `ble .curve_next`, a layer
 * Step 4a clamped off the screen, which emits no lines and so ramps across
 * nothing.
 *
 * ⚠ `to` IS THE SCROLL AT LINE `span`, WHICH IS THE FIRST ROW OF THE NEXT BAND
 * — not a value this layer is made to land on. The accumulator equals
 * `base + spread` after `span` steps; whether the LAST drawn row (`span - 1`)
 * already shows it depends on where the truncation falls, so it sometimes does
 * and sometimes does not. Do not "fix" a ramp that stops one pixel short: a
 * function forced to end exactly on `to` is a different ramp, off by roughly
 * `spread/span` at every row above it, and it is not the one the ROM runs.
 */
export function curveRampRuns(
  camX: number, baseScrollX: number, to: EffectsFactor, screenTop: number, span: number,
): CurveRun[] {
  if (span <= 0) return [];
  // Into the engine's space: the buffer word is the negated scroll.
  const baseW = toWord(-baseScrollX);
  const farW = hscrollWord(camX, to);
  const spread = toWord(farW - baseW);
  // `divs.w` + the normalisation at `.curve_rem_ok` == floor division, with the
  // remainder in [0, span). Written as the result rather than as the two steps.
  const step = Math.floor(spread / span);
  const rem = spread - step * span;

  const runs: CurveRun[] = [];
  let acc = baseW;
  let err = 0;
  for (let i = 0; i < span; i++) {
    // Back out of HScroll-word space. `toWord` and not a bare `-`: it is the
    // same word negation `hscrollWord` applies going in, and it also folds the
    // `-0` a bare negation of a zero accumulator would put in the plan — which
    // reaches a caption as `x=-0` and a JSON report as `-0`.
    const scrollX = toWord(-acc);
    const last = runs[runs.length - 1];
    if (last !== undefined && last.scrollX === scrollX) last.rows++;
    else runs.push({ screenTop: screenTop + i, rows: 1, scrollX });
    acc = toWord(acc + step);                   // acc += whole
    err += rem;                                 // err += remainder
    if (err >= span) { err -= span; acc = toWord(acc + 1); }
  }
  return runs;
}

/** The layer's far-end factor, or null when it authors no curve. */
export function layerCurveTo(layer: Pick<EffectsLayer, 'curve'>): EffectsFactor | null {
  const c = layer.curve;
  return c === undefined || c === 'none' ? null : c.to;
}

/** One horizontal strip of the previewed screen. */
export interface CameraPreviewBand {
  /** Index into `scene.layers`. */
  layer: number;
  /** First screen row this band owns, 0..224. */
  screenTop: number;
  /** One past the last screen row, 0..224. `screenBottom === screenTop` is a band Step 4a clamped off the screen. */
  screenBottom: number;
  /** Plane-B columns scrolled past the screen's left edge — `decode(camX, fb)`. */
  scrollX: number;
  /** Plane-B rows scrolled past the screen's top edge, for THESE rows (a vsplit can change it). */
  vscroll: number;
  /** The band's own `fb`, for the caption. */
  factor: EffectsFactor;
  /** True when this band showed the band above's scroll rather than decoding its own. */
  inherited: boolean;
  /** True when this band's `fb` is the locked factor — it will not move for any camera X. */
  locked: boolean;
  /** Set when a `vsplit` on THIS layer changed `vscroll` from here down. */
  vsplitAt: number | null;
  /**
   * The per-line scroll of a `curve` layer, coalesced into runs — `null` on a
   * flat band, which is every band that authors no curve.
   *
   * `scrollX` above stays the band's FLAT scroll on a curved band too: it is
   * the ramp's seed, it is what the caption reports, and a consumer that does
   * not know about ramps gets the old answer rather than a wrong one.
   */
  ramp: CurveRun[] | null;
}

export interface CameraPreviewPlan {
  /** The camera, in world px — the screen frame's anchor. */
  camX: number;
  camY: number;
  /** Plane-B whole-plane vertical scroll before any vsplit (`Parallax_Step5_Vscroll`). */
  vscrollBase: number;
  /** True when `v_factor` is the lock sentinel — the scene the vsplits need. */
  vLocked: boolean;
  /** The strips, in SCREEN order, top to bottom. */
  bands: CameraPreviewBand[];
  /** Features this scene uses that the composite does not reproduce. Short phrases, for a caption. */
  absent: string[];
}

/**
 * The whole-plane Plane-B vertical scroll — `Parallax_Step5_Vscroll`,
 * transcribed, with `.v_snap` taken (the editor is never mid-transition).
 *
 * ⚠ THE SENTINEL AGAIN, and here it is REACHABLE. Under the lock the answer is
 * `v_offset` and the camera is not consulted at all. Treat 15 as an ordinary
 * shift instead and you get `((camY - v_center) >> 15) + v_offset`, which is
 * `v_offset` while `camY >= v_center` and `v_offset - 1` the moment it is not —
 * a background that slips one row when the camera rises above the scene's
 * centre. `v_center` is authorable above 0 and the camera is authorable below
 * it, so that is not a corner case, it is Tuesday.
 */
export function planeVscroll(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, camY: number,
): number {
  const vo = scene.v_offset ?? 0;
  if (layerTopSpace(scene) === 'screen') return vo;          // .v_locked
  const vc = scene.v_center ?? 0;
  return (word(camY - vc) >> scene.v_factor) + vo;
}

/** Sign-extend to the signed word every `.w` operation in Step 5 works in. */
function word(v: number): number {
  return ((v | 0) << 16) >> 16;
}

/**
 * Step 4a's plane->screen rotation, transcribed.
 *
 * In: each band's PLANE top, in document order, and `vs` (the plane line showing
 * at the screen's top). Out: the bands in SCREEN order, each with the screen row
 * it starts at.
 *
 * The engine's own steps, in its own order: find `k` = the last band whose plane
 * top is `<= vs` (tops ascend, band 0's top is 0); copy from `k` forward,
 * wrapping; band `k` starts at screen row 0 whatever its top was; every other
 * band starts at `top - vs`, plus a whole plane span if that came out `<= 0`
 * (it wrapped past the plane's bottom); and everything is clamped to
 * `SCREEN_HEIGHT`, which is the clamp that stops the per-line filler running off
 * the end of its buffer.
 */
export function rebasePlaneTopsToScreen(
  planeTops: readonly number[], vs: number,
): { source: number; screenTop: number }[] {
  const n = planeTops.length;
  if (n === 0) return [];
  let k = 0;
  for (let probe = 1; probe < n; probe++) {
    if (planeTops[probe] > vs) break;
    k = probe;
  }
  const out: { source: number; screenTop: number }[] = [];
  for (let j = 0; j < n; j++) {
    const source = (k + j) % n;
    let top: number;
    if (j === 0) {
      top = 0;                                   // band k starts at the screen top
    } else {
      top = planeTops[source] - vs;
      if (top <= 0) top += PLANE_LINE_SPAN;      // wrapped past the plane bottom
      if (top > SCREEN_HEIGHT) top = SCREEN_HEIGHT; // off-screen: zero-length fill
    }
    out.push({ source, screenTop: top });
  }
  return out;
}

/**
 * Plane-B scroll per band, in DOCUMENT order, with the dormant-band inheritance
 * `.band_disabled` performs.
 *
 * The seed is 0 and that is the engine's: `moveq #0, d4` before the band loop.
 * (Plane A's seed is `-camX`, not 0 — a disabled band 0 must still hard-lock the
 * FG to the camera. Only Plane B inherits, and only Plane B is drawn here.)
 */
export function bandScrollsX(
  layers: readonly EffectsLayer[], camX: number,
): { scrollX: number; inherited: boolean }[] {
  const out: { scrollX: number; inherited: boolean }[] = [];
  let prev = 0;
  for (const layer of layers) {
    if (layerIsEnabled(layer)) {
      prev = decodeFactorScroll(camX, layer.fb);
      out.push({ scrollX: prev, inherited: false });
    } else {
      out.push({ scrollX: prev, inherited: true });
    }
  }
  return out;
}

/** What this scene asks for that the composite cannot show. See the file docblock. */
export function cameraPreviewAbsences(scene: EffectsScene): string[] {
  const absent: string[] = [];
  // ⚠ NO `curve` LINE HERE ANY MORE, and its removal is the parcel. Ramps are
  // composed per line by `curveRampRuns` — see transcription 5. A stale absence
  // is worse than none: it tells the author the thing on screen is not the
  // thing the ROM would draw, when it now is.
  const sceneDeform = (d: EffectsScene['deform_fg']) => d !== undefined && d !== 'none';
  if (scene.layers.some((l) => l.deform !== undefined && l.deform !== 'none')
    || sceneDeform(scene.deform_fg) || sceneDeform(scene.deform_bg)) {
    absent.push('deform (no clock)');
  }
  if (scene.v_deform !== undefined && scene.v_deform !== 'none') {
    absent.push('v_deform columns (no clock)');
  }
  absent.push('foreground factors, sprites, priority');
  return absent;
}

/**
 * The whole plan: which screen rows show which of Plane B, for a camera here.
 *
 * `camX`/`camY` are WORLD pixels — the screen frame's anchor, which
 * `ScreenFrameAnchor` documents as "the camera's unbiased edge". They are the
 * camera, not the editor's pan; that is the whole model, and it is the owner's
 * ("the screen frame IS the camera").
 */
export function cameraPreviewPlan(scene: EffectsScene, camX: number, camY: number): CameraPreviewPlan {
  const vLocked = layerTopSpace(scene) === 'screen';
  const vscrollBase = planeVscroll(scene, camY);
  const layers = scene.layers;

  const planeTops = layers.map((l) => planeLineOf(scene, l.world_y).line);
  const scrolls = bandScrollsX(layers, camX);
  // `& (PLANE_LINE_SPAN - 1)` is the engine's `and.w #PLANE_B_SPAN-1`, and it is
  // an AND rather than a remainder on purpose: it gives the POSITIVE residue for
  // a negative Vscroll_BG, which `%` in JS would not.
  const vs = vscrollBase & (PLANE_LINE_SPAN - 1);
  const rotated = rebasePlaneTopsToScreen(planeTops, vs);

  const bands: CameraPreviewBand[] = [];
  // The vertical split walks the SCREEN order, because that is the order the
  // raster fires in: `At(v)` is "from this layer's top DOWN".
  //
  // ONLY UNDER THE LOCK. `scene()`'s two-writer guard refuses a vsplit on a
  // scene whose Plane B tracks the camera vertically, so an unlocked scene
  // carrying one does not build at all — there is no in-game appearance for the
  // preview to imitate, and applying it anyway would invent one.
  //
  // ⚠ AND ONLY WITHOUT A V DEFORM, WHICH IS THE SAME ARGUMENT AND WAS MISSING.
  // The two-writer ruling is TWO ensures, not one: `scene()` refuses a vsplit
  // beside `SceneVDeform.Columns` as flatly as it refuses one on an unlocked
  // plane, because in per-column mode VSRAM entry 1 is column 0's Plane B rather
  // than the plane. So a scene with `v_factor: 15` AND a `v_deform` was drawing a
  // full-width split across the whole preview for a document that does not
  // build — the exact invention the paragraph above forbids, arrived at by
  // transcribing one half of a guard whose halves sit on different fields.
  //
  // ⚠ NOT DRAWN AS ONE COLUMN EITHER, and that is the point rather than a
  // shortcut. There is no in-game appearance to imitate: the build refuses the
  // scene, so the sliver never renders. Painting one would be a picture of a ROM
  // that cannot exist, which is worse than the full-width lie it replaces.
  // `sceneDeformAdvisories`, the layer card's `vsplitVDeformAdvisoryParts` and
  // the raster strip's `splitRefusal` all say WHY the split is not here; a
  // preview is not the surface to explain a build refusal on.
  const vDeformOn = scene.v_deform !== undefined && scene.v_deform !== 'none';
  let vscroll = vscrollBase;
  for (let j = 0; j < rotated.length; j++) {
    const { source, screenTop } = rotated[j];
    const screenBottom = j + 1 < rotated.length
      ? Math.max(screenTop, rotated[j + 1].screenTop)
      : SCREEN_HEIGHT;
    const layer = layers[source];
    const split = vLocked && !vDeformOn && layer.vsplit !== undefined && layer.vsplit !== 'none'
      ? layer.vsplit.at : null;
    if (split !== null) vscroll = split;
    // TRANSCRIPTION 5. The span is the band's own screen extent, which on this
    // pre-split plan IS the layer's — the quantity the engine's hoist divides
    // by. `scrollX` is passed as the seed because it already carries the
    // dormant-band inheritance the engine's shadow scroll word carries.
    const curveTo = layerCurveTo(layer);
    const ramp = curveTo === null ? null
      : curveRampRuns(camX, scrolls[source].scrollX, curveTo, screenTop, screenBottom - screenTop);
    bands.push({
      layer: source,
      screenTop,
      screenBottom,
      scrollX: scrolls[source].scrollX,
      vscroll,
      ramp: ramp !== null && ramp.length > 0 ? ramp : null,
      factor: layer.fb,
      inherited: scrolls[source].inherited,
      locked: factorIsLocked(layer.fb),
      vsplitAt: split,
    });
  }

  return { camX, camY, vscrollBase, vLocked, bands, absent: cameraPreviewAbsences(scene) };
}

/**
 * One band's caption line: `L2 FACTOR_1_16 (1/16) x=+20`.
 *
 * A CURVED BAND READS `x=+20..+43 ramp` — the scroll its FIRST row gets and the
 * scroll its LAST row gets, both taken off the runs the draw actually blitted.
 * Not `curve.to`'s decode: that value lands one line past this band (see
 * `curveRampRuns`), so printing it would name a number no row on screen shows.
 */
export function bandCaption(b: CameraPreviewBand): string {
  const f = typeof b.factor === 'string' ? b.factor : `packed(${b.factor.s1},${b.factor.s2},${b.factor.op})`;
  const ratio = factorRatioLabel(b.factor);
  const x = b.ramp === null ? signed(b.scrollX)
    : `${signed(b.ramp[0].scrollX)}..${signed(b.ramp[b.ramp.length - 1].scrollX)} ramp`;
  return `L${b.layer} ${f} (${ratio}) x=${x}`
    + (b.inherited ? ' [inherited]' : '')
    + (b.vsplitAt !== null ? ` v=${b.vsplitAt}` : '');
}

/** `+20` / `-3` — a scroll with an explicit sign, so a ramp's two ends line up. */
function signed(v: number): string {
  return v < 0 ? `${v}` : `+${v}`;
}

// ---------------------------------------------------------------------------
// The draw. Nothing here decides anything the plan did not.
// ---------------------------------------------------------------------------

/** A Plane-B source: a canvas holding the plane at world origin, its pixel size. */
export interface PlaneSource {
  image: CanvasImageSource;
  pixelWidth: number;
  pixelHeight: number;
}

export interface CameraPreviewDrawOptions {
  /** Draw the per-band captions and the absence line. */
  captions?: boolean;
}

/**
 * Blit the plan into `frame` (the screen frame's canvas rect).
 *
 * ⚠ THE WRAP IS DONE WITH FOUR SUB-BLITS, NOT WITH A MODULO ON THE DESTINATION.
 * A band's 320-px window can straddle the plane's right edge AND its bottom
 * edge at once, so each strip is up to two columns by two rows of source rect.
 * Doing it any other way needs a repeating pattern fill, which cannot be told
 * `imageSmoothingEnabled = false` reliably across the two canvas backends this
 * app runs on.
 *
 * Sources are drawn in the order given, source-over, so the caller passes the
 * plane first and the BgAnim band overlay second — the same order
 * `MapViewport` paints them in on the map itself.
 */
export function drawCameraPreview(
  ctx: CanvasRenderingContext2D,
  frame: FrameRect,
  zoom: number,
  plan: CameraPreviewPlan,
  sources: readonly PlaneSource[],
  opts: CameraPreviewDrawOptions = {},
): number {
  if (sources.length === 0) return 0;
  let blits = 0;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();

  for (const band of plan.bands) {
    const rows = band.screenBottom - band.screenTop;
    if (rows <= 0) continue;
    // A FLAT BAND IS ONE RUN, so the two cases are one loop and the flat path
    // issues exactly the blits it did before this parcel. A curved band's runs
    // partition the same rows — `curveRampRuns` emits `span` lines' worth — so
    // no row is drawn twice and none is skipped.
    const runs: readonly CurveRun[] = band.ramp
      ?? [{ screenTop: band.screenTop, rows, scrollX: band.scrollX }];
    for (const run of runs) {
      for (const src of sources) {
        const pw = src.pixelWidth;
        const ph = src.pixelHeight;
        if (pw <= 0 || ph <= 0) continue;
        const sx0 = mod(run.scrollX, pw);
        // `vscroll` is the BAND's — a curve ramps the horizontal scroll only,
        // so the vertical source row still walks continuously down the strip.
        const sy0 = mod(run.screenTop + band.vscroll, ph);
        // Column split at the plane's right edge, row split at its bottom edge.
        const xs = spans(sx0, SCREEN_WIDTH, pw);
        const ys = spans(sy0, run.rows, ph);
        for (const xr of xs) {
          for (const yr of ys) {
            ctx.drawImage(
              src.image,
              xr.src, yr.src, xr.len, yr.len,
              frame.x + xr.off * zoom,
              frame.y + (run.screenTop + yr.off) * zoom,
              xr.len * zoom, yr.len * zoom,
            );
            blits++;
          }
        }
      }
    }
  }

  if (opts.captions !== false) drawCameraPreviewCaptions(ctx, frame, zoom, plan);
  ctx.restore();
  return blits;
}

/** `a mod n`, always non-negative. */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * A run of `len` source pixels starting at `start` in a plane `span` wide,
 * split where it crosses the plane's edge. One entry, or two.
 */
function spans(start: number, len: number, span: number): { src: number; off: number; len: number }[] {
  const out: { src: number; off: number; len: number }[] = [];
  let off = 0;
  let remaining = len;
  let src = start;
  while (remaining > 0) {
    const take = Math.min(remaining, span - src);
    out.push({ src, off, len: take });
    off += take;
    remaining -= take;
    src = 0;
  }
  return out;
}

function drawCameraPreviewCaptions(
  ctx: CanvasRenderingContext2D, frame: FrameRect, zoom: number, plan: CameraPreviewPlan,
): void {
  ctx.font = '9px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (const band of plan.bands) {
    if (band.screenBottom - band.screenTop <= 0) continue;
    const y = frame.y + band.screenTop * zoom + 7;
    if (y < frame.y || y > frame.y + frame.h) continue;
    const text = bandCaption(band);
    const w = ctx.measureText(text).width;
    ctx.fillStyle = CAPTION_BG;
    ctx.fillRect(frame.x + 2, y - 6, w + 6, 12);
    ctx.fillStyle = band.locked ? CAPTION_WARN : CAPTION_TEXT;
    ctx.fillText(text, frame.x + 5, y);
  }
  // ⚠ THE ABSENCE LINE IS NOT OPTIONAL CHROME. Inside this rectangle the app is
  // making a claim about what the ROM would show; the line is the boundary of
  // that claim, and it is on the canvas rather than only in a doc because the
  // author reading the rectangle is the person the claim is made to.
  const note = `preview: Plane B only — no ${plan.absent.join('; no ')}`;
  const w = ctx.measureText(note).width;
  const by = frame.y + frame.h - 8;
  ctx.fillStyle = CAPTION_BG;
  ctx.fillRect(frame.x + 2, by - 6, w + 6, 12);
  ctx.fillStyle = CAPTION_WARN;
  ctx.fillText(note, frame.x + 5, by);
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// reason effects-guides.ts's report block states at length.
// ---------------------------------------------------------------------------

export interface CameraPreviewReport {
  active: boolean;
  sceneId: string | null;
  camX: number | null;
  camY: number | null;
  vscrollBase: number | null;
  vLocked: boolean | null;
  bands: CameraPreviewBand[];
  absent: string[];
  /** How many `drawImage` calls the composite issued; 0 with no plane loaded. */
  blits: number;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

let lastReport: CameraPreviewReport = {
  active: false, sceneId: null, camX: null, camY: null, vscrollBase: null, vLocked: null,
  bands: [], absent: [], blits: 0, paints: 0,
};

export function publishCameraPreviewReport(r: Omit<CameraPreviewReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastCameraPreviewReport(): CameraPreviewReport {
  return lastReport;
}
