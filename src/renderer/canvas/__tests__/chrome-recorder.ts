// A RECORDING 2D CONTEXT, for the chrome that draws on MapViewport's dpr-scaled canvas.
//
// The node suite has no canvas. What it CAN see is every call a draw function makes and
// the transform in force when it was made, and that is all the defect in
// docs/reviews/2026-09-12-dpr-guides-offset.md ever was: a CSS-pixel coordinate issued
// under an identity transform onto a backing store sized in DEVICE pixels. So this
// records each call with the matrix it was issued under, and maps the geometry to device
// pixels the way a real canvas would, so a row can compare "where it landed on the
// backing store" with "where the hit test measures".
//
// ⚠ IT IS NOT A RASTERISER. It knows nothing about antialiasing, compositing or glyph
// shapes. Crispness is asserted from the stroke's device extent (a 1-device-px line
// centred on k+0.5 covers exactly one device row); anything about how the result LOOKS
// is the CDP harness's (scratchpad/dpr-guides-offset-harness.mjs) and the owner's.
//
// NOT A TEST FILE: no `.test.` in the name, so vitest does not collect it. It is shared
// by src/renderer/canvas/__tests__/dpr-chrome.test.ts and was shared by the one-off
// generator that recorded the dpr-1 golden from master (the packet quotes it).

import type { EffectsLayer, EffectsScene } from '../../../core/formats/effects/scene';
import type { GuideViewport, GuideDrawOptions } from '../effects-guides';
import type { ScreenFrameAnchor, FrameViewport, ScreenFrameDrawOptions } from '../screen-frame';
import type { LensViewport } from '../band-lens';

