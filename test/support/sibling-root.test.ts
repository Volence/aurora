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
import {
  mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, existsSync, symlinkSync, realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

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
function run(body: string, env: Record<string, string> = {}, subject = SUBJECT, cwd = dirname(subject)): Run {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) {
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|AURORA_ROOT|AURORA_REPO|AURORA_BUILT_TREE|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
  }
  const src = `import * as R from ${JSON.stringify(subject)};\n${body}\n`;
  const r = execFileSync(process.execPath, ['--input-type=module', '-e', src], {
    env: { ...clean, ...env },
    encoding: 'utf8',
    cwd,
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
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|AURORA_ROOT|AURORA_REPO|AURORA_BUILT_TREE|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
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

describe('sibling-root: step 1: the explicit checkout variable', () => {
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

  it('THE CANONICAL NAME PRINTS NOTHING: the anti-vacuous half of the row above', () => {
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

describe('sibling-root: step 2: EMPYREAN_SUITE_ROOT joined with the repo name', () => {
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

  it('STILL OWES STEP 1: the contract amendment, as a row', () => {
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

describe('sibling-root: step 3: derivation from this repo, via --git-common-dir', () => {
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
        + 'property step 3 exists for (--git-common-dir answering where --show-toplevel '
        + `answers wrongly) was NOT measured by this run. \`git worktree add\` in ${repo} `
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

      const mainCheckout = dirname(common);
      const wrongRoot = dirname(toplevel);

      // THE PAIR THIS ROW EXISTS TO MEASURE, as two absolute paths rather than a
      // conclusion that they differ. Everything below is about these two lines.
      const pair = `    WRONG derivation  dirname(--show-toplevel)           = ${wrongRoot}\n`
        + `    RIGHT derivation  dirname(dirname(--git-common-dir)) = ${viaCommon}`;

      /**
       * NOT AN ASSERTION FAILURE — A REFUSAL, and the distinction is the point.
       *
       * A plain failing `expect` here reads as "the resolver is broken" and sends
       * the next reader to debug `sibling-root.mjs`. What these checks actually
       * detect is that THE BED cannot tell the two derivations apart, which sends
       * them somewhere else entirely: fix the bed. And a bed that silently stops
       * discriminating — the worktree lands somewhere new, a git version changes
       * a path shape, the temp root moves under it — would otherwise degrade to
       * exactly the vacuous green O68 exists to close, arriving through O68's own
       * fix. So it fails LOUDLY, named, rather than skipping or quietly passing.
       * (empyrean contract/SUITE_PATHS.md @ f17940b, sigil's stronger form.)
       */
      const unmeasurable = (why: string): never => {
        throw new Error(
          `UNMEASURABLE: this bed cannot discriminate, so it proves NOTHING about step 3. `
          + `FIX THE BED, NOT THE RESOLVER.\n${pair}\n    reason: ${why}`,
        );
      };

      // (1) The bed must be a LINKED worktree. If it is not, the two derivations
      // agree, the "wrong" branch is never exercised, and the row would go green
      // having re-measured the main-checkout case.
      if (wrongRoot === viaCommon) {
        unmeasurable(
          `the worktree at ${wt.dir} is not behaving as a linked worktree: the two derivations `
          + 'AGREE here, which is the main-checkout case wearing a worktree\'s name',
        );
      }

      // (2) "RUNS FROM A LINKED WORKTREE IS NECESSARY, NOT SUFFICIENT" (sigil,
      // from its shell-side bed). A linked worktree sitting BESIDE the suite root
      // lets `--show-toplevel` + `../<name>` land on the right peer by ACCIDENT,
      // so the bed passes while proving nothing. The contract's two arms: nest
      // the worktree inside the checkout, or put it where the sibling walk from
      // `--show-toplevel` demonstrably finds nothing.
      //
      // THIS BED TAKES THE SECOND ARM AND PROVES IT rather than enjoying it by
      // luck of the temp path: the scratch dir is a fresh `mkdtemp` holding only
      // `wt`, so the peer checkout that DOES exist under the right root is absent
      // under the wrong one. The name comes from `--git-common-dir`, never typed.
      //
      // (Nesting was considered and declined here: a worktree under `<repo>/`
      // gets swept by the test globs and by `scripts/check-peer-path-literals.mjs`,
      // which walks this tree.)
      if (!existsSync(mainCheckout)) {
        unmeasurable(`the main checkout ${mainCheckout} named by --git-common-dir does not exist`);
      }
      if (existsSync(resolve(wrongRoot, basename(mainCheckout)))) {
        unmeasurable(
          `the WRONG derivation would still find ${basename(mainCheckout)} beside it, at `
          + `${resolve(wrongRoot, basename(mainCheckout))}, so a resolver using --show-toplevel `
          + 'could land on the right peer by accident and this row could not tell',
        );
      }

      // THE WORKTREE'S OWN COPY of the resolver, not the main copy under a
      // different cwd: `sibling-root.mjs` anchors `AURORA_DIR` to its own module
      // file (`import.meta.url`) and passes THAT to git as `cwd`, so a bed that
      // merely chdir-ed into the worktree is PROVABLY INERT — git would run in
      // the main checkout and the row would pass under a worktree-shaped name
      // with nothing in the output to be suspicious of. Proven as its own row
      // below; `derive()` spawns a fresh process against the subject it is given.
      const [derived, source] = derive(wt.subject);

      // (3) PROVE WE WERE ACTUALLY STANDING IN IT. `siblingRootSource()` is a
      // stdout return value, recomputed per call (nothing in the subject memoises
      // the RESOLUTION — the only `Set` in it memoises the alias nag), and it
      // embeds the cwd git was handed:
      //   `step 3: git rev-parse --git-common-dir from <AURORA_DIR> → <common>`
      // A bed whose announce line names the main checkout has measured nothing,
      // so this is a bed refusal too, not a resolver assertion.
      const announce = /^step 3: git rev-parse --git-common-dir from (.*) → (.*)$/.exec(source ?? '');
      if (announce === null) {
        unmeasurable(`the resolver did not announce a step-3 derivation; it said ${JSON.stringify(source)}`);
      }
      if (announce![1] !== wt.dir) {
        unmeasurable(
          `the resolver announced \`${source}\`: it derived from ${announce![1]}, not from the `
          + `linked worktree ${wt.dir} this row built, so the measurement is of that tree instead. `
          + 'The bed must EXECUTE THE WORKTREE\'S OWN COPY of sibling-root.mjs',
        );
      }
      if (announce![2] !== common) {
        unmeasurable(`the resolver saw --git-common-dir = ${announce![2]}, this row saw ${common}`);
      }

      // The contract's "say which step answered", in the run's own output — the
      // measured PAIR, printed on every green run and not only on failure.
      // eslint-disable-next-line no-console
      console.log(
        `step 3 measured from a LINKED worktree, built by this row at ${wt.dir}\n${pair}\n`
        + `    resolver answered → ${derived}\n    ${source}`,
      );

      // ONLY NOW is a failure the RESOLVER's fault: the bed has proved it is
      // standing somewhere the wrong method is wrong, and that it measured there.
      expect(
        derived,
        `the resolver, run from the linked worktree ${wt.dir}, answered ${derived}. It should be `
        + `the MAIN checkout's parent (via --git-common-dir), not the worktree's (via `
        + `--show-toplevel):\n${pair}`,
      ).toBe(viaCommon);
      expect(derived).not.toBe(wrongRoot);
    } finally {
      removeLinkedWorktree(repo, wt);
    }
  });

  /**
   * THE PIN, AS A ROW — why the bed above copies the subject instead of chdir-ing.
   *
   * `AURORA_DIR` is, with nothing set, `resolve(dirname(fileURLToPath(import.meta.url)), '../..')`
   * — the MODULE'S OWN FILE, not the process cwd — and step 3 hands exactly that
   * to git as `cwd`. So the process cwd is inert: a bed that builds a linked
   * worktree and only changes directory into it measures the main checkout,
   * passes, and proves nothing. That claim is load-bearing for the row above and
   * for the other suite lanes writing the same shape, so it is measured here
   * rather than asserted in a comment.
   *
   * The cwd used is a `mkdtemp` OUTSIDE ANY REPOSITORY: if the subject consulted
   * the process cwd at all, git would find no repo there and step 3 would fail
   * over to step 4, so this row would go red loudly rather than subtly.
   */
  it('pins git\'s cwd to its OWN module location, so the process cwd cannot steer it', () => {
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'aurora-step3-cwd-'));
    try {
      const body = 'process.stdout.write(String(R.siblingRoot()) + "\\n" + R.siblingRootSource() + "\\n" + R.AURORA_DIR);';
      const home = run(body).stdout.split('\n');
      const away = run(body, {}, SUBJECT, elsewhere).stdout.split('\n');

      expect(away[2], 'AURORA_DIR is the module\'s own location and must not move with the cwd').toBe(home[2]);
      expect(away[2]).toBe(resolve(__dirname, '../..'));
      expect(
        away[1],
        `run with cwd=${elsewhere} (outside any repository) the resolver announced \`${away[1]}\`; `
        + `it should be identical to the announce from its own directory, \`${home[1]}\`, because `
        + 'step 3 passes AURORA_DIR as git\'s cwd rather than inheriting the process cwd',
      ).toBe(home[1]);
      expect(away[1]).toContain(`from ${resolve(__dirname, '../..')}`);
      expect(away[0]).toBe(home[0]);
      expect(away[0]).not.toBe('null');
    } finally {
      // In a `finally` for the same reason the worktree above is: this row is
      // planted red on purpose, and the FAILING run is the one that leaks. Found
      // exactly that way — the plant left `/tmp/aurora-step3-cwd-*` behind
      // because this `rmSync` used to sit after the assertions.
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  /**
   * ─────────── THE MAIN-CHECKOUT TWIN, AND WHY IT IS A SEPARATE BED ───────────
   *
   * The rows above measure step 3 from a LINKED WORKTREE, because that is the
   * only place `--git-common-dir` and `--show-toplevel` disagree. Those rows are
   * necessary and they are also a DISJOINT POPULATION from where this suite
   * normally runs: `git rev-parse --git-common-dir` has THREE output shapes, not
   * two, and the worktree bed exercises exactly one of them.
   *
   *   from a linked worktree            → an ABSOLUTE path, whether asked or not
   *   from a main checkout's ROOT       → `.git`
   *   from a main checkout SUBDIRECTORY → `../../.git` (relative, with `..`)
   *
   * Measured here on git 2.55.0, by the rows below, on a repository they build.
   *
   * Only the first shape is absolute for free. A resolver that consumes the other
   * two as if they were absolute is WRONG IN THE MAIN CHECKOUT ONLY — and green
   * on every branch sweep, because agents run in worktrees. A sibling lane in
   * this suite shipped exactly that observable and its merged tree went red:
   * *(the mechanism there was resolving git's relative answer against the process
   * cwd rather than against the directory git ran in; the mutation this file is
   * planted against — dropping `--path-format=absolute` — is a DIFFERENT
   * mechanism that produces the same class of observable.)* Empyrean
   * `contract/SUITE_PATHS.md` (2026-09-02) ruled the shape for every lane: *"the
   * row exercises the constructed bed for the disagreement AND the real main
   * checkout for the shape production actually uses … a lane whose step-3 row is
   * a bed and nothing else has an untested production path invisible in a green
   * run."*
   *
   * WHY THE BED IS A SCRATCH `git init` AND NOT THIS REPOSITORY. "The real main
   * checkout" is the shape to cover; using the real tree as the BED is not the
   * way to cover it, for two independent reasons.
   *
   *   1. It cannot be reached from here. These rows run in a linked worktree
   *      about half the time (every agent session), where the real tree is not
   *      the configuration under test at all.
   *   2. Fatally, its expected suite root is THE ANSWER A RESOLVER THAT IGNORED
   *      THE BED ENTIRELY WOULD GIVE. A row whose expectation is satisfied by
   *      measuring something else is the inert bed this file has been burned by
   *      twice, and it would pass while proving nothing.
   *
   * So the bed is a repository this row creates, at a path no other run has, and
   * the subject is COPIED INTO IT — because `sibling-root.mjs` anchors
   * `AURORA_DIR` to its own module file and hands THAT to git as `cwd`, so the
   * subject's own location IS the bed and a bed that merely chdir-ed would be
   * provably inert (proven as its own row, above). The expected suite root is
   * therefore a `mkdtemp` path that ONLY this bed can produce, and the row
   * asserts it is not the answer the real tree gives — so "the resolver ignored
   * the bed" is RED here, not green.
   */
  interface MainCheckoutBed {
    /** The `mkdtemp` root, removed in a `finally`. Holds everything below. */
    scratch: string;
    /** `<scratch>/suite` — the suite root the derivation must arrive at. */
    suite: string;
    /** `<suite>/aurora` — the main checkout, a real `git init`. */
    repo: string;
    /** The directory the subject copy makes `AURORA_DIR`, i.e. git's cwd. */
    anchor: string;
    /** The copied resolver, at `<anchor>/test/support/sibling-root.mjs`. */
    subject: string;
  }

  /**
   * A main checkout whose `.git` is a real one, with the subject `nest` levels
   * below its root.
   *
   * `nest` is what selects the git output shape: `[]` puts the subject's anchor
   * AT the repository root (`.git`), and two segments put it two levels down
   * (`../../.git`) — the shape a resolver anchored in a package or crate
   * subdirectory sees. No commit is made: `--git-common-dir` answers in an empty
   * repository, and a commit would need a configured identity.
   *
   * `realpathSync` on the `mkdtemp` result because the subject reports the path
   * Node resolved its module through; on a machine where the temp root is a
   * symlink an unresolved path would make the announce comparison below refuse a
   * bed that is actually fine.
   */
  function makeMainCheckout(nest: string[]): MainCheckoutBed {
    const scratch = realpathSync(mkdtempSync(resolve(tmpdir(), 'aurora-step3-main-')));
    const suite = resolve(scratch, 'suite');
    const repo = resolve(suite, 'aurora');
    const anchor = resolve(repo, ...nest);
    const subject = resolve(anchor, 'test/support/sibling-root.mjs');
    mkdirSync(dirname(subject), { recursive: true });
    execFileSync('git', ['init', '-q', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    cpSync(SUBJECT, subject);
    return { scratch, suite, repo, anchor, subject };
  }

  /**
   * The body of both rows below: prove the bed discriminates, prove the resolver
   * stood in it, then — and only then — assert the derived suite root.
   *
   * `expectedRaw` is the git output shape this bed is supposed to produce. It is
   * checked rather than assumed: a bed that stopped producing it has stopped
   * being the configuration the row names, and that is a bed failure, not a
   * resolver failure. The DERIVED EXPECTATION is never `expectedRaw` — it is
   * `dirname(dirname(<absolute --git-common-dir>))` read out of the bed.
   */
  function proveStep3FromMainCheckout(bed: MainCheckoutBed, expectedRaw: string, label: string): void {
    const git = (args: string[]): string => execFileSync('git', args, {
      cwd: bed.anchor, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    // What git says when it is not asked for a format — the shape a resolver
    // that dropped `--path-format=absolute` would be handed.
    const raw = git(['rev-parse', '--git-common-dir']);
    // …and when it is. This is the operand the subject's derivation runs on.
    const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);

    // THE EXPECTATION, DERIVED FROM THE BED. `sibling-root.mjs` computes the
    // suite root as `dirname(dirname(common))` — a purely LEXICAL operation on
    // whatever string git returned, with no `resolve()` and no join against
    // `AURORA_DIR` anywhere. So the same two `dirname`s over git's DEFAULT
    // output is exactly what a flag-less resolver would answer, and both are
    // computed here rather than typed.
    const expected = dirname(dirname(common));
    const withoutTheFlag = dirname(dirname(raw));

    // What a resolver that never left the real tree would say — MEASURED by
    // running the real subject from its real location, not typed. This is the
    // control for "could this row pass with the resolver ignoring the bed?".
    const ignoringTheBed = derive()[0];

    const facts = `    bed anchor, which is git's cwd and the subject's AURORA_DIR = ${bed.anchor}\n`
      + `    git rev-parse --git-common-dir                              = ${JSON.stringify(raw)}\n`
      + `    …--path-format=absolute --git-common-dir                    = ${common}\n`
      + `    RIGHT derivation dirname(dirname(absolute))                 = ${expected}\n`
      + `    same derivation on git's DEFAULT output                     = ${JSON.stringify(withoutTheFlag)}\n`
      + `    what the resolver answers from the REAL tree, ignoring this bed = ${ignoringTheBed}`;

    /**
     * NOT AN ASSERTION FAILURE — A REFUSAL, for the reason spelled out at the
     * linked-worktree row above: these detect that THE BED cannot discriminate,
     * which sends the reader to fix the bed rather than the resolver, and a bed
     * that silently stopped discriminating would otherwise decay into exactly
     * the vacuous green this whole file exists to close.
     */
    const unmeasurable = (why: string): never => {
      throw new Error(
        'UNMEASURABLE: this bed cannot discriminate, so it proves NOTHING about step 3 from '
        + `${label}. FIX THE BED, NOT THE RESOLVER.\n${facts}\n    reason: ${why}`,
      );
    };

    // (1) IT MUST BE A MAIN CHECKOUT. From a linked worktree git answers
    // `--git-common-dir` absolutely whether or not it is asked to, so an
    // absolute default answer here means this bed is the WORKTREE case wearing a
    // main checkout's name — already covered above, and blind to precisely the
    // defect these rows exist for.
    if (isAbsolute(raw)) {
      unmeasurable(
        `git answers ${JSON.stringify(raw)} (already absolute) at ${bed.anchor}, so this bed is `
        + 'not a main checkout and re-measures the linked-worktree case',
      );
    }

    // (2) …AND THE ONE WHOSE SHAPE THIS ROW NAMES. The two rows differ only in
    // where the subject sits, and that difference is the whole point of there
    // being two, so a bed that produced the other shape would silently make them
    // one row run twice.
    if (raw !== expectedRaw) {
      unmeasurable(
        `${label} should make git answer ${JSON.stringify(expectedRaw)}; it answered `
        + `${JSON.stringify(raw)}, so this bed is not the configuration this row names`,
      );
    }

    // (3) THE FLAG MUST MATTER HERE. If both derivations agreed, the row would
    // go green against a resolver that never asked git for an absolute answer,
    // and would be blind to the whole failure class.
    if (withoutTheFlag === expected) {
      unmeasurable(
        'the derivation gives the same answer with and without --path-format=absolute at this '
        + 'bed, so a resolver that never asked for an absolute path would pass here',
      );
    }

    // (4) THE EXPECTATION MUST BE UNREACHABLE WITHOUT THE BED. This is the
    // question in its sharpest form: if the bed's suite root happened to be what
    // the real tree derives, a resolver that ignored the bed entirely would
    // satisfy the assertion below and the row would prove nothing.
    if (expected === ignoringTheBed) {
      unmeasurable(
        `the suite root this bed implies (${expected}) is the same one the resolver derives from `
        + 'the real tree, so a resolver that ignored this bed would pass the assertion below',
      );
    }

    // (5) PROVE THE RESOLVER ACTUALLY STOOD HERE. The returned step-source —
    // recomputed per call, on stdout, embedding the cwd git was handed — is the
    // only artifact that distinguishes "measured in the bed" from "measured
    // somewhere else and correct by accident".
    const [derived, source] = derive(bed.subject);
    const announce = /^step 3: git rev-parse --git-common-dir from (.*) → (.*)$/.exec(source ?? '');
    if (announce === null) {
      unmeasurable(`the resolver did not announce a step-3 derivation; it said ${JSON.stringify(source)}`);
    }
    if (announce![1] !== bed.anchor) {
      unmeasurable(
        `the resolver announced \`${source}\`: it derived from ${announce![1]}, not from the main `
        + `checkout ${bed.anchor} this row built, so it measured that tree instead`,
      );
    }

    // The contract's "say which step answered", in the run's own output, on
    // every green run and not only on failure.
    // eslint-disable-next-line no-console
    console.log(
      `step 3 measured from ${label}, built by this row at ${bed.repo}\n${facts}\n`
      + `    resolver answered → ${derived}\n    ${source}`,
    );

    // ONLY NOW is a failure the RESOLVER's fault.
    expect(
      derived,
      `the resolver, run from ${label} at ${bed.anchor}, answered ${derived}. It should be the `
      + `directory holding that checkout, derived from --git-common-dir:\n${facts}`,
    ).toBe(expected);
    // The two named ways to be wrong, asserted rather than implied by the line
    // above, so a failure says WHICH failure it is.
    expect(
      derived,
      'this is the answer a resolver that consumed git\'s default (relative) output would give',
    ).not.toBe(withoutTheFlag);
    expect(
      derived,
      'this is the answer a resolver that ignored the bed and measured the real tree would give',
    ).not.toBe(ignoringTheBed);
  }

  it('derives the suite root from a MAIN CHECKOUT ROOT, where git answers `.git`', (ctx) => {
    let bed: MainCheckoutBed;
    try {
      bed = makeMainCheckout([]);
    } catch (e) {
      ctx.skip(
        'SKIPPED, NOT PASSED: could not build a scratch main checkout to measure from, so the '
        + 'configuration production actually runs in (a main-checkout root, where '
        + '`git rev-parse --git-common-dir` answers the relative `.git`) was NOT measured by this '
        + `run. \`git init\` failed: ${(e as Error).message}`,
      );
      return;
    }
    try {
      proveStep3FromMainCheckout(bed, '.git', 'a main-checkout ROOT');
    } finally {
      rmSync(bed.scratch, { recursive: true, force: true });
    }
  });

  it('derives it from a MAIN-CHECKOUT SUBDIRECTORY, where git answers `../../.git`', (ctx) => {
    // Two levels down: the shape a resolver anchored in a package or crate
    // subdirectory is handed, and the one a lexical trim of git's answer walks
    // up past. Aurora's own anchor is the checkout root, so this is not this
    // repo's production shape — it is the shape the derivation must survive if
    // `sibling-root.mjs` ever moves, and the shape that broke a sibling lane.
    let bed: MainCheckoutBed;
    try {
      bed = makeMainCheckout(['packages', 'editor']);
    } catch (e) {
      ctx.skip(
        'SKIPPED, NOT PASSED: could not build a scratch main checkout to measure from, so the '
        + 'third git output shape (`../../.git`, relative WITH `..`, from a subdirectory of a '
        + `main checkout) was NOT measured by this run. \`git init\` failed: ${(e as Error).message}`,
      );
      return;
    }
    try {
      proveStep3FromMainCheckout(bed, '../../.git', 'a main-checkout SUBDIRECTORY two levels down');
    } finally {
      rmSync(bed.scratch, { recursive: true, force: true });
    }
  });

  /**
   * ─────────── AND THE CHECKOUT THIS SUITE ACTUALLY RUNS IN ───────────
   *
   * The two rows above prove the derivation in a repository they BUILT. This one
   * proves it in the repository the code is checked out as, and the difference is
   * the whole reason the contract asks for both: *"a lane whose step-3 row is a
   * bed and nothing else has an untested production path invisible in a green
   * run … a derivation verified where it could be constructed says nothing about
   * where it runs."* (empyrean `contract/SUITE_PATHS.md`.)
   *
   * ⚠ THIS ROW DOES NOT DISCRIMINATE A BED-IGNORING RESOLVER, AND SAYING SO IS
   * PART OF ITS JOB. Its expectation is the real tree's own suite root, which is
   * exactly the answer a resolver that ignored every bed would give — so unlike
   * the two rows above, it cannot tell "measured here" from "measured somewhere
   * else and right by luck". That is not a defect to fix here and it is not a
   * reason to delete the row; it is a NARROWER row on an axis the constructed
   * beds cannot reach. The two properties are covered by different rows on
   * purpose:
   *
   *   bed-ignoring resolver  → caught by the constructed rows above, whose
   *                            expectation is a `mkdtemp` path no other run has
   *   the FLAG defect        → caught HERE as well, and here it is the
   *                            PRODUCTION path: from a main-checkout root
   *                            without `--path-format=absolute`, the derivation
   *                            yields `"."` rather than the suite root
   *
   * The repo's bar is to say which rows do not discriminate rather than let a
   * reader assume every green one was earned.
   *
   * WHY IT MAY SKIP, AND WHY THAT IS NOT A PASS. Agent sessions run in a linked
   * worktree, where this configuration does not exist to be measured — which is
   * precisely the disjoint population this parcel is about, arriving one level
   * up. There is nothing to assert there, so it says so in the run's own output
   * and contributes zero, exactly as the contract requires: *"the skip prints its
   * reason in the run's output, since a green log and an absent run are the same
   * artifact."* Whether the production configuration was measured is then
   * readable from the run rather than assumed from its colour.
   *
   * THE DETECTOR IS THE SAME ONE THE BED REFUSALS USE — a RELATIVE answer from
   * `git rev-parse --git-common-dir` means a main checkout, an absolute one means
   * a linked worktree — deliberately, so there are not two ways of asking the
   * same question that could drift apart.
   */
  it('and THIS checkout, when it is a main one: the configuration production runs in', (ctx) => {
    // The subject's own anchor, read back from the subject rather than
    // recomputed here: it is what step 3 hands git as `cwd`, so it is the only
    // directory whose git output shape says anything about this run.
    const anchor = run('process.stdout.write(R.AURORA_DIR);').stdout;

    let raw: string;
    try {
      raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
        cwd: anchor, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch (e) {
      ctx.skip(
        'SKIPPED, NOT PASSED: this checkout is not a git repository at all, so step 3 could not be '
        + `measured in the configuration production runs in. \`git rev-parse\` in ${anchor} failed: `
        + `${(e as Error).message}`,
      );
      return;
    }

    if (isAbsolute(raw)) {
      ctx.skip(
        'SKIPPED, NOT PASSED: step 3 was NOT measured in this repo\'s real MAIN CHECKOUT by this '
        + `run: the production configuration. This run is standing in a LINKED WORKTREE (${anchor}), `
        + `where \`git rev-parse --git-common-dir\` answers the absolute ${raw} whether it is asked to `
        + 'or not, so the relative output shape production consumes does not exist here to be '
        + 'measured. The two rows above measured that shape on a repository they built; this row is '
        + 'the one that would have measured it where the code actually lives, and it measured '
        + 'nothing. Run the suite from the main checkout to close this.',
      );
      return;
    }

    // A main checkout. Everything below is measured LIVE from this tree in this
    // run — nothing typed, and no path from any developer's machine.
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: anchor, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const expected = dirname(dirname(common));
    // What the same lexical derivation gives on git's DEFAULT output — the
    // production answer if `--path-format=absolute` were ever dropped.
    const withoutTheFlag = dirname(dirname(raw));

    const [derived, source] = derive();

    // eslint-disable-next-line no-console
    console.log(
      `step 3 measured in THIS repo's REAL MAIN CHECKOUT: the production configuration\n`
      + `    anchor, which is git's cwd and the subject's AURORA_DIR = ${anchor}\n`
      + `    git rev-parse --git-common-dir                          = ${JSON.stringify(raw)}\n`
      + `    …--path-format=absolute --git-common-dir                = ${common}\n`
      + `    RIGHT derivation dirname(dirname(absolute))             = ${expected}\n`
      + `    same derivation on git's DEFAULT output                 = ${JSON.stringify(withoutTheFlag)}\n`
      + `    resolver answered → ${derived}\n    ${source}\n`
      + '    (this row does NOT discriminate a bed-ignoring resolver: see its header)',
    );

    expect(
      derived,
      `run in this repo's own main checkout at ${anchor}, the resolver answered ${derived}; the `
      + `directory holding this checkout, derived from --git-common-dir, is ${expected}`,
    ).toBe(expected);
    expect(
      derived,
      'this is the answer a resolver consuming git\'s default (relative) output would give HERE, in '
      + 'the configuration production runs in',
    ).not.toBe(withoutTheFlag);
    // The step-source names the anchor, so a reader of the log can tell which
    // tree this row's green is about.
    expect(source).toContain(`from ${anchor}`);
  });
});

describe('sibling-root: step 4: refuse, naming what was looked for and where', () => {
  /**
   * Forced by COPYING the subject outside any git repository: the derivation is
   * anchored to the module's own location, so a copy at `<tmp>/test/support/`
   * makes `AURORA_DIR` a tmpdir, where `git rev-parse` finds nothing.
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

  it('spells THIS repo\'s own checkout variable, its aliases, and the built-tree name', () => {
    const out = run(
      'process.stdout.write([R.AURORA_DIR_ENV, R.AURORA_DIR_ENV_ALIASES.join(","), '
      + 'R.AURORA_BUILT_TREE_ENV].join("\\n"));',
    );
    expect(out.stdout.split('\n')).toEqual(['AURORA_DIR', 'AURORA_ROOT,AURORA_REPO', 'AURORA_BUILT_TREE']);
  });

  /**
   * THE GATE'S LIST IS THIS LIST — asserted here because the gate cannot assert it.
   *
   * `check-peer-path-literals.mjs` rule 3 imports `OWNED_ENV` whole rather than
   * reassembling it, precisely so that a variable added to the resolver under a
   * NEW constant is policed without anyone editing the gate. That property is
   * only real if `OWNED_ENV` actually contains every name the resolver reads, so
   * the row checks membership rather than a typed list: the canonical names, the
   * announced aliases, and the new built-tree name, each taken from the
   * resolver's own exports so a rename moves both sides together.
   */
  it('OWNED_ENV (what the gate polices) holds every name this module reads', () => {
    const out = run(
      'const missing = [R.SUITE_ROOT_ENV, ...R.SUITE_ROOT_ENV_ALIASES, R.AURORA_DIR_ENV, '
      + '...R.AURORA_DIR_ENV_ALIASES, R.AURORA_BUILT_TREE_ENV, '
      + '...R.SUITE_PEERS.flatMap((n) => [R.checkoutEnv(n), ...R.checkoutEnvAliases(n)])]'
      + '.filter((n) => !R.OWNED_ENV.includes(n));\n'
      + 'process.stdout.write(missing.join(",") + "\\n" + R.OWNED_ENV.length);',
    );
    const [missing, count] = out.stdout.split('\n');
    expect(missing, 'names the resolver reads that rule 3 would not police').toBe('');
    expect(Number(count)).toBeGreaterThan(10);
  });
});

/**
 * AURORA_DIR — OBSERVED, NOT RESOLVED, and `AURORA_DIR` the VARIABLE is a
 * consistency check over that observation rather than an override.
 *
 * Before O69 "which aurora tree am I" was answered by hand in 93 files: 64 read
 * `process.env.AURORA_ROOT` (not the contract's spelling) and 29 more wrote the
 * derivation with no override at all, so pointing a run at another tree moved
 * two thirds of them and silently failed to move the rest. O69 gave them one
 * derivation and gave `AURORA_DIR` a step-1 OVERRIDE, so
 * `AURORA_DIR=/elsewhere npm test` relocated the repo under test in silence.
 * The hub ruled that half out (empyrean `contract/SUITE_PATHS.md` @ fba68d5, "A
 * resolver's OWN checkout is observed, not resolved"), and these rows are that
 * ruling:
 *
 *     "Own checkout = the module's own location … never cwd and never
 *      `--show-toplevel`. Its step-source says so (`own`) … `<OWN>_DIR`, if set,
 *      is a consistency check, not an override: set-and-agreeing is fine,
 *      set-but-wrong throws."
 *
 * Every expectation below is COMPOSED from `SUBJECT` — the path this file
 * already had to know to import the subject — or read back from the subject's
 * OWN export, or from a `mkdtemp` directory created moments earlier. Nothing
 * here is a path typed by hand, so no row can pass by naming a string that
 * happens to be right on one machine.
 */
describe('sibling-root: AURORA_DIR: this repo\'s own checkout, OBSERVED', () => {
  /**
   * The tree the subject lives in, derived from the path used to import it:
   * `<tree>/test/support/sibling-root.mjs` → three levels up from the FILE.
   */
  const SUBJECT_TREE = resolve(SUBJECT, '../../..');

  /**
   * …and the same fact read back out of the SUBJECT'S OWN EXPORT, in a clean
   * child, for the rows that must hand the subject a value it will AGREE with.
   *
   * Typing `SUBJECT_TREE` into those rows would work today and would keep
   * working if the subject and this file ever became wrong about the tree in the
   * same way. The check under test is a comparison against exactly this value,
   * so this is the operand to feed it.
   */
  const observed = (): string => run('process.stdout.write(R.AURORA_DIR);').stdout;

  it('unset → the source says `own` and names this module\'s FILE, not a precedence step', () => {
    const out = run('process.stdout.write(R.AURORA_DIR + "\\n" + R.auroraDirSource());');
    const [dir, source] = out.stdout.split('\n');
    expect(dir).toBe(SUBJECT_TREE);
    expect(source).toMatch(/^own: this module's own location \(/);
    expect(source).toContain(SUBJECT);
    // The own checkout is not on the four-step ladder at all — the ladder names
    // ANOTHER tool's checkout. A source claiming a step number is the O69 shape.
    expect(source, 'the own checkout has no precedence step').not.toMatch(/step [1-4]/);
  });

  /**
   * ─────────── THE CONSISTENCY CHECK, BOTH DIRECTIONS ───────────
   *
   * These two rows are a pair and neither means anything alone. The first shows
   * the refusal firing on a real disagreement; the second is the ANTI-VACUOUS
   * half — a subject that threw on any `AURORA_DIR` at all, or that failed to
   * start for an unrelated reason, would pass the first and fail the second.
   *
   * THE ALTERNATIVE GREEN PATH, RULED OUT: the first row could have gone red for
   * a reason other than the rule holding — `pickEnv`'s two-spellings-DISAGREE
   * refusal, which also throws `SuitePathError` and also names a variable. So it
   * sets exactly ONE spelling, and asserts the consistency check's own sentence
   * rather than merely a non-zero exit. (`DISAGREE` is the other message's word
   * and appears in neither of these two.)
   */
  it('SET AND DISAGREEING is REFUSED: it is a consistency check, not an override', () => {
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'aurora-not-this-tree-'));
    const out = runExpectingFailure(
      'process.stdout.write(R.AURORA_DIR);', { AURORA_DIR: elsewhere },
    );
    expect(out.status, `expected a non-zero exit; got ${out.status} with stdout ${out.stdout}`).not.toBe(0);
    expect(out.stderr).toContain('SuitePathError');
    expect(out.stderr).toContain(`AURORA_DIR=${elsewhere}`);
    expect(out.stderr).toContain('does not agree with where this module actually is');
    expect(out.stderr).toContain('CONSISTENCY CHECK');
    expect(out.stderr).toContain('NOT an override');
    // It names the module file it observed, and the answer it observed, so the
    // operator can see which of the two is the one they did not expect.
    expect(out.stderr).toContain(SUBJECT);
    expect(out.stderr).toContain(SUBJECT_TREE);
    // …and it names the variable that DOES answer "run against the tree over
    // there", with the value they typed, because that is usually what they meant.
    expect(out.stderr).toContain(`AURORA_BUILT_TREE=${elsewhere}`);
    // A refusal that had already printed the wrong tree would be no refusal.
    expect(out.stdout).toBe('');
    // Not the OTHER refusal: only one spelling was set here.
    expect(out.stderr).not.toContain('DISAGREE');
  });

  it('SET AND AGREEING is accepted, silent, and moves nothing: the anti-vacuous half', () => {
    const here = observed();
    const out = runBoth(
      'process.stdout.write(R.AURORA_DIR + "\\n" + R.auroraDirSource());',
      { AURORA_DIR: here },
    );
    const [dir, source] = out.stdout.split('\n');
    expect(dir).toBe(here);
    expect(dir).toBe(SUBJECT_TREE);
    // Still `own`. The variable agreed with the observation; it did not become it.
    expect(source).toMatch(/^own: this module's own location \(/);
    // The source distinguishes "checked and agreed" from "nothing was set", so a
    // reader of a log can tell which run had the claim made about it.
    expect(source).toContain(`AURORA_DIR=${here} agrees`);
    expect(source).toContain('a consistency check, not an override');
    // THE CANONICAL NAME PRINTS NOTHING — announcing it would train the reader
    // to ignore the alias line.
    expect(out.stderr, `stderr was:\n${out.stderr}`).toBe('');
  });

  /**
   * A SECOND SPELLING OF THE SAME DIRECTORY IS AGREEMENT, not disagreement.
   *
   * `/tmp` is a symlink on some machines and `.claude/worktrees/` is reached
   * through one on this one, so an operator who exports a path that resolves to
   * the same directory has agreed and must not be refused — a check that
   * compared strings would fire on a correct environment, which is how a
   * consistency check turns into a thing people unset.
   *
   * THE BED IS BUILT, not hoped for: the row makes its own symlink, so it is
   * discriminating on any machine rather than only on one where `/tmp` happens
   * to be linked. It is also red against the OLD subject for a second reason —
   * an override would have answered with the LINK path, not the real one.
   */
  it('a symlinked spelling of the same directory AGREES, and does not become the answer', () => {
    const here = observed();
    const scratch = mkdtempSync(resolve(tmpdir(), 'aurora-symlinked-'));
    const link = resolve(scratch, 'aurora-by-another-name');
    try {
      symlinkSync(here, link, 'dir');
      expect(link).not.toBe(here);
      const out = runBoth('process.stdout.write(R.AURORA_DIR);', { AURORA_DIR: link });
      expect(out.stdout, 'the observation is the answer; the variable only agreed with it').toBe(here);
      expect(out.stderr).toBe('');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('AURORA_ROOT, the alias, is announced ONCE and CHECKED the same way', () => {
    const here = observed();
    const out = runBoth(
      'R.auroraDirSource(); R.auroraDirSource(); process.stdout.write(R.AURORA_DIR);',
      { AURORA_ROOT: here },
    );
    expect(out.stdout).toBe(here);
    const lines = out.stderr.trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      'suite-paths: AURORA_ROOT is a transitional alias; set AURORA_DIR instead '
      + '(empyrean contract/SUITE_PATHS.md)',
    );
  });

  it('AURORA_ROOT pointed at ANOTHER tree is refused, not obeyed: the migration is not a loophole', () => {
    const elsewhere = mkdtempSync(resolve(tmpdir(), 'aurora-not-this-tree-'));
    const out = runExpectingFailure('process.stdout.write(R.AURORA_DIR);', { AURORA_ROOT: elsewhere });
    expect(out.status).not.toBe(0);
    expect(out.stderr).toContain(`AURORA_ROOT=${elsewhere}`);
    expect(out.stderr).toContain('does not agree with where this module actually is');
    // The nag still nags: the spelling is still transitional, and an operator
    // fixing the value should not then be surprised by the rename.
    expect(out.stderr).toContain('AURORA_ROOT is a transitional alias');
    expect(out.stdout).toBe('');
  });

  it('AURORA_REPO, the third spelling, is announced the same way', () => {
    const here = observed();
    const out = runBoth('process.stdout.write(R.AURORA_DIR);', { AURORA_REPO: here });
    expect(out.stdout).toBe(here);
    expect(out.stderr).toContain('AURORA_REPO is a transitional alias; set AURORA_DIR instead');
  });

  it('the canonical name and an alias that DISAGREE are refused BEFORE either is checked', () => {
    const suite = makeFakeSuite();
    const out = runExpectingFailure('process.stdout.write(R.AURORA_DIR);', {
      AURORA_DIR: resolve(suite, 'aurora'),
      AURORA_ROOT: resolve(suite, 'aeon'),
    });
    expect(out.status).not.toBe(0);
    // Two answers to one question is a wrong environment, and that is the
    // complaint the operator needs — not "neither of them is this tree".
    expect(out.stderr).toContain('DISAGREE');
    expect(out.stderr).toContain(`AURORA_DIR=${resolve(suite, 'aurora')}`);
    expect(out.stderr).toContain(`AURORA_ROOT=${resolve(suite, 'aeon')}`);
  });

  /**
   * THE DELIBERATE GAP, asserted rather than described.
   *
   * `EMPYREAN_SUITE_ROOT=$(mktemp -d) npm test` is this repo's documented recipe
   * for "a machine with no REFERENCE trees". If the suite root also answered for
   * aurora ITSELF, that recipe would relocate the repo under test and every
   * instrument would stop finding its own `dist/` and `src/` — a run meant to
   * prove the peer-dependent half skips honestly would die of unrelated absence
   * instead. The contract names this one too: *"`EMPYREAN_SUITE_ROOT` never
   * relocates the resolver's own checkout."*
   *
   * The second half of this row is what stops it being vacuous: the SAME child
   * process, the SAME variable, moving a PEER. Without it, a subject that
   * ignored `EMPYREAN_SUITE_ROOT` entirely would pass. (The contract asks for
   * exactly this shape, and calls it aurora's.)
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
});

/**
 * AURORA_BUILT_TREE — the OTHER question, which is why the one above can refuse.
 *
 * "Where do I live" and "which built tree do I RUN AGAINST" are different
 * questions that wore one variable until O70. The second is real: a linked
 * worktree shares no `node_modules` and no `dist/` with the checkout it was cut
 * from, so `scratchpad/mapviewport-baseline-harness.mjs` walks up until it finds
 * a tree that is actually runnable and announces `borrowed` when that is not the
 * tree the script lives in. Pinning that tree is legitimate; relocating the repo
 * is not.
 *
 * The name follows the contract's existing shape for a variable that names
 * artifacts rather than a checkout (oracle's `ORACLE_AEON_DIR`), and
 * deliberately does not end in `_DIR`: `<TOOL>_DIR` is the ratified CHECKOUT
 * spelling, and one token away from `AURORA_DIR` is where the two questions
 * fused in the first place.
 */
describe('sibling-root: AURORA_BUILT_TREE: which built tree a run executes against', () => {
  it('is null when nothing is set, so a caller can walk up and find one itself', () => {
    expect(run('process.stdout.write(String(R.auroraBuiltTree()));').stdout).toBe('null');
  });

  /**
   * ONE CHILD, BOTH HALVES — the shape the contract asks of the suite-root row,
   * applied to the variable this parcel adds.
   *
   * Half one: it names the tree, so it is an override and not decoration. Half
   * two: it does NOT move `AURORA_DIR`, which is the whole reason it exists as a
   * separate name. Without half two a subject that quietly aliased the two —
   * the O69 shape, one rename later — would pass.
   */
  it('names the built tree AND does not move AURORA_DIR', () => {
    const built = mkdtempSync(resolve(tmpdir(), 'aurora-built-tree-'));
    const out = runBoth(
      'process.stdout.write(JSON.stringify(R.auroraBuiltTree()) + "\\n" + R.AURORA_DIR '
      + '+ "\\n" + R.auroraDirSource());',
      { AURORA_BUILT_TREE: built },
    );
    const [json, dir, source] = out.stdout.split('\n');
    expect(JSON.parse(json)).toEqual({ name: 'AURORA_BUILT_TREE', value: built });
    expect(dir).toBe(resolve(SUBJECT, '../../..'));
    expect(dir).not.toBe(built);
    // It is not a checkout variable, so it does not trip the own-checkout check
    // and it is not a transitional alias of anything: nothing is announced.
    expect(source).toContain('own: this module\'s own location');
    expect(source).not.toContain('agrees');
    expect(out.stderr, `stderr was:\n${out.stderr}`).toBe('');
  });

  it('SET BUT WRONG refuses rather than falling back to the tree the instrument lives in', () => {
    const absent = resolve(mkdtempSync(resolve(tmpdir(), 'aurora-built-tree-')), 'no-such-build');
    const out = runExpectingFailure('R.auroraBuiltTree();', { AURORA_BUILT_TREE: absent });
    expect(out.status, `expected a non-zero exit; got ${out.status} with stdout ${out.stdout}`).not.toBe(0);
    expect(out.stderr).toContain('SuitePathError');
    expect(out.stderr).toContain(`AURORA_BUILT_TREE=${absent}`);
    expect(out.stderr).toContain('is not a directory');
    // The refusal says what it is NOT, because the whole parcel is that split.
    expect(out.stderr).toContain('is NOT AURORA_DIR');
  });
});
