// ═══ WHAT A PARALLAX CURVE ACTUALLY BREAKS, AND WHY THIS FILE REPLACED A ROW
//     THAT NAMED THE WRONG VARIABLE ═══
//
// Aurora shipped `curveDescendingAdvisory` on 2026-09-05 telling an author that
// a DESCENDING Plane-B curve garbles the background, on the strength of aeon's
// `df3b8810` bisect. **aeon refuted the direction on 2026-09-06** and this
// module is the re-pointing their own witness asked for:
//
//     aeon `92663a53` (an ancestor of aeon origin/master), subject:
//     "merge(curve-desc): there is no engine defect, and the DIRECTION in the
//      row's own name is refuted."
//
//     `docs/witness/curve-desc-2026-09-06.md` §4: an ASCENDING mirror of the
//     same span and |spread| garbles, and a small DESCENDING curve is clean.
//     §7 item 5 asks Aurora by name: "Aurora's `curveDescendingAdvisory` needs
//     re-pointing, not deleting."
//
// So direction is out. What is in is a MAGNITUDE, and aeon has TWO live
// readings of it. This module implements the one their later measurement
// favours and refuses to pretend the other is closed.
//
// ═══ THE TWO READINGS, AS AEON LEAVES THEM ═══
//
//   RATE — the per-scanline Plane-B scroll step, `excursion / (span - 1)`.
//   Severity tracks it monotonically with art and control held fixed
//   (`docs/witness/depth-onset-2026-09-06.md` §5: 1.97 px/line a mild slant,
//   4.0 stronger, 16.0 and 22.2 destroyed).
//
//   EXCURSION — the band's total Plane-B travel against the plane's wrap
//   margin, above which a plane column is shown twice in one band. That
//   threshold is GEOMETRY, derived before the runs rather than fitted, and it
//   stays true as geometry.
//
// **NEITHER IS SEPARATED FROM THE OTHER**, because `excursion = rate x span`
// and every band aeon has driven holds its span nearly fixed (sec7: one 224-line
// band; the section-4 showcase: 48 and 64 lines, a ratio of 4/3). aeon's
// `depth-onset` §5.2 names the fixture that would settle it — one scene with
// curve bands of span 64 and 192 at matched rate — and it is unbuilt.
//
// WHAT MOVED THE ARGUMENT TOWARD RATE, and it is a measurement rather than a
// preference: the first matched-rate comparison ever run (`depth-onset` §5,
// band 160 at 1.31x the wrap margin against band 112 at 0.98x, both at 4.0
// px/line, each against its own per-camera control) finds the two
// **indistinguishable**. So the excursion threshold no longer accounts for the
// visible break even though it remains true as geometry.
//
// ⚠ THIS MODULE THEREFORE COMPARES A RATE AND SAYS THE CONFOUND IS OPEN. Not
// "the mechanism is unestablished" — that understates a monotone severity
// ladder measured against controls. Not "aeon measured that rate is the cause"
// — that overstates it, because the experiment that would separate rate from
// excursion has not been built. The advisory's own words carry the middle
// position, and `test/formats/aeon-curve-rate-drift.test.ts` reddens if aeon's
// artifact stops saying it.
//
// ═══ NOTHING HERE IS A PREVENTION ═══
//
// aeon states outright that there is no engine defect (`92663a53`: "Zero engine
// bytes"), the walker's ramp is arithmetically exact in both directions, and no
// build refuses any of this. A control Aurora greyed on a rate would be a bound
// this repo invented on top of a rule that has already changed twice in a day.
// Same posture, same reason, as `rowRemapReachAdvisory` and `fireLineAdvisory`:
// a sentence, and the document still saves.

import { decodeFactorScroll, factorRatio } from './factor-decode';
import type { EffectsFactor } from './scene';
import { SCREEN_HEIGHT } from '../../model/screen';

