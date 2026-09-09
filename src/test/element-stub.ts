// THE HOST ELEMENTS A MOUNTED COMPONENT'S REFS POINT AT, and the commit step
// that puts them there.
//
// ═══ WHY A COMPONENT'S REFS ARE EMPTY IN THIS SUITE ═══
//
// `render-hooked.ts` runs a function component's body and its effects, and
// returns the element tree as DATA. Nothing commits that tree, so every
// `ref={someRef}` stays null — and a surface like `MapViewport` reads its refs
// for everything that involves a coordinate: `screenToWorld` asks the canvas for
// its `getBoundingClientRect()`, and answers `{ x: 0, y: 0 }` when there is no
// element. A row that drove a pointer gesture without attaching anything would
// therefore hit-test the origin, silently, and pass by never selecting anything.
//
// `attachRefs` is the commit step, and only that step: it walks the returned tree
// and sets each `ref.current` to a host stub with the geometry the row asked for,
// which is exactly what React's commit phase does with a real DOM node.
//
// ═══ THE GEOMETRY IS THE TEST'S, DELIBERATELY ═══
//
// There is no layout here, so an element's rect cannot be computed — it has to be
// declared. That is the honest shape: a row states the viewport it is pretending
// to be, in the units the component's own arithmetic consumes, and the mapping
// from a client coordinate to a world coordinate is then the component's real
// `screenToWorld`. What this cannot check is that the rect a browser would have
// reported matches the one the row declared. That is a layout fact and belongs in
// a foreground pass.
//
// ═══ WHAT THE STUB REFUSES ═══
//
// A 2D context whose every method is a no-op, and nothing else: no pixels, no
// text metrics, no paths. Any row whose claim depends on what was DRAWN is
// unanswerable here and must not be written against this file. The context is a
// Proxy so a newly used canvas call does not throw — which is the right trade for
// a component that draws on every render and is not being tested for drawing —
// but it also means a drawing claim would pass vacuously. Do not make one.

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HostStub {
  /** Listeners attached directly to this element (MapViewport's native wheel). */
  listenerCount(type: string): number;
  /** Fire this element's own listeners for `type`. Returns how many ran. */
  dispatch(type: string, event: unknown): number;
  /** The element itself, to hand to a ref or compare against. */
  readonly el: Record<string, unknown>;
}

/**
 * THE FOUR CONTEXT CALLS WHOSE RETURN VALUE IS READ, and they are here because
 * the component under test DRAWS while it is being asked about something else.
 *
 * `MapViewport` repaints on every render, and its overlay pass fits object
 * labels — `label-fit.ts` calls `ctx.measureText(s).width` and divides by it. A
 * blanket `() => undefined` context therefore does not make drawing a no-op; it
 * makes the FIRST DRAW throw, and every row in the file fails for a reason that
 * has nothing to do with what it asked.
 *
 * `measureText` returns a width PROPORTIONAL TO THE STRING, not a constant: a
 * constant makes every label fit or none fit, and `fitLabel` would then be
 * exercised on one branch forever. It is not a font metric and no row may assert
 * on a fitted result — see the file header. What it is for is letting the draw
 * pass complete so the row's real question can be answered.
 */
const CTX_VALUES: Record<string, (...args: unknown[]) => unknown> = {
  measureText: (text: unknown) => ({ width: String(text ?? '').length * 6 }),
  createLinearGradient: () => ({ addColorStop: () => undefined }),
  createPattern: () => null,
  getImageData: (_x: unknown, _y: unknown, w: unknown, h: unknown) => ({
    width: Number(w) || 1,
    height: Number(h) || 1,
    data: new Uint8ClampedArray(4 * (Number(w) || 1) * (Number(h) || 1)),
  }),
};

const NOOP_CTX = new Proxy({}, {
  get: (_t, prop) => {
    if (typeof prop === 'string' && prop in CTX_VALUES) return CTX_VALUES[prop];
    // `canvas` is the one field read as a VALUE rather than called, and undefined
    // is the honest answer: this context belongs to no element.
    if (prop === 'canvas') return undefined;
    return () => undefined;
  },
  set: () => true,
});

/** One host element with a declared rect, an own-listener registry, and a
 *  no-op 2D context. */
export function hostElementStub(rect: Rect): HostStub {
  const own: Array<{ type: string; fn: (e: unknown) => void }> = [];
  const el: Record<string, unknown> = {
    tagName: 'DIV',
    style: {},
    width: rect.width,
    height: rect.height,
    clientWidth: rect.width,
    clientHeight: rect.height,
    offsetWidth: rect.width,
    offsetHeight: rect.height,
    innerHTML: '',
    getBoundingClientRect: () => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
    }),
    getContext: () => NOOP_CTX,
    addEventListener: (type: string, fn: (e: unknown) => void) => { own.push({ type, fn }); },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      const at = own.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) own.splice(at, 1);
    },
    querySelector: () => null,
    contains: () => false,
    focus: () => undefined,
  };
  return {
    el,
    listenerCount: (type) => own.filter((l) => l.type === type).length,
    dispatch(type, event) {
      const hit = own.filter((l) => l.type === type);
      for (const l of hit) l.fn(event);
      return hit.length;
    },
  };
}

type RefLike = { current: unknown };

function isRef(v: unknown): v is RefLike {
  return typeof v === 'object' && v !== null && 'current' in (v as Record<string, unknown>);
}

/**
 * Walk `tree` and give every `ref` prop a host stub, all sharing `rect`.
 *
 * Returns the stubs by the tag they were attached to, in tree order —
 * `byTag('canvas')[0]` is the first canvas the component rendered. A row that
 * needs a specific element asserts on that ordering rather than guessing, and
 * `attachRefs` THROWS when it attached nothing at all, because a tree whose refs
 * moved would otherwise leave every coordinate row hit-testing the origin and
 * passing.
 */
export function attachRefs(tree: unknown, rect: Rect): {
  byTag(tag: string): HostStub[];
  all(): HostStub[];
} {
  const found: Array<{ tag: string; stub: HostStub }> = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { for (const c of node) walk(c); return; }
    if (!node || typeof node !== 'object') return;
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type === undefined) return;
    const props = el.props ?? {};
    if (isRef(props.ref) && props.ref.current === null) {
      const tag = typeof el.type === 'string' ? el.type : 'component';
      const stub = hostElementStub(rect);
      (stub.el as Record<string, unknown>).tagName = tag.toUpperCase();
      props.ref.current = stub.el;
      found.push({ tag, stub });
    }
    walk(props.children);
  };

  walk(tree);
  if (found.length === 0) {
    throw new Error(
      'attachRefs: the rendered tree carried no unfilled `ref` prop, so nothing was '
      + 'attached. Either the refs moved out of the tree this was handed, or they were '
      + 'already filled. Every coordinate the component computes would resolve against '
      + 'no element, which reads exactly like a passing row.',
    );
  }

  return {
    byTag: (tag) => found.filter((f) => f.tag === tag).map((f) => f.stub),
    all: () => found.map((f) => f.stub),
  };
}
