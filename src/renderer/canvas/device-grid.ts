// ONE CANVAS, TWO PIXEL GRIDS: how the map's chrome stays crisp without leaving the
// CSS frame.
//
// MapViewport's `redraw` sizes the map canvas's backing store in DEVICE pixels and sets
// `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, so every coordinate drawn on it is a CSS
// pixel, and every hit test on it (`clientY - rect.top`) measures CSS pixels too.
//
// ═══ THE CSS FRAME IS THE CANONICAL ONE ═══
//
// It is the frame the geometry functions publish (`layerGuideGeometry`,
// `screenFrameRect`, `surfaceGeometry`), the frame `guideAtCanvasY` and
// `screenFrameEdgeAt` read, the frame the debug reports carry, and the frame every
// other layer of the map (sections, overlays, the band wash) is drawn in. Device pixels
// are an implementation detail of ONE surface's backing store; the pointer never sees
// them.
//
// ⚠ THE DEFECT THIS FILE EXISTS FOR (docs/reviews/2026-09-12-dpr-guides-offset.md,
// first measured as docs/reviews/2026-09-12-cdp-sweep-4.md section 5.1): the layer
// guides, the `plane_y` rules, the screen frame, the camera preview and the band lens
// caption each began with `setTransform(1, 0, 0, 1, 0, 0)` and then drew CSS
// coordinates. On a dpr-1 display that is the same thing. At 1.35 it put every line at
// 1/1.35 of where its hit test grabs it: the visible guide could not be pressed, and the
// spot that grabbed showed nothing.
//
// ═══ THE CRISPNESS THE IDENTITY RESET BOUGHT IS KEPT ═══
//
// The reset was there for crisp 1 px lines ("a 1px line on an integer coordinate
// straddles two device rows"). That reason survives; the way of getting it changes. The
// chrome now draws under the canvas's own CSS transform and SNAPS in device space:
//
//   - a stroke's CENTRE goes on a device half-pixel: `(round(v * dpr) + 0.5) / dpr`;
//   - its WIDTH is a whole number of device pixels: the one nearest `w * dpr` with the
//     same parity as `w`, ties going thinner. So a 1 px line stays an ODD device width
//     and covers whole device rows, as it always did at dpr 1, and a 2 px line keeps the
//     half-covered edges it has always had at dpr 1. The look class of every line is the
//     dpr-1 one, scaled.
//
// AT dpr 1 BOTH REDUCE TO MASTER'S ARITHMETIC EXACTLY (`Math.round(v) + 0.5`, width
// `w`, `Math.round(len)`), so a dpr-1 display does not change by one pixel. That is
// asserted two ways: canvas/__tests__/dpr-chrome.test.ts compares every call against a
// golden recorded from master, and scratchpad/dpr-guides-offset-harness.mjs hashes the
// map's backing store against a master build.

/** A crisp stroke's centre and width, both in CSS px, for a canvas at `dpr`. */
export interface SnappedStroke {
  at: number;
  width: number;
}

/**
 * The whole number of DEVICE pixels a `cssWidth` stroke is drawn at on a `dpr` canvas.
 *
 * The integer nearest `cssWidth * dpr` with the same parity as `cssWidth` (rounded),
 * never less than that parity's smallest width, ties going thinner. See the file
 * docblock for why parity and not plain rounding.
 */
export function deviceStrokeWidth(cssWidth: number, dpr: number): number {
  const parity = Math.abs(Math.round(cssWidth)) % 2;
  const k = parity + 2 * Math.ceil((cssWidth * dpr - parity) / 2 - 0.5);
  return Math.max(parity === 1 ? 1 : 2, k);
}

/**
 * Where a crisp stroke of `cssWidth` nearest the CSS coordinate `cssAt` goes: its centre
 * on a device half-pixel and its width a whole number of device pixels, both expressed
 * back in CSS px for the canvas's CSS transform.
 */
export function snapStroke(cssAt: number, cssWidth: number, dpr: number): SnappedStroke {
  return {
    at: (Math.round(cssAt * dpr) + 0.5) / dpr,
    width: deviceStrokeWidth(cssWidth, dpr) / dpr,
  };
}

/**
 * A CSS length or edge rounded to a whole number of device pixels, in CSS px: the device
 * spelling of the `Math.round(v)` the chrome used to do at dpr 1, and the same number
 * there.
 */
export function snapLength(cssLength: number, dpr: number): number {
  return Math.round(cssLength * dpr) / dpr;
}
