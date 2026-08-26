// POINTING A REGION AT A BAND, IN ONE GESTURE (parcel J, triage 2026-08-26 §A.8).
//
// A band's slots are COLUMN-major: slot i of a `cols x rows` band sits at
// column i / rows, row i % rows (aeon `bg_anim.emp`, `forest_bg_gen.py`
// `for col: for vrow:`; measured on the ROM 2026-08-26 —
// docs/reviews/2026-08-26-band-animates-in-rom.md). A layout cell that names
// the band's slot at its pattern position animates; one that does not, does
// not. `bandStampWords` is the geometry that turns a rectangle of cells into
// exactly those slot indices, tiled, with the cells' attribute bits kept.
//
// Every expectation below is DERIVED from `cols`/`rows` — never a typed 32 —
// so a band of another shape is covered by the same rows.

import { describe, it, expect } from 'vitest';
import { bandStampWords, bandStampRegionOf, type StampRegion } from '../band-stamp';
import { LAYOUT_TILE_INDEX_MASK } from '../../formats/bg-override/bg-override';

const band = { cols: 8, rows: 4 };
const slotBase = 5;

/** The measured layout: slot i → (col i / rows, row i % rows). */
function measuredSlotAt(col: number, row: number): number {
  return slotBase + col * band.rows + row;
}

describe('bandStampWords', () => {
  it('a single pattern lays every slot once, column-major, from the slot base', () => {
    const region: StampRegion = { col: 0, row: 0, width: band.cols, height: band.rows };
    const words = bandStampWords(band, slotBase, region);
    expect(words).toHaveLength(band.cols * band.rows);
    for (let r = 0; r < band.rows; r++) {
      for (let c = 0; c < band.cols; c++) {
        expect(words[r * band.cols + c], `cell (${c},${r})`).toBe(measuredSlotAt(c, r));
      }
    }
    // Every slot of the band is named exactly once — the set IS the band.
    const sorted = [...words].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: band.cols * band.rows }, (_, i) => slotBase + i));
  });

  it('the first column of the pattern is the first `rows` slots, top to bottom', () => {
    // Column-major stated the other way: reading DOWN a column advances the slot
    // by one; reading ACROSS a row advances it by `rows`. A row-major lay-out
    // would swap those two strides.
    const region: StampRegion = { col: 0, row: 0, width: band.cols, height: band.rows };
    const words = bandStampWords(band, slotBase, region);
    expect(words[1 * band.cols + 0] - words[0]).toBe(1);
    expect(words[0 * band.cols + 1] - words[0]).toBe(band.rows);
  });

  it('a region larger than one pattern tiles it with the pattern period', () => {
    const region: StampRegion = { col: 3, row: 7, width: band.cols * 2 + 3, height: band.rows * 3 + 1 };
    const words = bandStampWords(band, slotBase, region);
    expect(words).toHaveLength(region.width * region.height);
    for (let r = 0; r < region.height; r++) {
      for (let c = 0; c < region.width; c++) {
        // Anchored at the region's own origin: pattern position is the offset
        // from the top-left cell, wrapped by the band's geometry.
        expect(words[r * region.width + c]).toBe(measuredSlotAt(c % band.cols, r % band.rows));
      }
    }
  });

  it('a partial region at the edge is the top-left corner of the pattern', () => {
    // Narrower and shorter than a pattern — the foliage strip between two
    // trunks, or a rectangle clipped by the plane's edge.
    const region: StampRegion = { col: 60, row: 30, width: 3, height: 2 };
    const words = bandStampWords(band, slotBase, region);
    expect(words).toEqual([
      measuredSlotAt(0, 0), measuredSlotAt(1, 0), measuredSlotAt(2, 0),
      measuredSlotAt(0, 1), measuredSlotAt(1, 1), measuredSlotAt(2, 1),
    ]);
  });

  it('an anchor outside the region keeps the pattern phase (a drag that grows up-left)', () => {
    // The gesture's press cell is the phase origin; a rectangle that extends
    // above and left of it must still put the anchor cell on pattern (0,0).
    const anchor = { col: 10, row: 10 };
    const region: StampRegion = { col: 7, row: 9, width: 6, height: 3 };
    const words = bandStampWords(band, slotBase, region, { anchor });
    const at = (c: number, r: number) => words[(r - region.row) * region.width + (c - region.col)];
    expect(at(10, 10)).toBe(measuredSlotAt(0, 0));
    expect(at(9, 10)).toBe(measuredSlotAt(band.cols - 1, 0));
    expect(at(10, 9)).toBe(measuredSlotAt(0, band.rows - 1));
    expect(at(7, 9)).toBe(measuredSlotAt((7 - 10 + 2 * band.cols) % band.cols, band.rows - 1));
  });

  it('keeps every attribute bit of the existing words and replaces only the index', () => {
    const region: StampRegion = { col: 0, row: 0, width: 2, height: 2 };
    const attrs = [0x8000, 0x2000, 0xE000, 0x1800]; // priority, palette 1, all three, flips
    const existing = attrs.map((a, i) => a | (0x7FF - i));
    const words = bandStampWords(band, slotBase, region, { existing });
    for (let i = 0; i < 4; i++) {
      expect(words[i] & ~LAYOUT_TILE_INDEX_MASK).toBe(attrs[i]);
      expect(words[i] & LAYOUT_TILE_INDEX_MASK).toBeLessThan(slotBase + band.cols * band.rows);
    }
    expect(words[0] & LAYOUT_TILE_INDEX_MASK).toBe(measuredSlotAt(0, 0));
    expect(words[3] & LAYOUT_TILE_INDEX_MASK).toBe(measuredSlotAt(1, 1));
  });

  it('refuses a band with no slots', () => {
    expect(() => bandStampWords({ cols: 0, rows: 4 }, 0, { col: 0, row: 0, width: 1, height: 1 }))
      .toThrow();
  });
});

describe('bandStampRegionOf', () => {
  it('a click is one full pattern under the press cell', () => {
    const r = bandStampRegionOf(band, { col: 12, row: 5 }, { col: 12, row: 5 }, 64, 32);
    expect(r).toEqual({ col: 12, row: 5, width: band.cols, height: band.rows });
  });
  it('a drag is the exact rectangle between press and cursor, in any direction', () => {
    expect(bandStampRegionOf(band, { col: 12, row: 5 }, { col: 14, row: 6 }, 64, 32))
      .toEqual({ col: 12, row: 5, width: 3, height: 2 });
    expect(bandStampRegionOf(band, { col: 12, row: 5 }, { col: 9, row: 3 }, 64, 32))
      .toEqual({ col: 9, row: 3, width: 4, height: 3 });
  });
  it('clips to the plane', () => {
    const r = bandStampRegionOf(band, { col: 62, row: 30 }, { col: 62, row: 30 }, 64, 32);
    expect(r).toEqual({ col: 62, row: 30, width: 2, height: 2 });
    expect(bandStampRegionOf(band, { col: 0, row: 0 }, { col: -3, row: -2 }, 64, 32))
      .toEqual({ col: 0, row: 0, width: 1, height: 1 });
  });
});
