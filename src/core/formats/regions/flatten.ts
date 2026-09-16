// FLATTENING — the regions document turned into the engine's Region rows.
//
// WHAT THIS FILE IS. `document.ts` is the FILE half: read, validate, write, in
// the document's own EXCLUSIVE `{x, y, w, h}` form. This is the other half of
// the same seam: the same regions as the flat, disjoint, act-covering list of
// INCLUSIVE `{x0, x1, y0, y1}` rows `engine/structs.emp`'s `Region` reads.
// Aeon's `tools/region_flatten.py` is the same arithmetic on the other side of
// the wire, and `test/formats/regions-seam.test.ts` asserts the two produce the
// same ten rows from the same vendored document.
//
// IT IS APP CODE, NOT TEST CODE. The editor needs it: a region's row is what the
// engine will actually resolve at a camera centre, so "what does the table look
// like" and "where is the hole" are questions the editor has to answer while
// someone is drawing. The test is a consumer, not the reason.
//
// THE CONVERSION IS `x1 = x + w - 1`, ONE SITE, HERE. A one-pixel column is
// `x0 === x1` and never `x1 < x0`. Aurora's model stays exclusive everywhere
// else and crosses the line only in this file (spec §5.1, part 2 §6.3).
//
// THE MODEL IS CUT-ON-DRAW, NOT PAINTER'S ORDER, and that is a ruling rather
// than a reading. The spec's §5.2 writes out a painter's-order flatten — an
// act-wide bottom layer, later regions subtracted out of earlier ones, then an
// adjacency merge — and §8 of the same document records the owner overturning
// the model it was written against on 2026-09-14, ruling "cut right away": the
// editor trims at the moment of the draw, so the document holds each region's
// OWN area, already disjoint, and flattening is a CHECK that the rows are
// disjoint and cover the act rather than a subtraction. §5.2's prose was never
// rewritten, which is the hazard; the landed contract settles it anyway, because
// the schema at empyrean `c3f892f` carries one `rect` per region and no bottom
// layer to subtract from. Aeon's `region_flatten.py` module docstring reaches
// the same conclusion from the same two documents.
//
// WHAT THIS LAYER CANNOT CHECK, named so its silence is not read as coverage.
// Aeon's `_check_row` runs SIX per-row rules. Three of them need only the act's
// size and are implemented below. The other three need bounds that live in the
// act's `.emp` descriptor and that Aurora does not have:
//
//   * `REGION_MIN_SPAN` — a region narrower than this on either axis can be
//     stepped over by a camera that moves up to 16 px a frame;
//   * the reachable-band rules on the four interior edges, which are
//     `CENTRE_X_MIN`/`CENTRE_X_MAX`/`CENTRE_Y_MIN`/`CENTRE_Y_MAX` and are
//     derived from the screen size, not from the act's.
//
// They are the GENERATOR's refusals and they stay there. This module never
// invents a value for one, because a bound invented here would be a rule the
// engine does not have, and a rule that silently stops running is a check that
// passes for the wrong reason. A document this module accepts can still be
// refused by aeon's build for one of those three.

import type { Region, RegionBg, RegionRect, RegionsDocument } from './document';
import { BG_ACT_SENTINEL } from './document';

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * The background half of one row: `Region.rg_bg_layout` and `Region.rg_bg_span`
 * as the document can state them.
 *
 * ⚠ THE ROW STATES THE ENGINE VALUE, NOT THE DOCUMENT'S SPELLING, and that is
 * the whole design of this field rather than a normalisation convenience. The
 * contract gives ONE engine fact — "this region shows the act's background",
 * `rg_bg_layout = 0` — THREE legal document spellings: `bg` absent,
 * `bg.layoutRef` explicitly `null`, and `bg.layoutRef` the sentinel `"@act"`.
 * All three flatten to `{ layoutRef: null, span: null }` here. Carrying `"@act"`
 * through verbatim would hand every downstream reader two spellings of one fact
 * to re-collapse, and a reader that forgot would put a STRING where the engine
 * dereferences a POINTER. Aeon's `_check_region_bg` collapses at the same single
 * conversion site and says so in the same words; `toInclusive` below is the
 * precedent, the document's form crossing into the engine's form once.
 */
