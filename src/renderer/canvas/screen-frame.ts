// THE SCREEN FRAME — a game-screen-sized rectangle on the map canvas.
//
// Triage 2026-08-26 §A point 1 / §B row G. The owner: "we should definitely
// have a view to show the size of the view on camera on screen — I have no idea
// what you can see from this." Nothing on the map canvas said how much of it a
// player sees at once; the parallax guides (item 43) are lines, and a line is
// nothing to compare against.
//
// ═══ PINNED, NOT CURSOR-FOLLOWING ═══
//
// The frame sits at a WORLD point (`ScreenFrameAnchor`, in the view store) and
// stays there across pans and zooms. The author moves it by dragging its EDGE.
// A frame that chased the cursor could never be laid against a layer guide or a
// band and left there while the author looks at the panel — the ruling in the
// triage says exactly this.
//
// ═══ EDGE-ONLY HIT TEST ═══
//
// Only the frame's four edges grab, within a screen-px fingertip
// (`SCREEN_FRAME_GRAB_PX`, the guides' `GUIDE_GRAB_PX` reasoning). The INTERIOR
// is not the frame's: a click inside it belongs to whatever tool is active,
// otherwise turning the frame on would kill painting, selecting and panning
// across 320x224 world px of the map. And nothing here is consulted at all
// while the frame is hidden — `MapViewport` gates on `overlays.showScreenFrame`
// before calling `screenFrameEdgeAt`.
//
// ═══ SIZE DERIVED, NEVER TYPED ═══
//
// `SCREEN_WIDTH`/`SCREEN_HEIGHT` come from core/model/screen.ts, which mirrors
// aeon's `engine/system/constants.emp` and is tested against it. No 320 or 224
// appears in this file.
//
// ═══ NO CLOCK ═══
//
// `drawScreenFrame` runs inside MapViewport's existing draw pass, which repaints
// on a pan, a zoom, a store change and an undo. It schedules nothing, so the
// measured zero-idle-repaint property (37/37) is untouched with the frame on.
// A drag in flight previews through a ref + `redraw()`, exactly as a guide drag
// does, and writes the store ONCE on release.
//
// Y goes through the guides' `worldYToCanvasY` — the one transform — so the
// frame's top cannot land a pixel off a guide drawn at the same world Y.

import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../../core/model/screen';
import { worldYToCanvasY } from './effects-guides';
import {
  SCREEN_FRAME_LINE, SCREEN_FRAME_ACTIVE, SCREEN_FRAME_LABEL_BG, SCREEN_FRAME_LABEL_TEXT,
} from './canvas-colors';

/** The frame's top-left corner, in WORLD pixels (act axis; the camera's unbiased edge). */
export interface ScreenFrameAnchor { x: number; y: number }

/** The map viewport, in the shape the draw pass already has one. */
export interface FrameViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/** A canvas-px rectangle. */
export interface FrameRect { x: number; y: number; w: number; h: number }

/** How close, in SCREEN px, the cursor has to be to an edge to grab it. */
export const SCREEN_FRAME_GRAB_PX = 6;

/** The camera cannot see left of, or above, the act's origin (camera.emp's clamp floor). */
export function clampScreenFrameAnchor(a: ScreenFrameAnchor): ScreenFrameAnchor {
  return { x: Math.max(0, Math.round(a.x)), y: Math.max(0, Math.round(a.y)) };
}

/** Where the frame lands on the canvas for this viewport. */
export function screenFrameRect(anchor: ScreenFrameAnchor, vp: FrameViewport): FrameRect {
  return {
    x: (anchor.x - vp.x) * vp.zoom,
    y: worldYToCanvasY(anchor.y, vp.y, vp.zoom),
    w: SCREEN_WIDTH * vp.zoom,
    h: SCREEN_HEIGHT * vp.zoom,
  };
}

/**
 * Is this canvas point on one of the frame's four edges? The interior is NOT a
 * hit (see the file docblock).
 */
