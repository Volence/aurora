// BITS 15:14 OF THE PER-PLANE CELL WORD ARE RESERVED: THE SEAM, AND THE TWO
// THINGS AURORA MUST NEVER DO WITH THEM.
//
// Replaces layer-transition.test.ts (ROADMAP rows 223+224, 2026-09-26). That
// file pinned the loop crossover's encoding against aeon's anchor document;
// the marks are retired (owner ruling S2CLIP-PLANE-SWITCH, aeon 19978b00) and
// the anchor is SUPERSEDED. What stays pinned:
//
//  1. The bit numbers match aeon's PUBLISHED `tools/collision_pipeline.py`
//     (`PLANE_RESERVED_SHIFT`, `PLANE_RESERVED_MASK`), parsed at origin/master
//     through git objects, so this file cannot pass on a number somebody typed.
//  2. The field does not OVERLAP anything `packCollisionCell` writes, and it is
//     exactly the bits the collision brush does not own.
//  3. Aurora cannot WRITE a non-zero value through the paint decider, and does
//     not silently ERASE one: the "refuses, not erases" rule, both halves.
//
// ⚠ ANTI-VACUOUS: aeon ships every plane with these bits zero, so every row
// below AUTHORS a non-zero value itself.

import { describe, it, expect } from 'vitest';
import {
  PLANE_RESERVED_SHIFT, PLANE_RESERVED_MASK, PLANE_RESERVED_BITS,
  RESERVED_OVERLAP_WITH_PACKED_FIELDS, planeReservedBits, withoutReservedBits, otherPlaneId,
} from '../../src/core/collision/reserved-bits';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import {
  COLLISION_CELL_OWNED_MASK, COLLISION_CELL_UNOWNED_MASK, collisionPaintWord, clearReservedBitsEntries,
} from '../../src/core/editing/collision-word';
import { peerRepo, readAtRev, resolveRev } from '../support/peer-repo';

const AEON_TIP = 'origin/master';
const PIPELINE = 'tools/collision_pipeline.py';
const SHAPE = packCollisionCell({ shape: 0x155, xFlip: true, yFlip: false, solidity: 'sides-bottom' });

describe('the reserved field, as Aurora holds it', () => {
  it('is exactly two bits, DERIVED from shift + mask', () => {
    expect(PLANE_RESERVED_BITS).toBe(PLANE_RESERVED_MASK << PLANE_RESERVED_SHIFT);
    expect(PLANE_RESERVED_BITS & 0xFFFF).toBe(PLANE_RESERVED_BITS);
    expect(PLANE_RESERVED_BITS.toString(2).split('1').length - 1).toBe(2);
  });

  it('⚠ does NOT overlap any field packCollisionCell writes, and IS the unowned complement', () => {
    expect(RESERVED_OVERLAP_WITH_PACKED_FIELDS).toBe(0);
    expect(PLANE_RESERVED_BITS & COLLISION_CELL_OWNED_MASK).toBe(0);
    // The load-bearing consequence: the stroke preservation rule (stated as a
    // mask complement) is what keeps these bits on every write.
    expect(COLLISION_CELL_UNOWNED_MASK).toBe(PLANE_RESERVED_BITS);
  });

  it('planeReservedBits reads every value 0..3, and withoutReservedBits clears ONLY them', () => {
    for (let v = 0; v <= PLANE_RESERVED_MASK; v++) {
      const w = (SHAPE | (v << PLANE_RESERVED_SHIFT)) & 0xFFFF;
      expect(planeReservedBits(w)).toBe(v);
      expect(withoutReservedBits(w)).toBe(SHAPE);
    }
    expect(planeReservedBits(undefined)).toBe(0);
  });

  it('otherPlaneId is the other plane', () => {
    expect(otherPlaneId('a')).toBe('b');
    expect(otherPlaneId('b')).toBe('a');
  });
});

