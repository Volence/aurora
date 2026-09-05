import { describe, it, expect } from 'vitest';
import { composeNametable, TILE_RGBA_BYTES, type TilePixelLookup } from '../compose-nametable';
import { packNametableWord, unpackNametableWord } from '../../../core/model/s4-types';

// ---------------------------------------------------------------------------
// Reference implementation.
//
// This mirrors the OLD SectionRenderer.renderTileAt per-cell canvas path, cell
// by cell, against a raw RGBA buffer:
//   clearRect(px,py,8,8)  -> zero the cell's 8x8 pixels
//   putImageData(img,px,py) -> replace the cell's pixels with the tile's
//   clearRect + drawImage(+-1 scale) -> zero, then write the flipped tile
// It is deliberately written the naive way (no row copies, no early-outs) so
// it shares no code with the implementation under test.
// ---------------------------------------------------------------------------

function clearCell(dest: Uint8ClampedArray, w: number, px: number, py: number): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const d = ((py + r) * w + px + c) * 4;
      dest[d] = 0; dest[d + 1] = 0; dest[d + 2] = 0; dest[d + 3] = 0;
    }
  }
}

function referenceCompose(
  dest: Uint8ClampedArray,
  w: number,
  h: number,
  nametable: Uint16Array,
  tilesWide: number,
  lookup: TilePixelLookup,
): void {
  const maxCol = Math.floor(w / 8);
  const maxRow = Math.floor(h / 8);
  for (let i = 0; i < nametable.length; i++) {
    const col = i % tilesWide;
    const row = Math.floor(i / tilesWide);
    if (col >= maxCol || row >= maxRow) continue;
    const px = col * 8;
    const py = row * 8;
    const word = nametable[i];

    if (word === 0) { clearCell(dest, w, px, py); continue; }
    const nt = unpackNametableWord(word);
    const src = lookup(nt.tileIndex, nt.palette);
    if (!src) { clearCell(dest, w, px, py); continue; }

    if (!nt.hFlip && !nt.vFlip) {
      // putImageData: straight replacement.
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const s = (r * 8 + c) * 4;
          const d = ((py + r) * w + px + c) * 4;
          dest[d] = src[s]; dest[d + 1] = src[s + 1]; dest[d + 2] = src[s + 2]; dest[d + 3] = src[s + 3];
        }
      }
    } else {
      // clearRect + drawImage through a +-1 scale.
      clearCell(dest, w, px, py);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sr = nt.vFlip ? 7 - r : r;
          const sc = nt.hFlip ? 7 - c : c;
          const s = (sr * 8 + sc) * 4;
          const d = ((py + r) * w + px + c) * 4;
          dest[d] = src[s]; dest[d + 1] = src[s + 1]; dest[d + 2] = src[s + 2]; dest[d + 3] = src[s + 3];
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A tile whose every pixel encodes (tileIndex, palette, row, col) uniquely. */
function makeTile(tileIndex: number, palette: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(TILE_RGBA_BYTES);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const o = (r * 8 + c) * 4;
      px[o] = (tileIndex * 13 + r) & 0xff;
      px[o + 1] = (palette * 61 + c) & 0xff;
      px[o + 2] = (r * 8 + c) & 0xff;
      // Alpha is 0 or 255 only — the project's palettes never use partial
      // alpha (index 0 is the transparent one), which is what makes a flipped
      // byte copy equivalent to clearRect + source-over drawImage.
      px[o + 3] = (r + c + tileIndex) % 5 === 0 ? 0 : 255;
    }
  }
  return px;
}

/** Lookup over tile indices [0, tileCount) and palettes [0, palCount). */
function makeLookup(tileCount: number, palCount: number): TilePixelLookup {
  const cache = new Map<number, Uint8ClampedArray>();
  return (tileIndex, palette) => {
    if (tileIndex >= tileCount || palette >= palCount) return null; // out of range
    const key = (tileIndex << 2) | palette;
    let t = cache.get(key);
    if (!t) { t = makeTile(tileIndex, palette); cache.set(key, t); }
    return t;
  };
}

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function run(
  nametable: Uint16Array,
  w: number,
  h: number,
  tilesWide: number,
  lookup: TilePixelLookup,
): { actual: Uint8ClampedArray; expected: Uint8ClampedArray } {
  const actual = new Uint8ClampedArray(w * h * 4);
  const expected = new Uint8ClampedArray(w * h * 4);
  // Poison both buffers first: composeNametable must fully own its output, and
  // the reference clears every cell it visits.
  actual.fill(0x5a);
  expected.fill(0x5a);
  composeNametable(actual, w, h, nametable, tilesWide, lookup);
  expected.fill(0); // reference starts from a fresh (transparent) canvas
  referenceCompose(expected, w, h, nametable, tilesWide, lookup);
  return { actual, expected };
}

function firstDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

// ---------------------------------------------------------------------------

