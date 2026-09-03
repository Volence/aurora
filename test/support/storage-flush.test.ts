/**
 * O79 — THE TEARDOWN FLUSH BARRIER, EXERCISED WHERE `npm test` CAN SEE IT.
 *
 * `scratchpad/canvas-cdp-harness.mjs` is four sequential Electron launches and
 * every restart row reads what the previous launch left in `localStorage`. O50
 * measured that precondition failing spontaneously in **4 of 9 runs**
 * (`docs/reviews/2026-09-03-o50-triage-c.md` §3.5) and left it open after two
 * attempted fixes. The cause is Chromium's throttled localStorage commit racing
 * a process that is gone ~50 ms after `window.close()`; the fix is a barrier
 * that waits for the BYTES ON DISK instead of for a duration.
 *
 * WHY THE SUBJECT IS `scratchpad/lib/storage-flush.mjs` AND NOT THE HARNESS —
 * the same reason `run-root.test.ts` gives for its own split: the harness spawns
 * an Electron against a built `dist/` under an X server, so `npm test` can never
 * execute it, and a property proved only inside it is proved nowhere. The
 * barrier's decisions live in a module this file drives directly, with every
 * filesystem and clock dependency injected.
 *
 * ⚠ THE ROW THAT MATTERS MOST IS `awaitFlushed` RETURNING `flushed: false`.
 * The failure mode of this whole parcel would be a barrier that gets to green by
 * never being able to fail. The timeout row asserts the opposite, and the
 * harness refuses on it.
 *
 * ⚠ AND THE SECOND-MOST IS `resolveLeveldbDir` REFUSING BETWEEN TWO PROFILES.
 * The first pass of this investigation watched `~/.config/aurora` — the OWNER'S
 * packaged Aurora's profile — while the harness was writing to
 * `~/.config/Electron`, and produced a clean, confident, wholly wrong "0 of 6
 * flushes survived". A resolver that picks one of several candidates can
 * reproduce that at any time; this one refuses and says why.
 *
 * Every path below is a `mkdtemp` or a string. Nothing here reads or writes a
 * real profile.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  LEVELDB_REL, leveldbDirOf, leveldbDirsHeldBy, candidateLeveldbDirs, resolveLeveldbDir,
  bytesOnDisk, awaitFlushed, flushMarker, flushRefusal, FLUSH_MARKER_KEY,
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- a .mjs sibling with no types; the harness imports it the same way
} from '../../scratchpad/lib/storage-flush.mjs';

const HARNESS = resolve(__dirname, '../../scratchpad/canvas-cdp-harness.mjs');

function tmp(): string { return mkdtempSync(join(tmpdir(), 'aurora-flush-')); }

describe('leveldbDirOf — the observation, from one open-file path', () => {
  it('extracts the database directory from a file the browser holds open', () => {
    expect(leveldbDirOf(`/home/u/.config/Electron/${LEVELDB_REL}/LOCK`))
      .toBe(`/home/u/.config/Electron/${LEVELDB_REL}`);
    expect(leveldbDirOf(`/home/u/.config/Electron/${LEVELDB_REL}/000010.log`))
      .toBe(`/home/u/.config/Electron/${LEVELDB_REL}`);
  });

  it('answers null for a path that is not inside a localStorage database', () => {
    expect(leveldbDirOf('/home/u/.config/Electron/Cookies')).toBeNull();
    expect(leveldbDirOf('/dev/null')).toBeNull();
    expect(leveldbDirOf('socket:[12345]')).toBeNull();
    expect(leveldbDirOf(undefined)).toBeNull();
  });

  it('does not match the directory itself, only files inside it — a bare dir fd is not a database in use', () => {
    expect(leveldbDirOf(`/home/u/.config/Electron/${LEVELDB_REL}`)).toBeNull();
  });
});

describe('leveldbDirsHeldBy — every profile the launched tree has open', () => {
  const fds: Record<number, string[]> = {
    10: ['/dev/null', 'socket:[1]', `/p/A/${LEVELDB_REL}/LOCK`, `/p/A/${LEVELDB_REL}/000001.log`],
    11: ['/dev/urandom'],
    12: [`/p/A/${LEVELDB_REL}/000001.log`],
  };

  it('dedupes to the distinct databases', () => {
    expect(leveldbDirsHeldBy([10, 11, 12], (p: number) => fds[p] ?? [])).toEqual([`/p/A/${LEVELDB_REL}`]);
  });

  it('reports MORE THAN ONE when the tree really has two open', () => {
    const two: Record<number, string[]> = { ...fds, 13: [`/p/B/${LEVELDB_REL}/LOCK`] };
    expect(leveldbDirsHeldBy([10, 13], (p: number) => two[p] ?? []).sort())
      .toEqual([`/p/A/${LEVELDB_REL}`, `/p/B/${LEVELDB_REL}`]);
  });

  it('is empty when nothing in the tree has one open', () => {
    expect(leveldbDirsHeldBy([11], (p: number) => fds[p] ?? [])).toEqual([]);
  });
});

describe('candidateLeveldbDirs — the fallback list', () => {
  it('composes one database path per app name under the config home', () => {
    expect(candidateLeveldbDirs(['Electron', 'aurora'], '/cfg')).toEqual([
      `/cfg/Electron/${LEVELDB_REL}`,
      `/cfg/aurora/${LEVELDB_REL}`,
    ]);
  });
});

describe('resolveLeveldbDir — observes, or refuses; it never guesses', () => {
  const names = ['Electron', 'aurora'];

  it('takes the one the tree actually holds open, and SAYS it observed it', () => {
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [`/cfg/Electron/${LEVELDB_REL}/LOCK`],
      exists: () => true,
    });
    expect(r.dir).toBe(`/cfg/Electron/${LEVELDB_REL}`);
    expect(r.how).toMatch(/observed/);
  });

  it('⚠ REFUSES when the observation is ambiguous, naming both databases', () => {
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [`/cfg/Electron/${LEVELDB_REL}/LOCK`, `/cfg/aurora/${LEVELDB_REL}/LOCK`],
      exists: () => true,
    });
    expect(r.dir).toBeNull();
    expect(r.why).toContain('/cfg/Electron/');
    expect(r.why).toContain('/cfg/aurora/');
  });

  it('falls back to the single candidate that exists, and says it DERIVED it', () => {
    const only = `/cfg/Electron/${LEVELDB_REL}`;
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [],
      exists: (d: string) => d === only,
    });
    expect(r.dir).toBe(only);
    expect(r.how).toMatch(/derived/);
  });

  it('⚠ REFUSES when /proc is silent and TWO candidate profiles exist — the wrong-profile defect this parcel actually hit', () => {
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [],
      exists: () => true,
    });
    expect(r.dir).toBeNull();
    expect(r.why).toMatch(/refusing to guess/i);
    expect(r.why).toContain(`/cfg/Electron/${LEVELDB_REL}`);
    expect(r.why).toContain(`/cfg/aurora/${LEVELDB_REL}`);
  });

  it('refuses when nothing is observed and no candidate exists', () => {
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg', readFds: () => [], exists: () => false,
    });
    expect(r.dir).toBeNull();
    expect(r.why).toContain('none of the candidate profiles exists');
  });
});

describe('bytesOnDisk — the predicate the barrier polls', () => {
  it('finds a marker written into the write-ahead log', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, '000010.log'), Buffer.concat([
        Buffer.from([0, 1, 2, 3]), Buffer.from('aurora.flushbarrier.42.abc', 'latin1'), Buffer.from([9]),
      ]));
      expect(bytesOnDisk(d, 'aurora.flushbarrier.42.abc')).toBe(true);
      expect(bytesOnDisk(d, 'aurora.flushbarrier.42.abd')).toBe(false);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('finds it in a compacted table too', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, '000007.ldb'), Buffer.from('xxmark-in-ldbxx', 'latin1'));
      expect(bytesOnDisk(d, 'mark-in-ldb')).toBe(true);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it("⚠ IGNORES leveldb's own text LOG — that file names paths and open events, not committed values", () => {
    const d = tmp();
    try {
      writeFileSync(join(d, 'LOG'), 'Recovering log #9 mark-only-in-LOG\n');
      writeFileSync(join(d, 'CURRENT'), 'MANIFEST-000001\n');
      expect(bytesOnDisk(d, 'mark-only-in-LOG')).toBe(false);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  it('answers false — not throws — for a database directory that is not there', () => {
    expect(bytesOnDisk('/nonexistent/aurora-flush', 'anything')).toBe(false);
  });
});

describe('awaitFlushed — waits for the ARTIFACT, and can fail', () => {
  const noSleep = async (): Promise<void> => {};

  it('writes the marker BEFORE it starts polling', async () => {
    const order: string[] = [];
    await awaitFlushed({
      mark: 'm', write: async () => { order.push('write'); },
      present: async () => { order.push('poll'); return true; },
      now: () => 0, sleep: noSleep,
    });
    expect(order).toEqual(['write', 'poll']);
  });

  it('returns flushed once the bytes appear, counting the polls it took', async () => {
    let n = 0;
    let t = 0;
    const r = await awaitFlushed({
      mark: 'm', write: async () => {}, present: async () => ++n >= 4,
      maxMs: 10000, pollMs: 100, now: () => (t += 25), sleep: noSleep,
    });
    expect(r.flushed).toBe(true);
    expect(r.polls).toBe(4);
  });

  it('⚠ RETURNS flushed:false ON TIMEOUT — the row that keeps this barrier from being "always pass"', async () => {
    let t = 0;
    const r = await awaitFlushed({
      mark: 'm', write: async () => {}, present: async () => false,
      maxMs: 500, pollMs: 100, now: () => (t += 200), sleep: noSleep,
    });
    expect(r.flushed).toBe(false);
    expect(r.waitedMs).toBeGreaterThanOrEqual(500);
  });
});

describe('the marker itself', () => {
  it('carries no substring the harness\'s own stored-session reader would pick up', () => {
    // canvas-cdp-harness's storedSessions() reports every key matching /session/i.
    // A barrier that appears in the evidence a row prints has changed the measurement.
    expect(FLUSH_MARKER_KEY).not.toMatch(/session/i);
    expect(flushMarker('B1')).not.toMatch(/session/i);
  });

  it('is unique per call, so one session\'s marker can never satisfy the next session\'s barrier', () => {
    const seen = new Set(Array.from({ length: 200 }, () => flushMarker('X')));
    expect(seen.size).toBe(200);
  });
});

describe('flushRefusal — what a reader is told when the flush genuinely did not happen', () => {
  it('names the profile it watched, how it resolved it, and how long it waited', () => {
    const m = flushRefusal({ waitedMs: 61234, dir: '/cfg/Electron/x', how: 'observed: ...', label: 'C — restart' });
    expect(m).toContain('/cfg/Electron/x');
    expect(m).toContain('61234');
    expect(m).toContain('C — restart');
    expect(m).toMatch(/NOT an app defect|not an app defect/i);
  });
});

describe('the harness calls the barrier BEFORE it closes the window', () => {
  /**
   * Order is the whole fix. The app is gone ~50 ms after `window.close()`, so a
   * barrier placed after it would wait on a dead process — which is precisely
   * the defect being repaired, re-introduced. A source-order row is a weak
   * instrument in general, but this property has no runtime witness `npm test`
   * can reach, and its absence is silent: the harness would still print a
   * barrier line and still go green.
   */
  it('flushBarrier() appears in session() ahead of the window.close() evaluate', () => {
    const src: string = readFileSync(HARNESS, 'utf8');
    const barrier = src.indexOf('await flushBarrier(c, child, label)');
    const close = src.indexOf("expression: 'window.close()'");
    expect(barrier).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(-1);
    expect(barrier).toBeLessThan(close);
  });

  it('refuses the run when the barrier reports false, rather than logging and continuing', () => {
    const src: string = readFileSync(HARNESS, 'utf8');
    expect(src).toMatch(/if \(flushFailure !== null\) throw new Error\(flushFailure\);/);
  });
});
