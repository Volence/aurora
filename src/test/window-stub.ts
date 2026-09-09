// THE FOUR BROWSER GLOBALS A MAP SURFACE REACHES FOR, and nothing else.
//
// ═══ WHY THIS IS NOT A DOM ═══
//
// Aurora's vitest runs in the node environment: no jsdom, no react-dom, no
// testing-library (vitest.config.ts). `render-hooked.ts` supplies the missing
// half of the RECONCILER, so a function component's body and its effects both
// run in this suite. What stops it one step later is that those effects talk to
// the browser: `MapViewport` registers eight window listeners, observes its
// container, and drives a redraw loop off `requestAnimationFrame`.
//
// This file supplies exactly those, as data structures a test can read back. It
// is deliberately NOT a DOM and must never grow into one: the moment a row needs
// layout, hit-testing, real event propagation or a paint, it has stopped being
// answerable here and belongs in a foreground CDP pass. What it CAN answer is
// the question this suite could not ask at all before: a real component's real
// handler, invoked with a real event, against the real stores.
//
// ═══ WHAT EACH ONE DOES, AND WHAT IT DELIBERATELY DOES NOT ═══
//
//  • `window` is an event registry, not an EventTarget. `dispatch` calls every
//    listener registered for a type, in registration order, with the object you
//    pass. There is no capture phase, no bubbling, no `defaultPrevented`
//    plumbing — the event object is YOURS, so a handler calling
//    `e.preventDefault()` calls the function you put there, which is how a test
//    observes that it was called at all.
//
//  • `ResizeObserver` records its callback and its observed elements and NEVER
//    FIRES. A component under test has no layout, so a resize is not a thing
//    that can honestly happen here; `resize()` exists so a row that wants the
//    redraw path can ask for it explicitly and be seen to have done so.
//
//  • `requestAnimationFrame` HANDS BACK A HANDLE AND RUNS NOTHING. This is the
//    load-bearing refusal in the file. MapViewport's redraw loop re-arms itself
//    from inside its own callback, so a stub that ran the callback would spin
//    forever inside `flush()`. `frame()` runs one queued callback, once, for a
//    row that means to step the loop.
//
//  • `cancelAnimationFrame` drops a queued callback, so a cleanup that cancels
//    is observable through `pendingFrames()`.
//
// ═══ IT REFUSES A REAL BROWSER ═══
//
// If a real `window` is present (someone gave this file's suite a DOM
// environment) `installWindowStub` THROWS rather than shadowing it. A stub that
// quietly replaced jsdom would make every row in the file measure the stub while
// reading as though it measured a browser — and the row would keep passing.

interface Listener { type: string; fn: (e: unknown) => void }

interface ObserverRecord {
  callback: () => void;
  targets: unknown[];
  disconnected: boolean;
}

export interface WindowStub {
  /**
   * Call every listener registered for `type`, in registration order, with
   * `event`. Returns how many ran, so a row can assert it was not zero — a
   * dispatch to an empty registry is the silent no-op that makes a behavioural
   * test read like a passing one.
   */
  dispatch(type: string, event: unknown): number;
  /** How many listeners are registered for `type` right now. */
  listenerCount(type: string): number;
  /** Every event type with at least one listener, in registration order. */
  listenerTypes(): string[];
  /** The ResizeObservers constructed since install, newest last. */
  observers(): ObserverRecord[];
  /** Fire every live ResizeObserver's callback once. */
  resize(): number;
  /** How many animation-frame callbacks are queued and uncancelled. */
  pendingFrames(): number;
  /** Run the oldest queued animation-frame callback, once. Returns whether one ran. */
  frame(): boolean;
  /**
   * Set `window.devicePixelRatio`, or take it away again with `undefined`.
   *
   * ⚠ IT IS NOT SET BY DEFAULT, ON PURPOSE. There is no display here, so this
   * stub cannot honestly report one, and a default of 1 would let a surface that
   * IGNORES the device scale pass every row -- which is exactly the state
   * `MapViewport` was in. A row that cares about the scale factor must therefore
   * declare one, and a row that does not gets `undefined` and exercises the
   * component's own no-display fallback, which is the production path in this
   * suite anyway.
   *
   * Pass a hostile value (NaN, 0, a string) to drive the fallback deliberately:
   * a real host can report all three when a window is mid-move between displays.
   */
  setDevicePixelRatio(value: unknown): void;
  /**
   * Put the globals back exactly as they were: a key this stub DEFINED is
   * deleted, and a key that already existed is restored to its prior value. Safe
   * to call twice.
   */
  restore(): void;
}

