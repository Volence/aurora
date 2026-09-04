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
 * ── ⚠ WHY THIS FILE SPAWNS ALMOST NOTHING, AFTER A FLAKE OF ITS OWN ────────
 *
 * THE FIRST VERSION RAN EVERY ROW IN A CHILD `node`, copied from
 * `harness-guard-globals.test.ts` next door. That file has a REASON — it needs
 * a fake `$HOME` in place before the module derives its paths at load — and
 * this one mostly does not. The cost was invisible on an idle box and not
 * invisible under the full suite:
 *
 *   full suite, run 1   `the sentence a refusal pastes in …`  7386 ms  TIMED OUT
 *   full suite, run 2   the same row                                   passed
 *   this file alone     the same row                          ~1400 ms passed
 *
 * — a row that is green twice and red once, which is precisely the class this
 * whole parcel exists to remove. MEASURED where the time went, rather than
 * assumed: on an idle box a child is ~16 ms to spawn and import and ~15 ms more
 * to walk the repo, so **the spawn is about half the cost and EVERY row was
 * paying it**. Fixing only the two census rows would have left sixteen others
 * at roughly half the budget of one that had already blown it.
 *
 * ⚠ AND THE FIX IS NOT A BIGGER TIMEOUT. A raised number passes on this box
 * today and says nothing about a slower one; this repo already ruled that way
 * when `s1-io`'s round-trip timed out under CPU contention. The work is removed
 * instead of relocated: `scratchpad/lib/harness-guard.d.mts` gives the module
 * the signature `tsconfig.json`'s `allowJs: false` needs — the same treatment
 * `aeon-shipped-preset.d.mts` and `test/support/sibling-root.d.mts` already
 * have — so these rows call it IN PROCESS at microsecond cost.
 *
 * ⚠ IMPORTING A LAUNCHER MODULE INTO `npm test` IS A THING TO CHECK, NOT TO
 * ASSUME. Verified before relying on it: `harness-guard.mjs` does nothing at
 * module scope but derive paths and read `package.json`. `installNet()` — which
 * installs the exit/SIGINT/SIGTERM handlers — is reached only from
 * `spawnGuarded` and `setDiscoveryBaseline`, and nothing here calls either, so
 * this file installs no process handlers, creates no directory and spawns no
 * Electron. `harness-guard.d.mts` deliberately does not even declare that half.
 *
 * TWO facts genuinely need a second process, because they are properties of
 * MODULE LOAD: that two processes derive different profiles, and that the
 * environment override is honoured. Both are paid ONCE, concurrently, in
 * `beforeAll` — a hook is where setup cost is expected — and both children only
 * spawn and import; neither walks anything.
 *
 * ⚠ NOTHING HERE READS OR WRITES A REAL PROFILE. Every path below is a string
 * or a `mkdtemp`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

import {
  clearCallSiteCensus, describeClearCensus, pinUserDataDir, cleanupProfile,
  RUN_PROFILE_DIR, RUN_PROFILE_DERIVED, PROFILE_ROOT, PROFILE_DIR_ENV,
  type ClearCallSiteCensus,
} from '../../scratchpad/lib/harness-guard.mjs';

const GUARD = resolve(__dirname, '../../scratchpad/lib/harness-guard.mjs');

interface ForeignProfile { dir: string; derived: boolean; pid: number }

/**
 * Load the module in a SEPARATE process and report what it derived there.
 *
 * The only thing this is for is a fact about MODULE LOAD — a second process's
 * profile, or the effect of an environment variable read at import. It spawns
 * and imports and does nothing else; it walks nothing.
 *
 * ASYNC, so `beforeAll` can start all three at once. Serially, three spawns
 * under the contention that produced this file's original 7.4 s row would land
 * near the hook budget; concurrently the wall time is one spawn's, not three.
 */
function profileOfAnotherProcess(env: Record<string, string> = {}): Promise<ForeignProfile> {
  const src = `import * as G from ${JSON.stringify(GUARD)};\n`
    + 'process.stdout.write(JSON.stringify({ dir: G.RUN_PROFILE_DIR, derived: G.RUN_PROFILE_DERIVED, pid: process.pid }));\n';
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', src], {
      env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', rej);
    p.on('close', (code) => {
      if (code !== 0) { rej(new Error(`child exited ${code}:\n${err}`)); return; }
      try { res(JSON.parse(out) as ForeignProfile); } catch (e) { rej(new Error(`unparseable child output ${JSON.stringify(out)}: ${String(e)}`)); }
    });
  });
}