/**
 * One arm of aeon's sec7 bisect: an authored curve, and what the machine did.
 *
 * ⚠ ONLY `excursionPx` AND `garbled` ARE TRANSCRIBED. The span is NOT typed
 * here — every arm covered the whole screen (`curve-desc` §6: the rotation
 * collapse gives that scene exactly one full-screen band, and aeon's probe
 * carries `LINES = 224`), so it is `SCREEN_HEIGHT`, which this repo already
 * derives from aeon's own `engine/system/constants.emp`. And the RATES are not
 * typed either: they are `excursionPx / (spanLines - 1)` below, which is
 * `depth_onset_probe.py`'s own `rate_mean` (`e / (len(seg) - 1)`).
 */
export interface CurveRateArm {
  /** aeon's name for the arm, as printed in its own tables. */
  name: string;
  /** Plane-B HScroll travel over the band, in pixels, at the arm's camera. */
  excursionPx: number;
  /** What the frame looked like against a curve-free control. */
  garbled: boolean;
}

/**
 * THE TWO ARMS THAT BRACKET THE ONSET, transcribed from aeon at a committed
 * revision and re-read on every run by `test/formats/aeon-curve-rate-drift.test.ts`.
 *
 * Source: aeon `docs/DEFERRED_WORK.md`, the CURVE-DESC entry's five-arm table,
 * and the same two figures in `tools/depth_onset_probe.py`'s module docblock
 * ("clean at excursion 176 / rate 0.79; garbled at excursion 353 / rate 1.58").
 * The other three arms (`flat` 0, `desc` 1060, `asc` 1061) are not carried
 * because they bracket nothing: one is the control and two are far past `mid`.
 *
 * ⚠ THESE ARE THE ONLY TWO NUMBERS THIS FEATURE TYPES IN. Everything an author
 * reads is derived from them, from `SCREEN_HEIGHT`, and from the document.
 */
export const CURVE_RATE_ARMS: readonly CurveRateArm[] = Object.freeze([
  Object.freeze({ name: 'descsmall', excursionPx: 176, garbled: false }),
  Object.freeze({ name: 'mid', excursionPx: 353, garbled: true }),
]);

/** The band span every arm above was measured over — the whole screen. */
export const CURVE_RATE_ARM_SPAN_LINES = SCREEN_HEIGHT;

/**
 * The per-scanline Plane-B scroll step of a band, in pixels.
 *
 * `depth_onset_probe.py`'s `rate_mean`, transcribed: `excursion / (len(seg) -
 * 1)`, where `seg` is the band's lines. The `- 1` is not decoration — it is the
 * count of ADJACENT LINE PAIRS, and it is what makes this repo's arithmetic
 * reproduce all four rates aeon printed (176/223 = 0.79, 353/223 = 1.58 on
 * sec7's 224-line band; 348/47 = 7.40 and 1398/63 = 22.19 on the section-4
 * showcase's 48- and 64-line bands). Getting it wrong by one would have looked
 * right on every arm and been wrong by 0.4% on the narrowest band.
 *
 * `null` for a band with no adjacent pair to step across, which is aeon's own
 * answer (`band_stats` returns `None` for `len(seg) < 2`).
 */
export function curveShearRate(excursionPx: number, spanLines: number): number | null {
  if (!Number.isFinite(excursionPx) || !Number.isFinite(spanLines)) return null;
  if (spanLines < 2) return null;
  return Math.abs(excursionPx) / (spanLines - 1);
}

/** The highest per-line rate aeon has measured CLEAN (`descsmall`). */
export const CURVE_RATE_CLEAN_MAX: number = (() => {
  const arm = CURVE_RATE_ARMS.filter((a) => !a.garbled)
    .reduce((hi, a) => (a.excursionPx > hi.excursionPx ? a : hi));
  const r = curveShearRate(arm.excursionPx, CURVE_RATE_ARM_SPAN_LINES);
  /* c8 ignore next */
  if (r === null) throw new Error('curve-rate: the clean arm has no measurable rate');
  return r;
})();