type Globals = Record<string, unknown>;

const KEYS = ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;

export function installWindowStub(): WindowStub {
  const g = globalThis as unknown as Globals;
  const existing = g.window;
  if (existing !== undefined && existing !== null) {
    throw new Error(
      'installWindowStub: a real `window` is already defined. This stub is for the node '
      + 'environment only; shadowing a DOM would make every row in this file measure the '
      + 'stub while reading as though it measured a browser. Delete the stub from this '
      + 'file, or take the DOM environment away from it.',
    );
  }

  const had = new Map<string, { present: boolean; value: unknown }>();
  for (const k of KEYS) had.set(k, { present: k in g, value: g[k] });

  const listeners: Listener[] = [];
  const observerRecords: ObserverRecord[] = [];
  let frames: Array<{ handle: number; fn: () => void; cancelled: boolean }> = [];
  let nextHandle = 1;
  let restored = false;

  const windowStub: Record<string, unknown> = {
    addEventListener(type: string, fn: (e: unknown) => void): void {
      listeners.push({ type, fn });
    },
    removeEventListener(type: string, fn: (e: unknown) => void): void {
      const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
  };

  class ResizeObserverStub {
    private readonly record: ObserverRecord;
    constructor(callback: () => void) {
      this.record = { callback, targets: [], disconnected: false };
      observerRecords.push(this.record);
    }
    observe(target: unknown): void { this.record.targets.push(target); }
    unobserve(target: unknown): void {
      const at = this.record.targets.indexOf(target);
      if (at >= 0) this.record.targets.splice(at, 1);
    }
    disconnect(): void { this.record.disconnected = true; }
  }

  g.window = windowStub;
  g.ResizeObserver = ResizeObserverStub;
  g.requestAnimationFrame = (fn: () => void): number => {
    const handle = nextHandle++;
    frames.push({ handle, fn, cancelled: false });
    return handle;
  };
  g.cancelAnimationFrame = (handle: number): void => {
    const f = frames.find((x) => x.handle === handle);
    if (f) f.cancelled = true;
  };

  return {
    dispatch(type, event) {
      // A copy: a handler that removes a listener (every one of MapViewport's
      // cleanups does) must not shorten the list we are walking.
      const hit = listeners.filter((l) => l.type === type);
      for (const l of hit) l.fn(event);
      return hit.length;
    },
    setDevicePixelRatio(value) {
      if (value === undefined) delete windowStub.devicePixelRatio;
      else windowStub.devicePixelRatio = value;
    },
    listenerCount: (type) => listeners.filter((l) => l.type === type).length,
    listenerTypes: () => [...new Set(listeners.map((l) => l.type))],
    observers: () => [...observerRecords],
    resize() {
      const live = observerRecords.filter((o) => !o.disconnected);
      for (const o of live) o.callback();
      return live.length;
    },
    pendingFrames: () => frames.filter((f) => !f.cancelled).length,
    frame() {
      const next = frames.find((f) => !f.cancelled);
      if (!next) return false;
      frames = frames.filter((f) => f !== next);
      next.fn();
      return true;
    },
    restore() {
      if (restored) return;
      restored = true;
      for (const k of KEYS) {
        const prior = had.get(k)!;
        if (prior.present) g[k] = prior.value;
        else delete g[k];
      }
    },
  };
}
