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
import {
  deviceStrokeWidth, segmentsOnDeviceGrid, cameraDeviceMapping, snapStroke, snapStrokeEdges, snapLength,
} from '../device-grid';
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
// casing 3; the stem's core, 1.25 times ARROW_WIDTH_SCALE (1.6 = 8/5), and its casing,
// that core plus the bar's margin 1.75 (= 15/4, ROADMAP row 240 (c), `stemWidths`: it
// was 3 x 1.6 before); the 1 px chrome; the 1.5 px outlines; and a sub-half width below
// the parity's even floor. `world` is the arithmetic a width reaches the adapter by in
// world units (`u` is the caller's zoom), where it is not `base / u * scale`.
const SCALE: Q = q(8, 5);
const WIDTHS: { name: string; base: Q; scale: Q; world?: (u: number) => number }[] = [
  { name: 'bar core 1.25', base: q(5, 4), scale: q(1) },
  { name: 'bar casing 3', base: q(3), scale: q(1) },
  { name: 'stem core 1.25 x 1.6', base: q(5, 4), scale: SCALE },
  {
    name: 'stem casing 1.25 x 1.6 + (3 - 1.25)', base: q(15, 4), scale: q(1),
    world: (u) => (1.25 / u) * ARROW_WIDTH_SCALE + (3 / u - 1.25 / u),
  },
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
function aeonPathWidth(base: number, scale: number, zoom: number, dpr: number, world?: (u: number) => number): number {
  const r = recordingContext();
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(zoom, zoom);
  const p = segmentsOnDeviceGrid(r.ctx, dpr, cameraDeviceMapping(0, 0, zoom, dpr));
  p.lineWidth = world ? world(zoom) : scale === 1 ? base / zoom : (base / zoom) * scale;
  p.beginPath(); p.moveTo(0, 5); p.lineTo(10, 5); p.stroke();
  return r.strokes[0].width;
}

/** Classic's path: the mapping read off `setTransform(dpr) / scale(zoom)`, and its
 *  `zoomScale = getTransform().a / dpr` dividing the width (classic-overlays drawCollision). */
function classicPathWidth(base: number, scale: number, zoom: number, dpr: number, world?: (u: number) => number): number {
  const r = recordingContext();
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(zoom, zoom);
  const zoomScale = r.ctx.getTransform().a / dpr;
  const p = segmentsOnDeviceGrid(r.ctx, dpr);
  p.lineWidth = world ? world(zoomScale) : scale === 1 ? base / zoomScale : (base / zoomScale) * scale;
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
            .map((z) => ({ z, got: path(val(w.base), val(w.scale), z, val(d), w.world) }))
            .filter(({ got }) => Math.abs(got - o.width) > 1e-9)
            .map(({ z, got }) => `zoom ${z}: ${got}`);
          expect(bad, `want ${o.width} device px at every zoom`).toEqual([]);
        });
      }
    }
  });
}

// ═══ A STROKE POSITION AT A TIE IS DECIDED BY A RULE TOO (ROADMAP row 242) ═══
//
// Where a stroke goes is one more rounding: `round(cssAt * dpr)` picks the device pixel
// its centre goes on (or next to, for an odd width), and `snapLength` rounds an end or a
// size the same way. A device coordinate of exactly k + 0.5 is a tie, and the float
// paths the renderers use arrive on either side of it: aeon's `cameraDeviceMapping` puts
// world 48 at zoom 3.3, camera 13, dpr 1 on 115.49999999999997, where the exact value is
// (48 - 13) * 33 / 10 = 115.5. Rule: a position tie goes UP (toward +infinity), which is
// `Math.round`'s own half-up, the answer every EXACT tie already got. Expectations come
// from the exact rational oracle below, never from the current output.

/** The device pixel the rule rounds an exact rational device coordinate to: half-up. */
const devicePixel = (n: number, d: number): number => Math.floor((2 * n + d) / (2 * d));
/** Whether the exact rational device coordinate n / d is a position tie (k + 0.5). */
const isPositionTie = (n: number, d: number): boolean =>
  (2 * n) % d === 0 && Math.abs((2 * n) / d) % 2 === 1;

/** The CSS x `segmentsOnDeviceGrid` computes for world x `wx` under aeon's camera mapping. */
function aeonCssX(wx: number, camX: number, zoom: number, dpr: number): number {
  const m = cameraDeviceMapping(camX, 0, zoom, dpr);
  return (wx * m.a + m.e) / dpr;
}

describe('the premise: a position tie reaches the snap below its exact value', () => {
  it('zoom 3.3, camera 13, world 48, dpr 1 is the exact tie 115.5 and arrives as 115.49999999999997', () => {
    // exact: (48 - 13) * (33 / 10) * 1 = 1155 / 10.
    expect(isPositionTie(1155, 10)).toBe(true);
    expect(devicePixel(1155, 10)).toBe(116);
    const css = aeonCssX(48, 13, 3.3, 1);
    expect(css * 1).toBe(115.49999999999997);
    expect(css * 1).toBeLessThan(115.5);
  });
});

