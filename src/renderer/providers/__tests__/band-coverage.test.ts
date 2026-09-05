// WHICH CELLS DOES A SLOT RANGE PAINT, AND WHAT DOES A CLICK ON ONE MEAN?
//
// ROADMAP item 43 part 2. The classifier behind the band lens, and the one piece
// of this parcel a node suite can actually see — which is why it is a pure
// module and not a closure inside `MapViewport`.
//
// ⚠ THE DEFECT THESE ROWS EXIST TO CATCH IS A CONFIDENT WRONG ANSWER. A lens
// that transposes (col, row), that is one cell out, that treats the consumer's
// blank escape as `tiles[0]`, or that walks the band bases one entry too far
// will paint a plausible set of cells and look entirely correct on screen. So
// every geometric row below uses `col !== row` (a square plane hides a
// transpose), a plane wider than it is tall where possible, and a slot at a
// position nothing else in the fixture shares.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bandCoverage, bandOwningSlot, coverageBounds, coverageSubject, coverageSummary,
  layoutWordSlot, markFromLayoutWord,
  rangeCovers, slotRange, type SlotRange,
} from '../band-coverage';
import { NO_SLOTS_PHRASE } from '../bg-anim-aeon';
import {
  LAYOUT_TILE_INDEX_MASK, TILE_WIDTH_PX, type BgOverrideBand,
} from '../../../core/formats/bg-override/bg-override';
import { bandSlotBases } from '../../../core/formats/bg-override/bg-anim-band';

/**
 * A band, only as far as `bandSlotBases` reads one. `pattern_px` is derived
 * rather than typed so the fixture cannot drift from the contract's tile width.
 */
function band(cols: number, rows: number): BgOverrideBand {
  return { cols, rows, pattern_px: cols * TILE_WIDTH_PX, phases: [] };
}

/** A plane of blank words — every cell the consumer's escape, nothing covered. */
function blank(cols: number, rows: number): Uint16Array {
  return new Uint16Array(cols * rows);
}

/**
 * THE LAST SLOT A RANGE OWNS, established by the module's own MEMBERSHIP TEST
 * rather than by repeating the arithmetic under test.
 *
 * ⚠ THIS IS THE POINT OF THE HELPER, not a convenience. Every readout below
 * names a slot span, and the defect being pinned is a span whose second number
 * is one PAST the range. An expectation that computed `base + count - 1` would
 * be the fix's own arithmetic checking itself, and one written as
 * `slotSpanPhrase(...)` would move with the very function a poison changes — so
 * both would stay green against a restored off-by-one. `rangeCovers` is a
 * different function, is half-open BY DESIGN (this file's headline rule: the
 * coverage arithmetic is correct and is not the defect), and is what actually
 * decides which cells the lens paints. Walking it gives the boundary an
 * independent witness.
 */
function lastOwnedSlot(r: SlotRange): number {
  expect(rangeCovers(r, r.base)).toBe(true);       // a non-empty range, or the walk is meaningless
  let last = r.base;
  while (rangeCovers(r, last + 1)) last++;
  expect(rangeCovers(r, last)).toBe(true);
  expect(rangeCovers(r, last + 1)).toBe(false);    // and this is the slot no readout may name
  return last;
}

/** Attribute bits ABOVE the index mask: priority + palette line 2 + hFlip. */
const ATTRS = (0x8000 | (2 << 13) | 0x0800) & ~LAYOUT_TILE_INDEX_MASK;

