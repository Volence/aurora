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
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
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
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
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
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
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
  const derive = (subject = SUBJECT) => run(
    'process.stdout.write(R.siblingRoot() + "\\n" + R.siblingRootSource());', {}, subject,
  ).stdout.split('\n');

  it('names step 3 and the command it used', () => {
    const [, source] = derive();
    expect(source).toMatch(/^step 3: git rev-parse --git-common-dir/);
  });

  /**
   * A LINKED WORKTREE, BUILT BY THE ROW THAT NEEDS IT — because the property is
   * invisible anywhere else.
   *
   * `--git-common-dir` answers the MAIN checkout's `.git` from inside a linked
   * worktree, where `--show-toplevel` answers the worktree's own directory. In
   * the main checkout the two COINCIDE, so a row asserting the difference there
   * proves nothing, and a row that skips there is honest but never runs where
   * `npm test` normally runs: the one property step 3 exists for was measured
   * essentially nowhere. Empyrean `contract/SUITE_PATHS.md` (2026-09-02, from
   * this finding) now requires the shape of every resolver in the suite: *"The
   * step-3 proof runs from a linked worktree, or says in the run's own output
   * that it did not."*
   *
   * `--no-checkout` because the row needs git's PLUMBING (the `.git` file
   * pointing at the common dir), not aurora's twelve thousand files; the one
   * file it does need is COPIED IN from the working tree rather than checked out
   * of HEAD, so the row measures the subject as it is edited RIGHT NOW. A
   * checked-out HEAD copy would have gone green against the committed subject
   * while the working tree's was broken — which is precisely how this row was
   * planted red.
   *
   * The scratch directory is the OS temp dir, never `.claude/worktrees/`, which
   * something else manages.
   */
  interface LinkedWorktree { scratch: string; dir: string; subject: string }

  function addLinkedWorktree(repo: string): LinkedWorktree {
    const scratch = mkdtempSync(resolve(tmpdir(), 'aurora-step3-worktree-'));
    const dir = resolve(scratch, 'wt');
    try {
      execFileSync('git', ['worktree', 'add', '--no-checkout', '--detach', dir, 'HEAD'], {
        cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      rmSync(scratch, { recursive: true, force: true });
      throw e;
    }
    mkdirSync(resolve(dir, 'test/support'), { recursive: true });
    const subject = resolve(dir, 'test/support/sibling-root.mjs');
    cpSync(SUBJECT, subject);
    return { scratch, dir, subject };
  }

  /** In a `finally`, always: a failing assertion must not leak a worktree. */
  function removeLinkedWorktree(repo: string, wt: LinkedWorktree): void {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', wt.dir], { cwd: repo, stdio: 'ignore' });
    } catch {
      // Fall through to prune: the registration, not the directory, is the leak.
    }
    rmSync(wt.scratch, { recursive: true, force: true });
    try {
      execFileSync('git', ['worktree', 'prune'], { cwd: repo, stdio: 'ignore' });
    } catch {
      // Nothing to prune, or no git — the directory is gone either way.
    }
  }

  it('answers the MAIN checkout\'s parent, which is what --show-toplevel would get wrong', (ctx) => {
    // Parameterised so the skip path below is REACHABLE on demand: point this at
    // a directory that is not a git checkout and `git worktree add` fails
    // exactly as it would on a machine without git or on an exported tarball.
    const repo = process.env.AURORA_STEP3_REPO_FOR_TEST ?? resolve(__dirname, '../..');

    let wt: LinkedWorktree;
    try {
      wt = addLinkedWorktree(repo);
    } catch (e) {
      ctx.skip(
        'SKIPPED, NOT PASSED: could not build a linked worktree to measure from, so the '
        + 'property step 3 exists for — --git-common-dir answering where --show-toplevel '
        + `answers wrongly — was NOT measured by this run. \`git worktree add\` in ${repo} `
        + `failed: ${(e as Error).message}`,
      );
      return;
    }

    try {
      const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: wt.dir, encoding: 'utf8',
      }).trim();
      const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: wt.dir, encoding: 'utf8',
      }).trim();
      const viaCommon = dirname(dirname(common));

      // ANTI-VACUOUS, and the whole reason this row is worth its cost. If the
      // worktree were not actually LINKED, the two commands would agree, the
      // "wrong" branch would never be exercised, and the row would go green
      // having re-measured the main-checkout case. So prove they disagree HERE,
      // in the environment this row built, before believing anything it says.
      expect(
        dirname(toplevel),
        `the temporary worktree at ${wt.dir} is not behaving as a LINKED worktree: `
        + `dirname(--show-toplevel) = ${dirname(toplevel)} and dirname(dirname(--git-common-dir)) `
        + `= ${viaCommon} AGREE, so this row would measure the main-checkout case and prove `
        + 'nothing about step 3',
      ).not.toBe(viaCommon);

      const [derived, source] = derive(wt.subject);
      // The contract's "say which step answered", in the run's own output.
      // eslint-disable-next-line no-console
      console.log(
        `step 3 measured from a LINKED worktree ${wt.dir}\n`
        + `  --show-toplevel   → ${toplevel}  (dirname → ${dirname(toplevel)}, the WRONG answer)\n`
        + `  --git-common-dir  → ${common}  (dirname² → ${viaCommon}, the right one)\n`
        + `  subject answered  → ${derived}\n  ${source}`,
      );

      expect(
        derived,
        `the resolver, run from the linked worktree ${wt.dir}, should answer the MAIN checkout's `
        + `parent ${viaCommon} (via --git-common-dir), not ${dirname(toplevel)} (via --show-toplevel)`,
      ).toBe(viaCommon);
      expect(derived).not.toBe(dirname(toplevel));
    } finally {
      removeLinkedWorktree(repo, wt);
    }
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
      'AURORA_AEON_REPO,LIVE_AEON',
      'AURORA_ORACLE_REPO',
      'AURORA_S1DISASM_REPO,S1_DIR',
      'AURORA_PEER_ROOT',
    ]);
  });
});
