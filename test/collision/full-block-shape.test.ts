import { describe, it, expect } from 'vitest';
import { findFullBlockShapeId } from '../../src/core/collision/full-block-shape';
import type { CollisionProfile, CollisionProfileSet } from '../../src/core/collision/collision-model';

const profile = (over: Partial<CollisionProfile> = {}): CollisionProfile => ({
  heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'all', ...over,
});
const fullHeights = () => new Int8Array(16).fill(16);

describe('findFullBlockShapeId', () => {
  it('returns 0 when no profiles are loaded', () => {
    expect(findFullBlockShapeId(null)).toBe(0);
  });

  it('finds the first shape whose 16 height columns are all full', () => {
    const set: CollisionProfileSet = {
      engine: 's4',
      solidCount: 5,
      profiles: [
        profile(), // index 0 — air, skipped
        profile({ heights: new Int8Array(16) }), // index 1 — empty, not full
        profile({ heights: new Int8Array([...fullHeights()].map((h, i) => (i === 0 ? 8 : h))) }), // index 2 — mostly full but one short column
        profile({ heights: fullHeights() }), // index 3 — all full
        profile({ heights: fullHeights() }), // index 4 — also all full, but 3 wins (first match)
      ],
    };
    expect(findFullBlockShapeId(set)).toBe(3);
  });

  it('returns 0 when no shape has all-full height columns', () => {
    const set: CollisionProfileSet = {
      engine: 's4',
      solidCount: 2,
      profiles: [profile(), profile({ heights: new Int8Array(16) })],
    };
    expect(findFullBlockShapeId(set)).toBe(0);
  });
});
