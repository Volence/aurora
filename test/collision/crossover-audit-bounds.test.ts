// WHAT THE CROSSOVER AUDIT DOES AT THE EDGE OF ITS INPUT, AND WHY A ZERO THERE
// IS THE DANGEROUS ANSWER.
//
// The audit's three reporting tiers are covered by crossover-audit.test.ts and
// its coordinates by crossover-locus.test.ts. Neither asks what happens when the
// audit is handed LESS DATA THAN IT WAS TOLD ABOUT, and that is the direction
// that hurts: a self-mark the audit never looked at reports as `severity: 'ok'`
// with a null message, which is indistinguishable from a document that is
// actually clean. An under-report is what somebody acts on.
//
// THREE SEPARATE MECHANISMS ARE MEASURED HERE, because they fail independently:
//
//  1. `scanCancellingRuns` takes `length` as a PARAMETER and nothing checked it
//     against the arrays. Past the end `plane[i]` is `undefined`, `readCrossover`
//     folds `undefined` to 0 = `'none'`, and a cell that does not exist reads
//     exactly like a cell with no crossover. Measured with a Proxy that records
//     every index read outside `[0, length)`, so the row fails on the READ
//     rather than on a downstream count that might mask it.
//  2. `auditCrossovers` truncates to the SHORTER plane (which is correct, and
//     crossover-audit.test.ts's "rather than reading past an end" row already
//     holds it) and then said NOTHING about the cells it skipped. Those rows are
//     here.
//  3. `cancellingMeasured` was set from the STRIDE ALONE, so an audit whose
//     scan walked zero rows still claimed the cancellation check had run.
//
// ⚠ THE DECODE IS ROUND-TRIPPED BEFORE ANY OF IT IS TRUSTED. A past incident in
// this area (banked, and referenced by layer-transition.ts's header) turned out
// to be a little-endian misread of a big-endian file, so the first row below
// writes a crossover with `withCrossover`, reads it back BY NAME, and pins the
// raw integer against the shift and value constants. Every fixture in this file
// is built by that same writer, so no row rests on a hand-typed bit pattern.

import { describe, it, expect } from 'vitest';
import {
  auditCrossovers, crossoverAuditMessage, crossoverAuditSeverity,
  crossoverInPlane, cancellingScanRows, scanCancellingRuns,
} from '../../src/core/collision/crossover-audit';
import {
  withCrossover, readCrossover,
  CROSSOVER_SHIFT, CROSSOVER_TO_A, CROSSOVER_TO_B,
} from '../../src/core/collision/layer-transition';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

const SOLID = packCollisionCell({ shape: 0x11, xFlip: false, yFlip: false, solidity: 'all' });
/** The two-way pair one armed `hand-off` brush writes: plane A says go to B. */
const HAND_A = withCrossover(SOLID, 'to-b');
const HAND_B = withCrossover(SOLID, 'to-a');
/** Illegal on plane A (rule R2). The thing an under-reporting audit hides. */
const SELF_A = withCrossover(SOLID, 'to-a');

const plane = (...w: number[]) => Uint16Array.from(w);

/** An `ArrayLike` that records every numeric index read at or past its end.
 *  A plain array cannot do this job: reading past the end of one is silent, and
 *  silence is the defect. */
function watched(words: number[]): { view: ArrayLike<number>; past: number[] } {
  const past: number[] = [];
  const view = new Proxy(words, {
    get(target, prop) {
      if (typeof prop === 'string' && /^[0-9]+$/.test(prop) && Number(prop) >= target.length) {
        past.push(Number(prop));
      }
      return (target as unknown as Record<string, unknown>)[prop as string];
    },
  }) as unknown as ArrayLike<number>;
  return { view, past };
}

