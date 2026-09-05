// WHERE THE BACKGROUND STARTS OVER — the act axis, the plane axis, and the one
// place they are commensurable.
//
// ═══ THE ARITHMETIC, AND THE AXIS TRAP THAT MADE THIS ROW WRONG TWICE ═══
//
// Three numbers get compared in conversations about this and NO TWO OF THEM ARE
// ON THE SAME AXIS. Written out once, here, so the next reader does not have to
// re-derive which is which:
//
//   64      PLANE CELLS. `BG_WIDTH` (bg-tiles.ts) is the Plane-B nametable's
//           width in 8-px cells, and `BG_LAYOUT_WORDS / BG_WIDTH` is its height
//           in the same unit. Both are 64 (aeon `PLANE_H_CELLS` =
//           `PLANE_V_CELLS` = 64, engine/system/constants.emp).
//
//   512     PLANE PIXELS. `64 * TILE_WIDTH_PX`, on both axes —
//           `PLANE_COLUMN_SPAN` here, `PLANE_LINE_SPAN` in effects-aeon. This is
//           the modulus: the VDP fetches a Plane-B column/row index mod 512, so
//           the picture repeats every 512 px OF PLANE, always, unconditionally.
//
//   2048    WORLD PIXELS. `SECTION_PIXEL_SIZE`, aeon's `SECTION_SIZE = $800`.
//           An act is `grid_w x grid_h` of these. It is a FOREGROUND extent and
//           it has nothing whatever to do with the plane's 512.
//
// A world pixel and a plane pixel are different units, and the exchange rate is
// the PARALLAX FACTOR — which is per-band horizontally and per-scene vertically.
// So "the background wraps every N px" has no answer until you say which axis N
// is on, and a comparison of 2048 against 512 (or against 64) is not an
// arithmetic error, it is a category error: it answers confidently and wrongly.
//
// ⚠ THE NUMBER THE QUEUE ROW CARRIED — "the background image wraps 2,048 px
// before the act ends" — IS 2,048 WORLD PIXELS ON THE VERTICAL AXIS, AND IT IS
// NOT A WRAP WIDTH. It comes from the BG capability survey's row 11
// (docs/reviews/2026-08-26-bg-capability-survey-s1-s2-s3k.md), which says: a
// 512-px plane covers an act of at most `512 << v_factor_bg`, and OJZ act 1
// (6,144 px tall at v_factor 3, ceiling 4,096) is 2,048 px past it. That 2,048
// is `act_height - ceiling` — an OVERSHOOT — and it coincides numerically with
// `SECTION_PIXEL_SIZE` by accident, which is exactly why it reads as a wrap
// width. The wrap PERIOD on the vertical axis is `512 << v_factor` world px
// (4,096 here), and the seam lands at the camera Y this file computes.
//
// ═══ WHAT THIS FILE ANSWERS ═══
//
//   HORIZONTAL, per band  — `bandReach`. The camera-X positions at which that
//   band's Plane-B scroll crosses a whole plane width, i.e. where its picture
//   starts over. REPETITION HERE IS THE DESIGN, not a defect: survey row 19,
//   "every background layer must be periodic at 512 px horizontally", because
//   Plane B is blitted once at level load and only scrolled. So this half
//   produces a READOUT and never a warning — a warning every scene earns is a
//   warning nobody reads.
//
//   VERTICAL, whole plane — `verticalReach`. Same arithmetic through
//   `planeVscroll`, but the verdict is different: 18 of aeon's 20 shipped scenes
//   and BOTH of Aurora's are `v_factor 15` (locked) and cannot wrap at all, and
//   the one configuration that did wrap was a measured defect (aeon d-31, seam
//   witnessed on the running ROM at camY 61). So this half DOES produce an
//   advisory — one that is silent on every scene that exists today, silent on
//   every locked scene forever, and silent on any act whose `v_factor` has room
//   for it. It speaks only when the plane genuinely runs out of picture.
//
// ═══ NOTHING HERE IS A PREVENTION ═══
//
// No clamp, no refusal, nothing that stops a document saving. Same rule the
// vsplit and fire-line advisories run under (ROADMAP row 58): the author is
// told, and the author decides.

