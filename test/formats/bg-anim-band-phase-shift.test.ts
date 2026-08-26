/**
 * ROADMAP item 29 — `phaseFill: 'shift'`: banks 1..7 as PRE-SHIFTED PHASES, so
 * a saved band visibly moves.
 *
 * WHAT THE CONTRACT SAYS AND WHAT IT DOES NOT. The vendored consumer contract
 * calls `phases` "pre-shifted art 1px apart, selected by `step & 7`"
 * (bganim-consumer-contract.json, BGANIM_PHASE_BANKS.why) — that fixes the
 * 1px-per-bank granularity and the bank count, but not the DIRECTION. The
 * direction is derived from the two aeon sources the contract cites, which must
 * agree with each other or fine and coarse would tear at every 8th step:
 *
 *   • engine/level/bg_anim.emp (the runtime's coarse half): the two-piece bank
 *     DMA copies art from `bank + shift_bytes` to the band's BASE slot and
 *     wraps columns 0..coarse-1 behind it, so at coarse step c, band slot
 *     column j holds ART column (j + c) mod cols — on-screen pixel x draws art
 *     pixel x + 8c.
 *   • tools/forest_bg_gen.py (the generator of the only shifted banks that ever
 *     shipped): `pat_pixel(v, y, ph)` samples `trunk_pixel((v + ph) % PAT_W)`,
 *     so bank ph's pixel at x IS phase 0's pixel at (x + ph) mod pattern_px.
 *
 * Both say: BANK k AT x READS PHASE 0 AT (x + k) mod pattern_px — the content
 * translates toward -x as the step grows (a pixel leaving the LEFT edge
 * reappears at the RIGHT). The rows below assert exactly that, against
 * expectations derived through an INDEPENDENT full-pixel-grid roll, never by
 * calling the code under test twice.
 *
 * THE PIXEL GEOMETRY IS THE RUNTIME'S: band slots are COLUMN-MAJOR ("a pattern
 * column's tiles are contiguous in VRAM", bg_anim.emp header; forest_bg_gen
 * builds banks `for col: for vrow:`; inject_editor_bg.py comments the banks
 * blob "column-major so whole-column rotation is two wrapped DMAs"), and each
 * tile is a flat row-major 8x8 (the contract's TILE_PIXELS pack-loop citation).
 * The grid helpers below encode THAT layout, independently of the module.
 */
import { describe, it, expect } from 'vitest';
import {
  BGANIM_PHASE_BANKS,
  BG_LAYOUT_WORDS,
  TILE_PIXELS,
  TILE_WIDTH_PX,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import {
  PHASE_SHIFT_SRC_PX,
  bandFromStaticTiles,
  createBand,
  shiftedPhaseBanks,
} from '../../src/core/formats/bg-override/bg-anim-band';
import { makePromoteBandCommand } from '../../src/core/editing/bg-override-band';
import { promoteBandCommand } from '../../src/renderer/providers/bg-anim-aeon';
import type { SetBgOverrideBandCommand } from '../../src/core/editing/commands';

// ─── the independent instrument: tiles ⇄ pixel grid, and a pixel roll ───────
// Written from the aeon layout facts quoted in the header, NOT from
// shiftedPhaseBanks: a whole grid is assembled, rolled as a flat pixel array,
// and sliced back — so a per-tile indexing bug in the module cannot also be
// here.

/** Column-major tile list → [h][w] pixel grid (h = rows*8, w = cols*8). */
function gridOf(tiles: readonly number[][], cols: number, rows: number): number[][] {
  const w = cols * 8, h = rows * 8;
  const grid = Array.from({ length: h }, () => new Array<number>(w).fill(-1));
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const tile = tiles[col * rows + r];              // column-major slot
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          grid[r * 8 + py][col * 8 + px] = tile[py * 8 + px];   // row-major tile
        }
      }
    }
  }
  return grid;
}

/** grid rolled k px toward -x: out[y][x] = grid[y][(x + k) mod w]. */
function rollLeft(grid: number[][], k: number): number[][] {
  const w = grid[0].length;
  return grid.map((line) => line.map((_, x) => line[(x + k) % w]));
}

/** [h][w] pixel grid → column-major tile list. The inverse of gridOf. */
function tilesOf(grid: number[][], cols: number, rows: number): number[][] {
  const out: number[][] = [];
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const tile = new Array<number>(64);
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          tile[py * 8 + px] = grid[r * 8 + py][col * 8 + px];
        }
      }
      out.push(tile);
    }
  }
  return out;
}

/** The expected bank k of a phase-0 tile list, by the independent route. */
function expectedBank(phase0: readonly number[][], cols: number, rows: number, k: number): number[][] {
  return tilesOf(rollLeft(gridOf(phase0, cols, rows), k), cols, rows);
}

