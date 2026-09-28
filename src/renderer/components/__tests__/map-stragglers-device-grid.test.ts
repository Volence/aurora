// MAPVIEWPORT'S PASTE GHOST AND COLLISION-PAINT OUTLINES LAND ON THE DEVICE GRID
// (ROADMAP row 239 (d), sites 1 and 2).
//
// Row 238 moved MapViewport's stamp ghost and marquee onto the device grid and left two
// more ghost-layer outlines in world units (docs/reviews/2026-09-28-device-grid-238.md,
// Open): the paste ghost's `2 / pZoom` dashed outline, and the collision-paint block
// outlines (`1 / zoom` scope, `1.5 / zoom` primary), which are INSET strokes that sit just
// inside their 16px cell. These rows read the REAL component's draw through the recorder
// (canvas/__tests__/chrome-recorder.ts) handed to the ghost-layer canvas, after a real
// `onMouseMove` through the component's own handler:
//
//   site 1  the paste ghost: width `deviceStrokeWidth(2, dpr)`, both edges of every side
//           on whole device px at the parity-aware centre nearest the unsnapped edge,
//           the size a whole number of device px, and the dash [4, 4] CSS px;
//   site 2  the scope and primary outlines: the OUTER edge of each side is the cell's
//           edge rounded to a whole device px, the INNER edge `deviceStrokeWidth(w, dpr)`
//           device px inside it (w = 1 and 1.5 CSS px), so the stroke stays in the cell.
//
// Every expectation comes from `deviceStrokeWidth` and `Math.round` (grid-edges.ts) and the
// camera, never from `snapStrokeEdges`. Fractional cameras and zooms ON PURPOSE.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import { installWindowStub, type WindowStub } from '../../../test/window-stub';
import { attachRefs } from '../../../test/element-stub';
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
import { SELECTION_MARQUEE, COLLISION_PREVIEW_SCOPE, COLLISION_PREVIEW_PRIMARY } from '../../canvas/canvas-colors';
import type { Section } from '../../../core/model/s4-types';
import type { MapClipboard } from '../../../core/editing/map-clipboard';

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
    chunkLibrary: [],
  } as never;
}

const VIEWPORT = { left: 0, top: 0, width: 640, height: 480 };
const DPRS = [1, 1.25, 1.35, 1.5, 2, 3];
const VIEWS = [
  { x: 0, y: 0, zoom: 1.5 },
  { x: 10.25, y: 3.5, zoom: 1.5 },
  { x: 13, y: 7, zoom: 0.5 },
  { x: 250.4, y: 99.9, zoom: 3.3 },
];
type View = { x: number; y: number; zoom: number };

let win: WindowStub | null = null;
let mounted: Hooked<object> | null = null;

interface Mounted { h: Hooked<object>; rec: Recording }

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
  return { h, rec };
}

function view(m: Mounted, v: View): void {
  useViewStore.setState({ vpX: v.x, vpY: v.y, zoom: v.zoom });
  m.h.setProps({});
}

/** A real pointer move over world (wx, wy), through the component's own handler. */
function hover(m: Mounted, v: View, wx: number, wy: number): void {
  const on = (m.h.el() as unknown as { props: Record<string, (e: unknown) => void> }).props;
  on.onMouseMove({
    button: 0, buttons: 0, clientX: (wx - v.x) * v.zoom, clientY: (wy - v.y) * v.zoom,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    currentTarget: null, target: null, preventDefault: () => undefined,
  });
}

function box(s: DeviceStroke): { l: number; t: number; r: number; b: number } {
  const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
  return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
}

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.getState().reset();
  useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
  useEditorStore.getState().setSelection(null);
  useEditorStore.getState().setMarquee(null);
  useEditorStore.getState().setTool('select');
  useEditorStore.getState().setMapClipboard(null);
  useEditorStore.getState().setPasting(false);
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
  useEditorStore.getState().setPasting(false);
  useEditorStore.getState().setMapClipboard(null);
  useEditorStore.getState().setTool('select');
  useEditorStore.getState().setSelectedCollisionProfile(0);
});

