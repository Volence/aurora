import { useEffect, useLayoutEffect, useRef } from 'react';
import { anchorAt, anchoredScroll, canvasOriginOf } from './zoom-anchor';

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
  const anchor = useRef<{ cx: number; cy: number; sx: number; sy: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
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
        anchor.current = {
          cx: anchorAt(sx, c.left - rect.left, z),
          cy: anchorAt(sy, c.top - rect.top, z),
          sx, sy,
        };
      } else {
        anchor.current = null;
      }
      setZoom(getZoom() * (e.deltaY < 0 ? factor : 1 / factor));
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
    // scrollerRef/canvasRef/getZoom/setZoom are stable (refs / store getState); factor is constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the canvas has resized to the new zoom, scroll so the captured art point
  // is back under the same screen position.
  useLayoutEffect(() => {
    const a = anchor.current, scroller = scrollerRef.current, canvas = canvasRef.current;
    if (!a || !scroller || !canvas) return;
    anchor.current = null;
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
