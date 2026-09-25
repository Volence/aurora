/**
 * ROADMAP row 204: the run-completeness reporter must tell a COMPLETE run from
 * one that lost a module, and it must be what makes the difference.
 *
 * HOW, AND WHY THIS WAY
 * ---------------------
 * By KILLING A REAL WORKER in a child `vitest run`: the reaped canary sends
 * SIGKILL to the fork running it, which is earlyoom's last stage, not a mock of
 * one. The child also passes `--dangerouslyIgnoreUnhandledErrors`, and that is
 * the point of the file rather than a trick:
 *
 *   Measured 2026-09-25 on vitest 4.1.4, every reap producible here (worker -9,
 *   worker -15, vitest -9/-15, npm -9/-15) exited NON-ZERO. But the worker case
 *   is red ONLY because the pool raises an unhandled error: `TestRun.end` drops
 *   specs with no module and does not count a `pending` module as failed. With
 *   unhandled errors ignored, the CONTROL below exits 0 while one of its two
 *   files never finished. That is the row's "a reaped run can exit 0", produced
 *   on vitest, and it isolates the reporter as the only thing left to catch it.
 *
 * CONTROL FIRST. The same reaped child with `--reporter=default` (a CLI
 * reporter REPLACES the config's array) must exit 0 and print no
 * `run-completeness:` line. If it exits non-zero, vitest has started catching
 * this itself and the subject row proves less than it claims; if it prints the
 * prefix, the greps would match without the reporter. Either way the control
 * row says so instead of the subject rows passing quietly.
 *
 * SUBSET. A child over the passing canary alone must be COMPLETE, 1 of 1, exit
 * 0: the expectation is what the invocation selected, so a subset is not red
 * for being a subset.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  COMPLETE,
  INCOMPLETE,
  PREFIX,
  RECORD_ENV,
  UNMEASURABLE,
  assessCompleteness,
  verifyRecordAgainstExpected,
} from '../../scripts/run-completeness-reporter.mjs';
import {
  CANARY_ENV_FLAG,
  PASS_FIXTURE_REL,
  REAPED_FIXTURE_REL,
} from './fixtures/run-completeness-markers';

const REPO = resolve(__dirname, '../..');
const CONFIG = resolve(REPO, 'vitest.config.ts');
const PASS_ABS = resolve(REPO, PASS_FIXTURE_REL);
const REAPED_ABS = resolve(REPO, REAPED_FIXTURE_REL);

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
  record: Record<string, unknown> | null;
}

/**
 * One child `vitest run`, async so the three children overlap. The reaped
 * worker otherwise costs vitest's teardown timeout (~10s) waiting for a process
 * that is already dead; `--teardownTimeout=500` cuts that to well under 2s.
 */
function runChild(files: string[], extraArgs: string[], dir: string, tag: string): Promise<Run> {
  const recordPath = join(dir, `${tag}.json`);
  const argv = ['run', ...files, '--config', CONFIG, '--teardownTimeout=500', ...extraArgs];
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [vitestBin(), ...argv], {
      cwd: REPO,
      env: { ...process.env, [CANARY_ENV_FLAG]: '1', [RECORD_ENV]: recordPath },
    });
    let output = '';
    child.stdout.on('data', (b) => { output += b; });
    child.stderr.on('data', (b) => { output += b; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 60_000);
    child.on('error', fail);
    child.on('close', (status) => {
      clearTimeout(timer);
      const record = existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : null;
      done({ output, status, argv, record });
    });
  });
}

const IGNORE = '--dangerouslyIgnoreUnhandledErrors';