describe('layoutWordSlot — the mask and the escape, both from the contract', () => {
  it('reads the blob-local index out of a word carrying attributes', () => {
    expect(layoutWordSlot(ATTRS | 300)).toBe(300);
  });

  it('a word of EXACTLY zero is blank, NOT tiles[0]', () => {
    // The consumer rebases only `if word != 0`, so 0 renders VRAM tile 0. A lens
    // that returned 0 here would light every blank cell on the plane the moment
    // a range contained slot 0 — which on the shipped background is most of it.
    expect(layoutWordSlot(0)).toBeNull();
  });

  it('a word whose ATTRIBUTES are set but whose index is zero is still slot 0', () => {
    // Only the whole word being zero is the escape. `ATTRS | 0` is a real
    // reference to tiles[0] with a palette and a priority bit on it.
    expect(layoutWordSlot(ATTRS)).toBe(0);
  });

  it('masks with the contract value, not with a literal', () => {
    expect(layoutWordSlot(0xFFFF)).toBe(LAYOUT_TILE_INDEX_MASK);
  });
});

describe('rangeCovers — half-open, and empty ranges cover nothing', () => {
  it('includes the base and excludes base+count', () => {
    const r = slotRange(10, 2, 2); // 4 slots: 10, 11, 12, 13
    expect(r.count).toBe(4);
    expect(rangeCovers(r, 9)).toBe(false);
    expect(rangeCovers(r, 10)).toBe(true);
    expect(rangeCovers(r, 13)).toBe(true);
    expect(rangeCovers(r, 14)).toBe(false);
  });

  it('a zero-slot range covers nothing, including its own base', () => {
    expect(rangeCovers({ base: 10, count: 0 }, 10)).toBe(false);
  });
});

describe('bandCoverage — WHERE the cells are', () => {
  const COLS = 8, ROWS = 4;

  it('resolves a covered cell to the right (col, row) — and a transpose fails it', () => {
    const layout = blank(COLS, ROWS);
    // col 5, row 2. Deliberately col !== row, and deliberately on a plane that
    // is not square: a transposed implementation computes col 2 / row 5, and
    // row 5 does not exist on a 4-row plane.
    layout[2 * COLS + 5] = 40;
    const cov = bandCoverage(layout, slotRange(40, 1, 1), COLS);
    expect(cov.cells).toHaveLength(1);
    expect(cov.cells[0]).toEqual({ cell: 2 * COLS + 5, col: 5, row: 2, slot: 40 });
    expect(cov.planeRows).toBe(ROWS);
  });

  it('an off-by-one in the cell walk moves the answer', () => {
    // Two adjacent cells holding two different slots. Any +1/-1 in the walk
    // swaps which slot each column reports.
    const layout = blank(COLS, ROWS);
    layout[1 * COLS + 3] = 40;
    layout[1 * COLS + 4] = 41;
    const cov = bandCoverage(layout, slotRange(40, 2, 1), COLS);
    expect(cov.cells.map((c) => [c.col, c.slot])).toEqual([[3, 40], [4, 41]]);
  });

  it('finds EVERY cell that names a slot — the de-duplicated footprint', () => {
    // The property the whole feature exists for: one slot, many cells. aeon's
    // live 8x4 band has a slot painting 964 cells of sky.
    const layout = blank(COLS, ROWS);
    for (let i = 0; i < COLS * ROWS; i++) layout[i] = 40;
    layout[0] = 41;
    const cov = bandCoverage(layout, slotRange(40, 2, 1), COLS);
    expect(cov.cells).toHaveLength(COLS * ROWS);
    expect(cov.perSlot).toEqual([COLS * ROWS - 1, 1]);
    expect(cov.largest).toEqual({ slot: 40, localSlot: 0, cells: COLS * ROWS - 1 });
    expect(cov.undrawnSlots).toBe(0);
  });

  it('ignores attribute bits — the same art flipped or repalettised still counts', () => {
    const layout = blank(COLS, ROWS);
    layout[3] = 40;
    layout[4] = ATTRS | 40;
    const cov = bandCoverage(layout, slotRange(40, 1, 1), COLS);
    expect(cov.cells.map((c) => c.cell)).toEqual([3, 4]);
  });

  it('a range containing slot 0 does NOT light the blank cells', () => {
    // The escape, at the level that matters. The plane is all zeroes but one
    // cell that genuinely references tiles[0].
    const layout = blank(COLS, ROWS);
    layout[7] = ATTRS; // index 0, attributes set — a real reference
    const cov = bandCoverage(layout, slotRange(0, 1, 1), COLS);
    expect(cov.cells.map((c) => c.cell)).toEqual([7]);
  });

  it('an empty footprint is a real answer, not a failure', () => {
    const cov = bandCoverage(blank(COLS, ROWS), slotRange(40, 2, 2), COLS);
    expect(cov.cells).toEqual([]);
    expect(cov.perSlot).toEqual([0, 0, 0, 0]);
    expect(cov.largest).toBeNull();
    expect(cov.undrawnSlots).toBe(4);
  });

  it('perSlot is RANGE-LOCAL and always as long as the range', () => {
    const layout = blank(COLS, ROWS);
    layout[0] = 42; // the third slot of a range based at 40
    const cov = bandCoverage(layout, slotRange(40, 4, 1), COLS);
    expect(cov.perSlot).toEqual([0, 0, 1, 0]);
    expect(cov.largest).toEqual({ slot: 42, localSlot: 2, cells: 1 });
    expect(cov.undrawnSlots).toBe(3);
  });

  it('refuses a layout that is not a whole number of rows, naming both numbers', () => {
    // A partial row would make the last cells' (col,row) a guess, and a lens
    // that guesses coordinates is the defect this module is shaped to prevent.
    expect(() => bandCoverage(new Uint16Array(30), slotRange(0, 1, 1), 8))
      .toThrow(/30 words is not a whole number of rows at 8 words\/row/);
  });

  it('refuses a nonsense plane width rather than dividing by it', () => {
    expect(() => bandCoverage(new Uint16Array(32), slotRange(0, 1, 1), 0))
      .toThrow(/positive integer/);
  });

  it('accepts a plain number[] layout as well as a Uint16Array', () => {
    // `doc.layout` is a number[] and `bgOverrideDisplay` mirrors it as a
    // Uint16Array; both must decode identically or the panel and the canvas
    // would disagree about their own document.
    const arr = [0, 0, 40, 0, 0, 0, 0, 0];
    expect(bandCoverage(arr, slotRange(40, 1, 1), 8).cells[0].col).toBe(2);
  });
});

