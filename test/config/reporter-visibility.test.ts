/**
 * A test's `console.log` reaching the run's output is a property, not a given —
 * and in this repo nothing but one config line preserves it.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * vitest 4 picks its own reporter when the config names none:
 *
 *     if (!resolved.reporters.length)
 *       resolved.reporters.push([isAgent ? 'agent' : 'default', {}]);
 *
 * `std-env`'s `isAgent` is true whenever a coding agent's env var is set
 * (`CLAUDECODE`, `CURSOR_AGENT`, `AI_AGENT`, …) — which is nearly every run in
 * this tree. The `agent` reporter constructs itself with `silent: 'passed-only'`,
 * so console output from a test that PASSES is swallowed. `vitest.config.ts`'s
 * `reporters: [...]` line is what stops that, by being present at all.
 *
 * Measured here on vitest 4.1.4: with the line, a passing test's `console.log`
 * appears once; with the line removed, it does not appear at all. Nothing else
 * in the repo notices — no test fails either way. `process.stderr.write` is
 * unaffected, which is exactly why the muting is easy to walk past.
 *
 * WHY THIS FILE AND NOT JUST THE TEXT GUARD
 * -----------------------------------------
 * `test/config/skip-report-wiring.test.ts` reads `vitest.config.ts` as text and
 * fails if the pin is deleted or reordered. That is a STRUCTURAL PROXY: it
 * asserts the line is spelled right, and cannot tell you the line still WORKS.
 * A future vitest that resolves `reporters` differently, or a `silent` setting
 * added elsewhere in the config, would leave that guard green and the output
 * mute. This file closes that gap by running a real child `vitest run` against
 * the repo's real config and looking for the markers in its real output.
 *
 * HOW IT AVOIDS BEING A DECORATION
 * --------------------------------
 * A guard that greps for a string that would be there regardless proves nothing.
 * So every run establishes a CONTROL first: the same fixture, same child, with
 * `--reporter=agent` forced on the command line (a CLI `--reporter` REPLACES the
 * config's array). The control must show the markers ABSENT. If it shows them
 * present, the muting this file guards against no longer exists in this vitest,
 * the canary below could not fail, and the row says COULD NOT MEASURE rather
 * than passing quietly.
 *
 * The child also gets `AI_AGENT` set explicitly, so `isAgent` is true no matter
 * what machine or CI this runs on. Without that, a host with no agent env var
 * would auto-select `default`, and the canary would pass for the wrong reason.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CANARY_ENV_FLAG,
  CANARY_FIXTURE_REL,
  CONSOLE_LOG_MARKER,
  CONSOLE_WARN_MARKER,
  RAW_STDERR_MARKER,
  SKIP_REASON,
  SKIP_TEST_TITLE,
} from './fixtures/reporter-canary-markers';

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

/** One child `vitest run` over the canary fixture, with stdout and stderr merged. */
function runChild(extraArgs: string[]): Run {
  const argv = ['run', CANARY_FIXTURE_REL, '--config', CONFIG, ...extraArgs];
  const r = spawnSync(process.execPath, [vitestBin(), ...argv], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      // Widens `include` in vitest.config.ts to reach the fixture.
      [CANARY_ENV_FLAG]: '1',
      // Forces std-env's `isAgent`, so the muting branch is the one under test
      // on every host — not only on machines that happen to set CLAUDECODE.
      AI_AGENT: 'aurora-reporter-canary',
    },
  });
  if (r.error) throw r.error;
  return { output: `${r.stdout ?? ''}${r.stderr ?? ''}`, status: r.status, argv };
}

describe('a passing test\'s console output still reaches the run output', () => {
  let control: Run;
  let canary: Run;

  beforeAll(() => {
    control = runChild(['--reporter=agent']);
    canary = runChild([]);
  }, 240_000);

  describe('CONTROL: the muting this guards against is real in this vitest', () => {
    it('the control child ran the fixture at all', () => {
      // The raw stderr write bypasses vitest's console capture, so it is present
      // whether or not the run was muted. Its ABSENCE would mean the control
      // never executed the fixture, and the two rows below would then be
      // asserting over the output of a run that did not happen.
      expect(
        control.output,
        `control child (${control.argv.join(' ')}) exited ${control.status} without running the ` +
          `fixture; nothing below can be concluded from its output:\n${control.output}`,
      ).toContain(RAW_STDERR_MARKER);
      expect(control.status, `control child exited ${control.status}:\n${control.output}`).toBe(0);
    });

    it('COULD-NOT-MEASURE: forcing the `agent` reporter really does swallow a passing test\'s console.log', () => {
      expect(
        control.output,
        'The `agent` reporter no longer mutes a passing test\'s console.log. That is not a ' +
          'failure of this repo, but it means the canary below cannot fail, and a guard that ' +
          'cannot fail is not a guard. Re-derive what suppresses console output in this vitest ' +
          'version and re-point this file, or retire it deliberately.',
      ).not.toContain(CONSOLE_LOG_MARKER);
      expect(control.output).not.toContain(CONSOLE_WARN_MARKER);
    });
  });

  describe('CANARY: with the repo\'s real config, the same output comes through', () => {
    it('the canary child ran the fixture and succeeded', () => {
      expect(canary.output, `canary child output:\n${canary.output}`).toContain(RAW_STDERR_MARKER);
      expect(canary.status, `canary child exited ${canary.status}:\n${canary.output}`).toBe(0);
    });

    it('console.log from a PASSING test appears in the output', () => {
      expect(
        canary.output,
        'A passing test\'s console.log did not reach the run output. The `reporters` line in ' +
          'vitest.config.ts is what prevents vitest from auto-selecting its `agent` reporter ' +
          '(silent: \'passed-only\'). Check that line first.',
      ).toContain(CONSOLE_LOG_MARKER);
    });

    it('console.warn from a PASSING test appears in the output', () => {
      expect(canary.output).toContain(CONSOLE_WARN_MARKER);
    });
  });

  describe('CANARY: the skip reporter is not merely named, it runs and names a skip', () => {
    // The same config line carries a second property. The text guard can see
    // that the skip reporter is listed; only a real run can see that it loaded,
    // received the skip, and printed the reason.
    it('names the skipped test', () => {
      expect(canary.output, `canary child output:\n${canary.output}`).toContain(SKIP_TEST_TITLE);
    });

    it('prints that skip\'s reason', () => {
      expect(canary.output).toContain(SKIP_REASON);
    });
  });
});
