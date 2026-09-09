import { describe, it, expect } from 'vitest';
import { canonicalTileHash, computeActBudget } from '../../src/core/agent/budget';
// IMPORTED, NOT RETYPED. This file used to assert `budget.limit` against a
// literal 1024, which made it a SECOND copy of a number whose whole problem was
// having copies: when the constant was corrected to aeon's declared FG pool
// ceiling, this row failed as though the fix were the regression. A test that
// restates the value it is checking cannot witness that value moving; it can
// only object to it. What is worth asserting is that the budget reports THE
// limit it measures against, which is what the line below now says.
import { FG_TILE_LIMIT } from '../../src/core/export/vram-coloring';
import { packNametableWord, createSection } from '../../src/core/model/s4-types';
import type { Tile, Section } from '../../src/core/model/s4-types';

function tileFromRows(rows: number[][]): Tile {
  const pixels = new Uint8Array(64);
  rows.forEach((row, r) => row.forEach((v, c) => { pixels[r * 8 + c] = v; }));
  return { pixels };
}

describe('canonicalTileHash', () => {
  it('gives flips of the same tile the same hash', () => {
    const base = tileFromRows([[1, 2, 3, 4, 5, 6, 7, 8]]);
    const hflip = tileFromRows([[8, 7, 6, 5, 4, 3, 2, 1]]);
    expect(canonicalTileHash(hflip.pixels)).toBe(canonicalTileHash(base.pixels));
  });
  it('distinguishes genuinely different tiles', () => {
    const a = tileFromRows([[1, 1, 1, 1, 1, 1, 1, 1]]);
    const b = tileFromRows([[2, 2, 2, 2, 2, 2, 2, 2]]);
    expect(canonicalTileHash(a.pixels)).not.toBe(canonicalTileHash(b.pixels));
  });
});

describe('computeActBudget', () => {
  it('counts flip-aware unique tiles per section and per color group', () => {
    const tiles: Tile[] = [
      { pixels: new Uint8Array(64) },                 // 0: blank
      tileFromRows([[1, 2, 3, 4, 5, 6, 7, 8]]),       // 1
      tileFromRows([[8, 7, 6, 5, 4, 3, 2, 1]]),       // 2: hflip of 1
      tileFromRows([[9, 9, 0, 0, 0, 0, 0, 0]]),       // 3
    ];
    const sec0: Section = createSection(0, 'S0');
    sec0.tileGrid.nametable[0] = packNametableWord(1, 1, false, false, false);
    sec0.tileGrid.nametable[1] = packNametableWord(2, 1, false, false, false); // dup of 1
    const sec1: Section = createSection(1, 'S1');
    sec1.tileGrid.nametable[0] = packNametableWord(3, 1, false, false, false);

    const budget = computeActBudget(
      { gridWidth: 2, gridHeight: 1, sections: [sec0, sec1] },
      tiles,
    );
    expect(budget.perSection[0].uniqueTiles).toBe(1); // tiles 1+2 are one canonical
    expect(budget.perSection[1].uniqueTiles).toBe(1);
    expect(budget.groups.length).toBe(2);
    expect(budget.groups[0].unionTiles).toBe(2); // reserved blank + 1 painted canonical
    expect(budget.groups[1].unionTiles).toBe(1);
    expect(budget.groups[0].baseSlot).toBe(0);
    expect(budget.groups[1].baseSlot).toBe(2); // cumulative after group 0
    expect(budget.fits).toBe(true);
    expect(budget.limit).toBe(FG_TILE_LIMIT);
  });

  it('reports fits=false when unions exceed the FG pool', () => {
    // ONE TILE OVER THE LIMIT, DERIVED FROM IT. A fixed 1025 was one over the
    // old literal and is now 257 over, which would still go red while having
    // stopped testing the boundary it was written for. Deriving keeps this row
    // one tile past whatever the pool ceiling currently is.
    const over = FG_TILE_LIMIT + 1;
    const tiles: Tile[] = Array.from({ length: over + 1 }, (_, i) => {
      const p = new Uint8Array(64);
      p[0] = i & 0xF; p[1] = (i >> 4) & 0xF; p[2] = (i >> 8) & 0xF;
      return { pixels: p };
    });
    const sec: Section = createSection(0, 'S0');
    for (let i = 0; i < over; i++) {
      sec.tileGrid.nametable[i] = packNametableWord(i + 1, 1, false, false, false);
    }
    const budget = computeActBudget({ gridWidth: 1, gridHeight: 1, sections: [sec] }, tiles);
    expect(budget.fits).toBe(false);
  });
});
