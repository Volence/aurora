import { describe, it, expect } from 'vitest';
import { s4CollisionAdapter } from '../../src/core/collision/adapters/s4-collision-adapter';
import type { CollisionTables } from '../../src/core/collision/collision-adapter';

function tables(): CollisionTables {
  const heightmaps = new Uint8Array(256 * 16);
  const angles = new Uint8Array(256);
  const solidity = new Uint8Array(256);
  // profile 1 = full block (sixteen 0x10), solidity 'all', angle 0 (usable)
  for (let c = 0; c < 16; c++) heightmaps[1 * 16 + c] = 0x10;
  solidity[1] = 3; angles[1] = 0;
  // profile 2 = hanging ceiling (0xF0 = -16), solidity 'sides-bottom', angle 64
  for (let c = 0; c < 16; c++) heightmaps[2 * 16 + c] = 0xF0;
  solidity[2] = 2; angles[2] = 64;
  // profile 3 = a malformed/odd byte 0x40 (signed +64) + odd angle (no-angle), solidity 'top'
  heightmaps[3 * 16 + 0] = 0x40; heightmaps[3 * 16 + 1] = 0xFF; // +64 and -1
  solidity[3] = 1; angles[3] = 7; // odd → no angle
  return { heightmaps, angles, solidity };
}

describe('s4CollisionAdapter.decodeProfiles', () => {
  const set = s4CollisionAdapter.decodeProfiles(tables());

  it('produces 256 profiles with engine id s4', () => {
    expect(set.engine).toBe('s4');
    expect(set.profiles).toHaveLength(256);
  });
  it('decodes a full block (0x10 -> +16, solidity all, angle usable)', () => {
    const p = set.profiles[1];
    expect(Array.from(p.heights)).toEqual(new Array(16).fill(16));
    expect(p.solidity).toBe('all');
    expect(p.hasAngle).toBe(true);
    expect(p.angle).toBe(0);
  });
  it('decodes a hanging ceiling (0xF0 -> -16, sides-bottom)', () => {
    const p = set.profiles[2];
    expect(p.heights[0]).toBe(-16);
    expect(p.solidity).toBe('sides-bottom');
  });
  it('sign-extends like ext.w (0x40 -> +64, 0xFF -> -1) and reads the odd-angle flag', () => {
    const p = set.profiles[3];
    expect(p.heights[0]).toBe(64);   // 0x40 stays positive (NOT -192)
    expect(p.heights[1]).toBe(-1);   // 0xFF -> -1
    expect(p.solidity).toBe('top');
    expect(p.hasAngle).toBe(false);  // angle 7 is odd
  });
  it('profile 0 is air (all-zero heights, solidity none)', () => {
    expect(Array.from(set.profiles[0].heights)).toEqual(new Array(16).fill(0));
    expect(set.profiles[0].solidity).toBe('none');
  });
  it('solidCount is 1 + the last meaningful index (the rest is zero padding)', () => {
    // profiles 1,2,3 are populated; 4..255 are zeroed padding.
    expect(set.profiles).toHaveLength(256);
    expect(set.solidCount).toBe(4);
  });
});
