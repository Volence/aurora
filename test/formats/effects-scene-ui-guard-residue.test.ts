// GUARD-SEAT-RESIDUE, scene-ui.ts: the eleven plants the suite did not catch.
//
// Thirty-three mutations were applied to `src/core/formats/effects/scene-ui.ts`
// one at a time, each scored against the WHOLE `npm test`. Four are shown below
// not to discriminate at all and are removed from the denominator. Of the
// twenty-nine that could, eighteen died against rows that already existed and
// ELEVEN survived. This file closes those eleven, and changes no source line.
//
// The packet is `docs/reviews/2026-09-09-guard-residue-scene-ui.md`.
//
// ═══ WHY THE CLAMP IS THE HALF WITH THE LEAST HOLDING IT ═══
//
// `clampRowRemapPlaneY` is the tree's only named CORRECTING guard: it does not
// refuse, it repairs. Six mutations were applied to it and only the two that
// push a seed OUT OF the schema's range died, both against one row whose two
// points sit 1000 away from the bounds they test.
//
// That is not an accident of this file's coverage, it is structural, and the
// difference from a refusal is worth stating because it decides where a row has
// to go. When a REFUSAL is widened the bad value survives the control and then
// meets the codec, which holds the same rule from the schema: the refusal is
// defence in depth over a second reader that agrees with it. When a CLAMP is
// wrong, the number it returns is (everywhere except at the range edge) a
// number the codec accepts, indistinguishable afterwards from one the author
// typed, and NOTHING RECORDS THAT IT WAS CORRECTED. So the validator can catch
// a clamp that corrects out of range and can never catch a clamp that corrects
// to the wrong value inside it. The clamp is the only enforcement of its own
// correctness, which makes a direct row on it not a convenience but the only
// instrument there is.
//
// `rowRemapPlaneYRefusal`'s own docblock says the same thing from the other
// side: aeon's `ensure` tests `>= 0` only, so a value past the ceiling emits a
// silently wrong window rather than a build error.

import { describe, it, expect } from 'vitest';
import {
  clampRowRemapPlaneY,
  EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS,
  EFFECTS_VSPLIT_AT_BOUNDS,
  EFFECTS_ROW_REMAP_HEIGHT_SHIFTS,
  EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS,
  bobShiftRefusal,
  EFFECTS_BOB_SHIFT_NONE,
  EFFECTS_BOB_SHIFT_LADDER,
  driftPxPerFrameRefusal,
  reelRateRefusal,
  reelRatesRefusal,
  reelRateGuidance,
} from '../../src/core/formats/effects/scene-ui';
import {
  EFFECTS_REEL_BAND_COUNT, EFFECTS_REEL_RATE_BOUNDS,
} from '../../src/core/formats/effects/scene';

describe('the correcting guard: clampRowRemapPlaneY', () => {
  const { min, max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;

  it('answers the plane\'s FIRST line for anything that is not a number at all', () => {
    // PLANTS SU01 and SU02, BOTH SURVIVED. SU01 returned `max` from the
    // non-finite arm; SU02 deleted the arm, which sends NaN straight through
    // Math.round/min/max and out again as NaN. No fixture anywhere supplied a
    // non-finite input, so which end a nonsense value falls to was unheld, and
    // the two ends are the top and the bottom of the plane.
    expect(clampRowRemapPlaneY(Number.NaN)).toBe(min);
    expect(clampRowRemapPlaneY(Number.POSITIVE_INFINITY)).toBe(min);
    expect(clampRowRemapPlaneY(Number.NEGATIVE_INFINITY)).toBe(min);
    // Stated as a property rather than only as three values: whatever comes
    // back is a legal plane line, which is the whole job of a correcting guard.
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const got = clampRowRemapPlaneY(v);
      expect(Number.isInteger(got)).toBe(true);
      expect(got).toBeGreaterThanOrEqual(min);
      expect(got).toBeLessThanOrEqual(max);
    }
  });

  it('ROUNDS a fractional seed rather than truncating it', () => {
    // PLANT SU03, SURVIVED: Math.round swapped for Math.trunc. Every existing
    // fixture hands the clamp an integer, so the rounding mode was asserted by
    // nothing. Half a line is half a line in both directions, and truncation is
    // not symmetric about zero the way rounding is.
    expect(clampRowRemapPlaneY(10.5)).toBe(11);
    expect(clampRowRemapPlaneY(10.4)).toBe(10);
    expect(clampRowRemapPlaneY(9.6)).toBe(10);
  });

  it('clamps AT the bounds, not merely 1000 past them', () => {
    // PLANTS SU04 and SU05 died against `max + 1000` and `min - 1000`, which is
    // a bound off by one thousand and would equally have passed a bound off by
    // 999. A one-step probe is what actually pins the edge.
    expect(clampRowRemapPlaneY(max)).toBe(max);
    expect(clampRowRemapPlaneY(max + 1)).toBe(max);
    expect(clampRowRemapPlaneY(min)).toBe(min);
    expect(clampRowRemapPlaneY(min - 1)).toBe(min);
  });
});

