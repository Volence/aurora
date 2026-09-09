// ⚠ THE NEAR-MISS SHAPE IN THESE FIXTURES IS ONE PIXEL SHORT, DELIBERATELY.
//
// Until 2026-09-09 it was EIGHT pixels short, and that is the whole of why this
// file could not see a real defect. Relaxing `findFullBlockShapeId`'s test from
// `h >= 16` to `h >= 15` — the exact off-by-one a "full block" search invites —
// left the entire 8,107-row suite green, because the only non-full shape in the
// bank was so far from the boundary that no plausible loosening could reach it.
// A poison must resemble reality: a real S&K-shaped bank is mostly slopes and
// near-solid blocks, so the shape that must NOT be chosen is the one a pixel
// short, not the one half empty.
//
// AND THE SECOND ROW ASSERTS THE PROPERTY, NOT THE THRESHOLD. `toBe(3)` pins
// which index won; it says nothing about the returned shape being solid. The
// fullness row measures the answer through `columnSolidRun` — the same function
// the canvas overlay and the ascii view draw a column with — so "full block"
// means "every column renders floor-to-ceiling", derived from the renderer
// rather than restated as a 16 copied out of the module under test.
//
// WHY IT IS WORTH THIS MUCH CARE. The id this function returns is STAMPED INTO
// AUTHORED DATA by two writers: `chunk-mappings.ts`'s `blockRefToCollisionWord`
// (every solid cell of every chunk in a donor import) and `chunk-migrate.ts`'s
// `migrateLegacyChunkCollision` (a one-shot, load-time, non-idempotent rewrite
// of a legacy chunk's collision planes). A shape one pixel short would be baked
// into the project as its notion of solid ground.

import { describe, it, expect } from 'vitest';
import { findFullBlockShapeId } from '../../src/core/collision/full-block-shape';
import { columnSolidRun } from '../../src/core/collision/collision-render';
import type { CollisionProfile, CollisionProfileSet } from '../../src/core/collision/collision-model';

const profile = (over: Partial<CollisionProfile> = {}): CollisionProfile => ({
  heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'all', ...over,
});
const fullHeights = () => new Int8Array(16).fill(16);
/** A block solid everywhere except `col`, which is `short` px tall. The shape a
 *  loosened threshold picks up by mistake. */
const nearlyFull = (col: number, short: number) => {
  const h = fullHeights();
  h[col] = short;
  return h;
};
/** A rising slope — the bulk of a real bank, and here so the search has
 *  something to walk past that is neither air nor nearly solid. */
const slope = () => new Int8Array(Array.from({ length: 16 }, (_, c) => c + 1));

describe('findFullBlockShapeId', () => {
  it('returns 0 when no profiles are loaded', () => {
    expect(findFullBlockShapeId(null)).toBe(0);
  });

  it('finds the first shape whose 16 height columns are all full', () => {
    const set: CollisionProfileSet = {
      engine: 's4',
      solidCount: 6,
      profiles: [
        profile(), // index 0 — air, skipped
        profile({ heights: new Int8Array(16) }), // index 1 — empty, not full
        profile({ heights: slope() }), // index 2 — an ordinary slope
        // index 3 — ONE PIXEL short in one column. It must not win, and it sits
        // BEFORE the real answer so a loosened threshold returns it rather than
        // merely tying with it.
        profile({ heights: nearlyFull(0, 15) }),
        profile({ heights: fullHeights() }), // index 4 — all full
        profile({ heights: fullHeights() }), // index 5 — also full, but 4 wins
      ],
    };
    expect(findFullBlockShapeId(set)).toBe(4);
  });

  it('⚠ the shape it returns is ACTUALLY full, measured through the renderer', () => {
    // The property, not the threshold. `columnSolidRun` is what the canvas
    // overlay and the ascii view draw a column with, so a full block is one
    // whose every column renders floor-to-ceiling. Nothing here restates the
    // `>= 16` the module tests with.
    const set: CollisionProfileSet = {
      engine: 's4',
      solidCount: 5,
      profiles: [
        profile(),
        profile({ heights: slope() }),
        profile({ heights: nearlyFull(9, 15) }),
        profile({ heights: nearlyFull(0, 15) }),
        profile({ heights: fullHeights() }),
      ],
    };
    // CONTROL: the decoys really are one pixel short, so this fixture poisons
    // the boundary rather than a far-away value.
    expect(columnSolidRun(set.profiles[2].heights[9])).toEqual({ y: 1, h: 15 });

    const id = findFullBlockShapeId(set);
    // LOUD ON UNMEASURABLE. 0 is this function's "cannot seed solid cells"
    // sentinel, and the per-column loop below would pass vacuously over it
    // (there is no shape 0 to walk). A 0 here means the search FAILED on a bank
    // that contains a full block — not that the property holds.
    expect(id, 'this bank contains a full block at index 4; 0 means the search missed it').not.toBe(0);
    const heights = set.profiles[id].heights;
    for (let c = 0; c < 16; c++) {
      expect(columnSolidRun(heights[c]), `shape ${id} column ${c} does not render floor-to-ceiling`)
        .toEqual({ y: 0, h: 16 });
    }
  });

  it('returns 0 when no shape has all-full height columns', () => {
    const set: CollisionProfileSet = {
      engine: 's4',
      solidCount: 3,
      profiles: [profile(), profile({ heights: new Int8Array(16) }), profile({ heights: nearlyFull(3, 15) })],
    };
    expect(findFullBlockShapeId(set)).toBe(0);
  });
});
