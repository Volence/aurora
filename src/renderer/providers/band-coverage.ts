// WHICH BACKGROUND CELLS DOES A SLOT RANGE PAINT? — ROADMAP item 43 part 2.
//
// ═══ WHY THIS EXISTS, AND WHY IT IS THE FEATURE RATHER THAN A CONSOLATION ═══
//
// A BgAnim band names a CONTIGUOUS RANGE OF TILE SLOTS in the background's blob.
// Promotion is `tiles[base : base+cols*rows]` becoming animated — and by
// construction that animates those tiles WHEREVER THE PICTURE USES THEM. The
// blob is de-duplicated, so one slot can be drawn by hundreds of cells: aeon
// confirmed 2026-08-26 that their live 8x4 band's slot 3 paints 964 cells of
// sky, and that is what promotion MEANS, not corruption.
//
// So every promotion has a FOOTPRINT the author cannot see until it moves. This
// module computes that footprint, so the map can show it BEFORE the write.
//
// ⚠ THE FOOTPRINT IS NEUTRAL INFORMATION, NEVER A WARNING. Scatter is legal and
// sometimes intended; whether 964 cells of stepping sky is the look the owner
// wants is HIS call. Nothing in this file names a threshold, ranks a shape as
// good or bad, or returns a severity — `coverageSummary` states the two numbers
// and stops. A caller that renders it in an alarm colour has broken the rule
// this paragraph exists to state.
//
// ═══ WHY IT IS A LENS AND NOT A MARQUEE (the measurement that re-scoped this) ═══
//
// The booked gesture was a rectangular marquee over the picture resolving to a
// promotable slot range. It cannot exist: the static blob is laid out ROW-major
// in the picture and a band's slots are COLUMN-major (`slot = col*rows + row`),
// so the two are transposes. Of 143,088 multi-row marquees swept over three
// real documents, 18 resolve — and at `rows=4`, the height both shipped bands
// use, ZERO do. See docs/reviews/2026-08-26-bganim-marquee-resolution.md.
//
// THE DISTINCTION THAT SURVIVED: the picture may define a band's LOCATION; it
// can never define its EXTENT. Location comes from the map (click a cell, read
// its slot); extent comes from the slot axis (cols/rows on the form). This
// module is the read that closes the loop — given the extent, it says exactly
// which cells the picture will animate.
//
// ═══ NO REFUSAL IS POSSIBLE HERE ═══
//
// Unlike the marquee, this direction is TOTAL: every `(layout, range)` pair has
// an answer, including the empty one. `cells: []` is a real result — "the
// document licenses this range and no background cell draws it" — not a
// failure. The only thing a caller must gate on is whether the layout it hands
// in is the one the slot indices MEAN (see `resolveBandLens`); that is a
// question about which document is on screen, never about the range.
//
// ═══ PURE, AND OUT OF `.tsx` ON PURPOSE ═══
//
// bar 1: the node suite cannot see React or a canvas, so a classifier written
// inside a component is a classifier `vitest run` cannot check — and a
// transposed or off-by-one cell mapping would paint confidently wrong cells and
// look entirely plausible. Every function here takes plain data and returns
// plain data.

import { LAYOUT_TILE_INDEX_MASK } from '../../core/formats/bg-override/bg-override';
// The ONE convention for naming a slot span on screen (item 54). Imported
// rather than restated: `SlotRange` below is HALF-OPEN and every quantity in
// this file is a COUNT, so `base + count` is the first slot the range does NOT
// own — printing it hands the author somebody else's slot. The arithmetic that
// SELECTS cells stays half-open; only the sentences go through the helper.
import { NO_SLOTS_PHRASE, slotSpanPhrase } from './bg-anim-aeon';

/** A contiguous half-open run of blob slots: `[base, base + count)`. */
export interface SlotRange {
  base: number;
  count: number;
}

/** One background cell that draws a slot in the range. */
export interface CoverageCell {
  /** Flat index into the layout — `row * planeCols + col`. */
  cell: number;
  col: number;
  row: number;
  /** The BLOB slot this cell names (absolute, not range-local). */
  slot: number;
}

