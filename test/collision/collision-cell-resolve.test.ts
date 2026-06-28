import { describe, it, expect } from 'vitest';
import { resolveCell, resolvePlaneWords } from '../../src/core/collision/collision-cell-resolve';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import type { CollisionProfile, CollisionProfileSet } from '../../src/core/collision/collision-model';

function ramp(): CollisionProfile {
  const heights = new Int8Array(16);
  for (let c = 0; c < 16; c++) heights[c] = c + 1;
  return { heights, angle: 0x20, hasAngle: true, solidity: 'all' };
}
const SET: CollisionProfileSet = {
  engine: 's4',
  solidCount: 2, // index 0 air, index 1 = ramp
  profiles: [
    { heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'none' },
    ramp(),
  ],
};

describe('resolveCell', () => {
  it('air word resolves to air with no profile', () => {
    const r = resolveCell(SET, 0);
    expect(r.air).toBe(true);
    expect(r.profile).toBeNull();
  });

  it('a plain shape resolves to that base profile', () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' }));
    expect(r.known).toBe(true);
    expect(Array.from(r.profile!.heights)).toEqual(Array.from(ramp().heights));
  });

  it('an x-flipped shape resolves to the mirrored profile', () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 1, xFlip: true, yFlip: false, solidity: 'all' }));
    expect(Array.from(r.profile!.heights)).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("substitutes the word's solidity (jump-through over a solid base)", () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'top' }));
    expect(r.profile!.solidity).toBe('top');
  });

  it('an out-of-range shape resolves known=false', () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 200, xFlip: false, yFlip: false, solidity: 'all' }));
    expect(r.air).toBe(false);
    expect(r.known).toBe(false);
    expect(r.profile).toBeNull();
  });
});

describe('resolvePlaneWords', () => {
  it('prefers the editable plane verbatim', () => {
    const edit = new Uint16Array([5, 6, 7]);
    expect(resolvePlaneWords(edit, null, 3)).toBe(edit);
  });
  it('packs the engine baseline (raw indices) to solid words', () => {
    const out = resolvePlaneWords(null, new Uint8Array([0, 1]), 2);
    expect(out[0]).toBe(0); // air stays air
    expect(out[1]).toBe(packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' }));
  });
  it('all-air when neither source present', () => {
    expect(Array.from(resolvePlaneWords(null, null, 3))).toEqual([0, 0, 0]);
  });
});
