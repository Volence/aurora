import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { canvasIndex } from '../canvas-doc';
import {
  canvasCells, findCellClashes, colorsPerLine, countUniqueTiles,
} from '../canvas-constraints';

/** A buffer with `fn(x, y)` at every pixel — the fixtures below are all one-liners over it. */
function buf(w: number, h: number, fn: (x: number, y: number) => number) {
  const b = createBuffer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.data[y * w + x] = fn(x, y);
  return b;
}

describe('canvasCells', () => {
  it('covers an aligned canvas in whole cells', () => {
    const cells = canvasCells(16, 8, { originX: 0, originY: 0 });
    expect(cells).toEqual([
      { x: 0, y: 0, w: 8, h: 8, full: true },
      { x: 8, y: 0, w: 8, h: 8, full: true },
    ]);
  });

  it('emits the leading partial band a non-zero origin creates', () => {
    const cells = canvasCells(16, 8, { originX: 3, originY: 0 });
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 3, h: 8, full: false });
    expect(cells[1]).toEqual({ x: 3, y: 0, w: 8, h: 8, full: true });
    expect(cells[2]).toEqual({ x: 11, y: 0, w: 5, h: 8, full: false });
  });

  it('treats an origin of 8 as an origin of 0 — the grid repeats every 8px', () => {
    expect(canvasCells(16, 8, { originX: 8, originY: 0 }))
      .toEqual(canvasCells(16, 8, { originX: 0, originY: 0 }));
  });

  it('folds a negative origin into the same 0..7 phase', () => {
    expect(canvasCells(16, 8, { originX: -3, originY: 0 }))
      .toEqual(canvasCells(16, 8, { originX: 5, originY: 0 }));
  });

  it('covers every pixel exactly once', () => {
    const seen = new Uint8Array(23 * 19);
    for (const c of canvasCells(23, 19, { originX: 4, originY: 6 })) {
      for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) seen[y * 23 + x]++;
    }
    expect(Array.from(seen).every((n) => n === 1)).toBe(true);
  });
});

describe('findCellClashes', () => {
  it('finds nothing when every cell draws from one line', () => {
    const b = buf(16, 8, (x) => canvasIndex(x < 8 ? 0 : 1, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 4)).toEqual([]);
  });

  it('reports a cell whose pixels come from two lines', () => {
    const b = buf(8, 8, (x) => canvasIndex(x === 0 ? 2 : 0, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 4)).toEqual([
      { x: 0, y: 0, w: 8, h: 8, full: true, kind: 'multi-line', lines: [0, 2] },
    ]);
  });

  // THE ONE THIS RULE EXISTS TO GET RIGHT. Transparent pixels have no line —
  // canvasIndex folds 16/32/48 to 0 — so a cell of line-3 art on transparency
  // is legal. Reading the raw high nibble instead would call this a clash
  // between "line 0" and line 3, and flag every sprite ever drawn.
  it('does not count transparent pixels as a line', () => {
    const b = buf(8, 8, (x) => (x < 4 ? 0 : canvasIndex(3, 7)));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 4)).toEqual([]);
  });

  it('flags a line the profile does not have, even alone in its cell', () => {
    const b = buf(8, 8, () => canvasIndex(2, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 1)).toEqual([
      { x: 0, y: 0, w: 8, h: 8, full: true, kind: 'line-out-of-range', lines: [2] },
    ]);
  });

  it('evaluates a partial cell — a clash in the offset band is still a clash', () => {
    const b = buf(16, 8, (x) => canvasIndex(x === 0 ? 1 : 0, 5));
    const clashes = findCellClashes(b, { originX: 3, originY: 0 }, 4);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ x: 0, w: 3, full: false, kind: 'multi-line' });
  });

  // BOTH LINES OUT OF RANGE, deliberately. The obvious fixture for this — lines
  // 0 and 3 against a one-line profile — cannot tell the two orderings apart,
  // because the out-of-range test reads `lines[0]`, the LOWEST line, and line 0
  // is in range for every profile. Swapping the branches passed that version of
  // this test unchanged. Lines 2 and 3 make the precedence real: under the wrong
  // order this reports `line-out-of-range` and the artist is told to re-assign a
  // cell that cannot be re-assigned, because it holds two lines.
  it('reports multi-line ahead of out-of-range when a cell is both', () => {
    const b = buf(8, 8, (x) => canvasIndex(x === 0 ? 3 : 2, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 1)[0])
      .toMatchObject({ kind: 'multi-line', lines: [2, 3] });
  });
});

