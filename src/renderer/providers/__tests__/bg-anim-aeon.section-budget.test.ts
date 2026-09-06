import { describe, it, expect } from 'vitest';
import {
  bandBudget,
  insertUnavailableReason,
  promoteUnavailableReason,
  sectionShapeMoveNote,
  sectionShapePhrase,
} from '../bg-anim-aeon';
import { documentBands } from '../../../core/formats/bg-override/bg-anim-band';
import {
  BGANIM_SECTION_CEILING,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BGANIM_PHASE_BANKS,
  bganimViewTwinBytes,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';

/**
 * THE PANEL'S READ MODEL, ONCE THERE ARE TWO BUDGETS.
 *
 * `bandBudget` used to answer one question — how much of the TILE BLOB is left —
 * and the panel printed that number beside the controls that spend it. On aeon's
 * own shipped document that number is roughly five times the number of animated
 * slots the ROM section will actually take, so the panel was OFFERING an author
 * work the build refuses. The rows here are about the second budget arriving
 * beside the first, and about the direction of every fallback.
 *
 * ⚠ THE DIRECTION IS THE WHOLE THING. A budget that cannot be computed must
 * collapse to ZERO and say so, never to the looser tile figure. That mistake,
 * made here, would reproduce the defect one layer down and be invisible: the
 * panel would look correct and the number would be wrong only on the documents
 * where it mattered. `slotsRemaining` is the field that carries the rule and
 * the last block is the one that pins it.
 *
 * NOTHING BELOW TYPES A NUMBER. Every expectation re-derives aeon's formula from
 * the vendored constants.
 */

function tile(fill: number): number[] {
  return Array.from({ length: TILE_PIXELS }, () => fill % (TILE_PIXEL_MAX + 1));
}

function band(blob: number[][], slotBase: number, cols: number, rows: number,
              extra: Partial<BgOverrideBand> = {}): BgOverrideBand {
  const n = cols * rows;
  const rest = blob.slice(slotBase, slotBase + n);
  return {
    cols,
    rows,
    pattern_px: cols * TILE_WIDTH_PX,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, p) =>
      p === 0 ? rest.map(t => [...t]) : rest.map(t => t.map(v => (v + p) % (TILE_PIXEL_MAX + 1)))),
    ...extra,
  } as BgOverrideBand;
}

function docOf(tileCount: number, bands: (blob: number[][]) => BgOverrideBand[]):
BgOverrideDocument {
  const blob = Array.from({ length: tileCount }, (_, i) => tile(i + 1));
  return {
    layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0),
    tiles: blob,
    anims: bands(blob),
  };
}

function slotsAllowed(bands: number, views: number): number {
  const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * bands;
  return Math.floor((BGANIM_SECTION_CEILING - table - views * table) / BGANIM_BYTES_PER_SLOT);
}

/**
 * THE SHAPE AEON SHIPS, rebuilt from the contract rather than from that file.
 *
 * One tile animation, `cols` chosen so its pattern period is the one the debug
 * view twins were derived against, `default_off` set, and no static art beyond
 * the animation's own slots. That is aeon's live document's ANIMATION shape; its
 * static half is larger, which only widens the gap the rows below assert.
 */
function aeonLikeDoc(): BgOverrideDocument {
  const cols = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;
  const rows = 4;
  return docOf(cols * rows, (blob) => [band(blob, 0, cols, rows, {
    default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX,
  })]);
}

