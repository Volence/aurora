/**
 * THE RESOLVER'S FOUR STEPS, ONE ROW EACH — and every row planted red first.
 *
 * `test/support/sibling-root.mjs` is the only place in this repository that
 * decides where a peer checkout lives. Before this file it had NO test at all:
 * its correctness was argued in its docblock, which is exactly the shape that
 * let its previous incarnation ship a second, silently disagreeing copy inside
 * `scripts/check-peer-path-literals.mjs` for weeks.
 *
 * WHY EVERY ROW RUNS IN A CHILD PROCESS. The subject reads `process.env` at call
 * time and announces a transitional alias ONCE PER PROCESS. Both properties are
 * about a process, so mutating `process.env` inside this vitest worker would
 * test neither: the announce would fire on whichever row ran first and be
 * invisible to the rest, and a leaked variable would silently retune every
 * other test file sharing the worker. A child gets a clean environment, real
 * stderr, and a real exit code — the three things these rows assert about.
 *
 * WHY THE EXPECTATIONS ARE BUILT, NOT TYPED. Every path asserted here is
 * composed from a `mkdtemp` directory this file created moments earlier, so no
 * row can pass by naming a string that happens to be right on one machine —
 * which is the entire defect class the subject exists to remove.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const SUBJECT = resolve(__dirname, 'sibling-root.mjs');

/** A fresh suite-root-shaped tmpdir: `<tmp>/aeon`, `<tmp>/s1disasm`, `<tmp>/aurora`. */
function makeFakeSuite(): string {
  const root = mkdtempSync(resolve(tmpdir(), 'aurora-suite-paths-'));
  for (const name of ['aeon', 's1disasm', 'aurora']) mkdirSync(resolve(root, name));
  return root;
}

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Run `body` in a child node process with `env` ADDED to a cleaned environment.
 *
 * The suite variables are deleted rather than merely unset by the caller: this
 * repo's own harnesses export `AEON_DIR`, so inheriting the ambient environment
 * would make several rows measure the developer's shell instead of the subject.
 */
function run(body: string, env: Record<string, string> = {}, subject = SUBJECT): Run {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) {
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|AURORA_ROOT|AURORA_REPO|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
  }
  const src = `import * as R from ${JSON.stringify(subject)};\n${body}\n`;
  const r = execFileSync(process.execPath, ['--input-type=module', '-e', src], {
    env: { ...clean, ...env },
    encoding: 'utf8',
    cwd: dirname(subject),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: 0, stdout: r, stderr: '' };
}