/** The footprint of one slot range over one layout. */
export interface BandCoverage {
  planeCols: number;
  planeRows: number;
  /** The range this describes, echoed so a report cannot drift from its subject. */
  range: SlotRange;
  /** Every covered cell, in layout order. */
  cells: CoverageCell[];
  /**
   * Cells per slot, indexed RANGE-LOCALLY (`perSlot[i]` is slot `base + i`).
   * Length is always `range.count`, so a slot nothing draws reads as 0 rather
   * than as an absence.
   */
  perSlot: number[];
  /**
   * The single slot with the largest footprint, or null when nothing is drawn.
   * THE HEADLINE NUMBER, and the reason this module exists: a range's total can
   * look modest while one slot inside it carries almost all of it.
   */
  largest: { slot: number; localSlot: number; cells: number } | null;
  /** How many slots in the range no background cell draws. */
  undrawnSlots: number;
}

/**
 * A band's slot range from its geometry. One spelling, so a caller cannot
 * compute `cols * rows` one way here and another way in a command.
 */
export function slotRange(base: number, cols: number, rows: number): SlotRange {
  return { base, count: cols * rows };
}

/** True when `slot` is inside the range. `count <= 0` covers nothing. */
export function rangeCovers(range: SlotRange, slot: number): boolean {
  return range.count > 0 && slot >= range.base && slot < range.base + range.count;
}

/**
 * THE BLOB-LOCAL TILE INDEX A LAYOUT WORD NAMES, or null when the word is the
 * consumer's blank escape.
 *
 * BOTH HALVES ARE THE CONTRACT'S, quoted rather than restated:
 *
 *   • the mask is `LAYOUT_TILE_INDEX_MASK`, read through the codec's loud
 *     accessor. `unpackNametableWord` next door spells `0x7FF` as a literal
 *     because it speaks the Genesis nametable in general; this speaks the BG
 *     OVERRIDE's blob, whose mask is a contract value that must move with the
 *     contract.
 *   • a word of EXACTLY ZERO is passed through unrebased by the consumer and
 *     renders VRAM tile 0 (blank) — it does NOT mean `tiles[0]`
 *     (bganim-consumer-contract.json, LAYOUT_TILE_INDEX_MASK's `why`, and the
 *     preview renderer's cell scan carries the same escape). Without this a
 *     lens on a range containing slot 0 would light every blank cell on the
 *     plane, which on the shipped background is most of it.
 */
export function layoutWordSlot(word: number): number | null {
  if (word === 0) return null;
  return word & LAYOUT_TILE_INDEX_MASK;
}

/**
 * Every background cell whose word names a slot in `range`.
 *
 * `planeCols` IS THE CALLER'S, not a constant of this module, and that is
 * deliberate: the viewport paints the plane through `SectionRenderer.loadBg`
 * with `BG_WIDTH` words per row, so the lens must decode it the same way or its
 * tint lands on cells the picture does not have there. Passing it in means the
 * two cannot disagree — the same argument `resolveDisplayedBg` is shared for.
 *
 * Throws when the layout is not a whole number of rows: a partial row would
 * make the last cells' `row`/`col` a guess, and a lens that guesses coordinates
 * is the exact defect this file's docblock warns about.
 */
export function bandCoverage(
  layout: ArrayLike<number>, range: SlotRange, planeCols: number,
): BandCoverage {
  if (!Number.isInteger(planeCols) || planeCols <= 0) {
    throw new Error(`bandCoverage: planeCols must be a positive integer, got ${planeCols}`);
  }
  if (layout.length % planeCols !== 0) {
    throw new Error(
      `bandCoverage: a layout of ${layout.length} words is not a whole number of rows at `
      + `${planeCols} words/row, so no cell has a well-defined (col, row)`,
    );
  }
  const planeRows = layout.length / planeCols;
  const count = Math.max(0, range.count);
  const perSlot = new Array<number>(count).fill(0);
  const cells: CoverageCell[] = [];

  for (let cell = 0; cell < layout.length; cell++) {
    const slot = layoutWordSlot(layout[cell]);
    if (slot === null) continue;
    if (!rangeCovers(range, slot)) continue;
    cells.push({ cell, col: cell % planeCols, row: Math.floor(cell / planeCols), slot });
    perSlot[slot - range.base]++;
  }

  let largest: BandCoverage['largest'] = null;
  let undrawnSlots = 0;
  for (let i = 0; i < count; i++) {
    if (perSlot[i] === 0) { undrawnSlots++; continue; }
    if (largest === null || perSlot[i] > largest.cells) {
      largest = { slot: range.base + i, localSlot: i, cells: perSlot[i] };
    }
  }

  return { planeCols, planeRows, range: { base: range.base, count }, cells, perSlot, largest, undrawnSlots };
}