describe('run-completeness: a reaped worker is caught by this reporter, not by luck', () => {
  let control: Run;
  let reaped: Run;
  let subset: Run;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'run-completeness-'));
    try {
      [control, reaped, subset] = await Promise.all([
        runChild([PASS_FIXTURE_REL, REAPED_FIXTURE_REL], ['--reporter=default', IGNORE], dir, 'control'),
        runChild([PASS_FIXTURE_REL, REAPED_FIXTURE_REL], [IGNORE], dir, 'reaped'),
        runChild([PASS_FIXTURE_REL], [], dir, 'subset'),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('CONTROL: without the reporter, the reaped run EXITS 0 and says nothing about completeness', () => {
    expect(
      control.output,
      `the control child (${control.argv.join(' ')}) never ran the passing canary, so nothing ` +
        `below can be concluded from it:\n${control.output}`,
    ).toContain('run-completeness-canary-pass.ts');
    expect(
      control.status,
      'COULD NOT MEASURE: vitest now exits non-zero on a reaped worker even with unhandled errors ' +
        'ignored. Good news, but it means the reaped row below no longer isolates the reporter; ' +
        're-derive what this file proves.\n' + control.output,
    ).toBe(0);
    expect(
      control.output,
      'vitest prints this prefix by itself, so the rows below could pass without the reporter',
    ).not.toContain(`${PREFIX}:`);
    expect(control.record, 'the control has no reporter, so it must leave no record').toBeNull();
  });

  it('REAPED: the reporter says INCOMPLETE, names the lost file, and fails the run', () => {
    expect(reaped.output).toContain(`${PREFIX}: ${INCOMPLETE}, 1 of 2 module(s)`);
    expect(reaped.output).toMatch(new RegExp(`(left \\w+|never reported): ${REAPED_ABS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(reaped.output).not.toContain(`${PREFIX}: ${COMPLETE}`);
    expect(reaped.status, `the reaped child exited ${reaped.status}:\n${reaped.output}`).not.toBe(0);
  });

  it('REAPED: the record land.mjs reads says INCOMPLETE too', () => {
    expect(reaped.record, 'the reporter wrote no record').not.toBeNull();
    expect(reaped.record?.status).toBe(INCOMPLETE);
    expect(reaped.record?.finished).toBe(1);
    expect(verifyRecordAgainstExpected(reaped.record, [PASS_ABS, REAPED_ABS])).toMatch(/INCOMPLETE/);
  });

  it('SUBSET: one selected file that finishes is COMPLETE and exits 0', () => {
    expect(subset.output).toContain(`${PREFIX}: ${COMPLETE}, 1 of 1 module(s)`);
    expect(subset.status, subset.output).toBe(0);
    expect(subset.record?.status).toBe(COMPLETE);
    expect(subset.record?.selected).toEqual([PASS_ABS]);
  });
});

describe('assessCompleteness', () => {
  const sel = (...ids: string[]) => ids.map((moduleId) => ({ project: '', moduleId }));
  const mod = (moduleId: string, state: string) => ({ project: '', moduleId, state });

  it('is UNMEASURABLE when onTestRunStart never fired', () => {
    expect(assessCompleteness(null, [mod('a', 'passed')], 'passed').status).toBe(UNMEASURABLE);
  });
  it('is UNMEASURABLE when nothing was selected', () => {
    expect(assessCompleteness([], [], 'passed').status).toBe(UNMEASURABLE);
  });
  it('is COMPLETE when every selected module finished, whatever its verdict', () => {
    const v = assessCompleteness(sel('a', 'b', 'c'), [mod('a', 'passed'), mod('b', 'failed'), mod('c', 'skipped')], 'failed');
    expect(v.status).toBe(COMPLETE);
    expect(v.finished).toBe(3);
  });
  it('is INCOMPLETE for a selected module vitest filtered out of onTestRunEnd', () => {
    // TestRun.end drops specs whose testModule is null before reporters see them.
    const v = assessCompleteness(sel('a', 'b'), [mod('a', 'passed')], 'passed');
    expect(v.status).toBe(INCOMPLETE);
    expect(v.missing).toEqual(['b']);
  });
  it('is INCOMPLETE for a module left pending or queued', () => {
    for (const state of ['pending', 'queued']) {
      const v = assessCompleteness(sel('a', 'b'), [mod('a', 'passed'), mod('b', state)], 'passed');
      expect(v.status).toBe(INCOMPLETE);
      expect(v.unfinished).toEqual([{ moduleId: 'b', state }]);
    }
  });
  it('is INCOMPLETE when vitest says the run was interrupted', () => {
    expect(assessCompleteness(sel('a'), [mod('a', 'passed')], 'interrupted').status).toBe(INCOMPLETE);
  });
});

describe('verifyRecordAgainstExpected (what land.mjs asks before it pushes)', () => {
  const rec = (selected: string[], finished = selected.length) => ({ status: COMPLETE, selected, finished });

  it('passes a COMPLETE record whose selection is exactly the derived list', () => {
    expect(verifyRecordAgainstExpected(rec(['a', 'b']), ['b', 'a'])).toBeNull();
  });
  it('refuses a COMPLETE subset: a filter or shard in the test script is not the suite', () => {
    expect(verifyRecordAgainstExpected(rec(['a']), ['a', 'b'])).toMatch(/1 expected file\(s\) were never selected:\n {4}b/);
  });
  it('refuses a selection naming files the derived list does not', () => {
    expect(verifyRecordAgainstExpected(rec(['a', 'z']), ['a'])).toMatch(/ran that the full list does not name/);
  });
  it('refuses a record that is not COMPLETE, quoting its own reason', () => {
    expect(verifyRecordAgainstExpected({ status: UNMEASURABLE, why: 'nope' }, ['a'])).toMatch(/UNMEASURABLE: nope/);
  });
  it('refuses when the expected list is empty rather than calling it a match', () => {
    expect(verifyRecordAgainstExpected(rec([]), [])).toMatch(/expected file list is empty/);
  });
  it('refuses a missing record', () => {
    expect(verifyRecordAgainstExpected(null, ['a'])).toMatch(/not an object/);
  });
});
