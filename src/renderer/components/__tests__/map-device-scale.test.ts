// THE MAP'S BACKING STORE IS SIZED IN DEVICE PIXELS, AND A WARP WITH NO CURSOR
// REFUSES.
//
// Two lens rows on `MapViewport`, both about a value that was silently standing in
// for a real one.
//
//   VIEWPORT-NO-DPR            `canvas.width = rect.width` gave a pixel-art
//                              surface a CSS-sized backing store, which the
//                              browser then resampled up to the element's device
//                              box. It also truncated a fractional rect (the
//                              attribute is an unsigned long) and stretched the
//                              remainder, so the drawn image drifted against
//                              `screenToWorld`, which reads the CSS rect.
//   LASTMOUSE-ORIGIN-DEFAULT   `lastMouse` was initialised to `{x:0,y:0}`, which
//                              is a legal hover position, so NEVER HOVERED and
//                              HOVERED AT THE CORNER were one value and a cold F7
//                              warped the running game to the canvas corner.
//
// ═══ WHAT THIS FILE CAN AND CANNOT MEASURE ═══
//
// The node suite runs the component's real body and effects (`render-hooked.ts`)
// with browser globals as data (`window-stub.ts`) and refs filled by declared-rect
// host stubs (`element-stub.ts`). So the numbers the component WRITES to the
// backing store are observable, and its real F7 handler runs against the real
// stores.
//
// It CANNOT measure a paint. The stub's 2D context is a no-op Proxy, and the file
// header there forbids any claim about what was drawn. So "the map now looks
// crisp on a HiDPI display" is NOT asserted here and cannot be: this file asserts
// the backing store's dimensions and the transform's existence, which is the half
// that is code. ⚠ THE VISUAL HALF IS TAGGED FOR A FOREGROUND PASS.
//
// ⚠ AND NO ROW PINS A SCALE FACTOR. The display scale varies between runs on the
// virtual display this repo's harnesses use (1 and 1.35 observed in one session),
// and it changes with no resize when a window moves between displays. Every
// expectation below is computed from the ratio the row itself declared, so the
// rows measure the code's arithmetic rather than this machine.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../test/window-stub';
import { attachRefs, type HostStub } from '../../../test/element-stub';
import { useProjectStore } from '../../state/projectStore';
import { useEditorStore } from '../../state/editorStore';
import { useSessionStore } from '../../state/sessionStore';
import { useViewStore } from '../../state/viewStore';
import { useToastStore } from '../../state/toastStore';
import { useAetherStore } from '../../state/aetherStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { ObjectPlacement, Section } from '../../../core/model/s4-types';

// ── the fixture ────────────────────────────────────────────────────────────────

function section(objects: ObjectPlacement[]): Section {
  return {
    index: 0,
    name: 's0',
    tileGrid: { widthTiles: 8, heightTiles: 8, nametable: new Uint16Array(64) },
    objects,
    rings: [],
    tiles: null,
    paletteRef: null,
    bgLayoutRef: null,
  } as unknown as Section;
}

/** `gridWidth`/`gridHeight` are load-bearing: without them every world
 *  computation is NaN and a row passes by measuring nothing. */
function project(): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [section([{ x: 64, y: 64, typeId: 'monitor', subtype: 0 }])],
      }],
    }],
    chunkLibrary: [],
  } as never;
}

/**
 * ⚠ A FRACTIONAL WIDTH, DELIBERATELY. A browser reports a fractional rect for a
 * `100%`-sized element all the time, and the truncation half of the finding is
 * only visible against one: with an integer rect, `rect.width` and
 * `Math.round(rect.width * 1)` are the same number and the pre-fix code passes.
 */
const VIEWPORT = { left: 0, top: 0, width: 640.5, height: 480.25 };

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

interface Surface {
  /** The map canvas's host stub: the first canvas the component renders. */
  canvas(): HostStub;
  /** The container div's React props, where the pointer handlers live. */
  on(): Record<string, (e: unknown) => void>;
  /** Make the component repaint, and prove that it did. */
  repaint(): void;
}

/**
 * ⚠ A REPAINT HAS TO BE PROVOKED, AND `setProps({})` IS NOT ENOUGH.
 *
 * `MapViewport` repaints from a `useEffect` whose dependency list is the visual
 * state. On mount that effect runs with the refs still EMPTY (nothing commits the
 * tree here, which is what `element-stub.ts` exists to do afterwards), so `redraw`
 * returns at its first null check and writes no size at all. A re-render with the
 * same props does not re-run the effect, because none of its dependencies moved.
 *
 * So a row changes a real visual dependency -- the zoom -- to a value it has not
 * held before. That is the production path for a repaint, and it does not touch
 * the canvas size, which is what these rows measure. `zoomTick` keeps the value
 * fresh so a second repaint in one row is not a no-op.
 *
 * THE HELPER ASSERTS THE REPAINT HAPPENED rather than trusting it: if a future
 * change makes the effect stop firing, every size row would otherwise read the
 * stub's own initial `width` (the declared rect) and could pass by measuring the
 * fixture instead of the component.
 */