describe('bandBudget: the second budget, beside the first', () => {
  it('reports the section size aeon would emit, and the ceiling it is measured against', () => {
    const doc = aeonLikeDoc();
    const b = bandBudget(doc);
    const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * b.bands;
    expect(b.sectionCeiling).toBe(BGANIM_SECTION_CEILING);
    expect(b.sectionBytes).toBe(
      table + BGANIM_VIEW_COUNT * table + b.animatedSlots * BGANIM_BYTES_PER_SLOT);
  });

  it('ON THE SHIPPED SHAPE, THE BYTE BUDGET BINDS AND THE TILE BUDGET DOES NOT', () => {
    // The finding, as a relation. The tile readout is the number the panel used
    // to print alone; the byte readout is the number an author may actually
    // spend, and it is the smaller one by a wide margin.
    const b = bandBudget(aeonLikeDoc());
    expect(b.byteSlotsRemaining)
      .toBe(slotsAllowed(1, BGANIM_VIEW_COUNT) - b.animatedSlots);
    expect(b.byteSlotsRemaining).not.toBeNull();
    expect(b.byteSlotsRemaining!).toBeLessThan(b.tileSlotsRemaining);
    expect(b.binding).toBe('bytes');
    expect(b.slotsRemaining).toBe(b.byteSlotsRemaining);
    expect(b.unmeasurable).toBeNull();
  });

  it('names the TILE budget when that is the tighter one', () => {
    // A blob filled to the capacity has no free tile slots at all, and a small
    // animation leaves the section plenty of room. The binding answer must
    // follow the document, not a fixed opinion about which ceiling matters.
    const doc = docOf(BG_TILE_CAPACITY, (blob) => [band(blob, 0, 2, 1)]);
    const b = bandBudget(doc);
    expect(b.tileSlotsRemaining).toBe(0);
    expect(b.byteSlotsRemaining!).toBeGreaterThan(0);
    expect(b.binding).toBe('tiles');
    expect(b.slotsRemaining).toBe(0);
  });

  it('a document with no bands still sizes the stub rather than answering null', () => {
    const doc = docOf(4, () => []);
    delete (doc as Record<string, unknown>).anims;
    expect(bandBudget(doc).sectionBytes).toBe(BGANIM_COUNT_BYTES);
  });
});

describe('the refusals name WHICH budget is binding', () => {
  it('insert: refuses a band the blob would take but the section will not', () => {
    // Room in the blob by construction: the document is nearly empty.
    const doc = docOf(4, (blob) => [band(blob, 0, 2, 1)]);
    const budget = bandBudget(doc);
    const over = slotsAllowed(2, 0) + 1 - budget.animatedSlots;
    expect(over).toBeLessThanOrEqual(budget.tileSlotsRemaining);   // anti-vacuous
    const why = insertUnavailableReason(doc, over, 1);
    expect(why).not.toBeNull();
    expect(why!).toContain('ROM SECTION');
    expect(why!).toContain(String(BGANIM_BYTES_PER_SLOT));
    expect(why!).toContain('SECOND budget');
  });

  it('insert: still allowed at the largest band the section admits', () => {
    const doc = docOf(4, (blob) => [band(blob, 0, 2, 1)]);
    const budget = bandBudget(doc);
    const fits = slotsAllowed(2, 0) - budget.animatedSlots;
    expect(insertUnavailableReason(doc, fits, 1)).toBeNull();
  });

  it('promote: refuses too, because a promoted slot becomes an ANIMATED one', () => {
    // "Promotion does not grow the blob" is true and was read as "promotion is
    // free". It is the door that spends the byte budget fastest: the tile count
    // does not move at all while the section grows by a whole band.
    const doc = docOf(BG_TILE_CAPACITY, (blob) => [band(blob, 0, 2, 1)]);
    const budget = bandBudget(doc);
    const over = slotsAllowed(2, 0) + 1 - budget.animatedSlots;
    const why = promoteUnavailableReason(doc, over, 1);
    expect(why).not.toBeNull();
    expect(why!).toContain('ROM section');
    expect(promoteUnavailableReason(doc, 2, 1)).toBeNull();        // anti-vacuous
  });

  /**
   * ⚠ INVERTED BY aeon's DECOUPLE. This row asserted that inserting into a
   * `default_off` act reported aeon's rule rather than a byte count, because the
   * build refused such an act outright. It does not any more (aeon `364b7bce`),
   * so the honest answer IS the arithmetic — and the door is open.
   *
   * ANTI-VACUOUS BOTH WAYS: the small insert is allowed and an oversized one is
   * still refused BY THE BYTE BUDGET, so a `insertUnavailableReason` that had
   * stopped answering could not pass.
   */
  it('insert into a default_off act is ALLOWED, and answers with the byte budget when it is not', () => {
    const doc = aeonLikeDoc();
    expect(insertUnavailableReason(doc, 1, 1)).toBeNull();
    const budget = bandBudget(doc);
    const over = budget.slotsRemaining + 1;
    const why = insertUnavailableReason(doc, over, 1);
    expect(why).not.toBeNull();
    expect(why!).not.toContain('EXACTLY ONE');
  });
});

