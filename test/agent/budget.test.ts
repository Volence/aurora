import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { AURORA_DIR } from '../support/peer-repo';
import { canonicalTileHash, computeActBudget } from '../../src/core/agent/budget';
// IMPORTED, NOT RETYPED. This file used to assert `budget.limit` against a
// literal 1024, which made it a SECOND copy of a number whose whole problem was
// having copies: when the constant was corrected to aeon's declared FG pool
// ceiling, this row failed as though the fix were the regression. A test that
// restates the value it is checking cannot witness that value moving; it can
// only object to it. What is worth asserting is that the budget reports THE
// limit it measures against, which is what the line below now says.
import {
  FG_TILE_LIMIT, FG_PAGE_TILES, FG_PAGE_FRAMES, deriveFgPageFrames,
} from '../../src/core/export/vram-coloring';
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
    expect(budget.tiles).toBe(3); // the summed unions, which is what the bound divides
    expect(budget.verdict).toBe('undetermined');
    expect(budget.tileCeiling).toBe(FG_TILE_LIMIT);
    expect(budget.pageTiles).toBe(FG_PAGE_TILES);
    expect(budget.pageFrames).toBe(FG_PAGE_FRAMES);
  });

  it('reports verdict=over when the LOWER BOUND alone exceeds the frame count', () => {
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
    expect(budget.verdict).toBe('over');
    // A refusal is the ONE thing a lower bound can prove, and it proves it on the
    // frame axis, not the tile axis.
    expect(budget.pageFramesAtLeast).toBeGreaterThan(budget.pageFrames);
  });

  // ── THE UNIT ───────────────────────────────────────────────────────────────
  // These rows are the parcel. The reading used to be tiles-out-of-a-ceiling; the
  // quantity that can actually refuse an act is PAGE FRAMES, and a partly-filled
  // page costs a whole one.

  it('charges a whole frame for one tile past a frame boundary', () => {
    // Group 0 carries a reserved blank at slot 0, so painting N distinct tiles
    // into a single section gives a summed union of N+1. Both cases are DERIVED
    // from the page quantum so they stay on the boundary if aeon moves it.
    const budgetForDistinctTiles = (n: number) => {
      const tiles: Tile[] = Array.from({ length: n + 1 }, (_, i) => {
        const p = new Uint8Array(64);
        p[0] = i & 0xF; p[1] = (i >> 4) & 0xF; p[2] = (i >> 8) & 0xF;
        return { pixels: p };
      });
      const sec: Section = createSection(0, 'S0');
      for (let i = 0; i < n; i++) {
        sec.tileGrid.nametable[i] = packNametableWord(i + 1, 1, false, false, false);
      }
      return computeActBudget({ gridWidth: 1, gridHeight: 1, sections: [sec] }, tiles);
    };

    const exactly = budgetForDistinctTiles(FG_PAGE_TILES - 1);
    expect(exactly.tiles).toBe(FG_PAGE_TILES);
    expect(exactly.pageFramesAtLeast).toBe(1);

    const oneOver = budgetForDistinctTiles(FG_PAGE_TILES);
    expect(oneOver.tiles).toBe(FG_PAGE_TILES + 1);
    // FLOOR DIVISION WOULD SAY 1 HERE. One tile past the boundary occupies a
    // second frame, and that frame is spent whether or not it is filled.
    expect(oneOver.pageFramesAtLeast).toBe(2);
  });

  it('always carries the unknowns, and states the bound as a bound', () => {
    const sec: Section = createSection(0, 'S0');
    const budget = computeActBudget(
      { gridWidth: 1, gridHeight: 1, sections: [sec] }, [{ pixels: new Uint8Array(64) }],
    );
    expect(budget.unquantified.length).toBeGreaterThan(0);
    const all = budget.unquantified.join(' ');
    // The three admitted unknowns, each by the word that makes it findable. The
    // double-count caveat in particular is NOT to be quietly dropped: answering
    // the fragmentation question did not make this figure equivalent to aeon's.
    expect(all).toMatch(/LOWER BOUND/);
    expect(all).toMatch(/CONSERVATIVE BY AN UNQUANTIFIED AMOUNT/);
    expect(all).toMatch(/PINNED/);
  });

  it('types no figure into its own prose', () => {
    // ⚠ THE POOL IS EXPECTED TO MOVE. aeon derives its frame count rather than
    // storing it, and the engine lane has an open recommendation to shrink the
    // pool, which moves the count with it and tells this repo nothing. So a
    // number typed into one of these sentences would be wrong in exactly the
    // moment an author read it: the `1024` defect wearing a derivation.
    //
    // ⚠ THIS ROW READS THE SOURCE, NOT THE OUTPUT, AND THE FIRST VERSION OF IT
    // DID NOT. It compared every multi-digit run in the RETURNED strings against
    // the set of derived values, which is vacuous by construction: a hand-typed
    // `12` and an interpolated `${FG_PAGE_FRAMES}` produce the SAME STRING today,
    // so the typed twin passed the check written to forbid it. Planting it proved
    // that (mutation M2 in docs/reviews/2026-09-09-budget-page-unit.md, applied
    // and still green). The two are only distinguishable BEFORE evaluation, so
    // the assertion has to be about the text of the module.
    const src = readFileSync(
      path.join(AURORA_DIR, 'src/core/agent/budget.ts'), 'utf8',
    );
    const body = /function unquantified\([^)]*\): string\[\] \{([\s\S]*?)\n\}/.exec(src);
    expect(
      body !== null,
      'could not find the body of unquantified() in src/core/agent/budget.ts; if it was '
      + 'renamed or reshaped, re-point this extractor rather than deleting the row.',
    ).toBe(true);
    // Strip the interpolations: what is left is what an author reads that was
    // TYPED, and no figure may survive there.
    const typed = (body?.[1] ?? '').replace(/\$\{[^}]*\}/g, '');
    for (const run of typed.match(/\d{2,}/g) ?? []) {
      expect(
        false,
        `check_budget's prose TYPES the number ${run} instead of interpolating it.\n`
        + '  A derived value with a hand-typed twin in the sentence beside it goes stale on '
        + 'the clock that moved the constant, and an author reads the wrong budget with '
        + 'nothing objecting. Interpolate FG_TILE_LIMIT / FG_PAGE_TILES / FG_PAGE_FRAMES.',
      ).toBe(true);
    }
    // Anti-vacuous: the extractor must actually be looking at the prose. If the
    // strip ever ate the whole body, the loop above would have nothing to find.
    expect(typed).toMatch(/LOWER BOUND, NOT A FIGURE/);
    // And the module must really be deriving, so the interpolations are not
    // decoration over constants that have drifted apart.
    expect(FG_PAGE_FRAMES * FG_PAGE_TILES).toBe(FG_TILE_LIMIT);
  });

  it('types no figure into the check_budget TOOL DESCRIPTION either', () => {
    // ⚠ THE REPO'S OWN PROSE GATE CANNOT COVER THIS ONE, AND THAT IS A FINDING,
    // NOT A REASON TO SKIP IT. `scripts/check-prose-constants.mjs` polices
    // author-facing `description:` prose against the constants a module can see,
    // and `description:` IS in its key population, so this surface LOOKS covered.
    // It is not: the gate builds its constant table with `numericInit`, which
    // folds a numeric literal or `constant('X')` and nothing else. FG_PAGE_FRAMES
    // is declared as a CALL (`deriveFgPageFrames(...)`), so it is absent from
    // that table and a hand-typed twin of it matches no constant and is never
    // flagged. Planted and measured, 2026-09-09: typing `12` over
    // `${FG_PAGE_FRAMES}` in the description below leaves check-prose-constants
    // printing "0 re-typed in author-facing prose", rc 0 (mutation M2b in
    // docs/reviews/2026-09-09-budget-page-unit.md).
    //
    // THE GENERAL SHAPE IS WORSE THAN THIS ONE SITE: the constants the gate
    // cannot fold are the DERIVED ones, and a derived constant is precisely the
    // kind whose value moves. Widening `numericInit` is a separate parcel with a
    // 523-file blast radius; this row covers the surface this parcel ships.
    const src = readFileSync(
      path.join(AURORA_DIR, 'src/main/editor-methods.ts'), 'utf8',
    );
    const m = /name: 'check_budget'[\s\S]*?description: ([\s\S]*?)\},\n/.exec(src);
    expect(
      m !== null,
      "could not find check_budget's description in src/main/editor-methods.ts; if the "
      + 'method table was reshaped, re-point this extractor rather than deleting the row.',
    ).toBe(true);
    const typed = (m?.[1] ?? '').replace(/\$\{[^}]*\}/g, '');
    for (const run of typed.match(/\d{2,}/g) ?? []) {
      expect(
        false,
        `check_budget's tool description TYPES the number ${run} instead of interpolating it.\n`
        + '  This description is the ONLY place an agent learns its budget before it spends '
        + 'the pool, and the pool is expected to move. Interpolate FG_TILE_LIMIT / '
        + 'FG_PAGE_TILES / FG_PAGE_FRAMES.',
      ).toBe(true);
    }
    // Anti-vacuous: the extractor must be looking at the real sentence.
    expect(typed).toMatch(/PAGE FRAMES/);
    expect(typed).toMatch(/LOWER BOUND/);
  });

  it('offers no `fits`, because Aurora cannot say an act fits', () => {
    const sec: Section = createSection(0, 'S0');
    const budget = computeActBudget(
      { gridWidth: 1, gridHeight: 1, sections: [sec] }, [{ pixels: new Uint8Array(64) }],
    );
    // The packed page count is decided at bake time in aeon's tooling. A boolean
    // that answers "does it fit" cannot be told apart from a materially different
    // outcome, which is the whole defect this parcel corrects; the honest reply
    // is a refusal or a shrug.
    expect(Object.prototype.hasOwnProperty.call(budget, 'fits')).toBe(false);
    expect(['over', 'undetermined']).toContain(budget.verdict);
  });
});

describe('deriveFgPageFrames', () => {
  it('derives the frame count the way aeon does', () => {
    expect(deriveFgPageFrames(FG_TILE_LIMIT, FG_PAGE_TILES)).toBe(FG_PAGE_FRAMES);
    // aeon's own comptime guard, mirrored: PAGE_FRAMES * ART_POOL_PAGE_TILES
    // must tile the FG art window exactly.
    expect(FG_PAGE_FRAMES * FG_PAGE_TILES).toBe(FG_TILE_LIMIT);
  });

  it('REFUSES an inexact split rather than rounding it', () => {
    // A ceiling that does not divide would otherwise yield a fractional frame
    // count, and every reading built on it would go quietly wrong. aeon makes
    // this build-fatal; the least this copy can do is throw.
    expect(() => deriveFgPageFrames(FG_TILE_LIMIT - 1, FG_PAGE_TILES))
      .toThrow(/does not divide into whole/);
    expect(() => deriveFgPageFrames(FG_TILE_LIMIT, 0)).toThrow(/positive integers/);
  });
});
