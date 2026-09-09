// The arithmetic behind the re-pointed curve advisory, checked against FOUR
// rates aeon published independently of this repo.
//
// ⚠ THE `- 1` IN THE DIVISOR IS THE WHOLE SUBJECT OF THE FIRST ROW. `rate` is a
// step between ADJACENT LINES, so a band of N lines has N-1 of them. On aeon's
// sec7 arms (span 224) the difference between `/223` and `/224` rounds away at
// two decimals and BOTH divisors reproduce the published figure — which is
// exactly how a wrong divisor would have shipped. The section-4 showcase's
// 48- and 64-line bands separate them (7.25 vs 7.40, 21.84 vs 22.19), and they
// are in the table for that reason and no other.

import { describe, it, expect } from 'vitest';
import {
  CURVE_RATE_ARMS, CURVE_RATE_ARM_SPAN_LINES,
  CURVE_RATE_CLEAN_MAX, CURVE_RATE_GARBLED_MIN,
  curveShearRate, curveExcursionPx, curveRateOnsetCamX, curveRateOnsetEstimate,
} from '../curve-rate';
import { decodeFactorScroll, factorRatio } from '../factor-decode';
import { EFFECTS_FACTOR_NAMES } from '../scene-ui';
import type { EffectsFactor } from '../scene';
import { SCREEN_HEIGHT } from '../../../model/screen';

/**
 * Every per-line rate aeon has PRINTED, with the excursion and span it printed
 * beside it. Sources, both read at aeon `origin/master` through git objects:
 * `docs/DEFERRED_WORK.md` (the CURVE-DESC five-arm table and the d-15 showcase
 * table) and `docs/witness/{curve-desc,depth-onset}-2026-09-06.md`.
 */
const AEON_PUBLISHED: ReadonlyArray<{
  where: string; excursionPx: number; spanLines: number; printed: number;
}> = [
  { where: 'sec7 descsmall', excursionPx: 176, spanLines: 224, printed: 0.79 },
  { where: 'sec7 mid', excursionPx: 353, spanLines: 224, printed: 1.58 },
  { where: 'sec7 desc', excursionPx: 1060, spanLines: 224, printed: 4.75 },
  { where: 'sec7 asc', excursionPx: 1061, spanLines: 224, printed: 4.76 },
  { where: 'sec4 band 112', excursionPx: 348, spanLines: 48, printed: 7.40 },
  { where: 'sec4 band 160', excursionPx: 1398, spanLines: 64, printed: 22.19 },
];

describe('curveShearRate: aeon\'s own rate_mean', () => {
  it('reproduces every rate aeon printed, from the excursion and span beside it', () => {
    for (const row of AEON_PUBLISHED) {
      const got = curveShearRate(row.excursionPx, row.spanLines);
      expect(got, row.where).not.toBeNull();
      expect(Number(got!.toFixed(2)), row.where).toBe(row.printed);
    }
  });

  // ANTI-VACUOUS: the row above would pass on the wrong divisor for four of the
  // six entries. These two are why it is not four entries.
  it('the narrow bands REJECT the span-without-the-minus-one divisor', () => {
    const narrow = AEON_PUBLISHED.filter((r) => r.spanLines < SCREEN_HEIGHT);
    expect(narrow.length).toBeGreaterThan(0);
    for (const row of narrow) {
      const wrong = row.excursionPx / row.spanLines;
      expect(Number(wrong.toFixed(2)), row.where).not.toBe(row.printed);
    }
  });

  it('has no answer below two samples, which is aeon\'s own answer', () => {
    expect(curveShearRate(100, 1)).toBeNull();
    expect(curveShearRate(100, 0)).toBeNull();
    expect(curveShearRate(Number.NaN, 224)).toBeNull();
  });
});