/** A 2D affine matrix in canvas order: a b c d e f. */
export type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** `m` then `n` applied first: the product the canvas spec's transform() builds. */
function mul(m: Mat, n: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const [A, B, C, D, E, F] = n;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Uniform scale of a matrix; the chrome only ever uses uniform scales. */
function scaleOf(m: Mat): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

/** One call, in issue order, with the matrix in force. Properties log as `set:<name>`. */
export interface RecordedCall {
  op: string;
  args: unknown[];
  m: Mat;
}

/** A device-pixel rectangle. */
export interface DeviceRect { x: number; y: number; w: number; h: number }

/** A stroked path or rect, in DEVICE pixels, with its width in device pixels. */
export interface DeviceStroke {
  kind: 'path' | 'rect';
  /** Every point of every subpath, device px. For `rect`, the four corners. */
  pts: [number, number][];
  /** Device-pixel width: lineWidth times the transform's scale. */
  width: number;
  style: unknown;
  dash: number[];
}

export interface DeviceText { text: string; x: number; y: number; font: string }
export interface DeviceImage { src: string; dest: DeviceRect }

export interface Recording {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
  strokes: DeviceStroke[];
  fills: DeviceRect[];
  texts: DeviceText[];
  images: DeviceImage[];
  clips: DeviceRect[];
}

/** A stand-in image: drawImage records its `tag`. */
export interface TaggedImage { tag: string }

const PROPS = [
  'lineWidth', 'strokeStyle', 'fillStyle', 'font', 'textBaseline', 'textAlign',
  'globalAlpha', 'imageSmoothingEnabled',
] as const;

/**
 * A context whose calls are logged and whose geometry is mapped to device pixels.
 *
 * `measureText` is deterministic (5 px per character) so a plate's width is a
 * function of its text alone, which is what lets a dpr-1 recording be compared
 * byte for byte with one taken on another day.
 */
export function recordingContext(): Recording {
  const calls: RecordedCall[] = [];
  const strokes: DeviceStroke[] = [];
  const fills: DeviceRect[] = [];
  const texts: DeviceText[] = [];
  const images: DeviceImage[] = [];
  const clips: DeviceRect[] = [];
  let m: Mat = [...IDENTITY];
  const state: Record<string, unknown> = {
    lineWidth: 1, strokeStyle: '#000', fillStyle: '#000', font: '10px sans-serif',
    textBaseline: 'alphabetic', textAlign: 'start', globalAlpha: 1, imageSmoothingEnabled: true,
  };
  let dash: number[] = [];
  const stack: { m: Mat; state: Record<string, unknown>; dash: number[] }[] = [];
  let path: [number, number][][] = [];

  const log = (op: string, args: unknown[]) => { calls.push({ op, args, m: [...m] }); };
  const rectOf = (x: number, y: number, w: number, h: number): DeviceRect => {
    const [x0, y0] = apply(m, x, y);
    const [x1, y1] = apply(m, x + w, y + h);
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  };
  const corners = (x: number, y: number, w: number, h: number): [number, number][] =>
    [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)];

  const ctx: Record<string, unknown> = {
    save() { log('save', []); stack.push({ m: [...m], state: { ...state }, dash: [...dash] }); },
    restore() {
      log('restore', []);
      const top = stack.pop();
      if (top) { m = top.m; Object.assign(state, top.state); dash = top.dash; }
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      log('setTransform', [a, b, c, d, e, f]);
      m = [a, b, c, d, e, f];
    },
    resetTransform() { log('resetTransform', []); m = [...IDENTITY]; },
    scale(x: number, y: number) { log('scale', [x, y]); m = mul(m, [x, 0, 0, y, 0, 0]); },
    translate(x: number, y: number) { log('translate', [x, y]); m = mul(m, [1, 0, 0, 1, x, y]); },
    beginPath() { log('beginPath', []); path = []; },
    moveTo(x: number, y: number) { log('moveTo', [x, y]); path.push([apply(m, x, y)]); },
    lineTo(x: number, y: number) {
      log('lineTo', [x, y]);
      if (path.length === 0) path.push([]);
      path[path.length - 1].push(apply(m, x, y));
    },
    rect(x: number, y: number, w: number, h: number) { log('rect', [x, y, w, h]); path.push(corners(x, y, w, h)); },
    stroke() {
      log('stroke', []);
      strokes.push({
        kind: 'path', pts: path.flat(), width: (state.lineWidth as number) * scaleOf(m),
        style: state.strokeStyle, dash: [...dash],
      });
    },
    fill() { log('fill', []); },
    clip() {
      log('clip', []);
      const pts = path.flat();
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      clips.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      log('strokeRect', [x, y, w, h]);
      strokes.push({
        kind: 'rect', pts: corners(x, y, w, h), width: (state.lineWidth as number) * scaleOf(m),
        style: state.strokeStyle, dash: [...dash],
      });
    },
    fillRect(x: number, y: number, w: number, h: number) { log('fillRect', [x, y, w, h]); fills.push(rectOf(x, y, w, h)); },
    clearRect(x: number, y: number, w: number, h: number) { log('clearRect', [x, y, w, h]); },
    fillText(text: string, x: number, y: number) {
      log('fillText', [text, x, y]);
      const [dx, dy] = apply(m, x, y);
      texts.push({ text, x: dx, y: dy, font: state.font as string });
    },
    measureText(text: string) { log('measureText', [text]); return { width: text.length * 5 }; },
    setLineDash(d: number[]) { log('setLineDash', [[...d]]); dash = [...d]; },
    drawImage(img: TaggedImage, ...rest: number[]) {
      const src = img && typeof img.tag === 'string' ? img.tag : 'image';
      log('drawImage', [src, ...rest]);
      // Only the nine-argument form is used by the chrome (camera-preview.ts).
      const [, , , , dx, dy, dw, dh] = rest;
      images.push({ src, dest: rectOf(dx, dy, dw, dh) });
    },
  };
  for (const k of PROPS) {
    Object.defineProperty(ctx, k, {
      get: () => state[k],
      set: (v: unknown) => { log(`set:${k}`, [v]); state[k] = v; },
      enumerable: true,
    });
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D, calls, strokes, fills, texts, images, clips,
  };
}

// ---------------------------------------------------------------------------
// THE SCENARIOS, shared by the golden's generator and the rows that read it.
//
// Fractional viewports and zooms ON PURPOSE: an integral case cannot tell
// `Math.round(v)` from `v`, or a device-grid snap from none, and the whole
// subject is where half-pixels go.
// ---------------------------------------------------------------------------

const layer = (world_y: number, extra: Partial<EffectsLayer> = {}): EffectsLayer =>
  ({ world_y, fa: 'FACTOR_1', fb: 'FACTOR_1', ...extra });

