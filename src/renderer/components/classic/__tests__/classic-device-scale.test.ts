// THE SONIC 1 LEVEL CANVAS IS SIZED IN DEVICE PIXELS, DRAWS IN CSS PIXELS, AND ITS
// POINTER MAPPING DID NOT MOVE (ROADMAP row 194, CLASSIC-CANVAS-BLUR-DPR).
//
// ═══ THE DEFECT ══════════════════════════════════════════════════════════════
//
// `ClassicLevelViewport`'s `measure()` wrote `canvas.width = floor(rect.width)` and
// never multiplied by `devicePixelRatio`. The canvas carried no CSS width either, so
// its CSS box WAS that attribute, and above 100% the browser stretched the bitmap up
// to the device box with its default filter: every pixel-art edge came out blended.
// Found by the scaled-display fix (docs/reviews/2026-09-12-dpr-guides-offset.md
// section 9); ruled crisp 2026-09-28. The on-screen half (a real screenshot, a real
// click) is `scratchpad/classic-canvas-dpr-harness.mjs`; this file is the code half.
//
// ═══ WHAT THESE ROWS MOUNT ══════════════════════════════════════════════════
//
// The real component body and effects (`render-hooked.ts`), browser globals as data
// (`window-stub.ts`), refs filled by declared-rect host stubs (`element-stub.ts`), the
// same kit `map-device-scale.test.ts` uses for aeon's map. Two additions, both local:
//
//   - a `document` whose `createElement('canvas')` hands back a stub with a 2D
//     context that can `createImageData`, because the draw pass builds per-chunk
//     canvases; without it the first real draw throws and every row measures the
//     throw.
//   - a RECORDING context on the map canvas, so the base transform and the
//     smoothing flag the draw pass uses are observable. It records; it does not
//     render, and no row claims anything about pixels.
//
// ⚠ NO ROW PINS A SCALE FACTOR: each row declares its own and derives the
// expectation from it (`classicBackingStore` is the rule the rows restate).
//
// RED-FIRST: the size, style and transform rows were run against the unfixed
// component (red at every factor above 1, green at 1); the pointer rows were
// proved by a planted mutation that maps the pointer through the device scale.
// Both recorded in docs/reviews/2026-09-28-classic-canvas-dpr-194.md.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../../test/window-stub';
import { attachRefs, type HostStub } from '../../../../test/element-stub';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import { useViewStore } from '../../../state/viewStore';
import type { LevelDoc } from '../../../../core/level-classic/model';
import type { ZoneActRef } from '../../../../core/project/adapter';

/**
 * ⚠ A FRACTIONAL RECT, DELIBERATELY: a browser reports one for a flex-sized box all
 * the time, and the floor-versus-round question is only visible against one.
 */
const VIEWPORT = { left: 0, top: 0, width: 640.5, height: 480.25 };

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

/** Two chunks side by side on one row: engine ids 1 (left, col 0) and 2 (right,
 *  col 1), so a pointer row can tell a one-cell miss from a hit. */
function makeDoc(): LevelDoc {
  const chunkCells = () =>
    Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  return {
    game: 's1',
    tiles: new Uint8Array(32),
    blocks: [{ cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) }],
    chunks: [{ cells: chunkCells() }, { cells: chunkCells() }],
    fg: { width: 2, height: 1, cells: new Uint8Array([1, 2]) },
    bg: { width: 2, height: 1, cells: new Uint8Array([0, 0]) },
    collision: { colind: new Uint8Array([0]), shapes: { heights: [new Int8Array(16)], angles: new Uint8Array(1) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [],
    objects: [],
    start: { x: 8, y: 8 },
    sourceRefs: {},
  } as unknown as LevelDoc;
}

interface Call { op: string; args: unknown[]; smoothing: unknown }

/** A 2D context that records what the draw pass does to it, in order. */
function recordingContext(): { ctx: object; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { imageSmoothingEnabled: true };
  const values: Record<string, (...a: unknown[]) => unknown> = {
    measureText: (t: unknown) => ({ width: String(t ?? '').length * 6 }),
    createImageData: (w: unknown, h: unknown) => ({ data: new Uint8ClampedArray(4 * Number(w) * Number(h)) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop in values) return values[prop];
      if (prop in state) return state[prop];
      if (prop === 'canvas') return undefined;
      return (...args: unknown[]) => { calls.push({ op: prop, args, smoothing: state.imageSmoothingEnabled }); };
    },
    set: (_t, prop, value) => {
      if (typeof prop === 'string') {
        state[prop] = value;
        calls.push({ op: `set:${prop}`, args: [value], smoothing: state.imageSmoothingEnabled });
      }
      return true;
    },
  });
  return { ctx, calls };
}

/** The draw pass builds one offscreen canvas per chunk through `document`. */
function installDocumentStub(): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  const had = 'document' in g;
  const prev = g.document;
  g.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => recordingContext().ctx }),
  };
  return () => { if (had) g.document = prev; else delete g.document; };
}

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;
let restoreDocument: (() => void) | null = null;

interface Surface {
  h: Hooked<object>;
  canvas: HostStub;
  calls: Call[];
  /** Run the queued frame (the rAF-coalesced redraw) and flush its render. */
  paint(): void;
}

