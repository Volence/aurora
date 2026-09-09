/**
 * The failure-class reporter is only useful while it actually tells the two
 * classes apart, and it is a READER AID rather than a gate: if it silently
 * stopped classifying, the suite's verdict would still be correct and no row
 * would redden on its own. This file is that alarm.
 *
 * WHAT IT PROVES, AND WHY IT PROVES IT THIS WAY
 * --------------------------------------------
 * By PROVOKING one real failure of each class in a child `vitest run` and
 * reading what comes back. Not by constructing error objects: a classifier keyed
 * to a shape someone typed from memory is the same defect as a hand-copied
 * census, and only the real runner can say what a real timeout looks like. The
 * subject is `test/config/fixtures/failure-class-canary.ts`, whose every row
 * fails on purpose, and which the ordinary `include` deliberately cannot reach.
 *
 * ⚠ THE HOOK-TIMEOUT ROW IS THE ONE THAT EARNS ITS KEEP. Measured on vitest
 * 4.1.4: a `beforeAll` that overruns attaches its error to the SUITE and leaves
 * the test underneath reported as `skipped`, not `failed`. A reporter that walks
 * `allTests()` looking for `state === 'failed'` sees NOTHING for that class,
 * which is the class most likely to bite under load, since a `beforeAll` is
 * usually where the expensive fixture is built. That row would go green under a
 * classifier that could not see the failure at all, so it is asserted by name.
 *
 * HOW IT AVOIDS BEING A DECORATION
 * --------------------------------
 * A guard that greps for strings that would be there regardless proves nothing.
 * Every run establishes a CONTROL first: the SAME fixture, the SAME child, with
 * `--reporter=default` forced on the command line (a CLI `--reporter` REPLACES
 * the config's array). The control must show the reporter's output ABSENT. If it
 * shows it present, the greps below are matching something vitest prints on its
 * own, the canary could not fail, and the row says COULD NOT MEASURE rather than
 * passing quietly.
 *
 * The control carries a second property for free: it is the same five failures
 * WITHOUT this reporter, so comparing the two exit codes is a direct measurement
 * that adding the reporter changed no verdict.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CLASS_ASSERTION,
  CLASS_TIMEOUT,
  CLASS_UNCLASSIFIED,
  PREFIX,
  classifyError,
} from '../../scripts/failure-class-reporter.mjs';
import {
  ASSERTION_TITLE,
  CANARY_ENV_FLAG,
  CANARY_FIXTURE_REL,
  EXPECTED_COUNTS,
  HOOK_TIMEOUT_SUITE,
  TEST_TIMEOUT_TITLE,
  UNCLASSIFIED_TITLE,
  WOULD_BLOCK_TITLE,
} from './fixtures/failure-class-markers';

const REPO = resolve(__dirname, '../..');
const CONFIG = resolve(REPO, 'vitest.config.ts');

/** vitest's own CLI entry, asked of node's resolver rather than guessed at a path. */
function vitestBin(): string {
  const req = createRequire(__filename);
  const pkgPath = req.resolve('vitest/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { bin?: string | Record<string, string> };
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.vitest;
  if (!rel) throw new Error(`vitest's package.json declares no usable bin: ${pkgPath}`);
  return resolve(dirname(pkgPath), rel);
}

interface Run {
  output: string;
  status: number | null;
  argv: string[];
}

/** One child `vitest run` over the failure-class canary, stdout and stderr merged. */
function runChild(extraArgs: string[]): Run {
  const argv = ['run', CANARY_FIXTURE_REL, '--config', CONFIG, ...extraArgs];
  const r = spawnSync(process.execPath, [vitestBin(), ...argv], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, [CANARY_ENV_FLAG]: '1' },
  });
  if (r.error) throw r.error;
  return { output: `${r.stdout ?? ''}${r.stderr ?? ''}`, status: r.status, argv };
}

/**
 * The reporter's own listing line for one record, as it is printed:
 *     [TIMEOUT] failure-class canary > FCC_TEST_TIMEOUT_overruns_its_own_limit
 * Built from the class name and the title so neither is retyped here.
 */
