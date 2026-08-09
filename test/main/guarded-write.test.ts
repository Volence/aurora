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
    expect(res).toEqual({ conflicts: ['b.bin'] });
    // Neither file was touched — all-or-nothing.
    expect(readBytes('a.bin')).toEqual(new Uint8Array([1]));
    expect(readBytes('b.bin')).toEqual(new Uint8Array([2]));
  });

  it('conflicts when an expected-null file already exists (appeared externally)', async () => {
    fs.writeFileSync(path.join(dir, 'appeared.bin'), Buffer.from([7]));
    const res = await performGuardedWrite(dir, [
      { relPath: 'appeared.bin', bytes: new Uint8Array([8]), expectedMtimeMs: null },
    ]);
    expect(res).toEqual({ conflicts: ['appeared.bin'] });
    expect(readBytes('appeared.bin')).toEqual(new Uint8Array([7]));
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
    expect(second).toEqual({ conflicts: ['y.bin'] });
    // Nothing from the second attempt landed — x untouched despite matching mtime.
    expect(readBytes('x.bin')).toEqual(before.x);
    expect(readBytes('y.bin')).toEqual(before.y);
  });
});