/**
 * The footprint as one sentence, for the panel and the canvas label.
 *
 * ⚠ NEUTRAL. It reports a SHAPE and never a verdict: no "warning", no "only",
 * no "but", no threshold above which a number becomes a problem. The two facts
 * are the total and the largest single-slot footprint, because those are the two
 * an author cannot get any other way — the total says how much of the picture
 * moves, the largest says whether one tile carries it.
 */
export function coverageSummary(cov: BandCoverage): string {
  const n = cov.cells.length;
  if (n === 0) {
    // ⚠ TWO DIFFERENT EMPTIES MEET HERE, and only the first is what `n === 0`
    // means. Zero CELLS is "the document licenses this range and the picture
    // never draws it" — a real result, per this file's header. Zero SLOTS is a
    // different fact that lands in the same branch, because an empty range
    // covers nothing (`rangeCovers` answers false for every slot) and so always
    // arrives with zero cells. "no background cell draws no slots" is true and
    // tells the author nothing, so the empty RANGE gets its own sentence.
    //
    // WHICH empty it is, is decided by `slotSpanPhrase` and not by a second
    // `count <= 0` test here: that boundary is owned in one place, and a copy
    // of it is a copy that can drift.
    const slots = slotSpanPhrase(cov.range.base, cov.range.count);
    return slots === NO_SLOTS_PHRASE
      ? `this range covers ${NO_SLOTS_PHRASE}, so no background cell can draw it`
      : `no background cell draws ${slots}`;
  }
  const parts = [`paints ${n} cell${n === 1 ? '' : 's'}`];
  if (cov.largest) {
    parts.push(
      `largest single slot ${cov.largest.slot}: ${cov.largest.cells} cell`
      + `${cov.largest.cells === 1 ? '' : 's'}`,
    );
  }
  if (cov.undrawnSlots > 0) {
    parts.push(`${cov.undrawnSlots} of ${cov.range.count} slot`
      + `${cov.range.count === 1 ? '' : 's'} undrawn`);
  }
  return parts.join(' · ');
}

/**
 * The covered cells' bounding box in CELL coordinates, or null when nothing is
 * covered.
 *
 * IT EXISTS SO THE CANVAS CAPTION CAN SIT BESIDE WHAT IT DESCRIBES. The first
 * person to see this lens could not tell that the words in one corner and the
 * wash in another were about the same thing — which is a legibility defect, not
 * a cosmetic one: a lens whose label is unattached is decoration. Pure and here
 * rather than in the draw pass for this file's usual reason.
 */
export function coverageBounds(
  cells: readonly CoverageCell[],
): { minCol: number; minRow: number; maxCol: number; maxRow: number } | null {
  if (cells.length === 0) return null;
  let minCol = Infinity, minRow = Infinity, maxCol = -Infinity, maxRow = -Infinity;
  for (const c of cells) {
    if (c.col < minCol) minCol = c.col;
    if (c.col > maxCol) maxCol = c.col;
    if (c.row < minRow) minRow = c.row;
    if (c.row > maxRow) maxRow = c.row;
  }
  return { minCol, minRow, maxCol, maxRow };
}

/**
 * WHAT THE HIGHLIGHT IS, in the author's words rather than in slot arithmetic.
 *
 * THE DEFECT THIS FIXES, in the owner's own sentence: the tint "didn't read as
 * bad or wrong, it did read as 'something/information' — just didn't know what
 * it was". The canvas said `band 0 · slots 0..32` and the numbers below it, and
 * nothing in that named the WASH. So this sentence leads with the highlight
 * itself and says what it means, and the slot arithmetic follows it rather than
 * standing in for it.
 *
 * STILL NEUTRAL. It states what the highlight is, never whether it is a good
 * idea — `coverageSummary` carries the shape and this carries the subject.
 */
