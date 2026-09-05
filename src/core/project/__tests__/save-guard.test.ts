import { describe, it, expect } from 'vitest';
import { planGuardedWrite, type GuardedFileSpec } from '../save-guard';

describe('planGuardedWrite decision table', () => {
  it('OK: existing file, on-disk mtime equals expected', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': 1000 })).toEqual({ ok: true });
  });

  it('CONFLICT: existing file changed externally (mtime differs)', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': 1500 })).toEqual({ ok: false, conflicts: ['a.bin'] });
  });

  it('CONFLICT: file present at read but deleted externally (current null)', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'a.bin', expectedMtimeMs: 1000 }];
    expect(planGuardedWrite(files, { 'a.bin': null })).toEqual({ ok: false, conflicts: ['a.bin'] });
    // Absent key is treated identically to an explicit null.
    expect(planGuardedWrite(files, {})).toEqual({ ok: false, conflicts: ['a.bin'] });
  });

  it('OK: expected null (new file) and still absent, we create it', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'new.bin', expectedMtimeMs: null }];
    expect(planGuardedWrite(files, { 'new.bin': null })).toEqual({ ok: true });
    expect(planGuardedWrite(files, {})).toEqual({ ok: true });
  });

  it('CONFLICT: expected null but a file appeared externally', () => {
    const files: GuardedFileSpec[] = [{ relPath: 'new.bin', expectedMtimeMs: null }];
    expect(planGuardedWrite(files, { 'new.bin': 2000 })).toEqual({ ok: false, conflicts: ['new.bin'] });
  });

  it('all-or-nothing: one conflict among many reports only the conflicting path(s)', () => {
    const files: GuardedFileSpec[] = [
      { relPath: 'a.bin', expectedMtimeMs: 100 },
      { relPath: 'b.bin', expectedMtimeMs: 200 },
      { relPath: 'c.bin', expectedMtimeMs: null },
    ];
    const plan = planGuardedWrite(files, { 'a.bin': 100, 'b.bin': 999, 'c.bin': null });
    expect(plan).toEqual({ ok: false, conflicts: ['b.bin'] });
  });

  it('reports every conflicting file, order-preserving', () => {
    const files: GuardedFileSpec[] = [
      { relPath: 'a.bin', expectedMtimeMs: 100 },
      { relPath: 'b.bin', expectedMtimeMs: 200 },
      { relPath: 'c.bin', expectedMtimeMs: 300 },
    ];
    const plan = planGuardedWrite(files, { 'a.bin': 111, 'b.bin': 200, 'c.bin': 333 });
    expect(plan).toEqual({ ok: false, conflicts: ['a.bin', 'c.bin'] });
  });

  it('empty file list is trivially OK', () => {
    expect(planGuardedWrite([], {})).toEqual({ ok: true });
  });

  it('dedupes a relPath that appears twice in the file list', () => {
    const files: GuardedFileSpec[] = [
      { relPath: 'a.bin', expectedMtimeMs: 100 },
      { relPath: 'a.bin', expectedMtimeMs: 100 },
    ];
    expect(planGuardedWrite(files, { 'a.bin': 999 })).toEqual({ ok: false, conflicts: ['a.bin'] });
  });
});
