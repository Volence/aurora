/**
 * O80 — THE CHROMIUM PROFILE, WHICH WAS ONE DIRECTORY FOR THE WHOLE POPULATION.
 *
 * Every Aurora a harness launches writes its `localStorage` into
 * `$XDG_CONFIG_HOME/Electron/Local Storage`, because `electron
 * <root>/dist/main/index.mjs` passes a FILE, so Electron falls back to its own
 * default app name. And a CDP harness's usual opening gesture is
 * `localStorage.clear()`, which erases that area for every instrument sharing
 * it — including one that is mid-run and reading what it wrote a session ago.
 * `docs/reviews/2026-09-04-canvas-flake-explained.md` closed the canvas flake
 * row with this half explicitly unfixed.
 *
 * `scratchpad/lib/harness-guard.mjs` now pins `--user-data-dir` to one
 * directory per node process. The LIVE proof is
 * `scratchpad/profile-isolation-proof.mjs`, which launches two independent
 * instruments and has one clear the profile while the other is between its
 * launches — and which `npm test` can never run, because it needs an Electron
 * and an X server. So the parts that are pure functions of the module are
 * asserted here, where a rename or an inverted condition fails the suite.
 *
 * ⚠ NOTHING HERE READS OR WRITES A REAL PROFILE. Every path below is a string
 * or a `mkdtemp`, and the two rows that need a second process's answer get it
 * from a child node, not from a mutated global.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const GUARD = resolve(__dirname, '../../scratchpad/lib/harness-guard.mjs');

/** Evaluate `body` against the guard module in a child process, so the
 *  module's own load-time derivation — the thing under test — actually runs. */
function inChild(body: string, env: Record<string, string> = {}): { status: number; stdout: string; stderr: string } {
  const src = `import * as G from ${JSON.stringify(GUARD)};\n${body}\n`;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', src], {
    env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: out.status ?? -1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}
