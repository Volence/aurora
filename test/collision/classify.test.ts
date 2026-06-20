// test/collision/classify.test.ts
import { describe, it, expect } from 'vitest';
import type { CollisionProfile, Solidity } from '../../src/core/collision/collision-model';
import {
  classifyProfile,
  COLLISION_KINDS,
  type CollisionKind,
} from '../../src/core/collision/collision-classify';

/** Build a profile from a display angle in degrees (256 units = 360°). */
function mk(deg: number, solidity: Solidity, hasAngle = true): CollisionProfile {
  return {
    heights: new Int8Array(16),
    angle: Math.round((deg / 360) * 256),
    hasAngle,
    solidity,
  };
}

describe('classifyProfile', () => {
  const cases: Array<[CollisionProfile, CollisionKind, string]> = [
    [mk(0, 'all'), 'solid', 'flat + all-solid'],
    [mk(0, 'top'), 'floor', 'flat + top-only'],
    [mk(358, 'top'), 'floor', 'near-360 wraps back to flat floor'],
    [mk(45, 'top'), 'slope', 'shallow rising slope'],
    [mk(300, 'top'), 'slope', 'shallow descending slope'],
    [mk(90, 'all'), 'wall', 'right wall'],
    [mk(270, 'all'), 'wall', 'left wall'],
    [mk(135, 'all'), 'ceiling', 'overhang ceiling'],
    [mk(200, 'all'), 'ceiling', 'underside ceiling'],
    [mk(45, 'all', false), 'solid', 'no-angle + all-solid is solid'],
    [mk(45, 'top', false), 'floor', 'no-angle + top-only is floor'],
  ];

  for (const [profile, expected, label] of cases) {
    it(`classifies ${label} as ${expected}`, () => {
      expect(classifyProfile(profile)).toBe(expected);
    });
  }

  it('exposes the canonical kind list', () => {
    expect(COLLISION_KINDS).toEqual(['floor', 'slope', 'wall', 'ceiling', 'solid']);
  });
});
