// WHAT THE COLLISION ANGLE OVERLAY ACTUALLY DREW, published for a harness.
//
// A PUBLISH, NOT A RE-DERIVATION — the same distinction, and for the same
// reason, as `effects-guides.ts`'s `GuideReport` (read its docblock; this is
// modelled on it). A CDP harness cannot read a mark off a canvas except by
// sampling pixels, and it has to know WHERE to sample. Recomputing the geometry
// in the harness from the collision plane and the view store would prove only
// that two copies of the same arithmetic agree — which stays true when the draw
// pass never ran at all, and stays true if the draw pass draws it somewhere
// else entirely.
//
// So `OverlayRenderer` writes THIS at the end of its collision pass, out of the
// very values it hands to `drawAngleMark`, and the harness samples the canvas
// at the coordinates named here. That makes three different failures separable:
//   • nothing published        -> the overlay never ran
//   • published, no pixels     -> it ran and drew nothing visible
//   • published, pixels at the
//     MIRRORED barb position   -> it drew the OLD symmetric/mirrored mark
//
// `suppressed: true` is a real answer, not an absence: it is what the overlay
// reports when the angles toggle is ON but the zoom is below
// MIN_CELL_PX_FOR_MARK, which is what makes "the density gate fires" a row that
// can fail rather than a silence indistinguishable from a broken overlay.

/** One drawn mark, in WORLD pixels (the space the harness converts from). */
export interface CollisionMarkRow {
  /** The anchor: bar midpoint and barb root, on the collidable surface. */
  ax: number;
  ay: number;
  /** The tangent bar's two endpoints. */
  bar1x: number;
  bar1y: number;
  bar2x: number;
  bar2y: number;
  /** The barb's tip — the end that is NOT on the surface. */
  tipx: number;
  tipy: number;
  /** The profile's angle byte, so a row can tie a mark back to the data. */
  angle: number;
}

export interface CollisionMarkReport {
  /** Whether the last repaint had the angles overlay on at all. */
  active: boolean;
  /** On, but below the zoom gate — no marks were drawn, by design. */
  suppressed: boolean;
  zoom: number;
  /** Screen px per 16px collision cell — the quantity the gate is stated in. */
  cellScreenPx: number;
  /** Total marks drawn this pass (may exceed `rows.length`; see ROW_CAP). */
  drawn: number;
  rows: CollisionMarkRow[];
  /** Advanced on every publish, so a harness can prove a repaint HAPPENED. */
  paints: number;
}

/**
 * Rows are capped so the report cannot grow with the viewport. At the lowest
 * zoom that draws marks at all a full-screen act still yields thousands of
 * cells, and neither a harness nor this module has any use for them — a probe
 * samples a handful. `drawn` keeps the true count, so a row asserting "the
 * overlay drew marks" is never reading a truncated number as the total.
 */
export const ROW_CAP = 400;

const EMPTY: CollisionMarkReport = {
  active: false, suppressed: false, zoom: 1, cellScreenPx: 16, drawn: 0, rows: [], paints: 0,
};

let lastReport: CollisionMarkReport = EMPTY;

export function publishCollisionMarkReport(r: Omit<CollisionMarkReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastCollisionMarkReport(): CollisionMarkReport {
  return lastReport;
}
