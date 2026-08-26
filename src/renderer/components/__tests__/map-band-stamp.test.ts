// THE BAND-STAMP GESTURE, out of `.tsx` so the node suite can pin it (parcel J).
//
// A press lays one pattern; a drag reshapes it live to the rectangle between
// the press cell and the cursor; the release turns the whole thing into ONE
// `set-bg-override-layout` command whose entries restore every word. The rows
// below drive the machine through a fake plane and check three things the
// viewport cannot see: cells that LEAVE the rectangle go back to their old
// word, the words down are exactly `bandStampWords`', and the command's
// oldWords are the pre-gesture words even after the rectangle crossed a cell
// twice.

import { describe, it, expect } from 'vitest';
import { beginBandStamp, moveBandStamp, endBandStamp, type BandStampPlane } from '../map-band-stamp';
import { bandStampWords } from '../../../core/editing/band-stamp';
import { LAYOUT_TILE_INDEX_MASK } from '../../../core/formats/bg-override/bg-override';

const band = { cols: 4, rows: 2 };
const slotBase = 100;
const COLS = 16, ROWS = 8;

/** A plane whose every word is recognisable: index + palette line 2. */
function plane(): BandStampPlane & { words: number[] } {
  const words = Array.from({ length: COLS * ROWS }, (_, i) => (i & 0x7F) | 0x4000);
  return {
    cols: COLS, rows: ROWS, words,
    readWord: (i) => words[i],
    writeWord: (i, w) => { words[i] = w; },
  };
}
const before = plane().words;

describe('band stamp gesture', () => {
  it('a press lays one whole pattern under the press cell, attributes kept', () => {
    const p = plane();
    const g = beginBandStamp(band, slotBase, { col: 3, row: 2 }, p);
    const expected = bandStampWords(band, slotBase, { col: 3, row: 2, width: band.cols, height: band.rows }, {
      existing: Array.from({ length: band.cols * band.rows }, (_, i) =>
        before[(2 + Math.floor(i / band.cols)) * COLS + 3 + (i % band.cols)]),
    });
    for (let r = 0; r < band.rows; r++) {
      for (let c = 0; c < band.cols; c++) {
        const i = (2 + r) * COLS + 3 + c;
        expect(p.words[i]).toBe(expected[r * band.cols + c]);
        expect(p.words[i] & ~LAYOUT_TILE_INDEX_MASK & 0xFFFF).toBe(0x4000);
      }
    }
    expect(g.applied.size).toBe(band.cols * band.rows);
    // Nothing outside the pattern moved.
    for (let i = 0; i < p.words.length; i++) {
      if (!g.applied.has(i)) expect(p.words[i]).toBe(before[i]);
    }
  });

  it('a drag reshapes the rectangle live and restores every cell that leaves it', () => {
    const p = plane();
    const g = beginBandStamp(band, slotBase, { col: 3, row: 2 }, p);
    // Shrink to a 2x1 strip: the other cells of the pattern go back.
    const dirty = moveBandStamp(g, { col: 4, row: 2 });
    expect(g.applied.size).toBe(2);
    for (let i = 0; i < p.words.length; i++) {
      if (i === 2 * COLS + 3 || i === 2 * COLS + 4) continue;
      expect(p.words[i], `cell ${i}`).toBe(before[i]);
    }
    // Exactly the cells that left: the two kept cells keep their word.
    expect(dirty.sort((a, b) => a - b)).toEqual(
      Array.from({ length: band.cols * band.rows }, (_, i) => (2 + Math.floor(i / band.cols)) * COLS + 3 + (i % band.cols))
        .filter((i) => i !== 2 * COLS + 3 && i !== 2 * COLS + 4),
    );
    // Grow past one pattern: tiled with the band's period, anchored at the press.
    moveBandStamp(g, { col: 3 + band.cols * 2, row: 2 + band.rows });
    const w = band.cols * 2 + 1, h = band.rows + 1;
    const expected = bandStampWords(band, slotBase, { col: 3, row: 2, width: w, height: h }, {
      existing: Array.from({ length: w * h }, (_, i) => before[(2 + Math.floor(i / w)) * COLS + 3 + (i % w)]),
    });
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) expect(p.words[(2 + r) * COLS + 3 + c]).toBe(expected[r * w + c]);
    }
    expect(g.applied.size).toBe(w * h);
  });

  it('growing up-left of the press keeps the press cell on pattern (0,0)', () => {
    const p = plane();
    const g = beginBandStamp(band, slotBase, { col: 6, row: 4 }, p);
    moveBandStamp(g, { col: 4, row: 3 });
    expect(p.words[4 * COLS + 6] & LAYOUT_TILE_INDEX_MASK).toBe(slotBase);
    expect(p.words[4 * COLS + 5] & LAYOUT_TILE_INDEX_MASK).toBe(slotBase + (band.cols - 1) * band.rows);
    expect(p.words[3 * COLS + 6] & LAYOUT_TILE_INDEX_MASK).toBe(slotBase + band.rows - 1);
  });

  it('the release is one command whose entries restore every word to before the gesture', () => {
    const p = plane();
    const g = beginBandStamp(band, slotBase, { col: 3, row: 2 }, p);
    moveBandStamp(g, { col: 9, row: 5 });   // crosses the pressed pattern's cells
    moveBandStamp(g, { col: 5, row: 3 });   // ...then shrinks back over some of them
    const entries = endBandStamp(g);
    expect(entries).toHaveLength(g.applied.size);
    expect(entries.length).toBe(3 * 2);
    for (const e of entries) {
      expect(e.oldWord).toBe(before[e.index]);
      expect(e.newWord).toBe(p.words[e.index]);
      expect(e.newWord).not.toBe(e.oldWord);
    }
    // Applying the old half puts the plane back exactly.
    for (const e of entries) p.writeWord(e.index, e.oldWord);
    expect(p.words).toEqual(before);
  });

  it('a cell already naming its slot is not an entry (undo has nothing to restore)', () => {
    const p = plane();
    const i = 2 * COLS + 3;
    p.words[i] = 0x4000 | slotBase; // already pattern (0,0) of this band
    const g = beginBandStamp(band, slotBase, { col: 3, row: 2 }, p);
    const entries = endBandStamp(g);
    expect(entries.map((e) => e.index)).not.toContain(i);
    expect(entries).toHaveLength(band.cols * band.rows - 1);
  });

  it('clips to the plane edge and never writes off it', () => {
    const p = plane();
    const g = beginBandStamp(band, slotBase, { col: COLS - 2, row: ROWS - 1 }, p);
    expect(g.applied.size).toBe(2);
    for (const i of g.applied.keys()) expect(i).toBeLessThan(COLS * ROWS);
    expect(p.words.length).toBe(COLS * ROWS);
  });
});