function bucketed(output: string, cls: string, title: string): boolean {
  return new RegExp(`\\[${cls}\\][^\\n]*${title}`).test(output);
}

/** The count the summary block prints for one class. Null when the line is absent. */
function countFor(output: string, cls: string): number | null {
  const m = new RegExp(`^\\s*${cls}\\s+(\\d+)\\s`, 'm').exec(output);
  return m ? Number(m[1]) : null;
}

describe('the failure-class reporter separates a finding from a load-manufactured red', () => {
  let control: Run;
  let canary: Run;

  beforeAll(() => {
    control = runChild(['--reporter=default']);
    canary = runChild([]);
  }, 240_000);

  describe('CONTROL: this output does not appear without the reporter', () => {
    it('the control child really ran the canary and really failed', () => {
      // Without this, the two rows below could pass because the child never ran.
      expect(
        control.output,
        `control child (${control.argv.join(' ')}) exited ${control.status} without naming the ` +
          `canary's assertion row; nothing below can be concluded from it:\n${control.output}`,
      ).toContain(ASSERTION_TITLE);
      expect(
        control.status,
        `the canary's rows fail on purpose, so a status of ${control.status} means the child did ` +
          'not run them',
      ).not.toBe(0);
    });

    it('COULD-NOT-MEASURE: vitest does not print this classification by itself', () => {
      expect(
        control.output,
        'The default reporter now prints something matching this file\'s greps. That is not a ' +
          'failure of the repo, but it means the rows below could pass without the ' +
          'failure-class reporter running at all, and a guard that cannot fail is not a guard. ' +
          'Re-derive what to grep for and re-point this file, or retire it deliberately.',
      ).not.toContain(`${PREFIX}:`);
      expect(control.output).not.toMatch(/\[UNCLASSIFIED\]/);
    });
  });

  describe('CANARY: each provoked class lands in the right bucket', () => {
    it('the canary child ran and produced the reporter\'s block', () => {
      expect(canary.output, `canary child output:\n${canary.output}`).toContain(`${PREFIX}:`);
    });

    it('a failed `expect` is an ASSERTION, which load cannot fake', () => {
      expect(
        bucketed(canary.output, 'ASSERTION', ASSERTION_TITLE),
        `the canary's assertion row was not bucketed ASSERTION:\n${canary.output}`,
      ).toBe(true);
    });

    it('a test body that outran its limit is a TIMEOUT', () => {
      expect(
        bucketed(canary.output, 'TIMEOUT', TEST_TIMEOUT_TITLE),
        `the canary's test-timeout row was not bucketed TIMEOUT:\n${canary.output}`,
      ).toBe(true);
    });

    it('a HOOK that outran its limit is a TIMEOUT, though no test failed for it', () => {
      // The case a reporter walking only failed tests cannot see at all: the
      // error is on the suite and the test below it reads `skipped`.
      expect(
        bucketed(canary.output, 'TIMEOUT', HOOK_TIMEOUT_SUITE),
        'the canary\'s HOOK timeout was not bucketed TIMEOUT. A hook timeout attaches its error ' +
          'to the SUITE and leaves its test reported as skipped, so a reporter that walks ' +
          `allTests() for state === 'failed' misses this class entirely:\n${canary.output}`,
      ).toBe(true);
    });

    it('a child process that outran its own timeout is a TIMEOUT, by errno', () => {
      expect(
        bucketed(canary.output, 'TIMEOUT', WOULD_BLOCK_TITLE),
        `the canary's would-block row was not bucketed TIMEOUT:\n${canary.output}`,
      ).toBe(true);
    });

    it('a bare throw is UNCLASSIFIED, not folded into either bucket', () => {
      expect(
        bucketed(canary.output, 'UNCLASSIFIED', UNCLASSIFIED_TITLE),
        'the canary\'s signature-free throw was not bucketed UNCLASSIFIED. Folding it into ' +
          `ASSERTION or TIMEOUT would make the reporter claim more than it measured:\n${canary.output}`,
      ).toBe(true);
    });
  });

  describe('CANARY: the printed counts are exact, and they sum', () => {
    it('prints the count this fixture provokes for each class', () => {
      for (const [cls, expected] of Object.entries(EXPECTED_COUNTS)) {
        expect(
          countFor(canary.output, cls),
          `the summary line for ${cls} did not read ${expected}:\n${canary.output}`,
        ).toBe(expected);
      }
    });

    it('never says the counts failed to sum', () => {
      // The reporter shouts this when its buckets do not partition its records.
      // Seeing it here would mean the three numbers above are not a partition.
      expect(canary.output).not.toContain('THE COUNTS DO NOT SUM');
    });

    it('names the total record count the three classes are drawn from', () => {
      const total = Object.values(EXPECTED_COUNTS).reduce((a, b) => a + b, 0);
      expect(
        canary.output,
        `the reporter did not report ${total} records for this fixture:\n${canary.output}`,
      ).toContain(`${PREFIX}: ${total} failure record(s)`);
    });
  });

  describe('the reporter changes no verdict', () => {
    it('the same five failures exit the same way with and without it', () => {
      // The whole point of the parcel: this changes what the reader is told,
      // never what the runner decides. Nothing that failed before passes now.
      expect(
        canary.status,
        `with the reporter the child exited ${canary.status}, without it ${control.status}`,
      ).toBe(control.status);
      expect(canary.status, 'a run with five deliberate failures must not exit 0').not.toBe(0);
    });
  });
});

