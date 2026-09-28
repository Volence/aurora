// THE TWO SMALL DPR-SIZED CANVASES FOLLOW A DISPLAY-SCALE CHANGE THAT COMES WITH NO
// RESIZE (ROADMAP row 238 (b)).
//
// Row 237 gave both map canvases a scale listener (canvas/device-grid.ts
// `onDeviceScaleChange`) and found (its packet, Open) two more canvases that size a
// device-pixel store and did not listen: the collision legend's angle swatch
// (`CollisionLegend`'s `AngleSwatch`) and the effects anchor-sweep preview
// (`AnchorSweepPreview`). Each sized its store once, from `window.devicePixelRatio`, in
// an effect keyed on something else (the zoom; the play state), so a move to a monitor
// with another scale left the old store in place.
//
// The display is the fake one row 237 wrote (src/test/fake-scale-display.ts): a list
// fires only when its own answer flips, so a listener that never re-arms hears exactly
// one move, and every row here moves at least twice.
//
// WHAT IS MEASURED: the store's size after each move, with no re-render and no repaint
// provoked, and (the swatch) that it was painted again under the new scale's transform.
// Not measured: how either looks; that is a browser fact.

import { describe, it, expect, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../test/window-stub';
import { attachRefs, type HostStub } from '../../../test/element-stub';
import { fakeScaleDisplay, type FakeScaleDisplay } from '../../../test/fake-scale-display';
import { recordingContext } from '../../canvas/__tests__/chrome-recorder';
import { Chip } from '../ui';

let win: WindowStub | null = null;
let mounted: Hooked<never> | null = null;
let savedDocument: { had: boolean; value: unknown } | null = null;

function display(dpr: number): FakeScaleDisplay {
  win = installWindowStub();
  win.setDevicePixelRatio(dpr);
  const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
  const d = fakeScaleDisplay({ get: () => w.devicePixelRatio as number, set: (v) => win!.setDevicePixelRatio(v) });
  w.matchMedia = d.matchMedia;
  return d;
}

const sizeOf = (c: HostStub) => ({
  width: Number((c.el as Record<string, unknown>).width),
  height: Number((c.el as Record<string, unknown>).height),
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  win?.restore();
  win = null;
  if (savedDocument) {
    const g = globalThis as unknown as { document?: unknown };
    if (savedDocument.had) g.document = savedDocument.value; else delete g.document;
    savedDocument = null;
  }
});

describe('CollisionLegend AngleSwatch: the store follows a scale change with no resize (row 238 (b))', () => {
  const SWATCH = 18;

  async function mountSwatch(dpr: number) {
    const d = display(dpr);
    const { AngleSwatch } = await import('../CollisionLegend');
    const h = renderHooked(AngleSwatch as unknown as (p: { cellScreenPx: number }) => React.ReactElement, { cellScreenPx: 32 });
    mounted = h as unknown as Hooked<never>;
    const [canvas] = attachRefs(h.el(), { left: 0, top: 0, width: SWATCH, height: SWATCH }).byTag('canvas');
    expect(canvas, 'the swatch rendered no canvas with a ref: the tree moved').toBeDefined();
    const rec = recordingContext();
    (canvas.el as Record<string, unknown>).getContext = () => rec.ctx;
    // The effect ran on mount with an empty ref; a new zoom (its dependency) runs it
    // with the canvas in place, which is the production order.
    h.setProps({ cellScreenPx: 33 });
    expect(sizeOf(canvas), 'the swatch never painted: every row below would read the declared rect')
      .toEqual({ width: Math.round(SWATCH * dpr), height: Math.round(SWATCH * dpr) });
    return { d, h, canvas, rec };
  }

  it('each move re-sizes the store to round(18 x d) and paints the mark again under [d,0,0,d,0,0]', async () => {
    const { d, canvas, rec } = await mountSwatch(1);
    for (const dpr of [1.5, 2, 1.25]) {
      rec.calls.length = 0;
      rec.strokes.length = 0;
      expect(d.setScale(dpr), `the move to ${dpr} reached no listener`).toBeGreaterThan(0);
      expect(sizeOf(canvas), `swatch store after the move to ${dpr}`)
        .toEqual({ width: Math.round(SWATCH * dpr), height: Math.round(SWATCH * dpr) });
      const setT = rec.calls.filter((c) => c.op === 'setTransform');
      expect(setT.map((c) => c.args), `the repaint at ${dpr} did not set the new scale's transform`)
        .toEqual([[dpr, 0, 0, dpr, 0, 0]]);
      expect(rec.strokes.length, `nothing was painted after the move to ${dpr}`).toBeGreaterThan(0);
    }
  });

  it('one listener while mounted, none after unmount', async () => {
    const { d } = await mountSwatch(1);
    expect(d.totalListeners(), 'the swatch never armed a scale listener').toBe(1);
    d.setScale(1.5);
    expect(d.totalListeners(), 'the re-arm left more than one listener').toBe(1);
    mounted!.unmount();
    mounted = null;
    expect(d.totalListeners()).toBe(0);
  });
});

describe('AnchorSweepPreview: the store follows a scale change with no resize (row 238 (b))', () => {
  const W = 224, H = 56;

  async function mountPreview(dpr: number) {
    const d = display(dpr);
    const g = globalThis as unknown as { document?: unknown };
    savedDocument = { had: 'document' in g, value: g.document };
    g.document = { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined };
    const { AnchorSweepPreview } = await import('../effects/AnchorSweepPreview');
    const h = renderHooked(AnchorSweepPreview as unknown as (p: object) => React.ReactElement,
      { sweep: { amp_shift: 4, period_shift: 2 }, channel: 0 });
    mounted = h as unknown as Hooked<never>;
    const [canvas] = attachRefs(h.el(), { left: 0, top: 0, width: W, height: H }).byTag('canvas');
    expect(canvas, 'the preview rendered no canvas with a ref: the tree moved').toBeDefined();
    const rec = recordingContext();
    (canvas.el as Record<string, unknown>).getContext = () => rec.ctx;
    // The effect is keyed on the play state and ran on mount with an empty ref. Pause
    // (the canvas unmounts, so its ref empties, as React does) and play again, with
    // REAL clicks on the component's own Chip: the effect runs with the canvas in place.
    const refObj = (h.find('canvas').props as { ref: { current: unknown } }).ref;
    const chip = () => h.find(Chip).props as { onClick: () => void };
    chip().onClick();
    refObj.current = null;
    h.setProps({});
    refObj.current = canvas.el;
    chip().onClick();
    h.setProps({});
    expect(sizeOf(canvas), 'the preview never sized its store: every row below would read the declared rect')
      .toEqual({ width: Math.round(W * dpr), height: Math.round(H * dpr) });
    return { d, canvas, rec };
  }

  it('each move re-sizes the store to round(rect x d) and sets [d,0,0,d,0,0] for the next frame', async () => {
    const { d, canvas, rec } = await mountPreview(1);
    for (const dpr of [1.5, 2, 1.25]) {
      rec.calls.length = 0;
      expect(d.setScale(dpr), `the move to ${dpr} reached no listener`).toBeGreaterThan(0);
      expect(sizeOf(canvas), `preview store after the move to ${dpr}`)
        .toEqual({ width: Math.round(W * dpr), height: Math.round(H * dpr) });
      expect(rec.calls.filter((c) => c.op === 'setTransform').map((c) => c.args),
        `the move to ${dpr} did not set the new scale's transform`).toEqual([[dpr, 0, 0, dpr, 0, 0]]);
    }
  });

  it('one listener while playing, none after unmount', async () => {
    const { d } = await mountPreview(1);
    expect(d.totalListeners(), 'the preview never armed a scale listener').toBe(1);
    d.setScale(2);
    expect(d.totalListeners(), 'the re-arm left more than one listener').toBe(1);
    mounted!.unmount();
    mounted = null;
    expect(d.totalListeners()).toBe(0);
  });
});
