// ═══════════════════════════════════════════════════════════════════════════
// THE RULE UNDER TEST: a "solid on both planes" stroke merges its brush word
// against EACH PLANE'S OWN destination cell — never once against one plane and
// then broadcast to the other.
//
// ⚠ THE VACUITY TRAP, AND WHY EVERY ROW HERE AUTHORS ITS OWN FIXTURE.
//
// Every cell in every act shipped so far holds ZERO in the bits no Aurora
// collision field owns (measured in docs/reviews/2026-08-28-collision-word-
// preservation.md §5). On that content, a correct per-plane merge and a broken
// single-merge-broadcast emit IDENTICAL words: 0 preserved and 0 copied from
// the other plane's 0 are the same sixteen bits.
//
// So a test that paints over realistic cells is a coin that always lands heads.
// Every row that is about the merge therefore authors DIFFERENT non-zero
// unowned bits into plane A and plane B, deliberately, and asserts that each
// plane kept ITS OWN. `probeA`/`probeB` are derived from the mask and asserted
// distinct, so a future layout change that emptied the unowned mask blows this
// file up rather than quietly making it vacuous.

import { describe, it, expect } from 'vitest';
import {
  buildPlaneEntries, buildBothPlanesEntries, otherPlane,
  solidOnBothPlanes, isSolidCell,
} from '../../src/core/collision/both-planes-paint';
import {
  COLLISION_CELL_UNOWNED_MASK, COLLISION_CELL_OWNED_MASK, unownedCollisionBits,
} from '../../src/core/editing/collision-word';
import { packCollisionCell, unpackCollisionCell } from '../../src/core/collision/collision-cell-word';
import { readCrossover, withCrossover, isSelfMark, type Crossover } from '../../src/core/collision/layer-transition';

// Two DISTINCT non-zero unowned-bit patterns, derived from the mask rather than
// typed. If the mask ever narrows to a single bit these stop being distinct and
// the guard below fails loudly instead of the rows going vacuous.
const UNOWNED = COLLISION_CELL_UNOWNED_MASK;
const lowestUnowned = UNOWNED & -UNOWNED;
const probeA = lowestUnowned;                      // one unowned bit
const probeB = UNOWNED & ~lowestUnowned;           // the rest of them

const BRUSH = packCollisionCell({ shape: 0x105, xFlip: true, yFlip: false, solidity: 'top' });

describe('the unowned-bit probes are real (the guard on the guards)', () => {
  it('the collision word HAS unowned bits, and there are at least two of them', () => {
    // Without this, every merge row below would be comparing 0 to 0 and would
    // pass through a total removal of the rule.
    expect(UNOWNED).not.toBe(0);
    expect(probeA).not.toBe(0);
    expect(probeB).not.toBe(0);
    expect(probeA).not.toBe(probeB);
    expect(probeA & probeB).toBe(0);
  });
  it('neither probe collides with a bit the brush owns', () => {
    expect(probeA & COLLISION_CELL_OWNED_MASK).toBe(0);
    expect(probeB & COLLISION_CELL_OWNED_MASK).toBe(0);
  });
});

describe('otherPlane', () => {
  it('is an involution over the two plane ids', () => {
    expect(otherPlane('a')).toBe('b');
    expect(otherPlane('b')).toBe('a');
    expect(otherPlane(otherPlane('a'))).toBe('a');
  });
});

describe('buildPlaneEntries', () => {
  it('merges the brush onto each destination and keeps that cell\'s unowned bits', () => {
    const plane = new Uint16Array([probeA, probeB, 0]);
    const entries = buildPlaneEntries(plane, [0, 1, 2], BRUSH);
    expect(entries.map((e) => e.newColl)).toEqual([BRUSH | probeA, BRUSH | probeB, BRUSH]);
  });

  it('CONTROL: still writes the fields the brush OWNS', () => {
    // Without this, a `buildPlaneEntries` that preserved everything by never
    // painting would sail through every preservation row above.
    const plane = new Uint16Array([probeA]);
    const cell = unpackCollisionCell(buildPlaneEntries(plane, [0], BRUSH)[0]!.newColl);
    expect(cell.shape).toBe(0x105);
    expect(cell.xFlip).toBe(true);
    expect(cell.solidity).toBe('top');
  });

  it('emits nothing for a cell that already holds the merged result', () => {
    const plane = new Uint16Array([BRUSH | probeA]);
    expect(buildPlaneEntries(plane, [0], BRUSH)).toEqual([]);
  });

  it('captures oldColl WHOLE, so undo restores all sixteen bits', () => {
    const plane = new Uint16Array([BRUSH ^ 0x0001 | probeB]);
    expect(buildPlaneEntries(plane, [0], BRUSH)[0]!.oldColl).toBe(plane[0]);
  });

  it('reads an out-of-range index as 0 rather than throwing', () => {
    const plane = new Uint16Array([0]);
    expect(buildPlaneEntries(plane, [5], BRUSH)).toEqual([{ index: 5, oldColl: 0, newColl: BRUSH }]);
  });
});

