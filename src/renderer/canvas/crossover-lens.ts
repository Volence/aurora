// THE CROSSOVER LENS — "standing here hands you to the other collision path".
//
// ═══ WHY THIS IS THE LENS THAT MOST HAS TO EXIST ═══
//
// The priority bit at least announces itself in play: the owner found it by
// walking behind a bush. Solid-on-both can be inferred by flipping the two
// collision overlays. A crossover has NO other depiction anywhere — it is two
// bits of a word, it changes no shape, no colour, no solidity and no overlay,
// and its only observable consequence is which of two collision planes the
// player is on some seconds later. An editor that let someone paint it without
// this would be strictly worse than the priority bit before its lens, which is
// the state `brush-word.ts` calls the defect it exists to prevent.
//
// So `setCollisionCrossoverBrush` arms this the moment the brush stops being
// `keep`, by the same rule-wired condition (`crossoverBrushAuthors`) the
// priority loop uses.
//
// ═══ TWO MARKS, AND THE SECOND ONE IS THE POINT ═══
//
// A crossover marked on ONE plane and not the other is legal — that is what an
// entry or exit anchor looks like — but it is also the single most likely
// mistake this feature has. A two-way loop needs the pair {hand-off on A,
// hand-off on B} (anchor §3.3); painted on one plane only it works perfectly
// running one direction and drops the player off the geometry running the
// other. On the map those two cases are IDENTICAL: each plane's overlay is
// drawn separately, so the plane you are not looking at is simply absent.
//
// This lens is therefore the only place the pairing is visible, and it draws
// them in different colours rather than merging them into "has a crossover".
// A lens that could not tell a finished loop from a half-painted one would be
// answering the easy question.
//
// ═══ WHICH PLANE IT SHOWS ═══
//
// The AIMED plane's marks (the one the collision palette is set to), because
// that is the word a stroke writes and the author's frame of reference. The
// one-way colour is what carries the other plane's information, so the lens is
// never silently about only half the data.
//
// ═══ ⚠ IT DRAWS 8px SUB-TILES, NOT 16px CELLS, AND THAT IS NOT A DETAIL ═══
//
// Every other collision depiction in Aurora is per 16px cell, because that is
// the unit an author paints. The crossover is the one field whose CONSUMER
// reads the saved plane more finely than that: aeon's trigger fires once per
// 8px column (`COLL_CELL_W` = 8) and its bake indexes Aurora's sub-tile column
// directly. So a mark can legally exist on ONE HALF of a cell — that is exactly
// what the "Half (8px)" mark width authors, and it is the only width at which a
// two-way pair does anything at all
// (core/collision/layer-transition.ts's CrossoverSpan block).
//
// A lens that sampled the cell's top-left sub-tile — which this one did — would
// draw a left-half mark as a full cell and a RIGHT-half mark AS NOTHING AT ALL.
// That is the "two bits nothing depicts" state this lens exists to end, so it
// reads each sub-tile's own word and the picture is the data.
//
// ═══ COST ═══
//
// Windowed to the viewport exactly like the priority and both-planes lenses.
// The sub-tile grid is 4x the cell grid, so a viewport-sized pass costs ~4x
// what the cell-grid version did — a few tens of thousands of probes against
// ~15.7ms of measured frame headroom (docs: MapViewport has no clock, ~+0.050ms
// per extra full-viewport pass). Two passes here rather than one, because the
// two marks are different colours and `drawTileLens` merges runs per colour.
//
// NO CLOCK, NO CACHE — inside the pass that already repaints on a pan, a zoom,
// a store change, a paint edit and an undo.

import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import { readCrossover } from '../../core/collision/layer-transition';
import { CELL_SUBTILE_COLS } from '../../core/collision/collision-cell';
import {
  CROSSOVER_FILL, CROSSOVER_EDGE, CROSSOVER_ONE_WAY_FILL, CROSSOVER_ONE_WAY_EDGE,
} from './canvas-colors';
import { drawTileLens, type TileLensDrawn } from './tile-lens';
import { BOTH_PLANES_CELL_PX } from './both-planes-lens';
import type { LensViewport } from './priority-lens';

/** The 8px sub-tile edge, DERIVED from the cell size and the cell's sub-tile
 *  count so the lens's unit and the paint's unit cannot drift apart. */