/**
 * The child run above proves the four shapes the runner really produces. These
 * rows cover the ones a provoked run cannot cheaply reach, and they are all
 * NEGATIVE: the ways this classifier could over-claim.
 *
 * The direction matters. Calling a finding a timeout tells a reader to shrug at
 * a real defect; calling a timeout a finding costs them one wasted look. So
 * these ask "does it refuse to guess?" rather than "does it recognise?".
 */
describe('classifyError refuses to guess', () => {
  it('does NOT read every errno as load: ENOENT is a missing file, not a busy box', () => {
    // The row that keeps the errno list an allowlist. `spawnSync` produces
    // ENOENT and ETIMEDOUT in the SAME shape, differing only in this field, so
    // a "has a code" test would launder a missing binary into "re-run it later".
    const enoent = Object.assign(new Error('spawnSync some-missing-binary ENOENT'), {
      code: 'ENOENT',
      errno: -2,
      syscall: 'spawnSync',
    });
    expect(classifyError(enoent).cls).toBe(CLASS_UNCLASSIFIED);
  });

  it('does not treat a test that merely MENTIONS a timeout as one', () => {
    // A test asserting over timeout text of its own would otherwise be excused
    // as load. The assertion signal is structural and is checked first, which is
    // why this lands in the right bucket.
    const mentions = {
      name: 'AssertionError',
      message: 'expected log to contain "Test timed out in 5000ms."',
      expected: 'Test timed out in 5000ms.',
      actual: '',
    };
    expect(classifyError(mentions).cls).toBe(CLASS_ASSERTION);
  });

  it('matches the timeout wording only where the producer puts it, at the start', () => {
    const real = { name: 'Error', message: 'Test timed out in 5000ms.\nIf this is a long-running' };
    const quoted = { name: 'Error', message: 'the log said "Test timed out in 5000ms." somewhere' };
    expect(classifyError(real).cls).toBe(CLASS_TIMEOUT);
    expect(classifyError(quoted).cls).toBe(CLASS_UNCLASSIFIED);
  });

  it('accepts the HOOK wording as well as the TEST wording', () => {
    // Both come from one template in the runner's `makeTimeoutError`. A pattern
    // that knew only "Test" would miss every hook timeout, and a hook timeout
    // never reaches a failed test at all.
    expect(classifyError({ name: 'Error', message: 'Hook timed out in 40ms.\n' }).cls).toBe(
      CLASS_TIMEOUT,
    );
  });

  it('counts a failure carrying no error object at all rather than dropping it', () => {
    expect(classifyError(null).cls).toBe(CLASS_UNCLASSIFIED);
    expect(classifyError(undefined).cls).toBe(CLASS_UNCLASSIFIED);
    expect(classifyError('a string that was thrown').cls).toBe(CLASS_UNCLASSIFIED);
  });
});