import type { EffectsScene, EffectsFactor, EffectsLayer } from '../../core/formats/effects/scene';
import { decodeFactorScroll, factorIsLocked, factorRatioLabel } from '../../core/formats/effects/factor-decode';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
import { TILE_WIDTH_PX } from '../../core/formats/bg-override/bg-override';
import { SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../../core/model/screen';
import { EFFECTS_V_FACTOR_LOCK } from '../../core/formats/effects/scene-ui';
import { PLANE_LINE_SPAN, layerTopSpace } from '../providers/effects-aeon';
import { planeVscroll } from './camera-preview';
import { layerIsEnabled } from './effects-guides';

/**
 * The Plane-B HORIZONTAL span in pixels — the modulus the VDP wraps a Plane-B
 * column in, and the distance a band's picture repeats over.
 *
 * DERIVED THE WAY `PLANE_LINE_SPAN` IS (its vertical twin, effects-aeon.ts):
 * `BG_WIDTH` cells of `TILE_WIDTH_PX` each. Aeon's own statement is
 * `PLANE_H_CELLS = 64` beside `PLANE_V_CELLS = 64` in engine/system/constants.emp
 * — ONE VDP register sizes both planes, which is why the two spans are equal and
 * why they must still be spelled separately: they are different axes, and a
 * consumer that reached for the vertical one horizontally would be right by
 * coincidence and wrong the day the register changes.
 */
export const PLANE_COLUMN_SPAN: number = BG_WIDTH * TILE_WIDTH_PX;

/**
 * The act's extent and the camera's travel across it, in WORLD pixels.
 *
 * `extent = grid * SECTION_PIXEL_SIZE`. `travel = extent - screen`, because the
 * engine clamps the camera to `[0, extent - SCREEN_WIDTH]` (aeon camera.emp; the
 * clamp is what Aurora's SCREEN_* constants are transcribed for). TRAVEL, not
 * extent, is what decides a wrap: the camera never reaches the last screenful of
 * world, so the plane is never asked for the scroll that extent would imply.
 *
 * The distinction is not cosmetic. For OJZ act 1 (3x3) it is 6,144 vs 5,920 on
 * Y, and the survey's headline "2,048 px past the ceiling" is the EXTENT form of
 * a quantity whose travel form is 1,824. Both are true statements about
 * different things; only the travel one predicts where the seam lands.
 *
 * `Math.max(0, ...)` because an act smaller than one screen has no travel at
 * all — aeon's `ensure(GRID_W >= 1 && GRID_H >= 1)` guards the negative extent
 * but a 1-section act on a hypothetical smaller section size would still floor
 * here rather than report negative travel.
 */
export interface ActReach {
  extentX: number;
  extentY: number;
  travelX: number;
  travelY: number;
}

export function actReach(act: { gridWidth: number; gridHeight: number }): ActReach {
  const extentX = act.gridWidth * SECTION_PIXEL_SIZE;
  const extentY = act.gridHeight * SECTION_PIXEL_SIZE;
  return {
    extentX,
    extentY,
    travelX: Math.max(0, extentX - SCREEN_WIDTH),
    travelY: Math.max(0, extentY - SCREEN_HEIGHT),
  };
}

/**
 * The smallest camera X in `[0, hi]` whose Plane-B scroll reaches `target`, or
 * `null` when it never does inside that range.
 *
 * ⚠ BINARY SEARCH, WHICH ASSUMES `decodeFactorScroll` IS NON-DECREASING IN
 * `camX`, AND THAT ASSUMPTION IS ASSERTED RATHER THAN BELIEVED. It is not
 * obvious: the two-term factors are `(camX >> s1) - (camX >> s2)`, a difference
 * of two step functions, and a difference of monotone functions is not generally
 * monotone. It holds here because every published two-term factor has
 * `s1 < s2`, so the subtracted term steps no more often than the added one —
 * and `bg-wrap.test.ts` walks the whole published set over the whole legal
 * camera range and fails if any step goes backwards. A custom packed factor with
 * `s1 >= s2` and `op: 1` has a zero or negative ratio; it never reaches a
 * positive target, the guard below returns `null`, and the search is not
 * entered.
 *
 * The domain is bounded by the engine, not chosen: aeon asserts
 * `(GRID_W << SECTION_SIZE_SHIFT) <= $8000` on both axes
 * (games/sonic4/data/levels/ojz/act1/act_descriptor.emp), so a camera X is
 * always inside the signed word `decodeFactorScroll` works in and the `toWord`
 * fold at the top of that function never fires for a legal act. `CAMERA_X_MAX`
 * states that bound so the search cannot be handed a `hi` that would.
 */
export const CAMERA_WORD_MAX = 0x7FFF;

function firstCamXAtScroll(f: EffectsFactor, target: number, hi: number): number | null {
  const top = Math.min(hi, CAMERA_WORD_MAX);
  if (top < 0 || decodeFactorScroll(top, f) < target) return null;
  let lo = 0;
  let high = top;
  while (lo < high) {
    const mid = (lo + high) >> 1;
    if (decodeFactorScroll(mid, f) >= target) high = mid; else lo = mid + 1;
  }
  return lo;
}

/** One band's horizontal repeat behaviour across one act. */
export interface BandReach {
  /** Index into `scene.layers`. */
  layer: number;
  /** The band's own `fb`, as read. */
  factor: EffectsFactor;
  /** True when `fb` is the lock sentinel: the picture never moves, so it never repeats. */
  locked: boolean;
  /**
   * True when the layer is disabled. The engine's `.band_disabled` arm makes it
   * show the PREVIOUS band's scroll (`move.w d4, (a3)`), so these numbers
   * describe what its `fb` WOULD do, not what the screen shows.
   */
  dormant: boolean;
  /**
   * The camera-X positions at which this band's picture starts over — where its
   * Plane-B scroll first reaches 512, 1024, 1536 … inside the act's travel.
   * Empty when the band does not complete a single plane width across the act.
   */
  wrapCamXs: number[];
  /**
   * `wrapCamXs[0]` — the camera travel one full repeat costs — or `null` when
   * there is none inside the act. NOT `512 / ratio`: the decode truncates each
   * term separately, so the exact first crossing can differ from the fraction.
   */
  periodPx: number | null;
}

/** One band's reach, given the act's horizontal camera travel. */
export function bandReach(
  layer: Pick<EffectsLayer, 'fb' | 'enabled'>, index: number, travelX: number,
): BandReach {
  const factor = layer.fb;
  const locked = factorIsLocked(factor);
  const wrapCamXs: number[] = [];
  if (!locked) {
    for (let n = 1; ; n++) {
      const at = firstCamXAtScroll(factor, n * PLANE_COLUMN_SPAN, travelX);
      if (at === null) break;
      wrapCamXs.push(at);
    }
  }
  return {
    layer: index,
    factor,
    locked,
    dormant: !layerIsEnabled(layer),
    wrapCamXs,
    periodPx: wrapCamXs.length > 0 ? wrapCamXs[0] : null,
  };
}

/** Every band's reach, in scene order. */
export function sceneBandReaches(
  scene: Pick<EffectsScene, 'layers'>, travelX: number,
): BandReach[] {
  return scene.layers.map((l, i) => bandReach(l, i, travelX));
}

/**
 * One band's repeat, as a clause for the `fb` field's tooltip.
 *
 * IN THE TOOLTIP AND NOT ON THE ROW, deliberately. Horizontal repetition is
 * every band's normal behaviour, so a visible line per layer would add height to
 * every layer card of every scene to say something true of nearly all of them —
 * which is the shape ROADMAP O15 spent a whole parcel removing from this panel.
 * The tooltip costs no height and sits on the control that decides the number.
 */
export function bandReachClause(r: BandReach, travelX: number): string {
  if (r.locked) return 'locked, so its picture never moves and never repeats';
  const dormancy = r.dormant
    ? ' (this layer is disabled, so it shows the band above\'s scroll instead)' : '';
  // "1 of camera speed" is not English, and FACTOR_1 is the default a new
  // scene's first layer carries — so the one case an author meets first would
  // have read worst.
  const label = factorRatioLabel(r.factor);
  const speed = label === '1' ? 'at camera speed' : `at ${label} of camera speed`;
  if (r.periodPx === null) {
    return `${speed}: its ${PLANE_COLUMN_SPAN}px picture does not finish one pass across this `
      + `act's ${travelX}px of camera travel`
      + dormancy;
  }
  const times = r.wrapCamXs.length;
  return `${speed}: its ${PLANE_COLUMN_SPAN}px picture starts over every ${r.periodPx}px of `
    + `camera travel, ${times} time${times === 1 ? '' : 's'} across this act's ${travelX}px`
    + dormancy;
}

/** The whole plane's vertical repeat behaviour across one act. */
export interface VerticalReach {
  /** True when `v_factor` is the lock sentinel — the plane ignores the camera. */
  locked: boolean;
  /**
   * The camera travel a 512-px plane covers at this shift: `PLANE_LINE_SPAN <<
   * v_factor`. `null` when locked (the plane covers any act).
   */
  ceilingPx: number | null;
  /** The act's vertical camera travel, as handed in. */
  travelPx: number;
  /** `vscroll(travel) - vscroll(0)` — plane rows the camera actually drags past. */
  scrollSpanPx: number;
  /** The camera Y at which the plane first starts over, or `null` when it never does. */
  wrapCamY: number | null;
  /**
   * True when the travel handed in is past the signed-word camera the engine
   * works in, so everything above describes only the first `CAMERA_WORD_MAX` px
   * of it.
   *
   * ⚠ LOUD RATHER THAN QUIETLY CLAMPED. `planeVscroll` sign-extends `camY` to a
   * word (`Parallax_Step5_Vscroll` is `.w` throughout), so a travel past $7FFF
   * folds to a small or negative camera and the search comes back "no wrap" —
   * a FALSE NEGATIVE that looks exactly like a background with room to spare.
   * aeon asserts `(GRID_H << SECTION_SIZE_SHIFT) <= $8000` so no legal act can
   * reach here, which is precisely why an unguarded version would never be
   * caught: the flag exists so the day something does reach it, it says so.
   */
  beyondCameraWord: boolean;
  /** Camera travel remaining after that first seam — the act shown past the repeat. */
  pastWrapPx: number;
  /** The smallest larger `v_factor` whose span fits inside the plane, or `null` when none does. */
  fittingVFactor: number | null;
}

/**
 * The whole-plane vertical reach — `Parallax_Step5_Vscroll` evaluated at both
 * ends of the camera's travel.
 *
 * ⚠ IT EVALUATES `planeVscroll` RATHER THAN DIVIDING BY `2^v_factor`. The engine
 * is `((camY - v_center) >> v_factor) + v_offset` and the shift is `asr.w`, so
 * `v_center` shifts the PHASE of the seam: two scenes with the same factor and
 * the same act can put the seam a row apart. Re-deriving it as a ratio would be
 * a second opinion about an engine rule that already has one function.
 *
 * `ceilingPx` is the readable form of the same fact and is offered for the
 * REMEDY sentence, not for the verdict: the verdict is `wrapCamY !== null`,
 * which is measured.
 */
export function verticalReach(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, travelPx: number,
): VerticalReach {
  const locked = layerTopSpace(scene) === 'screen';
  const reach = Math.min(travelPx, CAMERA_WORD_MAX);
  const base = planeVscroll(scene, 0);
  const scrollSpanPx = planeVscroll(scene, reach) - base;
  const wrapCamY = locked ? null : firstCamYAtScroll(scene, base + PLANE_LINE_SPAN, reach);
  return {
    locked,
    ceilingPx: locked ? null : PLANE_LINE_SPAN << scene.v_factor,
    travelPx,
    scrollSpanPx,
    wrapCamY,
    beyondCameraWord: travelPx > CAMERA_WORD_MAX,
    pastWrapPx: wrapCamY === null ? 0 : reach - wrapCamY,
    fittingVFactor: wrapCamY === null ? null : fittingVFactor(scene, reach),
  };
}

/**
 * The smallest camera Y in `[0, hi]` whose plane vscroll reaches `target`.
 *
 * `planeVscroll` is `(camY - v_center) >> v_factor` plus a constant, monotone
 * non-decreasing in `camY` for any single shift count — no two-term subtraction
 * on this axis, so unlike the horizontal search this one needs no caveat.
 */
function firstCamYAtScroll(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, target: number, hi: number,
): number | null {
  if (hi < 0 || planeVscroll(scene, hi) < target) return null;
  let lo = 0;
  let high = hi;
  while (lo < high) {
    const mid = (lo + high) >> 1;
    if (planeVscroll(scene, mid) >= target) high = mid; else lo = mid + 1;
  }
  return lo;
}

/**
 * The smallest `v_factor` above this scene's own that does not wrap across the
 * act, or `null` when none in the schema's range fits.
 *
 * SEARCHED WITH THE SAME FUNCTION THAT PRODUCED THE VERDICT, so the remedy
 * cannot recommend a shift that would still wrap. The upper bound is the value
 * below the lock sentinel: raising to the sentinel itself is a different remedy
 * (it locks the plane, which changes what the layer tops MEAN — see
 * `layerTopSpace`) and is not offered as a drop-in.
 */
function fittingVFactor(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, travelPx: number,
): number | null {
  for (let vf = scene.v_factor + 1; vf < EFFECTS_V_FACTOR_LOCK; vf++) {
    const probe = { ...scene, v_factor: vf };
    if (firstCamYAtScroll(probe, planeVscroll(probe, 0) + PLANE_LINE_SPAN, travelPx) === null) {
      return vf;
    }
  }
  return null;
}

/**
 * The advisory for a background that runs out of picture before the act runs out
 * of camera — or `null`, which is the answer for every scene that ships today.
 *
 * ═══ WHY THIS ONE IS A WARNING AND THE HORIZONTAL ONE IS NOT ═══
 *
 * Horizontal repetition is the design (survey row 19). Vertical repetition is
 * not: 18 of aeon's 20 scenes and both of Aurora's are vertically LOCKED and
 * cannot wrap, and the single scene that did wrap was a defect measured on the
 * running ROM — aeon d-31, "witnessed: camY 61 -> scroll -57 -> VDP row 455;
 * predicted seam 57 px down and confirmed by a background-only capture". A sky
 * that reappears below the ground is not a texture, it is a tear.
 *
 * ⚠ SO THIS FIRES ON NOTHING TODAY, AND THAT IS THE POINT, NOT A DEFECT IN IT.
 * It is silent on every locked scene (`v_factor 15`) forever, and silent on any
 * unlocked scene whose factor has room for its act. What it catches is the
 * gesture that has no feedback at all right now: an author drops `V factor` off
 * the lock — a control this panel offers, with a spinner, with no sign that the
 * act's height is even a consideration — and the background silently acquires a
 * seam they will not see until the ROM runs. `bg-wrap.test.ts` proves it stays
 * silent on both shipped fixtures AND speaks on the configuration aeon measured,
 * because an advisory that is quiet everywhere and a deleted advisory look
 * identical from the outside.
 */
export function verticalWrapAdvisory(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, travelPx: number,
): string | null {
  const r = verticalReach(scene, travelPx);
  if (r.wrapCamY === null) return null;
  const remedy = r.fittingVFactor === null
    ? 'No larger shift fits either, so the art has to join top to bottom for the seam to be invisible.'
    : `Either raise v_factor to ${r.fittingVFactor} (the background moves less, and `
      + `${PLANE_LINE_SPAN << r.fittingVFactor}px of travel fits) or make the art join top to `
      + 'bottom so the seam is invisible.';
  const capped = r.beyondCameraWord
    ? ` (this act travels past the ${CAMERA_WORD_MAX}px signed-word camera the engine works in, `
      + 'so these figures describe only the part of it this model can see)' : '';
  return `Plane B's vertical scroll tracks the camera (v_factor ${scene.v_factor}), and a `
    + `${PLANE_LINE_SPAN}px plane covers ${r.ceilingPx}px of camera travel at that shift. `
    + `This act travels ${r.travelPx}px${capped}, so the background starts over at camera Y `
    + `${r.wrapCamY} and the last ${r.pastWrapPx}px of the act are drawn over the seam. ${remedy}`;
}
