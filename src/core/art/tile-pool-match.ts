// src/core/art/tile-pool-match.ts
//
// "IS THIS TILE ALREADY IN THE POOL?" — one answer, two callers.
//
// Lifted out of classic-surface-plan.ts, where it was private, because 2C needs
// the identical question with flips allowed and a private function cannot be
// shared. Phase 1 asks with `allowFlips: false` and behaves exactly as it always
// did.
//
// THREE STATES, NOT ONE EXCLUSION SET. A gesture touches pool slots in two ways
// and they are not interchangeable:
//
//   matched   — reused as-is. Its bytes are still what is on disk, so it remains
//               a legal match for another cell wanting the same content (that is
//               the conservation this function exists for) — but it must NOT be
//               handed out as a free slot, or the allocator overwrites bytes a
//               block is already pointing at.
//   allocated — given new bytes by this gesture. Neither matchable (its on-disk
//               bytes are stale, so a match would repoint one cell at another
//               cell's paint) nor allocatable.
//
// Collapsing the two into one set costs correctness in one direction or
// conservation in the other. Phase 1 shipped with the `matched` half missing;
// see the regression test in classic-surface-plan.test.ts.
//
// Pure core — no store, no document types.

import { canonicalTile, TILE_ENTRIES } from './tile-canon';

/** A 4bpp 8x8 tile: 64 entries at two per byte. */
export const TILE_BYTES = 32;

/** Pool slots this gesture has already committed to. See the header. */
export interface PoolAvailability {
  /** Reused as-is: still matchable, never allocatable. */
  matched: Set<number>;
  /** Given new bytes: neither matchable nor allocatable. */
  allocated: Set<number>;
}

export function emptyAvailability(): PoolAvailability {
  return { matched: new Set<number>(), allocated: new Set<number>() };
}

/** Every slot that must not be handed out as free. */
export function unavailableForAllocation(a: PoolAvailability): Set<number> {
  return new Set<number>([...a.matched, ...a.allocated]);
}

export interface PoolMatch {
  tileIndex: number;
  /** The orientation a referencing cell must carry to render the wanted tile. */
  xf: boolean;
  yf: boolean;
}

function bytesEqualAt(pool: Uint8Array, tileIndex: number, w: Uint8Array): boolean {
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) if (pool[base + i] !== w[i]) return false;
  return true;
}

/**
 * The 64 entries of a packed 4bpp tile — two per byte, HIGH NIBBLE FIRST.
 *
 * The nibble order is not a guess: classic-tile-buffer.ts:61 packs the even
 * pixel into the high nibble, and a reader that disagreed would make every
 * flip comparison wrong in a way that still looks like art.
 *
 * Works on a whole pool (`tileIndex` selects the slot) or on a standalone
 * 32-byte tile (`tileIndex` 0).
 */
export function poolTileEntries(pool: Uint8Array, tileIndex: number, out?: Uint8Array): Uint8Array {
  const dst = out ?? new Uint8Array(TILE_ENTRIES);
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) {
    const b = pool[base + i];
    dst[i * 2] = (b >> 4) & 0x0f;
    dst[i * 2 + 1] = b & 0x0f;
  }
  return dst;
}

/**
 * The inverse of `poolTileEntries`: 64 entries into a 32-byte 4bpp tile.
 *
 * Kept beside its inverse deliberately — the nibble order is the one rule both
 * share, and a pack that disagreed with the unpack would round-trip wrong in a
 * way that still renders as art.
 */
export function packTileEntries(entries: Uint8Array, out?: Uint8Array): Uint8Array {
  const dst = out ?? new Uint8Array(TILE_BYTES);
  for (let i = 0; i < TILE_BYTES; i++) {
    dst[i] = ((entries[i * 2] & 0x0f) << 4) | (entries[i * 2 + 1] & 0x0f);
  }
  return dst;
}

/**
 * A pool tile whose content equals `want`, or null.
 *
 * With `allowFlips`, "equals" means "equals under one of the four VDP
 * orientations", and the returned xf/yf are the flips a referencing cell must
 * carry. Without it, only a byte-identical tile matches and the orientation is
 * always false/false — which is exactly phase 1's historical behaviour, so
 * phase 1's suite passing unedited is the guard that nothing moved.
 */
export function findPoolMatch(
  pool: Uint8Array,
  want: Uint8Array,
  availability: PoolAvailability,
  opts: { allowFlips: boolean },
): PoolMatch | null {
  const count = Math.floor(pool.length / TILE_BYTES);

  if (!opts.allowFlips) {
    for (let t = 0; t < count; t++) {
      if (availability.allocated.has(t)) continue;
      if (bytesEqualAt(pool, t, want)) return { tileIndex: t, xf: false, yf: false };
    }
    return null;
  }

  const wantCanon = canonicalTile(poolTileEntries(want, 0));
  const scratch = new Uint8Array(TILE_ENTRIES);
  for (let t = 0; t < count; t++) {
    if (availability.allocated.has(t)) continue;
    const canon = canonicalTile(poolTileEntries(pool, t, scratch));
    if (canon.key !== wantCanon.key) continue;
    // Both orientations are expressed relative to the SAME canonical form, so
    // the flips a cell needs are the ones taking the stored tile to canonical
    // and canonical on to `want` — the XOR of the two. Flips are involutions,
    // so this composes with no direction to get backwards.
    return {
      tileIndex: t,
      xf: canon.xf !== wantCanon.xf,
      yf: canon.yf !== wantCanon.yf,
    };
  }
  return null;
}
