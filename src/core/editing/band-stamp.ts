// POINTING A REGION OF LAYOUT CELLS AT A BAND (parcel J, triage 2026-08-26 §A.8).
//
// ═══ THE PICTURE ═══
//
// Trunks in front of an animated background are ONE plane: a Plane-B cell
// either names a slot inside a band's prefix range (it animates) or a static
// slot (it does not). "Trunks over animated foliage" means the foliage cells
// name the band's slots and the trunk cells do not — no plane bit, no
// priority. Until this module the only way to say that was `paint-tile` in the
// BG layer, one slot at a time, 32 picks per region.
//
// ═══ THE GEOMETRY, MEASURED ═══
//
// A band's slots are COLUMN-major in the picture: slot i of a `cols x rows`
// band paints at column i / rows, row i % rows. Not a convention chosen here —
// it is how aeon's driver DMAs a band (`bg_anim.emp` shifts `rows * TILE_BYTES`
// per column) and how `forest_bg_gen.py` lays its region out (`for col: for
// vrow:`), and it was measured on the built ROM 2026-08-26
// (docs/reviews/2026-08-26-band-animates-in-rom.md; the marquee resolution
// report is the same fact seen from the other side — a row-major blob is the
// transpose of a band). So the layout word for a cell at pattern position
// (pc, pr) is `slotBase + pc * rows + pr`, and a region wider or taller than
// one pattern repeats it with the band's own period.
//
// Pure: no store, no document, no DOM. The gesture in `MapViewport` supplies
// the rectangle and the existing words and writes the result through the ONE
// writer (`writeBgOverrideLayoutWord`) as a single `set-bg-override-layout`
// command, exactly as the per-tile stroke does.

import { LAYOUT_TILE_INDEX_MASK } from '../formats/bg-override/bg-override';
import type { BgOverrideBand } from '../formats/bg-override/bg-override';

/** A rectangle of layout cells, in plane cell coordinates. */
export interface StampRegion {
  col: number;
  row: number;
  width: number;
  height: number;
}

export interface BandStampOptions {
  /**
   * The cell that sits on pattern position (0,0). Defaults to the region's
   * top-left. A drag that grows up-left of its press cell keeps the press cell
   * as the phase origin, so the pattern does not slide under the author while
   * the rectangle changes shape.
   */
  anchor?: { col: number; row: number };
  /**
   * The words already in the region, row-major over the region. Every bit
   * outside the tile index (palette, priority, flips) is kept from these and
   * only the index is replaced — pointing cells at a band is not a recolour.
   * Absent (or short) means bare indices.
   */
  existing?: readonly number[];
}

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * The layout words a region takes when it is pointed at `band`, row-major over
 * the region.
 *
 * Throws for a band with no slots: `cols * rows === 0` has no pattern to tile,
 * and a modulus by zero would return NaN indices that the writer would happily
 * store.
 */
export function bandStampWords(
  band: Pick<BgOverrideBand, 'cols' | 'rows'>,
  slotBase: number,
  region: StampRegion,
  options: BandStampOptions = {},
): number[] {
  const { cols, rows } = band;
  if (!(cols > 0) || !(rows > 0)) {
    throw new Error(`bandStampWords: band has no slots (${cols}x${rows})`);
  }
  const anchorCol = options.anchor?.col ?? region.col;
  const anchorRow = options.anchor?.row ?? region.row;
  const existing = options.existing;
  const attrMask = ~LAYOUT_TILE_INDEX_MASK & 0xFFFF;
  const out = new Array<number>(region.width * region.height);
  for (let r = 0; r < region.height; r++) {
    const pr = mod(region.row + r - anchorRow, rows);
    for (let c = 0; c < region.width; c++) {
      const pc = mod(region.col + c - anchorCol, cols);
      const slot = slotBase + pc * rows + pr;
      const i = r * region.width + c;
      const attrs = existing !== undefined && i < existing.length ? existing[i] & attrMask : 0;
      out[i] = attrs | (slot & LAYOUT_TILE_INDEX_MASK);
    }
  }
  return out;
}

/**
 * The rectangle a band-stamp gesture covers: a CLICK (cursor still on the
 * press cell) is one whole pattern hung from the press cell; a DRAG is the
 * exact rectangle between the press cell and the cursor, whichever way it
 * grows — a strip narrower than the pattern is the ordinary case (foliage
 * between two trunks), so the drag is never rounded up to whole patterns.
 * Clipped to the plane, and never empty when the press cell is on it.
 */
export function bandStampRegionOf(
  band: Pick<BgOverrideBand, 'cols' | 'rows'>,
  press: { col: number; row: number },
  cursor: { col: number; row: number },
  planeCols: number,
  planeRows: number,
): StampRegion {
  let c0: number, r0: number, c1: number, r1: number;
  if (press.col === cursor.col && press.row === cursor.row) {
    c0 = press.col; r0 = press.row;
    c1 = press.col + band.cols - 1; r1 = press.row + band.rows - 1;
  } else {
    c0 = Math.min(press.col, cursor.col); c1 = Math.max(press.col, cursor.col);
    r0 = Math.min(press.row, cursor.row); r1 = Math.max(press.row, cursor.row);
  }
  c0 = Math.max(0, c0); r0 = Math.max(0, r0);
  c1 = Math.min(planeCols - 1, c1); r1 = Math.min(planeRows - 1, r1);
  return { col: c0, row: r0, width: Math.max(0, c1 - c0 + 1), height: Math.max(0, r1 - r0 + 1) };
}