describe('coverageSummary — the shape, and NOTHING ELSE', () => {
  const COLS = 8, ROWS = 4;

  it('states the total and the largest single-slot footprint', () => {
    const layout = blank(COLS, ROWS);
    for (let i = 0; i < 20; i++) layout[i] = 40;
    layout[20] = 41;
    const s = coverageSummary(bandCoverage(layout, slotRange(40, 2, 1), COLS));
    expect(s).toContain('paints 21 cells');
    expect(s).toContain('largest single slot 40: 20 cells');
  });

  it('says so plainly when nothing draws the range, naming only slots the range OWNS', () => {
    // ⚠ THE BOUNDARY IS THE WHOLE ROW. This sentence shipped as
    // `slots ${base}..${base + count}` — the first slot PAST the range, in the
    // one message whose subject is which slots the picture ignores. The fixture
    // makes that concrete: the plane draws slot `last + 1` HEAVILY and nothing
    // inside the range at all, so the defect's sentence would name a slot the
    // picture demonstrably paints while reporting zero cells.
    const range = slotRange(40, 2, 2);
    const last = lastOwnedSlot(range);
    const layout = blank(COLS, ROWS);
    for (let i = 0; i < 7; i++) layout[i] = last + 1;
    const cov = bandCoverage(layout, range, COLS);
    expect(cov.cells).toEqual([]);              // ANTI-VACUOUS: the empty branch really ran
    expect(coverageSummary(cov)).toBe(`no background cell draws slots ${range.base}..${last}`);
  });

  it('a range of NO SLOTS gets its own sentence, not a backwards span', () => {
    // Zero CELLS and zero SLOTS are different facts that land in the same
    // branch (an empty range covers nothing, so it always arrives with no
    // cells). "no background cell draws no slots" is true and useless, and
    // `base + count - 1` would render `40..39`.
    const cov = bandCoverage(blank(COLS, ROWS), { base: 40, count: 0 }, COLS);
    expect(cov.cells).toEqual([]);
    expect(coverageSummary(cov))
      .toBe(`this range covers ${NO_SLOTS_PHRASE}, so no background cell can draw it`);
    expect(coverageSummary(cov)).not.toContain('..');   // no span punctuation at all
  });

  it('IS NEUTRAL — a huge footprint reads as a number, never as an alarm', () => {
    // ⚠ THE RULING THIS ROW PINS. Promotion animates a range's tiles wherever
    // the picture uses them; scatter is legal and sometimes intended, and
    // whether 964 cells of stepping sky is the look wanted is the owner's call.
    // A summary that grew a warning word — or a threshold above which its
    // wording changed — would be this surface pre-judging that call.
    const big = blank(64, 64);
    for (let i = 0; i < 964; i++) big[i] = 40;
    const loud = coverageSummary(bandCoverage(big, slotRange(40, 8, 4), 64));
    const quiet = coverageSummary(bandCoverage(
      (() => { const l = blank(64, 64); l[0] = 40; return l; })(), slotRange(40, 8, 4), 64));
    expect(loud).toContain('paints 964 cells');
    // Same sentence SHAPE at 964 cells as at one: the numbers differ, and so
    // does plural agreement — nothing else may.
    const shape = (s: string): string => s.replace(/\d+/g, '#').replace(/cells/g, 'cell');
    expect(shape(loud)).toBe(shape(quiet));
    for (const s of [loud, quiet]) {
      expect(s).not.toMatch(/warn|caution|careful|danger|problem|too many|excessiv|beware|!/i);
      // No hedging or judgement words either — "only", "but", "just" all rank.
      expect(s).not.toMatch(/\b(only|but|just|however)\b/i);
    }
  });

  it('reports undrawn slots as a count, not as a complaint', () => {
    const layout = blank(COLS, ROWS);
    layout[0] = 40;
    const s = coverageSummary(bandCoverage(layout, slotRange(40, 4, 1), COLS));
    expect(s).toContain('3 of 4 slots undrawn');
  });
});

