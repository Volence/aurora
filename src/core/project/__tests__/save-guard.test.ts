// THE DECISION TABLE, AND THAT EACH ROW SAYS WHICH ROW IT IS.
//
// ═══ WHY THESE ROWS CHANGED (ONE-MESSAGE-FOUR-CAUSES, 2026-09-08) ════════════
//
// Every row here used to assert `conflicts: ['a.bin']` -- a list of PATHS. That is
// the defect the sweep found, expressed as a test: the guard derives 'changed' /
// 'deleted' / 'appeared' and the assertion could not see any of it, so all three
// rows below were satisfied by the same single value and five author-facing
// surfaces went on telling everyone their files had changed. A row that cannot
// distinguish the cases it is named after is not testing the table.
//
// The input changed too, and that is the FOURTH cause. `currentMtimes` was
// `Record<string, number | null>`, so "stat says nothing is there" and "stat failed
// and I have no idea" were one value, and guarded-write.ts's own comment admitted
// it folded them ("missing (ENOENT) or otherwise unstattable"). An unstattable file
// therefore came out of this table as DELETED. It is now a `CurrentMtime` sentinel
// with three states.
//
// RED-FIRST: proven by returning a boolean cause from `conflictCause` and pushing
// bare relPaths again, and separately by mapping 'unknown' to 'absent' (both
// mutations in the parcel's report). Runner:
// `npx vitest run src/core/project/__tests__/save-guard.test.ts`, inside
// `npm test`'s `vitest run`.
import { describe, it, expect } from 'vitest';
import { planGuardedWrite, type CurrentMtime, type GuardedFileSpec } from '../save-guard';

const present = (mtimeMs: number): CurrentMtime => ({ state: 'present', mtimeMs });
const absent: CurrentMtime = { state: 'absent' };
const unknown = (reason: string): CurrentMtime => ({ state: 'unknown', reason });