let zoomTick = 1;

async function mountMap(dpr: unknown): Promise<Surface> {
  win = installWindowStub();
  win.setDevicePixelRatio(dpr);
  const mod = await import('../MapViewport');
  const h = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
  mounted = h;
  const attached = attachRefs(h.el(), VIEWPORT);
  const canvases = attached.byTag('canvas');
  // ANTI-VACUOUS: the rows below read `canvas.el.width`, and an empty list would
  // make every one of them throw on undefined rather than measure a size.
  expect(canvases.length, 'MapViewport rendered no canvas with a ref: the tree moved')
    .toBeGreaterThan(0);
  h.setProps({});
  const canvas = canvases[0];
  const repaint = () => {
    // A SENTINEL, NOT THE PREVIOUS VALUE. The stub initialises `width` to the
    // declared rect, which is also what a pre-fix `canvas.width = rect.width`
    // writes -- so a "did it change" guard would read a real write as a missing
    // one and redden every row in the file for the wrong reason. A value no draw
    // can produce separates "the effect never ran" from "it ran and wrote that".
    const NEVER_DRAWN = -1;
    (canvas.el as Record<string, unknown>).width = NEVER_DRAWN;
    zoomTick += 1;
    useViewStore.getState().setZoom(zoomTick);
    h.setProps({});
    expect(
      (canvas.el as Record<string, unknown>).width,
      'a zoom change did not repaint the map: the visual effect no longer reaches `redraw`,'
      + ' so every size row in this file is measuring the declared rect and not the component',
    ).not.toBe(NEVER_DRAWN);
  };
  repaint();
  return {
    canvas: () => canvas,
    on: () => (h.el() as unknown as { props: Record<string, (e: unknown) => void> }).props,
    repaint,
  };
}

const backingSize = (s: Surface): { width: number; height: number } => {
  const el = s.canvas().el as Record<string, unknown>;
  return { width: Number(el.width), height: Number(el.height) };
};

function keydown(key: string) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    preventDefault: () => undefined,
  };
}

function mouseAt(clientX: number, clientY: number) {
  return {
    button: 0,
    buttons: 0,
    clientX,
    clientY,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    currentTarget: null,
    target: null,
    preventDefault: () => undefined,
  };
}

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.getState().reset();
  useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
  useEditorStore.getState().setSelection(null);
  useEditorStore.getState().setTool('select');
  useToastStore.setState({ toasts: [] });
  useProjectStore.setState({ project: project() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'level:ojz:act1' });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  win?.restore();
  win = null;
  useToastStore.setState({ toasts: [] });
});

describe('VIEWPORT-NO-DPR: the map backing store is sized in device pixels', () => {
  /**
   * THE EXPECTATION IS DERIVED FROM THE ROW'S OWN RATIO, not from a table. Each
   * case states a scale factor and the assertion recomputes the size from it, so
   * adding a case needs no second edit and no case encodes this machine.
   *
   * 1 IS IN THE LIST AND IS NOT REDUNDANT: at 1 the fix must still stop
   * TRUNCATING, which is the half of the finding that has nothing to do with
   * HiDPI. `Math.round(640.5)` is 641 and the pre-fix `canvas.width = 640.5`
   * became 640.
   */
  for (const dpr of [1, 1.25, 1.35, 2, 3]) {
    it(`at a scale factor of ${dpr} the store is the CSS box times the factor`, async () => {
      const s = await mountMap(dpr);
      expect(backingSize(s)).toEqual({
        width: Math.round(VIEWPORT.width * dpr),
        height: Math.round(VIEWPORT.height * dpr),
      });
    });
  }

  /**
   * A SCALE FACTOR THAT MOVES BETWEEN DRAWS, which is the case a cached value
   * gets wrong: dragging a window to another display changes the ratio with no
   * resize of the CSS box, so nothing else in the component is different.
   */
  it('a scale factor that changes between draws is picked up on the next draw', async () => {
    const s = await mountMap(1);
    expect(backingSize(s).width).toBe(Math.round(VIEWPORT.width));
    win!.setDevicePixelRatio(2);
    s.repaint();
    expect(backingSize(s)).toEqual({
      width: Math.round(VIEWPORT.width * 2),
      height: Math.round(VIEWPORT.height * 2),
    });
  });

  /**
   * EVERY UNUSABLE READING FALLS BACK TO 1, and a fallback to something else
   * would be worse than the defect: a zero or negative factor makes a
   * zero-or-inverted backing store, which paints nothing at all.
   */
  for (const hostile of [undefined, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, '2', null]) {
    it(`a device ratio of ${String(hostile)} falls back to one CSS pixel per device pixel`, async () => {
      const s = await mountMap(hostile);
      expect(backingSize(s)).toEqual({
        width: Math.round(VIEWPORT.width),
        height: Math.round(VIEWPORT.height),
      });
    });
  }

  /**
   * WHAT THIS FILE DOES NOT ASSERT, said as a row so it is not merely a comment
   * nobody reads: the no-op context cannot report a transform, so "the drawing is
   * scaled to match the store" is unmeasurable here. This row states the bound
   * and fails if someone gives the stub a real context without revisiting the
   * claim above.
   */
  it('CANNOT MEASURE the drawing transform, and says so rather than implying it', async () => {
    const s = await mountMap(2);
    const ctx = (s.canvas().el as { getContext: (k: string) => unknown })
      .getContext('2d') as { getTransform?: () => unknown };
    expect(
      ctx.getTransform?.(),
      'the stub context now answers getTransform(): the scale-of-the-drawing half of'
      + ' VIEWPORT-NO-DPR became measurable in this suite, so assert it here instead of'
      + ' leaving it to the foreground pass',
    ).toBeUndefined();
  });
});

