import { useEffect, useLayoutEffect, useRef } from 'react';
import { useAttachedEffect } from './use-attached-effect';
import { anchorAt, anchoredScroll, canvasOriginOf, AnchorSlot } from './zoom-anchor';

/**
 * Cursor-anchored wheel zoom for a scroll-container pixel canvas: the art pixel
 * under the cursor stays fixed as you zoom. Used by aeon's composer, classic's
 * tile editor and the sprite canvas, which all render a content-sized canvas
 * inside an overflow:auto scroller.
 *
 * A native non-passive `wheel` listener is required because React's onWheel is
 * passive — `preventDefault` there wouldn't stop the default scroll. The scroll
 * is re-aligned in a layout effect once the canvas has resized to the new zoom
 * (React writes the canvas's `width`/`height` during commit, so by the time a
 * layout effect runs the new size is already in the DOM, and the
 * `getBoundingClientRect` below flushes the layout that follows from it).
 *
 * THE CANVAS IS NOT THE CONTENT ORIGIN. Every host wraps the canvas in a padded
 * holder, and classic and aeon also centre it while it is smaller than the
 * viewport, so the canvas sits K px into the scrolled content and K changes with
 * the zoom. Both ends of this hook therefore measure the CANVAS's rect rather
 * than assuming the scroller's content origin; `zoom-anchor.ts` carries the
 * arithmetic and the explanation (that assumption was this hook's bug: up to
 * ~2.4 art px of drift per notch in classic's 240px box).
 *
 * AN ANCHOR IS SPENT OR DROPPED, NEVER LEFT. It only means anything for the zoom
 * change it was captured for; carried past that, the next zoom from ANY source
 * (the option bar's ZoomControl, a preset) snaps the view to a pointer position
 * the user is no longer at. `AnchorSlot` enforces the "spent" half by making the
 * read consuming; the wheel handler enforces the "dropped" half by clearing when
 * the store's clamp refused the change. One residual, small enough to leave: if
 * the STORE zoom moves while the CAPPED zoom (`zoom-cap`) does not, this hook's
 * layout effect does not run and the anchor survives to the next capped change.
 * That needs a canvas already at the 16000px ceiling — no host reaches it today.
 *
 * @param scrollerRef the overflow:auto container element
 * @param canvasRef   the CANVAS inside it — the element the art is drawn on, not
 *                    its holder, since the holder's padding is part of K
 * @param zoom        the CURRENTLY-RENDERED zoom (px per pixel) — drives the post-zoom scroll fix
 * @param getZoom     reads the fresh current zoom inside the wheel handler (avoids stale closure)
 * @param setZoom     applies a new zoom (the store clamps/rounds)
 * @param factor      multiplier per wheel notch (default 2)
 */
export function useAnchoredZoom(
  scrollerRef: React.RefObject<HTMLDivElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  zoom: number,
  getZoom: () => number,
  setZoom: (z: number) => void,
  factor = 2,
): void {
  // A one-shot slot, not a bare ref: the anchor must be spent by the ONE zoom
  // change it was captured for or dropped, and `AnchorSlot.take()` is what makes
  // "read it, then bail on a guard" impossible to write. See its docblock for
  // the two stale-anchor paths this closed.
  const slotRef = useRef<AnchorSlot | null>(null);
  if (!slotRef.current) slotRef.current = new AnchorSlot();
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // ATTACHED, NOT MOUNT-ONCE. The scrolled element can appear later than this
  // hook's first run — classic's Chunk/Block tabs mount theirs only in Paint
  // mode and open in Assign — and a `useEffect(..., [])` that returned early on
  // a null ref never ran again, leaving wheel zoom dead in the mode that has it.
  useAttachedEffect(scrollerRef, (scroller) => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const slot = slotRef.current!;
      const canvas = canvasRef.current;
      const rect = scroller.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const z = zoomRef.current;
      // The art point under the cursor, captured before the zoom change. Measured
      // off the CANVAS's rect, which already carries both the holder offset and
      // the scroll. No canvas mounted yet → zoom without anchoring rather than
      // anchoring to a lie.
      if (canvas) {
        const c = canvas.getBoundingClientRect();
        slot.capture({
          cx: anchorAt(sx, c.left - rect.left, z),
          cy: anchorAt(sy, c.top - rect.top, z),
          sx, sy,
        });
      } else {
        slot.clear();
      }
      // A ZOOM THE STORE REFUSED LEAVES NO ANCHOR BEHIND. Wheeling up at the
      // store's ceiling (or down at its floor) returns the same number, so
      // nothing re-renders and the layout effect below never runs — the anchor
      // would sit in the slot until some UNRELATED zoom change spent it (the
      // option bar's ZoomControl, which classic now exposes) and jumped the view
      // to a pointer position from another gesture. Comparing the store's own
      // value across `setZoom` asks the clamp rather than guessing its bounds,
      // which differ per host (artStore 2..64, spriteStore its own).
      const before = getZoom();
      setZoom(before * (e.deltaY < 0 ? factor : 1 / factor));
      if (getZoom() === before) slot.clear();
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  });

  // Once the canvas has resized to the new zoom, scroll so the captured art point
  // is back under the same screen position.
  useLayoutEffect(() => {
    // CONSUMING READ, and it happens before the guards on purpose: an anchor
    // belongs to the zoom change it was captured for, so bailing out below must
    // still spend it. The canvas-null guard used to sit above the line that
    // cleared the slot, which left the anchor to be applied at some later,
    // unrelated zoom.
    const a = slotRef.current!.take();
    const scroller = scrollerRef.current, canvas = canvasRef.current;
    if (!a || !scroller || !canvas) return;
    // Read the geometry AFTER the resize: `getBoundingClientRect` flushes layout,
    // so the scroll offsets read next are the browser's own re-clamped ones and
    // `canvasEdge + scroll` is the new K′ (holder padding plus whatever centring
    // slack the bigger/smaller canvas now leaves).
    const sr = scroller.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    const originX = canvasOriginOf(cr.left - sr.left, scroller.scrollLeft);
    const originY = canvasOriginOf(cr.top - sr.top, scroller.scrollTop);
    // Assigned raw: the DOM clamps to [0, scrollWidth - clientWidth] itself, and
    // that clamp is the closest reachable answer when the ask is out of range
    // (a centred canvas cannot be pushed right — see `clampScroll`).
    scroller.scrollLeft = anchoredScroll(a.cx, a.sx, originX, zoom);
    scroller.scrollTop = anchoredScroll(a.cy, a.sy, originY, zoom);
  }, [zoom, scrollerRef, canvasRef]);
}
