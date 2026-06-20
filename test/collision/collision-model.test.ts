import { describe, it, expect } from 'vitest';
import { angleDegrees, isAir, isKnownProfile, type CollisionProfile, type CollisionProfileSet } from '../../src/core/collision/collision-model';

const profile = (over: Partial<CollisionProfile> = {}): CollisionProfile => ({
  heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'all', ...over,
});
const set = (n: number, solidCount = n): CollisionProfileSet => ({
  profiles: Array.from({ length: n }, () => profile()), engine: 's4', solidCount,
});

describe('angleDegrees', () => {
  it('returns null when the angle is unusable', () => {
    expect(angleDegrees(profile({ hasAngle: false, angle: 64 }))).toBeNull();
  });
  it('converts a 256-unit angle to degrees', () => {
    expect(angleDegrees(profile({ hasAngle: true, angle: 0 }))).toBe(0);
    expect(angleDegrees(profile({ hasAngle: true, angle: 64 }))).toBe(90);   // quarter turn
    expect(angleDegrees(profile({ hasAngle: true, angle: 128 }))).toBe(180);
  });
});

describe('isAir / isKnownProfile', () => {
  it('treats index 0 as air, never a known profile', () => {
    const s = set(4);
    expect(isAir(s, 0)).toBe(true);
    expect(isKnownProfile(s, 0)).toBe(false);
  });
  it('in-range nonzero index is a known profile, not air', () => {
    const s = set(4);
    expect(isAir(s, 2)).toBe(false);
    expect(isKnownProfile(s, 2)).toBe(true);
  });
  it('out-of-range index is neither air nor known (the "unknown" case)', () => {
    const s = set(4);
    expect(isAir(s, 9)).toBe(false);
    expect(isKnownProfile(s, 9)).toBe(false);
  });
  it('an index past solidCount (zero-padding) is unknown even if < profiles.length', () => {
    const s = set(4, 2); // 4 slots but only 2 meaningful
    expect(isKnownProfile(s, 1)).toBe(true);
    expect(isKnownProfile(s, 3)).toBe(false); // 3 < length(4) but >= solidCount(2)
  });
  it('null set: nothing is known', () => {
    expect(isKnownProfile(null, 1)).toBe(false);
    expect(isAir(null, 0)).toBe(true); // 0 is always air regardless of set
  });
});
