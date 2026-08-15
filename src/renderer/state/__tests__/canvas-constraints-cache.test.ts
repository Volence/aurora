import { describe, it, expect, beforeEach } from 'vitest';
import { createBuffer } from '../../../core/art/pixel-ops';
import { constraintProfile } from '../../../core/art/canvas-profiles';
import {
  cachedConstraints, __resetConstraintsCache, __constraintsScanCount,
} from '../canvas-constraints-cache';

const profile = constraintProfile('genesis-level-art');
const origin = { originX: 0, originY: 0 };

describe('cachedConstraints', () => {
  beforeEach(() => __resetConstraintsCache());

  it('scans once for repeated identical calls', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin });
    cachedConstraints({ pixels, profile, origin });
    expect(__constraintsScanCount()).toBe(1);
  });

  it('returns the identical object, so a React consumer sees a stable reference', () => {
    const pixels = createBuffer(16, 16);
    expect(cachedConstraints({ pixels, profile, origin }))
      .toBe(cachedConstraints({ pixels, profile, origin }));
  });

  it('rescans when the buffer identity changes', () => {
    cachedConstraints({ pixels: createBuffer(16, 16), profile, origin });
    cachedConstraints({ pixels: createBuffer(16, 16), profile, origin });
    expect(__constraintsScanCount()).toBe(2);
  });

  it('rescans when the origin moves', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin });
    cachedConstraints({ pixels, profile, origin: { originX: 3, originY: 0 } });
    expect(__constraintsScanCount()).toBe(2);
  });

  it('rescans when the profile changes', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin });
    cachedConstraints({ pixels, profile: constraintProfile('genesis-sprite'), origin });
    expect(__constraintsScanCount()).toBe(2);
  });

  // The origin is compared BY VALUE, not by identity: the store hands out a
  // fresh {originX, originY} object on every document clone, so an identity
  // comparison would miss the cache on every single call and quietly scan per
  // render — a cache that looks like a cache and is not one.
  it('hits the cache for an equal origin object', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin: { originX: 3, originY: 4 } });
    cachedConstraints({ pixels, profile, origin: { originX: 3, originY: 4 } });
    expect(__constraintsScanCount()).toBe(1);
  });

  it('answers correctly after a miss, not just quickly', () => {
    const a = createBuffer(16, 8);
    const b = createBuffer(8, 8);
    const ra = cachedConstraints({ pixels: a, profile, origin });
    const rb = cachedConstraints({ pixels: b, profile, origin });
    expect(ra.tiles.fullCells).toBe(2);
    expect(rb.tiles.fullCells).toBe(1);
  });
});
