// A DISPLAY-SCALE CHANGE WITH NO RESIZE REACHES THE MAP CANVASES (ROADMAP row 237 (a)).
//
// Row 194's packet (docs/reviews/2026-09-28-classic-canvas-dpr-194.md, Open) left it: a
// window dragged to a monitor with another scale factor keeps its CSS box, so no
// ResizeObserver fires, and neither ClassicLevelViewport nor MapViewport re-sized its
// backing store: right place, soft pixels, until the next resize.
// `onDeviceScaleChange` (canvas/device-grid.ts) is the one listener both use.
//
// These rows hold the listener's own contract against a display that answers
// `matchMedia('(resolution: Ndppx)')` as a browser does (src/test/fake-scale-display.ts):
// a list fires only when ITS answer flips, so a listener that does not re-arm hears
// exactly one change. The on-screen half (CDP emulation of the scale, both canvases)
// is scratchpad/canvas-dpr-237-harness.mjs.

import { describe, it, expect } from 'vitest';
import { onDeviceScaleChange } from '../device-grid';
import { fakeScaleDisplay, type FakeScaleDisplay } from '../../../test/fake-scale-display';

interface Host { devicePixelRatio: unknown; matchMedia: FakeScaleDisplay['matchMedia'] }

function display(start: unknown): { host: Host; fake: FakeScaleDisplay } {
  const host = { devicePixelRatio: start } as Host;
  const fake = fakeScaleDisplay({
    get: () => host.devicePixelRatio as number,
    set: (v) => { host.devicePixelRatio = v; },
  });
  host.matchMedia = fake.matchMedia;
  return { host, fake };
}

describe('onDeviceScaleChange: one listener, re-armed for each new scale', () => {
  it('arms exactly one listener, on the query naming the scale the display has now', () => {
    const { host, fake } = display(1.25);
    onDeviceScaleChange(() => undefined, host);
    expect(fake.queries()).toEqual(['(resolution: 1.25dppx)']);
    expect(fake.listeners()).toEqual([{ media: '(resolution: 1.25dppx)', count: 1 }]);
  });

  it('a move off that scale calls back with the NEW scale, and re-arms on the new scale\'s query', () => {
    const { host, fake } = display(1);
    const heard: number[] = [];
    onDeviceScaleChange((d) => heard.push(d), host);
    expect(fake.setScale(1.5), 'the move fired nothing: the listener was never armed').toBeGreaterThan(0);
    expect(heard).toEqual([1.5]);
    // The old list holds nothing; the one live listener is on the new scale's query.
    expect(fake.listeners()).toEqual([{ media: '(resolution: 1.5dppx)', count: 1 }]);
  });

  it('THE RE-ARM: a second, third and fourth move are each heard once, with their own scale', () => {
    const { host, fake } = display(1);
    const heard: number[] = [];
    onDeviceScaleChange((d) => heard.push(d), host);
    for (const d of [1.5, 2, 1, 1.35]) fake.setScale(d);
    expect(heard).toEqual([1.5, 2, 1, 1.35]);
    expect(fake.totalListeners(), 'a re-arm left the previous listener behind: one leaks per move').toBe(1);
    expect(fake.queries()).toEqual([
      '(resolution: 1dppx)', '(resolution: 1.5dppx)', '(resolution: 2dppx)', '(resolution: 1dppx)', '(resolution: 1.35dppx)',
    ]);
  });

  it('unsubscribe before any move removes the listener, and a move then calls nothing', () => {
    const { host, fake } = display(1);
    const heard: number[] = [];
    const off = onDeviceScaleChange((d) => heard.push(d), host);
    off();
    expect(fake.totalListeners()).toBe(0);
    fake.setScale(2);
    expect(heard).toEqual([]);
  });

  it('unsubscribe AFTER re-arms removes the CURRENT listener, not only the first one armed', () => {
    const { host, fake } = display(1);
    const heard: number[] = [];
    const off = onDeviceScaleChange((d) => heard.push(d), host);
    fake.setScale(1.5);
    fake.setScale(2);
    expect(heard).toEqual([1.5, 2]);
    off();
    expect(fake.totalListeners(), 'the re-armed listener survived unsubscribe').toBe(0);
    fake.setScale(3);
    fake.setScale(1);
    expect(heard).toEqual([1.5, 2]);
  });

  it('unsubscribe is safe to call twice', () => {
    const { host, fake } = display(1);
    const off = onDeviceScaleChange(() => undefined, host);
    off();
    off();
    expect(fake.totalListeners()).toBe(0);
  });

  it('two subscribers are independent: unsubscribing one leaves the other hearing', () => {
    const { host, fake } = display(1);
    const a: number[] = [];
    const b: number[] = [];
    const offA = onDeviceScaleChange((d) => a.push(d), host);
    onDeviceScaleChange((d) => b.push(d), host);
    fake.setScale(1.5);
    offA();
    fake.setScale(2);
    expect(a).toEqual([1.5]);
    expect(b).toEqual([1.5, 2]);
  });

  /** The reading goes through deviceScale's rule: an unusable value is 1. */
  for (const hostile of [undefined, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, '2', null]) {
    it(`a device ratio of ${String(hostile)} arms on the 1dppx query (deviceScale's fallback)`, () => {
      const { host, fake } = display(hostile);
      onDeviceScaleChange(() => undefined, host);
      expect(fake.queries()).toEqual(['(resolution: 1dppx)']);
    });
  }

  it('no display at all (no window, or a window with no matchMedia) is a no-op that still unsubscribes', () => {
    expect(() => onDeviceScaleChange(() => undefined, null)()).not.toThrow();
    expect(() => onDeviceScaleChange(() => undefined, { devicePixelRatio: 2 } as never)()).not.toThrow();
    // And with the default host in this node suite, where there is no window.
    expect(typeof window).toBe('undefined');
    expect(() => onDeviceScaleChange(() => undefined)()).not.toThrow();
  });
});
