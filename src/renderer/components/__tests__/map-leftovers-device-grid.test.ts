// MAPVIEWPORT'S COLLISION-PAINT SHAPE GHOST STROKES ON THE DEVICE GRID (ROADMAP row 240 (a)).
//
// Row 239 (d) snapped the collision-paint scope and primary outlines and left the SHAPE
// GHOST drawn inside the primary cell in world units (docs/reviews/2026-09-28-stragglers-
// 239d.md section 6): `drawCollisionShape` at `lineWidth 1.5 / zoom` (the surface line),
// `solidEdgeWidth 3 / zoom` (the solid edges) and its own angle mark at `1.25 / zoom` and
// `3 / zoom`. It now draws through `shapeCtxOnDeviceGrid`, the marks' adapter.
//
// These rows mount the REAL component with the recorder (canvas/__tests__/chrome-recorder.ts)
// as the ghost layer's context, arm a flat floor (height 8, solid on all sides, angle 0),
// and hover through the component's own `onMouseMove`. The flat floor makes every stroke
// of the ghost axis-aligned: the surface line is horizontal, the four solid edges are the
// cell's sides, and the mark's bar and stem are horizontal and vertical.
//
// Every expectation comes from `deviceStrokeWidth` and `Math.round` (grid-edges.ts) and
// the camera, never from `snapStrokeEdges`. Fractional cameras and zooms ON PURPOSE, and
// none of them puts an edge exactly halfway between two device pixels (a position tie,
// which float noise decides; see overlay-leftovers-device-grid.test.ts).

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
import {
  COLLISION_SHAPE_LINE, COLLISION_SOLID_EDGE, COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING,
} from '../../canvas/canvas-colors';
import { ARROW_WIDTH_SCALE, DETAIL_CELL_PX } from '../../../core/collision/collision-angle-mark';
import type { CollisionProfile, CollisionProfileSet } from '../../../core/collision/collision-model';
import type { Section } from '../../../core/model/s4-types';

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

const FLAT: CollisionProfile = { heights: new Int8Array(16).fill(8), angle: 0, hasAngle: true, solidity: 'all' };
const SET: CollisionProfileSet = {
  engine: 's4',
  solidCount: 2,
  profiles: [{ heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'none' }, FLAT],
};

const VIEWPORT = { left: 0, top: 0, width: 640, height: 480 };
const DPRS = [1, 1.25, 1.35, 1.5, 2, 3];
/** Zoom Z puts a 16px cell past DETAIL_CELL_PX, so the mark draws its bar beside the stem. */
const Z = (DETAIL_CELL_PX + 1) / 16;
const VIEWS = [
  { x: 3.3, y: 1.7, zoom: Z },
  { x: 10.25, y: 3.5, zoom: 1.5 },
  { x: 0, y: 0, zoom: 2 },
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
  useProjectStore.getState().setCollisionProfiles(SET);
  useSessionStore.setState({ activeId: 'level:ojz:act1' });
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  win?.restore();
  win = null;
  useEditorStore.getState().setTool('select');
  useEditorStore.getState().setSelectedCollisionProfile(0);
  useProjectStore.getState().setCollisionProfiles(null);
});

/** Every segment of every stroke in `ss`, as [x0, y0, x1, y1], each checked on the grid. */
function axisSegments(ss: DeviceStroke[], cssWidth: number, dpr: number, what: string): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const s of ss) {
    expect(s.kind, `${what}: a path`).toBe('path');
    expect(s.width, `${what}: width`).toBeCloseTo(deviceStrokeWidth(cssWidth, dpr), 9);
    for (let i = 0; i < s.pts.length; i += 2) {
      const [[x0, y0], [x1, y1]] = [s.pts[i], s.pts[i + 1]];
      const horizontal = Math.abs(y1 - y0) < 1e-6, vertical = Math.abs(x1 - x0) < 1e-6;
      expect(horizontal || vertical, `${what}: a segment neither horizontal nor vertical`).toBe(true);
      expect(edgesWhole(horizontal ? y0 : x0, s.width), `${what}: an edge off the device grid`).toBe(true);
      const ends = horizontal ? [x0, x1] : [y0, y1];
      for (const e of ends) expect(Math.abs(e - Math.round(e)) < 1e-6, `${what}: an end off the device grid`).toBe(true);
      out.push([x0, y0, x1, y1]);
    }
  }
  return out;
}