export function coverageSubject(
  kind: 'band' | 'candidate', bandIndex: number | null, range: SlotRange,
): string {
  const slots = slotSpanPhrase(range.base, range.count);
  // ⚠ THE EMPTY RANGE CANNOT BE HANDLED BY SUBSTITUTION, which is why it is
  // decided rather than inherited. The candidate sentence reads "a band at
  // ${slots} would animate", and "a band at no slots would animate" is not
  // English; the band sentence would render "(no slots)" while still claiming
  // cells are highlighted, which is worse than ungrammatical. A `count <= 0`
  // range is representable here — `SlotRange` is a half-open run whose count
  // this module already clamps at `Math.max(0, ...)`, and `setBandCandidate`
  // takes an unvalidated patch — so this is a shape the type admits, not one
  // only arithmetic could reach. Both kinds get the same honest sentence:
  // nothing is highlighted, and why.
  if (slots === NO_SLOTS_PHRASE) {
    const subject = kind === 'band' ? `band ${bandIndex}` : 'this candidate';
    return `highlighted: nothing — ${subject} covers ${NO_SLOTS_PHRASE}`;
  }
  return kind === 'band'
    ? `highlighted: the cells band ${bandIndex} animates (${slots})`
    : `highlighted: the cells a band at ${slots} would animate`;
}

/**
 * Which band owns `slot`, given the bands' slot bases in list order, or null
 * when the slot is static.
 *
 * The bases are the CALLER'S — `bandSlotBases(documentBands(doc))` — for the
 * reason every other band read here shares: the walk that turns a band list into
 * slot bases lives in the codec, and a second copy of it is a second thing to
 * keep in step with an insert.
 *
 * ⚠ `bandSlotBases` returns `bands.length + 1` entries (the tail is where the
 * NEXT band would go), so the walk is over `tileCounts`, never over `bases`.
 *
 * MEASURED, NOT ASSUMED: walking `bases` instead is currently HARMLESS, because
 * the extra iteration reads `tileCounts[n]` as `undefined`, and `slot < NaN` is
 * false for every slot. A red-first plant of exactly that swap turned NO row red
 * (scratchpad/band-coverage-plants.mjs), and this sentence says so rather than
 * claiming a hazard the plant refuted. The walk is over `tileCounts` because
 * that is the array whose length is the answer's domain — one band, one count —
 * not because the other spelling breaks today.
 */
export function bandOwningSlot(
  slot: number, bases: readonly number[], tileCounts: readonly number[],
): number | null {
  for (let i = 0; i < tileCounts.length; i++) {
    if (slot >= bases[i] && slot < bases[i] + tileCounts[i]) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CLICK-TO-SEED — the MARK
// ---------------------------------------------------------------------------
//
// The owner's own sentence for this feature was "I MARK somewhere". A mark, not
// a box: the measurement that killed the marquee (see the docblock at the top of
// this file) is exactly the finding that a REGION of the picture cannot describe
// a band, while a POINT in it can — because a point names one slot, and a slot
// is a position on the axis a band is actually defined along.
//
// So a click reads ONE cell and answers one of four ways. Each is a real answer
// with a real consequence; none of them is an error state.

export type BandMark =
  /** An animated slot: the map becomes band navigation, selecting that card. */
  | { kind: 'band'; index: number; slot: number }
  /** A static slot: the promotion candidate seeds here. */
  | { kind: 'candidate'; staticBase: number; slot: number }
  /**
   * The consumer's blank escape (`word === 0`). It renders VRAM tile 0 and does
   * NOT mean `tiles[0]`, so there is no slot to seed from — seeding 0 here would
   * silently mark the first animated slot from a cell that draws nothing.
   */
  | { kind: 'blank' }
  /** A word naming a slot past the end of `tiles` — nothing to promote. */
  | { kind: 'out-of-blob'; slot: number };

/**
 * Classify one layout word into a mark.
 *
 * THE CLAMP IS DEFENCE, NOT ARITHMETIC. Band slots are a PREFIX of `tiles`
 * (`animatedSlotCount` is a running sum from 0), so a slot no band owns is
 * already at or past `firstPromotableSlot` and `Math.max` cannot move it. It is
 * here so that the invariant is stated where a seed is produced rather than
 * assumed two modules away — a seeded candidate is legal BY CONSTRUCTION, which
 * is what lets this whole surface carry no refusal machinery.
 */
export function markFromLayoutWord(
  word: number,
  bases: readonly number[],
  tileCounts: readonly number[],
  firstPromotableSlot: number,
  blobTileCount: number,
): BandMark {
  const slot = layoutWordSlot(word);
  if (slot === null) return { kind: 'blank' };
  if (slot >= blobTileCount) return { kind: 'out-of-blob', slot };
  const band = bandOwningSlot(slot, bases, tileCounts);
  if (band !== null) return { kind: 'band', index: band, slot };
  return { kind: 'candidate', staticBase: Math.max(slot, firstPromotableSlot), slot };
}
