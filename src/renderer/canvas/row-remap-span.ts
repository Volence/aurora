// A ROW REMAP'S REACH, CHECKED AT AUTHOR TIME AGAINST THE BAND IT SITS IN.
//
// The rowRemap authoring parcel closed with `plane_y` and `height_shift`
// relating to nothing (docs/reviews/2026-09-05-rowremap-author.md section 6
// item 3). Its sibling commit gave `plane_y` a REFERENT, the row of the
// author's own art. This is the other half: the one thing about a remap that IS
// a function of the open document and nothing else.
//
// ═══ THE ENGINE, RE-DERIVED AT aeon a2bb5904 ═══
//
// `Parallax_Step4_Fill`'s row-remap pass, engine/level/parallax.emp. Two sites,
// both read rather than relayed:
//
//   :3714-3721   H = 1 << band_remap_hshift, and |p| is CLAMPED into 0..H-1
//
//                    move.b  band_remap_hshift(a1), d3   // H = 1 << d3
//                    moveq   #1, d2
//                    lsl.w   d3, d2                      // d2 = H
//                    move.w  d2, d1
//                    subq.w  #1, d1                      // d1 = H - 1
//                    cmp.w   d1, d0
//                    bls     .remap_clamped
//                    move.w  d1, d0                      // clamp |p|
//
//   :3753-3757   the band's SCREEN-LINE span is halved, and that half is the
//                second operand of a min:
//
//                    move.w  Parallax_Remap_State+6, d2  // end screen line
//                    sub.w   Parallax_Remap_State+4, d2  // ...minus top = span
//                    lsr.w   #1, d2
//                    beq     .remap_none                 // under 2 lines: none
//                    cmp.w   d2, d0
//                    bls     .remap_have_n
//                    move.w  d2, d0                      // n = span/2
//
// So the number of lines the remap actually moves is
//
//     n = min( |p| clamped to H-1 , floor(span / 2) )
//
// and two author-time facts fall out of it, both pure comparisons of numbers
// already on the document:
//
//   A. floor(span/2) == 0, i.e. span < 2. The `beq` takes `.remap_none`. The
//      effect is authored and does nothing, ever, at any camera position.
//   B. floor(span/2) < H - 1. The min saturates on the SPAN term before |p| can
//      reach its own ceiling, so the deep end of the ladder is never applied to
//      the scroll no matter where the camera goes.
//
// ⚠ WHY THE CAP EXISTS, AND WHAT THE AUTHOR'S SYMPTOM THEREFORE IS. aeon's own
// comment at :3746-3752: the ladder is generated with `i <= entry[i] <= 2i`, so
// a run of n lines reads as far as slot 2n-2, and "capping n at span/2 is what
// keeps every read inside THIS band's own longwords; without it a tall |p| over
// a short band would fetch the NEXT band's scroll words and paint them into this
// one, which looks like a plausible effect and is not one". THE CAP IS THE FIX,
// not the fault. So a band that trips B renders a CLIPPED effect, not a garbled
// one, and clipped is the failure a person stares at without diagnosing.
//
// ⚠ AND THE ART HALF IS NOT CAPPED. `Waterline_Art_Row` is published at :3736,
// BEFORE the `beq` and before the min (parallax.emp says so in as many words:
// "THE ROW IS COMPUTED BEFORE THE EQUILIBRIUM EARLY-OUT"). So the ladder ROW
// still sweeps its whole range and the ART still compresses; it is the SCROLL
// half that saturates. A sentence claiming the ladder's upper rows are
// unreachable would be a claim about the wrong half.
//
// ═══ WHAT AURORA CAN COMPUTE, AND WHAT IT CANNOT ═══
//
// `span` is the band's SCREEN-line extent at fill time, and Step 4a rebases
// plane tops to screen lines every frame against the current `Vscroll_BG`:
// band k (the one containing `vs`) is forced to screen row 0 whatever its top
// was, the rest are `top - vs` with a wrap and a clamp at SCREEN_HEIGHT, and the
// last band in SCREEN order ends at 224.
//
//   LOCKED (`v_factor == 15`): `Vscroll_BG` IS `v_offset`, a scene constant
//   (parallax.emp's `.v_locked` arm; `planeVscroll` transcribes it and does not
//   read `camY` on that arm at all). Every term is on the document, so the span
//   is too.
//
//   UNLOCKED: `Vscroll_BG` follows the camera, and it is not only the band
//   ORDER that moves with it. The band containing `vs` is forced to row 0, so
//   its span is `next_top - vs`; the last band on screen runs to 224; and a band
//   rotated past the screen bottom is clamped to a span of zero. Every band's
//   span is therefore a per-frame quantity, and there is no author-time value to
//   check. THE CHECK IS RESTRICTED TO LOCKED SCENES AND SAYS SO OUT LOUD, rather
//   than picking a camera and calling the answer general.
//
// ⚠ THE SPAN COMPUTED HERE IS AN UPPER BOUND, EVEN LOCKED, and that is the
// direction that makes both findings safe. Step 4b splits the band containing
// the anchored line and copies the whole record, so a remapped layer the
// waterline crosses becomes TWO bands both carrying the ladder, and last-wins
// marks the LOWER half (parallax.emp:3085-3096). The runtime span is therefore
// at most this one. A refusal derived from an upper bound only gets more true
// when the real number is smaller; a CLEARANCE derived from one would not, which
// is the second reason this module states no clearance.
//
// ═══ ADVICE, NOT PREVENTION, AND THE RULING IS NOT NEW ═══
//
// aeon's generator accepts these documents today and has separately booked
// adding the refusal at its end. A control in Aurora that REFUSED what the
// generator accepts would be a bound this repo invented, and an author who
// opened a hand-authored scene could not see their own file. Same posture, same
// reason, as `rowRemapPreconditions`, `curveDescendingAdvisory` and the layer
// top's `fireLineAdvisory`: a sentence, and the document still saves.
//
// ⚠ AND NO CLEARANCE IS STATED, EVER. `floor(span/2) >= H-1` does not mean the
// remap is right. It means this ONE failure is absent, out of a list that
// includes whether the camera travels vertically here at all (nobody can check
// that), whether `plane_y` is on the waterline (only the author can), and
// whether the anchored split leaves the lower half tall enough (a runtime
// quantity). So the passing arm returns null, which is SILENCE, and there is no
// "looks fine" string anywhere in this module for a caller to render.

