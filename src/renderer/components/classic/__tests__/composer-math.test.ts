import { describe, it, expect } from 'vitest';
import {
  cellIndexAt, canvasLocalPoint, canvasCellIndexAt, type CanvasGeom,
  readTilePixels, packTilePixels, floodFillTile,
} from '../composer-math';
import { bufferToTileBytes } from '../../../../core/art/classic-tile-buffer';

describe('cellIndexAt', () => {
  it('maps coords to a row-major index in a 16x16 chunk grid', () => {
    expect(cellIndexAt(0, 0, 20, 16, 16)).toBe(0);
    expect(cellIndexAt(25, 0, 20, 16, 16)).toBe(1); // col 1, row 0
    expect(cellIndexAt(0, 25, 20, 16, 16)).toBe(16); // col 0, row 1
    expect(cellIndexAt(319, 319, 20, 16, 16)).toBe(255); // last cell (col15,row15)
  });

  it('works for a 2x2 block grid', () => {
    expect(cellIndexAt(0, 0, 64, 2, 2)).toBe(0); // TL
    expect(cellIndexAt(70, 0, 64, 2, 2)).toBe(1); // TR
    expect(cellIndexAt(0, 70, 64, 2, 2)).toBe(2); // BL
    expect(cellIndexAt(70, 70, 64, 2, 2)).toBe(3); // BR
  });

  it('works for an 8x8 pixel grid', () => {
    expect(cellIndexAt(0, 0, 28, 8, 8)).toBe(0);
    expect(cellIndexAt(28 * 7 + 1, 28 * 7 + 1, 28, 8, 8)).toBe(63);
  });

  it('returns null outside the grid (past the right/bottom edge)', () => {
    expect(cellIndexAt(320, 0, 20, 16, 16)).toBeNull(); // col 16 (past 0..15)
    expect(cellIndexAt(0, 320, 20, 16, 16)).toBeNull();
  });

  it('returns null for negative coords and degenerate sizes', () => {
    expect(cellIndexAt(-1, 0, 20, 16, 16)).toBeNull();
    expect(cellIndexAt(0, -1, 20, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, 0, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, -5, 16, 16)).toBeNull();
    expect(cellIndexAt(0, 0, 20, 0, 0)).toBeNull();
  });
});

// Regression: the composer canvases carry a 1px border (styles.gridCanvas), and
// getBoundingClientRect() reports the BORDER box while canvas drawing coords
// start at the CONTENT box. All three tabs used to hit-test with a bare
// `clientX - rect.left`, so every read was one CSS px right/down of the cursor —
// the tile drawn sat off from the crosshair. These pin the corrected mapping.
//
// The Tile tab's real geometry: an 8x8 grid at PX=26 → a 208px backing store,
// rendered 1:1, inside a 1px border, positioned at viewport (100, 50). So the
// canvas's drawing-space origin is at client (101, 51).
const TILE_GEOM: CanvasGeom = {
  left: 100, top: 50,
  borderLeft: 1, borderTop: 1,
  cssWidth: 208, cssHeight: 208,
  width: 208, height: 208,
};

describe('canvasLocalPoint (border/scale correction)', () => {
  it('subtracts the border, so the content origin maps to (0,0)', () => {
    expect(canvasLocalPoint(101, 51, TILE_GEOM)).toEqual({ x: 0, y: 0 });
  });

  it('reports a point left/above the content box as negative (cellIndexAt rejects it)', () => {
    // Client (100,50) is ON the border, outside the drawing surface. The old
    // math called this (0,0) — a paint on pixel 0 from a click that missed.
    expect(canvasLocalPoint(100, 50, TILE_GEOM)).toEqual({ x: -1, y: -1 });
  });

  it('applies the css-size vs backing-store scale when they differ', () => {
    // A 208-unit backing store rendered into 104 CSS px → 2 drawing units per px.
    const scaled: CanvasGeom = { ...TILE_GEOM, cssWidth: 104, cssHeight: 104 };
    expect(canvasLocalPoint(111, 61, scaled)).toEqual({ x: 20, y: 20 });
  });

  it('falls back to scale 1 on degenerate (zero-size / detached) geometry', () => {
    const dead: CanvasGeom = { ...TILE_GEOM, cssWidth: 0, cssHeight: 0 };
    // Must stay finite — NaN/Infinity would sail through cellIndexAt's guards.
    expect(canvasLocalPoint(111, 61, dead)).toEqual({ x: 10, y: 10 });
  });
});

describe('canvasCellIndexAt (the composer tabs\' hit-test)', () => {
  const at = (cx: number, cy: number) => canvasCellIndexAt(cx, cy, TILE_GEOM, 26, 8, 8);

  it('maps the origin cell', () => {
    expect(at(101, 51)).toBe(0); // first drawing pixel
    expect(at(126, 76)).toBe(0); // last client px still inside cell (0,0)
  });

  it('maps the last cell, including its final pixel', () => {
    expect(at(101 + 26 * 7, 51 + 26 * 7)).toBe(63); // first px of cell (7,7)
    // The bottom-right-most drawing pixel (207,207). The old math read this as
    // 208 → out of range, making the canvas's last row/column dead.
    expect(at(101 + 207, 51 + 207)).toBe(63);
  });

  it('pins each side of a cell boundary', () => {
    // Cell 0 ends at drawing x=25, cell 1 begins at x=26.
    expect(at(101 + 25, 51)).toBe(0);
    expect(at(101 + 26, 51)).toBe(1);
    // Same on the row axis: row 1 begins at drawing y=26 → index 8.
    expect(at(101, 51 + 25)).toBe(0);
    expect(at(101, 51 + 26)).toBe(8);
  });

  it('returns null outside the canvas rather than clamping to an edge cell', () => {
    expect(at(100, 51)).toBeNull();          // on the left border
    expect(at(101, 50)).toBeNull();          // on the top border
    expect(at(101 + 208, 51)).toBeNull();    // past the right edge
    expect(at(101, 51 + 208)).toBeNull();    // past the bottom edge
    expect(at(0, 0)).toBeNull();             // far outside
  });
});

