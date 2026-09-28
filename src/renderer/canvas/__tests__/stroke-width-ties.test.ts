// A STROKE WIDTH AT A TIE IS DECIDED BY A RULE, NOT BY FLOATING-POINT NOISE (ROADMAP row
// 240 (b)).
//
// `deviceStrokeWidth(cssWidth, dpr)` (canvas/device-grid.ts) is the integer nearest
// `cssWidth * dpr` with the parity of `cssWidth` rounded. Two roundings have ties:
//
//   - WIDTH: `cssWidth * dpr` a whole number of the other parity, halfway between two
//     same-parity widths. Rule: THINNER, floored at the parity's smallest width.
//   - PARITY: `cssWidth` exactly k + 0.5. Rule: UP (`Math.round`'s half-up).
//
// Row 239 (d) measured the width tie decided by noise on aeon's angle marks (packet
// docs/reviews/2026-09-28-stragglers-239d.md section 6). This file does not copy its
// numbers: every expectation comes from an EXACT oracle below, in integer arithmetic on
// rational inputs, which says which (cssWidth, dpr) are ties and what the rule makes of
// them. The float inputs are then produced along the arithmetic paths the renderers
// really use (a world width `k / zoom` mapped through `segmentsOnDeviceGrid` under aeon's
// `cameraDeviceMapping` and under classic's `setTransform(dpr) / scale(zoom)`), where the
// noise lives.

import { describe, it, expect } from 'vitest';
import { recordingContext } from './chrome-recorder';
import { deviceStrokeWidth, segmentsOnDeviceGrid, cameraDeviceMapping } from '../device-grid';
import { ARROW_WIDTH_SCALE } from '../../../core/collision/collision-angle-mark';

/** A rational n / d, d > 0, both integers. */
type Q = [number, number];
const q = (n: number, d = 1): Q => [n, d];
const val = ([n, d]: Q): number => n / d;
const mul = ([a, b]: Q, [c, d]: Q): Q => [a * c, b * d];

/** round-half-up of a rational, exactly. */
const roundHalfUp = ([n, d]: Q): number => Math.floor((2 * n + d) / (2 * d));

/** The rule, exactly: the device width of a `css` stroke at `dpr`, and whether it was a tie. */
function oracle(css: Q, dpr: Q): { width: number; widthTie: boolean; parityTie: boolean } {
  const parity = Math.abs(roundHalfUp(css)) % 2;
  const parityTie = (2 * css[0]) % css[1] === 0 && ((2 * css[0]) / css[1]) % 2 !== 0;
  const [xn, xd] = mul(css, dpr);
  const whole = xn % xd === 0;
  const widthTie = whole && Math.abs(xn / xd) % 2 !== parity;
  let k: number;
  if (widthTie) {
    k = xn / xd - 1; // thinner
  } else {
    // Not a tie, so the nearest same-parity integer is unambiguous and the float finds it:
    // the distance to the nearest tie is at least 1 / (2 * xd).
    k = parity + 2 * Math.round((xn / xd - parity) / 2);
  }
  return { width: Math.max(parity === 1 ? 1 : 2, k), widthTie, parityTie };
}

// The CSS widths the renderers stroke at, as exact rationals: the marks' core 1.25 and
// casing 3, each also times ARROW_WIDTH_SCALE (1.6 = 8/5) for the stem; the 1 px chrome;
// the 1.5 px outlines; and a sub-half width below the parity's even floor.
const SCALE: Q = q(8, 5);
const WIDTHS: { name: string; base: Q; scale: Q }[] = [
  { name: 'bar core 1.25', base: q(5, 4), scale: q(1) },
  { name: 'bar casing 3', base: q(3), scale: q(1) },
  { name: 'stem core 1.25 x 1.6', base: q(5, 4), scale: SCALE },
  { name: 'stem casing 3 x 1.6', base: q(3), scale: SCALE },
  { name: '1 px chrome', base: q(1), scale: q(1) },
  { name: '1.5 px outline', base: q(3, 2), scale: q(1) },
  { name: '2 px chrome', base: q(2), scale: q(1) },
  { name: '0.4 px (below the even floor)', base: q(2, 5), scale: q(1) },
];
const DPRS: Q[] = [q(1), q(5, 4), q(27, 20), q(3, 2), q(8, 5), q(7, 4), q(2), q(5, 2), q(3), q(4)];
// Zooms the map can reach (clamped to [0.125, 8], continuous under the wheel): named
// ones, the keyboard's x1.5 chain from 1, and an even sweep of the whole range, because
// which zooms put noise on a tie is not a pattern a short list catches (the bar casing at
// dpr 2 goes thicker at none of the 1/16 steps and at some of the sweep's).
const ZOOMS: number[] = [0.125, 0.25, 0.5, 0.75, 1, 1.0625, 1.5, 2, 2.125, 2.25, 3, 3.3, 3.375, 3.625, 5.0625, 7.59375, 8,
  1 / 1.5, 1 / 1.5 / 1.5,
  ...Array.from({ length: 400 }, (_, i) => 0.125 + (7.875 * i) / 399)];

