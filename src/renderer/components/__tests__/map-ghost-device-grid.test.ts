// MAPVIEWPORT'S OWN STAMP GHOST AND MARQUEE OUTLINES LAND ON THE DEVICE GRID (ROADMAP
// row 238 (a), under the row 237 (b) ruling).
//
// Row 237 put the Sonic 1 canvas's outlines on the device grid through the SAME
// `snapStroke` / `snapLength` MapViewport's chrome uses, and found (its packet, Open)
// that MapViewport's own stamp ghost and marquee were still stroked in WORLD units at
// `2 / zoom` under `scale(zoom) / translate(-vp)`: at 1.5 a 2 CSS px line is 3 device px
// centred wherever the world edge happens to fall. The ruling allows no new look, so
// these rows restate device-grid's contract on the two outlines, read off the REAL
// component's draw through the recorder (canvas/__tests__/chrome-recorder.ts) handed
// to the ghost-layer canvas:
//
//   - the width is `deviceStrokeWidth(2, dpr)` device px (2 at 1, 1.25, 1.35 and 1.5,
//     4 at 2, 6 at 3: always an EVEN width);
//   - BOTH edges of every side are on whole device pixels (the row 238 ruling; an even
//     width centres on a whole device pixel), at the parity-aware centre nearest where
//     the unsnapped stroke was, and the size is a whole number of device px;
//   - the marquee keeps its 4 CSS px dash (stated in the CSS frame it now strokes in).
//
// Fractional cameras and zooms ON PURPOSE: an integral case cannot tell a snap from none.

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
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import { recordingContext, type Recording, type DeviceStroke } from '../../canvas/__tests__/chrome-recorder';
import { deviceStrokeWidth } from '../../canvas/device-grid';
import { expectedCentre, edgesWhole } from '../../canvas/__tests__/grid-edges';
import { SELECTION_MARQUEE } from '../../canvas/canvas-colors';
import type { Section } from '../../../core/model/s4-types';

const CHUNK_ID = 'c238';

function project(): never {
  const section = {
    index: 0, name: 's0',
    tileGrid: { widthTiles: 64, heightTiles: 64, nametable: new Uint16Array(64 * 64) },
    objects: [], rings: [], tiles: null, paletteRef: null, bgLayoutRef: null,
  } as unknown as Section;
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section] }],
    }],
    chunkLibrary: [{ id: CHUNK_ID, name: 'c', widthTiles: 4, heightTiles: 2, nametable: new Uint16Array(8) }],
  } as never;
}

const VIEWPORT = { left: 0, top: 0, width: 640, height: 480 };

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

interface Mounted { h: Hooked<object>; rec: Recording; ghost: HostStub }

/** The real MapViewport, with the recorder standing in for the ghost layer's context. */
async function mountMap(dpr: number): Promise<Mounted> {
  win = installWindowStub();
  win.setDevicePixelRatio(dpr);
  const mod = await import('../MapViewport');
  const h = renderHooked(mod.default as unknown as (p: object) => React.ReactElement, {});
  mounted = h;
  const canvases = attachRefs(h.el(), VIEWPORT).byTag('canvas');
  const ghost = canvases[1];
  expect(ghost, 'MapViewport rendered no second (ghost-layer) canvas: the tree moved').toBeDefined();
  const rec = recordingContext();
  (ghost.el as Record<string, unknown>).getContext = () => rec.ctx;
  return { h, rec, ghost };
}

/** Move the camera (a real visual dependency) so the render effect repaints both layers. */
function view(m: Mounted, v: { x: number; y: number; zoom: number }): void {
  useViewStore.setState({ vpX: v.x, vpY: v.y, zoom: v.zoom });
  m.h.setProps({});
}


