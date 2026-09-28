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
//   - an odd-width stroke's CENTRE goes on a device half-pixel, `(round(v * dpr) + 0.5)
//     / dpr`, and an even-width one's on a whole device pixel (below);
//   - its WIDTH is a whole number of device pixels: the one nearest `w * dpr` with the
//     same parity as `w`, ties going thinner. So a 1 px line stays an ODD device width
//     and covers whole device rows, as it always did at dpr 1.
//
// ⚠ `snapStroke` CENTRES EVERY WIDTH ON A HALF-PIXEL, which gives an EVEN device width
// (every 2 px line, at every dpr) a half-covered row or column at each edge. The chrome
// this file was written for drew that way at dpr 1 too, because it drew at
// `Math.round(v) + 0.5` before it came here. It is NOT "the look every 2 px line always
// had": an outline stroked at `2 / zoom` in world units on an integer device edge covers
// two WHOLE columns, which is how MapViewport's stamp ghost and marquee and classic's
// stamp-drag preview drew before rows 237 and 238 (measured,
// docs/reviews/2026-09-28-device-grid-238.md).
//
// SO EVERY STROKE NOW GOES THROUGH `snapStrokeEdges`, which puts BOTH edges of every
// width on whole device pixels: rows 237/238's helpers below, and since ROADMAP row 239
// (a) (ruled 2026-09-28) the older chrome too (the screen frame, the layer guides and
// `plane_y` rules, the regions overlay). For an ODD width the answer is `snapStroke`'s,
// so the 1 px and 3 px chrome did not move; the 2 px chrome (the active frame, the
// hovered, dragged or refused guide, the selected region and the dragged region rect)
// moved half a device pixel onto two whole rows or columns
// (docs/reviews/2026-09-28-even-chrome-239.md). `snapStroke` stays for the tests that
// state the half-pixel rule; dpr-chrome.test.ts holds that no renderer code calls it.
//
// AT dpr 1 THE ODD WIDTHS REDUCE TO MASTER'S ARITHMETIC EXACTLY (`Math.round(v) + 0.5`,
// width `w`, `Math.round(len)`), and an even width to `Math.round(v)`, so a dpr-1 display
// changed only where a 2 px line is drawn. canvas/__tests__/dpr-chrome.test.ts compares
// every call against a dpr-1 golden (re-recorded for row 239, with the reason beside it),
// and scratchpad/dpr-guides-offset-harness.mjs hashes the map's backing store against a
// baseline build.

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
 *
 * ⚠ NO RENDERER CODE CALLS THIS (ROADMAP row 239 (a); dpr-chrome.test.ts's census):
 * for an EVEN width the half-pixel centre half-covers a device row at each edge. Draw
 * through `snapStrokeEdges`, which gives this same answer for every odd width.
 */
export function snapStroke(cssAt: number, cssWidth: number, dpr: number): SnappedStroke {
  return {
    at: (Math.round(cssAt * dpr) + 0.5) / dpr,
    width: deviceStrokeWidth(cssWidth, dpr) / dpr,
  };
}

/**
 * Where a stroke of `cssWidth` nearest the CSS coordinate `cssAt` goes so that BOTH of
 * its edges are on whole device pixels, at every dpr (ROADMAP row 238, ruled 2026-09-28
 * under the owner's 2026-09-18 look permission): PARITY-AWARE CENTRING. The width is
 * `deviceStrokeWidth(cssWidth, dpr)` device px, as for `snapStroke`; an ODD width centres
 * on the device half-pixel `snapStroke` picks (the same answer, so every 1 px line is
 * unchanged), and an EVEN width centres on the whole device pixel `round(cssAt * dpr)`.
 *
 * At dpr 1 a 2 px stroke on an integer edge E therefore covers columns E-1 and E, which
 * is exactly what the world-unit `2 / zoom` outlines drew before rows 237/238 snapped
 * them. Used by `strokeRectOnDeviceGrid`, `strokeCssRectOnDeviceGrid`,
 * `segmentsOnDeviceGrid` and classic's surface line, and since ROADMAP row 239 (a) by the
 * older chrome too: the screen frame, the layer guides and `plane_y` rules, and the
 * regions overlay (see the file docblock).
 */
export function snapStrokeEdges(cssAt: number, cssWidth: number, dpr: number): SnappedStroke {
  const w = deviceStrokeWidth(cssWidth, dpr);
  const c = Math.round(cssAt * dpr);
  return { at: (w % 2 === 1 ? c + 0.5 : c) / dpr, width: w / dpr };
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
 * Outline the rect (x, y, w, h), given in the context's CURRENT user space (the world,
 * under classic's `setTransform(dpr) / scale(zoom) / translate(-cam)`, or
 * MapViewport's ghost layer's `setTransform(dpr) / scale(zoom) / translate(-vp)`), as a stroke of
 * `cssWidth` CSS px ON THE DEVICE GRID (ROADMAP row 237 (b), ruled 2026-09-28).
 *
 * Drawn under the canvas's own CSS transform, `setTransform(dpr, 0, 0, dpr, 0, 0)`: the
 * top-left corner goes where `snapStrokeEdges` puts the stroke's centre (a device
 * half-pixel for an odd device width, a whole device pixel for an even one), the size is
 * a whole number of device px (`snapLength`), and the width is
 * `deviceStrokeWidth(cssWidth, dpr)` device px. So BOTH edges of every side are on whole
 * device pixels at every scale: a 1 CSS px outline covers exactly one device column, and
 * a 2 CSS px one covers two whole columns, as the world-unit `2 / zoom` outline did at
 * dpr 1 on an integer edge. (Rows 237/238 first centred every width on a half-pixel,
 * which left a 2 px outline half-covering a column at each edge; ruled a defect of this
 * helper 2026-09-28, and repaired.)
 *
 * The world-to-CSS mapping is read off the transform in force, which must be an
 * axis-aligned scale and translation (both callers' always are), and the transform is left
 * exactly as it was found.
 */
export function strokeRectOnDeviceGrid(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  cssWidth: number,
  dpr: number,
): void {
  const m = ctx.getTransform();
  strokeCssRectOnDeviceGrid(
    ctx,
    (x * m.a + m.e) / dpr, (y * m.d + m.f) / dpr, (w * m.a) / dpr, (h * m.d) / dpr,
    cssWidth, dpr,
  );
}

/**
 * `strokeRectOnDeviceGrid` for a rect the caller already has in CSS px (the canvas's own
 * frame), with no transform to read. MapViewport's ghost layer knows its camera and zoom
 * outright, so its stamp ghost and marquee outlines (row 238 (a)) come here with the
 * rect mapped by hand rather than through `getTransform()`. The same snap, the same
 * width, and `ctx`'s transform and state are left exactly as they were found.
 */
export function strokeCssRectOnDeviceGrid(
  ctx: CanvasRenderingContext2D,
  cssX: number, cssY: number, cssW: number, cssH: number,
  cssWidth: number,
  dpr: number,
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = snapStrokeEdges(0, cssWidth, dpr).width;
  ctx.strokeRect(
    snapStrokeEdges(cssX, cssWidth, dpr).at, snapStrokeEdges(cssY, cssWidth, dpr).at,
    snapLength(cssW, dpr), snapLength(cssH, dpr),
  );
  ctx.restore();
}

/**
 * Outline the INSIDE of the CSS rect (cssX, cssY, cssW, cssH) with a stroke of `cssWidth`
 * CSS px ON THE DEVICE GRID (ROADMAP row 239 (d)): the stroke's OUTER edge on each side is
 * the rect's edge rounded to a whole device pixel, and its inner edge is
 * `deviceStrokeWidth(cssWidth, dpr)` device px inside it. So both edges of every side are
 * whole device pixels, and the stroke never leaves the rect.
 *
 * It exists for the strokes that were drawn INSET in world units, `strokeRect(x + w/2, y +
 * w/2, W - w, H - w)` at `lineWidth w`: MapViewport's collision-paint block outlines. The
 * centre of each side goes through `snapStrokeEdges`, asked at a device coordinate that is
 * already whole (`floor(w/2)` in from the left or top edge, `ceil(w/2)` in from the right
 * or bottom), so the helper's own parity rule puts it at `edge + w/2` or `edge - w/2`.
 *
 * At dpr 1 a 1 CSS px inset outline on an integer edge covers exactly the column and row
 * the world-unit `1 / zoom` stroke inset by `0.5 / zoom` covered. `ctx`'s transform and
 * state are left exactly as they were found.
 */
export function strokeCssRectInsetOnDeviceGrid(
  ctx: CanvasRenderingContext2D,
  cssX: number, cssY: number, cssW: number, cssH: number,
  cssWidth: number,
  dpr: number,
): void {
  const w = deviceStrokeWidth(cssWidth, dpr);
  const lo = (edgeCss: number): number =>
    snapStrokeEdges((Math.round(edgeCss * dpr) + Math.floor(w / 2)) / dpr, cssWidth, dpr).at;
  const hi = (edgeCss: number): number =>
    snapStrokeEdges((Math.round(edgeCss * dpr) - Math.ceil(w / 2)) / dpr, cssWidth, dpr).at;
  const l = lo(cssX), t = lo(cssY), r = hi(cssX + cssW), b = hi(cssY + cssH);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = w / dpr;
  ctx.strokeRect(l, t, r - l, b - t);
  ctx.restore();
}

/**
 * An axis-aligned world-to-DEVICE mapping, `device = world * a + e` across and
 * `world * d + f` down: the part of a `DOMMatrix` `segmentsOnDeviceGrid` reads.
 */
export interface DeviceMapping { a: number; d: number; e: number; f: number }

/**
 * The mapping MapViewport's map canvas draws its overlays under: its base
 * `setTransform(dpr)`, then `OverlayRenderer.render`'s `scale(zoom)` and
 * `translate(-vpX, -vpY)`. Stated from the camera the caller already holds, for the reason
 * MapViewport's ghost maps its rects by hand (row 238 (a)): the node suite's shared
 * stub context answers `getTransform()` with `undefined`, and map-device-scale.test.ts
 * REQUIRES it to stay unanswered.
 */
export function cameraDeviceMapping(vpX: number, vpY: number, zoom: number, dpr: number): DeviceMapping {
  const k = zoom * dpr;
  return { a: k, d: k, e: -vpX * k, f: -vpY * k };
}

/** The path calls `segmentsOnDeviceGrid` answers: the shape of `MarkDrawCtx`. */
export interface SegmentPathCtx {
  strokeStyle: string;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

/**
 * A path context, in the CURRENT user space of `ctx` (the world, under an axis-aligned
 * `setTransform(dpr) / scale(zoom) / translate(-cam)`), whose straight segments are
 * stroked ON THE DEVICE GRID by the same rule as `strokeRectOnDeviceGrid` (ROADMAP row
 * 238 (c)): each segment is drawn under the canvas's CSS transform, and
 *
 *   - a HORIZONTAL segment's row goes on `snapStrokeEdges(y, w).at`, a VERTICAL one's
 *     column on `snapStrokeEdges(x, w).at` (so both of its edges are whole device px, for
 *     an odd or an even width), its two ends on `snapLength`, and its width is
 *     `deviceStrokeWidth(w, dpr)` device px, where `w` is the `lineWidth` set (in the
 *     caller's world units) mapped to CSS px;
 *   - a DIAGONAL segment is drawn where it was, at its unsnapped CSS width. The shared
 *     rule is about device rows and columns, and a slanted line crosses both; it cannot
 *     be given whole device pixels, and no rule for it is invented here.
 *
 * A segment counts as horizontal or vertical when its other axis moves less than 1e-6
 * CSS px, because the directions reaching this function come from `Math.cos` /
 * `Math.sin` (collision-needle.ts `angleNeedle`), where a quarter turn leaves ~6e-17
 * rather than zero.
 *
 * `strokeStyle` and `lineWidth` are forwarded as state; `ctx`'s transform, dash and
 * everything else are left exactly as they were found. The world-to-CSS mapping is read
 * once, when this is called: off `ctx.getTransform()`, or, when the caller already knows
 * it, from `mapping` (aeon's overlays pass `cameraDeviceMapping`, ROADMAP row 239 (d)),
 * which must then be the transform in force.
 */
export function segmentsOnDeviceGrid(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  dpr: number,
  mapping?: DeviceMapping,
): SegmentPathCtx {
  const m = mapping ?? ctx.getTransform();
  const cssX = (wx: number): number => (wx * m.a + m.e) / dpr;
  const cssY = (wy: number): number => (wy * m.d + m.f) / dpr;
  let segs: [number, number, number, number][] = [];
  let pen: [number, number] | null = null;
  const out: SegmentPathCtx = {
    strokeStyle: '',
    lineWidth: 1,
    beginPath() { segs = []; pen = null; },
    moveTo(x, y) { pen = [cssX(x), cssY(y)]; },
    lineTo(x, y) {
      const next: [number, number] = [cssX(x), cssY(y)];
      if (pen) segs.push([pen[0], pen[1], next[0], next[1]]);
      pen = next;
    },
    stroke() {
      const w = (out.lineWidth * Math.abs(m.a)) / dpr;
      const snapped = snapStrokeEdges(0, w, dpr).width;
      // ONE PATH PER WIDTH, so a caller's single stroke (the priority lens's many
      // boundary segments) stays one stroke: the snapped segments first, then any
      // diagonal ones.
      const diagonal: [number, number, number, number][] = [];
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = out.strokeStyle;
      ctx.lineWidth = snapped;
      ctx.beginPath();
      let axisAligned = 0;
      for (const seg of segs) {
        const [x0, y0, x1, y1] = seg;
        if (Math.abs(y1 - y0) < 1e-6) {
          const at = snapStrokeEdges(y0, w, dpr).at;
          ctx.moveTo(snapLength(x0, dpr), at);
          ctx.lineTo(snapLength(x1, dpr), at);
          axisAligned++;
        } else if (Math.abs(x1 - x0) < 1e-6) {
          const at = snapStrokeEdges(x0, w, dpr).at;
          ctx.moveTo(at, snapLength(y0, dpr));
          ctx.lineTo(at, snapLength(y1, dpr));
          axisAligned++;
        } else {
          diagonal.push(seg);
        }
      }
      if (axisAligned > 0) ctx.stroke();
      if (diagonal.length > 0) {
        ctx.lineWidth = w;
        ctx.beginPath();
        for (const [x0, y0, x1, y1] of diagonal) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
        ctx.stroke();
      }
      ctx.restore();
    },
  };
  return out;
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