describe('a position tie through segmentsOnDeviceGrid goes up, and the width does not change', () => {
  // Vertical segment at world x 48, zoom 3.3, camera 13, dpr 1: exact device x 115.5, a
  // tie, so the rule's pixel is 116. A 1 px stroke (odd, 1 device px) centres on 116.5,
  // edges 116 and 117; a 2 px stroke (even, 2 device px) centres on 116, edges 115 and
  // 117. A horizontal segment from world x 48 to 60 has its ends at exact 115.5 (a tie,
  // 116) and (60 - 13) * 3.3 = 155.1 (not a tie, 155).
  const zoom = 3.3, camX = 13, dpr = 1;
  const draw = (lineCss: number, vertical: boolean) => {
    const r = recordingContext();
    r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = segmentsOnDeviceGrid(r.ctx, dpr, cameraDeviceMapping(camX, 0, zoom, dpr));
    p.lineWidth = lineCss / zoom;
    p.beginPath();
    if (vertical) { p.moveTo(48, 0); p.lineTo(48, 10); } else { p.moveTo(48, 5); p.lineTo(60, 5); }
    p.stroke();
    return r.strokes[0];
  };

  it('a 1 px vertical line centres on 116.5 (edges 116 and 117), width 1', () => {
    const s = draw(1, true);
    expect(s.pts.map((pt) => pt[0])).toEqual([116.5, 116.5]);
    expect(s.width).toBe(1);
  });

  it('a 2 px vertical line centres on 116 (edges 115 and 117), width 2', () => {
    const s = draw(2, true);
    expect(s.pts.map((pt) => pt[0])).toEqual([116, 116]);
    expect(s.width).toBe(2);
  });

  it('a horizontal line\'s tied end goes to 116 and its untied end stays on 155', () => {
    const s = draw(1, false);
    expect(s.pts.map((pt) => pt[0])).toEqual([116, 155]);
  });
});

describe('every position, tie or not, on a sweep of the camera path follows the rule', () => {
  // Zooms n / 20 for n = 3..160 (0.15 to 8), row 240's dprs, cameras 0..12, worlds 0..40:
  // the exact device x is (world - cam) * zn * dn / (20 * dd).
  const dprs: Q[] = DPRS;
  it('snapStrokeEdges (1 px and 2 px), snapStroke (1 px) and snapLength land on the rule\'s pixel', () => {
    let ties = 0;
    let noisyTies = 0;
    const bad: string[] = [];
    for (let zn = 3; zn <= 160; zn++) {
      for (const [dn, dd] of dprs) {
        const zoom = zn / 20, dpr = dn / dd;
        for (let cam = 0; cam <= 12; cam++) {
          for (let wx = 0; wx <= 40; wx++) {
            const n = (wx - cam) * zn * dn, d = 20 * dd;
            const want = devicePixel(n, d);
            if (isPositionTie(n, d)) {
              ties++;
              if (Math.round(aeonCssX(wx, cam, zoom, dpr) * dpr) !== want) noisyTies++;
            }
            const css = aeonCssX(wx, cam, zoom, dpr);
            const odd = snapStrokeEdges(css, 1, dpr);
            const even = snapStrokeEdges(css, 2, dpr);
            const half = snapStroke(css, 1, dpr);
            const len = snapLength(css, dpr);
            const off = (got: number, exp: number) => Math.abs(got - exp) > 1e-9;
            if (off(odd.at * dpr, want + 0.5) || off(even.at * dpr, want) || off(half.at * dpr, want + 0.5)
              || off(len * dpr, want)) {
              if (bad.length < 10) {
                bad.push(`zoom ${zoom} dpr ${dpr} cam ${cam} world ${wx}: device ${css * dpr}, want pixel ${want}, `
                  + `edges ${odd.at * dpr} / ${even.at * dpr}, snapStroke ${half.at * dpr}, length ${len * dpr}`);
              }
            }
            if (off(odd.width * dpr, deviceStrokeWidth(1, dpr)) || off(even.width * dpr, deviceStrokeWidth(2, dpr))) {
              if (bad.length < 10) bad.push(`zoom ${zoom} dpr ${dpr} cam ${cam} world ${wx}: width moved`);
            }
          }
        }
      }
    }
    // Anti-vacuous: the sweep holds ties, and the unfixed float path decides some wrongly.
    expect(ties).toBeGreaterThan(1000);
    expect(noisyTies).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  });

  it('a device coordinate just outside the tolerance of a tie is not a tie (nothing else changes)', () => {
    // 115.5 - 1e-6 is nearer 115; 115.5 + 1e-6 is nearer 116; 112.2 is nowhere near a tie.
    expect(snapStrokeEdges(115.5 - 1e-6, 2, 1).at).toBe(115);
    expect(snapStrokeEdges(115.5 + 1e-6, 2, 1).at).toBe(116);
    expect(snapLength(115.5 - 1e-6, 1)).toBe(115);
    expect(snapStrokeEdges(aeonCssX(47, 13, 3.3, 1), 1, 1).at).toBe(112.5);
  });
});
