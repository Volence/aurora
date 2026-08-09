import { describe, it, expect } from 'vitest';
import { paintCollisionRectEntries } from '../../src/core/collision/collision-paint';
import { validateChunkCollisionPlane } from '../../src/core/agent/validation';

// An 8-tile-wide plane (4x4 cells). Cell (cc,cr) -> tile indices via
// cellTileIndices(cc, cr, 8): tr=2*cr, tc=2*cc -> [tr*8+tc, tr*8+tc+1, (tr+1)*8+tc, (tr+1)*8+tc+1].
const width = 8;

describe('paintCollisionRectEntries', () => {
  it('fills a 2x1 cell rect with entries covering the 8 sub-tile indices', () => {
    const plane = new Uint16Array(8 * 8);
    const entries = paintCollisionRectEntries({ x: 0, y: 0, w: 2, h: 1, word: 0x105, plane, tileWidth: width });
    expect(entries).toHaveLength(8);
    expect(entries.every(e => e.newColl === 0x105)).toBe(true);
    expect(entries.every(e => e.oldColl === 0)).toBe(true);
    const indices = entries.map(e => e.index).sort((a, b) => a - b);
    // cell (0,0): tc=0,tr=0 -> 0,1,8,9. cell (1,0): tc=2,tr=0 -> 2,3,10,11.
    expect(indices).toEqual([0, 1, 2, 3, 8, 9, 10, 11]);
  });

  it('diffing skips cells already equal to the target word', () => {
    const plane = new Uint16Array(8 * 8);
    for (const idx of [0, 1, 8, 9]) plane[idx] = 0x105; // cell (0,0) already painted
    const entries = paintCollisionRectEntries({ x: 0, y: 0, w: 2, h: 1, word: 0x105, plane, tileWidth: width });
    expect(entries).toHaveLength(4); // only cell (1,0) changes
    for (const e of entries) {
      expect([2, 3, 10, 11]).toContain(e.index);
      expect(e.oldColl).toBe(0);
      expect(e.newColl).toBe(0x105);
    }
  });

  it('word 0 clears a solid cell back to air, emitting diffed entries', () => {
    const plane = new Uint16Array(8 * 8);
    for (const idx of [0, 1, 8, 9]) plane[idx] = 0x1105; // solid word
    const entries = paintCollisionRectEntries({ x: 0, y: 0, w: 1, h: 1, word: 0, plane, tileWidth: width });
    expect(entries).toHaveLength(4);
    expect(entries.every(e => e.oldColl === 0x1105)).toBe(true);
    expect(entries.every(e => e.newColl === 0)).toBe(true);
  });
});

describe('validateChunkCollisionPlane', () => {
  it('accepts undefined (chunk defaults to air planes)', () => {
    expect(validateChunkCollisionPlane('collisionA', undefined, 4, 4)).toBeNull();
  });
  it('accepts an array whose length matches (w/2)*(h/2) cells', () => {
    expect(validateChunkCollisionPlane('collisionA', Array(4).fill(0), 4, 4)).toBeNull();
  });
  it('rejects a length mismatch with a clear error naming the field', () => {
    expect(validateChunkCollisionPlane('collisionB', Array(3).fill(0), 4, 4)).toMatch(/collisionB/);
    expect(validateChunkCollisionPlane('collisionB', Array(3).fill(0), 4, 4)).toMatch(/4/);
  });
});