describe('what this parcel CANNOT measure, said out loud rather than left green', () => {
  /**
   * ⚠ THESE ROWS ASSERT A PRECONDITION, NOT A BEHAVIOUR, and they exist because
   * three mutations were applied that provably could not change any outcome.
   * Recording them as "survivors" would be a false finding and dropping them
   * silently would leave a reader thinking the question was asked.
   *
   * Each row goes red the day its precondition ends, and its message says what
   * to write then. A gate that cannot measure something must say so.
   */

  it('the clamp\'s BOUND SOURCE is unmeasurable while rowRemap and vsplit agree', () => {
    // PLANT SU06: `clampRowRemapPlaneY` reads EFFECTS_VSPLIT_AT_BOUNDS instead
    // of EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS. That is the exact defect the clamp's
    // own docblock is written against ("an amendment moves one and the other
    // silently starts clamping to a bound that is not its own"), and no test
    // can tell the two apart today because they are the same two numbers.
    const a = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
    const b = EFFECTS_VSPLIT_AT_BOUNDS;
    expect(
      a.min === b.min && a.max === b.max,
      'rowRemap.plane_y and vsplit.at no longer carry the same bounds '
      + `(${a.min}..${a.max} against ${b.min}..${b.max}), so the clamp\'s source IS now `
      + 'observable. Write the row this comment stands in for: clamp a value that is legal '
      + 'in one space and not the other, and assert it lands inside rowRemap\'s.',
    ).toBe(true);
  });

  it('the height shift\'s MEMBERSHIP test is unmeasurable while the enum is a singleton', () => {
    // PLANTS SU24 and SU25. SU24 replaced `shifts.includes(shift)` with a range
    // test between the derived min and max, which its docblock names as the
    // defect ("a sparse [4, 7] would have this function bless a 5 and a 6 that
    // the codec then refuses"). SU25 deleted the contiguity check that decides
    // whether the sentence may speak in ends. Both are unreachable at an enum of
    // one: the range IS the set, and the `length === 1` arm short-circuits ahead
    // of the contiguity arm.
    const shifts = EFFECTS_ROW_REMAP_HEIGHT_SHIFTS;
    const { min, max } = EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS;
    expect(shifts.length).toBeGreaterThan(0);
    expect(
      shifts.length === 1 && min === max,
      `the contract now admits ${shifts.length} shifts (${shifts.join(', ')}). Two rows become `
      + 'writable and both should be written: that a value inside min..max but NOT in the '
      + 'enum is refused, and that the sentence lists the set rather than speaking in ends '
      + 'when the set is not contiguous.',
    ).toBe(true);
  });
});

describe('bob: the sentinel, the direction of the consequence, and the integer test', () => {
  const { min, max } = EFFECTS_BOB_SHIFT_LADDER;

  it('the NO-BOB sentinel is legal, and it is not on the ladder', () => {
    // PLANT SU08, SURVIVED: the sentinel short-circuit deleted. `off` then reads
    // as a refusal, on the one value the schema's own default carries. The
    // sentinel sits outside the ladder, so deleting the line changes an answer.
    expect(bobShiftRefusal(EFFECTS_BOB_SHIFT_NONE)).toBeNull();
    expect(
      EFFECTS_BOB_SHIFT_NONE < min || EFFECTS_BOB_SHIFT_NONE > max,
      'the sentinel is inside the ladder, so the short-circuit is doing nothing and this row '
      + 'proves nothing: re-derive it against the amended contract',
    ).toBe(true);
  });

  it('the two CONSEQUENCE sentences follow the direction they are about', () => {
    // PLANT SU09, SURVIVED: `shift < min` inverted to `shift > min`, which swaps
    // the two halves of the message. Both halves stay present and both stay
    // true of SOME value, so a row asserting that the refusal is non-null, or
    // that it mentions the ladder, cannot see it. The consequences are opposite
    // in kind: below the ladder packs to silence, above it annihilates the
    // amplitude table.
    const below = bobShiftRefusal(min - 1)!;
    const above = bobShiftRefusal(max + 1)!;
    expect(below).not.toBeNull();
    expect(above).not.toBeNull();
    expect(below).toContain('Below the ladder');
    expect(below).toContain('pack to silence');
    expect(above).toContain('annihilates');
    expect(above).not.toContain('Below the ladder');
  });

  it('a fractional shift is refused AS a non-integer, not blessed by the range', () => {
    // PLANT SU10, SURVIVED. With the integer arm gone, a fractional value inside
    // the ladder passes every remaining test and the function returns null: the
    // control would originate a shift no codec accepts. The value chosen is
    // strictly inside the ladder so the range test cannot answer for it.
    const inside = min + 0.5;
    expect(Number.isInteger(inside), 'the fixture must be fractional to be about this arm')
      .toBe(false);
    expect(inside).toBeGreaterThan(min);
    expect(inside).toBeLessThan(max);
    expect(bobShiftRefusal(inside)).toMatch(/not an integer/);
  });
});