describe('coverageBounds — so the caption can sit beside what it describes', () => {
  const COLS = 8, ROWS = 4;

  it('is the box of the covered cells, and is not transposed', () => {
    const layout = blank(COLS, ROWS);
    layout[1 * COLS + 2] = 40;   // col 2, row 1
    layout[3 * COLS + 6] = 41;   // col 6, row 3
    const cov = bandCoverage(layout, slotRange(40, 2, 1), COLS);
    expect(coverageBounds(cov.cells)).toEqual({ minCol: 2, minRow: 1, maxCol: 6, maxRow: 3 });
  });

  it('is null when nothing is covered — the caption falls back to the corner', () => {
    expect(coverageBounds([])).toBeNull();
  });
});

describe('coverageSubject — WHAT the highlight is, in the author\'s words', () => {
  // ⚠ THE DEFECT THIS FIXES, in the owner's own sentence about the first
  // revision: the wash "read as 'something/information' — just didn't know what
  // it was". The canvas printed `band 0 · slots 0..32` and a cell count, and
  // nothing in that named the WASH. So the sentence must lead with the
  // highlight, not with slot arithmetic.
  it('leads with the highlight and names the band it belongs to', () => {
    const range = slotRange(0, 8, 4);
    const last = lastOwnedSlot(range);
    const s = coverageSubject('band', 2, range);
    // The whole sentence, so this row cannot be satisfied by the candidate
    // sentence or by `coverageSummary` — both of which also print a slot span.
    expect(s).toBe(`highlighted: the cells tile animation 2 animates (slots ${range.base}..${last})`);
    expect(s).not.toContain(`..${last + 1}`);
  });

  it('says what a CANDIDATE would animate, in the conditional', () => {
    const range = slotRange(34, 4, 2);
    const last = lastOwnedSlot(range);
    const s = coverageSubject('candidate', null, range);
    expect(s).toBe(`highlighted: the cells a tile animation at slots ${range.base}..${last} would animate`);
    expect(s).not.toContain(`..${last + 1}`);
    expect(s).not.toContain('band null');
  });

  it('a range of NO SLOTS is said in words — "a band at no slots" is not English', () => {
    // DECIDED, not inherited. Substituting the empty phrase into either
    // sentence breaks it: the candidate reads "a band at no slots would
    // animate", and the band form would claim cells are highlighted while
    // naming none. Both kinds get the honest sentence instead.
    const empty: SlotRange = { base: 34, count: 0 };
    expect(rangeCovers(empty, 34)).toBe(false);   // ANTI-VACUOUS: it really owns nothing
    expect(coverageSubject('band', 2, empty))
      .toBe(`highlighted: nothing; tile animation 2 covers ${NO_SLOTS_PHRASE}`);
    expect(coverageSubject('candidate', null, empty))
      .toBe(`highlighted: nothing; this candidate covers ${NO_SLOTS_PHRASE}`);
    for (const s of [coverageSubject('band', 2, empty), coverageSubject('candidate', null, empty)]) {
      expect(s).not.toContain('..');            // never a backwards `34..33`
      expect(s.startsWith('highlighted:')).toBe(true);
    }
  });

  it('IS NEUTRAL — it names a subject, never a verdict', () => {
    for (const s of [coverageSubject('band', 0, slotRange(0, 8, 4)),
      coverageSubject('candidate', null, slotRange(34, 4, 2))]) {
      expect(s).not.toMatch(/warn|caution|careful|danger|problem|too many|excessiv|beware|!/i);
      expect(s).not.toMatch(/\b(only|but|just|however)\b/i);
    }
  });
});

