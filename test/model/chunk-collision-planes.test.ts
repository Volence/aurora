import { describe, it, expect } from 'vitest';
import { createChunkDef } from '../../src/core/model/s4-types';
import { migrateLegacyChunkCollision } from '../../src/core/model/chunk-migrate';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import type { FullBlockShapeLookup } from '../../src/core/collision/full-block-shape';

const FB = 7; // stand-in full-block shape id for tests
/** The lookup a real bank produces. `migrateLegacyChunkCollision` takes the
 *  RESULT, not an id, so that the two blind answers below cannot arrive as the
 *  same 0 — ledger row FULLBLOCK-ZERO-IS-TWO-ANSWERS. */
const FOUND: FullBlockShapeLookup = { status: 'found', shapeId: FB };

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
    migrateLegacyChunkCollision(c, legacy, FOUND);
    const all = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    const top = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'top' });
    expect([...c.collisionA]).toEqual([all, top, all, 0]);
    expect([...c.collisionB]).toEqual([...c.collisionA]);
  });

  it('migration is a no-op when word planes are already populated (idempotent load)', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    c.collisionA[0] = 0x1234;
    migrateLegacyChunkCollision(c, new Uint8Array(16).fill(1), FOUND);
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
    expect(migrateLegacyChunkCollision(c, legacy, FOUND)).toBe(true);
    const all = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    expect(c.collisionA[0]).toBe(all);
    expect(c.collisionB[0]).toBe(all);
  });

  it('no-ops (returns false) when the legacy plane is absent', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    expect(migrateLegacyChunkCollision(c, undefined, FOUND)).toBe(false);
    expect([...c.collisionA].every(w => w === 0)).toBe(true);
  });

  // ⚠ EACH BLIND ANSWER IS ITS OWN ROW, and neither leans on the other.
  // `migrateLegacyChunkCollision` guards on `status !== 'found'`, which is one
  // predicate covering two facts; a single row would prove the predicate for
  // whichever fact it happened to pass in and say nothing about the other. If
  // the guard is ever narrowed to one status — the exact shape of this repo's
  // "a guard resting on its neighbour" defect — one of these two goes red.
  it('no-ops when NO PROFILES were loaded (the lookup could not look)', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    const legacy = new Uint8Array(16).fill(1);
    // ANTI-VACUOUS CONTROL: this exact legacy plane DOES migrate under a found
    // lookup, so the all-zero planes below are the guard's doing and not an
    // input that had nothing in it. Without this the row passes on a fixture
    // that could never have written anything.
    const control = createChunkDef('y', 'Y', 4, 4);
    expect(migrateLegacyChunkCollision(control, legacy, FOUND)).toBe(true);
    expect([...control.collisionA].some(w => w !== 0)).toBe(true);

    expect(migrateLegacyChunkCollision(c, legacy, { status: 'no-profiles' })).toBe(false);
    expect([...c.collisionA].every(w => w === 0)).toBe(true);
    expect([...c.collisionB].every(w => w === 0)).toBe(true);
  });

  it('no-ops when a REAL BANK was searched and holds no full block', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    const legacy = new Uint8Array(16).fill(1);
    const control = createChunkDef('y', 'Y', 4, 4);
    expect(migrateLegacyChunkCollision(control, legacy, FOUND)).toBe(true);
    expect([...control.collisionA].some(w => w !== 0)).toBe(true);

    expect(migrateLegacyChunkCollision(c, legacy, { status: 'no-full-block' })).toBe(false);
    expect([...c.collisionA].every(w => w === 0)).toBe(true);
    expect([...c.collisionB].every(w => w === 0)).toBe(true);
  });
});
