// ═══════════════════════════════════════════════════════════════════════════
// THE SEAM, AND THE THREE THINGS THAT CAN GO WRONG WITH IT.
//
//  1. The bit numbers DRIFT from aeon's anchor. Pinned by a currency row that
//     PARSES the anchor document at a committed revision, so this file cannot
//     pass on a number somebody retyped.
//  2. The field OVERLAPS one Aurora already writes. Pinned by a derivation from
//     `packCollisionCell` itself, not by a literal.
//  3. Something authors the RESERVED value 3, or a SELF-MARK. Both are hard
//     build errors in aeon's bake. Pinned by rows proving the brush cannot
//     produce either — reachability, not a guard.
//
// ⚠ THE VACUITY TRAP APPLIES HERE TOO AND IS WORSE THAN USUAL. Aeon measured
// all 18 shipped plane files at `fde35b2f`: bits 15:14 are ZERO in every one of
// 65,536 cells each. So no row here may lean on real content — every fixture is
// authored deliberately, and the rows that matter assert a NON-ZERO field.

import { describe, it, expect } from 'vitest';
import {
  CROSSOVER_SHIFT, CROSSOVER_VALUE_MASK, CROSSOVER_BITS,
  CROSSOVER_NONE, CROSSOVER_TO_A, CROSSOVER_TO_B, CROSSOVER_RESERVED,
  CROSSOVER_OVERLAP_WITH_PACKED_FIELDS,
  readCrossover, withCrossover, handOffFrom, crossoverTarget, isSelfMark,
  crossoverRefusal, crossoverFor, crossoverBrushAuthors, otherPlaneId,
  type Crossover, type CrossoverBrush,
} from '../../src/core/collision/layer-transition';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import {
  COLLISION_CELL_OWNED_MASK, COLLISION_CELL_UNOWNED_MASK, collisionPaintWord,
} from '../../src/core/editing/collision-word';
import { peerRepo, readAtRev } from '../support/peer-repo';

/** The anchor, at the revision it was committed. Both are pinned: a moving
 *  target is not an anchor. */
const AEON_REV = 'aa2a9f29';
const ANCHOR = 'docs/LOOP_CROSSOVER_ENCODING.md';
const PIPELINE = 'tools/collision_pipeline.py';

describe('the crossover field, as Aurora holds it', () => {
  it('claims exactly two bits and they are DERIVED from shift+mask, not typed', () => {
    expect(CROSSOVER_BITS).toBe(CROSSOVER_VALUE_MASK << CROSSOVER_SHIFT);
    // Two bits, and both inside the 16-bit word.
    expect(CROSSOVER_BITS & 0xFFFF).toBe(CROSSOVER_BITS);
    expect(CROSSOVER_BITS.toString(2).split('1').length - 1).toBe(2);
  });

  it('⚠ does NOT overlap any field packCollisionCell writes', () => {
    // The overlap is computed from the ENCODER (saturating every field), so the
    // day `packCollisionCell` starts writing bit 14 this row goes red instead
    // of two fields silently sharing a bit.
    expect(CROSSOVER_OVERLAP_WITH_PACKED_FIELDS).toBe(0);
    expect(CROSSOVER_BITS & COLLISION_CELL_OWNED_MASK).toBe(0);
  });

  it('is exactly the bits the collision brush does NOT own — so a stroke has always preserved it', () => {
    // The load-bearing consequence, asserted rather than asserted-in-prose: the
    // 2026-08-28 preservation rule was stated as a mask complement, so every
    // stroke, stamp, paste and agent call already carries crossovers.
    expect(COLLISION_CELL_UNOWNED_MASK).toBe(CROSSOVER_BITS);
  });

  it('round-trips every legal value through a word carrying other fields', () => {
    const base = packCollisionCell({ shape: 0x1F2, xFlip: true, yFlip: true, solidity: 'top' });
    for (const c of ['none', 'to-a', 'to-b'] as Crossover[]) {
      const w = withCrossover(base, c);
      expect(readCrossover(w)).toBe(c);
      // CONTROL: the other fields survived — without this a `withCrossover`
      // that returned only the crossover bits would pass the row above.
      expect(w & COLLISION_CELL_OWNED_MASK).toBe(base & COLLISION_CELL_OWNED_MASK);
    }
  });

  it('reports the RESERVED value 3 rather than normalising it to "none"', () => {
    // A cell can only hold 3 if something outside Aurora put it there. Silently
    // rewriting it would hide a build error somebody has to fix; `reserved` is
    // a real member of the union so the audit can name a cell index.
    const w = CROSSOVER_RESERVED << CROSSOVER_SHIFT;
    expect(readCrossover(w)).toBe('reserved');
  });

  it('⚠ NO argument to withCrossover can produce the reserved value', () => {
    // Anti-clamp, enforced by the type rather than a range check: this is the
    // sentinel trap (v_factor 15) applied to a field whose top of range is a
    // hard bake error. The sweep is over the whole legal vocabulary.
    for (const c of ['none', 'to-a', 'to-b'] as Crossover[]) {
      expect((withCrossover(0xFFFF, c) >> CROSSOVER_SHIFT) & CROSSOVER_VALUE_MASK)
        .not.toBe(CROSSOVER_RESERVED);
    }
  });

  it('an absent word reads as "none"', () => {
    expect(readCrossover(undefined)).toBe('none');
    expect(readCrossover(0)).toBe('none');
    expect(CROSSOVER_NONE).toBe(0); // every unpainted cell in every act
  });
});

