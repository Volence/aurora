/**
 * O79 — THE TEARDOWN FLUSH CHECK, EXERCISED WHERE `npm test` CAN SEE IT.
 *
 * `scratchpad/canvas-cdp-harness.mjs` is four sequential Electron launches and
 * every restart row reads what the previous launch left in `localStorage`. O50
 * measured that precondition failing spontaneously in **4 of 9 runs**
 * (`docs/reviews/2026-09-03-o50-triage-c.md` §3.5) and left it open after two
 * attempted fixes. This parcel's measurements are in
 * `docs/reviews/2026-09-03-canvas-harness-teardown-flake.md`; the short version
 * is that Chromium's own commit for a busy session here is 44-54 s away, that
 * `window.close()` pre-empts that timer and carries the flush, and that what the
 * teardown was missing was therefore not a WAIT but a CHECK.
 *
 * WHY THE SUBJECT IS `scratchpad/lib/storage-flush.mjs` AND NOT THE HARNESS —
 * the same reason `run-root.test.ts` gives for its own split: the harness spawns
 * an Electron against a built `dist/` under an X server, so `npm test` can never
 * execute it, and a property proved only inside it is proved nowhere. The
 * check's decisions live in a module this file drives directly, with every
 * filesystem dependency injected.
 *
 * ⚠ THE ROW THAT MATTERS MOST IS `bytesOnDisk` ANSWERING FALSE. The failure mode
 * of this whole parcel would be a check that gets to green by never being able
 * to fail. Its live proof is the packet's negative control — delete the
 * `window.close()` line and three of four sessions report their last write
 * missing — and its unit proof is the row below with a populated database and an
 * absent marker.
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
  bytesOnDisk, flushMarker, flushRefusal, FLUSH_MARKER_KEY,
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

  /**
   * O80 — A PINNED PROFILE IS KNOWLEDGE, AND WITHOUT THIS THE FIX WOULD HAVE
   * BROKEN THIS MODULE.
   *
   * `spawnGuarded` now launches with `--user-data-dir=<this run's own
   * directory>` (HAZARD 6 in `scratchpad/lib/harness-guard.mjs`), so the run's
   * profile is a temp directory and NOT any `$XDG_CONFIG_HOME/<app name>` one.
   * The RED row is the first of the pair: with the observation silent and no
   * `profileDir`, the resolver hands back the shared candidate that happens to
   * exist — the exact "watch a directory the run never writes" defect this
   * module's header is about, arriving from a new direction.
   */
  it('⚠ RED: without the pinned profile, a silent /proc resolves to a SHARED directory this run never writes', () => {
    const shared = `/cfg/Electron/${LEVELDB_REL}`;
    const mine = `/tmp/aurora-harness-profiles/rig-1-abcd/${LEVELDB_REL}`;
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [],
      exists: (d: string) => d === shared || d === mine,
    });
    expect(r.dir, 'this is the wrong answer, and it is what the fix would have produced').toBe(shared);
    expect(r.dir).not.toBe(mine);
  });

  it('GREEN: given the profile the run pinned, it takes that one and says where it came from', () => {
    const shared = `/cfg/Electron/${LEVELDB_REL}`;
    const profileDir = '/tmp/aurora-harness-profiles/rig-1-abcd';
    const mine = `${profileDir}/${LEVELDB_REL}`;
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [],
      exists: (d: string) => d === shared || d === mine,
      profileDir,
    });
    expect(r.dir).toBe(mine);
    expect(r.how).toContain('--user-data-dir=');
    expect(r.how).toContain(profileDir);
  });

  it('the OBSERVATION still wins over the pinned profile — it is the stronger evidence', () => {
    const observed = `/tmp/somewhere-else/${LEVELDB_REL}`;
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [`${observed}/LOCK`],
      exists: () => true,
      profileDir: '/tmp/aurora-harness-profiles/rig-1-abcd',
    });
    expect(r.dir).toBe(observed);
    expect(r.how).toMatch(/observed/);
  });

  it('a pinned profile with nothing written to it yet is a refusal, not a false negative', () => {
    const profileDir = '/tmp/aurora-harness-profiles/rig-1-abcd';
    const r = resolveLeveldbDir({
      pids: [7], appNames: names, configHome: '/cfg',
      readFds: () => [], exists: () => false, profileDir,
    });
    expect(r.dir).toBeNull();
    expect(r.why).toContain(profileDir);
  });
});