export function screenFrameEdgeAt(
  canvasX: number, canvasY: number, anchor: ScreenFrameAnchor, vp: FrameViewport,
): boolean {
  const r = screenFrameRect(anchor, vp);
  const g = SCREEN_FRAME_GRAB_PX;
  const withinX = canvasX >= r.x - g && canvasX <= r.x + r.w + g;
  const withinY = canvasY >= r.y - g && canvasY <= r.y + r.h + g;
  if (!withinX || !withinY) return false;
  const onVertical = Math.abs(canvasX - r.x) <= g || Math.abs(canvasX - (r.x + r.w)) <= g;
  const onHorizontal = Math.abs(canvasY - r.y) <= g || Math.abs(canvasY - (r.y + r.h)) <= g;
  return onVertical || onHorizontal;
}

/**
 * The anchor after a drag: the press's anchor moved by the WORLD delta between
 * the press point and the cursor, rounded to whole pixels and clamped.
 */
export function dragScreenFrame(
  startAnchor: ScreenFrameAnchor,
  pressWorld: { x: number; y: number },
  cursorWorld: { x: number; y: number },
): ScreenFrameAnchor {
  return clampScreenFrameAnchor({
    x: startAnchor.x + (cursorWorld.x - pressWorld.x),
    y: startAnchor.y + (cursorWorld.y - pressWorld.y),
  });
}

export interface ScreenFrameDrawOptions {
  /** Being dragged or hovered on an edge: drawn brighter. */
  active?: boolean;
}

/**
 * Draw the frame over the already-composed map. NO CLOCK, NO STATE (file
 * docblock). Returns the rect it drew, for the report.
 */
export function drawScreenFrame(
  ctx: CanvasRenderingContext2D, vp: FrameViewport, anchor: ScreenFrameAnchor,
  opts: ScreenFrameDrawOptions = {},
): FrameRect {
  const r = screenFrameRect(anchor, vp);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Half-pixel offsets so the 1px stroke sits on one device row, not two.
  const x = Math.round(r.x) + 0.5;
  const y = Math.round(r.y) + 0.5;
  const w = Math.round(r.w);
  const h = Math.round(r.h);
  ctx.lineWidth = opts.active ? 2 : 1;
  ctx.strokeStyle = opts.active ? SCREEN_FRAME_ACTIVE : SCREEN_FRAME_LINE;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, w, h);

  // The corner label says WHAT this rectangle is and WHERE the camera would
  // be, because a bare rectangle on a map of rectangles answers neither.
  const text = `screen ${SCREEN_WIDTH}x${SCREEN_HEIGHT} @ ${anchor.x},${anchor.y}`;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  // Inside the top-left corner; if the top edge is off-canvas, pin the label
  // to the canvas's top so it stays readable while the frame is half-scrolled.
  const boxX = Math.max(2, x + 2);
  const boxY = Math.max(2, y + 2);
  ctx.fillStyle = SCREEN_FRAME_LABEL_BG;
  ctx.fillRect(boxX, boxY, tw + 8, 13);
  ctx.fillStyle = opts.active ? SCREEN_FRAME_ACTIVE : SCREEN_FRAME_LABEL_TEXT;
  ctx.fillText(text, boxX + 4, boxY + 7);
  ctx.restore();
  return r;
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew — a PUBLISH, not a re-derivation, for the
// same reason effects-guides.ts's report exists: a harness reading this can tell
// "drawn at" from "would be drawn at if anything were drawing".
// ---------------------------------------------------------------------------

export interface ScreenFrameReport {
  active: boolean;
  anchor: ScreenFrameAnchor | null;
  rect: FrameRect | null;
  dragging: boolean;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

let lastReport: ScreenFrameReport = {
  active: false, anchor: null, rect: null, dragging: false, paints: 0,
};

export function publishScreenFrameReport(r: Omit<ScreenFrameReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastScreenFrameReport(): ScreenFrameReport {
  return lastReport;
}