// ─── a synthetic, provably asymmetric pattern ───────────────────────────────
// Pixel (x, y) of the band = (x*5 + y*2 + x*y + 1) & 0xF over the full
// pattern. The odd x-stride makes every 1..7px roll differ from the original
// (asserted, not assumed), and the x*y cross term breaks the linear symmetry
// that let a first draft of this file pass a tile-transposition plant:
// (x*5 + y*3) is invariant under swapping (x+8, y) with (x, y+8) because
// 5*8 = 3*8 = 8 (mod 16), so a column-major/row-major mix-up produced the
// SAME grid. A fixture symmetric under the defect is a matcher that cannot
// see it.

function asymmetricTiles(cols: number, rows: number): number[][] {
  const grid = Array.from({ length: rows * 8 }, (_, y) =>
    Array.from({ length: cols * 8 }, (_, x) => (x * 5 + y * 2 + x * y + 1) & 0xF));
  return tilesOf(grid, cols, rows);
}

/** A document carrying `extra` static tiles of that pattern after `pad` filler tiles. */
function docWith(cols: number, rows: number, pad = 3): { doc: BgOverrideDocument; base: number } {
  const filler = Array.from({ length: pad }, (_, i) => new Array<number>(TILE_PIXELS).fill(i & 0xF));
  const tiles = [...filler, ...asymmetricTiles(cols, rows)];
  // Every tile drawn once, palette-line attribute set so no word can be 0.
  const layout = new Array<number>(BG_LAYOUT_WORDS).fill(0)
    .map((_, i) => (i < tiles.length ? (i | (2 << 13)) : 0));
  return { doc: { layout, tiles }, base: pad };
}

const COLS = 2, ROWS = 2;                 // colBytes = 64 (a power of two); patternPx = 16
const PATTERN_PX = COLS * TILE_WIDTH_PX;

describe('the independent instrument and fixture are real', () => {
  it('the synthetic pattern is asymmetric: every roll 1..7 differs from roll 0, and a full-width roll is identity', () => {
    const phase0 = asymmetricTiles(COLS, ROWS);
    const grid = gridOf(phase0, COLS, ROWS);
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
      expect(rollLeft(grid, k)).not.toEqual(grid);
    }
    expect(rollLeft(grid, PATTERN_PX)).toEqual(grid);
    // and the grid round-trips, so tilesOf really is gridOf's inverse
    expect(tilesOf(grid, COLS, ROWS)).toEqual(phase0);
  });

  it('the direction constant is the derived one: bank k reads phase 0 at x + k', () => {
    // Pinned so a future edit cannot flip the direction silently — the header's
    // derivation (bg_anim.emp's coarse DMA; forest_bg_gen's `(v + ph) % PAT_W`)
    // is only valid for +1 source px per bank.
    expect(PHASE_SHIFT_SRC_PX).toBe(1);
  });
});

describe("phaseFill: 'shift' — banks are phase 0 rolled k px", () => {
  it('bank k of a promoted band equals the independent roll of the blob range, for every bank', () => {
    const { doc, base } = docWith(COLS, ROWS);
    const band = bandFromStaticTiles(doc, base, { cols: COLS, rows: ROWS, phaseFill: 'shift' });
    const range = doc.tiles.slice(base, base + COLS * ROWS);
    expect(band.phases).toHaveLength(BGANIM_PHASE_BANKS);
    for (let k = 0; k < BGANIM_PHASE_BANKS; k++) {
      expect(band.phases![k]).toEqual(expectedBank(range, COLS, ROWS, k));
    }
    // Anti-vacuous: the banks really differ from each other (the pattern is asymmetric).
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
      expect(band.phases![k]).not.toEqual(band.phases![0]);
    }
  });

  it('bank 0 is untouched — it IS the blob range, so the promotion command accepts the band', () => {
    const { doc, base } = docWith(COLS, ROWS);
    const band = bandFromStaticTiles(doc, base, { cols: COLS, rows: ROWS, phaseFill: 'shift' });
    expect(band.phases![0]).toEqual(doc.tiles.slice(base, base + COLS * ROWS));
    // The prefix rule (`phases[0] == tiles[slot_base : slot_base+n]`) is what
    // planBandPromotion enforces; a fill that disturbed bank 0 would refuse here.
    expect(() => makePromoteBandCommand(doc, band, base)).not.toThrow();
  });

  it('wrap at the pattern edge is exact: a pixel leaving the LEFT edge reappears at the RIGHT', () => {
    // One marked pixel at x = 0 (left edge), y = 3; everything else 0.
    const grid = Array.from({ length: ROWS * 8 }, (_, y) =>
      Array.from({ length: PATTERN_PX }, (_, x) => (x === 0 && y === 3 ? 7 : 0)));
    const phase0 = tilesOf(grid, COLS, ROWS);
    const banks = shiftedPhaseBanks({ cols: COLS, rows: ROWS }, phase0);
    for (let k = 0; k < BGANIM_PHASE_BANKS; k++) {
      const bankGrid = gridOf(banks[k], COLS, ROWS);
      const marks = bankGrid.flatMap((line, y) => line.flatMap((v, x) => (v !== 0 ? [{ x, y, v }] : [])));
      // Content moves toward -x: the marker at 0 lands at (0 - k) mod patternPx.
      expect(marks).toEqual([{ x: (PATTERN_PX - k) % PATTERN_PX, y: 3, v: 7 }]);
    }
  });

  it('a 1-column band shifts within its own 8 px', () => {
    const cols = 1, rows = 2;                     // patternPx = 8 = TILE_WIDTH_PX
    const grid = Array.from({ length: rows * 8 }, (_, y) =>
      Array.from({ length: 8 }, (_, x) => (x === 3 && y === 10 ? 9 : 0)));
    const phase0 = tilesOf(grid, cols, rows);
    const banks = shiftedPhaseBanks({ cols, rows }, phase0);
    for (let k = 0; k < BGANIM_PHASE_BANKS; k++) {
      const bankGrid = gridOf(banks[k], cols, rows);
      const marks = bankGrid.flatMap((line, y) => line.flatMap((v, x) => (v !== 0 ? [{ x, y }] : [])));
      expect(marks).toEqual([{ x: (3 - k + 8) % 8, y: 10 }]);
      // and by the independent route, whole-bank:
      expect(banks[k]).toEqual(expectedBank(phase0, cols, rows, k));
    }
  });

  it('refuses a phase 0 that is not the band\'s own shape — the shift permutes exactly its pixels', () => {
    expect(() => shiftedPhaseBanks({ cols: COLS, rows: ROWS }, asymmetricTiles(COLS, ROWS).slice(1)))
      .toThrow('cannot derive shifted phase banks');
  });
});

