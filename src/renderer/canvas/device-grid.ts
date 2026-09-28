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

/**
 * How many DEVICE pixels this display puts inside one CSS pixel, right now.
 *
 * ONE READING FOR BOTH MAP SURFACES. It was a private function of `MapViewport` (aeon's
 * map) until row 194 gave the Sonic 1 level canvas (`ClassicLevelViewport`) the same
 * device-sized backing store; it moved here rather than being copied, so the two
 * surfaces cannot disagree about what an unusable reading means.
 *
 * ⚠ DERIVED ON EVERY CALL AND NEVER CACHED, because it MOVES: dragging the window
 * to a display with a different scale factor changes it with no resize of the CSS
 * box, and on the virtual display this repo's harnesses run on it has been
 * observed at both 1 and 1.35 inside a single session. Any surface that pins
 * today's value is wrong on the next display, and a test that asserts a
 * particular number is measuring the machine rather than the code.
 *
 * ONE IS THE ANSWER FOR EVERY UNUSABLE READING, and the list is deliberate rather
 * than a `?? 1`: no window at all (both map components' bodies run in the node test
 * suite), a non-number, a NaN from a host that computed one, an Infinity, and
 * zero or negative -- each of which would otherwise produce a zero-sized or
 * inverted backing store, which paints nothing and looks exactly like a broken
 * renderer.
 */
export function deviceScale(): number {
  return usableScale(typeof window === 'undefined' ? undefined : window.devicePixelRatio);
}

/** `deviceScale`'s rule for one raw reading: every unusable value is 1. */
function usableScale(dpr: unknown): number {
  return typeof dpr === 'number' && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

/** The part of `window` the scale listener uses: a reading and `matchMedia`. */
export interface ScaleHost {
  readonly devicePixelRatio?: unknown;
  matchMedia?: (query: string) => {
    addEventListener(type: 'change', fn: () => void): void;
    removeEventListener(type: 'change', fn: () => void): void;
  };
}

/**
 * Call `listener` with the new device scale each time the display scale changes,
 * WITH OR WITHOUT a resize, until the returned function is called.
 *
 * ═══ WHY BOTH MAP SURFACES NEED IT (ROADMAP row 237) ═══
 *
 * Dragging a window to a monitor with another scale factor changes
 * `devicePixelRatio` and leaves the CSS box alone, so no ResizeObserver fires. Both
 * map canvases (`MapViewport`, `ClassicLevelViewport`) re-sized their device-pixel
 * backing store only on a resize or a repaint, so after such a move each kept its
 * old store: the picture in the right place, soft, until something else redrew it
 * (docs/reviews/2026-09-28-classic-canvas-dpr-194.md, Open). Browser zoom was never
 * affected, because it changes the CSS box.
 *
 * ═══ WHY IT RE-ARMS ═══
 *
 * There is no "the scale changed" event. The standard mechanism is a media query
 * for TODAY's scale, `(resolution: <dpr>dppx)`, whose list fires `change` when its
 * answer flips: once, when the display leaves that scale. A listener left on it is
 * deaf to every move after the first (it would fire again only on coming BACK to
 * that exact scale). So each change drops the old list's listener and arms a new
 * one on the query for the scale the display has now. At most one listener is
 * live per subscription, and the unsubscribe removes whichever one that is.
 *
 * The reading goes through `deviceScale`'s rule, so an unusable value arms on
 * `1dppx`, and the listener hears the same number the surfaces then size with.
 *
 * NO DISPLAY IS A NO-OP: no window (the node suite), or a host without
 * `matchMedia`, arms nothing and returns an unsubscribe that does nothing. `host`
 * is a parameter only so the listener can be tested against a fake display
 * (canvas/__tests__/device-scale-change.test.ts); callers pass nothing.
 */
export function onDeviceScaleChange(
  listener: (dpr: number) => void,
  host: ScaleHost | null = typeof window === 'undefined' ? null : (window as unknown as ScaleHost),
): () => void {
  if (!host || typeof host.matchMedia !== 'function') return () => undefined;
  const matchMedia = host.matchMedia.bind(host);
  let list: ReturnType<typeof matchMedia> | null = null;
  let stopped = false;
  const arm = (): void => {
    list = matchMedia(`(resolution: ${usableScale(host.devicePixelRatio)}dppx)`);
    list.addEventListener('change', onChange);
  };
  const disarm = (): void => {
    list?.removeEventListener('change', onChange);
    list = null;
  };
  function onChange(): void {
    disarm();
    if (stopped) return;
    arm();
    listener(usableScale(host!.devicePixelRatio));
  }
  arm();
  return () => {
    stopped = true;
    disarm();
  };
}