describe('the bracket the advisory compares against', () => {
  it('is derived from the two arms and from SCREEN_HEIGHT, not typed', () => {
    // The span is not a transcribed number: every sec7 arm covered the screen.
    expect(CURVE_RATE_ARM_SPAN_LINES).toBe(SCREEN_HEIGHT);
    const clean = CURVE_RATE_ARMS.find((a) => !a.garbled)!;
    const garbled = CURVE_RATE_ARMS.find((a) => a.garbled)!;
    expect(CURVE_RATE_CLEAN_MAX)
      .toBe(curveShearRate(clean.excursionPx, CURVE_RATE_ARM_SPAN_LINES));
    expect(CURVE_RATE_GARBLED_MIN)
      .toBe(curveShearRate(garbled.excursionPx, CURVE_RATE_ARM_SPAN_LINES));
  });

  it('leaves an UNMEASURED gap between the two, and the bar is the garbled end', () => {
    expect(CURVE_RATE_CLEAN_MAX).toBeLessThan(CURVE_RATE_GARBLED_MIN);
    // The gap is real rather than a rounding artefact: nothing aeon ran lands
    // inside it, which is why the advisory is silent there.
    for (const row of AEON_PUBLISHED) {
      const r = curveShearRate(row.excursionPx, row.spanLines)!;
      const inGap = r > CURVE_RATE_CLEAN_MAX && r < CURVE_RATE_GARBLED_MIN;
      expect(inGap, `${row.where} at ${r.toFixed(2)} px/line`).toBe(false);
    }
  });
});

describe('curveExcursionPx: the decode, not the ratio', () => {
  it('is the gap between the two ends\' Plane-B scrolls', () => {
    const camX = 1234;
    expect(curveExcursionPx('FACTOR_1_8', 'FACTOR_1_2', camX))
      .toBe(Math.abs(decodeFactorScroll(camX, 'FACTOR_1_8')
        - decodeFactorScroll(camX, 'FACTOR_1_2')));
  });

  it('is SYMMETRIC in the two ends, which is the direction refutation as arithmetic', () => {
    for (const a of EFFECTS_FACTOR_NAMES) {
      for (const b of EFFECTS_FACTOR_NAMES) {
        for (const camX of [0, 1, 97, 1000, 5824]) {
          expect(curveExcursionPx(a as EffectsFactor, b as EffectsFactor, camX),
            `${a} <-> ${b} @ ${camX}`)
            .toBe(curveExcursionPx(b as EffectsFactor, a as EffectsFactor, camX));
        }
      }
    }
  });

  /**
   * ⚠ THE VERDICT IS READ AT THE TOP OF THE CAMERA RANGE, so the top must BE
   * the maximum. `decodeFactorScroll` truncates each of the packed triple's two
   * terms separately, so the gap between two of them is not exactly `camX x
   * |df|` and monotonicity is a claim rather than an obvious fact. Asserted
   * here over every named pair across a real act's camera travel.
   */
  it('never exceeds its value at the top of the range, over every named pair', () => {
    const HI = 5824;             // OJZ act 1's own travelX, as a sample range
    for (const a of EFFECTS_FACTOR_NAMES) {
      for (const b of EFFECTS_FACTOR_NAMES) {
        const top = curveExcursionPx(a as EffectsFactor, b as EffectsFactor, HI);
        for (let camX = 0; camX <= HI; camX += 37) {
          expect(curveExcursionPx(a as EffectsFactor, b as EffectsFactor, camX),
            `${a} -> ${b} @ ${camX} exceeds its value at ${HI}`)
            .toBeLessThanOrEqual(top);
        }
      }
    }
  });
});

