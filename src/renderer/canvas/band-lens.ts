// THE BAND LENS OVERLAY — ROADMAP item 43 part 2.
//
// Tints every background cell whose layout word names a slot in the marked
// range, so an author can see a band's FOOTPRINT before promoting it. The
// footprint is the thing nothing else on this surface can show: promotion
// animates whichever static tiles the range names WHEREVER THE PICTURE USES
// THEM, and the blob is de-duplicated, so a four-slot range can own a thousand
// cells (aeon's live 8x4 band's slot 3 paints 964 cells of sky).
//
// ⚠ THIS IS NEUTRAL INFORMATION, NOT A WARNING. Scatter is legal and sometimes
// intended. The tint is magenta because it must be unmistakably an OVERLAY over
// OJZ's grey-on-black art — and it was checked with the owner, who read it as
// "'something/information', nothing scary". `canvas-colors.ts`'s band-lens
// block records the alternative that was built, measured and rejected. Nothing
// here changes colour, thickens, or adds a marker as a count grows: every
// covered cell is drawn identically whether the range paints one of them or a
// thousand.
//
// ⚠ CLOCKLESS. This runs inside the draw pass that already repaints on a pan, a
// zoom, a store change and an undo — the same pass the guides come out of. It
// schedules nothing. Item 42's ruling is that only TIMER bands need a clock, and
// MapViewport's measured zero-idle-repaint property is not this parcel's to
// spend.
//
// ═══ THE PLANE SITS AT WORLD ORIGIN, AND THAT BOUNDS THE WASH ═══
//
// `SectionRenderer.renderBg` and `BgAnimPreviewRenderer.draw` both draw the BG
// plane at world (0,0) under `scale(zoom); translate(-vpX,-vpY)`, so cell
// (col,row) covers world `(col*8, row*8, 8, 8)`. That is where the tint goes,
// and where a click resolves a cell FROM — one arithmetic, written once here and
// called by both directions, for the reason `worldYToCanvasY` is written once
// next door: two copies of a transform drift, and the symptom is a lens that
// lights the cell beside the one it means.
//
// SO THE WASH NEVER LEAVES THE PLANE'S 64x64 WORLD RECTANGLE (0..512 x 0..512
// px), which is a small corner of an act whose sections are 2048px each. That
// is asserted, not assumed: the harness samples a point past the plane's bottom
// edge and requires it to be byte-identical with the lens on and off.
//
// ⚠ WITHIN THAT RECTANGLE IT DOES DRAW OVER THE FOREGROUND, and that is
// deliberate: the lens draws LAST, with the parallax guides, for the reason
// those do — it is authoring chrome about the background, and an author in the
// effects facet is free to be on either layer, so a wash that vanished under
// foreground art would read as a bug in the wash. It is a BACKGROUND fact drawn
// on top, not a claim about the foreground tiles it happens to overlap.

import type { CoverageCell } from '../providers/band-coverage';
import {
  BAND_LENS_FILL, BAND_LENS_EDGE, BAND_LENS_LABEL_BG, BAND_LENS_LABEL_TEXT,
} from './canvas-colors';

/** Pixels per background cell — one 8x8 tile, the unit the plane is drawn in. */
export const BAND_LENS_CELL_PX = 8;

/** The map viewport, in the shape the draw pass already has one. */
export interface LensViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/**
 * The background cell under a world point, or null when the point is off the
 * plane.
 *
 * THE ONLY PLACE THE PICTURE-TO-CELL DIRECTION IS WRITTEN, and the exact inverse
 * of the rectangle `drawBandLens` fills. `Math.floor` on a negative world
 * coordinate would give a negative column that `>= 0` catches — which is why the
 * bounds test is on the RESULT rather than on the input.
 */
export function cellAtWorld(
  worldX: number, worldY: number, planeCols: number, planeRows: number,
): { col: number; row: number; cell: number } | null {
  const col = Math.floor(worldX / BAND_LENS_CELL_PX);
  const row = Math.floor(worldY / BAND_LENS_CELL_PX);
  if (col < 0 || row < 0 || col >= planeCols || row >= planeRows) return null;
  return { col, row, cell: row * planeCols + col };
}

