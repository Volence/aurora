// WHICH SHAPES TO OFFER, AND IN WHAT ORDER.
//
// The table is global across all six zones — 256 slots, ~247 distinct patterns
// — but any one zone uses a small fraction of it. Offering all 256 flat makes
// the picker a haystack; offering only the used ones makes the editor unable to
// express anything new. So: this zone's set first, marked, then the rest.

import { describe, it, expect } from 'vitest';
import { collisionShapeChoices } from '../collision-choices';
import type { LevelDoc } from '../model';

function doc(colind: number[], shapeCount = 8): LevelDoc {
  return {
    collision: {
      colind: new Uint8Array(colind),
      shapes: {
        heights: Array.from({ length: shapeCount }, () => new Int8Array(16)),
        angles: new Uint8Array(shapeCount),
      },
    },
  } as unknown as LevelDoc;
}

describe('collisionShapeChoices', () => {
  it('puts the shapes this zone uses first, and marks them', () => {
    //                        block: 0  1  2  3
    const c = collisionShapeChoices(doc([4, 5, 3, 5]));
    const used = c.filter((s) => s.usedInZone).map((s) => s.index);
    // Blocks 1..3 use shapes 5, 3, 5. Block 0's entry (4) is EXCLUDED — the
    // engine short-circuits before reading it, so it is not a use.
    expect(used).toEqual([3, 5]);
    expect(c.slice(0, 2).map((s) => s.index)).toEqual([3, 5]);
  });

  it('still offers every shape the table defines', () => {
    const c = collisionShapeChoices(doc([0, 5], 8));
    expect(c).toHaveLength(8);
    expect(new Set(c.map((s) => s.index)).size).toBe(8);
  });

  it('counts how many blocks point at each shape, block 0 excluded', () => {
    const c = collisionShapeChoices(doc([5, 5, 5, 3]));
    expect(c.find((s) => s.index === 5)!.blocks).toBe(2);   // blocks 1,2 — not block 0
    expect(c.find((s) => s.index === 3)!.blocks).toBe(1);
    expect(c.find((s) => s.index === 1)!.blocks).toBe(0);
  });

  it('carries each shape heights so the picker need not reach into the doc', () => {
    const c = collisionShapeChoices(doc([0, 1]));
    expect(c[0].heights).toBeInstanceOf(Int8Array);
    expect(c[0].heights).toHaveLength(16);
  });
});
