// THE RESERVED-BITS AUDIT: any non-zero bits 15:14 is an ERROR, named by cell.
//
// Replaces the retired `crossover-audit`, `crossover-audit-bounds` and
// `crossover-locus` test files (ROADMAP rows 223+224): the loop-mark classes those
// drove (self-marks, one-way, cancelling pairs) are gone with the marks, and
// aeon now REFUSES every non-zero value, so there is one class and it is an
// error. The properties that survive, each asserted here:
//   • every value 1..3 on either plane is an ERROR; a clean pair is ok, null message;
//   • the counts are exact and never capped (the sample is);
//   • a hit is PLACED in aeon's own vocabulary ("editor cell (col, row)", the 8px
//     sub-tile, `tools/ojz_strip_gen.py` at aeon d3b98868) and Aurora's 16px cell;
//   • no stride means NO coordinate, said in words, never (0, 0);
//   • each plane is scanned over its WHOLE length, so a short twin cannot hide
//     the longer plane's tail (the old audit's `unexamined` problem);
//   • it never mutates what it reads.
//
// ⚠ ANTI-VACUOUS: aeon ships every plane clean, so every hit is planted here.

import { describe, it, expect } from 'vitest';
import {
  auditReservedBits, reservedAuditSeverity, reservedAuditMessage, RESERVED_SAMPLE_CAP,
} from '../../src/core/collision/reserved-bits-audit';
import { PLANE_RESERVED_SHIFT } from '../../src/core/collision/reserved-bits';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import { CELL_SUBTILE_COLS, CELL_SUBTILE_ROWS } from '../../src/core/collision/collision-cell';

const W = 256;                                   // an aeon section's sub-tile row stride
const SOLID = packCollisionCell({ shape: 7, xFlip: false, yFlip: false, solidity: 'all' });
const plane = () => new Uint16Array(W * 8).fill(SOLID);
const mark = (p: Uint16Array, i: number, v: number) => { p[i] = (p[i]! | (v << PLANE_RESERVED_SHIFT)) & 0xFFFF; };

describe('reserved-bits audit: the verdict', () => {
  it('a clean pair is ok, with no message', () => {
    const a = auditReservedBits(plane(), plane(), W, 0);
    expect(reservedAuditSeverity(a)).toBe('ok');
    expect(reservedAuditMessage(a)).toBeNull();
    expect(a.reservedA + a.reservedB).toBe(0);
    // anti-vacuous: it DID read both planes.
    expect(a.wordsA).toBe(W * 8);
    expect(a.wordsB).toBe(W * 8);
  });

  for (const v of [1, 2, 3]) {
    for (const which of ['a', 'b'] as const) {
      it(`⚠ value ${v} on plane ${which.toUpperCase()} is an ERROR`, () => {
        const A = plane(), B = plane();
        mark(which === 'a' ? A : B, 3 * W + 41, v);
        const a = auditReservedBits(A, B, W, 5);
        expect(reservedAuditSeverity(a)).toBe('error');
        expect(which === 'a' ? a.reservedA : a.reservedB).toBe(1);
        expect(a.sample).toEqual([{
          plane: which, index: 3 * W + 41, value: v,
          at: { subCol: 41, subRow: 3, cellCol: Math.floor(41 / CELL_SUBTILE_COLS), cellRow: Math.floor(3 / CELL_SUBTILE_ROWS) },
        }]);
      });
    }
  }
});

describe('reserved-bits audit: counts, places and words', () => {
  it('names aeon\'s editor cell AND Aurora\'s 16px cell, and says what to do', () => {
    const A = plane();
    mark(A, 5 * W + 37, 2);
    const msg = reservedAuditMessage(auditReservedBits(A, plane(), W, 0))!;
    console.log(`[rba] ${msg}`);
    expect(msg).toMatch(/section 0 plane A editor cell \(37, 5\) = 16px cell \(col 18, row 2\)/);
    expect(msg).toMatch(/aeon now REFUSES/);
    expect(msg).toMatch(/will not SAVE/);
    expect(msg).toMatch(/Clear retired marks/);
    expect(msg).toMatch(/layer_lines\.json/);
  });

  it('counts are exact and NOT capped; only the sample is', () => {
    const A = plane(), B = plane();
    for (let i = 0; i < 40; i++) mark(A, i, 1);
    for (let i = 0; i < 3; i++) mark(B, W + i, 3);
    const a = auditReservedBits(A, B, W, 1);
    expect(a.reservedA).toBe(40);
    expect(a.reservedB).toBe(3);
    expect(a.sample).toHaveLength(RESERVED_SAMPLE_CAP);
    expect(reservedAuditMessage(a)).toMatch(/43 collision words \(A: 40, B: 3\)/);
    expect(reservedAuditMessage(a)).toMatch(/and 39 more/);
  });

  it('no stride: counted, still an error, and the message says there is NO coordinate rather than inventing one', () => {
    const A = plane();
    mark(A, W + 1, 2);
    const a = auditReservedBits(A, plane(), undefined, null);
    expect(reservedAuditSeverity(a)).toBe('error');
    expect(a.sample[0]!.at).toBeNull();
    const msg = reservedAuditMessage(a)!;
    expect(msg).toMatch(/plane A index 257 \(no row stride, so no cell coordinate\)/);
    expect(msg).not.toMatch(/editor cell \(/);
  });

  it('⚠ scans each plane over its WHOLE length: a short twin cannot hide the longer plane\'s tail', () => {
    const A = plane();
    const B = new Uint16Array(4).fill(SOLID);     // a short plane B
    mark(A, A.length - 1, 1);                     // past B's end
    const a = auditReservedBits(A, B, W, 0);
    expect(a.reservedA).toBe(1);
    expect(reservedAuditSeverity(a)).toBe('error');
  });

  it('an absent plane contributes nothing and is not an error by itself', () => {
    const a = auditReservedBits(plane(), null, W, 0);
    expect(a.wordsB).toBe(0);
    expect(reservedAuditSeverity(a)).toBe('ok');
  });

  it('never mutates what it reads', () => {
    const A = plane();
    mark(A, 9, 3);
    const before = Array.from(A);
    auditReservedBits(A, plane(), W, 0);
    expect(Array.from(A)).toEqual(before);
  });
});
