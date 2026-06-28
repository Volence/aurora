import { useEffect, useRef } from 'react';

/**
 * Hand-pan for a scroll-container pixel canvas: hold **Space** and drag, or drag
 * with the **middle mouse button**, to slide the view. Shared by the composer
 * (Art) and the sprite canvas.
 *
 * The pan pointerdown is handled in the CAPTURE phase on the scroller (an ancestor
 * of the drawing canvas) and stops propagation, so a Space-drag never reaches the
 * canvas and never draws. Panning is done by adjusting the container's scroll.
 */
export function useHandPan(scrollerRef: React.RefObject<HTMLDivElement | null>): void {
  const panning = useRef(false);
  const spaceDown = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const inTextField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || inTextField(e.target)) return;
      e.preventDefault(); // stop Space from scrolling the page / activating a focused button
      if (!spaceDown.current) {
        spaceDown.current = true;
        if (!panning.current) scroller.style.cursor = 'grab';
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceDown.current = false;
      if (!panning.current) scroller.style.cursor = '';
    };
    const onPointerDown = (e: PointerEvent) => {
      const wantPan = e.button === 1 || (e.button === 0 && spaceDown.current);
      if (!wantPan) return;
      e.preventDefault();
      e.stopPropagation();           // capture phase → keep it from the canvas (no draw)
      panning.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      scroller.style.cursor = 'grabbing';
      try { scroller.setPointerCapture(e.pointerId); } catch { /* */ }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!panning.current || !last.current) return;
      scroller.scrollLeft -= e.clientX - last.current.x;
      scroller.scrollTop -= e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!panning.current) return;
      panning.current = false;
      last.current = null;
      scroller.style.cursor = spaceDown.current ? 'grab' : '';
      try { scroller.releasePointerCapture(e.pointerId); } catch { /* */ }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    scroller.addEventListener('pointerdown', onPointerDown, true); // capture phase
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      scroller.removeEventListener('pointerdown', onPointerDown, true);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', onPointerUp);
    };
    // scrollerRef is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