describe('the onset', () => {
  it('is the first camera x at which the scanned rate reaches the bar', () => {
    const span = SCREEN_HEIGHT;
    const onset = curveRateOnsetCamX(
      'FACTOR_1_8', 'FACTOR_1_2', span, CURVE_RATE_GARBLED_MIN, 20000,
    );
    expect(onset).not.toBeNull();
    expect(curveShearRate(curveExcursionPx('FACTOR_1_8', 'FACTOR_1_2', onset!), span)!)
      .toBeGreaterThanOrEqual(CURVE_RATE_GARBLED_MIN);
    // ...and the line before it does not, which is what makes it the FIRST.
    expect(curveShearRate(curveExcursionPx('FACTOR_1_8', 'FACTOR_1_2', onset! - 1), span)!)
      .toBeLessThan(CURVE_RATE_GARBLED_MIN);
  });

  it('is null when the range never reaches it', () => {
    expect(curveRateOnsetCamX(
      'FACTOR_1_2', 'FACTOR_7_16', SCREEN_HEIGHT, CURVE_RATE_GARBLED_MIN, 10,
    )).toBeNull();
  });

  it('the ratio ESTIMATE lands within a pixel per term of the scan', () => {
    const span = SCREEN_HEIGHT;
    for (const [fb, to] of [
      ['FACTOR_1_8', 'FACTOR_1_2'], ['FACTOR_1_2', 'FACTOR_1_8'],
      ['FACTOR_1_4', 'FACTOR_3_8'], ['FACTOR_0', 'FACTOR_1'],
    ] as Array<[EffectsFactor, EffectsFactor]>) {
      const est = curveRateOnsetEstimate(fb, to, span, CURVE_RATE_GARBLED_MIN)!;
      const scanned = curveRateOnsetCamX(fb, to, span, CURVE_RATE_GARBLED_MIN, est * 4 + 64)!;
      expect(est, `${fb} -> ${to}`).not.toBeNull();
      expect(scanned, `${fb} -> ${to}`).not.toBeNull();
      // The two terms of a packed factor each truncate, so the scan can sit a
      // couple of camera pixels either side of the exact-rational estimate.
      expect(Math.abs(est - scanned), `${fb} -> ${to}: est ${est} vs scan ${scanned}`)
        .toBeLessThanOrEqual(8);
    }
  });

  it('has no estimate when the two ends are the same ratio', () => {
    expect(curveRateOnsetEstimate('FACTOR_1_2', 'FACTOR_1_2', SCREEN_HEIGHT, 1)).toBeNull();
    expect(curveRateOnsetEstimate('FACTOR_LOCKED', 'FACTOR_0', SCREEN_HEIGHT, 1)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GUARD-SEAT-RESIDUE: the seven plants this file did not catch
//
// Twenty mutations were applied to `curve-rate.ts` one at a time, each scored
// against the WHOLE `npm test`, with the verdict taken from vitest's own
// `Test Files` line rather than from the aggregate exit code. Thirteen died
// against the rows above; seven survived, and they are closed here. Two of the
// seven are shown not to discriminate at all and get a row that asserts their
// precondition instead. No source line changed.
//
// The packet is `docs/reviews/2026-09-09-guard-residue-preset.md`.
// ═══════════════════════════════════════════════════════════════════════════

describe('GUARD-SEAT-RESIDUE: the plants the rows above did not catch', () => {
  it('PLANT CR03: a rate is a MAGNITUDE, so a descending band is not negative', () => {
    // Dropping `Math.abs` survived: every published arm above is quoted as a
    // positive excursion, so nothing ever handed this function the other sign.
    // A negative rate compares below every bar, which silently clears exactly
    // the bands whose shear runs the other way.
    const positive = curveShearRate(176, SCREEN_HEIGHT);
    const negative = curveShearRate(-176, SCREEN_HEIGHT);
    expect(positive).not.toBeNull();
    expect(negative).toBe(positive);
    expect(negative!).toBeGreaterThan(0);
  });

  it('PLANTS CR06 and CR08, NOT DISCRIMINATING: each side of the bracket has ONE arm', () => {
    // Reversing the extremum in either derivation survived, and no input can
    // catch it: `reduce` over a single-element list returns that element
    // whatever the comparator says. The PRECONDITION is the arm census. When
    // aeon measures a third arm this row goes red, and the two extremum
    // comparators become reachable and need a case each.
    const clean = CURVE_RATE_ARMS.filter((a) => !a.garbled);
    const garbled = CURVE_RATE_ARMS.filter((a) => a.garbled);
    expect(
      clean.length,
      'a second CLEAN arm has landed, so CURVE_RATE_CLEAN_MAX now has a choice to make and '
      + 'nothing asserts it takes the HIGHEST',
    ).toBe(1);
    expect(
      garbled.length,
      'a second GARBLED arm has landed, so CURVE_RATE_GARBLED_MIN now has a choice to make and '
      + 'nothing asserts it takes the LOWEST',
    ).toBe(1);
    expect(CURVE_RATE_CLEAN_MAX).toBe(curveShearRate(clean[0].excursionPx, CURVE_RATE_ARM_SPAN_LINES));
    expect(CURVE_RATE_GARBLED_MIN)
      .toBe(curveShearRate(garbled[0].excursionPx, CURVE_RATE_ARM_SPAN_LINES));
  });

  it('PLANT CR12: the scan has no answer below two samples either', () => {
    // Loosening `spanLines < 2` to `< 1` survived. It is not a tidy guard: with
    // one line there are ZERO adjacent pairs, so the scan divides by zero and
    // answers camera 0, which reads as "garbled from the very first pixel".
    expect(curveRateOnsetCamX('FACTOR_1_8', 'FACTOR_1_2', 1, CURVE_RATE_GARBLED_MIN, 20000))
      .toBeNull();
    expect(curveRateOnsetCamX('FACTOR_1_8', 'FACTOR_1_2', 0, CURVE_RATE_GARBLED_MIN, 20000))
      .toBeNull();
    // ANTI-VACUOUS: two samples IS an answer, so the rows above are about the
    // bound and not about this pair of factors never crossing.
    expect(curveRateOnsetCamX('FACTOR_1_8', 'FACTOR_1_2', 2, CURVE_RATE_GARBLED_MIN, 20000))
      .not.toBeNull();
  });

  it('PLANT CR13: the scan INCLUDES the top of the range it was given', () => {
    // Tightening `camX <= maxCamX` to `<` survived: every existing row scans to
    // a bound comfortably past the onset. The one camera it loses is the last
    // one, and the caller that hands this function a bound hands it the bound
    // it cares about.
    const span = SCREEN_HEIGHT;
    const onset = curveRateOnsetCamX(
      'FACTOR_1_8', 'FACTOR_1_2', span, CURVE_RATE_GARBLED_MIN, 20000,
    );
    expect(onset).not.toBeNull();
    expect(
      curveRateOnsetCamX('FACTOR_1_8', 'FACTOR_1_2', span, CURVE_RATE_GARBLED_MIN, onset!),
      'a scan bounded AT the onset reported that the range never reaches the bar',
    ).toBe(onset);
    // And one camera below it really is out of range, so the row above is about
    // the inclusive edge rather than about a bound that was never tight.
    expect(curveRateOnsetCamX('FACTOR_1_8', 'FACTOR_1_2', span, CURVE_RATE_GARBLED_MIN, onset! - 1))
      .toBeNull();
  });

  it('PLANT CR16: the ESTIMATE rounds UP, so it is a camera that has REACHED the bar', () => {
    // `Math.ceil` to `Math.floor` survived, because the only row on the
    // estimate compares it with the scan and allows eight camera pixels of
    // slack for the decode's per-term truncation. The property that fixes the
    // direction is stated against the estimate's OWN exact-rational model.
    const span = SCREEN_HEIGHT;
    const [fb, to]: [EffectsFactor, EffectsFactor] = ['FACTOR_1_8', 'FACTOR_1_2'];
    const f = factorRatio(fb);
    const t = factorRatio(to);
    const dF = Math.abs(f.num / f.den - t.num / t.den);
    const exact = (CURVE_RATE_GARBLED_MIN * (span - 1)) / dF;
    expect(
      Number.isInteger(exact),
      'the exact crossing lands on a whole camera here, so rounding up and rounding down agree '
      + 'and this row cannot tell them apart',
    ).toBe(false);

    const est = curveRateOnsetEstimate(fb, to, span, CURVE_RATE_GARBLED_MIN);
    expect(est).not.toBeNull();
    expect((est! * dF) / (span - 1)).toBeGreaterThanOrEqual(CURVE_RATE_GARBLED_MIN);
    expect((( est! - 1) * dF) / (span - 1)).toBeLessThan(CURVE_RATE_GARBLED_MIN);
  });

  it('PLANT CR19: the estimate has no answer below two samples either', () => {
    // The same loosening as CR12, on the arm with no camera bound to scan to.
    // With one line the estimate is `rate * 0 / dF`, which is camera ZERO: the
    // no-act arm would tell an author the shear is already past the bar before
    // the level starts.
    expect(curveRateOnsetEstimate('FACTOR_1_8', 'FACTOR_1_2', 1, CURVE_RATE_GARBLED_MIN)).toBeNull();
    expect(curveRateOnsetEstimate('FACTOR_1_8', 'FACTOR_1_2', 0, CURVE_RATE_GARBLED_MIN)).toBeNull();
    expect(curveRateOnsetEstimate('FACTOR_1_8', 'FACTOR_1_2', 2, CURVE_RATE_GARBLED_MIN))
      .not.toBeNull();
  });
});