describe('bandOwningSlot — the walk that must not run off the end', () => {
  // `bandSlotBases` returns bands.length + 1 entries; the tail is where the NEXT
  // band would go. A walk over `bases` instead of over `tileCounts` indexes a
  // count one past the end, compares against NaN, and quietly reports the LAST
  // band's slots as static — which would seed a promotion inside a live band.
  const bands = [band(4, 2), band(2, 2)]; // 8 slots, then 4
  const bases = bandSlotBases(bands);
  const counts = [8, 4];

  it('the fixture really does hand in one more base than band', () => {
    expect(bases).toEqual([0, 8, 12]);
    expect(bases.length).toBe(counts.length + 1);
  });

  it('finds the band that owns each animated slot', () => {
    expect(bandOwningSlot(0, bases, counts)).toBe(0);
    expect(bandOwningSlot(7, bases, counts)).toBe(0);
    expect(bandOwningSlot(8, bases, counts)).toBe(1);
    expect(bandOwningSlot(11, bases, counts)).toBe(1);
  });

  it('the first STATIC slot belongs to no band', () => {
    expect(bandOwningSlot(12, bases, counts)).toBeNull();
    expect(bandOwningSlot(400, bases, counts)).toBeNull();
  });

  it('a document with no bands owns nothing', () => {
    expect(bandOwningSlot(0, bandSlotBases([]), [])).toBeNull();
  });
});