describe('drift: a non-finite px/frame is refused as one', () => {
  it('says "type a signed number", not "is not an integer"', () => {
    // PLANT SU20, SURVIVED: `!Number.isFinite` narrowed to `Number.isNaN`. An
    // infinite value then reaches the wire conversion, comes back infinite, and
    // is refused by the INTEGER clause several frames later. Still a refusal,
    // so a row asserting non-null cannot see it, and the sentence an author
    // reads is about the wrong thing: they typed no integer at all.
    for (const v of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN]) {
      const why = driftPxPerFrameRefusal(v)!;
      expect(why).not.toBeNull();
      expect(why).toContain('type a signed number of pixels per frame');
      expect(why).not.toContain('is not an integer');
    }
  });
});

describe('reels: the three array facts one box cannot see', () => {
  const { min, max } = EFFECTS_REEL_RATE_BOUNDS;

  /** `n` distinct legal rates, derived rather than typed. */
  function distinctLegal(n: number): number[] {
    const out: number[] = [];
    for (let r = min; out.length < n && r <= max; r++) out.push(r);
    expect(out.length, 'the legal span is too narrow to build this fixture').toBe(n);
    return out;
  }

  it('a SHORT array is refused: the count is exact, not a ceiling', () => {
    // PLANT SU26, SURVIVED: `!==` loosened to `>`. A short array then passes the
    // count check, and its rates are legal and distinct, so the whole function
    // returns null. The refusal's own sentence says why that is wrong: the count
    // is a copy of aeon's REEL_BAND_COUNT, which sizes a RAM array and is
    // compiled into a shift.
    const short = distinctLegal(EFFECTS_REEL_BAND_COUNT - 1);
    expect(reelRatesRefusal(short)).toContain(`${EFFECTS_REEL_BAND_COUNT}`);
    expect(reelRatesRefusal(distinctLegal(EFFECTS_REEL_BAND_COUNT))).toBeNull();
  });

  it('an out-of-range rate inside a well-formed array is still refused, and the strip is named', () => {
    // PLANT SU28, SURVIVED: the per-value loop's call to `reelRateRefusal`
    // replaced by null. The array is then the right length and pairwise
    // distinct, so nothing else looks at the values at all. Every existing row
    // asks `reelRateRefusal` directly or hands the array a duplicate; none
    // walked an illegal value through the ARRAY refusal.
    const rates = distinctLegal(EFFECTS_REEL_BAND_COUNT);
    rates[2] = max + 1;
    const why = reelRatesRefusal(rates)!;
    expect(why).not.toBeNull();
    expect(why, 'the message must say WHICH strip, not merely that one is wrong')
      .toContain('strip 2');
    expect(why).toContain(`${max + 1}`);
  });

  it('the per-value bound is refused AT one step past each end', () => {
    // PLANT SU29, SURVIVED: the bound widened by one at both ends. The rows that
    // exercise this refusal use values comfortably outside it, which is the
    // previous parcel\'s class B repeating in this file.
    expect(reelRateRefusal(max)).toBeNull();
    expect(reelRateRefusal(min)).toBeNull();
    expect(reelRateRefusal(max + 1)).not.toBeNull();
    expect(reelRateRefusal(min - 1)).not.toBeNull();
  });

  it('GUIDANCE stays silent about a rate the contract refuses', () => {
    // PLANT SU30, SURVIVED: the refusal short-circuit deleted. Guidance then
    // speaks about an illegal value, and its whole contract is that it is NEVER
    // a refusal: the panel paints it at the hint tier, so a sentence there says
    // "legal, and probably not what you wanted" about a document that will not
    // load. The guard is one line and nothing observed it.
    const beyond = max + 1;
    expect(reelRateRefusal(beyond)).not.toBeNull();
    expect(reelRateGuidance(beyond)).toBeNull();
    expect(reelRateGuidance(min - 1)).toBeNull();
  });
});
