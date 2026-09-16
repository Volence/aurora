// THE REGIONS OVERLAY — an act's identity, painted on the map.
//
// Editor spec §3.4 (empyrean
// `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` at
// `origin/main`): "the map draws each region's union outline (interior edges
// suppressed) in a per-region hue with the label at the union's top-left and a
// light hatched fill". Step 8's second half. The gestures are
// `src/core/editing/region-marquee.ts`; the area arithmetic is
// `src/core/editing/region-geometry.ts`; this file draws and answers nothing.
//
// ⚠ NAME COLLISION, STATED SO A GREP IS NOT MISREAD. `region-preview.ts` in this
// same directory uses "region" for A RECTANGLE OF MAP the marquee has grabbed.
// This file is the regions-DOCUMENT family, with `region-geometry.ts` and
// `region-marquee.ts`.
//
// ═══ INTERIOR EDGES ARE SUPPRESSED, WHICH IS WHY THIS IS NOT FOUR strokeRects ═══
//
// Carving splits one rectangle into as many as four, so a region the author drew
// as one shape is a SET of rectangles by the time it is drawn. Outlining each
// one separately would draw seams the author never made and would teach them to
// read a carve as a split. `regionOutlineSegments` emits only the boundary of
// the UNION: for each side of each rectangle, the part not shared with another
// rectangle of the SAME region. It is pure and it is the piece under test.
//
// ═══ UNASSIGNED IS PAINTED, ALWAYS ═══
//
// An area no region holds is a first-class answer the build REFUSES
// (`region-geometry.ts`'s header; `flattenRegionsDocument` throws on a hole), so
// it is drawn rather than left as absence. `coverage` produces it exactly, by
// subtraction, and it is drawn as a CROSS hatch in the refusal red: hue alone
// would be the one categorical answer resting on the one channel a colourblind
// reader may not have (`canvas-colors.ts`'s regions block).
//
// AND IT IS NAMED IN WORDS. `band-lens.ts`'s recorded lesson is that its wash
// was never frightening and never unclear as a colour, and that "THE REAL DEFECT
// WAS THAT NOTHING NAMED THE WASH". One label, on the LARGEST hole, so an act
// with forty holes does not get forty labels smothering the map.
//
// ═══ THE LABEL'S SECOND LINE IS THE BACKGROUND, UNCONDITIONALLY ═══
//
// Owner ruling of 2026-09-16 (`regions-aeon.ts`'s header quotes it): "The
// background's name is the second line of every region label whenever the
// Regions facet is shown, in every act, including the all-shared launch state."
// The words come from `regionBgLabel` and are handed in, so this module stays
// pure and there is one derivation of that sentence rather than two.
//
// ═══ HUES ARE A FUNCTION OF DOCUMENT POSITION, AND ONLY FOR NOW ═══
//
// `regionHue(index)` is deterministic so a reopened act looks the same and a
// harness can predict it. Author-chosen colours are a LATER parcel (the owner:
// "Maybe give an option to change colour later") and the sidecar that would
// hold them is not built here; when it is, it overrides this function and
// nothing else changes.
//
// ═══ NO CLOCK, AND THE dpr FRAME IS THE CANVAS'S OWN ═══
//
// `drawRegionOverlay` runs inside MapViewport's existing draw pass, exactly as
// `drawScreenFrame` does. It schedules nothing. It draws under the canvas's own
// CSS transform (`setTransform(dpr, ...)`) and snaps in device space, never
// resetting to identity: that reset is the defect
// `docs/reviews/2026-09-12-dpr-guides-offset.md` is about and
// `canvas/device-grid.ts` is the fix.
//
// ⚠ NOT WIRED. Nothing calls this yet. MapViewport, the `region` tool id and the
// facet's arming are parcel 8B.