describe('self-marks — the illegal state, made unreachable rather than guarded', () => {
  it('hand-off is the value that LEAVES the plane', () => {
    expect(handOffFrom('a')).toBe('to-b');
    expect(handOffFrom('b')).toBe('to-a');
  });

  it('identifies a self-mark on each plane, and only there', () => {
    expect(isSelfMark('a', 'to-a')).toBe(true);
    expect(isSelfMark('b', 'to-b')).toBe(true);
    expect(isSelfMark('a', 'to-b')).toBe(false);
    expect(isSelfMark('b', 'to-a')).toBe(false);
    expect(isSelfMark('a', 'none')).toBe(false);
    expect(isSelfMark('b', 'none')).toBe(false);
  });

  it('refuses one in prose, naming the plane to use instead', () => {
    const why = crossoverRefusal('a', 'to-a');
    expect(why).not.toBeNull();
    expect(why).toMatch(/plane B/);
    expect(crossoverRefusal('a', 'to-b')).toBeNull();
  });

  it('⚠ NO brush value on ANY plane produces a self-mark', () => {
    // THE ROW. Reachability, not a guard: the point of `hand-off` over a
    // to-A/to-B pair is that the illegal state has no representation in the
    // brush, so nothing downstream has to catch it.
    for (const plane of ['a', 'b'] as const) {
      for (const brush of ['keep', 'clear', 'hand-off'] as CrossoverBrush[]) {
        const v = crossoverFor(brush, plane);
        if (v === null) continue;
        expect(isSelfMark(plane, v), `${brush} on plane ${plane} produced ${v}`).toBe(false);
      }
    }
  });

  it('CONTROL: the brush DOES author a real handoff — it is not refusing everything', () => {
    // Without this, a `crossoverFor` that always returned 'none' would pass the
    // row above by never producing anything at all.
    expect(crossoverFor('hand-off', 'a')).toBe('to-b');
    expect(crossoverFor('hand-off', 'b')).toBe('to-a');
    expect(crossoverFor('clear', 'a')).toBe('none');
    expect(crossoverFor('keep', 'a')).toBeNull();
  });

  it('the two-way pair a loop needs falls out of one armed brush', () => {
    // Anchor §3.3's worked example: the same cell on both planes, each carrying
    // the value that leaves it. That pair IS a toggle, which is why the
    // encoding needs no toggle value.
    expect(crossoverFor('hand-off', 'a')).toBe('to-b');
    expect(crossoverFor('hand-off', otherPlaneId('a'))).toBe('to-a');
  });
});

describe('crossoverBrushAuthors — the condition the lens arms on', () => {
  it('is true for exactly the states that write the field', () => {
    expect(crossoverBrushAuthors('keep')).toBe(false);
    expect(crossoverBrushAuthors('clear')).toBe(true);
    expect(crossoverBrushAuthors('hand-off')).toBe(true);
  });
});

describe('collisionPaintWord carries the crossover through the ONE decider', () => {
  const BRUSH = packCollisionCell({ shape: 0x22, xFlip: false, yFlip: false, solidity: 'all' });
  const destWithMark = withCrossover(
    packCollisionCell({ shape: 9, xFlip: true, yFlip: false, solidity: 'top' }), 'to-b');

  it('keep PRESERVES an existing crossover — and needs no code to do it', () => {
    expect(readCrossover(destWithMark)).toBe('to-b'); // the row is not vacuous
    expect(readCrossover(collisionPaintWord(BRUSH, destWithMark))).toBe('to-b');
    expect(readCrossover(collisionPaintWord(BRUSH, destWithMark, 'keep', 'a'))).toBe('to-b');
  });

  it('CONTROL: keep still writes the fields the brush owns', () => {
    const out = collisionPaintWord(BRUSH, destWithMark);
    expect(out & COLLISION_CELL_OWNED_MASK).toBe(BRUSH & COLLISION_CELL_OWNED_MASK);
  });

  it('hand-off authors the plane-correct value on each plane', () => {
    expect(readCrossover(collisionPaintWord(BRUSH, 0, 'hand-off', 'a'))).toBe('to-b');
    expect(readCrossover(collisionPaintWord(BRUSH, 0, 'hand-off', 'b'))).toBe('to-a');
  });

  it('clear erases a mark that was there', () => {
    expect(readCrossover(collisionPaintWord(BRUSH, destWithMark, 'clear', 'a'))).toBe('none');
  });

  it('⚠ THROWS if asked to author without naming a plane', () => {
    // Defaulting to a plane here would author a self-mark half the time, and a
    // self-mark is a BUILD failure in aeon rather than a visible editor defect.
    expect(() => collisionPaintWord(BRUSH, 0, 'hand-off')).toThrow(/name its plane/);
    expect(() => collisionPaintWord(BRUSH, 0, 'clear')).toThrow(/name its plane/);
    // ...but `keep` needs no plane, because it decides nothing.
    expect(() => collisionPaintWord(BRUSH, 0)).not.toThrow();
  });
});