describe('the decode itself, round-tripped before anything below leans on it', () => {
  it('writes a crossover by name, reads it back by name, and pins the raw integer', () => {
    // Round trip: name -> word -> name.
    expect(readCrossover(withCrossover(0, 'to-b'))).toBe('to-b');
    expect(readCrossover(withCrossover(0, 'to-a'))).toBe('to-a');
    expect(readCrossover(withCrossover(SOLID, 'none'))).toBe('none');
    // And the integer, against the encoding's own two constants rather than a
    // typed-in 0x8000: a reversed field would still round-trip through the pair
    // above and would fail HERE.
    expect(withCrossover(0, 'to-b')).toBe(CROSSOVER_TO_B << CROSSOVER_SHIFT);
    expect(withCrossover(0, 'to-a')).toBe(CROSSOVER_TO_A << CROSSOVER_SHIFT);
    // The fixtures this file paints with really do carry what their names say.
    expect(readCrossover(HAND_A)).toBe('to-b');
    expect(readCrossover(HAND_B)).toBe('to-a');
    expect(readCrossover(SELF_A)).toBe('to-a');
  });
});

describe('crossoverInPlane: absent is not none', () => {
  it('reads a real cell by name', () => {
    expect(crossoverInPlane(plane(HAND_A, SOLID), 0)).toBe('to-b');
    expect(crossoverInPlane(plane(HAND_A, SOLID), 1)).toBe('none');
  });

  it('returns NULL past the end, where readCrossover returns "none"', () => {
    const p = plane(HAND_A, SOLID);
    // The conflation, stated as the two calls side by side: the fold is what
    // `readCrossover` is for on a word it was handed, and it is exactly wrong
    // as an answer about an index that is not in the plane.
    expect(readCrossover(p[7])).toBe('none');
    expect(crossoverInPlane(p, 7)).toBeNull();
    expect(crossoverInPlane(p, 2)).toBeNull();
  });

  it('returns NULL for a negative, fractional or hole index rather than a value', () => {
    expect(crossoverInPlane(plane(HAND_A), -1)).toBeNull();
    expect(crossoverInPlane(plane(HAND_A), 0.5)).toBeNull();
    // A hole inside a sparse array is not a zero either: nothing was authored
    // there, so there is nothing to report.
    const sparse: number[] = [];
    sparse.length = 3;
    sparse[0] = HAND_A;
    expect(crossoverInPlane(sparse, 0)).toBe('to-b');
    expect(crossoverInPlane(sparse, 1)).toBeNull();
  });
});

describe('scanCancellingRuns: it cannot be talked into reading past an end', () => {
  it('reads no index outside either plane, however long a length it is given', () => {
    // Eight words of a two-way pair at cell width: the cancelling shape, four
    // 8px columns of it, so there IS something real to find in row 0.
    const a = watched(new Array(8).fill(HAND_A));
    const b = watched(new Array(8).fill(HAND_B));
    const runs = scanCancellingRuns(a.view, b.view, 16, 4);
    expect(a.past).toEqual([]);
    expect(b.past).toEqual([]);
    // AND THE CLAMP DID NOT BLIND IT: the run inside the real extent is still
    // reported, so this row cannot be passed by a scan that gave up.
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].index).toBe(0);
    expect(runs[0].width).toBe(4);
  });

  it('CONTROL: given a truthful length it finds the same run and reads nothing past the end', () => {
    const a = watched(new Array(8).fill(HAND_A));
    const b = watched(new Array(8).fill(HAND_B));
    const runs = scanCancellingRuns(a.view, b.view, 8, 4);
    expect(a.past).toEqual([]);
    expect(b.past).toEqual([]);
    expect(runs.map((r) => r.index)).toEqual([0]);
  });

  it('reads nothing past the end when only ONE plane is short', () => {
    const a = watched(new Array(8).fill(HAND_A));
    const b = watched(new Array(4).fill(HAND_B));
    // Stride 2 so the scan walks a SECOND cell row (rows 0 and 2), whose base
    // index 4 is past plane B's end but inside plane A's. That is the shape a
    // pair of unequal planes actually makes.
    scanCancellingRuns(a.view, b.view, 8, 2);
    expect(a.past).toEqual([]);
    expect(b.past).toEqual([]);
  });
});