describe('the premise: the rational inputs contain ties, and the float paths put noise on them', () => {
  it('the oracle finds width ties among the renderers\' widths (anti-vacuous)', () => {
    const ties = WIDTHS.flatMap((w) => DPRS.filter((d) => oracle(mul(w.base, w.scale), d).widthTie));
    expect(ties.length).toBeGreaterThanOrEqual(8);
  });

  it('the oracle finds a width tie whose thinner neighbour is 0, so the floor is exercised', () => {
    expect(oracle(q(2, 5), q(5, 2))).toEqual({ width: 2, widthTie: true, parityTie: false });
  });

  it('aeon\'s stem-core path lands ABOVE its tie at dpr 1.5, zoom 1.5 (the noise is real)', () => {
    const zoom = 1.5, dpr = 1.5;
    const lineWidth = (1.25 / zoom) * ARROW_WIDTH_SCALE;
    const css = (lineWidth * Math.abs(zoom * dpr)) / dpr;
    expect(css * dpr).toBeGreaterThan(3);
    expect(oracle(mul(q(5, 4), SCALE), q(3, 2)).widthTie).toBe(true);
  });

  it('a 1.5 px width through `(1.5 / zoom) * zoom` lands BELOW its parity tie at some zoom (the noise is real)', () => {
    const below = ZOOMS.concat(Array.from({ length: 400 }, (_, i) => 0.125 + i * 0.019))
      .filter((z) => ((1.5 / z) * Math.abs(z * 1)) / 1 < 1.5);
    expect(below.length).toBeGreaterThan(0);
  });
});

describe('deviceStrokeWidth on exact inputs follows the rule', () => {
  for (const w of WIDTHS) {
    it(`${w.name}: every dpr`, () => {
      const css = mul(w.base, w.scale);
      const bad: string[] = [];
      for (const d of DPRS) {
        const want = oracle(css, d).width;
        const got = deviceStrokeWidth(val(css), val(d));
        if (got !== want) bad.push(`dpr ${val(d)}: ${got}, want ${want}`);
      }
      expect(bad).toEqual([]);
    });
  }
});

/**
 * The device width `segmentsOnDeviceGrid` strokes a horizontal segment at, when the caller
 * sets its lineWidth in WORLD units as the renderers do.
 */
function aeonPathWidth(base: number, scale: number, zoom: number, dpr: number): number {
  const r = recordingContext();
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(zoom, zoom);
  const p = segmentsOnDeviceGrid(r.ctx, dpr, cameraDeviceMapping(0, 0, zoom, dpr));
  p.lineWidth = scale === 1 ? base / zoom : (base / zoom) * scale;
  p.beginPath(); p.moveTo(0, 5); p.lineTo(10, 5); p.stroke();
  return r.strokes[0].width;
}

/** Classic's path: the mapping read off `setTransform(dpr) / scale(zoom)`, and its
 *  `zoomScale = getTransform().a / dpr` dividing the width (classic-overlays drawCollision). */
function classicPathWidth(base: number, scale: number, zoom: number, dpr: number): number {
  const r = recordingContext();
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(zoom, zoom);
  const zoomScale = r.ctx.getTransform().a / dpr;
  const p = segmentsOnDeviceGrid(r.ctx, dpr);
  p.lineWidth = scale === 1 ? base / zoomScale : (base / zoomScale) * scale;
  p.beginPath(); p.moveTo(0, 5); p.lineTo(10, 5); p.stroke();
  return r.strokes[0].width;
}

for (const [name, path] of [['aeon (cameraDeviceMapping)', aeonPathWidth], ['classic (getTransform)', classicPathWidth]] as const) {
  describe(`a world width through ${name}: ONE width per (width, dpr) at every zoom`, () => {
    for (const w of WIDTHS) {
      for (const d of DPRS) {
        const o = oracle(mul(w.base, w.scale), d);
        const label = `${w.name}, dpr ${val(d)}${o.widthTie ? ' (WIDTH TIE)' : ''}${o.parityTie ? ' (PARITY TIE)' : ''}`;
        it(label, () => {
          const bad = ZOOMS
            .map((z) => ({ z, got: path(val(w.base), val(w.scale), z, val(d)) }))
            .filter(({ got }) => Math.abs(got - o.width) > 1e-9)
            .map(({ z, got }) => `zoom ${z}: ${got}`);
          expect(bad, `want ${o.width} device px at every zoom`).toEqual([]);
        });
      }
    }
  });
}
