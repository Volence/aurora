// THE COMBINATION MATRIX of the 2026-08-29 merge of two paint_collision
// parcels — `mcp-collision-read` (the per-cell `words` form + the READ) and
// `lp2-loop-paint` (`plane: "both"` + the `crossover` tri-state). Neither knew
// about the other; the type-level union was mechanical and the SEMANTICS OF THE
// COMBINATIONS were the parcel. Packet:
// docs/reviews/2026-08-29-paint-collision-reconcile.md.
//
// ⚠ ANTI-VACUOUS, AND IT IS THE WHOLE DIFFICULTY HERE. Bits 15:14 — the loop
// crossover — are ZERO in all 18 shipped plane files, all 65,536 cells each
// (aeon fde35b2f, quoted in the loop-paint packet §"anti-vacuity"). So a row
// that paints over default data cannot tell "each plane merged against its own
// cell" from "one merged word broadcast to both", nor "the other plane got the
// OTHER plane's crossover" from "it got a copy". Every row below therefore
// AUTHORS a destination with a non-zero, PER-PLANE-DIFFERENT unowned value
// before it paints, and says so.
//
// ⚠ EVERY EXPECTATION IS DERIVED. Crossover values come from
// `layer-transition.ts`'s named constants and `handOffFrom`, never from the
// literals 1/2/0xC000; the owned/unowned masks come from `collision-word.ts`,
// which derives them from `packCollisionCell` itself.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  paintCollisionCellEntries, paintCollisionCellsBothPlanes, paintCollisionRectBothPlanes,
} from '../../src/core/collision/collision-paint';
import { validateCollisionWrite, validateCollisionReadPlane } from '../../src/core/agent/validation';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import {
  COLLISION_CELL_UNOWNED_MASK, unownedCollisionBits,
} from '../../src/core/editing/collision-word';
import {
  readCrossover, withCrossover, handOffFrom, isSelfMark, otherPlaneId,
  CROSSOVER_BITS, type CollisionPlaneId,
} from '../../src/core/collision/layer-transition';
import { readCollisionRegion } from '../../src/core/collision/collision-region-read';
import { EDITOR_METHODS } from '../../src/main/editor-methods';

const width = 8;                       // 8 tiles wide = 4x4 cells
const solid = (shape: number) => packCollisionCell({ shape, xFlip: false, yFlip: false, solidity: 'all' });
const fresh = () => new Uint16Array(width * width);

function setCell(plane: Uint16Array, cc: number, cr: number, word: number): void {
  for (const i of cellTileIndices(cc, cr, width)) plane[i] = word;
}
function cellWord(plane: Uint16Array, cc: number, cr: number): number {
  const [tl, tr, bl, br] = cellTileIndices(cc, cr, width).map((i) => plane[i]!);
  if (!(tl === tr && tr === bl && bl === br)) throw new Error('cell is not uniform');
  return tl;
}
function apply(plane: Uint16Array, entries: { index: number; newColl: number }[]): void {
  for (const e of entries) plane[e.index] = e.newColl;
}

/** A one-line dump of a 2x2-cell region of both planes: the artifact a row
 *  judges, printed so the row is readable without re-deriving it (OVERSEER.md
 *  bar 2d (iii)). */