export const CROSSOVER_SUBTILE_PX = BOTH_PLANES_CELL_PX / CELL_SUBTILE_COLS;

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** What one section's crossover pass drew, split by mark. */
export interface CrossoverDrawn {
  /** Cells marked on BOTH planes — a complete two-way crossover. */
  paired: TileLensDrawn;
  /** Cells marked on the aimed plane only — legal, but a half-painted loop
   *  looks exactly like this. */
  oneWay: TileLensDrawn;
}

const NOTHING: CrossoverDrawn = {
  paired: { veils: 0, segments: 0 }, oneWay: { veils: 0, segments: 0 },
};

/**
 * Veil the crossover cells of ONE section inside the viewport, in two colours.
 *
 * `aimed` is the plane the palette is set to and whose marks are shown;
 * `other` is read ONLY to decide whether each mark is paired. A null `other`
 * means the second plane was never seeded, in which case every mark on the
 * aimed plane is genuinely unpaired and is drawn as such — the honest answer,
 * and the one that makes an unfinished loop loud.
 */
export function drawSectionCrossovers(
  ctx: Ctx,
  viewport: LensViewport,
  aimed: ArrayLike<number>,
  other: ArrayLike<number> | null,
  offsetX: number,
  offsetY: number,
): CrossoverDrawn {
  const { x: vpX, y: vpY, width, height, zoom } = viewport;
  const vpW = width / zoom, vpH = height / zoom;
  const localVpX = vpX - offsetX, localVpY = vpY - offsetY;
  const C = CROSSOVER_SUBTILE_PX;
  const window = {
    cols: SECTION_TILES_WIDE, rows: SECTION_TILES_HIGH,
    colStart: Math.floor(localVpX / C), colEnd: Math.ceil((localVpX + vpW) / C),
    rowStart: Math.floor(localVpY / C), rowEnd: Math.ceil((localVpY + vpH) / C),
    tilePx: C, originX: offsetX, originY: offsetY, invZoom: 1 / zoom,
  };
  if (window.colEnd <= window.colStart || window.rowEnd <= window.rowStart) return NOTHING;

  // EACH SUB-TILE'S OWN WORD. A cell-wide mark carries the same value in all
  // four and draws as one 16px square; a half-cell mark carries it in one
  // column and draws as the 8x16 strip it actually is.
  const at = (plane: ArrayLike<number> | null, tx: number, ty: number): number | undefined =>
    plane?.[ty * SECTION_TILES_WIDE + tx];
  // `reserved` (the illegal value 3) is deliberately NOT drawn as a crossover:
  // it is not one, it is a defect, and the audit reports it in words with a
  // cell index. Veiling it amber would present a build-breaking value as a
  // working feature.
  const marked = (w: number | undefined): boolean => {
    const c = readCrossover(w);
    return c === 'to-a' || c === 'to-b';
  };

  const paired = drawTileLens(ctx, {
    ...window,
    marked: (cx, cy) => marked(at(aimed, cx, cy)) && marked(at(other, cx, cy)),
    fill: CROSSOVER_FILL, edge: CROSSOVER_EDGE,
  });
  const oneWay = drawTileLens(ctx, {
    ...window,
    marked: (cx, cy) => marked(at(aimed, cx, cy)) && !marked(at(other, cx, cy)),
    fill: CROSSOVER_ONE_WAY_FILL, edge: CROSSOVER_ONE_WAY_EDGE,
  });
  return { paired, oneWay };
}

// ---------------------------------------------------------------------------
// The publish — same contract as the other two lenses: what the last repaint
// DREW, so a harness can tell "marked N" from "never ran".
// ---------------------------------------------------------------------------

export interface CrossoverLensReport {
  active: boolean;
  /** `off` — the View toggle. `bg-layer` — the overlay pass never ran. */
  reason: 'off' | 'bg-layer' | null;
  /** Which plane's marks were shown. */
  plane: 'a' | 'b';
  sections: number;
  /** Veil runs for complete (both-plane) crossovers. */
  pairedVeils: number;
  /** Veil runs for crossovers marked on the shown plane only. NON-ZERO IS THE
   *  INTERESTING NUMBER: it is a loop that will work in one direction. */
  oneWayVeils: number;
  segments: number;
  paints: number;
}

let lastReport: CrossoverLensReport = {
  active: false, reason: 'off', plane: 'a', sections: 0,
  pairedVeils: 0, oneWayVeils: 0, segments: 0, paints: 0,
};

export function publishCrossoverLensReport(r: Omit<CrossoverLensReport, 'paints'>): void {
  lastReport = { ...r, paints: lastReport.paints + 1 };
}

export function lastCrossoverLensReport(): CrossoverLensReport {
  return lastReport;
}
