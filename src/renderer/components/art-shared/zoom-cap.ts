/**
 * The one rule that keeps a zoom from producing a canvas the browser refuses to
 * back: a `<canvas>` past the platform's maximum dimension does not clip or
 * fail loudly — it comes back BLANK, and every host that renders one goes white
 * with no error. So the zoom that is DRAWN is not the zoom the store holds; it
 * is this capped value, and the same capped value must feed the hit-test (the
 * viewport maps clicks with the zoom it was handed) or clicks land on the wrong
 * pixel at the ceiling.
 *
 * Extracted from ComposerCanvas, where it was an inline `effectiveZoom` memo, so
 * classic's tile host can apply the identical rule rather than open-code a
 * second one — and so the rule itself is executable by the test suite, which
 * cannot load either .tsx host.
 */

/**
 * Maximum canvas edge in CSS px. 16384 is the smallest of the common browser
 * limits (Chrome/Skia); 16000 keeps a margin under it and is the number the
 * composer has shipped with.
 */
export const MAX_CANVAS_PX = 16000;

/**
 * Clamp `zoom` so that `contentPx * zoom` stays within `maxCanvasPx`.
 *
 * @param contentPx  the content's LARGER axis in art pixels, including any
 *                   multiplier the host draws around it (e.g. the composer's
 *                   3x3 repeat preview triples it).
 * @returns at least 1 — a content size so large that even 1x overflows still
 *          has to render at some zoom, and 0 would blank the canvas outright.
 *          Never rounds UP: the result is <= `zoom` whenever `zoom >= 1`.
 */
export function cappedZoom(zoom: number, contentPx: number, maxCanvasPx = MAX_CANVAS_PX): number {
  if (!(contentPx > 0)) return Math.max(1, zoom); // nothing to overflow (0/NaN content)
  return Math.max(1, Math.min(zoom, Math.floor(maxCanvasPx / contentPx)));
}