describe('composeNametable: equivalence with the per-tile canvas path', () => {
  it('matches the reference for every flip/palette combination of one tile', () => {
    const tilesWide = 8, tilesHigh = 8;
    const w = tilesWide * 8, h = tilesHigh * 8;
    const lookup = makeLookup(4, 4);

    // 4 flip combos x 4 palettes x 2 priority values x 4 tile indices.
    let i = 0;
    const nt = new Uint16Array(tilesWide * tilesHigh);
    for (const hFlip of [false, true]) {
      for (const vFlip of [false, true]) {
        for (let pal = 0; pal < 4; pal++) {
          for (const priority of [false, true]) {
            nt[i] = packNametableWord(i % 4, pal, priority, vFlip, hFlip);
            i++;
          }
        }
      }
    }
    expect(i).toBe(32);

    const { actual, expected } = run(nt, w, h, tilesWide, lookup);
    expect(firstDiff(actual, expected)).toBe(-1);
  });

  it('leaves empty words, missing tiles and out-of-range indices transparent', () => {
    const tilesWide = 4, tilesHigh = 2;
    const w = 32, h = 16;
    const lookup = makeLookup(2, 2); // only tiles 0-1, palettes 0-1 exist

    const nt = new Uint16Array(tilesWide * tilesHigh);
    nt[0] = 0;                                        // empty cell
    nt[1] = packNametableWord(1, 1, false, false, true); // valid, hFlip
    nt[2] = packNametableWord(900, 0, false, false, false); // tile out of range
    nt[3] = packNametableWord(0, 3, false, true, false);    // palette out of range
    nt[4] = packNametableWord(0, 0, true, false, false);    // priority set
    nt[5] = packNametableWord(1, 0, false, true, true);     // both flips
    nt[6] = 0;
    nt[7] = packNametableWord(0, 1, false, false, false);

    const { actual, expected } = run(nt, w, h, tilesWide, lookup);
    expect(firstDiff(actual, expected)).toBe(-1);

    // And explicitly: the three transparent cells really are all-zero.
    for (const cell of [0, 2, 3]) {
      const px = (cell % tilesWide) * 8, py = Math.floor(cell / tilesWide) * 8;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          expect(actual[((py + r) * w + px + c) * 4 + 3]).toBe(0);
        }
      }
    }
  });

  it('matches the reference on a randomized dense grid (all edges covered)', () => {
    const tilesWide = 24, tilesHigh = 17; // deliberately not a power of two
    const w = tilesWide * 8, h = tilesHigh * 8;
    const lookup = makeLookup(6, 4);
    const rand = rng(0xc0ffee);

    const nt = new Uint16Array(tilesWide * tilesHigh);
    for (let i = 0; i < nt.length; i++) {
      if (rand() < 0.2) { nt[i] = 0; continue; }
      nt[i] = packNametableWord(
        Math.floor(rand() * 8),     // some indices exceed the 6 that exist
        Math.floor(rand() * 4),
        rand() < 0.5,
        rand() < 0.5,
        rand() < 0.5,
      );
    }

    const { actual, expected } = run(nt, w, h, tilesWide, lookup);
    expect(firstDiff(actual, expected)).toBe(-1);
  });

  it('writes nothing outside the destination for a partially off-canvas grid', () => {
    // Nametable is wider/taller in cells than the destination canvas.
    const tilesWide = 6, tilesHigh = 6;
    const w = 4 * 8, h = 3 * 8; // canvas only holds 4x3 cells
    const lookup = makeLookup(3, 2);

    const nt = new Uint16Array(tilesWide * tilesHigh);
    for (let i = 0; i < nt.length; i++) {
      nt[i] = packNametableWord(i % 3, i % 2, false, (i & 1) === 0, (i & 2) === 0);
    }

    const { actual, expected } = run(nt, w, h, tilesWide, lookup);
    expect(actual.length).toBe(w * h * 4);
    expect(firstDiff(actual, expected)).toBe(-1);
  });

  it('fully overwrites a previously composed buffer (no ghosting)', () => {
    const tilesWide = 4, tilesHigh = 4;
    const w = 32, h = 32;
    const lookup = makeLookup(3, 2);

    const dense = new Uint16Array(tilesWide * tilesHigh);
    dense.fill(packNametableWord(2, 1, false, false, false));
    const sparse = new Uint16Array(tilesWide * tilesHigh);
    sparse[5] = packNametableWord(1, 0, false, true, true);

    const buf = new Uint8ClampedArray(w * h * 4);
    composeNametable(buf, w, h, dense, tilesWide, lookup);
    composeNametable(buf, w, h, sparse, tilesWide, lookup);

    const fresh = new Uint8ClampedArray(w * h * 4);
    composeNametable(fresh, w, h, sparse, tilesWide, lookup);
    expect(firstDiff(buf, fresh)).toBe(-1);
  });

  it('agrees with the reference for a section-shaped grid at realistic occupancy', () => {
    // Same shape as a real 256x256 section, shrunk in pixels only where the
    // reference implementation would be unreasonably slow: keep the full
    // 256-cell stride but 64 rows, at ~17% occupancy (the measured OJZ rate).
    const tilesWide = 256, tilesHigh = 64;
    const w = tilesWide * 8, h = tilesHigh * 8;
    const lookup = makeLookup(919, 4); // the real zone's tile count
    const rand = rng(0x5eed);

    const nt = new Uint16Array(tilesWide * tilesHigh);
    for (let i = 0; i < nt.length; i++) {
      if (rand() >= 0.173) continue; // stays 0
      nt[i] = packNametableWord(
        Math.floor(rand() * 940), // a few indices past the end of the tileset
        Math.floor(rand() * 4),
        rand() < 0.1,
        rand() < 0.25,
        rand() < 0.25,
      );
    }

    const { actual, expected } = run(nt, w, h, tilesWide, lookup);
    expect(firstDiff(actual, expected)).toBe(-1);
  });
});