describe('⚠ UNMEASURABLE COLLAPSES TO ZERO, NEVER TO THE LOOSER BUDGET', () => {
  /**
   * Two bands, both `default_off` — the act aeon used to refuse outright.
   *
   * ⚠ IT IS NO LONGER REFUSED, AND THE RULE THIS DESCRIBE HOLDS IS UNCHANGED.
   * `viewsEmitted` was the only producer of an unmeasurable section, so since
   * aeon's decouple the only document without a size is NO DOCUMENT. The
   * direction — unmeasurable collapses to ZERO, never to the looser tile figure —
   * is still the rule and is still the defect the section-ceiling parcel landed
   * against; there is simply nothing left in a document that can trigger it. The
   * two rows that used to drive this fixture now assert the opposite, and the
   * no-document row below is what still holds the direction itself.
   */
  function onceRefusedDoc(): BgOverrideDocument {
    const cols = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;
    return docOf(cols * 2, (blob) => [
      band(blob, 0, cols, 1, { default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX }),
      band(blob, cols, cols, 1, { default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX }),
    ]);
  }

  it('the once-refused act now has a size, a budget and a binding', () => {
    const b = bandBudget(onceRefusedDoc());
    expect(b.sectionBytes).not.toBeNull();
    expect(b.byteSlotsRemaining).not.toBeNull();
    expect(b.binding).not.toBe('unmeasurable');
    expect(b.unmeasurable).toBeNull();
    expect(b.slotsRemaining).toBeGreaterThan(0);
  });

  it('and its figure is the NO-TWINS one, which is the quantifier still being right', () => {
    const b = bandBudget(onceRefusedDoc());
    // A per-key validator ("do the bands agree?") would predict twins here and
    // read high by their cost. Derived from the same operands the codec uses.
    expect(b.twinsEmitted).toBe(false);
    expect(b.viewTwinBytes).toBe(0);
    const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * b.bands;
    expect(b.sectionBytes).toBe(table + b.animatedSlots * BGANIM_BYTES_PER_SLOT);
  });

  it('with no document at all, the same direction holds', () => {
    const b = bandBudget(null);
    expect(b.slotsRemaining).toBe(0);
    expect(b.binding).toBe('unmeasurable');
    expect(b.unmeasurable).not.toBeNull();
  });
});

// ── THE SHAPE THE FIGURE IS FOR, ON THE TWO REFUSALS ───────────────────────

/**
 * ⚠ THE DISCRIMINATING CASE IS A SHAPE CHANGE, NOT A BIG DOCUMENT.
 *
 * `4a565908` put "in the debug shape" / "in every ROM shape" on the panel's
 * READOUT and left the two refusals bare. On this surface that omission is
 * worse than it was on the readout, because ADDING A BAND CAN MOVE THE ACT
 * BETWEEN SHAPES: the debug view twins are emitted only for a single-band act
 * at the derived period, so the second tile animation drops them. The refusal
 * then prints an after-figure that is not commensurable with the before-figure
 * on screen above it — they differ by the twins as well as by the slots — and an
 * author who subtracts the two gets a per-slot cost the same sentence just told
 * them was something else.
 *
 * A REFUSAL ON AN ACT WHOSE SHAPE DOES NOT MOVE PROVES NOTHING ABOUT THIS, and
 * the `describe`s above are full of those. Every row here is built on the act
 * where the shape MOVES, with a same-shape control at the end.
 *
 * NOTHING BELOW TYPES A NUMBER: both figures are re-derived from the vendored
 * constants on aeon's own formula, never read back from the code under test.
 */