/** The outline's device rect, from the four recorded corners. */
function box(s: DeviceStroke): { l: number; t: number; w: number; h: number } {
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  return { l: Math.min(...xs), t: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** The shared rule, restated: where `strokeRectOnDeviceGrid` must put a world rect. */
function expectOnGrid(s: DeviceStroke, world: { x: number; y: number; w: number; h: number },
  v: { x: number; y: number; zoom: number }, dpr: number): void {
  expect(s.kind).toBe('rect');
  expect(s.width, 'width').toBeCloseTo(deviceStrokeWidth(2, dpr), 9);
  // THE ROW 238 RULING: both edges of every side on whole device pixels. 2 CSS px is an
  // even device width at every dpr, so each side is centred on a whole device pixel.
  for (const [x, y] of s.pts) {
    expect(edgesWhole(x, s.width), `the side at x ${x} has an edge off the device grid`).toBe(true);
    expect(edgesWhole(y, s.width), `the side at y ${y} has an edge off the device grid`).toBe(true);
  }
  const b = box(s);
  expect(b.l).toBeCloseTo(expectedCentre((world.x - v.x) * v.zoom * dpr, 2, dpr), 9);
  expect(b.t).toBeCloseTo(expectedCentre((world.y - v.y) * v.zoom * dpr, 2, dpr), 9);
  expect(b.w).toBeCloseTo(Math.round(world.w * v.zoom * dpr), 9);
  expect(b.h).toBeCloseTo(Math.round(world.h * v.zoom * dpr), 9);
}

const DPRS = [1, 1.25, 1.35, 1.5, 2, 3];
const VIEWS = [
  { x: 0, y: 0, zoom: 1.5 },
  { x: 10.25, y: 3.5, zoom: 1.5 },
  { x: 13, y: 7, zoom: 0.5 },
  { x: 250.4, y: 99.9, zoom: 3.3 },
];

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.getState().reset();
  useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
  useEditorStore.getState().setSelection(null);
  useEditorStore.getState().setMarquee(null);
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
  useEditorStore.getState().setMarquee(null);
  useEditorStore.getState().setTool('select');
});

describe('the marquee outline is on the device grid (row 238 (a))', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, async () => {
        const m = await mountMap(dpr);
        // Block-aligned (even) bounds, so the stroke is SELECTION_MARQUEE.
        useEditorStore.getState().setMarquee({ sectionIndex: 0, col: 6, row: 4, w: 10, h: 6 });
        m.rec.strokes.length = 0;
        view(m, v);
        const outlines = m.rec.strokes.filter((s) => s.style === SELECTION_MARQUEE);
        expect(outlines.length, 'the repaint drew no marquee outline: the row measures nothing').toBe(1);
        expectOnGrid(outlines[0], { x: 48, y: 32, w: 80, h: 48 }, v, dpr);
        // The dash, in the frame the outline is stroked in: 4 CSS px, as it always was.
        expect(outlines[0].dash).toEqual([4, 4]);
      });
    }
  }
});

describe('the stamp ghost outline is on the device grid (row 238 (a))', () => {
  // The ghost's ART is rasterised into an offscreen canvas (canvas/region-preview.ts),
  // which calls `document.createElement`. The node suite has no document, so these rows
  // give it the smallest one that lets that raster complete; the rows read only the
  // outline, never the art.
  const g = globalThis as unknown as { document?: unknown };
  let hadDocument = false;
  let savedDocument: unknown;
  beforeEach(() => {
    hadDocument = 'document' in g;
    savedDocument = g.document;
    g.document = {
      createElement: () => ({
        width: 0, height: 0,
        getContext: () => ({
          createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => undefined,
        }),
      }),
    };
  });
  afterEach(() => {
    if (hadDocument) g.document = savedDocument; else delete g.document;
  });
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, async () => {
        const m = await mountMap(dpr);
        view(m, v);
        useEditorStore.getState().setTool('stamp-chunk');
        useEditorStore.getState().setSelectedChunkId(CHUNK_ID);
        m.h.setProps({});
        m.rec.strokes.length = 0;
        // A real pointer move over world (70, 21): chunk 4x2 tiles snaps to base
        // tile (8, 2), world (64, 16), 32x16 world px.
        const on = (m.h.el() as unknown as { props: Record<string, (e: unknown) => void> }).props;
        const cx = (70 - v.x) * v.zoom, cy = (21 - v.y) * v.zoom;
        on.onMouseMove({
          button: 0, buttons: 0, clientX: cx, clientY: cy, ctrlKey: false, metaKey: false,
          altKey: false, shiftKey: false, currentTarget: null, target: null, preventDefault: () => undefined,
        });
        const outlines = m.rec.strokes.filter((s) => s.style === SELECTION_MARQUEE);
        expect(outlines.length, 'the hover drew no stamp ghost outline: the row measures nothing').toBe(1);
        expectOnGrid(outlines[0], { x: 64, y: 16, w: 32, h: 16 }, v, dpr);
      });
    }
  }
});
