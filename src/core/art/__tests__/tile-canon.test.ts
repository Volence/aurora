import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { CELL, TILE_ENTRIES, readCellEntries, canonicalTile } from '../tile-canon';

/** An 8x8 cell's worth of entries from `fn(x, y)`. */
function entries(fn: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(TILE_ENTRIES);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out[y * CELL + x] = fn(x, y);
  return out;
}

const mirrorX = (e: Uint8Array) => entries((x, y) => e[y * CELL + (CELL - 1 - x)]);
const mirrorY = (e: Uint8Array) => entries((x, y) => e[(CELL - 1 - y) * CELL + x]);

describe('readCellEntries', () => {
  it('reads the low nibble, so a canvas line does not change the tile', () => {
    // Same shape drawn in line 0 and in line 3: (line << 4) | entry.
    const buf = createBuffer(16, 8);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const entry = (x + y) % 16;
        buf.data[y * 16 + x] = entry;                   // line 0
        buf.data[y * 16 + (8 + x)] = (3 << 4) | entry;  // line 3
      }
    }
    expect(readCellEntries(buf, 0, 0)).toEqual(readCellEntries(buf, 8, 0));
  });

  it('reads the cell at an offset, not the origin', () => {
    const buf = createBuffer(16, 8);
    buf.data[8] = 5; // (x=8, y=0)
    expect(readCellEntries(buf, 8, 0)[0]).toBe(5);
    expect(readCellEntries(buf, 0, 0)[0]).toBe(0);
  });
});

describe('canonicalTile', () => {
  it('gives all four orientations of one tile the same key', () => {
    const e = entries((x, y) => (x === 0 && y === 0 ? 1 : 0)); // asymmetric: one corner lit
    const keys = [e, mirrorX(e), mirrorY(e), mirrorX(mirrorY(e))].map((t) => canonicalTile(t).key);
    expect(new Set(keys).size).toBe(1);
  });

  it('reports the orientation that maps the cell to canonical, and back again', () => {
    const e = entries((x, y) => (x === 0 && y === 0 ? 1 : 0));
    const flipped = mirrorX(e);
    const a = canonicalTile(e);
    const b = canonicalTile(flipped);
    // Exactly one of the two needs an x-flip to reach canonical form.
    expect(a.xf).not.toBe(b.xf);
    expect(a.yf).toBe(b.yf);
  });

  it('distinguishes a transposed tile — the VDP has no transpose bit', () => {
    const e = entries((x, y) => (x === 0 && y === 1 ? 1 : 0));
    const transposed = entries((x, y) => (x === 1 && y === 0 ? 1 : 0));
    expect(canonicalTile(e).key).not.toBe(canonicalTile(transposed).key);
  });

  it('prefers the identity orientation when orientations tie', () => {
    const flat = entries(() => 7); // fully symmetric: all four orientations are equal
    const c = canonicalTile(flat);
    expect(c.xf).toBe(false);
    expect(c.yf).toBe(false);
  });
});
