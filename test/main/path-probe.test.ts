// probePath: the main-process presence probe, against a REAL filesystem.
//
// It used to be `pathExists(): Promise<boolean>` with a bare `catch { return
// false }`, so "there is nothing at this path" and "I could not find out" were
// the same answer - and one layer up, aeon's markUnreadable asks this exact
// question to decide whether a section file it failed to read is absent (silent,
// ordinary) or present-and-unreadable (flagged, and excluded from the next save).
// For any failure that takes the read and the stat down together, the probe said
// "absent" and a present objects.json was replaced by `[]` on the next save.
//
// A REAL fs IS THE POINT of this file. Every in-memory FileAccess in the repo
// answers `exists` from a Map, so it is exact by construction and CANNOT produce
// the third case - which is exactly why nine years of green fakes said nothing.
// The two failures below are constructed on disk:
//
//   ELOOP  a symlink cycle. Works for any user, root included, so this row never
//          skips and the file always measures something.
//   EACCES a directory with no execute permission. Skipped (loudly, with a
//          reason) when the runner is root, because root is not denied by mode
//          bits and the fixture would silently become a different test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { probePath } from '../../src/main/file-io';

let root: string;

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'aurora-probe-')); });
afterEach(() => {
  // The 000 directory has to be walkable again or the cleanup cannot descend.
  try { chmodSync(join(root, 'locked'), 0o700); } catch { /* not every case makes one */ }
  rmSync(root, { recursive: true, force: true });
});

describe('probePath answers three things, not two', () => {
  it('a file that is there is PRESENT', async () => {
    writeFileSync(join(root, 'f.bin'), 'x');
    expect(await probePath(root, 'f.bin')).toEqual({ presence: 'present', reason: null });
  });

  it('nothing at the path is ABSENT, and that is a positive answer', async () => {
    expect(await probePath(root, 'nope.bin')).toEqual({ presence: 'absent', reason: null });
  });

  it('a path whose parent is a FILE is ABSENT (ENOTDIR really does mean not there)', async () => {
    writeFileSync(join(root, 'f.bin'), 'x');
    expect(await probePath(root, 'f.bin/child')).toEqual({ presence: 'absent', reason: null });
  });

  it('a symlink cycle is UNKNOWN, with its reason, not absent', async () => {
    // ELOOP: the answer is genuinely unavailable. Answering 'absent' here is what
    // let a save write over a file whose real state nobody had established.
    symlinkSync(join(root, 'b'), join(root, 'a'));
    symlinkSync(join(root, 'a'), join(root, 'b'));
    const probe = await probePath(root, 'a');
    expect(probe.presence).toBe('unknown');
    expect(probe.reason).toBeTruthy();
    expect(probe.reason).toMatch(/ELOOP/);
  });

  it('a file under a directory with no execute permission is UNKNOWN, not absent', async (ctx) => {
    if (process.getuid?.() === 0) {
      ctx.skip('running as root: mode bits do not deny root a stat, so no EACCES can be constructed here');
      return;
    }
    const locked = join(root, 'locked');
    mkdirSync(locked);
    // The file REALLY EXISTS, and it is written before the lock so the fs was
    // demonstrably willing. That is what makes 'absent' a lie rather than a guess.
    writeFileSync(join(locked, 'objects.json'), '[{"id":"o1"}]');
    chmodSync(locked, 0o000);
    const probe = await probePath(root, 'locked/objects.json');
    expect(probe.presence).toBe('unknown');
    expect(probe.reason).toMatch(/EACCES|permission denied/);
  });

  it('an escaping path is UNKNOWN: the probe refused to look, which is not an answer about the disk', async () => {
    // It never touches the fs (that is the guard's whole job), and it must not
    // dress a refusal up as a fact about what is on the filesystem.
    const probe = await probePath(root, '../etc/passwd');
    expect(probe.presence).toBe('unknown');
    expect(probe.reason).toMatch(/escapes root/);
  });
});