async function mountClassic(dpr: unknown): Promise<Surface> {
  win = installWindowStub();
  win.setDevicePixelRatio(dpr);
  restoreDocument = installDocumentStub();
  const mod = await import('../ClassicLevelViewport');
  const h = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
  mounted = h;
  // IDLE first, so the container's ref is filled before the act goes ready: the
  // measure effect re-runs on `status` and only then can it observe the container.
  attachRefs(h.el(), VIEWPORT);
  h.setProps({});
  useClassicLevelStore.setState({ ref: REF, doc: makeDoc(), status: 'ready', error: null });
  h.setProps({});
  const canvases = attachRefs(h.el(), VIEWPORT).byTag('canvas');
  expect(canvases.length, 'the ready viewport rendered no canvas with a ref: the tree moved').toBe(1);
  const canvas = canvases[0];
  const rec = recordingContext();
  (canvas.el as Record<string, unknown>).getContext = () => rec.ctx;
  // A SENTINEL the fix can never write, so "measure never ran" cannot pass as a
  // size: the stub initialises `width` to the declared rect, which is a plausible
  // answer at a factor of 1.
  (canvas.el as Record<string, unknown>).width = -1;
  (canvas.el as Record<string, unknown>).height = -1;
  expect(win.resize(), 'no ResizeObserver is watching the container: measure() cannot run').toBeGreaterThan(0);
  const paint = () => {
    while (win!.frame()) { /* drain the coalesced redraw */ }
    h.setProps({});
  };
  paint();
  expect((canvas.el as Record<string, unknown>).width, 'measure() never wrote the backing store').not.toBe(-1);
  return { h, canvas, calls: rec.calls, paint };
}

const el = (s: Surface) => s.canvas.el as Record<string, unknown> & { style: Record<string, unknown> };

beforeEach(() => {
  useClassicLevelStore.setState({ ref: null, doc: null, status: 'idle', error: null, selectedChunkId: 0 });
  useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  win?.restore();
  win = null;
  restoreDocument?.();
  restoreDocument = null;
  useClassicLevelStore.setState({ ref: null, doc: null, status: 'idle', error: null });
});

describe('CLASSIC-CANVAS-BLUR-DPR: the backing store follows the display scale', () => {
  for (const dpr of [1, 1.25, 1.35, 1.5, 2, 3]) {
    it(`at ${dpr} the store is floor(CSS box x ${dpr}) device px, and the CSS box is that over ${dpr}`, async () => {
      const s = await mountClassic(dpr);
      const w = Math.floor(VIEWPORT.width * dpr);
      const h = Math.floor(VIEWPORT.height * dpr);
      expect({ width: el(s).width, height: el(s).height }).toEqual({ width: w, height: h });
      // The CSS box is set EXPLICITLY, to exactly the store over the factor: a
      // canvas with no CSS width takes its attribute as its CSS size, so a device-
      // sized store with no style would lay out `dpr` times too big.
      expect({ width: el(s).style.width, height: el(s).style.height })
        .toEqual({ width: `${w / dpr}px`, height: `${h / dpr}px` });
    });
  }

  /** Every unusable reading falls back to 1 (the MapViewport rule, shared). */
  for (const hostile of [undefined, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, '2', null]) {
    it(`a device ratio of ${String(hostile)} sizes the store at one device px per CSS px`, async () => {
      const s = await mountClassic(hostile);
      expect({ width: el(s).width, height: el(s).height })
        .toEqual({ width: Math.floor(VIEWPORT.width), height: Math.floor(VIEWPORT.height) });
    });
  }

  for (const dpr of [1, 1.5, 2]) {
    it(`at ${dpr} every draw starts from the device transform with smoothing off`, async () => {
      const s = await mountClassic(dpr);
      const transforms = s.calls.filter((c) => c.op === 'setTransform');
      expect(transforms.length, 'the draw pass never set a base transform: nothing was drawn').toBeGreaterThan(0);
      for (const t of transforms) expect(t.args).toEqual([dpr, 0, 0, dpr, 0, 0]);
      const blits = s.calls.filter((c) => c.op === 'drawImage');
      expect(blits.length, 'no chunk was blitted: this row measured an empty draw').toBeGreaterThan(0);
      for (const b of blits) expect(b.smoothing, 'a chunk was blitted with image smoothing ON').toBe(false);
    });
  }
});

describe('CLASSIC-CANVAS-BLUR-DPR: the pointer still maps in CSS pixels', () => {
  /**
   * The grab side of "drawing and grabbing agree". The camera is declared through
   * the store (zoom 1 at the origin, adopted by the viewport's subscription), so a
   * client x IS a world x and the boundary between the two chunks is x = 256. A
   * right-click one pixel either side eyedrops chunk 1 then chunk 2, at every
   * factor: the device scale must not reach the pointer mapping.
   */
  for (const dpr of [1, 1.5, 2]) {
    it(`at ${dpr} a right-click either side of x=256 eyedrops the chunk under it`, async () => {
      const s = await mountClassic(dpr);
      useViewStore.getState().setViewport(0, 0, 1);
      s.paint();
      const onContextMenu = s.h.find('canvas').props.onContextMenu as (e: unknown) => void;
      const click = (clientX: number) => onContextMenu({
        clientX, clientY: 100, button: 2, preventDefault: () => undefined,
      });
      click(255);
      expect(useClassicLevelStore.getState().selectedChunkId, 'x=255 is chunk 1 at zoom 1').toBe(1);
      click(257);
      expect(useClassicLevelStore.getState().selectedChunkId, 'x=257 is chunk 2 at zoom 1').toBe(2);
    });
  }
});