// ═══ site 1: the paste ghost ═══════════════════════════════════════════════════════
describe('site 1: the paste ghost outline is on the device grid (row 239 (d))', () => {
  // A 4x2-tile clipboard carrying collision, so it pastes on the 16px grid and strokes
  // SELECTION_MARQUEE. Its tile set is not the zone's, so no art is rasterised (the
  // outline is drawn either way) and the node suite needs no document.
  const clip: MapClipboard = {
    widthTiles: 4, heightTiles: 2, nametable: new Uint16Array(8),
    collisionA: new Uint16Array(2), collisionB: new Uint16Array(2), artOnly: false,
    tileset: { tiles: [] } as never,
  };
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, async () => {
        const m = await mountMap(dpr);
        view(m, v);
        useEditorStore.getState().setMapClipboard(clip);
        useEditorStore.getState().setPasting(true);
        m.h.setProps({});
        m.rec.strokes.length = 0;
        // World (70, 21): tile (8, 2) snapped to the 2-tile step, world (64, 16), 32x16.
        hover(m, v, 70, 21);
        const outlines = m.rec.strokes.filter((s) => s.style === SELECTION_MARQUEE);
        expect(outlines.length, 'the hover drew no paste ghost outline: the row measures nothing').toBe(1);
        const s = outlines[0];
        expect(s.kind).toBe('rect');
        expect(s.width, 'width').toBeCloseTo(deviceStrokeWidth(2, dpr), 9);
        for (const [x, y] of s.pts) {
          expect(edgesWhole(x, s.width), `the side at x ${x} has an edge off the device grid`).toBe(true);
          expect(edgesWhole(y, s.width), `the side at y ${y} has an edge off the device grid`).toBe(true);
        }
        const b = box(s);
        expect(b.l).toBeCloseTo(expectedCentre((64 - v.x) * v.zoom * dpr, 2, dpr), 9);
        expect(b.t).toBeCloseTo(expectedCentre((16 - v.y) * v.zoom * dpr, 2, dpr), 9);
        expect(b.r - b.l).toBeCloseTo(Math.round(32 * v.zoom * dpr), 9);
        expect(b.b - b.t).toBeCloseTo(Math.round(16 * v.zoom * dpr), 9);
        // The dash in the CSS frame it is now stroked in: the 4 CSS px it always was.
        expect(s.dash).toEqual([4, 4]);
      });
    }
  }
});

// ═══ site 2: the collision-paint scope and primary outlines ════════════════════════
describe('site 2: the collision-paint block outlines are inset on the device grid (row 239 (d))', () => {
  /** An inset outline of a world cell: outer edges whole on the cell, inner edges w in. */
  function expectInset(s: DeviceStroke, cellX: number, cellY: number, cssWidth: number, v: View, dpr: number): void {
    expect(s.kind).toBe('rect');
    const w = deviceStrokeWidth(cssWidth, dpr);
    expect(s.width, 'width').toBeCloseTo(w, 9);
    const L = Math.round((cellX - v.x) * v.zoom * dpr), T = Math.round((cellY - v.y) * v.zoom * dpr);
    const R = Math.round((cellX + 16 - v.x) * v.zoom * dpr), B = Math.round((cellY + 16 - v.y) * v.zoom * dpr);
    const b = box(s);
    // Each side's centre is half the width in from its outer edge, so both edges are whole
    // and the stroke is inside [L, R] x [T, B].
    expect(b.l - w / 2, 'left outer edge').toBeCloseTo(L, 9);
    expect(b.t - w / 2, 'top outer edge').toBeCloseTo(T, 9);
    expect(b.r + w / 2, 'right outer edge').toBeCloseTo(R, 9);
    expect(b.b + w / 2, 'bottom outer edge').toBeCloseTo(B, 9);
    for (const [x, y] of s.pts) {
      expect(edgesWhole(x, w), `the side at x ${x} has an edge off the device grid`).toBe(true);
      expect(edgesWhole(y, w), `the side at y ${y} has an edge off the device grid`).toBe(true);
    }
  }
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, async () => {
        const m = await mountMap(dpr);
        view(m, v);
        // The eraser (profile 0): no shape ghost, so the two outlines are the whole draw.
        useEditorStore.getState().setSelectedCollisionProfile(0);
        useEditorStore.getState().setTool('paint-collision');
        m.h.setProps({});
        m.rec.strokes.length = 0;
        // World (70, 21): cell (4, 1), world (64, 16).
        hover(m, v, 70, 21);
        const scope = m.rec.strokes.filter((s) => s.style === COLLISION_PREVIEW_SCOPE);
        const primary = m.rec.strokes.filter((s) => s.style === COLLISION_PREVIEW_PRIMARY);
        expect(scope.length, 'the hover drew no scope outline: the row measures nothing').toBe(1);
        expect(primary.length, 'the hover drew no primary outline: the row measures nothing').toBe(1);
        expectInset(scope[0], 64, 16, 1, v, dpr);
        expectInset(primary[0], 64, 16, 1.5, v, dpr);
      });
    }
  }

  it('at dpr 1 on integer edges the scope outline covers the column the world-unit stroke did', async () => {
    // Master: `lineWidth 1 / zoom` at `x + 0.5 / zoom`, i.e. device [L, L + 1] for an
    // integer device edge L. The inset outline's left side must cover exactly that.
    const v = { x: 0, y: 0, zoom: 2 };
    const m = await mountMap(1);
    view(m, v);
    useEditorStore.getState().setTool('paint-collision');
    m.h.setProps({});
    m.rec.strokes.length = 0;
    hover(m, v, 70, 21);
    const s = m.rec.strokes.find((x) => x.style === COLLISION_PREVIEW_SCOPE)!;
    const L = 64 * 2;
    expect(box(s).l - s.width / 2).toBeCloseTo(L, 9);
    expect(box(s).l + s.width / 2).toBeCloseTo(L + 1, 9);
  });
});