const ELECTRON = '/some/tree/node_modules/.bin/electron';
const MAIN = '/some/tree/dist/main/index.mjs';
/** The command shape every launcher in scratchpad/ actually uses. */
const XVFB_ARGS = ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN];

/* ── everything paid once, where setup cost belongs ───────────────────────── */

/** The walk of this repo, done ONE time for the whole file. */
let realCensus: ClearCallSiteCensus;
/**
 * ⚠ TWO CHILDREN, AND NOT "A CHILD AGAINST THIS PROCESS" — the restructure that
 * removed this file's flake nearly made its headline row vacuous, and the
 * mutation caught it.
 *
 * `RUN_PROFILE_DIR` is `<root>/<instrument>-<pid>-<random>`, where the
 * instrument comes from `basename(process.argv[1])`. A vitest worker has a real
 * `argv[1]`; a `node -e` child has none and falls back to `node`. So comparing
 * this process against one child made the two differ BY NAME, and the mutation
 * that strips the pid and the random suffix — the exact defect the row exists
 * to catch — stopped failing it. Measured, not reasoned about: that plant went
 * from failing two rows to failing one.
 *
 * Two `-e` children share an instrument name by construction, so the only thing
 * left that can differ is the pid and the suffix. The row asserts the shared
 * prefix as well, so "they differ" cannot again be satisfied by them differing
 * in the wrong place.
 */
let childA: ForeignProfile;
let childB: ForeignProfile;
/** A third, with the environment override set at its module load. */
let overridden: ForeignProfile;

beforeAll(async () => {
  realCensus = clearCallSiteCensus();
  [childA, childB, overridden] = await Promise.all([
    profileOfAnotherProcess(),
    profileOfAnotherProcess(),
    profileOfAnotherProcess({ [PROFILE_DIR_ENV]: '/tmp/shared-by-two' }),
  ]);
});

describe('pinUserDataDir — the switch, and WHERE it goes', () => {
  /**
   * POSITION IS THE ASSERTION, not presence. The command is `xvfb-run … <bin>
   * <app.mjs>`: a switch at the front is eaten by xvfb-run and one at the back
   * is an argument to the app, not to Chromium. Either would leave the run on
   * the shared profile while every log line said it was pinned. Both wrong
   * placements pass a `toContain`, which is why this row indexes.
   */
  it('inserts the switch IMMEDIATELY after the electron binary, not at either end', () => {
    const out = pinUserDataDir('/usr/bin/xvfb-run', XVFB_ARGS, '/tmp/P');
    const i = out.indexOf(ELECTRON);
    expect(i, 'the binary must still be in the command').toBeGreaterThan(-1);
    expect(out[i + 1]).toBe('--user-data-dir=/tmp/P');
    expect(out[i + 2], 'and the app bundle must still follow it').toBe(MAIN);
    expect(out[0], 'NOT at the front, where xvfb-run would consume it').not.toContain('--user-data-dir');
    expect(out[out.length - 1], 'NOT at the back, where it is an app argument').toBe(MAIN);
  });

  it('puts it first when the command IS the electron binary', () => {
    expect(pinUserDataDir(ELECTRON, [MAIN], '/tmp/P')).toEqual(['--user-data-dir=/tmp/P', MAIN]);
  });

  /**
   * BY IDENTITY, because `spawnGuarded` uses `!==` to decide whether a profile
   * was pinned — and therefore whether to create the directory, print the line,
   * and hand the path to the flush check. A copied array that happens to be
   * equal would make all three fire on a launch that was never pinned, so
   * `toEqual` here would be a check that cannot see the defect.
   */
  it('returns its argument UNCHANGED BY IDENTITY when the command has no electron in it', () => {
    const args = ['-a', '/usr/bin/some-other-tool', 'x'];
    expect(pinUserDataDir('/usr/bin/xvfb-run', args, '/tmp/P'), 'the SAME array object, not an equal one').toBe(args);
    expect(args.join(' ')).not.toContain('--user-data-dir');
  });

  it('DEFERS to a --user-data-dir the caller passed itself, also by identity', () => {
    const args = ['-a', ELECTRON, '--user-data-dir=/caller/said/so', MAIN];
    expect(pinUserDataDir('/usr/bin/xvfb-run', args, '/tmp/P')).toBe(args);
    expect(args).toContain('--user-data-dir=/caller/said/so');
    expect(args.join(' '), 'and NOT both switches').not.toContain('/tmp/P');
  });

  it('the switch it writes is the one it tests for — one spelling, not two', () => {
    // Feeding its own output back must be a no-op, which is only true if the
    // "already has one" test recognises the flag this function writes.
    const once = pinUserDataDir('/usr/bin/xvfb-run', XVFB_ARGS, '/tmp/P');
    expect(pinUserDataDir('/usr/bin/xvfb-run', once, '/tmp/Q'),
      'a second pin would leave two --user-data-dir switches on one command').toBe(once);
  });
});