/**
 * Draw the tint over the already-painted Plane B.
 *
 * ONE PATH, `ctx.rect` PER CELL INTO A SINGLE `fill`. A covered set can be a
 * thousand cells and a per-cell `fillRect` at that size is a thousand state
 * changes; one path is one. Cells outside the viewport are skipped before they
 * reach the path at all, so the cost is bounded by what is on screen rather than
 * by the footprint's size — which matters precisely because the footprints this
 * lens exists to reveal are the large ones.
 */
export function drawBandLens(
  ctx: CanvasRenderingContext2D, vp: LensViewport, cells: readonly CoverageCell[],
): number {
  if (cells.length === 0) return 0;
  const size = BAND_LENS_CELL_PX;
  // The world box the canvas shows, in cells, so the loop can reject early.
  const minCol = Math.floor(vp.x / size) - 1;
  const minRow = Math.floor(vp.y / size) - 1;
  const maxCol = Math.ceil((vp.x + vp.width / vp.zoom) / size) + 1;
  const maxRow = Math.ceil((vp.y + vp.height / vp.zoom) / size) + 1;

  ctx.save();
  ctx.scale(vp.zoom, vp.zoom);
  ctx.translate(-vp.x, -vp.y);
  ctx.beginPath();
  let drawn = 0;
  for (const c of cells) {
    if (c.col < minCol || c.col > maxCol || c.row < minRow || c.row > maxRow) continue;
    ctx.rect(c.col * size, c.row * size, size, size);
    drawn++;
  }
  ctx.fillStyle = BAND_LENS_FILL;
  ctx.fill();
  // The edge is what makes ONE cell legible at low zoom, where an 8px tint over
  // busy art is a smudge. `lineWidth` is in world units under this transform, so
  // it is divided back out to stay a hairline on screen at every zoom.
  ctx.lineWidth = 1 / vp.zoom;
  ctx.strokeStyle = BAND_LENS_EDGE;
  ctx.stroke();
  ctx.restore();
  return drawn;
}

/**
 * The lens's own caption.
 *
 * IT IS ON THE CANVAS BECAUSE THE PANEL MAY BE SHUT. Both band sections arrive
 * `defaultCollapsed` (ROADMAP item 45's short-screen close), so an author who
 * clicks a cell on arrival has seeded a candidate whose numbers live inside a
 * collapsed box. A lens that lit cells and said nothing about WHICH RANGE it was
 * lighting would be a wash with no referent.
 *
 * ═══ TWO THINGS MAKE IT SELF-EXPLAINING, AND BOTH ARE THE SAME DEFECT ═══
 *
 * The first revision put this plate in the CANVAS'S TOP-RIGHT CORNER and printed
 * `band 0 · slots 0..32` over a cell count. The first person to see it read the
 * wash as information and could not tell WHAT information — the words were
 * diagonally across the canvas from the thing they described, and nothing in
 * them named a colour. So:
 *
 *  • A SWATCH, filled with the lens's own `BAND_LENS_FILL` and stroked with its
 *    edge, leads the first line. One `fillRect` and one `strokeRect`, and it is
 *    the only unambiguous way to say "the words are about THAT".
 *  • THE PLATE FOLLOWS THE COVERAGE. `anchor` is the covered cells' on-screen
 *    bounding box; the plate sits just above its top-left, CLAMPED into the
 *    canvas so it is never half off-screen, and falls back to the top-left
 *    corner when the coverage is off-screen or absent. A caption beside its
 *    subject needs no inference.
 *
 * COSTS NOTHING WHEN THERE IS NO LENS. Everything here is inside the draw pass's
 * `if (lens)`, which needs the effects facet AND a mark — item 42's rule that
 * per-band chrome must not be a tax on every repaint for every author.
 */
