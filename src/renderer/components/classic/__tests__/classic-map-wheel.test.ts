// DOES A WHEEL OVER THE CLASSIC MAP SUPPRESS THE BROWSER'S OWN ZOOM?
// (CLASSIC-WHEEL-NO-PREVENTDEFAULT, lens sweep)
//
// ═══ THE DEFECT ══════════════════════════════════════════════════════════════
//
// The zoom handler was a React `onWheel` PROP, and React registers root `wheel`
// listeners as PASSIVE, so a `preventDefault` there is ignored. This one did not
// even have that call: a modifier+wheel over the classic map zoomed the map AND the
// whole application window. It is the same defect aeon's `MapViewport` had (fixed
// tonight), one degree worse — there the dead `preventDefault` was at least visible
// in the source to be doubted; here nothing in the file caught the eye.
//
// The repo had already ruled on the shape: `art-shared/use-anchored-zoom.ts:11-12`
// states the rule and attaches a native `{ passive: false }` listener through
// `art-shared/use-attached-effect.ts`.
//
// ═══ THESE ROWS MOUNT THE COMPONENT ═════════════════════════════════════════
//
// `map-viewport-mounted.test.ts` established that a component can be run in this
// node-only suite (`src/test/render-hooked.ts` + the window and element stubs), and
// its wheel rows are the model for these. A listener actually ON the element is the
// outcome, and it is what the source scan next door cannot see.
//
// ⚠ AND THE ELEMENT IS THE CANVAS, NOT THE CONTAINER, which is where classic
// differs from aeon: this component's container div is mounted unconditionally and
// its CANVAS is behind `status === 'ready' && doc`. So the conditional-mount trap
// `useAttachedEffect` exists for is live here on the canvas, and the rows below
// prove it by mounting IDLE first (no canvas, no listener) and then going ready.
//
// NOT COVERED HERE, and stated rather than implied: that a real browser treats a
// React `onWheel` as passive. That is the browser fact the fix rests on and it is
// not observable in this suite; the CDP harness
// `scratchpad/classic-wheel-passive-harness.mjs` is where that is measured.
//
// RED-FIRST: proven by restoring the `onWheel` prop in ClassicLevelViewport.tsx
// (mutation shown on disk in the parcel report). Runner:
// `npx vitest run src/renderer/components/classic/__tests__/classic-map-wheel.test.ts`,
// inside `npm test`'s `vitest run`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import type React from 'react';
// The repo's one comment-stripping source reader (the `map-teardown` precedent),
// for the single row below that has to look at the file rather than the behaviour.
import { code, COMPONENTS } from '../../__tests__/helpers/section-panels';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../../test/window-stub';
import { attachRefs, type HostStub } from '../../../../test/element-stub';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import { useViewStore } from '../../../state/viewStore';
import type { LevelDoc } from '../../../../core/level-classic/model';
import type { ZoneActRef } from '../../../../core/project/adapter';

/** The rect every row declares itself to be looking through. Integer, and the
 *  origin is the client origin, so a client coordinate is a screen coordinate. */
const VIEWPORT = { left: 0, top: 0, width: 640, height: 480 };

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

/** The smallest doc the viewport will accept as 'ready'. It is not drawn against
 *  here (the stub context is a no-op Proxy) — it exists so the canvas mounts. */
