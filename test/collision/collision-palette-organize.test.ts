import { describe, it, expect } from 'vitest';
import { organizePalette, facesRight, fullness, effectiveXFlip } from '../../src/core/collision/collision-palette-organize';
import type { CollisionProfile, CollisionProfileSet } from '../../src/core/collision/collision-model';

// Helpers to build profiles.
function prof(heights: number[], angle: number, hasAngle = true): CollisionProfile {
  return { heights: Int8Array.from(heights), angle, hasAngle, solidity: 'all' };
}
// A right-rising floor (low-left, high-right): solid mass on the right → faces right.
const RIGHT_RISE = prof([...Array(8).fill(3), ...Array(8).fill(4)], 0xfc);
// Its mirror: high-left → canonical left.
const LEFT_RISE = prof([...Array(8).fill(4), ...Array(8).fill(3)], 0x04);
const FULL = prof(Array(16).fill(16), 0xff, false); // symmetric full block
const SHALLOW_RIGHT = prof([...Array(12).fill(1), ...Array(4).fill(2)], 0xfe);
const STEEP_RIGHT = prof([...Array(4).fill(2), ...Array(12).fill(14)], 0xe0);

function setOf(...profiles: CollisionProfile[]): CollisionProfileSet {
  const air = prof(Array(16).fill(0), 0, true);
  air.solidity = 'none';
  const all = [air, ...profiles];
  return { engine: 's4', profiles: all, solidCount: all.length };
}

describe('facesRight', () => {
  it('right-heavy shape faces right; its left mirror does not', () => {
    expect(facesRight(RIGHT_RISE)).toBe(true);
    expect(facesRight(LEFT_RISE)).toBe(false);
  });
  it('symmetric full block does not face right', () => {
    expect(facesRight(FULL)).toBe(false);
  });
});

describe('organizePalette', () => {
  it('re-orients every right-facing shape to canonical-left (mirrorX + mirrored profile)', () => {
    const e = organizePalette(setOf(RIGHT_RISE))[0];
    expect(e.shape).toBe(1);
    expect(e.mirrorX).toBe(true);
    // profile drawn is the LEFT form (high on the left)
    expect(Array.from(e.profile.heights)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3]);
  });

  it('a natively-left shape keeps mirrorX false', () => {
    const e = organizePalette(setOf(LEFT_RISE))[0];
    expect(e.mirrorX).toBe(false);
  });

  it('collapses an exact mirror pair to ONE slot, preferring the native-left representative', () => {
    // index 1 = RIGHT_RISE, index 2 = LEFT_RISE (its mirror). Same canonical → one entry.
    const out = organizePalette(setOf(RIGHT_RISE, LEFT_RISE));
    expect(out).toHaveLength(1);
    expect(out[0].mirrorX).toBe(false);   // preferred the one needing no flip
    expect(out[0].shape).toBe(2);         // LEFT_RISE
  });

  it('sorts by angle then by fullness (least-full → most-full)', () => {
    // SHALLOW (~2°) full=20, RIGHT_RISE (354°→canonical 6°) full=56, STEEP (~45°) bigger
    const out = organizePalette(setOf(RIGHT_RISE, SHALLOW_RIGHT, STEEP_RIGHT, FULL));
    const degs = out.map((e) => (e.profile.hasAngle ? Math.round((e.profile.angle / 256) * 360) : -1));
    // angle ascending
    for (let i = 1; i < degs.length; i++) expect(degs[i]).toBeGreaterThanOrEqual(degs[i - 1]);
  });

  it('skips air-equivalent padding slots (no blank thumbnail)', () => {
    const air = prof(Array(16).fill(0), 0, true); air.solidity = 'none';
    // a bank with a real shape, then an air-padding slot, then a real shape after it
    // (so solidCount includes the padding): RIGHT_RISE, AIR, FULL
    const set: CollisionProfileSet = { engine: 's4', profiles: [air, RIGHT_RISE, air, FULL], solidCount: 4 };
    const out = organizePalette(set);
    expect(out.every((e) => e.profile.heights.some((h) => h !== 0))).toBe(true);
    expect(out.map((e) => e.shape).sort()).toEqual([1, 3]); // the air slot (index 2) is excluded
  });

  it('within one angle, ties break by ascending fullness', () => {
    const thin = prof([...Array(8).fill(1), ...Array(8).fill(2)], 0xfc);  // canonical 6°, full=24
    const thick = RIGHT_RISE;                                              // canonical 6°, full=56
    const out = organizePalette(setOf(thick, thin));
    // same canonical angle → thinner first
    expect(fullness(out[0].profile)).toBeLessThan(fullness(out[1].profile));
  });
});

describe('effectiveXFlip', () => {
  it('XORs the entry mirror with the user flip toggle', () => {
    expect(effectiveXFlip(false, false)).toBe(false); // native-left, no user flip → left
    expect(effectiveXFlip(false, true)).toBe(true);   // native-left, user flip → right
    expect(effectiveXFlip(true, false)).toBe(true);   // mirrored entry shown left, painted flipped
    expect(effectiveXFlip(true, true)).toBe(false);   // mirrored entry + user flip → native right
  });
});
