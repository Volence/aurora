/**
 * ROADMAP row 187: a currency gate DECLARES the peer ref it compared, the SHA it
 * resolved to, and when that ref last moved locally, or says UNKNOWN and why.
 *
 * Every row here runs against a throwaway repo made in the temp dir, never a
 * peer: the peers are other lanes' live checkouts, and a fixture whose reflog
 * this file writes is the only way to know the right answer in advance.
 *
 * The dates are chosen far apart ON PURPOSE. The commit is dated 2001 and the
 * ref is moved in 2020, so a helper that printed the commit date (what
 * `git log -g --format=%ct` hands back) instead of the reflog entry's time would
 * print the wrong year, not a time off by seconds.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PEER_REF_MARKER, declarePeerRef, resolveRev } from './peer-repo';

const COMMIT_DATE = '2001-01-01T00:00:00Z';
const MOVED_AT = '2020-06-15T12:00:00Z';
/** 43 minutes after MOVED_AT: the "before this run" clause is then derivable. */
const NOW = new Date(Date.parse(MOVED_AT) + 43 * 60_000);

let dir = '';
let first = '';
let second = '';

function git(args: string[], date?: string): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) },
  });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'peer-ref-187-'));
  git(['init', '-q']);
  git(['commit', '-q', '--allow-empty', '-m', 'one'], COMMIT_DATE);
  first = git(['rev-parse', 'HEAD']).trim();
  git(['commit', '-q', '--allow-empty', '-m', 'two'], COMMIT_DATE);
  second = git(['rev-parse', 'HEAD']).trim();
  // A remote-tracking ref WITH a reflog entry, moved at MOVED_AT.
  git(['update-ref', '-m', 'fetch: fast-forward', 'refs/remotes/origin/master', first], MOVED_AT);
  // One written with logging off, so it has NO reflog at all.
  git(['-c', 'core.logAllRefUpdates=false', 'update-ref', 'refs/remotes/origin/nolog', first]);
  // One logged at `first`, then moved to `second` behind git's back.
  git(['update-ref', '-m', 'fetch', 'refs/remotes/origin/moved', first], MOVED_AT);
  writeFileSync(join(dir, '.git', 'refs', 'remotes', 'origin', 'moved'), `${second}\n`);
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('declarePeerRef', () => {
  it('declares the ref, its SHA and the REFLOG time (not the commit date) with its age', () => {
    const d = declarePeerRef(dir, 'origin/master', NOW);
    expect(d).not.toBeNull();
    expect(d!.fullRef).toBe('refs/remotes/origin/master');
    expect(d!.sha).toBe(first);
    expect(d!.updatedAt?.toISOString()).toBe('2020-06-15T12:00:00.000Z');
    expect(d!.unknownWhy).toBeNull();
    expect(d!.line).toContain(`origin/master = ${first.slice(0, 8)}, ref last updated ${MOVED_AT} (43 min before this run`);
  });

  it('says UNKNOWN, in words, when the ref has no reflog', () => {
    const d = declarePeerRef(dir, 'origin/nolog', NOW);
    expect(d).not.toBeNull();
    expect(d!.sha).toBe(first);
    expect(d!.updatedAt).toBeNull();
    expect(d!.line).toMatch(/, ref update time UNKNOWN: refs\/remotes\/origin\/nolog has NO REFLOG/);
  });

  it('says UNKNOWN when the newest reflog entry names a different commit from the ref', () => {
    const d = declarePeerRef(dir, 'origin/moved', NOW);
    expect(d!.sha).toBe(second);
    expect(d!.updatedAt).toBeNull();
    expect(d!.line).toContain(`ref update time UNKNOWN: the newest reflog entry of refs/remotes/origin/moved names ${first.slice(0, 8)}`);
  });

  it('declares nothing for a SHA pin, which has no freshness to declare', () => {
    expect(declarePeerRef(dir, first, NOW)).toBeNull();
  });
});

describe('resolveRev prints the declaration into the run output', () => {
  it('once per ref and value, and never for a SHA pin', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(resolveRev(dir, 'origin/master')).toBe(first);
      expect(resolveRev(dir, 'origin/master')).toBe(first);
      expect(resolveRev(dir, first)).toBe(first);
      expect(resolveRev(dir, 'origin/nolog')).toBe(first);
      const lines = spy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith(PEER_REF_MARKER));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain(`origin/master = ${first.slice(0, 8)}, ref last updated ${MOVED_AT}`);
      expect(lines[1]).toContain('origin/nolog');
      expect(lines[1]).toContain('ref update time UNKNOWN');
    } finally {
      spy.mockRestore();
    }
  });
});