describe('planGuardedWrite decision table', () => {
  it('OK: existing file, on-disk mtime equals expected', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': present(1000) })).toEqual({ ok: true });
  });

  it("CONFLICT 'changed': existing file changed externally (mtime differs)", () => {
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': present(1500) })).toEqual({
      ok: false, conflicts: [{ relPath: 'a.bin', cause: 'changed', reason: null }],
    });
  });

  it("CONFLICT 'deleted': file present at read, absent now", () => {
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': absent })).toEqual({
      ok: false, conflicts: [{ relPath: 'a.bin', cause: 'deleted', reason: null }],
    });
  });

  it("CONFLICT 'unknown': the writer could not determine the file's state", () => {
    // THE FOURTH CAUSE. Under the old `number | null` input this arrived as null
    // and came out as 'deleted', so the author of an intact-but-unstattable file
    // was told it had been deleted and to reload.
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': unknown("EACCES: permission denied, stat 'a.bin'") })).toEqual({
      ok: false,
      conflicts: [{ relPath: 'a.bin', cause: 'unknown', reason: "EACCES: permission denied, stat 'a.bin'" }],
    });
  });

  it("CONFLICT 'unknown' also when the file was not expected to exist", () => {
    // Cannot-tell blocks the write from BOTH sides of `expectedMtimeMs`: an
    // unstattable path may well be holding a file this save would clobber.
    const files: GuardedFileSpec[] = [{ relPath: 'new.bin', expectedMtimeMs: null }];
    expect(planGuardedWrite(files, { 'new.bin': unknown('EIO: i/o error') })).toEqual({
      ok: false, conflicts: [{ relPath: 'new.bin', cause: 'unknown', reason: 'EIO: i/o error' }],
    });
  });

  it("a relPath the writer said NOTHING about is 'unknown', not absent", () => {
    // The old `?? null` read that silence as "it was deleted", which is a claim
    // about the filesystem made from no observation at all. In production
    // guarded-write.ts fills every key, so this guards the next caller.
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    const plan = planGuardedWrite(files, {});
    expect(plan.ok).toBe(false);
    expect(plan.ok === false && plan.conflicts[0].cause).toBe('unknown');
    expect(plan.ok === false && plan.conflicts[0].reason).toContain('a.bin');
  });

  it('OK: expected null (new file) and still absent, we create it', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'new.bin', expectedMtimeMs: null }];
    expect(planGuardedWrite(files, { 'new.bin': absent })).toEqual({ ok: true });
  });

  it("CONFLICT 'appeared': expected null but a file appeared externally", () => {
    const files: GuardedFileSpec[] = [{ relPath: 'new.bin', expectedMtimeMs: null }];
    expect(planGuardedWrite(files, { 'new.bin': present(2000) })).toEqual({
      ok: false, conflicts: [{ relPath: 'new.bin', cause: 'appeared', reason: null }],
    });
  });

  it('CONTROL: the four causes are four DIFFERENT values in one plan', () => {
    // The assertion the old rows could not make. Before the fix this list was
    // four bare paths and the causes were indistinguishable, which is exactly why
    // one sentence covered all of them.
    const files: GuardedFileSpec[] = [
      { relPath: 'changed.bin', expectedMtimeMs: 100 },
      { relPath: 'deleted.bin', expectedMtimeMs: 200 },
      { relPath: 'appeared.bin', expectedMtimeMs: null },
      { relPath: 'blind.bin', expectedMtimeMs: 300 },
      { relPath: 'fine.bin', expectedMtimeMs: 400 },
    ];
    const plan = planGuardedWrite(files, {
      'changed.bin': present(999),
      'deleted.bin': absent,
      'appeared.bin': present(1),
      'blind.bin': unknown('ELOOP: too many symbolic links'),
      'fine.bin': present(400),
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.conflicts).toEqual([
      { relPath: 'changed.bin', cause: 'changed', reason: null },
      { relPath: 'deleted.bin', cause: 'deleted', reason: null },
      { relPath: 'appeared.bin', cause: 'appeared', reason: null },
      { relPath: 'blind.bin', cause: 'unknown', reason: 'ELOOP: too many symbolic links' },
    ]);
    expect(new Set(plan.conflicts.map((c) => c.cause)).size).toBe(4);
    // And the safe file is not in the list at all.
    expect(plan.conflicts.map((c) => c.relPath)).not.toContain('fine.bin');
  });

  it('all-or-nothing: one conflict among many reports only the conflicting path(s)', () => {
    const files: GuardedFileSpec[] = [
      { relPath: 'a.bin', expectedMtimeMs: 100 },
      { relPath: 'b.bin', expectedMtimeMs: 200 },
      { relPath: 'c.bin', expectedMtimeMs: null },
    ];
    const plan = planGuardedWrite(files, {
      'a.bin': present(100), 'b.bin': present(999), 'c.bin': absent,
    });
    expect(plan).toEqual({
      ok: false, conflicts: [{ relPath: 'b.bin', cause: 'changed', reason: null }],
    });
  });

  it('reports every conflicting file, order-preserving', () => {
    const files: GuardedFileSpec[] = [
      { relPath: 'a.bin', expectedMtimeMs: 100 },
      { relPath: 'b.bin', expectedMtimeMs: 200 },
      { relPath: 'c.bin', expectedMtimeMs: 300 },
    ];
    const plan = planGuardedWrite(files, {
      'a.bin': present(111), 'b.bin': present(200), 'c.bin': present(333),
    });
    expect(plan).toEqual({
      ok: false,
      conflicts: [
        { relPath: 'a.bin', cause: 'changed', reason: null },
        { relPath: 'c.bin', cause: 'changed', reason: null },
      ],
    });
  });

  it('empty file list is trivially OK', () => {
    expect(planGuardedWrite([], {})).toEqual({ ok: true });
  });

  it('dedupes a relPath that appears twice in the file list', () => {
    const files: GuardedFileSpec[] = [
      { relPath: 'a.bin', expectedMtimeMs: 100 },
      { relPath: 'a.bin', expectedMtimeMs: 100 },
    ];
    expect(planGuardedWrite(files, { 'a.bin': present(999) })).toEqual({
      ok: false, conflicts: [{ relPath: 'a.bin', cause: 'changed', reason: null }],
    });
  });
});