describe('cancellingScanRows: the one place that says how much the scan can see', () => {
  it('is zero when the words do not fill one row, and the audit believes it', () => {
    expect(cancellingScanRows(3, 4)).toBe(0);
    expect(cancellingScanRows(4, 4)).toBe(1);
    expect(cancellingScanRows(9, 4)).toBe(2);
    expect(cancellingScanRows(4, 0)).toBe(0);
  });

  it('an audit whose scan walked no rows does NOT claim the check ran', () => {
    // Three words, stride 4: not one full row. The stride is perfectly usable,
    // so the old gate (`stride !== null`) said measured; nothing was scanned.
    const a = auditCrossovers(plane(HAND_A, HAND_A, HAND_A), plane(HAND_B, HAND_B, HAND_B), 4, 0);
    expect(a.pairs).toBe(3);
    expect(a.cancelling).toBe(0);
    expect(a.cancellingMeasured).toBe(false);
    expect(crossoverAuditMessage(a)).toMatch(/did NOT run/);
  });

  it('CONTROL: one full row of the same content IS measured, and finds the pair', () => {
    const a = auditCrossovers(
      Uint16Array.from({ length: 4 }, () => HAND_A),
      Uint16Array.from({ length: 4 }, () => HAND_B), 4, 0);
    expect(a.cancellingMeasured).toBe(true);
    expect(a.cancelling).toBe(1);
  });
});

describe('auditCrossovers: the cells it did not look at are reported, not dropped', () => {
  it('a self-mark past the shorter plane end is not silently clean', () => {
    // Plane A carries an illegal self-mark at index 2. Plane B is one word long,
    // so the audit examines one cell and index 2 is never read. Before this
    // parcel that was `severity: 'ok'` and a NULL message: a clean bill of
    // health for a document that hard-errors aeon's bake.
    const a = auditCrossovers(plane(SOLID, SOLID, SELF_A), plane(SOLID), 1, 7);
    expect(a.cells).toBe(1);
    expect(a.selfMarks).toBe(0);          // it genuinely did not see it
    expect(a.unexamined).toBe(2);         // and it says so
    const msg = crossoverAuditMessage(a);
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/NOT EXAMINED/);
    expect(msg).toMatch(/2 cell/);
  });

  it('an absent second plane examines nothing and refuses to look clean', () => {
    const a = auditCrossovers(plane(SELF_A, SELF_A), undefined, 1, 3);
    expect(a.cells).toBe(0);
    expect(a.unexamined).toBe(2);
    expect(crossoverAuditMessage(a)).toMatch(/NOT EXAMINED/);
  });

  it('two absent planes have nothing to examine and say nothing', () => {
    const a = auditCrossovers(null, undefined, 1, 3);
    expect(a.cells).toBe(0);
    expect(a.unexamined).toBe(0);
    expect(crossoverAuditMessage(a)).toBeNull();
  });

  it('CONTROL: equal-length planes report zero unexamined and stay silent when clean', () => {
    const a = auditCrossovers(plane(SOLID, SOLID), plane(SOLID, SOLID), 2, 0);
    expect(a.unexamined).toBe(0);
    expect(crossoverAuditSeverity(a)).toBe('ok');
    expect(crossoverAuditMessage(a)).toBeNull();
  });

  it('the unexamined sentence stands beside a real finding rather than replacing it', () => {
    const a = auditCrossovers(plane(SELF_A, SOLID, SELF_A), plane(SOLID, SOLID), 2, 0);
    expect(a.selfMarks).toBe(1);
    expect(a.unexamined).toBe(1);
    expect(crossoverAuditSeverity(a)).toBe('error');
    const msg = crossoverAuditMessage(a) ?? '';
    expect(msg).toMatch(/SELF-MARK/);
    expect(msg).toMatch(/NOT EXAMINED/);
  });

  it('names the missing-stride reason only when the stride is what is missing', () => {
    // Both audits have `cancellingMeasured: false` and a real pair, so both get
    // the loud sentence. They must not give the SAME reason: one was called
    // without a stride, the other had a fine stride and too few words.
    const noStride = crossoverAuditMessage(auditCrossovers(plane(HAND_A), plane(HAND_B))) ?? '';
    const tooShort = crossoverAuditMessage(
      auditCrossovers(plane(HAND_A), plane(HAND_B), 4, 0)) ?? '';
    expect(noStride).toMatch(/without a row stride/);
    expect(tooShort).toMatch(/did NOT run/);
    expect(tooShort).not.toMatch(/without a row stride/);
  });
});
