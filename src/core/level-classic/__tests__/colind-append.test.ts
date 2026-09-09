// The growth rule itself, apart from the three store commands that use it.
//
// The store tests (classicLevelStore.test.ts, "colind growth across the
// overhang") drive real commands and are the ones that prove the defect is gone
// from each path. These are here for the cases a command cannot easily stage: an
// out-of-order run, a gapped run, and the exact boundary between "extends the
// table by the id being defined" (allowed) and "extends it across ids nobody is
// defining" (refused).

import { describe, it, expect } from 'vitest';
import { appendColindEntries } from '../colind-append';

const table = (...bytes: number[]) => new Uint8Array(bytes);

describe('appendColindEntries', () => {
  it('writes an id that is already inside the table, in place', () => {
    const src = table(1, 2, 3);
    const out = appendColindEntries(src, [{ blockId: 1, shape: 9 }]);
    expect(Array.from(out.colind)).toEqual([1, 9, 3]);
    expect(out.recorded).toEqual([1]);
    expect(out.skippedOverhang).toEqual([]);
    expect(src[1]).toBe(2); // the input is not mutated
  });

  it('extends the table by exactly one for the id at its end', () => {
    const out = appendColindEntries(table(1, 2), [{ blockId: 2, shape: 7 }]);
    expect(Array.from(out.colind)).toEqual([1, 2, 7]);
    expect(out.recorded).toEqual([2]);
  });

  it('extends across a whole contiguous run in one call', () => {
    const out = appendColindEntries(table(1), [
      { blockId: 1, shape: 4 }, { blockId: 2, shape: 5 }, { blockId: 3, shape: 6 },
    ]);
    expect(Array.from(out.colind)).toEqual([1, 4, 5, 6]);
    expect(out.recorded).toEqual([1, 2, 3]);
    expect(out.skippedOverhang).toEqual([]);
  });

  it('takes the run in id order however it was given', () => {
    const out = appendColindEntries(table(1), [
      { blockId: 3, shape: 6 }, { blockId: 1, shape: 4 }, { blockId: 2, shape: 5 },
    ]);
    expect(Array.from(out.colind)).toEqual([1, 4, 5, 6]);
    expect(out.recorded).toEqual([1, 2, 3]);
  });

  /**
   * THE DEFECT, stated as arithmetic. A table of 2 asked for id 4 must not
   * become [x, y, 0, 0, shape]: ids 2 and 3 are blocks of this zone whose
   * collision lives past the end of the file, and zero is a real shape, so those
   * two bytes would be indistinguishable from authored ones forever after.
   */
  it('refuses an id past the end, leaving the table untouched and its identity intact', () => {
    const src = table(1, 2);
    const out = appendColindEntries(src, [{ blockId: 4, shape: 7 }]);
    expect(out.colind).toBe(src); // same object: nothing was built
    expect(out.recorded).toEqual([]);
    expect(out.skippedOverhang).toEqual([4]);
  });

  it('refuses only the ids past the end, and records the ones inside', () => {
    const out = appendColindEntries(table(1, 2, 3), [
      { blockId: 0, shape: 8 }, { blockId: 5, shape: 7 },
    ]);
    expect(Array.from(out.colind)).toEqual([8, 2, 3]);
    expect(out.recorded).toEqual([0]);
    expect(out.skippedOverhang).toEqual([5]);
  });

  /**
   * A GAP IN THE RUN IS STILL A GAP. If a caller defines the id at the end and
   * then one two beyond it, honouring the second would invent the byte between
   * them, which is the same fault by a shorter route. The near id is recorded and
   * the far one is not.
   */
  it('stops at the first hole rather than jumping it', () => {
    const out = appendColindEntries(table(1, 2), [
      { blockId: 2, shape: 5 }, { blockId: 4, shape: 6 },
    ]);
    expect(Array.from(out.colind)).toEqual([1, 2, 5]);
    expect(out.recorded).toEqual([2]);
    expect(out.skippedOverhang).toEqual([4]);
  });

  it('grows from an empty table one id at a time', () => {
    expect(Array.from(appendColindEntries(table(), [{ blockId: 0, shape: 3 }]).colind))
      .toEqual([3]);
    const skipped = appendColindEntries(table(), [{ blockId: 1, shape: 3 }]);
    expect(skipped.colind).toHaveLength(0);
    expect(skipped.skippedOverhang).toEqual([1]);
  });

  it('is a no-op, identity included, for no entries at all', () => {
    const src = table(1, 2);
    const out = appendColindEntries(src, []);
    expect(out.colind).toBe(src);
    expect(out.recorded).toEqual([]);
    expect(out.skippedOverhang).toEqual([]);
  });

  /**
   * The property the store's dirty flag rests on, asserted directly rather than
   * inferred from the cases above: every byte outside `recorded` comes from the
   * input, and the output is never longer than the input plus what was recorded.
   * A future spelling of the growth that reintroduced `Math.max(blocks, table)`
   * would fail this even if it happened to satisfy the individual cases.
   */
  it('never produces a byte outside the input and the recorded ids', () => {
    const src = table(11, 22, 33);
    for (const ids of [[3], [3, 4], [0, 3], [3, 5], [7], [1, 2]]) {
      const out = appendColindEntries(src, ids.map((blockId) => ({ blockId, shape: 99 })));
      expect(out.colind.length).toBe(src.length + out.recorded.filter((i) => i >= src.length).length);
      for (let i = 0; i < out.colind.length; i++) {
        if (out.recorded.includes(i)) continue;
        expect(out.colind[i]).toBe(src[i]);
      }
    }
  });
});
