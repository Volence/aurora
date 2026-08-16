import { useEffect, useRef } from 'react';
import { useAttachedEffect } from './use-attached-effect';

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

  // ATTACHED, NOT MOUNT-ONCE — same reason as use-anchored-zoom: a host may
  // mount its scrolled element later than this hook's first run, and an empty
  // dependency array left drag-pan permanently dead when it did.
  useAttachedEffect(scrollerRef, (scroller) => {
    /**
     * Does the focused element own Space itself?
     *
     * This listener is on the WINDOW, so it fires wherever focus happens to be
     * — and it used to preventDefault Space for everything except text fields.
     * Space is also how a keyboard user presses a focused BUTTON, so while any
     * pixel surface was mounted, Space-to-press was dead across the whole app:
     * every toolbar button, every chip, every dialog's Save. The hand-pan is a
     * gesture on a canvas; a focused control outranks it.
     */
    const ownsSpace = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el || !el.tagName) return false;
      if (el.isContentEditable) return true;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY', 'OPTION'].includes(el.tagName)) return true;
      return el.getAttribute('role') === 'button' || el.getAttribute('role') === 'checkbox';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const gate = enabledRef.current;
      if (gate && !gate()) return;   // another surface owns the keyboard — do not even preventDefault
      if (e.code !== 'Space' || ownsSpace(e.target)) return;
      e.preventDefault(); // stop Space from scrolling the page
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
  });
}