export interface RegionRowBg {
  /**
   * The layout the region shows, or `null` for the act's own — WHICH IS WHAT THE
   * SENTINEL BECOMES. `null` here is `rg_bg_layout = 0`.
   */
  layoutRef: string | null;
  /**
   * The layout's height in pixels (`rg_bg_span`), or `null`.
   *
   * ⚠ DERIVED FROM THE REFERENCED LAYOUT AND NEVER AUTHORED (part 2 §6.2 item
   * 1) — AND THIS MODULE CANNOT DERIVE IT. Aurora's flattener has no layout
   * library, so it forwards what the document says and normalises an absent
   * `span` to `null`; it never computes a height and never invents one, on the
   * same rule as the three per-row checks this file's header declines to
   * restate. `RegionBg.span`'s own doc comment in `document.ts` records the same
   * hole at the codec layer. Today every legal document reaches here with no
   * `span` at all, because a `layoutRef` other than the sentinel is refused by
   * aeon's generator, so this is `null` on every row of every act that exists.
   * The day `layoutRef` opens, DERIVING THIS IS WHAT AURORA OWES — and the seam
   * will say so loudly, because aeon's rows will carry the derived height and
   * this will still be `null`.
   */
  span: number | null;
}

/**
 * One row of the engine's Region table, in the INCLUSIVE form the engine reads.
 *
 * ⚠ THE KEY NAMES ARE THE SHARED GOLDEN'S AND NOT AURORA'S HOUSE STYLE. `x0`,
 * `x1`, `y0`, `y1` are the engine's field names, and `preset`, `sceneRef` and
 * `rasterRef` are the DOCUMENT's words rather than `.emp` symbols — deliberately,
 * because both repos have to be able to check them and Aurora cannot resolve an
 * `EditorSceneBinding_*` label. Renaming one here silently unpins the seam test.
 */
export interface RegionRow {
  /** Position in DOCUMENT order, which is the engine's table order. */
  index: number;
  id: string;
  /** Inclusive left edge. */
  x0: number;
  /** Inclusive right edge: `x + w - 1`. */
  x1: number;
  /** Inclusive top edge. */
  y0: number;
  /** Inclusive bottom edge: `y + h - 1`. */
  y1: number;
  preset: string;
  /**
   * NORMALISED TO AN EXPLICIT `null` when the document omits it, never left
   * absent. Aeon's `load_act_regions` does the same and says why: a caller
   * comparing rows must not be able to pass by reading a missing key as a null.
   */
  sceneRef: string | null;
  /** Explicit `null` when absent, for the same reason as `sceneRef`. */
  rasterRef: string | null;
  /**
   * ALWAYS PRESENT, never absent, even when the document carries no `bg` at all
   * — `sceneRef`'s rule one level down. Aeon's `ROW_KEYS` has been a ten-element
   * tuple ending in `bg` since `5713201`, and its `load_act_regions` emits the
   * pair for every row; a row that simply omitted the key would compare equal to
   * one that said `null` under a field-by-field loop and unequal under a deep
   * equality, which is the two-answers-from-one-table shape the seam exists to
   * refuse.
   */
  bg: RegionRowBg;
}

/**
 * The act's whole Region table: the rows plus the bounds they were checked
 * against.
 *
 * `act_w` / `act_h` are snake_case because they are the shared golden's
 * spelling (`tools/fixtures/regions/ojz_act1.rows.json`), not because this repo
 * spells anything that way.
 */
export interface RegionTable {
  act: string;
  act_w: number;
  act_h: number;
  rows: RegionRow[];
}

/** The act's size in world pixels. Read from the act, never from the document. */
export interface ActBounds {
  actW: number;
  actH: number;
}

/** An exclusive rectangle as a tuple, the form the area algebra below works in. */
type Rect = readonly [x: number, y: number, w: number, h: number];

