import { describe, it, expect } from 'vitest';
import {
  findPoolMatch, emptyAvailability, poolTileEntries, TILE_BYTES,
} from '../tile-pool-match';
import { canonicalTile } from '../tile-canon';

/** A pool of `n` tiles where tile t is filled with byte value t. */
function pool(n: number): Uint8Array {
  const p = new Uint8Array(n * TILE_BYTES);
  for (let t = 0; t < n; t++) p.fill(t, t * TILE_BYTES, (t + 1) * TILE_BYTES);
  return p;
}

const want = (v: number) => new Uint8Array(TILE_BYTES).fill(v);

describe('findPoolMatch — exact', () => {
  it('finds a byte-identical tile', () => {
    const r = findPoolMatch(pool(8), want(5), emptyAvailability(), { allowFlips: false });
    expect(r).toEqual({ tileIndex: 5, xf: false, yf: false });
  });

  it('returns null when nothing matches', () => {
    expect(findPoolMatch(pool(8), want(99), emptyAvailability(), { allowFlips: false })).toBeNull();
  });

  it('skips a slot whose bytes this gesture already replaced', () => {
    const avail = emptyAvailability();
    avail.allocated.add(5);
    expect(findPoolMatch(pool(8), want(5), avail, { allowFlips: false })).toBeNull();
  });

  it('still matches a slot this gesture merely REUSED — its bytes are unchanged', () => {
    const avail = emptyAvailability();
    avail.matched.add(5);
    const r = findPoolMatch(pool(8), want(5), avail, { allowFlips: false });
    expect(r).toEqual({ tileIndex: 5, xf: false, yf: false });
  });
});

// --- flip-aware ------------------------------------------------------------

/** Pack 64 entries into a 32-byte 4bpp tile, high nibble first. */
function pack(entries: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE_BYTES);
  for (let i = 0; i < TILE_BYTES; i++) {
    out[i] = ((entries[i * 2] & 15) << 4) | (entries[i * 2 + 1] & 15);
  }
  return out;
}

/** Two lit entries, symmetric in no axis. */
const asymmetric = () => {
  const e = new Uint8Array(64);
  e[0] = 1; e[9] = 2;
  return e;
};

const flipX = (e: Uint8Array) => {
  const o = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) o[y * 8 + x] = e[y * 8 + (7 - x)];
  return o;
};

describe('findPoolMatch — flip-aware', () => {
  it('matches an x-flipped tile and reports the flip', () => {
    const p = new Uint8Array(TILE_BYTES * 4);
    p.set(pack(asymmetric()), 2 * TILE_BYTES);
    const w = pack(flipX(asymmetric()));

    const r = findPoolMatch(p, w, emptyAvailability(), { allowFlips: true });
    expect(r).not.toBeNull();
    expect(r!.tileIndex).toBe(2);
    expect(r!.xf).toBe(true);
    expect(r!.yf).toBe(false);
  });

  it('does not match a flip when allowFlips is off', () => {
    const p = new Uint8Array(TILE_BYTES * 4);
    p.set(pack(asymmetric()), 2 * TILE_BYTES);
    const w = pack(flipX(asymmetric()));
    expect(findPoolMatch(p, w, emptyAvailability(), { allowFlips: false })).toBeNull();
  });

  it('reports an orientation that actually reproduces the wanted tile', () => {
    const p = new Uint8Array(TILE_BYTES * 4);
    p.set(pack(asymmetric()), 2 * TILE_BYTES);
    const w = pack(flipX(asymmetric()));
    const r = findPoolMatch(p, w, emptyAvailability(), { allowFlips: true })!;

    // Applying the reported orientation to the STORED tile must give `want`.
    const storedEntries = poolTileEntries(p, r.tileIndex);
    const applied = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const sx = r.xf ? 7 - x : x, sy = r.yf ? 7 - y : y;
        applied[y * 8 + x] = storedEntries[sy * 8 + sx];
      }
    }
    const wantEntries = poolTileEntries(w, 0);
    expect(Array.from(applied)).toEqual(Array.from(wantEntries));
    expect(canonicalTile(applied).key).toBe(canonicalTile(wantEntries).key);
  });

  it('a tile that is its own mirror matches with no flip', () => {
    const sym = new Uint8Array(64);
    sym[0] = 3; sym[7] = 3; // symmetric in x
    const p = new Uint8Array(TILE_BYTES * 2);
    p.set(pack(sym), TILE_BYTES);
    const r = findPoolMatch(p, pack(sym), emptyAvailability(), { allowFlips: true })!;
    expect(r.xf).toBe(false);
    expect(r.yf).toBe(false);
  });
});
