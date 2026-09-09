/**
 * failure-class-reporter — when the suite fails, separate the failures a reader
 * must ACT on from the ones a reader must RE-RUN, in the run's own output.
 *
 * WHY THIS EXISTS
 * ---------------
 * Landing verification and agent work share one machine here. Booked as
 * SUITE-TIMEOUTS-ASSUME-IDLE-BOX: two exhaustive-census rows that take 1.8s and
 * 1.0s on an idle box hit 6.0s and >5.0s while a subagent was building, a
 * threefold and a fivefold inflation, and BOTH presented as genuine reds — a
 * named row, a failing file, a merge sitting on the tree. One merged-tree run
 * came back with four failures, one assertion and three timeouts, and it cost
 * FIVE full suite runs to establish that, because the output presented all four
 * identically.
 *
 * ⚠ THE DISCRIMINATOR IS THE FAILURE MODE, NOT THE LOAD, and getting that
 * backwards is the dangerous mistake:
 *
 *   • A TIMEOUT or a would-block is LOAD-MANUFACTURED UNTIL PROVEN OTHERWISE.
 *     Judging it needs a re-run on a quiet box; the red on a loaded box says
 *     little either way.
 *   • A FAILED ASSERTION IS NOT LOAD-SENSITIVE AND STAYS A FINDING, whatever the
 *     machine was doing. Oracle has the converse booked twice (2026-09-03 and
 *     2026-09-04): a row that failed ONLY under load was written off as a flake
 *     and was a genuine defect with a narrow timing window, both times. LOAD IS
 *     THE CONDITION THAT OPENS A NARROW WINDOW, NOT ONE THAT FAKES ONE. So
 *     "treat a red on a loaded box with suspicion" is exactly the wrong rule and
 *     this file does not implement it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 *   • IT DOES NOT CHANGE THE EXIT CODE, in either direction. It never touches
 *     `process.exitCode`. A timeout still fails the suite, exactly as before;
 *     nothing that failed before passes now. This changes what the READER is
 *     told, not what the runner decides.
 *   • IT DOES NOT DETECT LOAD, and it must not. A rejected candidate fix was to
 *     have the suite refuse to grade a timeout while a build is detected — that
 *     swallows a genuine timeout regression, which is the same defect one level
 *     up (a check reporting its blindness as a clean result), and it makes the
 *     verdict depend on an ambient condition nobody records.
 *   • IT DOES NOT RAISE ANY LIMIT. Raising census timeouts one at a time as they
 *     bite would eventually license raising every census row.
 *
 * ⚠ IT IS A READER AID, NOT A GATE, and that is a deliberate cost. If this file
 * silently stopped classifying, the suite's verdict would still be correct and
 * no row would redden on its own. `test/config/failure-class-reporter.test.ts`
 * is the alarm: it drives a child `vitest run` that PROVOKES one of each class
 * and fails if the buckets come back wrong. `test/config/failure-class-wiring.test.ts`
 * asserts this file is still named in `vitest.config.ts`.
 *
 * ============================================================================
 * THE SIGNATURES, AND HOW THEY WERE DERIVED
 * ============================================================================
 * Not typed from memory. Every shape below was read off a probe reporter that
 * dumped `Object.keys()`, `name`, `message`, `code` and `stack` for deliberately
 * provoked failures, on vitest 4.1.4 / @vitest/runner 4.1.4, 2026-09-09.
 *
 *   ASSERTION — `expect(1).toBe(2)` arrives as
 *       { name: 'AssertionError', message: 'expected 1 to be 2 // Object.is equality',
 *         expected: '2', actual: '1', operator: 'strictEqual', ok, diff, showDiff, stack, stacks }
 *     A custom message is PREPENDED to `message`, so the name and the
 *     expected/actual pair are the stable parts and the message is not.
 *
 *   TIMEOUT — a test body that overruns arrives as a PLAIN Error:
 *       { name: 'Error', message: 'Test timed out in 300ms.\nIf this is a long-running…' }
 *     with NO expected/actual. The wording is the producer's own template, at
 *     `@vitest/runner/dist/chunk-artifact.js` `makeTimeoutError`:
 *       `${isHook ? "Hook" : "Test"} timed out in ${timeout}ms.\nIf this is a …`
 *     which is where `TIMEOUT_MESSAGE` below comes from, and why it accepts both
 *     words and any integer.
 *
 *     ⚠ `error.stack` is NOT a signature. A timeout's stack begins
 *     `Error: STACK_TRACE_ERROR`, which looks like a gift — but that placeholder
 *     is constructed in ~10 unrelated places in the same file (every `withTimeout`
 *     wrapper, fixture setup, …), so keying on it would over-match. Checked
 *     before rejecting it.
 *
 *   ⚠ HOOK TIMEOUT — THE CASE THAT MOTIVATES THE WALK BELOW. A `beforeAll` that
 *     overruns does NOT produce a failed test. Measured: the error is attached to
 *     the SUITE (`TestSuite.errors()`), the suite's state is `failed`, and the
 *     test underneath is reported as **skipped**, with zero errors of its own. A
 *     reporter that walks `allTests()` looking for `state === 'failed'` — the
 *     obvious implementation — SEES NOTHING AT ALL for this class, which is the
 *     class most likely to bite under load, since a `beforeAll` is usually where
 *     the expensive fixture is built. So this walks modules, suites and tests.
 *
 *   COLLECTION — a module that throws at import scope reports the error on
 *     `TestModule.errors()` with no suites and no tests beneath it at all.
 *
 *   WOULD-BLOCK — a child process that outran its own `spawnSync` timeout
 *     arrives as { name: 'Error', code: 'ETIMEDOUT', message: 'spawnSync … ETIMEDOUT' }.
 *     Classified by `code`, never by the message. `ENOENT` from a missing binary
 *     arrives in the same shape with a different code, which is exactly why the
 *     code list below is a short allowlist of resource-exhaustion codes rather
 *     than "anything with a code".
 *
 * ============================================================================
 * WHY UNCLASSIFIED IS A REAL BUCKET AND NOT A ROUNDING ERROR
 * ============================================================================
 * A bare `throw new Error('…')` and a `TypeError` are, on the evidence above,
 * indistinguishable from each other and carry no field that says whether the
 * machine's load could have produced them. They are almost certainly findings —
 * but "almost certainly" is not what a bucket asserts, and folding them into
 * ASSERTION would make this instrument claim more than it measured. They are
 * counted, listed by name and message, and left for the reader. If the counts
 * ever fail to sum to the number of records, this says so loudly rather than
 * printing three tidy numbers that do not add up.
 */

