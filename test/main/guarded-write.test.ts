import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { performGuardedWrite } from '../../src/main/guarded-write';

// ---------------------------------------------------------------------------
// Full guarded-write cycle against a real temp dir (os.tmpdir — never touches
// the project or the s1disasm reference). No skipIf: tmpdir is always present.
// ---------------------------------------------------------------------------

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-gw-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function statMtime(rel: string): number {
  return fs.statSync(path.join(dir, rel)).mtimeMs;
}
function readBytes(rel: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(dir, rel)));
}

describe('performGuardedWrite', () => {
  it('rejects an unsafe relPath and writes nothing', async () => {
    await expect(
      performGuardedWrite(dir, [
        { relPath: '../escape.bin', bytes: new Uint8Array([1]), expectedMtimeMs: null },
      ]),
    ).rejects.toThrow(/unsafe project-relative path/);
    expect(fs.existsSync(path.join(dir, '..', 'escape.bin'))).toBe(false);
  });

  it('creates a brand-new file (expected null) and returns its new mtime', async () => {
    const res = await performGuardedWrite(dir, [
      { relPath: 'sub/new.bin', bytes: new Uint8Array([1, 2, 3]), expectedMtimeMs: null },
    ]);
    expect('written' in res && res.written).toEqual(['sub/new.bin']);
    expect(readBytes('sub/new.bin')).toEqual(new Uint8Array([1, 2, 3]));
    if ('newMtimes' in res) expect(res.newMtimes['sub/new.bin']).toBe(statMtime('sub/new.bin'));
  });

  it('overwrites atomically when the expected mtime matches; no .tmp left behind', async () => {
    fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.from([0]));
    const m0 = statMtime('a.bin');
    const res = await performGuardedWrite(dir, [
      { relPath: 'a.bin', bytes: new Uint8Array([9, 9]), expectedMtimeMs: m0 },
    ]);
    expect('written' in res).toBe(true);
    expect(readBytes('a.bin')).toEqual(new Uint8Array([9, 9]));
    expect(fs.existsSync(path.join(dir, 'a.bin.tmp'))).toBe(false);
  });

  it('conflicts and writes NOTHING when one file changed externally', async () => {
    fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.from([1]));
    fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.from([2]));
    const ma = statMtime('a.bin');
    const mb = statMtime('b.bin');

    // b was modified after read: give a stale expected mtime for b.
    const res = await performGuardedWrite(dir, [
      { relPath: 'a.bin', bytes: new Uint8Array([0xaa]), expectedMtimeMs: ma },
      { relPath: 'b.bin', bytes: new Uint8Array([0xbb]), expectedMtimeMs: mb - 1000 },
    ]);
    expect(res).toEqual({ conflicts: [{ relPath: 'b.bin', cause: 'changed', reason: null }] });
    // Neither file was touched — all-or-nothing.
    expect(readBytes('a.bin')).toEqual(new Uint8Array([1]));
    expect(readBytes('b.bin')).toEqual(new Uint8Array([2]));
  });

  it('conflicts when an expected-null file already exists (appeared externally)', async () => {
    fs.writeFileSync(path.join(dir, 'appeared.bin'), Buffer.from([7]));
    const res = await performGuardedWrite(dir, [
      { relPath: 'appeared.bin', bytes: new Uint8Array([8]), expectedMtimeMs: null },
    ]);
    expect(res).toEqual({ conflicts: [{ relPath: 'appeared.bin', cause: 'appeared', reason: null }] });
    expect(readBytes('appeared.bin')).toEqual(new Uint8Array([7]));
  });

  // ═══ THE FOUR CAUSES, AGAINST REAL FILESYSTEM STATES ═══════════════════════
  //
  // ONE-MESSAGE-FOUR-CAUSES (lens sweep HIGH, 2026-09-08). The two rows above used
  // to assert `{ conflicts: ['b.bin'] }` and `{ conflicts: ['appeared.bin'] }`: a
  // list of PATHS, in which "changed" and "appeared" were the SAME VALUE. That is
  // why five author-facing surfaces could tell everyone their files had changed and
  // to reload, and why no test noticed. They now assert the cause.
  //
  // The two rows below are the causes nothing here covered at all.

  it("conflicts as 'deleted' when a file present at read is gone at write time", async () => {
    fs.writeFileSync(path.join(dir, 'gone.bin'), Buffer.from([5]));
    const m = statMtime('gone.bin');
    fs.unlinkSync(path.join(dir, 'gone.bin'));

    const res = await performGuardedWrite(dir, [
      { relPath: 'gone.bin', bytes: new Uint8Array([6]), expectedMtimeMs: m },
    ]);
    // NOT 'changed'. The file did not change; it went away, and the advice for the
    // two is not the same advice.
    expect(res).toEqual({ conflicts: [{ relPath: 'gone.bin', cause: 'deleted', reason: null }] });
    // The refusal did not recreate it either.
    expect(fs.existsSync(path.join(dir, 'gone.bin'))).toBe(false);
  });

  it("conflicts as 'unknown' when the file's state CANNOT BE READ, and does not call that deleted", async () => {
    // A SYMLINK LOOP, not a chmod: `stat` on it is ELOOP on every platform this
    // runs on, it needs no privileges, and it does not quietly go green when the
    // suite runs as root (which is how a chmod-000 row stops measuring). The path
    // EXISTS as a directory entry, so 'absent' is a false statement about it, which
    // is what makes this row a proof rather than a restatement.
    fs.symlinkSync('loop.bin', path.join(dir, 'loop.bin'));

    const res = await performGuardedWrite(dir, [
      { relPath: 'loop.bin', bytes: new Uint8Array([1]), expectedMtimeMs: 1234 },
    ]);
    expect('conflicts' in res).toBe(true);
    if (!('conflicts' in res)) throw new Error('unreachable');
    // THE DEFECT: `catch { return null }` in guarded-write's stat helper made this
    // 'deleted', and the author of an intact file was told it had been deleted.
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].relPath).toBe('loop.bin');
    expect(res.conflicts[0].cause).toBe('unknown');
    expect(res.conflicts[0].cause).not.toBe('deleted');
    expect(res.conflicts[0].reason).toMatch(/ELOOP/);
  });

  it("CONTROL: absent really is 'absent' and writes, so the ELOOP row is not just 'every failure is unknown'", async () => {
    // Same shape of call against a path where there genuinely is nothing: this is
    // NOT a conflict at all (expected null, still absent), so the write proceeds.
    const res = await performGuardedWrite(dir, [
      { relPath: 'brand-new.bin', bytes: new Uint8Array([3]), expectedMtimeMs: null },
    ]);
    expect('conflicts' in res).toBe(false);
    expect(readBytes('brand-new.bin')).toEqual(new Uint8Array([3]));
  });

  it('partial batch: an fs error mid-write reports {written,failed,unwritten}, cleans up the orphan .tmp, no reject', async () => {
    // a.bin writes fine; b/ is a DIRECTORY where a file is expected, so rename
    // onto it fails — a reliable cross-platform fs error. c.bin is never reached.
    fs.writeFileSync(path.join(dir, 'a.bin'), Buffer.from([1]));
    fs.mkdirSync(path.join(dir, 'b')); // occupies the target path with a dir
    const dirMtime = statMtime('b'); // stat of the dir; pass as expected so no conflict

    const res = await performGuardedWrite(dir, [
      { relPath: 'a.bin', bytes: new Uint8Array([0xaa]), expectedMtimeMs: statMtime('a.bin') },
      { relPath: 'b', bytes: new Uint8Array([0xbb]), expectedMtimeMs: dirMtime },
      { relPath: 'c.bin', bytes: new Uint8Array([0xcc]), expectedMtimeMs: null },
    ]);

    if (!('written' in res)) throw new Error('expected a (partial) write result, not a conflict');
    expect(res.written).toEqual(['a.bin']); // committed before the failure
    expect(res.failed?.path).toBe('b');
    expect(res.failed?.message).toBeTruthy();
    expect(res.unwritten).toEqual(['c.bin']); // after the failure, never attempted
    // a.bin really landed; c.bin never created.
    expect(readBytes('a.bin')).toEqual(new Uint8Array([0xaa]));
    expect(fs.existsSync(path.join(dir, 'c.bin'))).toBe(false);
    // No orphaned tmp for the failed file (best-effort unlink).
    expect(fs.existsSync(path.join(dir, 'b.tmp'))).toBe(false);
  });

  it('full cycle: write → refresh mtimes → external touch → second write conflicts, nothing written', async () => {
    fs.writeFileSync(path.join(dir, 'x.bin'), Buffer.from([1]));
    fs.writeFileSync(path.join(dir, 'y.bin'), Buffer.from([2]));
    const first = await performGuardedWrite(dir, [
      { relPath: 'x.bin', bytes: new Uint8Array([10]), expectedMtimeMs: statMtime('x.bin') },
      { relPath: 'y.bin', bytes: new Uint8Array([20]), expectedMtimeMs: statMtime('y.bin') },
    ]);
    expect('newMtimes' in first).toBe(true);
    if (!('newMtimes' in first)) throw new Error('unreachable');

    // Externally touch y.bin to bump its mtime past the refreshed baseline.
    const bumped = first.newMtimes['y.bin'] + 5000;
    await fsp.utimes(path.join(dir, 'y.bin'), new Date(bumped), new Date(bumped));

    const before = { x: readBytes('x.bin'), y: readBytes('y.bin') };
    const second = await performGuardedWrite(dir, [
      { relPath: 'x.bin', bytes: new Uint8Array([99]), expectedMtimeMs: first.newMtimes['x.bin'] },
      { relPath: 'y.bin', bytes: new Uint8Array([88]), expectedMtimeMs: first.newMtimes['y.bin'] },
    ]);
    expect(second).toEqual({ conflicts: [{ relPath: 'y.bin', cause: 'changed', reason: null }] });
    // Nothing from the second attempt landed — x untouched despite matching mtime.
    expect(readBytes('x.bin')).toEqual(before.x);
    expect(readBytes('y.bin')).toEqual(before.y);
  });
});
