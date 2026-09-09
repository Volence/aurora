// THE COLUMN AXIS OF THE GRID AN AGENT READS INSTEAD OF A SCREENSHOT.
//
// `renderCollisionAscii` labelled its columns with at most two digit lines, so
// column 100 printed a blank over a `0`, which is byte for byte what column 0
// prints. A section is SECTION_CELLS_WIDE cells across and get_collision_region
// takes a cell column anywhere in it, so three-digit columns are ordinary
// requests. The surface exists so a reader does not have to guess where
// something is, and its axis was wrong in exactly that way, silently: a
// plausible grid under a plausible ruler.
//
// THE ROWS BELOW ARE ABOUT THE AXIS, NOT THE GLYPHS. Glyph rules and the mixed
// cell contract are held by collision-region-read.test.ts; this file reads the
// ruler lines and nothing else, so a glyph change cannot redden it and an axis
// change cannot hide inside it.
//
// EXPECTATIONS ARE DERIVED FROM THE LABELS, not transcribed from a run: every
// row states the columns it asked for and reads the digits back off `String(col)`
// where the claim is about a whole window, so a passing row cannot be a
// screenshot of the defect.

import { describe, it, expect } from 'vitest';
import {
  renderCollisionAscii, readCollisionRegion, COLLISION_ASCII_LEGEND,
  SECTION_CELLS_WIDE, type CollisionCellRead,
} from '../../src/core/collision/collision-region-read';

/** `w` air cells on one row: the ruler is the whole claim here. */
const row = (w: number): CollisionCellRead[][] => [Array.from({ length: w }, () => ({ word: 0 }))];

/** The ruler lines of a render: everything above the first row label. A row line
 *  always starts with a digit (its absolute row), a ruler line starts with the
 *  gutter, so the split is the gutter and not a hard-coded count. */
function rulers(ascii: string): string[] {
  const lines = ascii.split('\n');
  const first = lines.findIndex((l) => /^[0-9]/.test(l));
  return lines.slice(0, first === -1 ? lines.length : first);
}

/** One rendered window plus the width needed to read a column out of it. The
 *  ruler lines and the row lines are the same length, so a column's characters
 *  are at the same offset from the END of every line: the gutter is derived
 *  rather than counted. */
interface Grid { ascii: string; w: number }

/** Render one row of `w` air cells starting at cell column `x`. */
function render(x: number, w: number, y = 0): Grid {
  return { ascii: renderCollisionAscii(row(w), null, x, y), w };
}

/** The digits standing under column `x + i`, top ruler line first, blanks kept. */
function column(g: Grid, i: number): string {
  return rulers(g.ascii).map((l) => l.slice(l.length - g.w)[i]).join('');
}

describe('the column ruler tells three-digit columns apart', () => {
  it('column 100 does not read as column 0', () => {
    const at0 = column(render(0, 1), 0);
    const at100 = column(render(100, 1), 0);
    // The defect, stated as the equality it produced.
    expect(at100.trim()).not.toBe(at0.trim());
    expect(at100.trim()).toBe('100');
    expect(at0.trim()).toBe('0');
  });

  it('every column of a window that crosses 100 is readable as its own number', () => {
    const x = 96, w = 12;                        // 96..107: two decades, one century
    const g = render(x, w);
    for (let i = 0; i < w; i++) {
      expect(column(g, i).trim()).toBe(String(x + i));
    }
  });

  it('the widest column the read surface allows is readable', () => {
    const last = SECTION_CELLS_WIDE - 1;
    const g = render(last, 1);
    expect(column(g, 0).trim()).toBe(String(last));
  });

  it('a blank is a leading zero and nothing else', () => {
    // 5 under a three-digit window is '  5', not '005': a padded zero would read
    // as a digit of a column number.
    const g = render(0, 101);
    expect(column(g, 5)).toBe('  5');
    expect(column(g, 100)).toBe('100');
  });
});

describe('the ruler width comes from the data, and narrow windows are unchanged', () => {
  it('one line inside a single decade', () => {
    expect(rulers(render(0, 9).ascii)).toHaveLength(1);
    expect(rulers(render(0, 9).ascii)[0].trim()).toBe('012345678');
  });

  it('two lines across a tens boundary, exactly as before this parcel', () => {
    const ascii = renderCollisionAscii(row(3), null, 9, 12);
    const rs = rulers(ascii);
    expect(rs).toHaveLength(2);
    expect(rs[0]).toContain('1');     // cols 9,10,11: blank,1,1
    expect(rs[1]).toContain('901');
  });

  it('three lines only once a label needs three digits', () => {
    expect(rulers(render(90, 9).ascii)).toHaveLength(2);   // 90..98
    expect(rulers(render(90, 11).ascii)).toHaveLength(3);  // 90..100
  });

  it('the gutter matches the row labels on every ruler line', () => {
    const ascii = renderCollisionAscii(row(11), null, 95, 8);
    const rs = rulers(ascii);
    const body = ascii.split('\n').slice(rs.length);
    for (const r of rs) expect(r.length).toBe(body[0].length);
  });
});

describe('the legend the tool description promises is actually in the reply', () => {
  it('rides along with ascii, and is absent when ascii was not asked for', () => {
    const plane = new Uint16Array(8 * 8);
    const args = {
      plane: 'a' as const, planeWords: plane, tileWidth: 8,
      x: 0, y: 0, w: 2, h: 2, profiles: null,
    };
    const withAscii = readCollisionRegion({ ...args, ascii: true });
    expect(withAscii.ascii).toBeTruthy();
    expect(withAscii.legend).toBe(COLLISION_ASCII_LEGEND);
    const without = readCollisionRegion({ ...args, ascii: false });
    expect(without.ascii).toBeUndefined();
    expect(without.legend).toBeUndefined();
  });

  it('says how to read the multi-line column ruler, because that is not guessable', () => {
    expect(COLLISION_ASCII_LEGEND).toMatch(/one line per DIGIT/);
    expect(COLLISION_ASCII_LEGEND).toMatch(/leading zero/);
  });
});