/** Bucket labels. Exported so the guard derives them rather than retyping them. */
export const CLASS_TIMEOUT = 'TIMEOUT';
export const CLASS_ASSERTION = 'ASSERTION';
export const CLASS_UNCLASSIFIED = 'UNCLASSIFIED';

export const PREFIX = 'failure-class';

/**
 * The producer's own template, quoted in the header. Both words are accepted
 * because `makeTimeoutError` emits "Test" for a body and "Hook" for a hook, and
 * a hook timeout is the case a naive implementation misses entirely.
 */
const TIMEOUT_MESSAGE = /^(?:Test|Hook) timed out in \d+ms\./;

/**
 * Errno codes that mean "the machine could not give me the resource right now".
 * Deliberately short. Anything not on this list is not treated as load-sensitive
 * — `ENOENT` (missing file or binary) is the case that keeps this an allowlist
 * rather than a "has a code" test.
 */
const WOULD_BLOCK_CODES = new Set([
  'ETIMEDOUT', // a child outran its own timeout
  'EAGAIN', // would block / no more processes
  'EBUSY', // resource busy
  'EMFILE', // per-process file descriptors exhausted
  'ENFILE', // system-wide file descriptors exhausted
  'ENOMEM', // out of memory
]);

/**
 * Classify ONE error record. Pure, and exported so it can be driven directly.
 *
 * Structural signals are tested BEFORE textual ones on purpose: a name and a
 * field's presence cannot be produced by a test's own prose, and a message can.
 *
 * @returns {{cls: string, why: string}}
 */