describe('the other fills are unchanged', () => {
  it("promotion's default is 'copy', exactly as before: every bank IS the range", () => {
    const { doc, base } = docWith(COLS, ROWS);
    const range = doc.tiles.slice(base, base + COLS * ROWS);
    for (const spec of [{ cols: COLS, rows: ROWS }, { cols: COLS, rows: ROWS, phaseFill: 'copy' as const }]) {
      const band = bandFromStaticTiles(doc, base, spec);
      for (let k = 0; k < BGANIM_PHASE_BANKS; k++) expect(band.phases![k]).toEqual(range);
    }
  });

  it("'blank' on a promotion keeps bank 0 as the range and blanks banks 1..", () => {
    const { doc, base } = docWith(COLS, ROWS);
    const band = bandFromStaticTiles(doc, base, { cols: COLS, rows: ROWS, phaseFill: 'blank' });
    expect(band.phases![0]).toEqual(doc.tiles.slice(base, base + COLS * ROWS));
    const blank = new Array<number>(TILE_PIXELS).fill(0);
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
      expect(band.phases![k]).toEqual(Array.from({ length: COLS * ROWS }, () => blank));
    }
    // prefix identity still holds, so the command path accepts it
    expect(() => makePromoteBandCommand(doc, band, base)).not.toThrow();
  });

  it('a NEW band is blank under every fill (its phase 0 is blank art), so the insert default is untouched', () => {
    const plain = createBand({ cols: COLS, rows: ROWS });
    for (const fill of ['copy', 'blank', 'shift'] as const) {
      expect(createBand({ cols: COLS, rows: ROWS, phaseFill: fill }).phases).toEqual(plain.phases);
    }
  });

  it('refuses `phases` and `phaseFill` together — `phases` already spells every bank', () => {
    const phases = Array.from({ length: BGANIM_PHASE_BANKS },
      () => asymmetricTiles(COLS, ROWS));
    expect(() => createBand({ cols: COLS, rows: ROWS, phases, phaseFill: 'shift' }))
      .toThrow('refusing to create a band with BOTH `phases` and `phaseFill`');
  });
});

describe('the provider door carries the option through', () => {
  it("promoteBandCommand with phaseFill: 'shift' builds the shifted band", () => {
    const { doc, base } = docWith(COLS, ROWS);
    const result = promoteBandCommand(doc, base, { cols: COLS, rows: ROWS, phaseFill: 'shift' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const band = (result.command as SetBgOverrideBandCommand).band;
    const range = doc.tiles.slice(base, base + COLS * ROWS);
    for (let k = 0; k < BGANIM_PHASE_BANKS; k++) {
      expect(band.phases![k]).toEqual(expectedBank(range, COLS, ROWS, k));
    }
    expect(band.phases![1]).not.toEqual(band.phases![0]);
  });

  it('…and its default is still copy', () => {
    const { doc, base } = docWith(COLS, ROWS);
    const result = promoteBandCommand(doc, base, { cols: COLS, rows: ROWS });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const band = (result.command as SetBgOverrideBandCommand).band;
    const range = doc.tiles.slice(base, base + COLS * ROWS);
    for (let k = 0; k < BGANIM_PHASE_BANKS; k++) expect(band.phases![k]).toEqual(range);
  });
});