describe('markFromLayoutWord — what a click on one cell means', () => {
  const bands = [band(4, 2)]; // slots 0..7
  const bases = bandSlotBases(bands);
  const counts = [8];
  const FIRST_PROMOTABLE = 8;
  const BLOB = 340;

  it('an ANIMATED index selects that band — the map becomes band navigation', () => {
    expect(markFromLayoutWord(ATTRS | 5, bases, counts, FIRST_PROMOTABLE, BLOB))
      .toEqual({ kind: 'band', index: 0, slot: 5 });
  });

  it('a STATIC index seeds the candidate AT that slot', () => {
    expect(markFromLayoutWord(200, bases, counts, FIRST_PROMOTABLE, BLOB))
      .toEqual({ kind: 'candidate', staticBase: 200, slot: 200 });
  });

  it('a BLANK cell seeds nothing — it is not slot 0', () => {
    // Seeding 0 from a blank cell would mark the first ANIMATED slot from a cell
    // that draws no tile at all.
    expect(markFromLayoutWord(0, bases, counts, FIRST_PROMOTABLE, BLOB)).toEqual({ kind: 'blank' });
  });

  it('a word naming a slot past the end of the blob seeds nothing', () => {
    expect(markFromLayoutWord(BLOB, bases, counts, FIRST_PROMOTABLE, BLOB))
      .toEqual({ kind: 'out-of-blob', slot: BLOB });
    expect(markFromLayoutWord(BLOB - 1, bases, counts, FIRST_PROMOTABLE, BLOB).kind)
      .toBe('candidate');
  });

  it('the seed is clamped to firstPromotableSlot, so it is legal by construction', () => {
    // Defence: band slots are a prefix, so this cannot normally fire. It is here
    // so a seed can never be produced below the promotable floor whatever the
    // caller believes about the document.
    expect(markFromLayoutWord(3, [], [], 8, BLOB))
      .toEqual({ kind: 'candidate', staticBase: 8, slot: 3 });
  });

  it('a document with no bands makes every non-blank cell a candidate', () => {
    expect(markFromLayoutWord(1, bandSlotBases([]), [], 0, BLOB))
      .toEqual({ kind: 'candidate', staticBase: 1, slot: 1 });
  });
});

// ---------------------------------------------------------------------------
// No sentence in this module computes its own range end (item 54's tail)
// ---------------------------------------------------------------------------
//
// The rows above pin what the two readouts SAY. This one sweeps for the SHAPE
// of the defect, so a third sentence added later cannot reintroduce it quietly:
// `..${x + y}` in a display string is a range end computed beside the range
// instead of derived with it, which is how both of these came to name one slot
// too many.

describe('band-coverage prints no slot span of its own', () => {
  // ⚠ COMMENTS STRIPPED FIRST, and this is not tidiness. A whole-file match
  // over a `.ts` is happily satisfied by a COMMENT that quotes the call —
  // including the comments THIS parcel added explaining the fix — so the sweep
  // would go green with both readouts poisoned back to the defect. That exact
  // false green was found by the previous parcel on the panel's `.tsx`. The
  // module carries no URLs (checked: no `://`), so eating `//` to end-of-line
  // takes nothing but comments.
  const src = readFileSync('src/renderer/providers/band-coverage.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the stripped source is still the module', () => {
    // Anti-vacuous: a strip that ate the file would pass every negative below.
    // Structural markers, not a size ratio — most of this file IS comment.
    expect(src).toMatch(/export function coverageSummary/);
    expect(src).toMatch(/export function coverageSubject/);
    expect(src).toMatch(/export function rangeCovers/);
  });

  it('both readouts reach the shared helper, and neither sums a range end inline', () => {
    expect(src.match(/\.\.\$?\{[^}]*\+[^}]*\}/g) ?? []).toEqual([]);
    // ANTI-VACUOUS: the sweep can see real calls, one per readout.
    expect(src.match(/slotSpanPhrase\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('the half-open COVERAGE arithmetic is untouched — only the sentences moved', () => {
    // The scoping rule of this parcel, pinned rather than remembered: the
    // selection maths must stay exclusive. A "fix" that pushed `- 1` into
    // `rangeCovers` or `slotRange` would make every readout right and every
    // painted cell wrong.
    expect(src).toMatch(/slot < range\.base \+ range\.count/);
    expect(src).toMatch(/count: cols \* rows/);
    expect(rangeCovers(slotRange(0, 2, 2), 4)).toBe(false);
    expect(rangeCovers(slotRange(0, 2, 2), 3)).toBe(true);
  });
});
