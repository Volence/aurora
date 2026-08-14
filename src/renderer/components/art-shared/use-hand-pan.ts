import { useEffect, useRef } from 'react';

export interface HandPanOptions {
  /**
   * Gate for the WINDOW-level Space keydown, read fresh on every event. Return
   * false and the key is left entirely alone — no `preventDefault`, no arming.
   *
   * WHY IT IS A CALLER'S PREDICATE AND NOT A FIXED RULE IN HERE: this hook has
   * three hosts and they do not share a keyboard owner. Classic's TileTab and
   * aeon's ComposerCanvas are LEVEL-side surfaces that stay mounted (hidden) while
   * a sprite-doc tab is active — App.tsx's tab pane is `display:none`, not
   * unmounted — so every window handler they register must go inert then, which is
   * `levelKeysEnabled()` (workspace/level-keys.ts). SpriteMode is the third host
   * and is the very thing that predicate goes false for; gating it on the same
   * rule would leave the sprite canvas unable to pan at all. So the rule lives at
   * the three call sites, exactly as it does for every other level-side window
   * handler (see composer-shared's `useEscapeKey`).
   *
   * Omitted = always enabled, which is what SpriteMode wants.
   */
  enabled?: () => boolean;
}

/**
 * Hand-pan for a scroll-container pixel canvas: hold **Space** and drag, or drag
 * with the **middle mouse button**, to slide the view. Shared by the composer
 * (Art), classic's tile editor and the sprite canvas.
 *
 * The pan pointerdown is handled in the CAPTURE phase on the scroller (an ancestor
 * of the drawing canvas) and stops propagation, so a Space-drag never reaches the
 * canvas and never draws. Panning is done by adjusting the container's scroll.
 *
 * The POINTER listeners need no gate: they are bound to the scroller element
 * itself, which a hidden pane cannot deliver events to. Only the keydown is on
 * `window`, and only it takes `opts.enabled`.
 */
export function useHandPan(
  scrollerRef: React.RefObject<HTMLDivElement | null>,
  opts: HandPanOptions = {},
): void {
  const panning = useRef(false);
  const spaceDown = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  // Through a ref because the listener below is bound once, on mount: a gate read
  // out of the effect's closure would be whatever was passed on the first render.
  const enabledRef = useRef(opts.enabled);
  enabledRef.current = opts.enabled;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const inTextField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const gate = enabledRef.current;
      if (gate && !gate()) return;   // another surface owns the keyboard — do not even preventDefault
      if (e.code !== 'Space' || inTextField(e.target)) return;
      e.preventDefault(); // stop Space from scrolling the page / activating a focused button
      if (!spaceDown.current) {
        spaceDown.current = true;
        if (!panning.current) scroller.style.cursor = 'grab';
      }
    };
    // NOT gated. It only ever DISARMS, and it must run even if the gate closed
    // mid-hold (Space down on the tile editor, tab switched, Space released) —
    // otherwise `spaceDown` stays true and the next left-click pans instead of
    // drawing. A keyup that arms nothing needs no permission.
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