/** Same, but for a body EXPECTED to throw: returns the exit code and both streams. */
function runExpectingFailure(body: string, env: Record<string, string> = {}): Run {
  try {
    const ok = run(body, env);
    return { ...ok, status: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

/**
 * Run and return BOTH streams separately.
 *
 * `execFileSync` hands back only stdout, so the child's stderr goes to a file
 * through a one-line shell redirect and is read back. The alias announcement is
 * a stderr line by design — it must not pollute an instrument's stdout, which
 * several harnesses parse — so a row asserting "once, on stderr" has to be able
 * to see the two streams apart.
 */
function runBoth(body: string, env: Record<string, string> = {}): Run {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) {
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|AURORA_ROOT|AURORA_REPO|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
  }
  const src = `import * as R from ${JSON.stringify(SUBJECT)};\n${body}\n`;
  const scratch = mkdtempSync(resolve(tmpdir(), 'aurora-suite-run-'));
  const file = resolve(scratch, 'probe.mjs');
  writeFileSync(file, src, 'utf8');
  const res = execFileSync('/bin/sh', ['-c', `"$0" "$1" 2>"$2"`, process.execPath, file, resolve(scratch, 'err')], {
    env: { ...clean, ...env },
    encoding: 'utf8',
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: 0,
    stdout: res,
    stderr: execFileSync('/bin/cat', [resolve(scratch, 'err')], { encoding: 'utf8' }),
  };
}

describe('sibling-root: step 1 — the explicit checkout variable', () => {
  it('AEON_DIR answers, and the source names step 1', () => {
    const suite = makeFakeSuite();
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-copy-'));
    const out = run(
      'process.stdout.write(R.siblingPath("aeon") + "\\n" + R.siblingPathSource("aeon"));',
      { EMPYREAN_SUITE_ROOT: suite, AEON_DIR: elsewhere },
    );
    const [path, source] = out.stdout.split('\n');
    // Built, not typed: `elsewhere` was created three lines up, and it is NOT
    // under the suite root, so a resolver that skipped step 1 cannot pass.
    expect(path).toBe(elsewhere);
    expect(source).toMatch(/^step 1: AEON_DIR=/);
  });

  it('a relative segment resolves under the checkout, not under the suite root', () => {
    const suite = makeFakeSuite();
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-copy-'));
    const out = run(
      'process.stdout.write(R.siblingPath("aeon", "engine", "system", "constants.emp"));',
      { EMPYREAN_SUITE_ROOT: suite, AEON_DIR: elsewhere },
    );
    expect(out.stdout).toBe(resolve(elsewhere, 'engine/system/constants.emp'));
  });

  it('SET BUT WRONG is a hard error naming the variable, its value and the step', () => {
    const suite = makeFakeSuite();
    const absent = resolve(suite, 'no-such-aeon-copy');
    const r = runExpectingFailure('R.siblingPath("aeon");', { AEON_DIR: absent });
    expect(r.status, `expected a non-zero exit; got ${r.status} with stdout ${r.stdout}`).not.toBe(0);
    expect(r.stderr).toContain('SuitePathError');
    expect(r.stderr).toContain('AEON_DIR=');
    expect(r.stderr).toContain(absent);
    expect(r.stderr).toContain('step 1');
    // The refusal must not silently become the DEFAULT tree.
    expect(r.stdout).toBe('');
  });

  it('the canonical name and an alias that DISAGREE are refused, naming both', () => {
    const a = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-a-'));
    const b = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-b-'));
    const r = runExpectingFailure('R.siblingPath("aeon");', { AEON_DIR: a, LIVE_AEON: b });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('AEON_DIR=');
    expect(r.stderr).toContain(a);
    expect(r.stderr).toContain('LIVE_AEON=');
    expect(r.stderr).toContain(b);
    expect(r.stderr).toContain('DISAGREE');
  });

  it('the canonical name and an alias that AGREE are not a conflict', () => {
    const a = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-a-'));
    const out = run('process.stdout.write(R.siblingPath("aeon"));', { AEON_DIR: a, LIVE_AEON: a });
    expect(out.stdout).toBe(a);
  });
});

describe('sibling-root: the alias announcement', () => {
  it('LIVE_AEON answers and says ONCE on stderr that AEON_DIR is the name', () => {
    const a = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-a-'));
    const r = runBoth(
      'process.stdout.write(R.siblingPath("aeon") + "|" + R.siblingPath("aeon") + "|" + R.siblingPathSource("aeon"));',
      { LIVE_AEON: a },
    );
    const [first, second, source] = r.stdout.split('|');
    expect(first).toBe(a);
    expect(second).toBe(a);
    expect(source).toMatch(/^step 1: LIVE_AEON=/);
    expect(source).toContain('the name is AEON_DIR');
    const lines = r.stderr.trim().split('\n').filter((l) => l.includes('transitional alias'));
    // Three resolutions, ONE line: a nag, not a log.
    expect(lines.length, `stderr was:\n${r.stderr}`).toBe(1);
    expect(lines[0]).toContain('LIVE_AEON');
    expect(lines[0]).toContain('AEON_DIR');
  });

  it('AURORA_AEON_REPO is announced the same way', () => {
    const a = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-a-'));
    const r = runBoth('process.stdout.write(R.siblingPath("aeon"));', { AURORA_AEON_REPO: a });
    expect(r.stdout).toBe(a);
    expect(r.stderr).toContain('AURORA_AEON_REPO is a transitional alias');
  });

  it('THE CANONICAL NAME PRINTS NOTHING — the anti-vacuous half of the row above', () => {
    const a = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-a-'));
    const r = runBoth('process.stdout.write(R.siblingPath("aeon"));', { AEON_DIR: a });
    expect(r.stdout).toBe(a);
    expect(r.stderr.trim(), 'AEON_DIR is the ratified name; announcing it would train the reader to ignore the line').toBe('');
  });

  it('AURORA_PEER_ROOT is announced against EMPYREAN_SUITE_ROOT', () => {
    const suite = makeFakeSuite();
    const r = runBoth('process.stdout.write(R.siblingRoot());', { AURORA_PEER_ROOT: suite });
    expect(r.stdout).toBe(suite);
    expect(r.stderr).toContain('AURORA_PEER_ROOT is a transitional alias');
    expect(r.stderr).toContain('EMPYREAN_SUITE_ROOT');
  });
});

describe('sibling-root: step 2 — EMPYREAN_SUITE_ROOT joined with the repo name', () => {
  it('resolves a peer under a suite root that exists only in a tmpdir', () => {
    const suite = makeFakeSuite();
    const out = run(
      'process.stdout.write(R.siblingPath("aeon") + "\\n" + R.siblingPath("s1disasm") + "\\n" + R.siblingPathSource("aeon"));',
      { EMPYREAN_SUITE_ROOT: suite },
    );
    const [aeon, s1, source] = out.stdout.split('\n');
    expect(aeon).toBe(resolve(suite, 'aeon'));
    expect(s1).toBe(resolve(suite, 's1disasm'));
    expect(source).toMatch(/^step 2: EMPYREAN_SUITE_ROOT=/);
  });

  it('STILL OWES STEP 1 — the contract amendment, as a row', () => {
    const suite = makeFakeSuite();
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-copy-'));
    const out = run(
      'process.stdout.write(R.siblingPath("aeon") + "\\n" + R.siblingPath("s1disasm"));',
      { EMPYREAN_SUITE_ROOT: suite, AEON_DIR: elsewhere },
    );
    const [aeon, s1] = out.stdout.split('\n');
    expect(aeon).toBe(elsewhere);
    // …and the suite root still answers for every peer that has no own variable.
    expect(s1).toBe(resolve(suite, 's1disasm'));
  });

  it('SET BUT WRONG is a hard error, not a fall-through to this machine', () => {
    const suite = makeFakeSuite();
    const absent = resolve(suite, 'no-such-suite-root');
    const r = runExpectingFailure('R.siblingRoot();', { EMPYREAN_SUITE_ROOT: absent });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('EMPYREAN_SUITE_ROOT=');
    expect(r.stderr).toContain(absent);
    expect(r.stderr).toContain('step 2');
    expect(r.stderr).toContain('mktemp -d');
  });

  it('the suite-root canonical and alias disagreeing are refused, naming both', () => {
    const a = makeFakeSuite();
    const b = makeFakeSuite();
    const r = runExpectingFailure('R.siblingRoot();', { EMPYREAN_SUITE_ROOT: a, AURORA_PEER_ROOT: b });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain(a);
    expect(r.stderr).toContain(b);
    expect(r.stderr).toContain('DISAGREE');
  });
});

describe('sibling-root: step 3 — derivation from this repo, via --git-common-dir', () => {
  // Called INSIDE each row, never in the describe body: a throw during
  // collection takes the whole file and every row in it (fixture-tree.ts's
  // `describeRequiringFixture` header records three files and 29 tests lost
  // that way), so a subject that is broken enough to throw must still be able
  // to report one red row per property.
  const derive = () => run('process.stdout.write(R.siblingRoot() + "\\n" + R.siblingRootSource());').stdout.split('\n');

  it('names step 3 and the command it used', () => {
    const [, source] = derive();
    expect(source).toMatch(/^step 3: git rev-parse --git-common-dir/);
  });

  it('answers the MAIN checkout\'s parent, which is what --show-toplevel would get wrong', (ctx) => {
    const [derived] = derive();
    const here = resolve(__dirname, '../..');
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim();
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: here, encoding: 'utf8',
    }).trim();
    const viaCommon = dirname(dirname(common));
    if (dirname(toplevel) === viaCommon) {
      ctx.skip(
        'SKIPPED, NOT PASSED: this run is in the MAIN checkout, where --show-toplevel and '
        + '--git-common-dir agree, so the row cannot tell them apart and measures nothing. '
        + 'Run it from a linked worktree (.claude/worktrees/<name>) to measure it.',
      );
      return;
    }
    expect(derived).toBe(viaCommon);
    expect(derived).not.toBe(dirname(toplevel));
  });
});

describe('sibling-root: step 4 — refuse, naming what was looked for and where', () => {
  /**
   * Forced by COPYING the subject outside any git repository: the derivation is
   * anchored to the module's own location, so a copy at `<tmp>/test/support/`
   * makes `AURORA_ROOT` a tmpdir, where `git rev-parse` finds nothing.
   */
  function subjectOutsideAnyRepo(): string {
    const root = mkdtempSync(resolve(tmpdir(), 'aurora-no-repo-'));
    mkdirSync(resolve(root, 'test/support'), { recursive: true });
    const copy = resolve(root, 'test/support/sibling-root.mjs');
    cpSync(SUBJECT, copy);
    return copy;
  }

  it('siblingRoot() is null and the source says step 4, naming both variables', () => {
    const copy = subjectOutsideAnyRepo();
    const out = run(
      'process.stdout.write(String(R.siblingRoot()) + "\\n" + R.siblingRootSource());',
      {}, copy,
    );
    const [root, source] = out.stdout.split('\n');
    expect(root).toBe('null');
    expect(source).toMatch(/^step 4: REFUSED/);
    expect(source).toContain('EMPYREAN_SUITE_ROOT');
    expect(source).toContain('AURORA_PEER_ROOT');
    expect(source).toContain('--git-common-dir');
  });

  it('requireSiblingPath THROWS, naming what was looked for and where', () => {
    const copy = subjectOutsideAnyRepo();
    let stderr = '';
    try {
      run('R.requireSiblingPath("aeon");', {}, copy);
      throw new Error('requireSiblingPath resolved where nothing could be resolved');
    } catch (e) {
      stderr = (e as { stderr?: string }).stderr ?? String(e);
    }
    expect(stderr).toContain('SuitePathError');
    expect(stderr).toContain('AEON_DIR');
    expect(stderr).toContain('LIVE_AEON');
    expect(stderr).toContain('EMPYREAN_SUITE_ROOT');
    expect(stderr).toContain('step 4');
  });

  it('siblingPathOrUnresolved lands under UNRESOLVED_ROOT, which cannot open anything', () => {
    const copy = subjectOutsideAnyRepo();
    const out = run(
      'process.stdout.write(R.siblingPathOrUnresolved("s1disasm", "sonic.asm") + "\\n" + R.UNRESOLVED_ROOT);',
      {}, copy,
    );
    const [path, unresolved] = out.stdout.split('\n');
    expect(path).toBe(resolve(unresolved, 's1disasm/sonic.asm'));
    expect(path.startsWith('/nonexistent/')).toBe(true);
  });
});

describe('sibling-root: siblingDefaultPath, the live-tree guards\' instrument', () => {
  it('IGNORES the checkout variable, which is the only reason a guard can work', () => {
    const suite = makeFakeSuite();
    const copy = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-copy-'));
    const out = run(
      'process.stdout.write(R.siblingDefaultPath("aeon") + "\\n" + R.siblingPath("aeon"));',
      { EMPYREAN_SUITE_ROOT: suite, AEON_DIR: copy },
    );
    const [dflt, viaEnv] = out.stdout.split('\n');
    expect(dflt).toBe(resolve(suite, 'aeon'));
    expect(viaEnv).toBe(copy);
    // The guard's predicate: the copy is NOT the default tree, so it may run.
    expect(viaEnv.startsWith(dflt)).toBe(false);
  });

  it('a guard pointed at the default tree still refuses', () => {
    const suite = makeFakeSuite();
    const out = run(
      'process.stdout.write(String(R.siblingPath("aeon").startsWith(R.siblingDefaultPath("aeon"))));',
      { EMPYREAN_SUITE_ROOT: suite, AEON_DIR: resolve(suite, 'aeon') },
    );
    expect(out.stdout).toBe('true');
  });
});

describe('sibling-root: checkoutOverride', () => {
  it('is null when nothing is set, so a caller can REQUIRE one', () => {
    const suite = makeFakeSuite();
    const out = run('process.stdout.write(String(R.checkoutOverride("aeon")));', { EMPYREAN_SUITE_ROOT: suite });
    expect(out.stdout).toBe('null');
  });

  it('names the spelling that answered', () => {
    const copy = mkdtempSync(resolve(tmpdir(), 'aurora-aeon-copy-'));
    const out = run('const o = R.checkoutOverride("aeon"); process.stdout.write(o.name + "\\n" + o.value);', { LIVE_AEON: copy });
    const [name, value] = out.stdout.split('\n');
    expect(name).toBe('LIVE_AEON');
    expect(value).toBe(copy);
  });
});

describe('sibling-root: the names the contract ratified', () => {
  it('spells the canonical variables, so a rename cannot pass silently', () => {
    const out = run(
      'process.stdout.write([R.SUITE_ROOT_ENV, R.checkoutEnv("aeon"), R.checkoutEnv("s1disasm"), '
      + 'R.checkoutEnv("oracle"), R.checkoutEnv("empyrean"), R.checkoutEnvAliases("aeon").join(","), '
      + 'R.checkoutEnvAliases("oracle").join(","), R.checkoutEnvAliases("s1disasm").join(","), '
      + 'R.SUITE_ROOT_ENV_ALIASES.join(",")].join("\\n"));',
    );
    expect(out.stdout.split('\n')).toEqual([
      'EMPYREAN_SUITE_ROOT',
      'AEON_DIR',
      'S1DISASM_DIR',
      'ORACLE_DIR',
      'EMPYREAN_DIR',
      'AURORA_AEON_REPO,LIVE_AEON,AEON_ROOT',
      'AURORA_ORACLE_REPO',
      'AURORA_S1DISASM_REPO,S1_DIR',
      'AURORA_PEER_ROOT',
    ]);
  });

  it('spells THIS repo\'s own checkout variable and its aliases', () => {
    const out = run(
      'process.stdout.write([R.AURORA_DIR_ENV, R.AURORA_DIR_ENV_ALIASES.join(",")].join("\\n"));',
    );
    expect(out.stdout.split('\n')).toEqual(['AURORA_DIR', 'AURORA_ROOT,AURORA_REPO']);
  });
});

/**
 * AURORA_DIR — the same question turned inward, and the ONE step that is
 * deliberately not in the chain.
 *
 * Before O69 "which aurora tree am I" was answered by hand in 93 files: 64 read
 * `process.env.AURORA_ROOT` (not the contract's spelling) and 29 more wrote the
 * derivation with no override at all, so pointing a run at another tree moved
 * two thirds of them and silently failed to move the rest.
 *
 * Every expectation below is COMPOSED from `SUBJECT` — the path this file
 * already had to know to import the subject — or from a `mkdtemp` directory
 * created moments earlier. Nothing here is a path typed by hand, so no row can
 * pass by naming a string that happens to be right on one machine.
 */
describe('sibling-root: AURORA_DIR — this repo\'s own checkout', () => {
  /**
   * The tree the subject lives in, derived from the path used to import it:
   * `<tree>/test/support/sibling-root.mjs` → three levels up from the FILE.
   */
  const SUBJECT_TREE = resolve(SUBJECT, '../../..');

  it('unset → step 3, this module\'s own location, and the source says so', () => {
    const out = run('process.stdout.write(R.AURORA_DIR + "\\n" + R.auroraDirSource());');
    const [dir, source] = out.stdout.split('\n');
    expect(dir).toBe(SUBJECT_TREE);
    expect(source).toContain('step 3');
    expect(source).toContain(SUBJECT);
  });

  it('AURORA_DIR answers, and the source names step 1', () => {
    const suite = makeFakeSuite();
    const out = run(
      'process.stdout.write(R.AURORA_DIR + "\\n" + R.auroraDirSource());',
      { AURORA_DIR: resolve(suite, 'aurora') },
    );
    const [dir, source] = out.stdout.split('\n');
    expect(dir).toBe(resolve(suite, 'aurora'));
    expect(source).toContain('step 1: AURORA_DIR=');
  });

  it('AURORA_ROOT is accepted as an alias and announced ONCE, naming AURORA_DIR', () => {
    const suite = makeFakeSuite();
    const out = runBoth(
      'R.auroraDirSource(); R.auroraDirSource(); process.stdout.write(R.AURORA_DIR);',
      { AURORA_ROOT: resolve(suite, 'aurora') },
    );
    expect(out.stdout).toBe(resolve(suite, 'aurora'));
    const lines = out.stderr.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      'suite-paths: AURORA_ROOT is a transitional alias — set AURORA_DIR instead '
      + '(empyrean contract/SUITE_PATHS.md)',
    );
  });

  it('AURORA_REPO, the third spelling, is announced the same way', () => {
    const suite = makeFakeSuite();
    const out = runBoth('process.stdout.write(R.AURORA_DIR);',
      { AURORA_REPO: resolve(suite, 'aurora') });
    expect(out.stdout).toBe(resolve(suite, 'aurora'));
    expect(out.stderr).toContain('AURORA_REPO is a transitional alias — set AURORA_DIR instead');
  });

  it('THE CANONICAL NAME PRINTS NOTHING — the anti-vacuous half of the two rows above', () => {
    const suite = makeFakeSuite();
    const out = runBoth('process.stdout.write(R.AURORA_DIR);',
      { AURORA_DIR: resolve(suite, 'aurora') });
    expect(out.stdout).toBe(resolve(suite, 'aurora'));
    expect(out.stderr).toBe('');
  });

  it('SET BUT WRONG is a hard error naming the variable, its value and the step', () => {
    const absent = resolve(makeFakeSuite(), 'no-such-aurora');
    const out = runExpectingFailure('process.stdout.write(R.AURORA_DIR);', { AURORA_DIR: absent });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('SuitePathError');
    expect(out.stderr).toContain(`AURORA_DIR=${absent}`);
    expect(out.stderr).toContain('is not a directory');
    expect(out.stderr).toContain('Precedence step 1 refuses');
  });

  it('the canonical name and an alias that DISAGREE are refused, naming both', () => {
    const suite = makeFakeSuite();
    const out = runExpectingFailure('process.stdout.write(R.AURORA_DIR);', {
      AURORA_DIR: resolve(suite, 'aurora'),
      AURORA_ROOT: resolve(suite, 'aeon'),
    });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain('DISAGREE');
    expect(out.stderr).toContain(`AURORA_DIR=${resolve(suite, 'aurora')}`);
    expect(out.stderr).toContain(`AURORA_ROOT=${resolve(suite, 'aeon')}`);
  });

  /**
   * THE DELIBERATE GAP, asserted rather than described.
   *
   * `EMPYREAN_SUITE_ROOT=$(mktemp -d) npm test` is this repo's documented recipe
   * for "a machine with no REFERENCE trees". If step 2 also answered for aurora
   * ITSELF, that recipe would relocate the repo under test and every instrument
   * would stop finding its own `dist/` and `src/` — a run meant to prove the
   * peer-dependent half skips honestly would die of unrelated absence instead.
   *
   * The second half of this row is what stops it being vacuous: the SAME child
   * process, the SAME variable, moving a PEER. Without it, a subject that
   * ignored `EMPYREAN_SUITE_ROOT` entirely would pass.
   */
  it('EMPYREAN_SUITE_ROOT moves a PEER and does NOT move AURORA_DIR', () => {
    const suite = makeFakeSuite();
    const out = run(
      'process.stdout.write(R.AURORA_DIR + "\\n" + R.siblingPath("aeon"));',
      { EMPYREAN_SUITE_ROOT: suite },
    );
    const [dir, aeon] = out.stdout.split('\n');
    expect(aeon).toBe(resolve(suite, 'aeon'));
    expect(dir).toBe(SUBJECT_TREE);
    expect(dir).not.toBe(resolve(suite, 'aurora'));
  });

  it('auroraDirOverride is null when nothing is set, and names the spelling when set', () => {
    const suite = makeFakeSuite();
    expect(run('process.stdout.write(String(R.auroraDirOverride()));').stdout).toBe('null');
    const out = run(
      'process.stdout.write(JSON.stringify(R.auroraDirOverride()));',
      { AURORA_ROOT: resolve(suite, 'aurora') },
    );
    expect(JSON.parse(out.stdout)).toEqual({
      name: 'AURORA_ROOT',
      value: resolve(suite, 'aurora'),
    });
  });
});