/**
 * A document that cannot become a legal Region table. Distinct from
 * `RegionsDocumentError`, which is about the document's SHAPE: everything here
 * is about its GEOMETRY, and a document can be perfectly shaped and still leave
 * a hole in the act.
 */
export class RegionFlattenError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'RegionFlattenError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Rectangle algebra — EXCLUSIVE throughout, until `toInclusive`
// ---------------------------------------------------------------------------

function asRect(r: RegionRect): Rect {
  if (r.w <= 0 || r.h <= 0) {
    throw new RegionFlattenError(
      `rect (${r.x}, ${r.y}, ${r.w}, ${r.h}) has a non-positive extent. \`w\` and \`h\` are `
      + 'SIZES in the document\'s exclusive form, so the smallest legal rectangle is w = 1, '
      + 'h = 1, never 0 and never a second corner.',
    );
  }
  return [r.x, r.y, r.w, r.h];
}

/** Do two exclusive rects share a pixel? */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/**
 * `a` minus `b`, as up to four disjoint exclusive rects.
 *
 * The decomposition is the spec's, in its order: the part of `a` ABOVE `b`, the
 * part BELOW, then LEFT and RIGHT *within the overlapping rows only*, which is
 * what keeps the four pieces disjoint instead of double-counting the corners.
 * `[a]` when they do not meet; `[]` when `b` covers `a`.
 */
export function subtractRect(a: Rect, b: Rect): Rect[] {
  if (!rectsIntersect(a, b)) return [a];
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const out: Rect[] = [];
  let top = ay;
  let bottom = ay + ah;
  if (by > top) {                                   // above
    out.push([ax, top, aw, by - top]);
    top = by;
  }
  if (by + bh < bottom) {                           // below
    out.push([ax, by + bh, aw, bottom - (by + bh)]);
    bottom = by + bh;
  }
  if (bottom > top) {                               // the band of rows `b` actually cuts
    if (bx > ax) out.push([ax, top, bx - ax, bottom - top]);
    if (bx + bw < ax + aw) out.push([bx + bw, top, (ax + aw) - (bx + bw), bottom - top]);
  }
  return out;
}

/**
 * The parts of the act no rect covers, as exclusive rects. `[]` means EXACT
 * coverage.
 *
 * ⚠ THIS IS THE INSTRUMENT THAT HAS TO BE ABLE TO PRODUCE A NON-EMPTY ANSWER,
 * and that matters more than it sounds: the engine's own coverage `ensure` is an
 * area sum, which reports a hole as a wrong total and can never say WHERE. An
 * editor cannot draw a refusal it cannot locate. So this subtracts every row out
 * of the act and hands back what is left, and the seam test punches a hole on
 * purpose to prove the list is not empty by construction.
 */
export function uncoveredRects(rects: readonly Rect[], actW: number, actH: number): Rect[] {
  let remaining: Rect[] = [[0, 0, actW, actH]];
  for (const r of rects) {
    const next: Rect[] = [];
    for (const piece of remaining) next.push(...subtractRect(piece, r));
    remaining = next;
    if (remaining.length === 0) break;
  }
  return remaining.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2] || p[3] - q[3]);
}

/**
 * The first `[i, j]`, `i < j`, whose rects share a pixel — or `null`.
 *
 * `region_first_overlap` in the act descriptor restated, and deliberately the
 * same scan order, so the pair this names is the pair the `.emp` ensure would
 * name.
 */
export function firstOverlap(rects: readonly Rect[]): [number, number] | null {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsIntersect(rects[i], rects[j])) return [i, j];
    }
  }
  return null;
}

/**
 * `{x, y, w, h}` → `{x0, x1, y0, y1}`. THE ONE CONVERSION SITE IN AURORA
 * (spec §5.1, part 2 §6.3).
 */
export function toInclusive(rect: RegionRect): Pick<RegionRow, 'x0' | 'x1' | 'y0' | 'y1'> {
  const [x, y, w, h] = asRect(rect);
  return { x0: x, x1: x + w - 1, y0: y, y1: y + h - 1 };
}