function dump(label: string, a: Uint16Array, b: Uint16Array, cells: [number, number][]): string {
  const one = (p: Uint16Array) => cells.map(([cc, cr]) => {
    const w = cellWord(p, cc, cr);
    return `$${w.toString(16).toUpperCase().padStart(4, '0')}/${readCrossover(w)}`;
  }).join(' ');
  return `${label}\n    A: ${one(a)}\n    B: ${one(b)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// The matrix's axes, named once, so a row can say which cell of it it occupies.
// ═══════════════════════════════════════════════════════════════════════════

const CELLS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** Seed both planes over the 2x2 region with DIFFERENT non-zero unowned values,
 *  and different shapes, so no row can pass by broadcasting one plane's answer
 *  to the other. Plane A gets `to-b` (its only legal non-none value), plane B
 *  gets `to-a`. */
function seedDistinguishable(): { a: Uint16Array; b: Uint16Array } {
  const a = fresh(); const b = fresh();
  for (const [cc, cr] of CELLS) {
    setCell(a, cc, cr, withCrossover(solid(11), 'to-b'));
    setCell(b, cc, cr, withCrossover(solid(22), 'to-a'));
  }
  // The seed is the row's own premise; assert it landed rather than assume it.
  expect(readCrossover(cellWord(a, 0, 0))).toBe('to-b');
  expect(readCrossover(cellWord(b, 0, 0))).toBe('to-a');
  expect(unownedCollisionBits(cellWord(a, 0, 0))).not.toBe(0);
  expect(unownedCollisionBits(cellWord(b, 0, 0))).not.toBe(0);
  return { a, b };
}

const WORDS_2x2 = [solid(1), solid(2), solid(3), solid(4)];

// ═══════════════════════════════════════════════════════════════════════════
// [m1] words × plane:"both" × crossover:keep
// ═══════════════════════════════════════════════════════════════════════════

describe('[m1] words + plane:"both" — per-cell words, each plane merged against ITS OWN word', () => {
  it('writes the same per-cell picture to both planes and keeps each plane\'s own crossover', () => {
    const { a, b } = seedDistinguishable();
    const plan = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: WORDS_2x2,
      aimedPlane: a, otherPlane: b, tileWidth: width, bothPlanes: true,
      aimedPlaneId: 'a', crossover: 'keep',
    });
    apply(a, plan.aimed); apply(b, plan.other);
    console.log(dump('[m1] words+both+keep, after:', a, b, CELLS));

    // The PICTURE is the per-cell words, on both planes.
    for (let i = 0; i < CELLS.length; i++) {
      const [cc, cr] = CELLS[i];
      expect(cellWord(a, cc, cr) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS_2x2[i]);
      expect(cellWord(b, cc, cr) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS_2x2[i]);
    }
    // ⚠ THE TRAP: each plane KEPT ITS OWN unowned bits. A single merge
    // broadcast to both planes would make B's crossover equal A's.
    expect(readCrossover(cellWord(a, 0, 0))).toBe('to-b');
    expect(readCrossover(cellWord(b, 0, 0))).toBe('to-a');
    expect(readCrossover(cellWord(a, 0, 0))).not.toBe(readCrossover(cellWord(b, 0, 0)));
    expect(plan.skipped).toBe(0);
  });

  it('CONTROL: aimed at ONE plane, the same call leaves the other plane untouched', () => {
    const { a, b } = seedDistinguishable();
    const before = Array.from(b);
    const plan = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: WORDS_2x2,
      aimedPlane: a, otherPlane: b, tileWidth: width, bothPlanes: false,
      aimedPlaneId: 'a', crossover: 'keep',
    });
    apply(a, plan.aimed); apply(b, plan.other);
    expect(plan.other).toHaveLength(0);
    expect(Array.from(b)).toEqual(before);
    // …and the aimed plane really did change, so this is not a "wrote nothing" green.
    expect(plan.aimed.length).toBeGreaterThan(0);
  });

  it('a null cell is skipped on BOTH planes, and skipped counts CELLS once', () => {
    const { a, b } = seedDistinguishable();
    const beforeA = cellWord(a, 1, 1); const beforeB = cellWord(b, 1, 1);
    const words = [solid(1), null, null, solid(4)];
    const plan = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words,
      aimedPlane: a, otherPlane: b, tileWidth: width, bothPlanes: true,
      aimedPlaneId: 'a', crossover: 'keep',
    });
    apply(a, plan.aimed); apply(b, plan.other);
    console.log(`[m1n] words=${JSON.stringify(words)}  skipped=${plan.skipped}\n`
      + dump('     after:', a, b, CELLS));
    // TWO nulls over TWO planes is still 2 — cells, never sub-tile entries.
    expect(plan.skipped).toBe(2);
    // The named cells changed on both planes…
    expect(cellWord(a, 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(1));
    expect(cellWord(b, 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(1));
    // …and the null ones are untouched on both, in every bit.
    expect(cellWord(a, 1, 0)).toBe(withCrossover(solid(11), 'to-b'));
    expect(cellWord(b, 1, 0)).toBe(withCrossover(solid(22), 'to-a'));
    expect(cellWord(a, 1, 1) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(4));
    expect(beforeA).not.toBe(cellWord(a, 1, 1));   // anti-vacuous: it COULD change
    expect(beforeB).not.toBe(cellWord(b, 1, 1));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m2] words × crossover — the tri-state applies PER WRITTEN CELL
// ═══════════════════════════════════════════════════════════════════════════

describe('[m2] words + crossover — per cell, and only on the cells it writes', () => {
  for (const plane of ['a', 'b'] as CollisionPlaneId[]) {
    it(`hand-off on plane ${plane.toUpperCase()} marks every WRITTEN cell with ${handOffFrom(plane)}, and no skipped one`, () => {
      const { a, b } = seedDistinguishable();
      const dest = plane === 'a' ? a : b;
      const kept = plane === 'a' ? 'to-b' : 'to-a';       // what the seed put there
      // Clear the crossover on the cells we will write, so "hand-off landed"
      // cannot be confused with "the seed was already that value".
      for (const [cc, cr] of CELLS) setCell(dest, cc, cr, withCrossover(cellWord(dest, cc, cr), 'none'));
      expect(readCrossover(cellWord(dest, 0, 0))).toBe('none');
      // …except the one we will SKIP, which keeps the seed value.
      setCell(dest, 1, 0, withCrossover(solid(11), kept as 'to-a' | 'to-b'));

      const words = [solid(1), null, solid(3), solid(4)];
      const plan = paintCollisionCellEntries({
        x: 0, y: 0, w: 2, h: 2, words, plane: dest, tileWidth: width,
        crossover: 'hand-off', planeId: plane,
      });
      apply(dest, plan.entries);
      console.log(`[m2-${plane}] hand-off, words=${JSON.stringify(words)}\n`
        + `    ${CELLS.map(([cc, cr]) => `(${cc},${cr})=${readCrossover(cellWord(dest, cc, cr))}`).join(' ')}`);

      const expected = handOffFrom(plane);
      expect(readCrossover(cellWord(dest, 0, 0))).toBe(expected);
      expect(readCrossover(cellWord(dest, 0, 1))).toBe(expected);
      expect(readCrossover(cellWord(dest, 1, 1))).toBe(expected);
      // The skipped cell kept its own value — the brush touched it not at all.
      expect(readCrossover(cellWord(dest, 1, 0))).toBe(kept);
      // …and hand-off is never a self-mark, whichever plane it lands on.
      expect(isSelfMark(plane, expected)).toBe(false);
    });
  }

  it('clear erases the crossover of every WRITTEN cell and of no skipped one', () => {
    const { a } = seedDistinguishable();
    const words = [solid(1), null, solid(3), solid(4)];
    const plan = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 2, words, plane: a, tileWidth: width,
      crossover: 'clear', planeId: 'a',
    });
    apply(a, plan.entries);
    console.log(`[m2c] clear, words=${JSON.stringify(words)}\n`
      + `    ${CELLS.map(([cc, cr]) => `(${cc},${cr})=${readCrossover(cellWord(a, cc, cr))}`).join(' ')}`);
    expect(readCrossover(cellWord(a, 0, 0))).toBe('none');
    expect(readCrossover(cellWord(a, 0, 1))).toBe('none');
    expect(readCrossover(cellWord(a, 1, 1))).toBe('none');
    // ⚠ THE SKIPPED CELL SURVIVES A `clear`. "null = leave this cell alone"
    // outranks the crossover axis, because it is a statement about the CELL.
    expect(readCrossover(cellWord(a, 1, 0))).toBe('to-b');
  });

  it('keep (and an omitted crossover) leaves every cell\'s crossover exactly as it was', () => {
    const { a } = seedDistinguishable();
    const before = Array.from(a).map(unownedCollisionBits);
    const plan = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 2, words: WORDS_2x2, plane: a, tileWidth: width,
      // crossover omitted entirely — the default must be `keep`, never `clear`.
      planeId: 'a',
    });
    apply(a, plan.entries);
    expect(Array.from(a).map(unownedCollisionBits)).toEqual(before);
    expect(readCrossover(cellWord(a, 0, 0))).toBe('to-b');
    // anti-vacuous: the picture DID change, so this is not "nothing happened".
    expect(cellWord(a, 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(1));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m3] words × plane:"both" × crossover:hand-off — the two-way pair, per cell
// ═══════════════════════════════════════════════════════════════════════════

describe('[m3] words + both + hand-off — one call, both halves of a two-way loop', () => {
  it('writes the OTHER plane\'s value on the other plane, per cell, and never a self-mark', () => {
    const a = fresh(); const b = fresh();
    for (const [cc, cr] of CELLS) { setCell(a, cc, cr, solid(11)); setCell(b, cc, cr, solid(22)); }
    const plan = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: [solid(1), null, solid(3), solid(4)],
      aimedPlane: a, otherPlane: b, tileWidth: width, bothPlanes: true,
      aimedPlaneId: 'a', crossover: 'hand-off',
    });
    apply(a, plan.aimed); apply(b, plan.other);
    console.log(dump('[m3] words+both+hand-off, after:', a, b, CELLS));

    for (const [cc, cr] of [[0, 0], [0, 1], [1, 1]] as [number, number][]) {
      const ca = readCrossover(cellWord(a, cc, cr));
      const cb = readCrossover(cellWord(b, cc, cr));
      expect(ca).toBe(handOffFrom('a'));
      expect(cb).toBe(handOffFrom(otherPlaneId('a')));
      expect(ca).not.toBe(cb);                       // it is a PAIR, not a copy
      expect(isSelfMark('a', ca)).toBe(false);
      expect(isSelfMark('b', cb)).toBe(false);
    }
    // The skipped cell got NO mark on either plane.
    expect(readCrossover(cellWord(a, 1, 0))).toBe('none');
    expect(readCrossover(cellWord(b, 1, 0))).toBe('none');
  });

  it('the per-cell form and the fill form agree wherever the words are uniform', () => {
    // The two forms are two forms of ONE tool. Over a rectangle whose per-cell
    // words are all the same, they must be indistinguishable — a divergence
    // here is exactly the "two roads, two rules" defect both parcels name.
    const mk = () => {
      const a = fresh(); const b = fresh();
      for (const [cc, cr] of CELLS) {
        setCell(a, cc, cr, withCrossover(solid(11), 'to-b'));
        setCell(b, cc, cr, withCrossover(solid(22), 'to-a'));
      }
      return { a, b };
    };
    // AIMED AT PLANE B, so the aimed ARRAY is `b` and the aimed ID is 'b'. The
    // handler derives the two together and cannot mismatch them; a test that
    // mismatches them is testing a call the tool cannot make.
    const one = mk(); const two = mk();
    const fill = paintCollisionRectBothPlanes({
      x: 0, y: 0, w: 2, h: 2, word: solid(7),
      aimedPlane: one.b, otherPlane: one.a, tileWidth: width, bothPlanes: true,
      aimedPlaneId: 'b', crossover: 'hand-off',
    });
    const cells = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: [solid(7), solid(7), solid(7), solid(7)],
      aimedPlane: two.b, otherPlane: two.a, tileWidth: width, bothPlanes: true,
      aimedPlaneId: 'b', crossover: 'hand-off',
    });
    apply(one.b, fill.aimed); apply(one.a, fill.other);
    apply(two.b, cells.aimed); apply(two.a, cells.other);
    console.log(dump('[m3=] fill form:', one.a, one.b, CELLS));
    console.log(dump('[m3=] cell form:', two.a, two.b, CELLS));
    expect(Array.from(two.a)).toEqual(Array.from(one.a));
    expect(Array.from(two.b)).toEqual(Array.from(one.b));
    // anti-vacuous: the aimed plane here is B, so B carries `to-a` and A `to-b`.
    expect(readCrossover(cellWord(one.b, 0, 0))).toBe(handOffFrom('b'));
    expect(readCrossover(cellWord(one.a, 0, 0))).toBe(handOffFrom('a'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m4] THE SHARP EDGE — a crossover does NOT travel inside `words`
// ═══════════════════════════════════════════════════════════════════════════

describe('[m4] bits 15:14 inside a words[] value are IGNORED', () => {
  it('a words value carrying to-b does not put to-b in a destination that had none', () => {
    const dest = fresh();
    for (const [cc, cr] of CELLS) setCell(dest, cc, cr, solid(11));   // no crossover
    const carrying = withCrossover(solid(5), 'to-b');
    expect(readCrossover(carrying)).toBe('to-b');                     // anti-vacuous
    const plan = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 2, words: [carrying, carrying, carrying, carrying],
      plane: dest, tileWidth: width, planeId: 'a',
    });
    apply(dest, plan.entries);
    console.log(`[m4] words[i]=$${carrying.toString(16).toUpperCase()} (${readCrossover(carrying)}) `
      + `→ dest $${cellWord(dest, 0, 0).toString(16).toUpperCase()} (${readCrossover(cellWord(dest, 0, 0))})`);
    // The PICTURE crossed; the crossover did not.
    expect(cellWord(dest, 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(5));
    expect(readCrossover(cellWord(dest, 0, 0))).toBe('none');
  });

  it('so a read → write OVER ITSELF is exact even with crossovers present', () => {
    const src = fresh();
    setCell(src, 0, 0, withCrossover(solid(3), 'to-b'));
    setCell(src, 1, 0, solid(4));
    setCell(src, 0, 1, withCrossover(solid(5), 'to-b'));
    setCell(src, 1, 1, 0);
    const before = Array.from(src);
    const read = readCollisionRegion({
      plane: 'a', planeWords: src, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(read.crossoverCells).toBe(2);                              // anti-vacuous
    const plan = paintCollisionCellEntries({
      x: 0, y: 0, w: 2, h: 2, words: read.words, plane: src, tileWidth: width, planeId: 'a',
    });
    apply(src, plan.entries);
    console.log(`[m4=] round trip over itself: words=${JSON.stringify(read.words)} `
      + `entries=${plan.entries.length} crossoverCells=${read.crossoverCells}`);
    expect(Array.from(src)).toEqual(before);
    expect(plan.entries).toHaveLength(0);       // nothing even needed changing
  });

  it('but a read → write SOMEWHERE ELSE moves the picture and not the crossover', () => {
    const src = fresh(); const dst = fresh();
    for (const [cc, cr] of CELLS) setCell(src, cc, cr, withCrossover(solid(3), 'to-b'));
    const read = readCollisionRegion({
      plane: 'a', planeWords: src, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    const plan = paintCollisionCellEntries({
      x: 2, y: 2, w: 2, h: 2, words: read.words, plane: dst, tileWidth: width, planeId: 'a',
    });
    apply(dst, plan.entries);
    console.log(`[m4x] copied to (2,2): $${cellWord(dst, 2, 2).toString(16).toUpperCase()} `
      + `(${readCrossover(cellWord(dst, 2, 2))}) from $${cellWord(src, 0, 0).toString(16).toUpperCase()} `
      + `(${readCrossover(cellWord(src, 0, 0))})`);
    expect(cellWord(dst, 2, 2) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(3));
    expect(readCrossover(cellWord(dst, 2, 2))).toBe('none');
    // …and `crossover: 'hand-off'` is how an agent authors it there instead.
    const dst2 = fresh();
    const plan2 = paintCollisionCellEntries({
      x: 2, y: 2, w: 2, h: 2, words: read.words, plane: dst2, tileWidth: width,
      planeId: 'a', crossover: 'hand-off',
    });
    apply(dst2, plan2.entries);
    expect(readCrossover(cellWord(dst2, 2, 2))).toBe(handOffFrom('a'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m5] THE REFUSAL — get_collision_region has no plane:"both"
// ═══════════════════════════════════════════════════════════════════════════

describe('[m5] get_collision_region refuses plane:"both", in prose', () => {
  it('accepts the two real planes', () => {
    expect(validateCollisionReadPlane('a')).toBeNull();
    expect(validateCollisionReadPlane('b')).toBeNull();
  });

  it('refuses "both" and SAYS WHY — the asymmetry with paint_collision is named', () => {
    const err = validateCollisionReadPlane('both')!;
    console.log(`[m5] refusal: ${err}`);
    expect(err).not.toBeNull();
    // It must name the tool that DOES take "both", or an agent reads the
    // refusal as "not implemented yet" and retries.
    expect(err).toContain('paint_collision');
    // …and the reason, not just the rule.
    expect(err).toMatch(/merge/);
    expect(err).toMatch(/twice/);
  });

  it('refuses junk differently from "both", so the two are not one message', () => {
    const junk = validateCollisionReadPlane('c')!;
    expect(junk).toMatch(/plane must be "a" or "b"/);
    expect(junk).not.toBe(validateCollisionReadPlane('both'));
    expect(validateCollisionReadPlane(undefined)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m6] The form check still fires under the new axes
// ═══════════════════════════════════════════════════════════════════════════

describe('[m6] word XOR words survives the merge, under every plane and crossover', () => {
  it('both forms at once is still refused', () => {
    expect(validateCollisionWrite(5, [1, 2, 3, 4], 2, 2)).toMatch(/not both/);
  });
  it('neither form is still refused — a crossover alone is not a paint', () => {
    expect(validateCollisionWrite(undefined, undefined, 1, 1)).toMatch(/neither/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m7] THE SCHEMA AND THE DESCRIPTIONS — the only documentation an agent gets
// ═══════════════════════════════════════════════════════════════════════════

const method = (name: string) => {
  const m = EDITOR_METHODS.find((x) => x.name === name);
  if (!m) throw new Error(`no method ${name}`);
  return m;
};
const schema = (name: string) => z.object(method(name).params as Record<string, z.ZodTypeAny>);

describe('[m7] the wire schema admits exactly the combinations this parcel decided', () => {
  const paint = () => schema('paint_collision');
  const base = { section: 0, x: 0, y: 0, w: 2, h: 2 };

  it('accepts every legal FORM x PLANE x CROSSOVER combination', () => {
    const forms = [{ word: 1 }, { words: [1, 2, null, 4] }];
    const planes = ['a', 'b', 'both'];
    const crossovers = [{}, { crossover: 'keep' }, { crossover: 'clear' }, { crossover: 'hand-off' }];
    let n = 0;
    for (const f of forms) for (const plane of planes) for (const c of crossovers) {
      const parsed = paint().safeParse({ ...base, plane, ...f, ...c });
      expect(parsed.success, `${plane} ${JSON.stringify(f)} ${JSON.stringify(c)}`).toBe(true);
      n++;
    }
    console.log(`[m7] paint_collision schema accepted ${n} form x plane x crossover combinations`);
    expect(n).toBe(forms.length * planes.length * crossovers.length);
  });

  it('get_collision_region\'s schema does NOT accept "both", and paint_collision\'s does', () => {
    expect(schema('get_collision_region').safeParse({ ...base, plane: 'both' }).success).toBe(false);
    expect(schema('get_collision_region').safeParse({ ...base, plane: 'a' }).success).toBe(true);
    expect(paint().safeParse({ ...base, plane: 'both', word: 1 }).success).toBe(true);
  });

  it('the read\'s plane param EXPLAINS the asymmetry, because a schema error will not', () => {
    // An agent that just used plane:"both" on the write meets this text before
    // it calls. A bare enum error would teach it the read is unfinished.
    const desc = (method('get_collision_region').params.plane as z.ZodTypeAny).description ?? '';
    console.log(`[m7d] plane.describe(): ${desc}`);
    expect(desc).toContain('paint_collision');
    expect(desc).toMatch(/merge/);
    expect(desc).toMatch(/twice/);
  });

  it('paint_collision\'s description STATES what each combination means', () => {
    const d = method('paint_collision').description;
    console.log(`[m7p] paint_collision description (${d.length} chars)`);
    // the form axis
    expect(d).toMatch(/EITHER "word"/);
    expect(d).toMatch(/OR "words"/);
    // the plane axis, and that "both" is a mode over each plane's OWN word
    expect(d).toMatch(/own plane/i);
    // the COMBINATION, said out loud rather than left to be inferred
    expect(d).toMatch(/"words" with plane:"both"/);
    expect(d).toMatch(/skipped on BOTH planes/);
    expect(d).toMatch(/"words" with a crossover/);
    // the sharp edge
    expect(d).toMatch(/bits 15:14 INSIDE a "words" value are IGNORED/);
  });

  it('get_collision_region\'s description names the crossover it now reports', () => {
    const d = method('get_collision_region').description;
    expect(d).toMatch(/never "both"/);
    expect(d).toMatch(/crossover/);
    expect(d).toMatch(/reserved/);
    // and warns that a crossover does not ride in `words`
    expect(d).toMatch(/DOES NOT TRAVEL IN "words"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m8] The read reports the field the write can now author
// ═══════════════════════════════════════════════════════════════════════════

describe('[m8] get_collision_region reports the crossover by name', () => {
  it('names none / to-a / to-b / reserved, and counts them', () => {
    const p = fresh();
    setCell(p, 0, 0, solid(3));                                   // none
    setCell(p, 1, 0, withCrossover(solid(3), 'to-b'));
    setCell(p, 0, 1, withCrossover(solid(3), 'to-a'));
    // The RESERVED value 3 cannot be produced by `withCrossover` — that is the
    // anti-clamp rule — so it is poked in raw, which is exactly how one would
    // arrive from a paste, an import or a hand-edited file.
    setCell(p, 1, 1, solid(3) | CROSSOVER_BITS);
    const out = readCollisionRegion({
      plane: 'a', planeWords: p, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    console.log('[m8] ' + out.cells.flat().map((c, i) =>
      `${i}:${c.crossover}`).join(' ') + ` crossoverCells=${out.crossoverCells} `
      + `cellsWithUnownedBits=${out.cellsWithUnownedBits}`);
    expect(out.cells[0][0].crossover).toBe('none');
    expect(out.cells[0][1].crossover).toBe('to-b');
    expect(out.cells[1][0].crossover).toBe('to-a');
    // Reported, never normalised away — the whole point of reserving 3.
    expect(out.cells[1][1].crossover).toBe('reserved');
    expect(out.crossoverCells).toBe(3);
  });

  it('a mixed cell has no crossover field, and is still counted when a sub-tile carries one', () => {
    const p = fresh();
    const idx = cellTileIndices(0, 0, width);
    for (const i of idx) p[i] = solid(3);
    p[idx[3]] = withCrossover(solid(3), 'to-b');                  // one sub-tile differs
    const out = readCollisionRegion({
      plane: 'a', planeWords: p, tileWidth: width, x: 0, y: 0, w: 1, h: 1,
      profiles: null, ascii: false,
    });
    console.log(`[m8m] mixed cell: ${JSON.stringify(out.cells[0][0])} crossoverCells=${out.crossoverCells}`);
    expect(out.cells[0][0].mixed).toBe(true);
    expect(out.cells[0][0].crossover).toBeUndefined();
    expect(out.mixedCells).toBe(1);
    expect(out.crossoverCells).toBe(1);
  });

  it('crossoverCells and cellsWithUnownedBits are computed from DIFFERENT constants', () => {
    // They agree today because COLLISION_CELL_UNOWNED_MASK === CROSSOVER_BITS,
    // a coincidence layer-transition.test.ts asserts. Reporting both is how an
    // agent would ever see them part company.
    expect(COLLISION_CELL_UNOWNED_MASK).toBe(CROSSOVER_BITS);
    const p = fresh();
    for (const [cc, cr] of CELLS) setCell(p, cc, cr, withCrossover(solid(3), 'to-b'));
    const out = readCollisionRegion({
      plane: 'a', planeWords: p, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(out.crossoverCells).toBe(4);
    expect(out.cellsWithUnownedBits).toBe(4);
  });
});