function json<T>(r: { status: number; stdout: string; stderr: string }): T {
  expect(r.status, `stderr:\n${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout) as T;
}

const ELECTRON = '/some/tree/node_modules/.bin/electron';
const MAIN = '/some/tree/dist/main/index.mjs';
/** The command shape every launcher in scratchpad/ actually uses. */
const XVFB_ARGS = ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN];

describe('pinUserDataDir — the switch, and WHERE it goes', () => {
  /**
   * POSITION IS THE ASSERTION, not presence. The command is `xvfb-run … <bin>
   * <app.mjs>`: a switch at the front is eaten by xvfb-run and one at the back
   * is an argument to the app, not to Chromium. Either would leave the run on
   * the shared profile while every log line said it was pinned. Both wrong
   * placements pass a `toContain`, which is why this row indexes.
   */
  it('inserts the switch IMMEDIATELY after the electron binary, not at either end', async () => {
    const G = await import('../../scratchpad/lib/harness-guard.mjs');
    const out = G.pinUserDataDir('/usr/bin/xvfb-run', XVFB_ARGS, '/tmp/P') as string[];
    const i = out.indexOf(ELECTRON);
    expect(i, 'the binary must still be in the command').toBeGreaterThan(-1);
    expect(out[i + 1]).toBe('--user-data-dir=/tmp/P');
    expect(out[i + 2], 'and the app bundle must still follow it').toBe(MAIN);
    expect(out[0], 'NOT at the front, where xvfb-run would consume it').not.toContain('--user-data-dir');
    expect(out[out.length - 1], 'NOT at the back, where it is an app argument').toBe(MAIN);
  });

  it('puts it first when the command IS the electron binary', async () => {
    const G = await import('../../scratchpad/lib/harness-guard.mjs');
    const out = G.pinUserDataDir(ELECTRON, [MAIN], '/tmp/P') as string[];
    expect(out).toEqual(['--user-data-dir=/tmp/P', MAIN]);
  });

  /**
   * BY IDENTITY, because `spawnGuarded` uses `!==` to decide whether a profile
   * was pinned — and therefore whether to create the directory, print the line,
   * and hand the path to the flush check. A copied array that happens to be
   * equal would make all three fire on a launch that was never pinned.
   */
  it('returns its argument UNCHANGED BY IDENTITY when the command has no electron in it', async () => {
    const G = await import('../../scratchpad/lib/harness-guard.mjs');
    const args = ['-a', '/usr/bin/some-other-tool', 'x'];
    expect(G.pinUserDataDir('/usr/bin/xvfb-run', args, '/tmp/P')).toBe(args);
  });

  it('DEFERS to a --user-data-dir the caller passed itself, also by identity', async () => {
    const G = await import('../../scratchpad/lib/harness-guard.mjs');
    const args = ['-a', ELECTRON, '--user-data-dir=/caller/said/so', MAIN];
    expect(G.pinUserDataDir('/usr/bin/xvfb-run', args, '/tmp/P')).toBe(args);
  });

  it('the switch it writes is the one it tests for — one spelling, not two', async () => {
    const G = await import('../../scratchpad/lib/harness-guard.mjs');
    const once = G.pinUserDataDir('/usr/bin/xvfb-run', XVFB_ARGS, '/tmp/P') as string[];
    // Feeding its own output back must be a no-op, which is only true if the
    // "already has one" test recognises the flag this function writes.
    expect(G.pinUserDataDir('/usr/bin/xvfb-run', once, '/tmp/Q')).toBe(once);
  });
});

describe('RUN_PROFILE_DIR — stable within a run, unique across concurrent ones', () => {
  /**
   * ⚠ THE PROPERTY THAT IS EASY TO GET BACKWARDS. A fresh profile PER LAUNCH
   * would isolate instruments perfectly and break `canvas-cdp-harness`, which
   * relaunches four times in one run and reads what the previous launch left in
   * `localStorage` — the persistence its restart suite exists to measure. The
   * failure would look exactly like the flake this parcel removes.
   */
  it('is the SAME value on every read inside one process', () => {
    const r = json<{ a: string; b: string }>(inChild(
      'process.stdout.write(JSON.stringify({ a: G.RUN_PROFILE_DIR, b: G.RUN_PROFILE_DIR }));'));
    expect(r.a).toBe(r.b);
  });

  it('is a DIFFERENT value in two processes started back to back', () => {
    const read = 'process.stdout.write(JSON.stringify({ dir: G.RUN_PROFILE_DIR, derived: G.RUN_PROFILE_DERIVED }));';
    const one = json<{ dir: string; derived: boolean }>(inChild(read));
    const two = json<{ dir: string; derived: boolean }>(inChild(read));
    expect(one.dir).not.toBe(two.dir);
    expect(one.derived).toBe(true);
    // Anti-vacuous: they must still be two profiles of the SAME shape, under
    // one root. "Different" would also be satisfied by one of them being junk.
    expect(one.dir.startsWith(join(tmpdir(), 'aurora-harness-profiles'))).toBe(true);
    expect(two.dir.startsWith(join(tmpdir(), 'aurora-harness-profiles'))).toBe(true);
  });

  it('a pid alone would not be enough, so the name carries a random suffix too', () => {
    const read = 'process.stdout.write(JSON.stringify({ dir: G.RUN_PROFILE_DIR, pid: process.pid }));';
    const r = json<{ dir: string; pid: number }>(inChild(read));
    expect(r.dir).toContain(String(r.pid));
    // …and something after the pid, so a REUSED pid cannot inherit the storage
    // of a run that died without cleaning up.
    expect(r.dir.split(`-${r.pid}-`)[1] ?? '').toMatch(/^[0-9a-f]{8}$/);
  });

  it('defers to AURORA_HARNESS_PROFILE_DIR, and then reports that it does not own it', () => {
    const read = 'process.stdout.write(JSON.stringify({ dir: G.RUN_PROFILE_DIR, derived: G.RUN_PROFILE_DERIVED }));';
    const r = json<{ dir: string; derived: boolean }>(inChild(read, { AURORA_HARNESS_PROFILE_DIR: '/tmp/shared-by-two' }));
    expect(r.dir).toBe('/tmp/shared-by-two');
    expect(r.derived, 'a directory this process did not create is not this process\'s to delete').toBe(false);
  });
});

describe('cleanupProfile — deletes what it made, keeps what it was handed', () => {
  /**
   * RED THEN GREEN over a real directory. The red half is the one that matters:
   * a `rmSync` over a path nothing ever created passes just as green.
   */
  it('removes a derived profile, and the directory really was there first', () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-profile-cleanup-'));
    try {
      const dir = join(root, 'derived-profile');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'x'), 'bytes');
      const r = json<{ existedBefore: boolean; said: string }>(inChild(`
        const fs = await import('node:fs');
        const dir = ${JSON.stringify(dir)};
        const existedBefore = fs.existsSync(dir);
        const said = G.cleanupProfile({ used: true, derived: true, dir, keep: false });
        process.stdout.write(JSON.stringify({ existedBefore, said }));`));
      expect(r.existedBefore, 'anti-vacuous: the directory and its contents existed').toBe(true);
      expect(r.said).toContain('removed');
      expect(existsSync(dir), 'the deletion is observed from HERE, not from the child\'s own report').toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('KEEPS a profile named by the environment — this process did not create it', () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-profile-cleanup-'));
    try {
      const dir = join(root, 'shared-by-two');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'x'), 'bytes');
      const r = json<{ said: string }>(inChild(
        `process.stdout.write(JSON.stringify({ said: G.cleanupProfile({ used: true, derived: false, dir: ${JSON.stringify(dir)}, keep: false }) }));`));
      expect(r.said).toContain('KEPT');
      expect(r.said).toContain('AURORA_HARNESS_PROFILE_DIR');
      expect(existsSync(join(dir, 'x'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('KEEPS a derived profile when the operator asked it to', () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-profile-cleanup-'));
    try {
      const dir = join(root, 'derived-profile');
      mkdirSync(dir, { recursive: true });
      const r = json<{ said: string }>(inChild(
        `process.stdout.write(JSON.stringify({ said: G.cleanupProfile({ used: true, derived: true, dir: ${JSON.stringify(dir)}, keep: true }) }));`));
      expect(r.said).toContain('KEPT');
      expect(r.said).toContain('AURORA_HARNESS_KEEP_PROFILE');
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('says it used none when the process never launched an Electron', () => {
    const r = json<{ said: string }>(inChild('process.stdout.write(JSON.stringify({ said: G.cleanupProfile() }));'));
    expect(r.said).toContain('none used');
  });

  /** ⚠ AND IT MUST NOT DELETE ON THAT PATH. `used:false` with a real directory
   *  present is the shape a process that imported the guard and never launched
   *  anything is in; if the flag were ignored it would remove a directory
   *  belonging to whichever run named it. */
  it('deletes nothing when nothing was pinned, even with a real directory in hand', () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-profile-cleanup-'));
    try {
      writeFileSync(join(root, 'x'), 'bytes');
      const r = json<{ said: string }>(inChild(
        `process.stdout.write(JSON.stringify({ said: G.cleanupProfile({ used: false, derived: true, dir: ${JSON.stringify(root)}, keep: false }) }));`));
      expect(r.said).toContain('none used');
      expect(existsSync(join(root, 'x'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('clearCallSiteCensus — derived, and NOT inflated by prose about itself', () => {
  /**
   * ⚠ THE ROW THIS FILE EXISTS FOR, AFTER THE PINNING. The refusal in
   * `scratchpad/canvas-cdp-harness.mjs` told operators "114 call sites" long
   * after the population had grown past it, because a number in prose is right
   * on the day it is typed and nothing re-derives it.
   *
   * And a raw grep is not the fix either: it counts every block comment that
   * NAMES the call, so the census rose every time somebody documented the
   * hazard. The fixture below has two real calls and three in comments, and the
   * answer must be two.
   */
  it('counts calls, not the comments describing them', () => {
    const d = mkdtempSync(join(tmpdir(), 'aurora-census-'));
    try {
      writeFileSync(join(d, 'a.mjs'), [
        '// a harness that mentions localStorage.clear() in a line comment',
        '/* and a block comment naming localStorage.clear() twice: localStorage.clear() */',
        'await c.evalExpr("x");',
        'localStorage.clear();',
        'window.localStorage . clear ( );',
      ].join('\n'));
      mkdirSync(join(d, 'sub'));
      writeFileSync(join(d, 'sub', 'b.ts'), 'export const f = () => { localStorage.clear(); };\n');
      writeFileSync(join(d, 'c.mjs'), 'export const g = 1;\n');
      writeFileSync(join(d, 'notes.md'), 'localStorage.clear() localStorage.clear()\n');

      const c = json<{ sites: number; files: number }>(inChild(
        `process.stdout.write(JSON.stringify(G.clearCallSiteCensus(${JSON.stringify(d)})));`));
      expect(c.sites, 'three of the five mentions in a.mjs are comments; b.ts has one').toBe(3);
      expect(c.files, 'c.mjs has none and notes.md is not a source file').toBe(2);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('reports UNREADABLE rather than zero when the directory is not there', () => {
    const c = json<{ sites: number | null; why?: string }>(inChild(
      'process.stdout.write(JSON.stringify(G.clearCallSiteCensus("/definitely/not/here")));'));
    expect(c.sites, 'a directory that cannot be read must not answer 0 — that reads as "no hazard"').toBeNull();
    expect(c.why).toContain('could not be read');
  });

  it('the sentence a refusal pastes in names its units and its method', () => {
    const s = json<{ s: string }>(inChild(
      'process.stdout.write(JSON.stringify({ s: G.describeClearCensus(G.clearCallSiteCensus()) }));')).s;
    expect(s).toMatch(/call site\(s\) across \d+ source file\(s\)/);
    expect(s).toContain('comments');
    expect(s).toContain('never typed');
  });

  /** The live population must actually be non-trivial, or the refusal renders a
   *  sentence that understates a hazard it exists to explain. */
  it('finds a real, non-zero population in this repo', () => {
    const c = json<{ sites: number; files: number }>(inChild(
      'process.stdout.write(JSON.stringify(G.clearCallSiteCensus()));'));
    expect(c.sites).toBeGreaterThan(50);
    expect(c.files).toBeGreaterThan(50);
    expect(c.sites).toBeGreaterThanOrEqual(c.files);
  });
});