export function drawBandLensLabel(
  ctx: CanvasRenderingContext2D, vp: LensViewport, lines: readonly string[],
  anchor?: { x: number; y: number } | null,
): void {
  if (lines.length === 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const SWATCH = 9;
  const PAD = 6;
  const indent = SWATCH + 5;
  let w = 0;
  for (let i = 0; i < lines.length; i++) {
    w = Math.max(w, ctx.measureText(lines[i]).width + (i === 0 ? indent : 0));
  }
  const boxW = w + PAD * 2;
  const boxH = lines.length * 14 + PAD;
  // Above the coverage when there is room, below it otherwise; clamped so the
  // plate is always wholly on the canvas.
  const wantX = anchor ? anchor.x - PAD : vp.width - boxW - 6;
  const wantY = anchor ? anchor.y - boxH - 4 : 6;
  const x = Math.max(4, Math.min(wantX, vp.width - boxW - 4));
  const y = Math.max(4, Math.min(wantY < 4 && anchor ? anchor.y + 12 : wantY, vp.height - boxH - 4));

  ctx.fillStyle = BAND_LENS_LABEL_BG;
  ctx.fillRect(x, y, boxW, boxH);
  // THE SWATCH — the lens's own fill and edge, so the plate carries the colour
  // it is talking about rather than describing it.
  const sy = y + PAD / 2 + 5 - SWATCH / 2;
  ctx.fillStyle = BAND_LENS_FILL;
  ctx.fillRect(x + PAD, sy, SWATCH, SWATCH);
  ctx.strokeStyle = BAND_LENS_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + PAD + 0.5, sy + 0.5, SWATCH - 1, SWATCH - 1);

  ctx.fillStyle = BAND_LENS_LABEL_TEXT;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + PAD + (i === 0 ? indent : 0), y + PAD / 2 + 5 + i * 14);
  }
  ctx.restore();
}

/**
 * Where the caption should sit: the top-left of the coverage's on-screen box.
 *
 * Returns null when nothing is covered or the whole footprint is off-screen, in
 * which case the plate falls back to the canvas corner — a label pinned to
 * something the author cannot see would be worse than one in a known place.
 */
export function bandLensAnchor(
  vp: LensViewport, bounds: { minCol: number; minRow: number } | null,
): { x: number; y: number } | null {
  if (!bounds) return null;
  const x = (bounds.minCol * BAND_LENS_CELL_PX - vp.x) * vp.zoom;
  const y = (bounds.minRow * BAND_LENS_CELL_PX - vp.y) * vp.zoom;
  if (x > vp.width || y > vp.height || x < -vp.width || y < -vp.height) return null;
  return { x, y };
}

// ---------------------------------------------------------------------------
// What the last repaint actually drew
// ---------------------------------------------------------------------------

/**
 * The lens as of the last completed map repaint.
 *
 * A PUBLISH, NOT A RE-DERIVATION — the distinction `publishGuideReport` next
 * door states at length. A CDP harness cannot read a tint off a canvas except by
 * sampling pixels, and a probe that recomputed the covered set from the stores
 * would prove only that two copies of one scan agree, which stays true when the
 * draw pass never ran. `active: false` is a real answer, which is what lets
 * "nothing marked draws nothing" be a row that can fail.
 */
export interface BandLensReport {
  active: boolean;
  kind: 'band' | 'candidate' | null;
  bandIndex: number | null;
  range: { base: number; count: number } | null;
  /** Cells the range covers on the whole plane. */
  cells: number;
  /** Cells actually stroked this repaint — the on-screen subset. */
  drawn: number;
  largestSlotCells: number | null;
  reason: string | null;
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

let lastReport: BandLensReport = {
  active: false, kind: null, bandIndex: null, range: null,
  cells: 0, drawn: 0, largestSlotCells: null, reason: null, paints: 0,
};

export function publishBandLensReport(r: Omit<BandLensReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastBandLensReport(): BandLensReport {
  return lastReport;
}

/**
 * The last click-to-seed MARK the map resolved, whatever it resolved to.
 *
 * SEPARATE FROM THE DRAW REPORT because the two answer different questions, and
 * the interesting cases are the ones that change nothing: a click on a blank
 * cell, on a slot past the end of the blob, or on a cell whose document moved
 * under the press. Each of those leaves the tint exactly as it was, so the draw
 * report cannot tell them from a click that never happened — and "the gesture
 * ran and correctly declined" is precisely what a row needs to assert.
 */
export interface BandMarkReport {
  /** What the click resolved to, or 'dropped' when a witness check refused it. */
  kind: 'band' | 'candidate' | 'blank' | 'out-of-blob' | 'dropped' | null;
  cell: number | null;
  slot: number | null;
  /** Band index or seeded static base, per `kind`. */
  value: number | null;
  /** Advanced on every mark, so a harness can prove the gesture RAN. */
  marks: number;
}

let lastMark: BandMarkReport = { kind: null, cell: null, slot: null, value: null, marks: 0 };

export function publishBandMark(r: Omit<BandMarkReport, 'marks'>): void {
  lastMark = { ...r, marks: lastMark.marks + 1 };
}

export function lastBandMarkReport(): BandMarkReport {
  return lastMark;
}
