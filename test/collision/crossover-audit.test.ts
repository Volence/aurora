// THE PAINT-TIME LOOP CHECK — the half aeon's build explicitly does NOT do.
//
// Anchor §8.2: "Our build checks the encoding — R1 through R6 ... Aurora checks
// the loop — at paint time, where the INTENT is present." And it says why the
// obvious build gate is wrong: 736 cells in shipped OJZ content are solid on
// plane A only, so "every divergent cell is reachable from a crossover" would
// red the build on correct, loop-free levels.
//
// So these rows are about the three things that ARE decidable from two planes:
// something aeon's bake will hard-error on (self-mark, reserved 3), something
// that plays correctly in exactly one direction (a one-way crossover), and the
// context number that says whether the planes differ at all.

import { describe, it, expect } from 'vitest';
import {
  auditCrossovers, crossoverAuditSeverity, crossoverAuditMessage, AUDIT_SAMPLE_CAP,
} from '../../src/core/collision/crossover-audit';
import { withCrossover } from '../../src/core/collision/layer-transition';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

const SOLID = packCollisionCell({ shape: 0x11, xFlip: false, yFlip: false, solidity: 'all' });
const AIR = 0;
/** A two-way crossover pair, as one armed `hand-off` brush produces it. */
const HAND_A = withCrossover(SOLID, 'to-b');   // plane A: go to B
const HAND_B = withCrossover(SOLID, 'to-a');   // plane B: go to A
/** The illegal ones. Aurora's brush cannot make these; a paste, an import, an
 *  agent call or a hand-poked cell can. */
const SELF_A = withCrossover(SOLID, 'to-a');   // on plane A — refused by rule R2
const RESERVED = SOLID | (3 << 14);

const plane = (...w: number[]) => Uint16Array.from(w);

describe('auditCrossovers — nothing to say', () => {
  it('is silent and OK on unmarked content, however solid', () => {
    const a = auditCrossovers(plane(SOLID, SOLID, AIR), plane(SOLID, SOLID, AIR));
    expect(a.marksA).toBe(0);
    expect(a.marksB).toBe(0);
    expect(a.solidBoth).toBe(2);
    expect(a.divergent).toBe(0);
    expect(crossoverAuditSeverity(a)).toBe('ok');
    expect(crossoverAuditMessage(a)).toBeNull();
  });

  it('reports a missing plane as nothing rather than throwing', () => {
    expect(auditCrossovers(plane(SOLID), null).cells).toBe(0);
    expect(auditCrossovers(null, plane(SOLID)).cells).toBe(0);
    expect(auditCrossovers(undefined, undefined).cells).toBe(0);
  });
});

describe('auditCrossovers — a complete two-way crossover is OK', () => {
  it('counts the pair and says nothing', () => {
    const a = auditCrossovers(plane(HAND_A), plane(HAND_B));
    expect(a.marksA).toBe(1);
    expect(a.marksB).toBe(1);
    expect(a.pairs).toBe(1);
    expect(a.oneWay).toBe(0);
    expect(a.selfMarks).toBe(0);
    expect(crossoverAuditSeverity(a)).toBe('ok');
    expect(crossoverAuditMessage(a)).toBeNull();
  });
});

describe('auditCrossovers — WARN: a loop that works in one direction', () => {
  it('flags a mark on plane A with none on B, and names the cell', () => {
    // THE ROW THIS FILE EXISTS FOR. On the map these cells look identical to a
    // correct pair — each plane's overlay is drawn separately — and aeon's bake
    // does not check it either.
    const a = auditCrossovers(plane(SOLID, HAND_A), plane(SOLID, SOLID));
    expect(a.oneWay).toBe(1);
    expect(a.pairs).toBe(0);
    expect(a.oneWayAt).toEqual([1]);
    expect(crossoverAuditSeverity(a)).toBe('warn');
    expect(crossoverAuditMessage(a)).toMatch(/ONE-WAY/);
    expect(crossoverAuditMessage(a)).toMatch(/index 1/);
  });

  it('flags it the other way round too', () => {
    const a = auditCrossovers(plane(SOLID), plane(HAND_B));
    expect(a.oneWay).toBe(1);
    expect(crossoverAuditSeverity(a)).toBe('warn');
  });

  it('CONTROL: the pair case does NOT warn — the rule is asymmetry, not presence', () => {
    // Without this, an audit that warned on every crossover would pass the rows
    // above and make the feature unusable-by-warning.
    expect(crossoverAuditSeverity(auditCrossovers(plane(HAND_A), plane(HAND_B)))).toBe('ok');
  });
});

describe('auditCrossovers — ERROR: what aeon\'s bake hard-errors on', () => {
  it('catches a self-mark on plane A (rule R2) and names the rule', () => {
    const a = auditCrossovers(plane(SELF_A), plane(SOLID));
    expect(a.selfMarks).toBe(1);
    expect(a.selfMarkAt).toEqual([0]);
    expect(crossoverAuditSeverity(a)).toBe('error');
    expect(crossoverAuditMessage(a)).toMatch(/SELF-MARK/);
    expect(crossoverAuditMessage(a)).toMatch(/R2/);
  });

  it('catches a self-mark on plane B, which is the MIRROR value', () => {
    // A symmetric bug passes one of these two and fails the other, which is why
    // both are here rather than one.
    const selfB = withCrossover(SOLID, 'to-b'); // on plane B — illegal
    const a = auditCrossovers(plane(SOLID), plane(selfB));
    expect(a.selfMarks).toBe(1);
  });

  it('CONTROL: the LEGAL value on each plane is not a self-mark', () => {
    const a = auditCrossovers(plane(HAND_A), plane(HAND_B));
    expect(a.selfMarks).toBe(0);
  });

  it('catches the reserved value 3 (rule R1) and never calls it a crossover', () => {
    const a = auditCrossovers(plane(RESERVED), plane(SOLID));
    expect(a.reserved).toBe(1);
    expect(a.marksA).toBe(0);   // `reserved` is a defect, not a mark
    expect(crossoverAuditSeverity(a)).toBe('error');
    expect(crossoverAuditMessage(a)).toMatch(/RESERVED/);
    expect(crossoverAuditMessage(a)).toMatch(/R1/);
  });

  it('error outranks warn', () => {
    const a = auditCrossovers(plane(SELF_A, HAND_A), plane(SOLID, SOLID));
    expect(a.selfMarks).toBe(1);
    expect(a.oneWay).toBeGreaterThan(0);
    expect(crossoverAuditSeverity(a)).toBe('error');
  });
});

describe('auditCrossovers — the context numbers', () => {
  it('counts divergent and solid-both cells separately', () => {
    const a = auditCrossovers(plane(SOLID, SOLID, AIR), plane(SOLID, AIR, AIR));
    expect(a.solidBoth).toBe(1);
    expect(a.divergent).toBe(1);
  });

  it('caps the sample lists but never the counts', () => {
    const n = AUDIT_SAMPLE_CAP + 5;
    const a = auditCrossovers(
      Uint16Array.from({ length: n }, () => SELF_A),
      Uint16Array.from({ length: n }, () => SOLID),
    );
    expect(a.selfMarks).toBe(n);                      // the count is whole
    expect(a.selfMarkAt).toHaveLength(AUDIT_SAMPLE_CAP); // the list is bounded
  });

  it('audits the shorter of two unequal planes rather than reading past an end', () => {
    const a = auditCrossovers(plane(SOLID, SOLID, SOLID), plane(SOLID));
    expect(a.cells).toBe(1);
  });
});
