// A minimal React renderer for ONE function component, for a suite with no DOM.
//
// WHY THIS EXISTS. Aurora's vitest runs in the node environment: no jsdom, no
// react-dom, no testing-library. Existing component rows work around that by
// CALLING a component as a plain function and walking the element tree it
// returns (see object-inspector-field-bounds.test.ts) — which works only while
// the component takes no hooks. `NumberField` now holds a text buffer, so that
// technique stops at the first `useState`, and the only handler that can
// observe the empty-box defect is the one on the `<input>` inside it.
//
// WHAT THIS IS, EXACTLY. React's hooks are thin wrappers that forward to the
// CURRENT DISPATCHER — `internals.H`. Installing a dispatcher here means the
// component under test calls REAL `React.useState` / `useRef` / `useEffect`,
// imported from the real react package, and lands in the store below. This is
// not a re-implementation of the component's hooks; it is a re-implementation
// of the reconciler's hook storage, which is the part a DOM would otherwise
// have brought along.
//
// WHAT IT IS NOT. No scheduler, no batching semantics, no concurrent features,
// no children are rendered (the element tree is returned as data, exactly as
// the plain-function technique returns it). Anything past that is a browser
// fact and belongs in a foreground pass, not here.
//
// LOUD ON UNMEASURABLE. If React ever stops exposing the dispatcher slot, or a
// component reaches for a hook this store does not implement, these throw with
// the hook's name rather than rendering something subtly wrong.

import React from 'react';

const INTERNALS_KEY = '__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE';

interface DispatcherSlot { H: unknown }

function internals(): DispatcherSlot {
  const slot = (React as unknown as Record<string, DispatcherSlot | undefined>)[INTERNALS_KEY];
  if (!slot || !('H' in slot)) {
    throw new Error(
      `renderHooked: react ${React.version} does not expose ${INTERNALS_KEY}.H: `
      + 'this harness can no longer install a hook dispatcher, so every row that '
      + 'uses it is unmeasurable rather than passing.',
    );
  }
  return slot;
}

type Cell =
  | { kind: 'state'; value: unknown }
  | { kind: 'ref'; ref: { current: unknown } }
  | { kind: 'effect'; deps: unknown[] | undefined; cleanup: (() => void) | void }
  | { kind: 'memo'; deps: unknown[] | undefined; value: unknown };

interface PendingEffect { index: number; run: () => (() => void) | void }

export interface Hooked<P> {
  /** The element tree the component last returned, after all pending work. */
  el(): React.ReactElement;
  /** Find the first descendant element with this tag/type. Throws if absent. */
  find(type: unknown): React.ReactElement<Record<string, unknown>>;
  /** Re-render with changed props — what a parent re-render does. */
  setProps(next: Partial<P>): void;
  /** The props the component is currently rendered with. */
  props(): P;
  /** How many times the component body has run. Guards against a dead harness. */
  renders(): number;
}

/**
 * Render `Component` with `props` and keep it alive across state updates.
 *
 * State updates and effects are flushed EAGERLY — before this returns, and
 * before every `el()` / `find()` / `setProps()`. A test therefore calls a
 * handler off the returned tree and then reads the tree again, and sees what a
 * browser would have painted after that event, minus the browser.
 */