describe('the refusals say WHICH SHAPE their byte figure is for', () => {
  const PERIOD_COLS = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;

  /** `table` for an act of `bands` tile animations — aeon's formula, once. */
  function tableBytes(bands: number): number {
    return BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * bands;
  }

  /**
   * THE ACT WHERE THE SHAPE MOVES: aeon's shipped shape (one silenced tile
   * animation at the derived period, so the twins ARE emitted), sized so that
   * ONE MORE tile animation overruns the byte ceiling.
   *
   * `rows` is derived, not chosen: the largest doubling that still leaves the
   * two-band act room for at least one more slot, so the insert below is a real
   * band rather than a number picked to make a sentence appear.
   */
  function twinShapedDoc(): BgOverrideDocument {
    let rows = 1;
    while (PERIOD_COLS * rows * 2 <= slotsAllowed(2, 0)) rows *= 2;
    return docOf(PERIOD_COLS * rows, (blob) => [band(blob, 0, PERIOD_COLS, rows, {
      default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX,
    })]);
  }

  /** The act with no twins in either shape, for the control row. */
  function plainDoc(): BgOverrideDocument {
    return docOf(4, (blob) => [band(blob, 0, 2, 1)]);
  }

  it('the fixture really is a SHAPE CHANGE, and the doors really do overrun', () => {
    // The row that makes every row below non-vacuous. Twins today, none after.
    const doc = twinShapedDoc();
    const b = bandBudget(doc);
    expect(b.bands).toBe(1);
    expect(b.twinsEmitted).toBe(true);
    expect(b.viewTwinBytes).toBe(BGANIM_VIEW_COUNT * tableBytes(1));
    const over = slotsAllowed(2, 0) + 1 - b.animatedSlots;
    expect(over).toBeGreaterThan(0);
    // The BLOB has room, so an insert reaches the section check rather than
    // being turned away one budget earlier.
    expect(over).toBeLessThanOrEqual(b.tileSlotsRemaining);
    expect(bganimViewTwinBytes([...documentBands(doc), { cols: over, rows: 1 }])).toBe(0);
  });

  it('INSERT: names the after shape, and says the shape MOVED', () => {
    const doc = twinShapedDoc();
    const b = bandBudget(doc);
    const over = slotsAllowed(2, 0) + 1 - b.animatedSlots;
    const why = insertUnavailableReason(doc, over, 1);
    expect(why).not.toBeNull();

    // Both figures on aeon's formula, derived here rather than read back.
    const beforeBytes = tableBytes(1) + BGANIM_VIEW_COUNT * tableBytes(1)
      + b.animatedSlots * BGANIM_BYTES_PER_SLOT;
    const afterBytes = tableBytes(2) + (b.animatedSlots + over) * BGANIM_BYTES_PER_SLOT;
    const twins = BGANIM_VIEW_COUNT * tableBytes(1);
    expect(b.sectionBytes).toBe(beforeBytes);       // the figure on screen above

    // 1. The after figure carries its shape, in the readout's own words.
    expect(why!).toContain(
      `would take it to ${afterBytes} of ${BGANIM_SECTION_CEILING} bytes, in every ROM shape.`);
    // 2. The shape MOVED, named against the current figure and the twins' cost.
    expect(why!).toContain(
      `DIFFERENT SHAPE from the act's current ${beforeBytes} bytes in the debug shape:`);
    expect(why!).toContain(
      `${twins} bytes of debug view twins are emitted in one of the two shapes and not the other`);
    // 3. AND THE REASON THE SENTENCE IS OWED, as arithmetic: the two figures do
    //    NOT differ by the slots the same sentence prices.
    expect(afterBytes - beforeBytes).not.toBe(over * BGANIM_BYTES_PER_SLOT);
    expect(afterBytes - beforeBytes)
      .toBe(over * BGANIM_BYTES_PER_SLOT + BGANIM_RECORD_BYTES - twins);
  });

  it('PROMOTE: the same two facts, in the other door\'s words', () => {
    const doc = twinShapedDoc();
    const b = bandBudget(doc);
    const over = slotsAllowed(2, 0) + 1 - b.animatedSlots;
    const why = promoteUnavailableReason(doc, over, 1);
    expect(why).not.toBeNull();
    const beforeBytes = tableBytes(1) + BGANIM_VIEW_COUNT * tableBytes(1)
      + b.animatedSlots * BGANIM_BYTES_PER_SLOT;
    const afterBytes = tableBytes(2) + (b.animatedSlots + over) * BGANIM_BYTES_PER_SLOT;
    expect(why!).toContain(
      `animation section to ${afterBytes} of ${BGANIM_SECTION_CEILING} bytes, in every ROM shape.`);
    expect(why!).toContain(
      `DIFFERENT SHAPE from the act's current ${beforeBytes} bytes in the debug shape:`);
    // Anti-vacuous: promotion is still ALLOWED at a size that fits.
    expect(promoteUnavailableReason(doc, 1, 1)).toBeNull();
  });

  /**
   * ⚠ THE CONTROL, AND IT IS THE HALF THAT KEEPS THE COPY HONEST. A refusal on
   * an act whose shape does NOT move must still name its shape — the ruling is
   * "say which shape any figure is for", unconditionally — and must NOT carry
   * the shape-moved sentence, which would be a caveat in front of a control that
   * is not true of it.
   */
  it('CONTROL: an act whose shape does not move names the shape and adds nothing else', () => {
    const doc = plainDoc();
    const b = bandBudget(doc);
    expect(b.twinsEmitted).toBe(false);            // no twins before...
    const over = slotsAllowed(2, 0) + 1 - b.animatedSlots;
    const why = insertUnavailableReason(doc, over, 1);
    expect(why).not.toBeNull();
    expect(bganimViewTwinBytes([...documentBands(doc), { cols: over, rows: 1 }])).toBe(0);
    const afterBytes = tableBytes(2) + (b.animatedSlots + over) * BGANIM_BYTES_PER_SLOT;
    expect(why!).toContain(
      `would take it to ${afterBytes} of ${BGANIM_SECTION_CEILING} bytes, in every ROM shape.`);
    expect(why!).not.toContain('DIFFERENT SHAPE');
    expect(why!).not.toContain('debug view twins');
    // Here the naive subtraction IS right, which is why no sentence is owed.
    expect(afterBytes - b.sectionBytes!)
      .toBe(over * BGANIM_BYTES_PER_SLOT + BGANIM_RECORD_BYTES);
  });

  /**
   * ⚠ THE BRIEF FOR THIS PARCEL SAID THE AFTER FIGURE "CAN MOVE IN THE OPPOSITE
   * DIRECTION FROM WHAT ADDING IMPLIES". IT CANNOT, and this row says so rather
   * than leaving a plausible sentence uncontradicted.
   *
   * Through these two doors the twins can only be LOST — gaining them would need
   * the act to arrive at exactly ONE band carrying `default_off`, and neither
   * door writes that key onto the band it appends. So the worst case is the one
   * built here: the largest possible twin loss against the SMALLEST possible
   * band. Even then the figure RISES, because one slot outweighs the twins.
   */
  it('the after figure never falls: the smallest band still outweighs the twins lost', () => {
    const doc = twinShapedDoc();
    const b = bandBudget(doc);
    const smallest = tableBytes(2) + (b.animatedSlots + 1) * BGANIM_BYTES_PER_SLOT;
    const beforeBytes = tableBytes(1) + BGANIM_VIEW_COUNT * tableBytes(1)
      + b.animatedSlots * BGANIM_BYTES_PER_SLOT;
    expect(smallest).toBeGreaterThan(beforeBytes);
    // The margin, so a contract change that inverted it would fail LOUDLY here
    // rather than quietly making the claim above false.
    expect(smallest - beforeBytes).toBe(
      BGANIM_BYTES_PER_SLOT + BGANIM_RECORD_BYTES - BGANIM_VIEW_COUNT * tableBytes(1));
  });

  it('the shape phrase is derived from the act, and the note is empty when it holds still', () => {
    expect(sectionShapePhrase(documentBands(twinShapedDoc()))).toBe('in the debug shape');
    expect(sectionShapePhrase(documentBands(plainDoc()))).toBe('in every ROM shape');
    // EMPTY when the shape holds still — that is what keeps the unconditional
    // label from becoming a wall of caveats.
    const same = documentBands(plainDoc());
    expect(sectionShapeMoveNote(same, [...same, { cols: 1, rows: 1 }])).toBe('');
    const moves = documentBands(twinShapedDoc());
    expect(sectionShapeMoveNote(moves, [...moves, { cols: 1, rows: 1 }])).not.toBe('');
  });
});
