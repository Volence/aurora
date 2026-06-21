import { describe, it, expect } from 'vitest';
import { flipProfile, flipAngleX, flipAngleY } from '../../src/core/collision/collision-flip';
import type { CollisionProfile } from '../../src/core/collision/collision-model';

// A right-ascending 45° ramp: columns rise 1..16 left→right, angle 0x20 (≈45°).
function ramp(): CollisionProfile {
  const heights = new Int8Array(16);
  for (let c = 0; c < 16; c++) heights[c] = c + 1; // 1..16
  return { heights, angle: 0x20, hasAngle: true, solidity: 'all' };
}

describe('collision flip (mirrors the engine bake math)', () => {
  it('xflip reverses the height columns and negates the angle', () => {
    const f = flipProfile(ramp(), true, false);
    expect(Array.from(f.heights)).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(f.angle).toBe(flipAngleX(0x20)); // -0x20 & 0xFF = 0xE0
    expect(f.angle).toBe(0xE0);
  });

  it('yflip turns a partial floor into a hanging ceiling (256-h, full/empty fixed)', () => {
    // column heights 0,16 stay; a 1..15 floor becomes 256-h (signed negative = hanging)
    const p: CollisionProfile = { heights: Int8Array.from([0, 16, 1, 8, 15]), angle: 0x10, hasAngle: true, solidity: 'all' };
    const f = flipProfile(p, false, true);
    // 0→0, 16→16, 1→-1, 8→-8, 15→-15  (signed)
    expect(Array.from(f.heights).slice(0, 5)).toEqual([0, 16, -1, -8, -15]);
    expect(f.angle).toBe(flipAngleY(0x10));
  });

  it('no-flip returns the profile unchanged (same reference)', () => {
    const p = ramp();
    expect(flipProfile(p, false, false)).toBe(p);
  });

  it('preserves the no-angle (odd) flag through flips', () => {
    const p: CollisionProfile = { heights: new Int8Array(16), angle: 0xFF, hasAngle: false, solidity: 'top' };
    expect(flipProfile(p, true, false).hasAngle).toBe(false);
    expect(flipProfile(p, false, true).hasAngle).toBe(false);
  });
});
