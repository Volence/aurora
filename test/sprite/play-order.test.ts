import { describe, it, expect } from 'vitest';
import { buildPlayOrder } from '../../src/renderer/state/spriteStore';

describe('buildPlayOrder', () => {
  it('forward is 0..n-1', () => {
    expect(buildPlayOrder(3, 'forward')).toEqual([0, 1, 2]);
  });
  it('reverse is n-1..0', () => {
    expect(buildPlayOrder(3, 'reverse')).toEqual([2, 1, 0]);
  });
  it('pingpong does not repeat the endpoints', () => {
    expect(buildPlayOrder(3, 'pingpong')).toEqual([0, 1, 2, 1]);
    expect(buildPlayOrder(4, 'pingpong')).toEqual([0, 1, 2, 3, 2, 1]);
  });
  it('handles 0 and 1 steps', () => {
    expect(buildPlayOrder(0, 'forward')).toEqual([]);
    expect(buildPlayOrder(1, 'pingpong')).toEqual([0]);
    expect(buildPlayOrder(1, 'forward')).toEqual([0]);
  });
});
