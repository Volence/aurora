/**
 * ⚠ THE RULE THAT MAKES EVERY ROW IN THIS FILE NON-VACUOUS ⚠
 *
 * Every cell in every shipped act holds ZERO in the collision word's unowned
 * bits. So on real content a correct writer and a completely broken one emit
 * the SAME artifact: `0` preserved and `0` truncated are the same sixteen bits.
 *
 * A preservation row whose destination has zeros there is therefore not a weak
 * test, it is a VACUOUS one — it can only ever be green, and it would stay
 * green through a total removal of the rule.
 *
 * So: EVERY preservation row below AUTHORS its destination with NON-ZERO
 * unowned bits, deliberately, via `withUnowned()`, and asserts on the specific
 * value it authored. `unownedProbe()` is the shared source of that value and it
 * asserts it is non-zero, so a future layout change that emptied the unowned
 * mask would blow this file up rather than silently making it vacuous.
 *
 * And the converse control, which the preservation rows cannot provide: rows
 * tagged CONTROL prove the writer still DOES change the bits it owns. A
 * "preserve everything" bug — a writer that stopped painting altogether —
 * would sail through every preservation row on its own.
 */

import { describe, it, expect } from 'vitest';
import {
  COLLISION_CELL_OWNED_MASK, COLLISION_CELL_UNOWNED_MASK, COLLISION_CLEAR_WORD,
  collisionPaintWord, unownedCollisionBits, countCellsCarryingUnownedBits,
  clearCollisionEntries, resetToEngineEntries,
} from '../../src/core/editing/collision-word';
import { packCollisionCell, unpackCollisionCell } from '../../src/core/collision/collision-cell-word';
import { paintCollisionRectBothPlanes } from '../../src/core/collision/collision-paint';
import { paintDocCollision } from '../../src/core/art/composer-collision';
import type { ComposerDoc } from '../../src/core/art/composer-buffer';
import { peerRepo, readAtRev } from '../support/peer-repo';

// ── the value every preservation row writes into its destination ────────────
/**
 * A non-zero pattern confined to the unowned bits.
 *
 * DERIVED from the mask, never a literal `0xC000`: it is the lowest set bit of
 * the unowned mask, so it stays inside whatever that mask currently is. The
 * assertion is the anti-vacuity guard — if the owned mask ever grew to cover
 * all sixteen bits this returns 0 and every row below would become a coin that
 * always lands heads, so it fails loudly instead.
 */
function unownedProbe(): number {
  const lowest = COLLISION_CELL_UNOWNED_MASK & -COLLISION_CELL_UNOWNED_MASK;
  expect(lowest, 'unowned mask is empty: every preservation row here would be vacuous').toBeGreaterThan(0);
  return lowest;
}
/** The full unowned field set, for the rows that want every unowned bit lit. */
function unownedAll(): number {
  expect(COLLISION_CELL_UNOWNED_MASK, 'unowned mask is empty').toBeGreaterThan(0);
  return COLLISION_CELL_UNOWNED_MASK;
}
/** A destination word: real collision content PLUS authored unowned bits. */
function withUnowned(owned: number, unowned = unownedProbe()): number {
  expect(unowned & COLLISION_CELL_OWNED_MASK, 'probe leaked into owned bits').toBe(0);
  return (owned | unowned) & 0xFFFF;
}

const BRUSH = packCollisionCell({ shape: 0x123, xFlip: true, yFlip: false, solidity: 'top' });
const OTHER = packCollisionCell({ shape: 0x0A5, xFlip: false, yFlip: true, solidity: 'all' });