describe('⚠ refuses, not erases: what a collision stroke does to bits 15:14', () => {
  it('CANNOT WRITE them: a brush word carrying any value leaves a clean destination clean', () => {
    for (let v = 1; v <= PLANE_RESERVED_MASK; v++) {
      const brush = (SHAPE | (v << PLANE_RESERVED_SHIFT)) & 0xFFFF;
      expect(planeReservedBits(brush), 'ANTI-VACUOUS: the brush word carries the bits').toBe(v);
      const out = collisionPaintWord(brush, 0);
      expect(planeReservedBits(out), `brush value ${v} reached the destination`).toBe(0);
      expect(out).toBe(SHAPE);
    }
  });

  it('does NOT ERASE them: a destination carrying any value keeps it under a stroke', () => {
    const other = packCollisionCell({ shape: 3, xFlip: false, yFlip: true, solidity: 'top' });
    for (let v = 1; v <= PLANE_RESERVED_MASK; v++) {
      const dest = (other | (v << PLANE_RESERVED_SHIFT)) & 0xFFFF;
      const out = collisionPaintWord(SHAPE, dest);
      expect(planeReservedBits(out)).toBe(v);
      // and the stroke really did write the picture
      expect(out & COLLISION_CELL_OWNED_MASK).toBe(SHAPE);
    }
  });

  it('clearReservedBitsEntries, the ONE explicit clear, touches only carrying cells and only 15:14', () => {
    const plane = new Uint16Array([SHAPE, (SHAPE | 0x8000) & 0xFFFF, 0x4000, 0, (SHAPE | 0xC000) & 0xFFFF]);
    const entries = clearReservedBitsEntries(plane);
    expect(entries).toEqual([
      { index: 1, oldColl: (SHAPE | 0x8000) & 0xFFFF, newColl: SHAPE },
      { index: 2, oldColl: 0x4000, newColl: 0 },
      { index: 4, oldColl: (SHAPE | 0xC000) & 0xFFFF, newColl: SHAPE },
    ]);
    // It builds a diff; it does not mutate the plane (the command applies it, undoably).
    expect(planeReservedBits(plane[1])).toBe(2);
  });
});

describe('the bit numbers, against aeon\'s published baker', () => {
  function pipelineAtTip(ctx: { skip: (m: string) => void }): string | null {
    const repo = peerRepo('aeon');
    if (repo === null) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); cannot read ${PIPELINE} at ${AEON_TIP}`);
      return null;
    }
    const tip = resolveRev(repo, AEON_TIP);
    if (tip === null) { ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in aeon`); return null; }
    const blob = readAtRev(repo, tip, PIPELINE);
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    return blob.ok ? blob.text : null;
  }
  const num = (src: string, name: string): number => {
    const m = new RegExp(`^${name}\\s*=\\s*(0x[0-9A-Fa-f]+|\\d+)`, 'm').exec(src);
    expect(m, `${name} not found in ${PIPELINE} @ ${AEON_TIP}`).not.toBeNull();
    return Number(m![1]);
  };

  it(`PLANE_RESERVED_SHIFT / PLANE_RESERVED_MASK equal ${PIPELINE} at aeon ${AEON_TIP}`, (ctx) => {
    const src = pipelineAtTip(ctx);
    if (src === null) return;
    expect(num(src, 'PLANE_RESERVED_SHIFT')).toBe(PLANE_RESERVED_SHIFT);
    expect(num(src, 'PLANE_RESERVED_MASK')).toBe(PLANE_RESERVED_MASK);
    // The retired names must not be back: a pipeline that re-grew XOVER_* would
    // mean the marks returned, and this whole file's premise with them.
    expect(src).not.toMatch(/^XOVER_\w+\s*=/m);
  });

  it('⚠ the SAME bit number is path-B SOLIDITY in aeon\'s OTHER (donor) baker', (ctx) => {
    // Recorded so the collision between the two word spaces stays a measured
    // fact: Aurora only ever holds per-plane words, and must never write a donor
    // chunk-entry word, where bits 15:14 are live solidity.
    const src = pipelineAtTip(ctx);
    if (src === null) return;
    expect(num(src, 'PATH_B_SOL_SHIFT')).toBe(PLANE_RESERVED_SHIFT);
  });
});