export interface GuideCase { name: string; vp: GuideViewport; layers: EffectsLayer[]; opts: GuideDrawOptions }
export interface SurfaceCase { name: string; vp: GuideViewport; layers: EffectsLayer[] }
export interface FrameCase { name: string; vp: FrameViewport; anchor: ScreenFrameAnchor; opts: ScreenFrameDrawOptions }
export interface CameraCase {
  name: string; scene: EffectsScene; camX: number; camY: number;
  anchor: ScreenFrameAnchor; vp: FrameViewport; captions: boolean;
}
export interface LensLabelCase {
  name: string; vp: LensViewport; lines: string[]; anchor: { x: number; y: number } | null;
}

const VP_A = { x: 3, y: 7.25, width: 811, height: 603, zoom: 1.5 };
const VP_B = { x: 40, y: 0, width: 1097.6, height: 688.4, zoom: 2.5 };
const VP_C = { x: 0, y: 0, width: 912, height: 640, zoom: 1 };

export const GUIDE_CASES: GuideCase[] = [
  {
    name: 'act space, three layers, one disabled, fractional pan and zoom',
    vp: VP_A,
    layers: [layer(40), layer(131, { enabled: false }), layer(257)],
    opts: { space: 'act' },
  },
  {
    name: 'screen space, hover on 1, a refusal notice on 2 (plate + caption)',
    vp: VP_C,
    layers: [layer(60), layer(200), layer(221)],
    opts: {
      space: 'screen', hoverIndex: 1,
      notices: new Map([[2, {
        tone: 'illegal' as const,
        text: 'fires on screen line 221, and a vsplit fire must land inside 3..223 with room for the next one',
      }]]),
    },
  },
  {
    name: 'a drag in flight on 0, zoom 2.5, a guide near the top edge',
    vp: VP_B,
    layers: [layer(3), layer(90)],
    opts: { space: 'act', dragIndex: 0, dragWorldY: 12.4 },
  },
];

export const SURFACE_CASES: SurfaceCase[] = [
  {
    name: 'two remapped layers, one rule near the top edge',
    vp: VP_A,
    layers: [layer(10, { rowRemap: { plane_y: 12, height_shift: 4 } }), layer(96),
      layer(150, { rowRemap: { plane_y: 301, height_shift: 3 } })],
  },
  {
    name: 'zoom 2.5, one rule',
    vp: VP_B,
    layers: [layer(0, { rowRemap: { plane_y: 97, height_shift: 5 } })],
  },
];

export const FRAME_CASES: FrameCase[] = [
  { name: 'at rest, fractional pan, zoom 1.5', vp: VP_A, anchor: { x: 37, y: 13 }, opts: {} },
  { name: 'active, zoom 2.5, caption override', vp: VP_B, anchor: { x: 64, y: 32 }, opts: { active: true, caption: 'camera x=64 · v_offset=32' } },
  { name: 'half off the top edge', vp: VP_C, anchor: { x: 0, y: 0 }, opts: {} },
];

const fourBands: EffectsScene = {
  schema: 1, id: 'chrome_recorder', v_factor: 15,
  layers: [
    layer(0, { fb: 'FACTOR_LOCKED' }), layer(32, { fb: 'FACTOR_1_16' }),
    layer(112, { fb: 'FACTOR_1_4' }), layer(160, { fb: 'FACTOR_1_2' }),
  ],
};

export const CAMERA_CASES: CameraCase[] = [
  { name: 'four bands, camera 320, fractional frame', scene: fourBands, camX: 320, camY: 0, anchor: { x: 37, y: 13 }, vp: VP_A, captions: true },
  { name: 'four bands, camera 900 (wraps), zoom 2.5, no captions', scene: fourBands, camX: 900, camY: 40, anchor: { x: 64, y: 32 }, vp: VP_B, captions: false },
];

export const LENS_LABEL_CASES: LensLabelCase[] = [
  {
    name: 'anchored to coverage, fractional anchor',
    vp: VP_A,
    lines: ['highlighted: the cells band 0 animates', 'steps every 8 frames', 'band 0 · slots 0..32'],
    anchor: { x: 123.4, y: 88.8 },
  },
  { name: 'no coverage on screen: the corner', vp: VP_B, lines: ['highlighted: the cells band 1 animates'], anchor: null },
];

/** Plane sources for the camera cases: two tagged stand-ins of the plane's size. */
export const CAMERA_SOURCES = [
  { image: { tag: 'plane' } as unknown as CanvasImageSource, pixelWidth: 512, pixelHeight: 512 },
  { image: { tag: 'overlay' } as unknown as CanvasImageSource, pixelWidth: 512, pixelHeight: 512 },
];
