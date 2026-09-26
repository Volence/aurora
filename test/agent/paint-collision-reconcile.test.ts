// THE COMBINATION MATRIX of the 2026-08-29 merge of two paint_collision
// parcels — `mcp-collision-read` (the per-cell `words` form + the READ) and
// `lp2-loop-paint` (`plane: "both"` + a `crossover` tri-state). Packet:
// docs/reviews/2026-08-29-paint-collision-reconcile.md.
//
// ⚠ THE CROSSOVER AXIS IS GONE (ROADMAP rows 223+224, 2026-09-26). The owner
// ruled layer-switch LINES the only mechanism, aeon retired the painted marks,
// and bits 15:14 of a per-plane word are RESERVED (aeon refuses any non-zero
// value). The rows that drove `crossover`/`crossoverSpan` ([m2], the hand-off
// half of [m3]) were deleted with the parameters. What remains is FORM x PLANE,
// and what the reserved bits must do under it: never be WRITTEN by a paint,
// never be silently ERASED by one, and be REPORTED by the read.
//
// ⚠ ANTI-VACUOUS. Bits 15:14 are zero in every file aeon ships, so a row that
// paints over default data cannot tell "each plane merged against its own
// cell" from "one merged word broadcast to both". Every row below therefore
// AUTHORS a destination with a non-zero, PER-PLANE-DIFFERENT reserved value
// before it paints, and says so.
//
// ⚠ EVERY EXPECTATION IS DERIVED: the reserved field from `reserved-bits.ts`,
// the owned/unowned masks from `collision-word.ts` (derived from the encoder).

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  paintCollisionCellsBothPlanes, paintCollisionRectBothPlanes,
} from '../../src/core/collision/collision-paint';
import { validateCollisionWrite, validateCollisionReadPlane } from '../../src/core/agent/validation';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import {
  COLLISION_CELL_UNOWNED_MASK, unownedCollisionBits,
} from '../../src/core/editing/collision-word';
import {
  planeReservedBits, PLANE_RESERVED_SHIFT, PLANE_RESERVED_BITS,
} from '../../src/core/collision/reserved-bits';
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
/** A cell word with bits 15:14 set to `v` (1..3): how a retired mark arrives
 *  (an older file, a hand edit). Nothing in Aurora produces one. */
const withReserved = (word: number, v: number): number =>
  ((word & ~PLANE_RESERVED_BITS) | (v << PLANE_RESERVED_SHIFT)) & 0xFFFF;

/**
 * The PER-CELL form aimed at ONE plane, through the live builder with
 * `bothPlanes: false` — exactly what `agent-handler` runs for `plane: 'a'` and
 * `plane: 'b'`.
 *
 * ⚠ These rows used to call `paintCollisionCellEntries`, a single-plane entry
 * point NOTHING in the app called. It was deleted on 2026-09-08 (lens row
 * COLLISION-PAINT-DEAD-FUNCTIONS). `other` is asserted empty at every call so
 * no row here can pass because the write went to the plane it was not aimed at.
 */
function cellPlan(args: {
  x: number; y: number; w: number; h: number; words: (number | null)[];
  plane: Uint16Array; tileWidth: number;
}): { entries: { index: number; oldColl: number; newColl: number }[]; skipped: number } {
  const plan = paintCollisionCellsBothPlanes({
    x: args.x, y: args.y, w: args.w, h: args.h, words: args.words,
    aimedPlane: args.plane, otherPlane: null, tileWidth: args.tileWidth, bothPlanes: false,
  });
  expect(plan.other).toEqual([]);
  return { entries: plan.aimed, skipped: plan.skipped };
}

/** A one-line dump of a 2x2-cell region of both planes: the artifact a row
 *  judges, printed so the row is readable without re-deriving it (OVERSEER.md
 *  bar 2d (iii)). */
