// THE FULL-BLOCK SEARCH, AND WHY IT DOES NOT RETURN A NUMBER.
//
// Until 2026-09-09 this module exported `findFullBlockShapeId(profiles): number`
// and returned 0 for TWO different facts: "no profile set was loaded, so I could
// not look" and "I looked at a real bank and none of its shapes is a full
// block". A caller holding the 0 could not tell them apart however carefully it
// was written — and one caller did not try. `chunk-library-import.ts` passed the
// 0 straight into `importChunks`, wrote the chunks into the project, marked it
// dirty and raised a SUCCESS toast, so "I could not look" rendered to the author
// as "imported, all good" on a gesture that writes their project. See ledger row
// FULLBLOCK-ZERO-IS-TWO-ANSWERS and decision d-36.
//
// ⚠ THE PRODUCER UPSTREAM IS NOT THE BUG, so do not "fix" it there.
// `loadCollisionProfilesFa` (core/project/aeon/load.ts) returns null on any
// missing or unreadable table BY DESIGN — its own comment says the collision
// overlay should "degrade gracefully (the view falls back to flat cell fills)
// rather than crashing", and that is right for the overlay. The defect was a
// SECOND consumer reading that deliberate null as a value. The fix belongs
// exactly here, at the boundary where the two facts met: a shape returns as a
// discriminated result the caller has to open, so there is no value that can
// mean both things and no way to spend one without having asked which it is.
//
// ⚠ AND THE 0 SENTINEL IS GONE FROM THE WHOLE CHAIN, deliberately.
// `importChunks` and `migrateLegacyChunkCollision` used to take
// `fullBlockShape: number` and check `=== 0` themselves. Both checked
// correctly, but a signature that accepts a bare number is a signature that
// accepts a collapsed one, and a corrected comment is not a fix for a value
// that means two things. They take this result type instead, so the only way to
// reach the shape id is through a `status === 'found'` narrowing the compiler
// enforces.

import type { CollisionProfileSet } from './collision-model';

/**
 * The answer to "which base-bank shape is the plain solid block?", as three
 * distinguishable facts rather than one number.
 *
 * - `found`        — a real bank, and `shapeId` is its plain solid block.
 * - `no-full-block`— a real bank was searched and contains no full block. The
 *                    project HAS collision data; it just has nothing to mark a
 *                    cell solid with. That is a bank problem, and a caller may
 *                    reasonably word it differently from the case below.
 * - `no-profiles`  — no profile set was loaded at all, so nothing was searched.
 *                    Not a statement about the bank: it is "I could not look",
 *                    which is what an aeon project whose collision tables are
 *                    missing, renamed or in the other well-known location opens
 *                    with (the open succeeds, the field is null).
 *
 * Only `found` carries a shape id, so the two blind cases cannot be spent as if
 * they were one.
 */
export type FullBlockShapeLookup =
  | { readonly status: 'found'; readonly shapeId: number }
  | { readonly status: 'no-full-block' }
  | { readonly status: 'no-profiles' };

/** True when the lookup produced a shape id — the one narrowing every writer of
 *  authored collision must pass through before it can stamp anything. */
export function hasFullBlockShape(
  lookup: FullBlockShapeLookup,
): lookup is { readonly status: 'found'; readonly shapeId: number } {
  return lookup.status === 'found';
}

/**
 * Find the base-bank shape whose 16 height columns are all full (16px) — the
 * plain solid block. Resolved from the loaded profile set, never hardcoded (the
 * S&K import owns the ordering).
 *
 * Returns `no-profiles` when there is no set to search and `no-full-block` when
 * a real set contains none. Callers must handle both; see the header for why
 * they are not the same answer.
 */
export function lookupFullBlockShape(profiles: CollisionProfileSet | null): FullBlockShapeLookup {
  if (!profiles) return { status: 'no-profiles' };
  for (let i = 1; i < profiles.solidCount; i++) {
    const p = profiles.profiles[i];
    if (p && p.heights.length === 16 && p.heights.every(h => h >= 16)) {
      return { status: 'found', shapeId: i };
    }
  }
  return { status: 'no-full-block' };
}
