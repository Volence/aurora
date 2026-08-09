import { describe, it, expect } from 'vitest';
import { createChunkDef } from '../../src/core/model/s4-types';
import { migrateLegacyChunkCollision } from '../../src/core/model/chunk-migrate';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

const FB = 7; // stand-in full-block shape id for tests

describe('ChunkDef collision planes', () => {
  it('createChunkDef yields zero-filled word planes at (w/2)*(h/2)', () => {
    const c = createChunkDef('x', 'X', 16, 16);
    expect(c.collisionA).toBeInstanceOf(Uint16Array);
    expect(c.collisionA.length).toBe(64);
    expect(c.collisionB.length).toBe(64);
    expect([...c.collisionA].every(w => w === 0)).toBe(true);
  });

  it('legacy byte plane migrates: solidAll wins, then solidTop, else air; B mirrors A', () => {
    const c = createChunkDef('x', 'X', 4, 4); // 2x2 cells
    const legacy = new Uint8Array(16);
    // cell(0,0): tiles 0,1,4,5 — solidAll (bit0)
    legacy[0] = legacy[1] = legacy[4] = legacy[5] = 1;
    // cell(1,0): solidTop (bit1)
    legacy[2] = legacy[3] = legacy[6] = legacy[7] = 2;
    // cell(0,1): both bits — solidAll wins
    legacy[8] = legacy[9] = legacy[12] = legacy[13] = 3;
    // cell(1,1): 0 — air
    migrateLegacyChunkCollision(c, legacy, FB);
    const all = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    const top = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'top' });
    expect([...c.collisionA]).toEqual([all, top, all, 0]);
    expect([...c.collisionB]).toEqual([...c.collisionA]);
  });

  it('migration is a no-op when word planes are already populated (idempotent load)', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    c.collisionA[0] = 0x1234;
    migrateLegacyChunkCollision(c, new Uint8Array(16).fill(1), FB);
    expect(c.collisionA[0]).toBe(0x1234);
    expect(c.collisionA[1]).toBe(0);
  });

  // Post-retirement load seam: the legacy `collision` array comes straight off
  // the parsed chunks.json (ChunkDef no longer carries it), so the migration
  // must accept a plain number[] and tolerate the field being absent entirely
  // (chunks saved after the retirement).
  it('accepts a raw number[] legacy plane (parsed JSON input)', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    const legacy = new Array(16).fill(0);
    legacy[0] = legacy[1] = legacy[4] = legacy[5] = 1; // cell(0,0) solidAll
    expect(migrateLegacyChunkCollision(c, legacy, FB)).toBe(true);
    const all = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    expect(c.collisionA[0]).toBe(all);
    expect(c.collisionB[0]).toBe(all);
  });

  it('no-ops (returns false) when the legacy plane is absent', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    expect(migrateLegacyChunkCollision(c, undefined, FB)).toBe(false);
    expect([...c.collisionA].every(w => w === 0)).toBe(true);
  });
});
