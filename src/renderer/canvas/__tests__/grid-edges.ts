// THE ROW 238 RULING, RESTATED FOR THE TESTS THAT READ ROWS 237/238's SNAPPED STROKES.
//
// Ruled 2026-09-28 (overseer, under the owner's 2026-09-18 look permission): every stroke
// rows 237/238 snapped has BOTH edges on whole device pixels at every dpr, and none is
// softer at dpr 1 than the world-unit stroke it replaced. The mechanism is parity-aware
// centring: with w = deviceStrokeWidth(cssWidth, dpr), an ODD w centres on a device
// half-pixel and an EVEN w on a whole device pixel (canvas/device-grid.ts
// `snapStrokeEdges`).
//
// These are derived from `deviceStrokeWidth` and `Math.round` only, never from
// `snapStrokeEdges` itself, so a row built on them cannot pass by re-reading the code
// under test.
//
// NOT A TEST FILE: no `.test.` in the name, so vitest does not collect it.

import { deviceStrokeWidth } from '../device-grid';

const EPS = 1e-6;

/** Where the centre of a `cssWidth` stroke nearest the device coordinate `dev` must go. */
export function expectedCentre(dev: number, cssWidth: number, dpr: number): number {
  const w = deviceStrokeWidth(cssWidth, dpr);
  return w % 2 === 1 ? Math.round(dev) + 0.5 : Math.round(dev);
}

/** Both edges of a stroke centred at `centre`, `width` device px wide, are whole px. */
export function edgesWhole(centre: number, width: number): boolean {
  const lo = centre - width / 2, hi = centre + width / 2;
  return Math.abs(lo - Math.round(lo)) < EPS && Math.abs(hi - Math.round(hi)) < EPS;
}