/**
 * A region's `bg` block as the row's engine-valued pair. THE SECOND CONVERSION
 * SITE IN THIS FILE, and the only place the sentinel is collapsed.
 *
 * `undefined` in, `{ layoutRef: null, span: null }` out — an absent `bg` is not
 * a missing binding to be reported, it is the DEFAULT, and the default is the
 * act's own background. The three-spellings-one-fact rule is on `RegionRowBg`
 * above.
 *
 * It does not refuse a named layout. Rule 6 ("`bg.layoutRef` other than `"@act"`
 * or null while the engine has no consumer") is the GENERATOR's refusal, the way
 * `REGION_MIN_SPAN` and the reachable-edge family are — `validate.ts`'s header
 * says so at length and this file's header says why none of them are restated
 * here. A document this function flattens can still be refused by aeon's build.
 */
export function bgToRow(bg: RegionBg | undefined): RegionRowBg {
  const layoutRef = bg?.layoutRef ?? null;
  return {
    layoutRef: layoutRef === BG_ACT_SENTINEL ? null : layoutRef,
    span: bg?.span ?? null,
  };
}

/** One region as its row, at `index`. Bindings normalised to explicit nulls. */
export function regionToRow(region: Region, index: number): RegionRow {
  return {
    index,
    id: region.id,
    ...toInclusive(region.rect),
    preset: region.preset,
    sceneRef: region.sceneRef ?? null,
    rasterRef: region.rasterRef ?? null,
    bg: bgToRow(region.bg),
  };
}

/** A row back as the exclusive rect the area algebra wants. */
function rowRect(row: RegionRow): Rect {
  return [row.x0, row.y0, row.x1 - row.x0 + 1, row.y1 - row.y0 + 1];
}

/** The summed inclusive area — the engine's `region_area_sum` number. */
export function areaOfRows(rows: readonly RegionRow[]): number {
  return rows.reduce((n, r) => n + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0);
}

// ---------------------------------------------------------------------------
// The act's size
// ---------------------------------------------------------------------------

/**
 * The extent the document's own regions reach, as `{actW, actH}`.
 *
 * ⚠ THIS IS NOT THE ACT'S BOUNDS AND MUST NOT BE PASSED OFF AS THEM. The act's
 * size is `ACT_W`/`ACT_H` in the act's `.emp` descriptor; the document does not
 * carry it and this module never invents it. What this returns is the bounding
 * extent of what the document CLAIMS, which is a different sentence — a document
 * missing its bottom row has a smaller extent and the act has not moved.
 *
 * It is useful for exactly two things: seeding a UI that has no descriptor yet,
 * and CROSS-CHECKING. Under `flattenRegionsDocument`'s coverage rule a legal
 * document's extent equals the act exactly, so comparing this against bounds
 * read from somewhere else is a real comparison and not a tautology.
 */
export function actExtentFromDocument(doc: RegionsDocument): ActBounds {
  let actW = 0;
  let actH = 0;
  for (const region of doc.regions) {
    const [x, y, w, h] = asRect(region.rect);
    actW = Math.max(actW, x + w);
    actH = Math.max(actH, y + h);
  }
  return { actW, actH };
}

// ---------------------------------------------------------------------------
// Flatten
// ---------------------------------------------------------------------------

/**
 * The per-row rules this layer can state, over ONE inclusive row. Returns
 * complaint strings; empty means legal *as far as Aurora can tell*.
 *
 * Aeon's `_check_row` has three more (`REGION_MIN_SPAN` and the four
 * reachable-edge rules, which are one family). They need bounds from the act's
 * `.emp` descriptor and are NOT restated here — see this file's header. Every
 * message names the rule and the number that broke it, because a refusal whose
 * stated reason is wrong is worse than one that fails without a reason.
 */