function dump(label: string, a: Uint16Array, b: Uint16Array, cells: [number, number][]): string {
  const one = (p: Uint16Array) => cells.map(([cc, cr]) => {
    const w = cellWord(p, cc, cr);
    return `$${w.toString(16).toUpperCase().padStart(4, '0')}/r${planeReservedBits(w)}`;
  }).join(' ');
  return `${label}\n    A: ${one(a)}\n    B: ${one(b)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// The matrix's axes, named once, so a row can say which cell of it it occupies.
// ═══════════════════════════════════════════════════════════════════════════

const CELLS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** Seed both planes over the 2x2 region with DIFFERENT non-zero reserved values
 *  (A: 2, B: 1), and different shapes, so no row can pass by broadcasting one
 *  plane's answer to the other. */
function seedDistinguishable(): { a: Uint16Array; b: Uint16Array } {
  const a = fresh(); const b = fresh();
  for (const [cc, cr] of CELLS) {
    setCell(a, cc, cr, withReserved(solid(11), 2));
    setCell(b, cc, cr, withReserved(solid(22), 1));
  }
  // The seed is the row's own premise; assert it landed rather than assume it.
  expect(planeReservedBits(cellWord(a, 0, 0))).toBe(2);
  expect(planeReservedBits(cellWord(b, 0, 0))).toBe(1);
  expect(unownedCollisionBits(cellWord(a, 0, 0))).not.toBe(0);
  expect(unownedCollisionBits(cellWord(b, 0, 0))).not.toBe(0);
  return { a, b };
}

const WORDS_2x2 = [solid(1), solid(2), solid(3), solid(4)];

// ═══════════════════════════════════════════════════════════════════════════
// [m1] words × plane:"both"
// ═══════════════════════════════════════════════════════════════════════════

describe('[m1] words + plane:"both": per-cell words, each plane merged against ITS OWN word', () => {
  it('writes the same per-cell picture to both planes and keeps each plane\'s own reserved bits', () => {
    const { a, b } = seedDistinguishable();
    const plan = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: WORDS_2x2,
      aimedPlane: a, otherPlane: b, tileWidth: width, bothPlanes: true,
    });
    apply(a, plan.aimed); apply(b, plan.other);
    console.log(dump('[m1] words+both, after:', a, b, CELLS));

    // The PICTURE is the per-cell words, on both planes.
    for (let i = 0; i < CELLS.length; i++) {
      const [cc, cr] = CELLS[i];
      expect(cellWord(a, cc, cr) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS_2x2[i]);
      expect(cellWord(b, cc, cr) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS_2x2[i]);
    }
    // ⚠ THE TRAP: each plane KEPT ITS OWN unowned bits (no silent erase, and no
    // copy): a single merge broadcast to both would make B's equal A's.
    expect(planeReservedBits(cellWord(a, 0, 0))).toBe(2);
    expect(planeReservedBits(cellWord(b, 0, 0))).toBe(1);
    expect(plan.skipped).toBe(0);
  });

  it('CONTROL: aimed at ONE plane, the same call leaves the other plane untouched', () => {
    const { a, b } = seedDistinguishable();
    const before = Array.from(b);
    const plan = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: WORDS_2x2,
      aimedPlane: a, otherPlane: b, tileWidth: width, bothPlanes: false,
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
    expect(cellWord(a, 1, 0)).toBe(withReserved(solid(11), 2));
    expect(cellWord(b, 1, 0)).toBe(withReserved(solid(22), 1));
    expect(cellWord(a, 1, 1) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(4));
    expect(beforeA).not.toBe(cellWord(a, 1, 1));   // anti-vacuous: it COULD change
    expect(beforeB).not.toBe(cellWord(b, 1, 1));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m2] (deleted with the crossover axis) and [m3] the two forms agree
// ═══════════════════════════════════════════════════════════════════════════

describe('[m3] words + both: the per-cell and fill forms are one tool', () => {
  it('the per-cell form and the fill form agree wherever the words are uniform', () => {
    // The two forms are two forms of ONE tool. Over a rectangle whose per-cell
    // words are all the same, they must be indistinguishable — a divergence
    // here is exactly the "two roads, two rules" defect both parcels name.
    const mk = () => {
      const a = fresh(); const b = fresh();
      for (const [cc, cr] of CELLS) {
        setCell(a, cc, cr, withReserved(solid(11), 2));
        setCell(b, cc, cr, withReserved(solid(22), 1));
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
    });
    const cells = paintCollisionCellsBothPlanes({
      x: 0, y: 0, w: 2, h: 2, words: [solid(7), solid(7), solid(7), solid(7)],
      aimedPlane: two.b, otherPlane: two.a, tileWidth: width, bothPlanes: true,
    });
    apply(one.b, fill.aimed); apply(one.a, fill.other);
    apply(two.b, cells.aimed); apply(two.a, cells.other);
    console.log(dump('[m3=] fill form:', one.a, one.b, CELLS));
    console.log(dump('[m3=] cell form:', two.a, two.b, CELLS));
    expect(Array.from(two.a)).toEqual(Array.from(one.a));
    expect(Array.from(two.b)).toEqual(Array.from(one.b));
    // anti-vacuous: the picture changed, and each plane kept its own reserved value.
    expect(cellWord(one.b, 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(7));
    expect(planeReservedBits(cellWord(one.b, 0, 0))).toBe(1);
    expect(planeReservedBits(cellWord(one.a, 0, 0))).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m4] THE SHARP EDGE — reserved bits do NOT travel inside `words`
// ═══════════════════════════════════════════════════════════════════════════

describe('[m4] bits 15:14 inside a words[] value are IGNORED', () => {
  it('⚠ a words value carrying 15:14 does not WRITE them into a destination that had none', () => {
    const dest = fresh();
    for (const [cc, cr] of CELLS) setCell(dest, cc, cr, solid(11));   // clean
    const carrying = withReserved(solid(5), 3);
    expect(planeReservedBits(carrying)).toBe(3);                      // anti-vacuous
    const plan = cellPlan({
      x: 0, y: 0, w: 2, h: 2, words: [carrying, carrying, carrying, carrying],
      plane: dest, tileWidth: width,
    });
    apply(dest, plan.entries);
    console.log(`[m4] words[i]=$${carrying.toString(16).toUpperCase()} `
      + `→ dest $${cellWord(dest, 0, 0).toString(16).toUpperCase()}`);
    // The PICTURE crossed; the reserved bits did not: this road cannot write them.
    expect(cellWord(dest, 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(5));
    expect(planeReservedBits(cellWord(dest, 0, 0))).toBe(0);
  });

  it('so a read → write OVER ITSELF is exact even with reserved bits present', () => {
    const src = fresh();
    setCell(src, 0, 0, withReserved(solid(3), 2));
    setCell(src, 1, 0, solid(4));
    setCell(src, 0, 1, withReserved(solid(5), 1));
    setCell(src, 1, 1, 0);
    const before = Array.from(src);
    const read = readCollisionRegion({
      plane: 'a', planeWords: src, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(read.reservedCells).toBe(2);                               // anti-vacuous
    const plan = cellPlan({
      x: 0, y: 0, w: 2, h: 2, words: read.words, plane: src, tileWidth: width,
    });
    apply(src, plan.entries);
    console.log(`[m4=] round trip over itself: words=${JSON.stringify(read.words)} `
      + `entries=${plan.entries.length} reservedCells=${read.reservedCells}`);
    expect(Array.from(src)).toEqual(before);
    expect(plan.entries).toHaveLength(0);       // nothing even needed changing
  });

  it('but a read → write SOMEWHERE ELSE moves the picture and not the reserved bits', () => {
    const src = fresh(); const dst = fresh();
    for (const [cc, cr] of CELLS) setCell(src, cc, cr, withReserved(solid(3), 2));
    const read = readCollisionRegion({
      plane: 'a', planeWords: src, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    const plan = cellPlan({
      x: 2, y: 2, w: 2, h: 2, words: read.words, plane: dst, tileWidth: width,
    });
    apply(dst, plan.entries);
    expect(cellWord(dst, 2, 2) & ~COLLISION_CELL_UNOWNED_MASK).toBe(solid(3));
    expect(planeReservedBits(cellWord(dst, 2, 2))).toBe(0);
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

  it('refuses "both" and SAYS WHY: the asymmetry with paint_collision is named', () => {
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

describe('[m6] word XOR words survives the merge, under every plane', () => {
  it('both forms at once is still refused', () => {
    expect(validateCollisionWrite(5, [1, 2, 3, 4], 2, 2)).toMatch(/not both/);
  });
  it('neither form is still refused', () => {
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

  it('accepts every legal FORM x PLANE combination', () => {
    const forms = [{ word: 1 }, { words: [1, 2, null, 4] }];
    const planes = ['a', 'b', 'both'];
    let n = 0;
    for (const f of forms) for (const plane of planes) {
      const parsed = paint().safeParse({ ...base, plane, ...f });
      expect(parsed.success, `${plane} ${JSON.stringify(f)}`).toBe(true);
      n++;
    }
    expect(n).toBe(forms.length * planes.length);
  });

  it('⚠ the retired crossover / crossoverSpan parameters are NOT in the schema (rows 223+224)', () => {
    const keys = Object.keys(method('paint_collision').params);
    expect(keys).not.toContain('crossover');
    expect(keys).not.toContain('crossoverSpan');
    // anti-vacuous: the params object is the real one.
    expect(keys).toContain('words');
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
    // the sharp edge, and that the bits are RESERVED and refused if asked for
    expect(d).toMatch(/bits 15:14 INSIDE a "word"\/"words" value are IGNORED/);
    expect(d).toMatch(/RESERVED/);
    expect(d).toMatch(/REFUSED if sent/);
  });

  it('get_collision_region\'s description names the reserved bits it reports', () => {
    const d = method('get_collision_region').description;
    expect(d).toMatch(/never "both"/);
    expect(d).toMatch(/reservedBits/);
    expect(d).toMatch(/reservedCells/);
    expect(d).toMatch(/RESERVED/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [m8] The read reports the reserved bits, never normalising them away
// ═══════════════════════════════════════════════════════════════════════════

describe('[m8] get_collision_region reports bits 15:14 by value', () => {
  it('reports 0 / 1 / 2 / 3 and counts every non-zero one', () => {
    const p = fresh();
    setCell(p, 0, 0, solid(3));
    setCell(p, 1, 0, withReserved(solid(3), 1));
    setCell(p, 0, 1, withReserved(solid(3), 2));
    setCell(p, 1, 1, withReserved(solid(3), 3));
    const out = readCollisionRegion({
      plane: 'a', planeWords: p, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(out.cells[0][0].reservedBits).toBe(0);
    expect(out.cells[0][1].reservedBits).toBe(1);
    expect(out.cells[1][0].reservedBits).toBe(2);
    expect(out.cells[1][1].reservedBits).toBe(3);
    expect(out.reservedCells).toBe(3);
  });

  it('a mixed cell has no reservedBits field, and is still counted when a sub-tile carries them', () => {
    const p = fresh();
    const idx = cellTileIndices(0, 0, width);
    for (const i of idx) p[i] = solid(3);
    p[idx[3]] = withReserved(solid(3), 2);                         // one sub-tile differs
    const out = readCollisionRegion({
      plane: 'a', planeWords: p, tileWidth: width, x: 0, y: 0, w: 1, h: 1,
      profiles: null, ascii: false,
    });
    expect(out.cells[0][0].mixed).toBe(true);
    expect(out.cells[0][0].reservedBits).toBeUndefined();
    expect(out.mixedCells).toBe(1);
    expect(out.reservedCells).toBe(1);
  });

  it('reservedCells and cellsWithUnownedBits are computed from DIFFERENT constants', () => {
    // They agree today because COLLISION_CELL_UNOWNED_MASK === PLANE_RESERVED_BITS,
    // a coincidence reserved-bits.test.ts asserts. Reporting both is how an agent
    // would ever see them part company.
    expect(COLLISION_CELL_UNOWNED_MASK).toBe(PLANE_RESERVED_BITS);
    const p = fresh();
    for (const [cc, cr] of CELLS) setCell(p, cc, cr, withReserved(solid(3), 2));
    const out = readCollisionRegion({
      plane: 'a', planeWords: p, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(out.reservedCells).toBe(4);
    expect(out.cellsWithUnownedBits).toBe(4);
  });
});