describe('colorsPerLine', () => {
  it('counts distinct non-transparent entries in each line', () => {
    const b = buf(8, 8, (x, y) => {
      if (y === 0) return canvasIndex(0, 1 + (x % 3)); // line 0: entries 1,2,3
      if (y === 1) return canvasIndex(2, 9);           // line 2: entry 9
      return 0;                                        // transparent
    });
    expect(colorsPerLine(b)).toEqual([3, 0, 1, 0]);
  });

  it('never counts entry 0 — it is transparency, not a colour choice', () => {
    expect(colorsPerLine(buf(8, 8, () => 0))).toEqual([0, 0, 0, 0]);
  });

  it('counts a colour once however many pixels use it', () => {
    expect(colorsPerLine(buf(8, 8, () => canvasIndex(1, 4)))).toEqual([0, 1, 0, 0]);
  });
});

describe('countUniqueTiles', () => {
  const origin = { originX: 0, originY: 0 };

  it('counts identical cells once', () => {
    const b = buf(16, 8, (x, y) => canvasIndex(0, 1 + (y % 2)));
    expect(countUniqueTiles(b, origin)).toMatchObject({ unique: 1, fullCells: 2 });
  });

  // THE ONE THIS FUNCTION EXISTS FOR. Left cell and right cell are mirror
  // images; the VDP draws both from one tile with the H-flip bit set.
  it('counts an x-mirrored pair as one tile', () => {
    const b = buf(16, 8, (x, y) => {
      const lx = x < 8 ? x : 15 - x;             // right half mirrors the left
      return canvasIndex(0, lx < 2 ? 1 + (y % 3) : 0);
    });
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  it('counts a y-mirrored pair as one tile', () => {
    const b = buf(8, 16, (x, y) => {
      const ly = y < 8 ? y : 15 - y;
      return canvasIndex(0, ly < 2 ? 1 + (x % 3) : 0);
    });
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  it('counts an xy-mirrored pair as one tile', () => {
    const src = (x: number, y: number) => canvasIndex(0, (x < 3 && y < 2) ? 1 + x : 0);
    const b = buf(16, 8, (x, y) => (x < 8 ? src(x, y) : src(7 - (x - 8), 7 - y)));
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  // A TRANSPOSE IS NOT A FLIP. The VDP has H and V bits and no diagonal; if
  // this passes as 1, the canonicaliser folded in a rotation the hardware
  // cannot perform, and 2C would emit tiles that draw wrong.
  it('does NOT count a transposed pair as one tile', () => {
    const src = (x: number, y: number) => canvasIndex(0, (x < 3 && y === 0) ? 1 + x : 0);
    const b = buf(16, 8, (x, y) => (x < 8 ? src(x, y) : src(y, x - 8)));
    expect(countUniqueTiles(b, origin).unique).toBe(2);
  });

  // The line lives in the block/sprite attribute, not in the tile.
  it('counts two cells drawn in different lines as ONE tile', () => {
    const b = buf(16, 8, (x, y) => canvasIndex(x < 8 ? 0 : 3, y < 2 ? 5 : 0));
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  it('excludes partial cells and reports their pixels instead', () => {
    const b = buf(12, 8, () => canvasIndex(0, 1));
    expect(countUniqueTiles(b, { originX: 0, originY: 0 }))
      .toEqual({ unique: 1, fullCells: 1, pixelsOutsideGrid: 4 * 8 });
  });

  it('counts the blank tile like any other', () => {
    expect(countUniqueTiles(buf(16, 8, () => 0), origin))
      .toEqual({ unique: 1, fullCells: 2, pixelsOutsideGrid: 0 });
  });

  it('cost: a full 1024x1024 scan stays under 150ms', () => {
    const b = buf(1024, 1024, (x, y) => canvasIndex((x >> 8) & 3, (x + y) & 15));
    const t0 = performance.now();
    countUniqueTiles(b, { originX: 0, originY: 0 });
    colorsPerLine(b);
    findCellClashes(b, { originX: 0, originY: 0 }, 4);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[cost] 1024x1024 full constraint scan: ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(150);
  });
});
