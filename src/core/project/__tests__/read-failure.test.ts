// THE THREE SENTENCES A NO-BYTES READ CAN PRODUCE, AND THAT THEY ARE THREE.
//
// FABRICATED-ENOENT (lens sweep HIGH, fixed 2026-09-08): both consumers of
// `FileAccess.readMany` had hand-typed `ENOENT: no such file or directory` for
// every reason an entry could arrive with no bytes, so a permissions failure and
// a refused path each told the author their file did not exist. The message now
// lives in exactly one function and the producer states which fact it has.
//
// ⚠ WHY THESE ROWS MATCH WHAT THEY MATCH. The hazard in a parcel about MESSAGES is
// a matcher that a DIFFERENT rule also satisfies. `/no such file/` is the specific
// trap here: it is emitted by the 'absent' branch (correctly), by
// `unwrapBinaryRead` in shared/ipc-types (correctly, gated on a real ENOENT), and
// it was emitted by the fabricated throws (incorrectly). So the 'unreadable' and
// 'refused' rows below assert its ABSENCE as well as their own wording, and the
// last row asserts the three are pairwise distinct. Any single row could be
// satisfied by a wrong implementation; the set cannot.
//
// RED-FIRST: proven by replacing the switch body with the single fabricated
// ENOENT return (mutation in the parcel's report). Runner:
// `npx vitest run src/core/project/__tests__/read-failure.test.ts`, inside
// `npm test`'s `vitest run`.
import { describe, it, expect } from 'vitest';
import { readFailureError, readFailureMessage } from '../read-failure';
import type { ReadFailureOutcome } from '../../../shared/ipc-types';

const P = 'map16/GHZ.eni';

describe('readFailureMessage', () => {
  it("'absent' is the one case that says the file is not there, in Node's own words", () => {
    expect(readFailureMessage(P, 'absent', null))
      .toBe(`ENOENT: no such file or directory, open '${P}'`);
  });

  it("'unreadable' names the path and the errno, and never says it does not exist", () => {
    const msg = readFailureMessage(P, 'unreadable', `EACCES: permission denied, open '${P}'`);
    expect(msg).toBe(`'${P}' could not be read: EACCES: permission denied, open '${P}'`);
    // THE DEFECT ITSELF: this is the sentence an author with an intact but
    // unreadable file used to be shown.
    expect(msg).not.toMatch(/no such file or directory/);
  });

  it("'refused' says Aurora declined to look, which is not a claim about the disk", () => {
    const msg = readFailureMessage(P, 'refused', `unsafe project-relative path (escapes root): '${P}'`);
    expect(msg).toBe(`refused to read '${P}': unsafe project-relative path (escapes root): '${P}'`);
    expect(msg).not.toMatch(/no such file or directory/);
    expect(msg).not.toMatch(/could not be read/);
  });

  it('a missing reason costs the path and the verdict nothing', () => {
    expect(readFailureMessage(P, 'unreadable', null)).toBe(`'${P}' could not be read`);
    expect(readFailureMessage(P, 'refused', null)).toBe(`refused to read '${P}'`);
  });

  it('CONTROL: the three outcomes are three pairwise-distinct sentences for one path', () => {
    const outcomes: ReadFailureOutcome[] = ['absent', 'unreadable', 'refused'];
    const msgs = outcomes.map((o) => readFailureMessage(P, o, 'because'));
    expect(new Set(msgs).size).toBe(3);
    // And every one of them names the file, which is the part all three owe the
    // reader regardless of cause.
    for (const m of msgs) expect(m).toContain(P);
  });

  it('readFailureError carries the same text', () => {
    const e = readFailureError(P, 'unreadable', 'EIO: i/o error');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe(readFailureMessage(P, 'unreadable', 'EIO: i/o error'));
  });
});