export function classifyError(error) {
  if (!error || typeof error !== 'object') {
    return { cls: CLASS_UNCLASSIFIED, why: 'the failure carried no error object' };
  }

  const name = typeof error.name === 'string' ? error.name : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'string' ? error.code : '';

  // STRUCTURAL, first. `endsWith` also catches JestAssertionError and friends.
  if (name.endsWith('AssertionError')) {
    return { cls: CLASS_ASSERTION, why: `name is ${name}` };
  }
  if ('expected' in error && 'actual' in error) {
    // A widening: an assertion library that does not use the name above still
    // carries the pair the diff is rendered from.
    return { cls: CLASS_ASSERTION, why: 'carries both `expected` and `actual`' };
  }

  if (WOULD_BLOCK_CODES.has(code)) {
    return { cls: CLASS_TIMEOUT, why: `errno ${code}` };
  }

  // TEXTUAL, last, and only against the producer's own template.
  if (TIMEOUT_MESSAGE.test(message)) {
    return { cls: CLASS_TIMEOUT, why: "vitest's own timeout message" };
  }

  return {
    cls: CLASS_UNCLASSIFIED,
    why: `${name || 'an error'} with no signature this reporter recognises`,
  };
}

/** First line of a message, trimmed for a one-line listing. */
function firstLine(message, limit = 140) {
  const line = String(message ?? '').split('\n')[0].trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

/**
 * Every failure record in the run, from all four surfaces they arrive on.
 *
 * @returns {{records: {module: string, label: string, origin: string, cls: string, why: string, message: string, name: string}[], failedTests: number, modules: number}}
 */
export function collectRecords(testModules, unhandledErrors) {
  const records = [];
  let failedTests = 0;

  const push = (moduleId, label, origin, error) => {
    const { cls, why } = classifyError(error);
    records.push({
      module: moduleId,
      label,
      origin,
      cls,
      why,
      name: typeof error?.name === 'string' ? error.name : '(no name)',
      message: firstLine(error?.message),
    });
  };

  for (const testModule of testModules ?? []) {
    const moduleId = testModule.relativeModuleId ?? '(unknown module)';

    // Surface 1: the module itself — a file that failed to collect.
    const moduleErrors = typeof testModule.errors === 'function' ? testModule.errors() ?? [] : [];
    for (const error of moduleErrors) push(moduleId, moduleId, 'collection', error);

    // Surfaces 2 and 3: suites (where a HOOK timeout lands) and tests.
    const walk = (node, path) => {
      for (const child of node.children ?? []) {
        const label = path ? `${path} > ${child.name}` : child.name;
        if (child.type === 'suite') {
          const suiteErrors = typeof child.errors === 'function' ? child.errors() ?? [] : [];
          for (const error of suiteErrors) push(moduleId, label, 'hook/suite', error);
          walk(child, label);
          continue;
        }
        const result = child.result();
        if (result.state !== 'failed') continue;
        failedTests += 1;
        const errors = result.errors ?? [];
        if (errors.length === 0) {
          // A failed test with nothing attached. Never silently dropped: it
          // would make the failed-test count and the record count disagree.
          push(moduleId, label, 'test', null);
          continue;
        }
        for (const error of errors) push(moduleId, label, 'test', error);
      }
    };
    walk(testModule, '');
  }

  // Surface 4: errors with no owning task at all.
  for (const error of unhandledErrors ?? []) {
    push('(no module)', '(unhandled error)', 'unhandled', error);
  }

  return { records, failedTests, modules: (testModules ?? []).length };
}

export default class FailureClassReporter {
  onTestRunEnd(testModules, unhandledErrors) {
    const log = (line) => console.log(line);

    if (!Array.isArray(testModules) || testModules.length === 0) {
      // Loud, but the exit code is still not this reporter's to change. The
      // runner has its own opinion about a run that produced nothing.
      console.error(
        `${PREFIX}: COULD NOT MEASURE: the run reported no test modules at all.\n` +
          '  This run says nothing about whether its failures were findings or timeouts.',
      );
      return;
    }

    const { records, failedTests, modules } = collectRecords(testModules, unhandledErrors);

    if (records.length === 0) {
      // Said out loud: silence here would be indistinguishable from this
      // reporter never having loaded.
      log(`\n${PREFIX}: no failures in this run (${modules} module(s) reported).`);
      return;
    }

    const counts = {
      [CLASS_ASSERTION]: records.filter((r) => r.cls === CLASS_ASSERTION).length,
      [CLASS_TIMEOUT]: records.filter((r) => r.cls === CLASS_TIMEOUT).length,
      [CLASS_UNCLASSIFIED]: records.filter((r) => r.cls === CLASS_UNCLASSIFIED).length,
    };
    const summed = counts[CLASS_ASSERTION] + counts[CLASS_TIMEOUT] + counts[CLASS_UNCLASSIFIED];

    const byModule = new Map();
    for (const record of records) {
      if (!byModule.has(record.module)) byModule.set(record.module, []);
      byModule.get(record.module).push(record);
    }

    log('');
    log(
      `${PREFIX}: ${records.length} failure record(s) in ${byModule.size} file(s) ` +
        `(${failedTests} failed test(s); a hook or collection failure has no failed test of its own).`,
    );
    log('');
    log(
      `  ${CLASS_ASSERTION.padEnd(13)} ${String(counts[CLASS_ASSERTION]).padStart(4)}   ` +
        'A FINDING regardless of what the machine was doing. Load does not fake these.',
    );
    log(
      `  ${CLASS_TIMEOUT.padEnd(13)} ${String(counts[CLASS_TIMEOUT]).padStart(4)}   ` +
        'LOAD-MANUFACTURED UNTIL PROVEN OTHERWISE. Re-run on a quiet box to judge,',
    );
    log(
      `  ${''.padEnd(13)} ${''.padStart(4)}   ` +
        'but load OPENS narrow windows as well as inventing delays, so a timeout',
    );
    log(
      `  ${''.padEnd(13)} ${''.padStart(4)}   ` +
        'that repeats on a quiet box is a finding, and one that does not is not proof',
    );
    log(`  ${''.padEnd(13)} ${''.padStart(4)}   of nothing.`);
    log(
      `  ${CLASS_UNCLASSIFIED.padEnd(13)} ${String(counts[CLASS_UNCLASSIFIED]).padStart(4)}   ` +
        'NO SIGNATURE THIS REPORTER RECOGNISES. Read these yourself; they are not',
    );
    log(`  ${''.padEnd(13)} ${''.padStart(4)}   folded into either bucket above.`);

    if (summed !== records.length) {
      console.error(
        `\n${PREFIX}: ⚠ THE COUNTS DO NOT SUM. ${summed} classified against ` +
          `${records.length} record(s). Do not read the three numbers above as a partition; ` +
          'something in this reporter is dropping failures on the floor.',
      );
    }

    for (const [moduleId, rows] of [...byModule.entries()].sort()) {
      log('');
      log(`  ${moduleId}`);
      for (const row of rows) {
        log(`    [${row.cls}] ${row.label}${row.origin === 'test' ? '' : `  (${row.origin})`}`);
        log(`        ${row.name}: ${row.message || '(no message)'}`);
        log(`        why this bucket: ${row.why}`);
      }
    }

    if (counts[CLASS_TIMEOUT] > 0 && counts[CLASS_ASSERTION] === 0) {
      log(
        `\n${PREFIX}: EVERY failure above is a timeout or would-block. Before treating any of ` +
          'them\n  as a defect, re-run on a box that is not also building something.',
      );
    }
    if (counts[CLASS_ASSERTION] > 0) {
      log(
        `\n${PREFIX}: ${counts[CLASS_ASSERTION]} assertion failure(s) above are findings NOW. ` +
          'A busy machine\n  is not an explanation for any of them.',
      );
    }
  }
}