/**
 * The lowest per-line rate aeon has measured GARBLED (`mid`), and THE BAR THIS
 * FEATURE COMPARES AGAINST.
 *
 * ⚠ WHY THE GARBLED END AND NOT THE CLEAN ONE. Between `CURVE_RATE_CLEAN_MAX`
 * and this figure aeon has measured NOTHING — the onset is bracketed, never
 * bisected (`curve-desc` §7 item 1: "three points bracketing a derived
 * threshold is not a bisect"). Firing inside that gap would be Aurora asserting
 * a verdict on a value nobody has looked at. Firing at or above it repeats a
 * verdict aeon has actually seen.
 *
 * ⚠ AND SILENCE BELOW IT IS NOT A CLEARANCE. It means this one comparison did
 * not fire, out of a list that includes the unmeasured gap, the open
 * span-versus-rate confound, the excursion reading that remains true as
 * geometry, and every question about what the foreground covers. Nothing in
 * this module returns a "looks fine" string for a caller to render.
 */
export const CURVE_RATE_GARBLED_MIN: number = (() => {
  const arm = CURVE_RATE_ARMS.filter((a) => a.garbled)
    .reduce((lo, a) => (a.excursionPx < lo.excursionPx ? a : lo));
  const r = curveShearRate(arm.excursionPx, CURVE_RATE_ARM_SPAN_LINES);
  /* c8 ignore next */
  if (r === null) throw new Error('curve-rate: the garbled arm has no measurable rate');
  return r;
})();

/**
 * A band's Plane-B HScroll travel at one camera X, in pixels.
 *
 * THE DECODE, NOT THE RATIO. `decodeFactorScroll` truncates each term of the
 * packed triple separately, which is what the engine's `asr.w` pair does; the
 * ramp aeon measured runs from `Decode_Factor_B(camX, fb)` to
 * `Decode_Factor_B(camX, to)` and its excursion is the gap between them
 * (`curve_probe.derive_curve_buffer`, whose derived-vs-measured is 0 of 224
 * lines differing on all five arms). `factorRatio`'s own docblock forbids using
 * the fraction as a scroll value, and this is a scroll value.
 */
export function curveExcursionPx(fb: EffectsFactor, to: EffectsFactor, camX: number): number {
  return Math.abs(decodeFactorScroll(camX, fb) - decodeFactorScroll(camX, to));
}

/**
 * The smallest camera X in `[0, maxCamX]` at which this band's shear rate
 * reaches `rate`, or `null` when it never does inside that range.
 *
 * ⚠ A SCAN, NOT A BISECT, AND THAT IS DELIBERATE. `decodeFactorScroll` is a
 * difference of two step functions; `bg-wrap.ts` gets to binary-search it only
 * because it asserts monotonicity of ONE factor over the whole published set.
 * The quantity here is the gap BETWEEN two of them, and a difference of
 * monotone functions is not generally monotone — so this walks. The walk is
 * only ever entered after `curveRateVerdict` has already found a crossing at
 * the top of the range, so it terminates at the onset rather than at the bound.
 */
export function curveRateOnsetCamX(
  fb: EffectsFactor, to: EffectsFactor, spanLines: number, rate: number, maxCamX: number,
): number | null {
  if (spanLines < 2 || !Number.isFinite(maxCamX) || maxCamX < 0) return null;
  const pairs = spanLines - 1;
  for (let camX = 0; camX <= maxCamX; camX++) {
    if (curveExcursionPx(fb, to, camX) / pairs >= rate) return camX;
  }
  return null;
}

/**
 * The camera X at which this band's shear rate reaches `rate`, DERIVED FROM THE
 * FACTOR RATIO rather than scanned — for the arm that has no camera bound to
 * scan to.
 *
 * ⚠ APPROXIMATE, AND LABELLED SO WHEREVER IT IS SHOWN. `factorRatio` is the
 * exact rational the factor names, but the decode truncates each term, so this
 * differs from `curveRateOnsetCamX` by up to a pixel per term. It exists only
 * for the no-act arm, where the alternative is saying nothing at all about
 * where the onset lands.
 *
 * `null` when the two ends have the same ratio (no ramp, so no onset).
 */
export function curveRateOnsetEstimate(
  fb: EffectsFactor, to: EffectsFactor, spanLines: number, rate: number,
): number | null {
  if (spanLines < 2) return null;
  const f = factorRatio(fb);
  const t = factorRatio(to);
  const dF = Math.abs(f.num / f.den - t.num / t.den);
  if (dF === 0) return null;
  return Math.ceil((rate * (spanLines - 1)) / dF);
}
