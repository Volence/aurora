import { describe, it, expect } from 'vitest';
import { countFreeTileSlots } from '../free-tile-slots';

/** Minimal stand-in for UsageIndex — the count only ever asks for `.cells`. */
const usageOf = (used: number[]) => ({
  tileUsage: (t: number) => ({ cells: used.includes(t) ? 1 : 0 }),
});

describe('countFreeTileSlots', () => {
  it('counts unreferenced, unreserved, editable slots', () => {
    expect(countFreeTileSlots({
      poolTileCount: 5, usage: usageOf([1]), reserved: null, isEditable: () => true,
    })).toBe(3); // 2, 3, 4 — tile 1 is used, tile 0 never counts
  });

  // Tile 0 is the transparent tile. Claiming it would punch holes in every
  // block that leans on it, everywhere in the zone at once.
  it('never counts tile 0, even when nothing references it', () => {
    expect(countFreeTileSlots({
      poolTileCount: 1, usage: usageOf([]), reserved: null, isEditable: () => true,
    })).toBe(0);
  });

  it('excludes object-reserved tiles', () => {
    expect(countFreeTileSlots({
      poolTileCount: 4, usage: usageOf([]), reserved: new Set([2]), isEditable: () => true,
    })).toBe(2); // 1 and 3
  });

  it('excludes tiles outside the editable range', () => {
    expect(countFreeTileSlots({
      poolTileCount: 4, usage: usageOf([]), reserved: null, isEditable: (t) => t < 2,
    })).toBe(1); // 1 only
  });

  it('is zero for a pool with no spare slots at all — the Labyrinth case', () => {
    expect(countFreeTileSlots({
      poolTileCount: 3, usage: usageOf([1, 2]), reserved: null, isEditable: () => true,
    })).toBe(0);
  });
});