describe('readTilePixels / packTilePixels (4bpp nibble packing)', () => {
  it('reads the HIGH nibble as the LEFT (even-x) pixel', () => {
    // One tile, first byte 0x1F → left pixel = 1 (high nibble), right pixel = F.
    const tiles = new Uint8Array(32);
    tiles[0] = 0x1f;
    const px = readTilePixels(tiles, 0);
    expect(px[0]).toBe(0x1); // even x → high nibble
    expect(px[1]).toBe(0xf); // odd x  → low nibble
  });

  it('pins a known byte pattern across a full row', () => {
    // Row 0 bytes 0x12 0x34 0x56 0x78 → pixels 1 2 3 4 5 6 7 8.
    const tiles = new Uint8Array(32);
    tiles.set([0x12, 0x34, 0x56, 0x78], 0);
    const px = readTilePixels(tiles, 0);
    expect(Array.from(px.slice(0, 8))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('packTilePixels is the exact inverse of readTilePixels (round-trip)', () => {
    const tiles = new Uint8Array(64);
    for (let i = 0; i < 64; i++) tiles[i] = (i * 37) & 0xff; // two tiles of varied bytes
    for (const t of [0, 1]) {
      const px = readTilePixels(tiles, t);
      const bytes = packTilePixels(px);
      expect(Array.from(bytes)).toEqual(Array.from(tiles.slice(t * 32, t * 32 + 32)));
    }
  });

  it('round-trips an arbitrary pixel array back to itself', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 64; i++) px[i] = (i * 7) & 0xf;
    const bytes = packTilePixels(px);
    const back = readTilePixels(bytes, 0);
    expect(Array.from(back)).toEqual(Array.from(px));
  });

  it('returns all-zero pixels for an out-of-range tile index (no throw)', () => {
    const tiles = new Uint8Array(32);
    expect(Array.from(readTilePixels(tiles, 5))).toEqual(Array(64).fill(0));
  });

  // Moved here from src/core/art/__tests__/classic-tile-buffer.test.ts, which was
  // the only test under src/core/art importing from src/renderer. The contract it
  // pins is a RENDERER-side one — that composer-math still re-exports the core
  // packer — so it belongs on this side of the layer, and core stays testable in
  // isolation.
  //
  // The import above must keep coming from '../composer-math' (the re-export),
  // NOT from core: sourcing both symbols from one module would reduce this to
  // f(x) === f(x), which cannot fail. As written it fails if the re-export is
  // dropped or rewired to a different packer — verified by removing it.
  it('bufferToTileBytes agrees with packTilePixels', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 64; i++) px[i] = i & 0x0f;
    const b = { width: 8, height: 8, data: px };
    expect(Array.from(bufferToTileBytes(b))).toEqual(Array.from(packTilePixels(px)));
  });
});

describe('floodFillTile', () => {
  const grid = () => new Uint8Array(64); // all color 0

  it('fills the whole tile when it is one region', () => {
    const fill = floodFillTile(grid(), 0, 5);
    expect(fill.size).toBe(64);
    expect([...fill.values()].every((c) => c === 5)).toBe(true);
  });

  it('stops at a color boundary (fills only the connected region)', () => {
    const px = grid();
    for (let y = 0; y < 8; y++) px[y * 8 + 3] = 9; // vertical wall at x=3
    const fill = floodFillTile(px, 0, 5); // left of the wall
    expect(fill.size).toBe(24); // 3 columns x 8 rows
    expect(fill.has(4)).toBe(false); // right of the wall untouched
    expect(fill.has(3)).toBe(false); // the wall itself untouched
  });

  it('is 4-connected — diagonals do not leak', () => {
    // Checkerboard of 0/1: from a 0 pixel, only that single pixel matches
    // 4-connected (all orthogonal neighbors are 1s).
    const px = grid();
    for (let i = 0; i < 64; i++) px[i] = (((i % 8) + ((i / 8) | 0)) & 1) as 0 | 1;
    const fill = floodFillTile(px, 0, 5);
    expect(fill.size).toBe(1);
  });

  it('returns an empty map when the region already has the fill color (no-op, no undo step)', () => {
    const px = grid();
    expect(floodFillTile(px, 10, 0).size).toBe(0);
  });

  it('returns an empty map for out-of-range starts and wrong-size buffers', () => {
    expect(floodFillTile(grid(), -1, 5).size).toBe(0);
    expect(floodFillTile(grid(), 64, 5).size).toBe(0);
    expect(floodFillTile(new Uint8Array(32), 0, 5).size).toBe(0);
  });

  it('masks the fill color to 4 bits', () => {
    const fill = floodFillTile(grid(), 0, 0x15);
    expect(fill.get(0)).toBe(5);
  });
});
