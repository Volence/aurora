/**
 * The reporter canary's SUBJECT. Not run by the main suite; run by
 * `test/config/reporter-visibility.test.ts` in a child `vitest run`.
 *
 * WHY IT IS `.ts` AND NOT `.test.ts`
 * ----------------------------------
 * Deliberate, and it is the only shape that satisfies both gates at once:
 *
 *   - `check-test-collection.mjs` fails any TEST-SHAPED file (`*.test.ts` /
 *     `*.spec.ts`) that vitest's configured `include` does not reach. This file
 *     must NOT be reached by the ordinary include — a canary that ran inside the
 *     run it is measuring would print its markers into the very output the guard
 *     greps, and could no longer tell the child's output from the parent's.
 *   - So it must not be test-shaped. It is reached instead by a WIDENED include,
 *     switched on by `CANARY_ENV_FLAG`, that only the guard's child run sets.
 *
 * It is therefore not an unrun test file — the class of defect this repo hunts.
 * It is run on every suite execution, by the guard, in a child process, and the
 * guard fails if these markers do not come back. What it does escape is the
 * STATIC passes (`check-pseudo-skip.mjs` scans `*.test.ts` only), so keep this
 * file trivial: any logic that needs checking belongs in the guard, not here.
 *
 * Every marker below is imported, never retyped. See the markers module.
 */
import { describe, it, expect } from 'vitest';
import {
  CONSOLE_LOG_MARKER,
  CONSOLE_WARN_MARKER,
  RAW_STDERR_MARKER,
  SKIP_REASON,
  SKIP_TEST_TITLE,
} from './reporter-canary-markers';

describe('reporter canary', () => {
  it('emits console output from a test that PASSES', () => {
    // A PASSING test on purpose. vitest's `agent` reporter runs
    // `silent: 'passed-only'`, which shows logs from FAILING tests and swallows
    // these. A canary that failed would be shown either way and would prove
    // nothing about the muting the pin exists to prevent.
    console.log(CONSOLE_LOG_MARKER);
    console.warn(CONSOLE_WARN_MARKER);

    // Not routed through vitest's console capture: this one survives every
    // reporter, so its presence separates "the run was muted" from "the run
    // never happened".
    process.stderr.write(`${RAW_STDERR_MARKER}\n`);

    expect(true).toBe(true);
  });

  it(SKIP_TEST_TITLE, { skip: true, meta: { skipReason: SKIP_REASON } }, () => {
    throw new Error('unreachable: this test is unconditionally skipped');
  });
});
