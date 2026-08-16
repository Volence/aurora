import { useEffect, useRef, type RefObject } from 'react';

/**
 * Run `setup` against the element a ref points at, and re-run it when that
 * element APPEARS, CHANGES or GOES AWAY.
 *
 * WHY THIS EXISTS. Both `use-anchored-zoom` and `use-hand-pan` attached their
 * listeners inside a `useEffect(..., [])` that returned early when
 * `ref.current` was null. That is correct only for a host whose scrolled element
 * is mounted on the first render. Classic's Chunk and Block tabs mount theirs
 * ONLY in Paint mode and default to Assign (`classicLevelStore` ships
 * `chunkPaintMode: 'assign'`), so the effect ran once against nothing, the empty
 * dependency array kept it from ever running again, and wheel-zoom and drag-pan
 * were dead for the whole life of the component. Reported from the app as "way
 * too zoomed and I can't ctrl+scroll to zoom out" — the zoom was not stuck, the
 * listener was never there.
 *
 * A REF CANNOT BE A DEPENDENCY. Populating `ref.current` does not re-render, so
 * there is nothing to put in a dependency array that would notice. This effect
 * therefore runs on every render and compares the element it is currently
 * attached to: a reference comparison in the common case, and a re-attach
 * exactly when the element actually changed.
 *
 * The cleanup returned by `setup` is called before re-attaching and on unmount,
 * so a host that toggles its element in and out never accumulates listeners.
 */
export function useAttachedEffect<T extends HTMLElement>(
  ref: RefObject<T | null>,
  setup: (el: T) => () => void,
): void {
  const attached = useRef<T | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  // `setup` is an inline closure and changes identity every render, so it is
  // read through a ref: the effect must decide whether to re-attach from the
  // ELEMENT alone, or it would tear down and rebuild the listeners on every
  // render — which is how the anchor slot in use-anchored-zoom loses its state.
  const setupRef = useRef(setup);
  setupRef.current = setup;

  // No dependency array on purpose — see the docblock.
  useEffect(() => {
    const el = ref.current;
    if (el === attached.current) return;
    cleanup.current?.();
    cleanup.current = null;
    attached.current = el;
    if (el) cleanup.current = setupRef.current(el);
  });

  useEffect(() => () => {
    cleanup.current?.();
    cleanup.current = null;
    attached.current = null;
  }, []);
}
