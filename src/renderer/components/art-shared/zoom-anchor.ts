// The arithmetic behind cursor-anchored zoom, split out of `use-anchored-zoom`
// so the suite can execute it: the hook itself is DOM wiring (a native wheel
// listener + a layout effect) that the renderer suite can neither render nor
// dispatch into, but every number it computes is pure and is HERE.
//
// THE FRAME. Three coordinate systems meet at a zoom:
//
//   * CLIENT px      — a position inside the scroller's visible box,
//                      `clientX - scrollerRect.left`. This is where the cursor is.
//   * CONTENT px     — a position inside the scrolled content. Client and content
//                      differ by exactly `scroll`.
//   * ART px         — the document's own pixels. `zoom` client px per art px.
//
// The canvas does NOT sit at content origin 0. Every host wraps it in a holder
// with padding, and two of the three also centre it (`margin: auto`) whenever
// the canvas is smaller than the viewport. So the canvas's origin in content
// coordinates is some K > 0 — 6 in classic (padding only) up to 56 (padding plus
// half the slack at zoom 16 in a 240px box), 24 in aeon and the sprite canvas.
// The pre-fix hook read the anchor as `(scroll + pointer) / zoom`, i.e. assumed
// K = 0, and so mislocated the art pixel by `K / zoom`. Because K changes with
// the zoom (the centring slack shrinks as the canvas grows), the error does not
// cancel across the zoom: the residual drift is `K/z - K'/z'` art px, up to a
// whole tile's worth at the low zooms where the canvas is centred.
//
// The fix is to measure K instead of assuming it, which the canvas's own
// `getBoundingClientRect()` gives for free — see `anchorAt`.

/** Where a client-space pointer lands in ART coordinates.
 *
 *  `canvasEdge` is `canvasRect.left - scrollerRect.left` (or the `top` pair),
 *  which is the canvas's leading edge in CLIENT px — it already includes both
 *  the holder's offset K and the current scroll, which is why the capture side
 *  needs no scroll term at all. It goes negative once the canvas is scrolled
 *  past its own origin. Fractional by construction: this is the exact point
 *  under the cursor, not the pixel index it falls in, and rounding it here is
 *  what would make a zoom creep. */
export function anchorAt(pointer: number, canvasEdge: number, zoom: number): number {
  if (!(zoom > 0)) return 0;
  return (pointer - canvasEdge) / zoom;
}

/** The canvas's origin in CONTENT px — the K above. Scroll-independent: the
 *  canvas's edge moves with the scroll and this adds it back. Measured AFTER the
 *  canvas has resized, it is the new K′, holder padding plus whatever centring
 *  slack the new canvas size leaves. */
export function canvasOriginOf(canvasEdge: number, scroll: number): number {
  return canvasEdge + scroll;
}

/** The inverse of `anchorAt` in content terms: the art coordinate that ends up
 *  under `pointer` once the scroll has settled at `scroll`. The oracle for
 *  "did the pixel stay put" — and the same quantity the CDP probe measures off
 *  the canvas rect. */
export function docUnderPointer(pointer: number, scroll: number, canvasOrigin: number, zoom: number): number {
  if (!(zoom > 0)) return 0;
  return (pointer + scroll - canvasOrigin) / zoom;
}

/** The scroll offset that puts `anchor` back under `pointer` at the new zoom.
 *  UNCLAMPED on purpose — see `clampScroll`. */
export function anchoredScroll(anchor: number, pointer: number, canvasOrigin: number, zoom: number): number {
  return anchor * zoom + canvasOrigin - pointer;
}

/** What the DOM does to any value assigned to `scrollLeft`/`scrollTop`: clamp it
 *  to `[0, scrollWidth - clientWidth]`.
 *
 *  THIS IS NOT A ROUNDING DETAIL, it is the one case the anchor cannot honour.
 *  When the content is smaller than the viewport it is CENTRED and cannot scroll
 *  at all (maxScroll = 0); when it only just overflows, the reachable range is
 *  short. Anchoring the cursor over the left half of a centred canvas asks for a
 *  NEGATIVE scroll — "hold the canvas further right than its own origin" — which
 *  no scroll container can express, because there is no way to show empty space
 *  before content that overflows after. The clamp then puts the canvas as close
 *  to the ask as the container allows, which is the closest the pixel can get to
 *  staying under the cursor: `anchoredScroll` is monotonic in the scroll, so the
 *  clamped endpoint is the residual MINIMUM, not just an arbitrary fallback.
 *
 *  The hook does not call this — it assigns the raw value and lets the DOM clamp,
 *  which avoids second-guessing a fractional `scrollWidth`. It is exported (and
 *  tested) because the clamp is where the worst measured drift came from, and a
 *  test that skips it would not model the failure at all. */
export function clampScroll(desired: number, maxScroll: number): number {
  if (!Number.isFinite(desired)) return 0;
  const max = Math.max(0, maxScroll);
  return Math.min(max, Math.max(0, desired));
}

/** What one wheel notch captures: the art point under the cursor (`cx`,`cy`) and
 *  the client-space point it has to end up back under (`sx`,`sy`). */
export interface ZoomAnchor { cx: number; cy: number; sx: number; sy: number }

/**
 * The one-shot slot a captured anchor lives in between the wheel event and the
 * layout effect that spends it.
 *
 * WHY A TYPE AND NOT A BARE REF: an anchor is only meaningful for the ONE zoom
 * change it was captured for, and the hook's two ways of leaving a stale one
 * behind were both "we did not reach the line that clears it":
 *
 *   * the wheel fired but the zoom did not move (already at the store's clamp),
 *     so nothing re-rendered and the layout effect never ran at all; then the
 *     NEXT zoom change from any source — the option bar's ZoomControl, a preset —
 *     spent an anchor captured at a pointer position from minutes ago and the
 *     view jumped;
 *   * the layout effect ran but returned early on its canvas/scroller guard,
 *     which sat ABOVE the assignment that cleared the slot.
 *
 * `take()` is therefore a CONSUMING read: it empties the slot before the caller
 * has a chance to bail, so the second failure cannot be written. The first is
 * still the wheel handler's job — it knows whether the zoom moved — which is
 * what `clear()` is for.
 */
export class AnchorSlot {
  private a: ZoomAnchor | null = null;

  capture(a: ZoomAnchor): void { this.a = a; }

  /** Empty the slot without spending it (no canvas to anchor to, or a zoom the
   *  store refused). */
  clear(): void { this.a = null; }

  /** Take the anchor AND empty the slot. Reading IS consuming — a second call
   *  yields null, so an anchor can be applied at most once. */
  take(): ZoomAnchor | null {
    const a = this.a;
    this.a = null;
    return a;
  }

  /** For tests/diagnostics: is an anchor waiting to be spent? */
  get pending(): boolean { return this.a !== null; }
}