function makeDoc(): LevelDoc {
  const chunkCells = () =>
    Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  return {
    game: 's1',
    tiles: new Uint8Array(32),
    blocks: [{ cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) }],
    chunks: [{ cells: chunkCells() }],
    fg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    bg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    collision: { colind: new Uint8Array([0]), shapes: { heights: [new Int8Array(16)], angles: new Uint8Array(1) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [],
    objects: [],
    start: { x: 8, y: 8 },
    sourceRefs: {},
  } as unknown as LevelDoc;
}

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

interface Surface {
  h: Hooked<object>;
  /** The canvas's own host stub — the native wheel listener is on it. */
  canvas(): HostStub | undefined;
  /** Re-render and re-attach whatever refs are unfilled now. */
  settle(): void;
}

async function mountViewport(): Promise<Surface> {
  win = installWindowStub();
  const mod = await import('../ClassicLevelViewport');
  const h = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
  mounted = h;
  const attach = (): HostStub[] => {
    try {
      return attachRefs(h.el(), VIEWPORT).all();
    } catch {
      // attachRefs THROWS when every ref in the tree is already filled, which is
      // the ordinary state on a second pass. Not a failure here.
      return [];
    }
  };
  let stubs = attach();
  // A render after the refs are filled, because `useAttachedEffect` decides from
  // the ELEMENT and has to see it appear: this is the pass that attaches the
  // native wheel listener.
  h.setProps({});
  const canvasOf = (all: HostStub[]): HostStub | undefined =>
    all.find((s) => (s.el as { tagName?: string }).tagName === 'CANVAS');
  return {
    h,
    canvas: () => canvasOf(stubs),
    settle: () => {
      h.setProps({});
      stubs = [...stubs, ...attach()];
      h.setProps({});
    },
  };
}

function goReady(): void {
  useClassicLevelStore.setState({ ref: REF, doc: makeDoc(), status: 'ready', error: null });
}

beforeEach(() => {
  useClassicLevelStore.setState({ ref: null, doc: null, status: 'idle', error: null });
  useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  win?.restore();
  win = null;
  useClassicLevelStore.setState({ ref: null, doc: null, status: 'idle', error: null });
});

describe('the classic map\'s wheel gesture zooms the map, not the window', () => {
  it('is a native listener on the canvas element itself', async () => {
    goReady();
    const s = await mountViewport();
    const canvas = s.canvas();
    expect(canvas, 'the ready viewport rendered no canvas: this file measured nothing')
      .toBeDefined();
    expect(canvas!.listenerCount('wheel'),
      'no native wheel listener: an onWheel prop would be passive and a preventDefault '
      + 'there is ignored by the browser')
      .toBe(1);
  });

  it('suppresses the browser default and changes the zoom', async () => {
    goReady();
    const s = await mountViewport();
    const before = useViewStore.getState().zoom;
    let prevented = false;
    const ran = s.canvas()!.dispatch('wheel', {
      deltaY: -100, clientX: 320, clientY: 240, ctrlKey: true,
      preventDefault: () => { prevented = true; },
    });
    expect(ran, 'nothing was listening on the canvas').toBe(1);
    expect(prevented, "the browser's own ctrl+wheel page zoom was left to run").toBe(true);
    // The camera is a ref that publishes to viewStore once per painted frame, so
    // the frame has to be run before the store can be read (classic-camera.test.ts
    // records why the camera is not a subscribed selector here).
    win!.frame();
    expect(useViewStore.getState().zoom, 'the map did not zoom').toBeGreaterThan(before);
  });

  it('zooms the other way on the other direction', async () => {
    goReady();
    const s = await mountViewport();
    const before = useViewStore.getState().zoom;
    s.canvas()!.dispatch('wheel', {
      deltaY: 100, clientX: 320, clientY: 240, ctrlKey: false,
      preventDefault: () => undefined,
    });
    win!.frame();
    expect(useViewStore.getState().zoom).toBeLessThan(before);
  });

  it('CONDITIONAL MOUNT: an idle viewport has no canvas, and gains the listener when it goes ready', async () => {
    // The reason the attach goes through `useAttachedEffect` rather than a
    // `useEffect(..., [])`: the canvas does not exist on the first render, and a
    // mount-once effect that early-returns on a null ref never runs again. That is
    // how wheel zoom died in classic's Chunk and Block tabs.
    const s = await mountViewport();
    expect(s.canvas(), 'an idle viewport must not render the canvas at all').toBeUndefined();
    goReady();
    s.settle();
    const canvas = s.canvas();
    expect(canvas, 'the canvas never appeared after the act became ready').toBeDefined();
    expect(canvas!.listenerCount('wheel'),
      'the listener was never attached to the late canvas: a mount-once effect would '
      + 'leave wheel zoom dead for the life of this component')
      .toBe(1);
  });

  it('the dead React prop does not come back BESIDE the native listener', async () => {
    // The one thing the mounted rows above cannot see. A returning `onWheel={...}`
    // prop would leave `listenerCount('wheel')` at 1 and every row here green,
    // while the browser ran BOTH handlers on every notch: the map would zoom twice
    // per click of the wheel. The source is the only place that says it is gone.
    const src = code(join(COMPONENTS, 'classic', 'ClassicLevelViewport.tsx'));
    expect(src, 'ClassicLevelViewport.tsx did not read back as source, so this row '
      + 'measured nothing').toContain('export default function ClassicLevelViewport()');
    expect(src, 'onWheel as a React prop is the dead, passive form this rule exists to keep out')
      .not.toContain('onWheel={');
    // ...and the convention, named where a reader will find the argument for it.
    expect(src).toContain('useAttachedEffect(canvasRef,');
    expect(src).toContain("addEventListener('wheel', onWheel, { passive: false })");
  });

  it('takes the listener off the element on unmount', async () => {
    goReady();
    const s = await mountViewport();
    const canvas = s.canvas()!;
    s.h.unmount();
    mounted = null;
    expect(canvas.listenerCount('wheel'),
      'a canvas remounted on every act switch would accumulate listeners').toBe(0);
  });
});
