import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Cursor-anchored wheel zoom for a scroll-container pixel canvas: the doc point
 * under the cursor stays fixed as you zoom. Used by the composer (Art) and the
 * sprite canvas, which both render a content-sized canvas inside an overflow:auto
 * scroller.
 *
 * A native non-passive `wheel` listener is required because React's onWheel is
 * passive — `preventDefault` there wouldn't stop the default scroll. The scroll
 * is re-aligned in a layout effect once the canvas has resized to the new zoom.
 *
 * @param scrollerRef the overflow:auto container element
 * @param zoom        the CURRENTLY-RENDERED zoom (px per pixel) — drives the post-zoom scroll fix
 * @param getZoom     reads the fresh current zoom inside the wheel handler (avoids stale closure)
 * @param setZoom     applies a new zoom (the store clamps/rounds)
 * @param factor      multiplier per wheel notch (default 2)
 */
export function useAnchoredZoom(
  scrollerRef: React.RefObject<HTMLDivElement | null>,
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
      const rect = scroller.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const z = zoomRef.current;
      // doc point under the cursor, in pixel units, captured before the zoom change
      anchor.current = { cx: (scroller.scrollLeft + sx) / z, cy: (scroller.scrollTop + sy) / z, sx, sy };
      setZoom(getZoom() * (e.deltaY < 0 ? factor : 1 / factor));
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
    // scrollerRef/getZoom/setZoom are stable (refs / store getState); factor is constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the canvas has resized to the new zoom, scroll so the captured doc point
  // is back under the same screen position.
  useLayoutEffect(() => {
    const a = anchor.current, scroller = scrollerRef.current;
    if (!a || !scroller) return;
    anchor.current = null;
    scroller.scrollLeft = a.cx * zoom - a.sx;
    scroller.scrollTop = a.cy * zoom - a.sy;
  }, [zoom, scrollerRef]);
}