describe('buildBothPlanesEntries — the defect this module exists to prevent', () => {
  it('⚠ each plane keeps ITS OWN unowned bits — the merge is NOT computed once', () => {
    // THE ROW. A single merge against plane A, broadcast to plane B, would give
    // plane B `BRUSH | probeA` — plane A's reserved bits, invented onto a cell
    // that never had them.
    const a = new Uint16Array([probeA]);
    const b = new Uint16Array([probeB]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH, bothPlanes: true,
    });
    expect(aimed[0]!.newColl).toBe(BRUSH | probeA);
    expect(other[0]!.newColl).toBe(BRUSH | probeB);
    // Said the other way round, so the row fails on the actual defect and not
    // only on the equality above: neither plane acquired the other's bits.
    expect(unownedCollisionBits(aimed[0]!.newColl)).toBe(probeA);
    expect(unownedCollisionBits(other[0]!.newColl)).toBe(probeB);
  });

  it('CONTROL: both planes really were written — the owned fields changed on each', () => {
    const a = new Uint16Array([probeA]);
    const b = new Uint16Array([probeB]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH, bothPlanes: true,
    });
    // A "preserve everything" bug — a builder that stopped painting — would
    // pass the preservation row above. This is its converse.
    expect(unpackCollisionCell(aimed[0]!.newColl).shape).toBe(0x105);
    expect(unpackCollisionCell(other[0]!.newColl).shape).toBe(0x105);
    expect(aimed[0]!.oldColl).toBe(probeA);
    expect(other[0]!.oldColl).toBe(probeB);
  });

  it('writes the other plane even where the aimed plane needs no change', () => {
    // The half-finished-second-plane case, exactly: A is already correct, B is
    // air. A gesture that short-circuited on the aimed plane would do nothing
    // here — which is the one cell it most needs to fix.
    const a = new Uint16Array([BRUSH]);
    const b = new Uint16Array([0]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH, bothPlanes: true,
    });
    expect(aimed).toEqual([]);
    expect(other).toEqual([{ index: 0, oldColl: 0, newColl: BRUSH }]);
  });

  it('with the mode OFF, touches only the aimed plane', () => {
    const a = new Uint16Array([probeA]);
    const b = new Uint16Array([probeB]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH, bothPlanes: false,
    });
    expect(aimed).toHaveLength(1);
    expect(other).toEqual([]);
  });

  it('an unseeded other plane yields no other-entries, and the aimed half still works', () => {
    const a = new Uint16Array([probeA]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: null, indices: [0], brushWord: BRUSH, bothPlanes: true,
    });
    expect(aimed[0]!.newColl).toBe(BRUSH | probeA);
    expect(other).toEqual([]);
  });

  it('handles a one-shot iterator — both passes see the same indices', () => {
    // `indices` arrives as a generator from the rect builder in one road; a
    // naive two-pass implementation would silently paint the aimed plane and
    // then find the iterator exhausted for the other.
    function* gen() { yield 0; yield 1; }
    const a = new Uint16Array([0, 0]);
    const b = new Uint16Array([0, 0]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: gen(), brushWord: BRUSH, bothPlanes: true,
    });
    expect(aimed.map((e) => e.index)).toEqual([0, 1]);
    expect(other.map((e) => e.index)).toEqual([0, 1]);
  });
});