describe('RUN_PROFILE_DIR — stable within a run, unique across concurrent ones', () => {
  /**
   * ⚠ THE PROPERTY THAT IS EASY TO GET BACKWARDS. A fresh profile PER LAUNCH
   * would isolate instruments perfectly and break `canvas-cdp-harness`, which
   * relaunches four times in one run and reads what the previous launch left in
   * `localStorage` — the persistence its restart suite exists to measure. The
   * failure would look exactly like the flake this parcel removes.
   *
   * Reading it twice is not vacuous: a getter that re-derived per read — which
   * is what "per launch" would look like in code — returns two different
   * strings and fails here.
   */
  it('is the SAME value on every read inside one process', () => {
    expect(RUN_PROFILE_DIR).toBe(RUN_PROFILE_DIR);
    expect(typeof RUN_PROFILE_DIR).toBe('string');
  });

  /**
   * THE HEADLINE CLAIM: two concurrently running instruments get two profiles.
   *
   * The two children are alike in everything the derivation reads except their
   * pid, so a pass here cannot be explained by anything else — see the note on
   * `childA`/`childB` above for the version of this row that could, and how the
   * mutation found it.
   */
  it('is a DIFFERENT value in another process of the SAME instrument', () => {
    expect(childA.pid, 'anti-vacuous: they really are two processes').not.toBe(childB.pid);
    expect(childA.dir).not.toBe(childB.dir);
    expect(childA.derived).toBe(true);
    expect(childB.derived).toBe(true);

    // …and they differ in the PID/suffix, not in the instrument name: both must
    // sit under one root and share one prefix up to the pid.
    const prefix = join(PROFILE_ROOT, 'node-');
    expect(childA.dir.startsWith(prefix),
      `both children must share the instrument prefix ${prefix}; got ${childA.dir}`).toBe(true);
    expect(childB.dir.startsWith(prefix)).toBe(true);
    // This process is a vitest worker, so its instrument name is its own; only
    // its SHAPE is comparable, and that is all this asserts about it.
    expect(RUN_PROFILE_DIR.startsWith(PROFILE_ROOT)).toBe(true);
    expect(PROFILE_ROOT.startsWith(tmpdir())).toBe(true);
  });

  it('a pid alone would not be enough, so the name carries a random suffix too', () => {
    expect(childA.dir).toContain(String(childA.pid));
    // …and something after the pid, so a REUSED pid cannot inherit the storage
    // of a run that died without cleaning up.
    expect(childA.dir.split(`-${childA.pid}-`)[1] ?? '').toMatch(/^[0-9a-f]{8}$/);
    // Two runs of the same instrument at the same pid would still differ.
    expect(childA.dir.split(`-${childA.pid}-`)[1]).not.toBe(childB.dir.split(`-${childB.pid}-`)[1]);
  });

  it('defers to AURORA_HARNESS_PROFILE_DIR, and then reports that it does not own it', () => {
    expect(overridden.dir).toBe('/tmp/shared-by-two');
    expect(overridden.derived,
      'a directory this process did not create is not this process\'s to delete').toBe(false);
    // …and this process, with no override, still owns its own.
    expect(RUN_PROFILE_DERIVED).toBe(true);
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
      expect(existsSync(join(dir, 'x')), 'anti-vacuous: the directory and its contents existed').toBe(true);

      const said = cleanupProfile({ used: true, derived: true, dir, keep: false });
      expect(said).toContain('removed');
      expect(existsSync(dir), 'the deletion is observed here, not taken from the return string').toBe(false);
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

      const said = cleanupProfile({ used: true, derived: false, dir, keep: false });
      expect(said).toContain('KEPT');
      expect(said).toContain(PROFILE_DIR_ENV);
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

      const said = cleanupProfile({ used: true, derived: true, dir, keep: true });
      expect(said).toContain('KEPT');
      expect(said).toContain('AURORA_HARNESS_KEEP_PROFILE');
      expect(existsSync(dir)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('says it used none when the process never launched an Electron', () => {
    expect(cleanupProfile({ used: false })).toContain('none used');
  });

  /** ⚠ AND IT MUST NOT DELETE ON THAT PATH. `used:false` with a real directory
   *  present is the shape a process that imported the guard and never launched
   *  anything is in; if the flag were ignored it would remove a directory
   *  belonging to whichever run named it. */
  it('deletes nothing when nothing was pinned, even with a real directory in hand', () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-profile-cleanup-'));
    try {
      writeFileSync(join(root, 'x'), 'bytes');
      const said = cleanupProfile({ used: false, derived: true, dir: root, keep: false });
      expect(said).toContain('none used');
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
   *
   * ⚠ THIS ROW USES A FIXTURE, NOT THE REPO, AND THAT IS THE POINT. What is
   * under test here is the DERIVATION — stripping, extensions, the two units —
   * and a fixture answers it exactly, in microseconds, with a number that
   * cannot drift. Only the anti-vacuous row below needs the real tree, and it
   * reads the one walk done in `beforeAll`.
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

      const c = clearCallSiteCensus(d);
      expect(c.sites, 'three of the five mentions in a.mjs are comments; b.ts has one').toBe(3);
      expect(c.files, 'c.mjs has none and notes.md is not a source file').toBe(2);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('reports UNREADABLE rather than zero when the directory is not there', () => {
    const c = clearCallSiteCensus('/definitely/not/here');
    expect(c.sites, 'a directory that cannot be read must not answer 0 — that reads as "no hazard"').toBeNull();
    expect(c.why).toContain('could not be read');
  });

  /**
   * The SENTENCE, rendered from a fixture census so the wording is judged
   * against numbers this row owns. Rendering the repo's own census here would
   * have made a row about prose depend on a filesystem walk — which is exactly
   * how this file came to have a 7.4 s row.
   */
  it('the sentence a refusal pastes in names its units and its method', () => {
    const d = mkdtempSync(join(tmpdir(), 'aurora-census-'));
    try {
      writeFileSync(join(d, 'a.mjs'), 'localStorage.clear();\nlocalStorage.clear();\n');
      const s = describeClearCensus(clearCallSiteCensus(d));
      expect(s).toMatch(/2 call site\(s\) across 1 source file\(s\)/);
      expect(s).toContain('comments');
      expect(s).toContain('never typed');
      expect(s, 'and it names the directory it counted, so two counts can be reconciled').toContain(d);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('an unreadable census renders as a refusal, not as a sentence claiming zero', () => {
    const s = describeClearCensus(clearCallSiteCensus('/definitely/not/here'));
    expect(s).toContain('could not be taken');
    expect(s).not.toMatch(/\b0 call site/);
  });

  /**
   * The live population must actually be non-trivial, or the refusal renders a
   * sentence that understates a hazard it exists to explain. This is the ONE
   * row that needs the real tree, and it reads the single walk from `beforeAll`
   * rather than doing its own.
   */
  it('finds a real, non-zero population in this repo', () => {
    expect(realCensus.sites).toBeGreaterThan(50);
    expect(realCensus.files).toBeGreaterThan(50);
    expect(realCensus.sites!).toBeGreaterThanOrEqual(realCensus.files!);
    expect(realCensus.dir).toContain('scratchpad');
  });
});
