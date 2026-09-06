import { describe, it, expect } from 'vitest';
import {
  bandBudget,
  insertUnavailableReason,
  promoteUnavailableReason,
} from '../bg-anim-aeon';
import {
  BGANIM_SECTION_CEILING,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BGANIM_PHASE_BANKS,
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

  it('insert into a default_off act reports the BUILD\'s refusal, not a byte count', () => {
    // Adding a second tile animation to a default-off act is refused outright
    // (the twins are emitted only for a single-band act), so the honest answer
    // is aeon's rule rather than an arithmetic that does not apply.
    const why = insertUnavailableReason(aeonLikeDoc(), 1, 1);
    expect(why).not.toBeNull();
    expect(why!).toContain('EXACTLY ONE');
  });
});

describe('⚠ UNMEASURABLE COLLAPSES TO ZERO, NEVER TO THE LOOSER BUDGET', () => {
  /** Two bands, both `default_off`: aeon refuses, so the section has no size. */
  function refusedDoc(): BgOverrideDocument {
    const cols = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;
    return docOf(cols * 2, (blob) => [
      band(blob, 0, cols, 1, { default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX }),
      band(blob, cols, cols, 1, { default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX }),
    ]);
  }

  it('answers null for the section, zero for the budget, and says why', () => {
    const b = bandBudget(refusedDoc());
    expect(b.sectionBytes).toBeNull();
    expect(b.byteSlotsRemaining).toBeNull();
    expect(b.binding).toBe('unmeasurable');
    expect(b.slotsRemaining).toBe(0);
    expect(b.unmeasurable).toContain('EXACTLY ONE');
  });

  it('and the tile budget it did NOT fall back to is large, which is the point', () => {
    // Anti-vacuous. If `tileSlotsRemaining` happened to be 0 here, the row above
    // would pass under the permissive implementation too and prove nothing.
    const b = bandBudget(refusedDoc());
    expect(b.tileSlotsRemaining).toBeGreaterThan(0);
    expect(b.slotsRemaining).not.toBe(b.tileSlotsRemaining);
  });

  it('with no document at all, the same direction holds', () => {
    const b = bandBudget(null);
    expect(b.slotsRemaining).toBe(0);
    expect(b.binding).toBe('unmeasurable');
    expect(b.unmeasurable).not.toBeNull();
  });
});