import type { EffectsScene } from '../../core/formats/effects/scene';
import { rowRemapOf, rowRemapHeightLines } from '../../core/formats/effects/scene-ui';
import { SCREEN_HEIGHT } from '../../core/model/screen';
import { layerTopSpace, planeLineOf, PLANE_LINE_SPAN } from '../providers/effects-aeon';
import { planeVscroll, rebasePlaneTopsToScreen } from './camera-preview';

/**
 * `camY` is passed to `planeVscroll` and is IGNORED on the arm this module uses.
 *
 * ⚠ IT IS NOT A CHOSEN CAMERA. `planeVscroll`'s `.v_locked` arm returns
 * `v_offset` before it looks at `camY`, and `rowRemapBandSpan` refuses to run on
 * any other arm. A test asserts the independence directly rather than trusting
 * this comment, because "a constant that turns out to matter" is exactly the
 * shape of a measurement taken at one camera and reported as general.
 */
const CAMERA_IS_NOT_READ_UNDER_THE_LOCK = 0;

export interface RowRemapSpan {
  /** The band's screen-line extent at fill time, or null when not computable. */
  spanLines: number | null;
  /** The band's first screen line, or null alongside `spanLines`. */
  screenTop: number | null;
  /** Why `spanLines` is null. Null when it is not. */
  restriction: string | null;
}

/**
 * The screen-line span of the band a layer becomes, or the reason it cannot be
 * known from the document.
 *
 * Step 4a is NOT re-transcribed here: `rebasePlaneTopsToScreen` and
 * `planeVscroll` already are, in camera-preview.ts, and the whole reason that
 * module split its geometry out is so a second reader does not write a second
 * copy of the engine's rotation. `screenBottom` is the next band's top or
 * SCREEN_HEIGHT, which is `cameraPreviewPlan`'s own rule and the engine's
 * (a `move.w` of the immediate 224 into d5, or `band_top_line_next`).
 */
