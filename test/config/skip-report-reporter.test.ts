/**
 * The skip reporter, driven directly.
 *
 * `scripts/skip-report-reporter.mjs` is the thing that turns "7 skipped" in a
 * suite summary into seven named rows with reasons, and fails the run when a row
 * cannot give one. Its failure state and its success state both end in text on
 * stdout, so "it printed something" is not evidence it works — these rows drive
 * it over a KNOWN input and read what it actually said.
 *
 * The reporter is fed hand-built stand-ins for vitest's `TestModule`/`TestCase`
 * rather than a real nested vitest run, because only the surface it consumes
 * matters (`relativeModuleId`, `children.allTests()`, `result()`, `meta()`,
 * `fullName`, `options.mode`) and a real run cannot be made to contain a
 * reasonless skip without leaving one in the tree.
 *
 * `process.exitCode` is saved and restored around every row. The reporter's
 * whole enforcement mechanism is to set it, and a row that left it set would
 * fail THIS suite from the outside, long after the row itself passed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import SkipReportReporter, { type SkipReportTestModule } from '../../scripts/skip-report-reporter.mjs';

type FakeCase = {
  fullName: string;
  state: 'passed' | 'skipped';
  note?: string;
  meta?: Record<string, unknown>;
  mode?: string;
};

function testCase(c: FakeCase) {
  return {
    fullName: c.fullName,
    options: { mode: c.mode ?? (c.state === 'skipped' ? 'skip' : 'run') },
    result: () => ({ state: c.state, note: c.note }),
    meta: () => c.meta ?? {},
  };
}

function testModule(relativeModuleId: string, cases: FakeCase[]) {
  return {
    relativeModuleId,
    children: { *allTests() { for (const c of cases) yield testCase(c); } },
  };
}

/** Run the reporter over `modules`, capturing everything it emitted. */
function run(modules: SkipReportTestModule[]): { out: string; exitCode: typeof process.exitCode } {
  const lines: string[] = [];
  const log = console.log;
  const err = console.error;
  console.log = (...a: unknown[]) => { lines.push(a.join(' ')); };
  console.error = (...a: unknown[]) => { lines.push(a.join(' ')); };
  const reporter = new SkipReportReporter();
  reporter.onInit({ config: { watch: false } });
  try {
    reporter.onTestRunEnd(modules);
  } finally {
    console.log = log;
    console.error = err;
  }
  return { out: lines.join('\n'), exitCode: process.exitCode };
}

const savedExitCode = process.exitCode;
afterEach(() => { process.exitCode = savedExitCode; });

describe('skip-report reporter: what it says about skips', () => {
  it('NAMES a skipped test and prints the reason from `meta.skipReason`', () => {
    const { out, exitCode } = run([
      testModule('test/x.test.ts', [
        { fullName: 'block > row one', state: 'skipped', meta: { skipReason: 'the fixture is absent' } },
        { fullName: 'block > row two', state: 'passed' },
      ]),
    ]);
    // The name, because a count alone does not tell a reader what to open.
    expect(out).toContain('block > row one');
    expect(out).toContain('the fixture is absent');
    expect(out).toContain('[meta]');
    // And it must NOT list the passing row as skipped.
    expect(out).not.toContain('block > row two');
    expect(exitCode).toBeUndefined();
  });

  it('prints the reason from `ctx.skip(note)`, which `--reporter=json` drops entirely', () => {
    const { out, exitCode } = run([
      testModule('test/y.test.ts', [
        { fullName: 'block > runtime row', state: 'skipped', mode: 'run', note: 'SKIPPED, NOT PASSED: s4_engine is gone' },
      ]),
    ]);
    expect(out).toContain('SKIPPED, NOT PASSED: s4_engine is gone');
    expect(out).toContain('[note]');
    expect(exitCode).toBeUndefined();
  });

  it('accepts a reason carried in the test NAME, via the marker', () => {
    const { out, exitCode } = run([
      testModule('test/z.test.ts', [
        { fullName: 'live > warps (SKIPPED: AURORA_LIVE_S1_WARP=1 not set)', state: 'skipped' },
      ]),
    ]);
    expect(out).toContain('[name]');
    expect(exitCode).toBeUndefined();
  });

  it('prefers `meta` over `note` when a row carries both', () => {
    const { out } = run([
      testModule('test/both.test.ts', [
        { fullName: 'r', state: 'skipped', meta: { skipReason: 'META WINS' }, note: 'note loses' },
      ]),
    ]);
    expect(out).toContain('META WINS');
    expect(out).not.toContain('note loses');
  });

  it('counts the files and the rows it is reporting, not a hardcoded number', () => {
    const { out } = run([
      testModule('test/a.test.ts', [
        { fullName: 'a1', state: 'skipped', meta: { skipReason: 'why' } },
        { fullName: 'a2', state: 'skipped', meta: { skipReason: 'why' } },
      ]),
      testModule('test/b.test.ts', [{ fullName: 'b1', state: 'skipped', meta: { skipReason: 'why' } }]),
    ]);
    expect(out).toContain('3 SKIPPED test(s) in 2 file(s)');
  });
});

describe('skip-report reporter: enforcement', () => {
  it('FAILS the run, naming the row, when a skip gives no reason at all', () => {
    const { out, exitCode } = run([
      testModule('test/mute.test.ts', [{ fullName: 'block > mute row', state: 'skipped' }]),
    ]);
    expect(out).toContain('(NO REASON GIVEN)');
    expect(out).toContain('block > mute row');
    expect(out).toContain('skip-report: FAIL');
    expect(exitCode).toBe(1);
  });

  it('does NOT fail merely because a test skipped: a named skip is green', () => {
    // The explicit non-goal: skipping is legitimate, silence is the defect.
    const { out, exitCode } = run([
      testModule('test/named.test.ts', [
        { fullName: 'r', state: 'skipped', meta: { skipReason: 'the fixture is absent' } },
      ]),
    ]);
    expect(out).toContain('skip-report: OK');
    expect(out).not.toContain('FAIL');
    expect(exitCode).toBeUndefined();
  });

  it('treats a `todo` as its own declaration and does not demand a further reason', () => {
    const { out, exitCode } = run([
      testModule('test/todo.test.ts', [{ fullName: 'r', state: 'skipped', mode: 'todo' }]),
    ]);
    expect(out).toContain('todo — declared unwritten');
    expect(out).not.toContain('FAIL');
    expect(exitCode).toBeUndefined();
  });

  it('fails LOUDLY, not silently green, when the run reported no modules at all', () => {
    // "Could not measure" must never render as "found no problems".
    const { out, exitCode } = run([]);
    expect(out).toContain('COULD NOT MEASURE');
    expect(exitCode).toBe(2);
  });
});

describe('skip-report reporter: the zero case says so out loud', () => {
  it('states that nothing skipped, rather than printing nothing', () => {
    // Printing nothing on a clean run would be indistinguishable from the
    // reporter having been dropped from the config.
    const { out, exitCode } = run([
      testModule('test/clean.test.ts', [{ fullName: 'r', state: 'passed' }]),
    ]);
    expect(out).toContain('no tests were skipped in this run');
    expect(out).toContain('1 module(s) reported');
    expect(exitCode).toBeUndefined();
  });

  it('does not claim anything misleading when there are zero skips', () => {
    const { out } = run([testModule('test/clean.test.ts', [{ fullName: 'r', state: 'passed' }])]);
    expect(out).not.toContain('NO REASON GIVEN');
    expect(out).not.toContain('SKIPPED test(s)');
    expect(out).not.toContain('FAIL');
  });
});