describe('the crossover half of a both-planes stroke', () => {
  it('⚠ each plane gets ITS OWN handoff value — the two-way pair, not a copy', () => {
    // THE ROW. Copying the aimed plane's value onto the other writes TO_B into
    // plane B's own word, which is a SELF-MARK: a provable no-op that aeon's
    // bake refuses with a HARD BUILD ERROR (rule R2). One value computed once
    // and broadcast is wrong for two independent reasons — this one and the
    // unowned-bit one above.
    const a = new Uint16Array([0]);
    const b = new Uint16Array([0]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH,
      bothPlanes: true, aimedPlaneId: 'a', crossover: 'hand-off',
    });
    expect(readCrossover(aimed[0]!.newColl)).toBe('to-b');
    expect(readCrossover(other[0]!.newColl)).toBe('to-a');
    // Said as the rule, so the row fails on the defect and not only on equality.
    expect(isSelfMark('a', readCrossover(aimed[0]!.newColl) as Crossover)).toBe(false);
    expect(isSelfMark('b', readCrossover(other[0]!.newColl) as Crossover)).toBe(false);
  });

  it('aimed at plane B, the pair is the mirror image', () => {
    const a = new Uint16Array([0]);
    const b = new Uint16Array([0]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: b, otherPlaneWords: a, indices: [0], brushWord: BRUSH,
      bothPlanes: true, aimedPlaneId: 'b', crossover: 'hand-off',
    });
    expect(readCrossover(aimed[0]!.newColl)).toBe('to-a');
    expect(readCrossover(other[0]!.newColl)).toBe('to-b');
  });

  it('CONTROL: `keep` leaves an existing crossover on BOTH planes alone', () => {
    // The converse of the row above: a builder that authored on every stroke
    // would pass it, and would silently rewrite every loop an author edits the
    // shape of.
    const a = new Uint16Array([withCrossover(BRUSH ^ 1, 'to-b')]);
    const b = new Uint16Array([withCrossover(BRUSH ^ 1, 'to-a')]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH,
      bothPlanes: true, aimedPlaneId: 'a', crossover: 'keep',
    });
    expect(readCrossover(aimed[0]!.newColl)).toBe('to-b');
    expect(readCrossover(other[0]!.newColl)).toBe('to-a');
    // ...and the shape really did change, so this is not "nothing happened".
    expect(aimed[0]!.newColl & 0x3FFF).toBe(BRUSH & 0x3FFF);
  });

  it('`clear` erases the mark on both planes', () => {
    const a = new Uint16Array([withCrossover(BRUSH, 'to-b')]);
    const b = new Uint16Array([withCrossover(BRUSH, 'to-a')]);
    const { aimed, other } = buildBothPlanesEntries({
      aimedPlaneWords: a, otherPlaneWords: b, indices: [0], brushWord: BRUSH,
      bothPlanes: true, aimedPlaneId: 'a', crossover: 'clear',
    });
    expect(readCrossover(aimed[0]!.newColl)).toBe('none');
    expect(readCrossover(other[0]!.newColl)).toBe('none');
  });
});

describe('solidOnBothPlanes — the DERIVED fact the lens draws', () => {
  const solid = packCollisionCell({ shape: 3, xFlip: false, yFlip: false, solidity: 'all' });
  const jumpThru = packCollisionCell({ shape: 3, xFlip: false, yFlip: false, solidity: 'top' });
  const shapeButNoSolidity = packCollisionCell({ shape: 3, xFlip: false, yFlip: false, solidity: 'none' });
  const solidityButNoShape = packCollisionCell({ shape: 0, xFlip: false, yFlip: false, solidity: 'all' });

  it('is true only when BOTH planes stop the player there', () => {
    expect(solidOnBothPlanes(solid, solid)).toBe(true);
    expect(solidOnBothPlanes(solid, jumpThru)).toBe(true);
    expect(solidOnBothPlanes(solid, 0)).toBe(false);
    expect(solidOnBothPlanes(0, solid)).toBe(false);
    expect(solidOnBothPlanes(0, 0)).toBe(false);
  });

  it('a shape with solidity "none" is NOT solid — it bakes to air', () => {
    expect(isSolidCell(shapeButNoSolidity)).toBe(false);
    expect(solidOnBothPlanes(solid, shapeButNoSolidity)).toBe(false);
  });

  it('solidity bits without a shape are NOT solid either', () => {
    // `selectedCollisionWord` never emits this, but a hand-poked cell or an
    // older file can carry it, so the predicate checks rather than assumes.
    expect(isSolidCell(solidityButNoShape)).toBe(false);
  });

  it('unowned bits do not make a cell solid', () => {
    // The bits nothing owns must not leak into a solidity judgement — that
    // would be this parcel accidentally ASSIGNING them a meaning.
    expect(isSolidCell(probeA)).toBe(false);
    expect(isSolidCell(probeB)).toBe(false);
    expect(solidOnBothPlanes(probeA, probeB)).toBe(false);
    // And they do not UNmake one either.
    expect(solidOnBothPlanes(solid | probeA, solid | probeB)).toBe(true);
  });

  it('an absent cell (unseeded plane, index past the end) is not solid', () => {
    expect(solidOnBothPlanes(solid, undefined)).toBe(false);
    expect(isSolidCell(undefined)).toBe(false);
  });
});