describe('collision-word: the owned mask is derived, and matches the engine', () => {
  it('is exactly what packCollisionCell can set: shape | xFlip | yFlip | solidity', () => {
    // Derivation shown, not a literal: OR the four fields at full width.
    const derived = 0x3FF | 0x400 | 0x800 | (0x3 << 12);
    expect(COLLISION_CELL_OWNED_MASK).toBe(derived);
    expect(COLLISION_CELL_UNOWNED_MASK).toBe((~derived) & 0xFFFF);
    // Disjoint and together exactly 16 bits — a mask that overlapped or left a
    // hole would make "preserve the complement" mean something else.
    expect(COLLISION_CELL_OWNED_MASK & COLLISION_CELL_UNOWNED_MASK).toBe(0);
    expect(COLLISION_CELL_OWNED_MASK | COLLISION_CELL_UNOWNED_MASK).toBe(0xFFFF);
  });

  it('no value packCollisionCell can produce ever escapes the owned mask', () => {
    // The mask is derived from one saturated probe; this is the check that the
    // probe was not a lucky one. Sweep every solidity and both flips.
    for (const solidity of ['none', 'top', 'sides-bottom', 'all'] as const) {
      for (const xFlip of [false, true]) {
        for (const yFlip of [false, true]) {
          for (const shape of [0, 1, 0x2AA, 0x3FF, 0xFFFF]) {
            const w = packCollisionCell({ shape, xFlip, yFlip, solidity });
            expect(w & COLLISION_CELL_UNOWNED_MASK).toBe(0);
          }
        }
      }
    }
  });

  /**
   * CURRENCY: our field constants against aeon's, at a COMMITTED revision.
   *
   * Never the peer's working tree — `readAtRev` goes through git plumbing, so
   * this compares against something a revision names. If our layout ever
   * disagrees with the engine's, that is a finding and this row is where it
   * surfaces.
   *
   * ⚠ It also records what the dispatch for this parcel got wrong: the same
   * file defines PATH_B_SOL_SHIFT = 14, so bits 15:14 ARE a live field in
   * `bake_cell`'s single-word encoding. They are unassigned only in
   * `bake_plane_cell`, which is the encoding Aurora's per-plane data feeds.
   * Asserted here so nobody re-derives "15:14 are free everywhere" from an
   * empty act.
   */
  const AEON_REV = 'b76576ea';
  const PIPELINE = 'tools/collision_pipeline.py';
  // `ctx.skip(reason)`, never `console.warn(…); return` — a `return` from a test
  // body is recorded as a PASS, so this row was permanently green on any machine
  // without an aeon checkout. See docs/reviews/2026-08-29-fixture-absent-honesty.md.
  it('agrees with aeon collision_pipeline.py field constants at a committed revision', (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO): cannot cross-check ${PIPELINE} at ${AEON_REV}`);
      return;
    }
    const blob = readAtRev(repo, AEON_REV, PIPELINE);
    if (!blob.ok && /does not resolve/.test(blob.why)) {
      ctx.skip(`SKIPPED, NOT PASSED: ${blob.why}`);
      return;
    }
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    const src = (blob as { ok: true; text: string }).text;
    const num = (name: string): number => {
      const m = new RegExp(`^${name}\\s*=\\s*(0x[0-9A-Fa-f]+|\\d+)`, 'm').exec(src);
      expect(m, `${name} not found in ${PIPELINE} @ ${AEON_REV}`).not.toBeNull();
      return Number(m![1]);
    };
    const blockId = num('BLOCK_ID_MASK');
    const xflip = num('CHUNK_XFLIP_BIT');
    const yflip = num('CHUNK_YFLIP_BIT');
    const solShift = num('PATH_A_SOL_SHIFT');
    // Derivation shown: the union of the four fields aeon's per-plane baker reads.
    expect(blockId | xflip | yflip | (0x3 << solShift)).toBe(COLLISION_CELL_OWNED_MASK);

    // The finding: 15:14 are NOT unreferenced in this file.
    const pathB = num('PATH_B_SOL_SHIFT');
    expect(0x3 << pathB).toBe(COLLISION_CELL_UNOWNED_MASK);
    // ...and Aurora must still not encode that meaning: our per-plane word puts
    // path B's solidity in plane B's OWN solidity field, so nothing we write
    // may set those bits.
    expect(packCollisionCell({ shape: 0x3FF, xFlip: true, yFlip: true, solidity: 'all' }) & (0x3 << pathB)).toBe(0);
  });
});

describe('collisionPaintWord: the brush owns its fields, the cell keeps the rest', () => {
  it('preserves authored unowned bits while writing every owned field', () => {
    const dest = withUnowned(OTHER, unownedAll());
    expect(unownedCollisionBits(dest)).toBe(unownedAll()); // the row is not vacuous
    const out = collisionPaintWord(BRUSH, dest);
    expect(unownedCollisionBits(out)).toBe(unownedAll());
    expect(out & COLLISION_CELL_OWNED_MASK).toBe(BRUSH);
  });

  it('preserves a single authored unowned bit', () => {
    const dest = withUnowned(OTHER);
    expect(unownedCollisionBits(dest)).toBe(unownedProbe());
    expect(unownedCollisionBits(collisionPaintWord(BRUSH, dest))).toBe(unownedProbe());
  });

  it('CONTROL: still changes the fields it owns (a preserve-everything bug fails here)', () => {
    const dest = withUnowned(OTHER, unownedAll());
    const out = collisionPaintWord(BRUSH, dest);
    expect(out).not.toBe(dest);
    const c = unpackCollisionCell(out);
    expect(c.shape).toBe(0x123);
    expect(c.xFlip).toBe(true);
    expect(c.yFlip).toBe(false);
    expect(c.solidity).toBe('top');
  });

  it('air (shape 0) erases the shape and still keeps the unowned bits', () => {
    const dest = withUnowned(OTHER, unownedAll());
    const out = collisionPaintWord(0, dest);
    expect(out & COLLISION_CELL_OWNED_MASK).toBe(0);
    expect(unownedCollisionBits(out)).toBe(unownedAll());
  });

  it('a brush word carrying stray unowned bits cannot smuggle them past the rule', () => {
    const out = collisionPaintWord(withUnowned(BRUSH, unownedAll()), 0);
    expect(unownedCollisionBits(out)).toBe(0);
    expect(out).toBe(BRUSH);
  });

  it('an absent destination contributes nothing (out-of-range index reads undefined)', () => {
    expect(collisionPaintWord(BRUSH, undefined)).toBe(BRUSH);
  });
});

// ── WRITER: the agent surface (paintCollisionRectBothPlanes) ────────────────
//
// ⚠ THIS CENSUS ROW NAMED THE WRONG WRITER UNTIL 2026-09-08. It called
// `paintCollisionRectEntries`, which the agent surface had stopped using: the
// handler reaches `paintCollisionRectBothPlanes` for EVERY plane argument,
// `bothPlanes` false for 'a'/'b' and true for 'both'. So the census of writers
// that must preserve unowned bits was one writer short, and the one it was short
// of is the only one that writes TWO destinations - the exact place
// both-planes-paint.ts's own header says the bits can be invented from the wrong
// cell. Re-pointed with the second plane seeded DIFFERENTLY, so a merge computed
// once and broadcast would be visible here rather than passing.
describe('paintCollisionRectBothPlanes preserves unowned bits, per destination', () => {
  const TILE_W = 8; // 8 tiles wide → 4 cells wide, small and exact

  function plane(fill: number): Uint16Array {
    const p = new Uint16Array(TILE_W * 8);
    p.fill(fill);
    return p;
  }

  /** The aimed plane's entries for a one-plane paint, which is what the handler
   *  runs for `plane: 'a'`. `other` is asserted empty at every call. */
  function aimedOnly(args: {
    x: number; y: number; w: number; h: number; word: number;
    plane: Uint16Array; other?: Uint16Array | null;
  }) {
    const plan = paintCollisionRectBothPlanes({
      x: args.x, y: args.y, w: args.w, h: args.h, word: args.word,
      aimedPlane: args.plane, otherPlane: args.other ?? null,
      tileWidth: TILE_W, bothPlanes: false, aimedPlaneId: 'a',
    });
    expect(plan.other).toEqual([]);
    return plan.aimed;
  }

  it('a 1x1 cell paint keeps the destination cells unowned bits on all four sub-tiles', () => {
    const dest = withUnowned(OTHER, unownedAll());
    expect(unownedCollisionBits(dest)).toBe(unownedAll()); // not vacuous
    const entries = aimedOnly({ x: 1, y: 1, w: 1, h: 1, word: BRUSH, plane: plane(dest) });
    expect(entries.length).toBe(4); // the cell's four 8px sub-tiles
    for (const e of entries) {
      expect(unownedCollisionBits(e.newColl)).toBe(unownedAll());
      expect(e.newColl & COLLISION_CELL_OWNED_MASK).toBe(BRUSH);
      expect(e.oldColl).toBe(dest);
    }
  });

  it('CONTROL: a cell already carrying the brush word AND the unowned bits emits nothing', () => {
    const already = withUnowned(BRUSH, unownedAll());
    expect(aimedOnly({ x: 0, y: 0, w: 2, h: 2, word: BRUSH, plane: plane(already) })).toEqual([]);
  });

  it('CONTROL: over a zero destination it writes the brush word unchanged', () => {
    const entries = aimedOnly({ x: 0, y: 0, w: 1, h: 1, word: BRUSH, plane: plane(0) });
    expect(entries.length).toBe(4);
    for (const e of entries) expect(e.newColl).toBe(BRUSH);
  });

  it('a one-plane paint never reads the OTHER plane, whose unowned bits differ', () => {
    // The aimed plane carries all the unowned bits, the other plane none. A merge
    // computed against the wrong cell would show up as the wrong bits here.
    const aimed = plane(withUnowned(OTHER, unownedAll()));
    const other = plane(OTHER);
    expect(unownedCollisionBits(other[0])).toBe(0);          // not vacuous
    for (const e of aimedOnly({ x: 0, y: 0, w: 1, h: 1, word: BRUSH, plane: aimed, other })) {
      expect(unownedCollisionBits(e.newColl)).toBe(unownedAll());
    }
  });

  it('BOTH planes: each destination keeps ITS OWN unowned bits, not the aimed plane\'s', () => {
    const aimed = plane(withUnowned(OTHER, unownedAll()));
    const other = plane(OTHER);
    const plan = paintCollisionRectBothPlanes({
      x: 0, y: 0, w: 1, h: 1, word: BRUSH,
      aimedPlane: aimed, otherPlane: other, tileWidth: TILE_W, bothPlanes: true,
      aimedPlaneId: 'a',
    });
    expect(plan.aimed.length).toBe(4);
    expect(plan.other.length).toBe(4);
    for (const e of plan.aimed) expect(unownedCollisionBits(e.newColl)).toBe(unownedAll());
    // THE TRAP: one merge broadcast to two planes would put the aimed plane's
    // unowned bits here. Each destination is merged against itself, so this is 0.
    for (const e of plan.other) expect(unownedCollisionBits(e.newColl)).toBe(0);
  });
});

// ── WRITER: the Art-mode chunk collision brush (paintDocCollision) ──────────
describe('paintDocCollision preserves unowned bits', () => {
  function doc(fill: number): ComposerDoc {
    const cells = 4 * 4;
    const a = new Uint16Array(cells); a.fill(fill);
    const b = new Uint16Array(cells); b.fill(fill);
    return { widthTiles: 8, heightTiles: 8, collisionA: a, collisionB: b } as unknown as ComposerDoc;
  }

  it('keeps the doc cells authored unowned bits when the chunk brush paints over it', () => {
    const dest = withUnowned(OTHER, unownedAll());
    expect(unownedCollisionBits(dest)).toBe(unownedAll()); // not vacuous
    const d = doc(dest);
    expect(paintDocCollision(d, 'a', 2, 2, BRUSH)).toBe(true);
    const got = d.collisionA[1 * 4 + 1]!;
    expect(unownedCollisionBits(got)).toBe(unownedAll());
    expect(got & COLLISION_CELL_OWNED_MASK).toBe(BRUSH);
  });

  it('CONTROL: reports no change when the cell already holds the merged result', () => {
    const d = doc(withUnowned(BRUSH, unownedAll()));
    expect(paintDocCollision(d, 'b', 0, 0, BRUSH)).toBe(false);
  });

  it('CONTROL: over a zero doc it writes the brush word and reports the change', () => {
    const d = doc(0);
    expect(paintDocCollision(d, 'a', 0, 0, BRUSH)).toBe(true);
    expect(d.collisionA[0]).toBe(BRUSH);
  });
});

// ── DECIDED: clear wipes, and is the only writer that may ──────────────────
describe('clearCollisionEntries: the one gesture that discards unowned bits', () => {
  it('writes a bare zero over cells that carry unowned bits (DECIDED, see the module)', () => {
    const dest = withUnowned(OTHER, unownedAll());
    const p = Uint16Array.from([dest, 0, BRUSH]);
    const entries = clearCollisionEntries(p);
    expect(entries).toEqual([
      { index: 0, oldColl: dest, newColl: COLLISION_CLEAR_WORD },
      { index: 2, oldColl: BRUSH, newColl: COLLISION_CLEAR_WORD },
    ]);
    expect(COLLISION_CLEAR_WORD).toBe(0);
  });

  it('undo can restore what it discarded: oldColl carries the full sixteen bits', () => {
    const dest = withUnowned(OTHER, unownedAll());
    const [e] = clearCollisionEntries(Uint16Array.from([dest]));
    expect(unownedCollisionBits(e!.oldColl)).toBe(unownedAll());
  });
});

// ── DECIDED: reset discards unavoidably, but counts what it destroys ────────
describe('resetToEngineEntries: unavoidable discard, reported not silent', () => {
  it('counts the cells whose unowned bits the revert destroys', () => {
    const a = withUnowned(OTHER, unownedAll());
    const b = withUnowned(BRUSH, unownedProbe());
    // Baseline words are packed from a baked BYTE, so they never carry unowned bits.
    const engine = Uint16Array.from([OTHER, OTHER, OTHER, BRUSH]);
    const plane = Uint16Array.from([a, b, OTHER, BRUSH]);
    const plan = resetToEngineEntries(plane, engine);
    expect(unownedCollisionBits(a)).toBe(unownedAll()); // not vacuous
    expect(plan.discardedUnownedCells).toBe(2);
    expect(plan.entries.map((e) => e.index)).toEqual([0, 1]);
    for (const e of plan.entries) expect(unownedCollisionBits(e.newColl)).toBe(0);
  });

  it('CONTROL: reports zero discards when no cell carries unowned bits', () => {
    const engine = Uint16Array.from([OTHER, OTHER]);
    const plan = resetToEngineEntries(Uint16Array.from([BRUSH, OTHER]), engine);
    expect(plan.discardedUnownedCells).toBe(0);
    expect(plan.entries.length).toBe(1); // still reverts what actually differs
  });

  it('a short baseline never writes undefined into the command (ROADMAP §5.1 item 10)', () => {
    const plan = resetToEngineEntries(Uint16Array.from([BRUSH, BRUSH]), Uint16Array.from([]));
    for (const e of plan.entries) expect(Number.isInteger(e.newColl)).toBe(true);
  });
});

describe('countCellsCarryingUnownedBits', () => {
  it('counts only cells with authored unowned bits', () => {
    const p = Uint16Array.from([0, BRUSH, withUnowned(OTHER), withUnowned(0, unownedAll())]);
    expect(countCellsCarryingUnownedBits(p)).toBe(2);
  });
});
