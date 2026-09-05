import { describe, it, expect } from 'vitest';
import { shapeTileBudget, budgetReadout } from '../use-canvas-constraints';

describe('shapeTileBudget', () => {
  it('is act-less when no classic level is open', () => {
    expect(shapeTileBudget({ ref: null, poolTileCount: 0, freeSlots: 0 }))
      .toEqual({ act: null, freeSlots: null, poolUsed: null, poolTotal: null });
  });

  it('reports the open act, its free slots and its pool', () => {
    expect(shapeTileBudget({ ref: { zone: 'GHZ', act: 1 }, poolTileCount: 256, freeSlots: 17 }))
      .toEqual({ act: { zone: 'GHZ', act: 1 }, freeSlots: 17, poolUsed: 239, poolTotal: 256 });
  });

  it('survives a zone at its limit: zero free is a number, not a missing one', () => {
    expect(shapeTileBudget({ ref: { zone: 'LZ', act: 1 }, poolTileCount: 256, freeSlots: 0 }))
      .toMatchObject({ freeSlots: 0, poolUsed: 256 });
  });
});

describe('budgetReadout', () => {
  const tiles = { unique: 37, fullCells: 64, pixelsOutsideGrid: 0 };
  const noAct = { act: null, freeSlots: null, poolUsed: null, poolTotal: null };

  it('shows the bare count with no act open', () => {
    expect(budgetReadout(tiles, noAct)).toBe('tiles 37 unique');
  });

  it('names the act it is measuring against', () => {
    expect(budgetReadout(tiles, {
      act: { zone: 'GHZ', act: 1 }, freeSlots: 17, poolUsed: 239, poolTotal: 256,
    })).toBe('tiles 37 unique · 17 free in GHZ 1 · pool 239/256');
  });

  // The store holds the project's internal slug, lowercase. CDP caught the
  // readout printing it raw — "free in ghz 1" on the same status bar as "Green
  // Hill Zone Act 1". Every fixture above hands it an already-uppercase zone,
  // which is why no unit test noticed.
  it('uppercases the zone slug the store actually holds', () => {
    expect(budgetReadout(tiles, {
      act: { zone: 'ghz', act: 1 }, freeSlots: 17, poolUsed: 239, poolTotal: 256,
    })).toBe('tiles 37 unique · 17 free in GHZ 1 · pool 239/256');
  });

  // The unaligned band is reported, never folded into the tile count — a
  // rounded number here is budget the artist does not have.
  it('reports pixels the grid cannot turn into tiles', () => {
    expect(budgetReadout({ unique: 4, fullCells: 4, pixelsOutsideGrid: 96 }, noAct))
      .toBe('tiles 4 unique · 96px outside the grid');
  });

  // It states two numbers and does NOT compare them. Committing matches against
  // the pool first (spec §4.4 step 3), so the slots actually claimed can be far
  // fewer than the unique count — rendering "37 > 17, this will not fit" would
  // assert something 2C has not computed.
  it('does not editorialise when the count exceeds the free slots', () => {
    const out = budgetReadout(tiles, {
      act: { zone: 'LZ', act: 1 }, freeSlots: 0, poolUsed: 256, poolTotal: 256,
    });
    expect(out).toBe('tiles 37 unique · 0 free in LZ 1 · pool 256/256');
    expect(out).not.toMatch(/won't|will not|too many|exceed|over/i);
  });
});
