import type { Solidity } from './collision-model';

/** One authored collision cell, packed into a 16-bit word — the classic Sonic
 *  chunk-entry layout, per collision plane (path A or B):
 *    bits 0-9  shape index (0..1023; 0 = air)
 *    bit  10   X-flip  (mirror horizontally → the other slope direction)
 *    bit  11   Y-flip  (flip vertically → floor↔ceiling, up↔down)
 *    bits 12-13 solidity (this plane's path): none/top/sides-bottom/all
 *    bits 14-15 spare
 *  The build-time bake resolves the flip + solidity into the runtime 1-byte attr
 *  index (collision_pipeline flip_profile_x/y + flip_angle_x/y); the runtime
 *  collision plane stays one byte per cell. (The full Sonic "4 solidity bits" =
 *  this 2-bit field on plane A's word + the 2-bit field on plane B's word.) */
export interface CollisionCell {
  shape: number;
  xFlip: boolean;
  yFlip: boolean;
  solidity: Solidity;
}

const SOLIDITY_BITS: Record<Solidity, number> = { none: 0, top: 1, 'sides-bottom': 2, all: 3 };
const SOLIDITY_FROM_BITS: Solidity[] = ['none', 'top', 'sides-bottom', 'all'];

/** A fully-air cell (no shape, no flags). */
export const AIR_CELL = 0;

export function packCollisionCell(c: CollisionCell): number {
  return (c.shape & 0x3FF)
    | (c.xFlip ? 0x400 : 0)
    | (c.yFlip ? 0x800 : 0)
    | (SOLIDITY_BITS[c.solidity] << 12);
}

export function unpackCollisionCell(word: number): CollisionCell {
  return {
    shape: word & 0x3FF,
    xFlip: (word & 0x400) !== 0,
    yFlip: (word & 0x800) !== 0,
    solidity: SOLIDITY_FROM_BITS[(word >> 12) & 0x3],
  };
}