describe('bytesOnDisk — the predicate the check reads', () => {
  it('finds a marker written into the write-ahead log', () => {
    const d = tmp();
    try {
      writeFileSync(join(d, '000010.log'), Buffer.concat([
        Buffer.from([0, 1, 2, 3]), Buffer.from('aurora.flushcheck.42.abc', 'latin1'), Buffer.from([9]),
      ]));
      expect(bytesOnDisk(d, 'aurora.flushcheck.42.abc')).toBe(true);
      expect(bytesOnDisk(d, 'aurora.flushcheck.42.abd')).toBe(false);
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

describe('bytesOnDisk is the whole verdict — there is no wait to soften it', () => {
  /**
   * ⚠ THE ROW THAT KEEPS THIS FROM BEING A GATE THAT CANNOT FAIL. There is no
   * timeout branch left to test, because there is no wait: the check is one
   * read, after the process is gone. So what has to be shown is that the read
   * ANSWERS FALSE for the state the check exists to catch — a marker the app
   * wrote that never reached the database.
   *
   * The live half of this is the negative control in the packet: delete the
   * `window.close()` line from the teardown and the harness reports
   * `this session's last write is on disk: false` for three of its four
   * sessions. This row is the same property with the filesystem in a mkdtemp.
   */
  it('answers false for a marker the database never received', () => {
    const d = tmp();
    try {
      // A database with real content in it — the FALSE must come from the marker
      // being absent, not from the directory being empty or unreadable.
      writeFileSync(join(d, '000010.log'), Buffer.from('aurora.session.v1:/p/proj{"tabs":[]}', 'latin1'));
      expect(bytesOnDisk(d, 'aurora.session.v1:/p/proj')).toBe(true);
      expect(bytesOnDisk(d, flushMarker('A1'))).toBe(false);
    } finally { rmSync(d, { recursive: true, force: true }); }
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
  it('names the profile it watched, how it resolved it, and how the teardown went', () => {
    const m = flushRefusal({
      dir: '/cfg/Electron/x', how: 'observed: held open by the launched tree',
      label: 'C — restart', exitNote: 'the app was STILL RUNNING and had to be signalled',
    });
    expect(m).toContain('/cfg/Electron/x');
    expect(m).toContain('observed: held open by the launched tree');
    expect(m).toContain('C — restart');
    expect(m).toContain('had to be signalled');
    expect(m).toMatch(/NOT AN APP DEFECT/);
  });

  it('reads without a teardown note when there is none', () => {
    const m = flushRefusal({ dir: '/d', how: 'derived', label: 'B' });
    expect(m).not.toContain('teardown:');
  });
});

describe('the harness wires the check, and the exit net, in the right order', () => {
  /**
   * Order is the fix. The marker has to be written to a LIVE page and the
   * profile resolved from a LIVE tree, so arming must precede the close; and the
   * answer is only final once the process is gone, so settling must follow the
   * reap. A source-order row is a weak instrument in general, but these
   * properties have no runtime witness `npm test` can reach, and their absence
   * is silent: the harness would still print its lines and still go green.
   */
  it('arms BEFORE the window.close() evaluate and settles AFTER the tree is reaped', () => {
    const src: string = readFileSync(HARNESS, 'utf8');
    const arm = src.indexOf('await armFlushCheck(c, child, label)');
    const close = src.indexOf("expression: 'window.close()'");
    const kill = src.indexOf('await killGroup();');
    const settle = src.indexOf('settleFlushCheck(flushCheck)');
    expect(Math.min(arm, close, kill, settle)).toBeGreaterThan(-1);
    expect(arm).toBeLessThan(close);
    expect(close).toBeLessThan(kill);
    expect(kill).toBeLessThan(settle);
  });

  it('refuses the run when the check reports false, rather than logging and continuing', () => {
    const src: string = readFileSync(HARNESS, 'utf8');
    expect(src).toMatch(/if \(flushFailure !== null\) throw new Error\(flushFailure\);/);
  });

  it('rejects every in-flight CDP request when the socket closes, so a dead target cannot end the run at exit 0', () => {
    const src: string = readFileSync(HARNESS, 'utf8');
    expect(src).toMatch(/ws\.addEventListener\('close',[^\n]*failPending/);
    expect(src).toMatch(/ws\.addEventListener\('error',[^\n]*failPending/);
  });

  it('exits non-zero if the run ever ends without printing a summary', () => {
    const src: string = readFileSync(HARNESS, 'utf8');
    expect(src).toContain('installSummaryNet();');
    expect(src).toMatch(/if \(code === 0\) process\.exitCode = 3;/);
    // Both entry points must arm it, or the net covers only one of them.
    expect(src.split('noteSummaryPrinted();').length - 1).toBe(2);
  });
});