describe('CURRENCY — the constants agree with aeon\'s committed anchor', () => {
  // `ctx.skip(reason)`, never `console.warn(…); return`. A `return` from a test
  // body is recorded as a PASS: the word "SKIP" in a console line reaches no
  // reporter, no total and no gate, so this row sat in the green column on every
  // machine without an aeon checkout and there was no input that could turn it
  // red. Measured 2026-08-29, docs/reviews/2026-08-29-fixture-absent-honesty.md.
  it(`parses ${ANCHOR} at ${AEON_REV} and matches every value`, (ctx) => {
    const repo = peerRepo('aeon');
    if (repo === null) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO) — cannot cross-check ${ANCHOR} at ${AEON_REV}`);
      return;
    }
    const blob = readAtRev(repo, AEON_REV, ANCHOR);
    if (!blob.ok && /does not resolve/.test(blob.why)) {
      ctx.skip(`SKIPPED, NOT PASSED: ${blob.why}`);
      return;
    }
    // An ABSENT anchor at a pinned revision is a FAILURE, not a skip: it means
    // the document this file transcribes was deleted or renamed.
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    const src = (blob as { ok: true; text: string }).text;

    // `XOVER_SHIFT = 14`, `XOVER_MASK = 3` — stated in §3.1 as backticked code.
    const num = (name: string): number => {
      const m = new RegExp(`${name}\\s*=\\s*(0x[0-9A-Fa-f]+|\\d+)`).exec(src);
      expect(m, `${name} not found in ${ANCHOR} @ ${AEON_REV}`).not.toBeNull();
      return Number(m![1]);
    };
    expect(num('XOVER_SHIFT')).toBe(CROSSOVER_SHIFT);
    expect(num('XOVER_MASK')).toBe(CROSSOVER_VALUE_MASK);

    // The value table, §3.2. Parsed from the markdown rows rather than trusted,
    // so a renumbering upstream turns this red.
    const row = (value: number, name: string) => {
      const re = new RegExp(`\\|\\s*\`${value}\`\\s*\\|[^|]*${name}`);
      expect(re.test(src), `${ANCHOR} @ ${AEON_REV} does not map ${value} -> ${name}`).toBe(true);
    };
    row(CROSSOVER_NONE, 'XOVER_NONE');
    row(CROSSOVER_TO_A, 'XOVER_TO_A');
    row(CROSSOVER_TO_B, 'XOVER_TO_B');
    row(CROSSOVER_RESERVED, 'RESERVED');

    // The self-mark rule (R2) — the constraint the brush's whole shape follows
    // from, and the one an anchor summary is most likely to drop.
    expect(/[Ss]elf-marks are illegal/.test(src), `${ANCHOR} no longer states the self-mark rule`).toBe(true);
  });

  it('⚠ the SAME bit number means path-B SOLIDITY in aeon\'s OTHER baker', (ctx) => {
    // Not decoration. `bake_cell`'s donor chunk-entry word puts path-B solidity
    // at shift 14, and writing a crossover there would silently make ordinary
    // ground solid on a path nobody painted. This row exists so the collision
    // between the two word spaces is a measured fact in this repo rather than a
    // sentence in a document, and so it turns red if aeon ever moves either.
    const repo = peerRepo('aeon');
    if (repo === null) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO) — cannot cross-check ${PIPELINE} at ${AEON_REV}`);
      return;
    }
    const blob = readAtRev(repo, AEON_REV, PIPELINE);
    if (!blob.ok && /does not resolve/.test(blob.why)) { ctx.skip(`SKIPPED, NOT PASSED: ${blob.why}`); return; }
    expect(blob.ok, blob.ok ? '' : blob.why).toBe(true);
    const src = (blob as { ok: true; text: string }).text;
    const m = /^PATH_B_SOL_SHIFT\s*=\s*(\d+)/m.exec(src);
    expect(m, `PATH_B_SOL_SHIFT not found in ${PIPELINE} @ ${AEON_REV}`).not.toBeNull();
    expect(Number(m![1])).toBe(CROSSOVER_SHIFT);
    // And Aurora only ever produces per-plane words, so this collision is
    // recorded, not risked: nothing here writes a donor word at all.
  });
});

describe('crossoverTarget', () => {
  it('names the plane a value sends you to, and null for none', () => {
    expect(crossoverTarget('to-a')).toBe('a');
    expect(crossoverTarget('to-b')).toBe('b');
    expect(crossoverTarget('none')).toBeNull();
  });
});