import {
  REGION_HUES, REGION_LABEL_BG, REGION_LABEL_TEXT, REGION_LABEL_WARN,
  REGION_UNASSIGNED_FILL, REGION_UNASSIGNED_LABEL_BG, REGION_UNASSIGNED_LABEL_TEXT,
} from './canvas-colors';
import { worldYToCanvasY } from './effects-guides';
import { snapLength, snapStroke } from './device-grid';
import { REGION_GRAB_PX } from '../../core/editing/region-marquee';
import {
  coverage, isEmptyRect, rectArea, sortRects,
  type Rect, type RegionPiece,
} from '../../core/editing/region-geometry';

// ---------------------------------------------------------------------------
// The visual calls, as constants so a test and a harness read them from here
// ---------------------------------------------------------------------------

/**
 * Perpendicular distance between hatch lines, in SCREEN px.
 *
 * SCREEN px and not world px, for the same reason the grab band is: the hatch is
 * TEXTURE, and a texture whose density tracks the zoom is a solid wash at 8x and
 * an empty outline at 1/8. 8 px is the tile grid's own pitch at zoom 1, so at
 * the zoom an author paints at the two lattices agree instead of beating.
 */
export const REGION_HATCH_PX = 8;

/** The union outline, unselected and selected. `drawScreenFrame`'s 1-then-2. */
export const REGION_OUTLINE_PX = 1;
export const REGION_OUTLINE_SELECTED_PX = 2;

/** Alpha the hue is washed at for the hatch, so level art stays readable. */
export const REGION_HATCH_ALPHA = 0.45;

/**
 * The hue a region at `index` in the document draws in.
 *
 * Wraps rather than clamping: the top of a range is a sentinel in some of this
 * suite's encodings, and a palette is not one of them. A region past the
 * palette's length repeats a hue and is separated by the hatch ANGLE instead
 * (`regionHatchSlope`), so the first `REGION_HUES.length * 2` regions of an act
 * are all distinct pairs.
 */
export function regionHue(index: number): string {
  return REGION_HUES[((index % REGION_HUES.length) + REGION_HUES.length) % REGION_HUES.length];
}