export function renderHooked<P extends object>(
  Component: (p: P) => React.ReactElement,
  props: P,
): Hooked<P> {
  const cells: Cell[] = [];
  const pending: PendingEffect[] = [];
  let cursor = 0;
  let current: P = props;
  let tree: React.ReactElement | null = null;
  let dirty = true;
  let renders = 0;

  const nextCell = <T extends Cell>(make: () => T): T => {
    const i = cursor++;
    if (cells[i] === undefined) cells[i] = make();
    return cells[i] as T;
  };

  const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined): boolean =>
    a !== undefined && b !== undefined && a.length === b.length
    && a.every((v, i) => Object.is(v, b[i]));

  const useStateImpl = <S,>(init: S | (() => S)): [S, (v: S | ((p: S) => S)) => void] => {
    const cell = nextCell<Cell & { kind: 'state' }>(() => ({
      kind: 'state',
      value: typeof init === 'function' ? (init as () => S)() : init,
    }));
    const set = (v: S | ((p: S) => S)): void => {
      const nextValue = typeof v === 'function' ? (v as (p: S) => S)(cell.value as S) : v;
      if (Object.is(nextValue, cell.value)) return; // React bails on an identical state
      cell.value = nextValue;
      dirty = true;
    };
    return [cell.value as S, set];
  };

  const useRefImpl = <T,>(init: T): { current: T } => nextCell<Cell & { kind: 'ref' }>(
    () => ({ kind: 'ref', ref: { current: init } }),
  ).ref as { current: T };

  const useEffectImpl = (run: () => (() => void) | void, deps?: unknown[]): void => {
    const i = cursor;
    const cell = nextCell<Cell & { kind: 'effect' }>(() => ({
      kind: 'effect', deps: undefined, cleanup: undefined,
    }));
    const first = cell.deps === undefined && cell.cleanup === undefined;
    if (first || !sameDeps(cell.deps, deps)) {
      cell.deps = deps;
      pending.push({ index: i, run });
    }
  };

  const useMemoImpl = <T,>(make: () => T, deps?: unknown[]): T => {
    const cell = nextCell<Cell & { kind: 'memo' }>(() => ({ kind: 'memo', deps: undefined, value: undefined }));
    if (cell.deps === undefined || !sameDeps(cell.deps, deps)) {
      cell.deps = deps;
      cell.value = make();
    }
    return cell.value as T;
  };

  const unsupported = (name: string) => () => {
    throw new Error(
      `renderHooked: the component under test called ${name}, which this harness `
      + 'does not store. Add it here rather than letting the row pass on a stub.',
    );
  };

  const dispatcher: Record<string, unknown> = {
    useState: useStateImpl,
    useRef: useRefImpl,
    useEffect: useEffectImpl,
    useLayoutEffect: useEffectImpl,
    useMemo: useMemoImpl,
    useCallback: <T,>(fn: T, deps?: unknown[]): T => useMemoImpl(() => fn, deps),
    useDebugValue: () => {},
  };
  const guarded = new Proxy(dispatcher, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return unsupported(String(prop));
    },
  });

  const renderOnce = (): void => {
    const slot = internals();
    const prev = slot.H;
    cursor = 0;
    slot.H = guarded;
    try {
      tree = Component(current);
      renders += 1;
    } finally {
      slot.H = prev;
    }
  };

  const flush = (): void => {
    let guard = 0;
    while (dirty) {
      if (guard++ > 50) {
        throw new Error('renderHooked: render loop did not settle in 50 passes');
      }
      dirty = false;
      renderOnce();
      const queue = pending.splice(0, pending.length);
      for (const e of queue) {
        const cell = cells[e.index];
        if (cell && cell.kind === 'effect' && typeof cell.cleanup === 'function') cell.cleanup();
        const cleanup = e.run();
        if (cell && cell.kind === 'effect') cell.cleanup = cleanup;
      }
    }
  };

  const treeNow = (): React.ReactElement => {
    flush();
    if (tree === null) throw new Error('renderHooked: the component rendered nothing');
    return tree;
  };

  const walk = (node: unknown, type: unknown): React.ReactElement<Record<string, unknown>> | null => {
    if (Array.isArray(node)) {
      for (const c of node) { const hit = walk(c, type); if (hit) return hit; }
      return null;
    }
    if (!node || typeof node !== 'object') return null;
    const el = node as React.ReactElement<Record<string, unknown>>;
    if (el.type === type) return el;
    return el.props ? walk((el.props as { children?: unknown }).children, type) : null;
  };

  flush(); // eager first render — a harness that rendered nothing is a dead harness

  return {
    el: treeNow,
    find(type) {
      const hit = walk(treeNow(), type);
      if (!hit) throw new Error(`renderHooked: no <${String(type)}> in the rendered tree`);
      return hit;
    },
    setProps(next) {
      current = { ...current, ...next };
      dirty = true;
      flush();
    },
    props: () => current,
    renders: () => { flush(); return renders; },
  };
}
