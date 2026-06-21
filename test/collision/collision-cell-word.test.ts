import { describe, it, expect } from 'vitest';
import { packCollisionCell, unpackCollisionCell, AIR_CELL } from '../../src/core/collision/collision-cell-word';

describe('collision cell word (shape + flip + per-plane 2-bit solidity)', () => {
  it('round-trips all fields', () => {
    const cell = { shape: 137, xFlip: true, yFlip: false, solidity: 'top' as const };
    expect(unpackCollisionCell(packCollisionCell(cell))).toEqual(cell);
  });

  it('packs to the classic bit positions (shape 0-9, xflip 10, yflip 11, solidity 12-13)', () => {
    expect(packCollisionCell({ shape: 0x3FF, xFlip: false, yFlip: false, solidity: 'none' })).toBe(0x03FF);
    expect(packCollisionCell({ shape: 0, xFlip: true, yFlip: false, solidity: 'none' })).toBe(0x0400);
    expect(packCollisionCell({ shape: 0, xFlip: false, yFlip: true, solidity: 'none' })).toBe(0x0800);
    expect(packCollisionCell({ shape: 0, xFlip: false, yFlip: false, solidity: 'all' })).toBe(0x3000); // 3 << 12
    expect(packCollisionCell({ shape: 0, xFlip: false, yFlip: false, solidity: 'sides-bottom' })).toBe(0x2000);
    expect(packCollisionCell({ shape: 0, xFlip: false, yFlip: false, solidity: 'top' })).toBe(0x1000);
  });

  it('maps the solidity enum to/from the 2-bit field', () => {
    for (const s of ['none', 'top', 'sides-bottom', 'all'] as const) {
      expect(unpackCollisionCell(packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: s })).solidity).toBe(s);
    }
  });

  it('AIR_CELL is 0 and unpacks to air (shape 0, no flags)', () => {
    expect(AIR_CELL).toBe(0);
    expect(unpackCollisionCell(0)).toEqual({ shape: 0, xFlip: false, yFlip: false, solidity: 'none' });
  });
});
