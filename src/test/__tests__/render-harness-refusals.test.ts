// THE REFUSALS IN THE THREE COMPONENT-HARNESS FILES, ASSERTED.
//
// WHY THIS FILE EXISTS. `render-hooked.ts`, `window-stub.ts` and
// `element-stub.ts` all throw rather than degrade, and each throw is protecting a
// row somewhere else from passing on nothing:
//
//   • a stub that shadowed a real `window` would make every row in its file
//     measure the stub while reading as though it measured a browser;
//   • `attachRefs` on a tree whose refs moved would leave every coordinate
//     resolving against no element, and `screenToWorld` answers the ORIGIN in
//     that case rather than failing, so the rows would hit-test (0,0) and pass by
//     selecting nothing.
//
// An unasserted guard is the dominant defect class in this repo, and both of
// these were unasserted when they were written. Each row below plants the
// violation; the third is the control that catches a guard so wide it refuses the
// legitimate case too.

import { describe, it, expect, afterEach } from 'vitest';
import { installWindowStub } from '../window-stub';
import { attachRefs } from '../element-stub';

afterEach(() => { delete (globalThis as { window?: unknown }).window; });

describe('the component harness refuses rather than measuring nothing', () => {
  it('installWindowStub refuses a real window', () => {
    (globalThis as { window?: unknown }).window = { addEventListener() {}, removeEventListener() {} };
    expect(() => installWindowStub()).toThrow(/a real .window. is already defined/);
  });

  it('and leaves that window exactly where it was', () => {
    // The half a "delete what I defined" restore gets wrong. A refused install
    // must not have touched anything on its way out.
    const prior = { marker: 'prior' };
    (globalThis as { window?: unknown }).window = prior;
    expect(() => installWindowStub()).toThrow();
    expect((globalThis as { window?: unknown }).window).toBe(prior);
  });

  it('attachRefs refuses a tree with no unfilled ref', () => {
    expect(() => attachRefs({ type: 'div', props: { children: null } },
      { left: 0, top: 0, width: 1, height: 1 }))
      .toThrow(/carried no unfilled/);
  });

  it('CONTROL: attachRefs accepts a tree that has one, and fills it', () => {
    const ref: { current: unknown } = { current: null };
    const got = attachRefs({ type: 'canvas', props: { ref, children: null } },
      { left: 3, top: 4, width: 5, height: 7 });
    expect(got.byTag('canvas')).toHaveLength(1);
    expect(ref.current).not.toBeNull();
    const el = ref.current as { getBoundingClientRect: () => { left: number; width: number } };
    expect(el.getBoundingClientRect()).toMatchObject({ left: 3, width: 5 });
  });

  it('CONTROL: a window stub installs and restores cleanly when there is none', () => {
    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    const stub = installWindowStub();
    expect((globalThis as { window?: unknown }).window).toBeDefined();
    expect(typeof (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame)
      .toBe('function');
    stub.restore();
    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    expect((globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame)
      .toBeUndefined();
  });

  it('requestAnimationFrame queues and runs NOTHING until asked', () => {
    // The load-bearing refusal: MapViewport's redraw loop re-arms from inside its
    // own callback, so a stub that ran the callback would spin forever inside
    // `flush()` and this whole approach would be unusable.
    const stub = installWindowStub();
    let ran = 0;
    const raf = (globalThis as unknown as { requestAnimationFrame: (f: () => void) => number });
    raf.requestAnimationFrame(() => { ran += 1; });
    expect(stub.pendingFrames()).toBe(1);
    expect(ran, 'the stub ran a frame callback on its own').toBe(0);
    expect(stub.frame()).toBe(true);
    expect(ran).toBe(1);
    expect(stub.frame(), 'a queue with nothing left must say so').toBe(false);
    stub.restore();
  });

  it('a dispatch to an empty registry reports zero rather than looking like a hit', () => {
    // What lets a behavioural row assert it actually reached a listener. A stub
    // that swallowed the dispatch silently is how every event-driven row in this
    // repo would go quiet at once.
    const stub = installWindowStub();
    expect(stub.dispatch('keydown', {})).toBe(0);
    stub.restore();
  });
});