/** 1 or -1: the slope of this region's hatch, alternating each palette wrap. */
export function regionHatchSlope(index: number): 1 | -1 {
  const wrap = Math.floor(Math.abs(index) / REGION_HUES.length);
  return wrap % 2 === 0 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// The union outline (pure)
// ---------------------------------------------------------------------------

/** One drawn boundary segment, in WORLD pixels. Always axis-aligned. */
export interface OutlineSegment { x1: number; y1: number; x2: number; y2: number }

/** `[lo, hi)` minus every `cut`, in order. A one-dimensional subtraction: the
 *  rectangle kind lives in `region-geometry.ts` and this is not it. */
function subtractSpans(lo: number, hi: number, cuts: readonly [number, number][]): [number, number][] {
  let spans: [number, number][] = [[lo, hi]];
  for (const [a, b] of cuts) {
    const next: [number, number][] = [];
    for (const [s, e] of spans) {
      if (b <= s || a >= e) { next.push([s, e]); continue; }
      if (a > s) next.push([s, a]);
      if (b < e) next.push([b, e]);
    }
    spans = next;
  }
  return spans.filter(([s, e]) => e > s);
}

/**
 * The boundary of the UNION of `rects`, as segments, with interior edges
 * suppressed (file docblock).
 *
 * The rule is exact for a DISJOINT set, which is what the ruled model
 * guarantees: a point on the left edge of one rectangle is interior exactly when
 * another rectangle's right edge sits at that same x over that same y span.
 * Deterministic: the rectangles are sorted first, so two runs of the editor
 * produce the same list.
 */
export function regionOutlineSegments(rects: readonly Rect[]): OutlineSegment[] {
  const rs = sortRects(rects).filter((r) => !isEmptyRect(r));
  const out: OutlineSegment[] = [];

  for (const r of rs) {
    const rx1 = r.x + r.w;
    const ry1 = r.y + r.h;

    const vertical = (x: number, touching: (q: Rect) => boolean) => {
      const cuts = rs
        .filter((q) => q !== r && touching(q))
        .map((q) => [q.y, q.y + q.h] as [number, number]);
      for (const [a, b] of subtractSpans(r.y, ry1, cuts)) out.push({ x1: x, y1: a, x2: x, y2: b });
    };
    const horizontal = (y: number, touching: (q: Rect) => boolean) => {
      const cuts = rs
        .filter((q) => q !== r && touching(q))
        .map((q) => [q.x, q.x + q.w] as [number, number]);
      for (const [a, b] of subtractSpans(r.x, rx1, cuts)) out.push({ x1: a, y1: y, x2: b, y2: y });
    };

    vertical(r.x, (q) => q.x + q.w === r.x);
    vertical(rx1, (q) => q.x === rx1);
    horizontal(r.y, (q) => q.y + q.h === r.y);
    horizontal(ry1, (q) => q.y === ry1);
  }
  return out;
}

/** The smallest rectangle holding every rectangle, or null for an empty set. */
export function unionBounds(rects: readonly Rect[]): Rect | null {
  const rs = rects.filter((r) => !isEmptyRect(r));
  if (rs.length === 0) return null;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** The map viewport, in the shape the draw pass already has one. */
export interface RegionViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/** One region, as the overlay needs it: order gives the hue, words give the label. */
export interface RegionOverlayRegion {
  id: string;
  /** `name` when the document carries one, else the id (`regionListRows`'s rule). */
  label: string;
  /** The background in words, from `regionBgLabel`. The ruling says ALWAYS. */
  bgText: string;
  /** True for `regionBgLabel`'s dangling arm: the line is drawn in the warn tone. */
  bgMissing: boolean;
}

export interface RegionOverlayInput {
  /** The whole act, for `coverage`. Its holes are what gets painted red. */
  act: Rect;
  /** Every region's every rectangle. */
  pieces: readonly RegionPiece[];
  /** The regions, in DOCUMENT order: the index is the hue. */
  regions: readonly RegionOverlayRegion[];
  selectedId: string | null;
}

/** A canvas-px rectangle. */
interface CanvasRect { x: number; y: number; w: number; h: number }

const toCanvas = (r: Rect, vp: RegionViewport): CanvasRect => ({
  x: (r.x - vp.x) * vp.zoom,
  y: worldYToCanvasY(r.y, vp.y, vp.zoom),
  w: r.w * vp.zoom,
  h: r.h * vp.zoom,
});

const intersects = (a: CanvasRect, b: CanvasRect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Parallel lines of the given slope across `box`, clipped to it by the caller.
 *
 * The step ALONG X is the perpendicular spacing times root two, so the spacing a
 * reader sees is `REGION_HATCH_PX` whichever way the lines lean. The box is the
 * region's canvas rectangle already intersected with the canvas, so the count is
 * bounded by the canvas and not by the act.
 */
function hatch(ctx: CanvasRenderingContext2D, box: CanvasRect, slope: 1 | -1, step: number): void {
  const stride = step * Math.SQRT2;
  ctx.beginPath();
  for (let k = box.x - box.h; k < box.x + box.w + box.h; k += stride) {
    const top = slope === 1 ? k : k + box.h;
    ctx.moveTo(top, box.y);
    ctx.lineTo(slope === 1 ? k + box.h : k, box.y + box.h);
  }
  ctx.stroke();
}

/** A label plate with one or two lines, pinned inside the canvas. */
function plate(
  ctx: CanvasRenderingContext2D, at: { x: number; y: number },
  lines: { text: string; color: string }[], bg: string,
): void {
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const w = Math.max(...lines.map((l) => ctx.measureText(l.text).width));
  const h = lines.length * 13;
  const boxX = Math.max(2, at.x + 2);
  const boxY = Math.max(2, at.y + 2);
  ctx.fillStyle = bg;
  ctx.fillRect(boxX, boxY, w + 8, h);
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillStyle = lines[i].color;
    ctx.fillText(lines[i].text, boxX + 4, boxY + 7 + i * 13);
  }
}

/**
 * Draw the whole overlay over the already-composed map, and PUBLISH what it
 * drew. Returns the report it published.
 *
 * Order is deliberate: UNASSIGNED first, so a hole under nothing is the ground
 * everything else sits on; then each region's hatch and outline in document
 * order; then the labels, so no region's hatch can land on another's words.
 */
export function drawRegionOverlay(
  ctx: CanvasRenderingContext2D, dpr: number, vp: RegionViewport, input: RegionOverlayInput,
): RegionOverlayReport {
  const canvasBox: CanvasRect = { x: 0, y: 0, w: vp.width, h: vp.height };
  const cover = coverage(input.act, input.pieces);

  ctx.save();
  // The map canvas's own CSS transform, restated absolutely (file docblock).
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.setLineDash([]);

  // --- UNASSIGNED: the cross hatch, then one label on the largest hole -------
  const holes = cover.unassigned;
  if (holes.length > 0) {
    ctx.strokeStyle = REGION_UNASSIGNED_FILL;
    ctx.lineWidth = snapStroke(0, REGION_OUTLINE_PX, dpr).width;
    for (const hole of holes) {
      const c = toCanvas(hole, vp);
      if (!intersects(c, canvasBox)) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
      const box = clampToCanvas(c, canvasBox);
      hatch(ctx, box, 1, REGION_HATCH_PX);
      hatch(ctx, box, -1, REGION_HATCH_PX);
      ctx.restore();
      ctx.strokeRect(
        snapStroke(c.x, REGION_OUTLINE_PX, dpr).at, snapStroke(c.y, REGION_OUTLINE_PX, dpr).at,
        snapLength(c.w, dpr), snapLength(c.h, dpr),
      );
    }
  }

  // --- each region: hatch, then the union outline ---------------------------
  const drawn: RegionOverlayReport['regions'] = [];
  for (let i = 0; i < input.regions.length; i += 1) {
    const region = input.regions[i];
    const rects = input.pieces.filter((p) => p.id === region.id).map((p) => p.rect);
    const bounds = unionBounds(rects);
    if (bounds === null) continue;
    const selected = region.id === input.selectedId;
    const hue = regionHue(i);
    const box = toCanvas(bounds, vp);
    const visible = intersects(box, canvasBox);
    drawn.push({
      id: region.id, visible, bounds, rects: rects.length, hue, selected,
    });
    if (!visible) continue;

    ctx.save();
    ctx.beginPath();
    for (const r of rects) {
      const c = toCanvas(r, vp);
      ctx.rect(c.x, c.y, c.w, c.h);
    }
    ctx.clip();
    ctx.strokeStyle = hue;
    ctx.globalAlpha = REGION_HATCH_ALPHA;
    ctx.lineWidth = snapStroke(0, REGION_OUTLINE_PX, dpr).width;
    hatch(ctx, clampToCanvas(box, canvasBox), regionHatchSlope(i), REGION_HATCH_PX);
    ctx.restore();

    const lw = selected ? REGION_OUTLINE_SELECTED_PX : REGION_OUTLINE_PX;
    ctx.strokeStyle = hue;
    ctx.lineWidth = snapStroke(0, lw, dpr).width;
    ctx.beginPath();
    for (const s of regionOutlineSegments(rects)) {
      const a = toCanvas({ x: s.x1, y: s.y1, w: 0, h: 0 }, vp);
      const b = toCanvas({ x: s.x2, y: s.y2, w: 0, h: 0 }, vp);
      const vertical = s.x1 === s.x2;
      const at = snapStroke(vertical ? a.x : a.y, lw, dpr).at;
      ctx.moveTo(vertical ? at : a.x, vertical ? a.y : at);
      ctx.lineTo(vertical ? at : b.x, vertical ? b.y : at);
    }
    ctx.stroke();
  }

  // --- the labels, last, so no hatch lands on any words ---------------------
  for (let i = 0; i < input.regions.length; i += 1) {
    const region = input.regions[i];
    const entry = drawn.find((d) => d.id === region.id);
    if (entry === undefined || !entry.visible) continue;
    const box = toCanvas(entry.bounds, vp);
    plate(ctx, box, [
      { text: region.label, color: REGION_LABEL_TEXT },
      { text: region.bgText, color: region.bgMissing ? REGION_LABEL_WARN : REGION_LABEL_TEXT },
    ], REGION_LABEL_BG);
  }

  if (holes.length > 0) {
    const biggest = [...holes].sort((a, b) => rectArea(b) - rectArea(a))[0];
    const c = toCanvas(biggest, vp);
    if (intersects(c, canvasBox)) {
      plate(ctx, c, [{ text: UNASSIGNED_LABEL, color: REGION_UNASSIGNED_LABEL_TEXT }],
        REGION_UNASSIGNED_LABEL_BG);
    }
  }

  ctx.restore();

  return publishRegionOverlayReport({
    regions: drawn,
    selectedId: input.selectedId,
    unassignedRects: holes.length,
    unassignedArea: cover.unassignedArea,
  });
}

/** A canvas rectangle cut down to the canvas, so a hatch is bounded by the
 *  screen rather than by the act. */
function clampToCanvas(r: CanvasRect, canvas: CanvasRect): CanvasRect {
  const x = Math.max(r.x, canvas.x);
  const y = Math.max(r.y, canvas.y);
  return {
    x,
    y,
    w: Math.min(r.x + r.w, canvas.x + canvas.w) - x,
    h: Math.min(r.y + r.h, canvas.y + canvas.h) - y,
  };
}

/**
 * The one word for an area no region holds.
 *
 * A CONSTANT because the overlay, a test and 8B's harness must take the sentence
 * from here rather than retyping it; a retyped expectation goes green against a
 * map saying different words (`ACT_ROW_NOTE`'s reason, one layer down).
 *
 * ⚠ IT NAMES THE STATE AND NOT THE BUILD'S ANSWER TO IT. The first spelling
 * ended "and the build refuses it", and the engine-claim register refused it
 * (`test/formats/engine-claim-register.test.ts`): a module-level string constant
 * is STANDING copy, true of every document or not typed at all, and nothing in
 * this module has read a generator. The consequence belongs to the panel's
 * status line, which composes it from rules it has actually run
 * (`regionStatusRows`, spec §3.4). The gate
 * was right and the shorter label is the better one anyway: a map label names
 * the thing under it.
 */
export const UNASSIGNED_LABEL = 'unassigned: no region owns this';

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// reason screen-frame.ts's report gives: a harness reading this can tell "drawn
// at" from "would be drawn at if anything were drawing".
// ---------------------------------------------------------------------------

export interface RegionOverlayReport {
  /** Every region with area, in document order. */
  regions: Array<{
    id: string;
    /** False when the region's union is entirely off-canvas: nothing was drawn. */
    visible: boolean;
    /** The union's bounding box, in WORLD px. */
    bounds: Rect;
    /** How many rectangles the region holds. More than one means it was carved. */
    rects: number;
    hue: string;
    selected: boolean;
  }>;
  selectedId: string | null;
  /** How many rectangles of the act belong to nobody. Zero is a finished act. */
  unassignedRects: number;
  unassignedArea: number;
  /** The visual calls, so a harness asserts what the code chose, not a memory of it. */
  visual: {
    hatchPx: number;
    hatchAlpha: number;
    outlinePx: number;
    selectedOutlinePx: number;
    grabPx: number;
    hues: readonly string[];
  };
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

const VISUAL: RegionOverlayReport['visual'] = {
  hatchPx: REGION_HATCH_PX,
  hatchAlpha: REGION_HATCH_ALPHA,
  outlinePx: REGION_OUTLINE_PX,
  selectedOutlinePx: REGION_OUTLINE_SELECTED_PX,
  grabPx: REGION_GRAB_PX,
  hues: REGION_HUES,
};

let lastReport: RegionOverlayReport = {
  regions: [], selectedId: null, unassignedRects: 0, unassignedArea: 0, visual: VISUAL, paints: 0,
};

export function publishRegionOverlayReport(
  r: Omit<RegionOverlayReport, 'paints' | 'visual'>,
): RegionOverlayReport {
  lastReport = { ...r, visual: VISUAL, paints: lastReport.paints + 1 };
  return lastReport;
}

export function lastRegionOverlayReport(): RegionOverlayReport {
  return lastReport;
}