export function rowRemapBandSpan(scene: EffectsScene, layerIndex: number): RowRemapSpan {
  const none = (restriction: string): RowRemapSpan =>
    ({ spanLines: null, screenTop: null, restriction });

  if (layerIndex < 0 || layerIndex >= scene.layers.length) {
    return none(`there is no layer ${layerIndex} in this scene.`);
  }
  if (layerTopSpace(scene) !== 'screen') {
    return none(
      'this scene\'s background tracks the camera vertically, so every band\'s screen span is '
      + 'a per-frame quantity: Step 4a starts the screen at whichever band the camera has '
      + 'scrolled to, ends the last one at line 224, and clamps the rest. There is no '
      + 'author-time span to check, and picking a camera position would report one camera\'s '
      + 'answer as if it were every camera\'s.');
  }

  const planeTops = scene.layers.map((l) => planeLineOf(scene, l.world_y).line);
  // `& (PLANE_LINE_SPAN - 1)` is the engine's `and.w #PLANE_B_SPAN-1`, and it is
  // the same AND `cameraPreviewPlan` applies for the same reason: it gives the
  // positive residue that `%` would not.
  const vs = planeVscroll(scene, CAMERA_IS_NOT_READ_UNDER_THE_LOCK) & (PLANE_LINE_SPAN - 1);
  const rotated = rebasePlaneTopsToScreen(planeTops, vs);

  const j = rotated.findIndex((r) => r.source === layerIndex);
  if (j < 0) return none(`layer ${layerIndex} did not survive the plane-to-screen rotation.`);
  const screenTop = rotated[j].screenTop;
  const screenBottom = j + 1 < rotated.length
    ? Math.max(screenTop, rotated[j + 1].screenTop)
    : SCREEN_HEIGHT;
  return { spanLines: screenBottom - screenTop, screenTop, restriction: null };
}

/**
 * The one sentence a remapped layer's band span earns, or NULL.
 *
 * Null means this module found nothing, NOT that the remap is right. See the
 * clearance block above; there is deliberately no third return value.
 *
 * Null also for a layer with no remap, and for a scene whose span is not an
 * author-time quantity. `rowRemapSpanRestriction` is where a panel gets the
 * second of those said out loud, because "this check did not run" and "this
 * check found nothing" are different states and collapsing them is how a
 * restricted check reads as coverage.
 */
export function rowRemapReachAdvisory(scene: EffectsScene, layerIndex: number): string | null {
  const layer = scene.layers[layerIndex];
  if (layer === undefined) return null;
  const rr = rowRemapOf(layer.rowRemap);
  if (rr === null) return null;

  const { spanLines } = rowRemapBandSpan(scene, layerIndex);
  if (spanLines === null) return null;

  const H = rowRemapHeightLines(rr.height_shift);
  const reach = Math.floor(spanLines / 2);
  const where = `${spanLines} screen line${spanLines === 1 ? '' : 's'} from this band's top to `
    + 'the next layer\'s top';

  // ⚠ MEASURED AGAINST THE BOX IT RENDERS IN, and shortened once because of it.
  // The layer cards sit in a ~150px scroller (column-layout's LIST floor), and
  // the first draft of this sentence was 229px tall in it: an advisory an author
  // has to scroll a scroller to read is the "advisory becomes decoration"
  // failure arriving by height instead of by count. Everything the engine's two
  // branches decide is still here; the prose around them is not.
  //
  // FINDING A subsumes finding B arithmetically, and they are still ONE sentence
  // rather than two hints, because they are one inequality at two magnitudes,
  // unlike `curveAdvisory` and `curveDescendingAdvisory` (a refusal and a
  // correlation, which are different KINDS of claim). Stacking "does nothing"
  // under "does less than asked" would be two paragraphs of one rule.
  if (reach === 0) {
    return `${where}, and the remap needs 2 to move anything: the engine halves the span and `
      + 'takes its no-remap branch at zero. This effect does nothing, at every camera position. '
      + 'Make the band taller.';
  }
  if (reach < H - 1) {
    return `${where}, and the remap moves at most half of them: ${reach}. height_shift `
      + `${rr.height_shift}'s ladder steps down to ${H - 1} lines, so ${H - 1 - reach} `
      + `step${H - 1 - reach === 1 ? ' is' : 's are'} out of reach at every camera position. The `
      + 'cap is what keeps the remap reading inside this band, so the result is clipped rather '
      + 'than broken. Make the band taller, or lower height_shift.';
  }
  return null;
}

/**
 * Why the span check did not run, or null when it did.
 *
 * SEPARATE FROM THE ADVISORY, and the separation is the point: a check that says
 * nothing because it found nothing and a check that says nothing because it
 * could not run look identical from a panel, and only one of them is coverage.
 * The restricted case is the UNLOCKED scene, which is a real thing to author.
 */
export function rowRemapSpanRestriction(scene: EffectsScene, layerIndex: number): string | null {
  const layer = scene.layers[layerIndex];
  if (layer === undefined) return null;
  if (rowRemapOf(layer.rowRemap) === null) return null;
  return rowRemapBandSpan(scene, layerIndex).restriction;
}