function checkRow(row: RegionRow, bounds: ActBounds, who: string): string[] {
  const out: string[] = [];
  if (row.x0 < 0 || row.y0 < 0) {
    out.push(`${who}: a negative edge (${row.x0}, ${row.y0}) is outside every act: world px start at 0`);
  }
  if (row.x0 > row.x1 || row.y0 > row.y1) {
    out.push(`${who}: inverted rectangle (${row.x0}..${row.x1}, ${row.y0}..${row.y1}) contains no point`);
  }
  if (row.x1 >= bounds.actW || row.y1 >= bounds.actH) {
    out.push(
      `${who}: reaches past the act. The inclusive maximum is (${bounds.actW - 1}, `
      + `${bounds.actH - 1}), this row ends at (${row.x1}, ${row.y1})`,
    );
  }
  return out;
}

/**
 * The document's regions as the engine's rows, REFUSING rather than repairing.
 *
 * `bounds` is the ACT's size and is required. It is not defaulted from the
 * document and it is not optional: the coverage rule below is the whole reason
 * the act's size is in this function, and a size taken from the thing being
 * checked would make coverage true by construction and therefore unfalsifiable.
 *
 * Row order is DOCUMENT order (the schema: "regions in author order"), which is
 * what makes the emitted table stable across runs and keeps every region INDEX a
 * tool already names meaning the same place.
 *
 * The three checks, in the order a failing document most usefully meets them:
 *   1. per-row, so a bad rectangle is named as itself before it is described as
 *      an overlap with its neighbour;
 *   2. pairwise disjointness, naming the two ids — the engine's `Region_Resolve`
 *      returns the FIRST containing row, so an overlap makes identity depend on
 *      table order;
 *   3. coverage, naming the uncovered rectangles — a hole is a place with no
 *      identity.
 *
 * It never drops a region, fills a hole, clamps a rect, or reads anything for
 * something the document left out (spec §5.3).
 */
export function flattenRegionsDocument(
  doc: RegionsDocument,
  bounds: ActBounds,
  where = 'regions.json',
): RegionTable {
  const rows = doc.regions.map((region, i) => regionToRow(region, i));

  const complaints = rows.flatMap((row, i) => checkRow(
    row, bounds, `${where}: region ${JSON.stringify(doc.regions[i].id)} (row ${i})`,
  ));
  if (complaints.length > 0) {
    throw new RegionFlattenError(`${where} cannot become a legal region table`, complaints);
  }

  const rects = rows.map(rowRect);
  const pair = firstOverlap(rects);
  if (pair !== null) {
    const [i, j] = pair;
    throw new RegionFlattenError(
      `${where}: regions ${JSON.stringify(rows[i].id)} (row ${i}) and `
      + `${JSON.stringify(rows[j].id)} (row ${j}) overlap: `
      + `${rows[i].x0}..${rows[i].x1} x ${rows[i].y0}..${rows[i].y1} against `
      + `${rows[j].x0}..${rows[j].x1} x ${rows[j].y0}..${rows[j].y1}. Identity must be a `
      + 'function of the camera centre alone; with an overlap it depends on scan order, '
      + 'because Region_Resolve returns the FIRST containing row. The editor cuts on draw '
      + '(owner ruling 2026-09-14), so an overlap in the file means the document was '
      + 'hand-edited or written by something that does not cut.',
    );
  }

  const holes = uncoveredRects(rects, bounds.actW, bounds.actH);
  if (holes.length > 0) {
    const shown = holes.slice(0, 6)
      .map(([x, y, w, h]) => `x ${x}..${x + w - 1} y ${y}..${y + h - 1}`).join(', ');
    const more = holes.length <= 6 ? '' : ` (and ${holes.length - 6} more)`;
    throw new RegionFlattenError(
      `${where}: ${holes.length} rectangle(s) of the ${bounds.actW}x${bounds.actH} act belong `
      + `to no region: ${shown}${more}. A hole is a place with no identity: Region_Resolve `
      + 'would return nothing there and the crossing would keep whatever region the camera '
      + 'came from. Give the area to a region; the generator will not fill it with a default '
      + 'it was not handed.',
    );
  }

  return { act: doc.act, act_w: bounds.actW, act_h: bounds.actH, rows };
}