describe('the collision-paint shape ghost strokes on the device grid (row 240 (a))', () => {
  for (const dpr of DPRS) {
    for (const v of VIEWS) {
      it(`dpr ${dpr}, zoom ${v.zoom}, camera ${v.x},${v.y}`, async () => {
        const m = await mountMap(dpr);
        view(m, v);
        useEditorStore.getState().setSelectedCollisionProfile(1);
        useEditorStore.getState().setSelectedCollisionSolidity('all');
        useEditorStore.getState().setTool('paint-collision');
        m.h.setProps({});
        m.rec.strokes.length = 0;
        m.rec.fills.length = 0;
        // World (70, 21): cell (4, 1), world (64, 16).
        hover(m, v, 70, 21);
        expect(m.rec.fills.length, 'the ghost drew no silhouette: no profile was armed').toBeGreaterThan(0);
        const X = 64, Y = 16;
        const dx = (w: number) => (w - v.x) * v.zoom * dpr;
        const dy = (w: number) => (w - v.y) * v.zoom * dpr;

        // The surface line: horizontal, 1.5 CSS px, on the row nearest the surface.
        const line = m.rec.strokes.filter((s) => s.style === COLLISION_SHAPE_LINE);
        expect(line.length, 'no surface line: the row measures nothing').toBeGreaterThan(0);
        for (const [, y0] of axisSegments(line, 1.5, dpr, 'surface line')) {
          expect(y0).toBeCloseTo(expectedCentre(dy(Y + 8), 1.5, dpr), 9);
        }

        // The solid edges: the cell's four sides, 3 CSS px, nearest the unsnapped side.
        const edges = m.rec.strokes.filter((s) => s.style === COLLISION_SOLID_EDGE);
        expect(edges.length, 'no solid edges: the row measures nothing').toBeGreaterThan(0);
        const segs = axisSegments(edges, 3, dpr, 'solid edges');
        expect(segs.length, 'top, right, bottom, left').toBe(4);
        const rows = segs.filter(([, y0, , y1]) => Math.abs(y1 - y0) < 1e-6).map(([, y]) => y).sort((a, b) => a - b);
        const cols = segs.filter(([x0, , x1]) => Math.abs(x1 - x0) < 1e-6).map(([x]) => x).sort((a, b) => a - b);
        expect(rows[0]).toBeCloseTo(expectedCentre(dy(Y), 3, dpr), 9);
        expect(rows[1]).toBeCloseTo(expectedCentre(dy(Y + 16), 3, dpr), 9);
        expect(cols[0]).toBeCloseTo(expectedCentre(dx(X), 3, dpr), 9);
        expect(cols[1]).toBeCloseTo(expectedCentre(dx(X + 16), 3, dpr), 9);

        // The mark: every core and casing segment axis-aligned and whole. The stem's core
        // is ARROW_WIDTH_SCALE times the bar's, and its casing that core plus the bar's
        // casing margin on each side (ROADMAP row 240 (c)), so the two share a centre;
        // the last stroke of each colour is the stem.
        const core = m.rec.strokes.filter((s) => s.style === COLLISION_ANGLE_TICK);
        const casing = m.rec.strokes.filter((s) => s.style === COLLISION_ANGLE_CASING);
        expect(core.length, 'no mark: the row measures nothing').toBeGreaterThan(0);
        const stemCore = axisSegments(core.slice(-1), 1.25 * ARROW_WIDTH_SCALE, dpr, 'stem core');
        const stemCasing = axisSegments(casing.slice(-1), 1.25 * ARROW_WIDTH_SCALE + (3 - 1.25), dpr, 'stem casing');
        expect(stemCasing[0][0], 'the stem is concentric in its casing').toBeCloseTo(stemCore[0][0], 6);
        expect(stemCasing[0][1], 'the stem is concentric in its casing').toBeCloseTo(stemCore[0][1], 6);
        axisSegments(core.slice(0, -1), 1.25, dpr, 'bar core');
        axisSegments(casing.slice(0, -1), 3, dpr, 'bar casing');
      });
    }
  }

  it('the silhouette is still FILLED, in world units under the ghost layer\'s world transform (the wrapper forwards fills)', async () => {
    const dpr = 1.5, v = VIEWS[1];
    const m = await mountMap(dpr);
    view(m, v);
    useEditorStore.getState().setSelectedCollisionProfile(1);
    useEditorStore.getState().setTool('paint-collision');
    m.h.setProps({});
    m.rec.fills.length = 0;
    hover(m, v, 70, 21);
    const fillCalls = m.rec.calls.filter((c) => c.op === 'fillRect');
    expect(fillCalls.length, 'the flat floor fills 16 columns').toBeGreaterThanOrEqual(16);
    const last = fillCalls[fillCalls.length - 1];
    // The last column's fill, in world px, under scale(zoom * dpr).
    expect(last.args).toEqual([64 + 15, 16 + 8, 1, 8]);
    expect(last.m[0]).toBeCloseTo(v.zoom * dpr, 9);
  });
});