describe('LASTMOUSE-ORIGIN-DEFAULT: a warp before any hover refuses', () => {
  /** Replace the store's warp with a recorder. It is a store action, so this is
   *  the same substitution the shell would make, not a module mock. */
  function recordWarps(): Array<{ x: number; y: number }> {
    const calls: Array<{ x: number; y: number }> = [];
    useAetherStore.setState({
      warp: async (x: number, y: number) => { calls.push({ x, y }); return 'Warped'; },
    });
    return calls;
  }

  const toastMessages = () => useToastStore.getState().toasts.map((t) => t.message);

  it('F7 with no cursor ever seen issues no warp and says why', async () => {
    const s = await mountMap(1);
    const calls = recordWarps();
    expect(win!.dispatch('keydown', keydown('F7')), 'no keydown listener ran: the handler moved')
      .toBeGreaterThan(0);
    expect(calls, 'a cold F7 warped the game to a point the author never pointed at').toEqual([]);
    expect(
      toastMessages().join(' | '),
      'the refusal is silent: an author who pressed F7 is told nothing at all',
    ).toMatch(/point at the map/i);
    void s;
  });

  /**
   * ANTI-VACUOUS, AND THE HALF THAT PROVES THE REFUSAL IS ABOUT ABSENCE AND NOT
   * ABOUT F7. The same key, after one real pointer move, must warp -- otherwise
   * the row above would pass on a handler that had simply stopped working.
   */
  it('F7 after a real hover warps to that point', async () => {
    const s = await mountMap(1);
    // THE CAMERA IS DECLARED, because `mountMap` provokes its repaint by moving
    // the zoom and `screenToWorld` divides by it. At zoom 1 with the rect at the
    // client origin and the viewport at 0,0, a client point IS a world point, so
    // the assertion below is a coordinate and not an arithmetic re-derivation.
    useViewStore.getState().setZoom(1);
    const calls = recordWarps();
    const handlers = s.on();
    const move = handlers.onMouseMove;
    expect(typeof move, 'the container has no onMouseMove: the handler moved').toBe('function');
    move(mouseAt(128, 96));
    expect(win!.dispatch('keydown', keydown('F7'))).toBeGreaterThan(0);
    expect(calls.length, 'a hovered F7 did not warp: the refusal is firing on the wrong state')
      .toBe(1);
    expect(calls[0]).toEqual({ x: 128, y: 96 });
  });

  /**
   * THE CORNER IS A REAL POSITION AND MUST STILL WARP. This is the row that
   * distinguishes a three-state value from a sentinel: pointing at the canvas
   * corner is a legitimate thing to do, and the old code could not tell it from
   * never having pointed at all. If the fix had been "refuse 0,0", this fails.
   */
  it('a hover AT the corner warps, because the corner is a position and not an absence', async () => {
    const s = await mountMap(1);
    const calls = recordWarps();
    s.on().onMouseMove(mouseAt(VIEWPORT.left, VIEWPORT.top));
    expect(win!.dispatch('keydown', keydown('F7'))).toBeGreaterThan(0);
    expect(
      calls.length,
      'a deliberate hover at the corner was refused: the fix reads a POSITION as an absence,'
      + ' which is the sentinel this row exists to rule out',
    ).toBe(1);
    expect(toastMessages().join(' | ')).not.toMatch(/point at the map/i);
  });
});
