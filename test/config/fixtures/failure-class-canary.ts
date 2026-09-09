/**
 * The failure-class reporter's SUBJECT: one REAL failure of each class the
 * reporter claims to tell apart. Not run by the main suite; run by
 * `test/config/failure-class-reporter.test.ts` in a child `vitest run`.
 *
 * EVERY ROW HERE FAILS ON PURPOSE. That is the point: a classifier proven only
 * on the assertion class is half a classifier, and a timeout signature typed
 * from memory is the same defect as a hand-copied census. These rows PROVOKE the
 * real thing and let vitest emit whatever it actually emits.
 *
 * WHY IT IS `.ts` AND NOT `.test.ts`
 * ----------------------------------
 * The same reasoning as `reporter-canary.ts` beside it, plus one more that is
 * specific to this file:
 *
 *   - `check-test-collection.mjs` fails any TEST-SHAPED file (`*.test.ts` /
 *     `*.spec.ts`) that vitest's configured `include` does not reach. This file
 *     must NOT be reached by the ordinary include.
 *   - ⚠ AND HERE THE STAKES ARE HIGHER THAN FOR THE OTHER CANARY: that one
 *     leaks markers, this one would turn the whole suite red. A main-suite run
 *     that collected this file would report five failures that are working as
 *     designed.
 *
 * So it is not test-shaped, and it is reached only by a widened `include`
 * switched on by `CANARY_ENV_FLAG`, which only the guard's child run sets. It is
 * therefore not an unrun test file: it runs on every suite execution, inside the
 * guard's child process, and the guard fails if the classes do not come back.
 *
 * Keep it trivial. Any logic that needs checking belongs in the guard.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  ASSERTION_TITLE,
  HOOK_TIMEOUT_SKIP_REASON,
  HOOK_TIMEOUT_SUITE,
  HOOK_TIMEOUT_TITLE,
  TEST_TIMEOUT_TITLE,
  UNCLASSIFIED_TITLE,
  WOULD_BLOCK_TITLE,
} from './failure-class-markers';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Short enough that the canary costs a fraction of a second, long enough that
 * the sleep below cannot finish first on any machine. The direction is safe
 * under load: a busy box makes these MORE certain to fire, not less.
 */
const TINY_TIMEOUT_MS = 40;
const LONGER_THAN_THAT_MS = 400;

describe('failure-class canary', () => {
  it(ASSERTION_TITLE, () => {
    // The class that must NEVER be excused by a busy machine.
    expect(1, 'a deliberate assertion failure, planted by the failure-class canary').toBe(2);
  });

  it(TEST_TIMEOUT_TITLE, { timeout: TINY_TIMEOUT_MS }, async () => {
    await sleep(LONGER_THAN_THAT_MS);
  });

  it(WOULD_BLOCK_TITLE, () => {
    // A real child that outruns a real timeout, so node produces a real
    // `code: 'ETIMEDOUT'` rather than this file asserting what one looks like.
    const child = spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      timeout: 150,
    });
    if (child.error) throw child.error;
    throw new Error(`the child did not outrun its timeout; signal=${String(child.signal)}`);
  });

  it(UNCLASSIFIED_TITLE, () => {
    // Deliberately signature-free: no assertion fields, no errno, not vitest's
    // timeout wording. The reporter must count it, not guess at it.
    throw new Error('a bare throw with no signature, planted by the failure-class canary');
  });
});

describe(
  HOOK_TIMEOUT_SUITE,
  // The skip reason is for the OTHER reporter: a hook failure skips the rows
  // beneath it, and an unexplained skip is a failure of `skip-report-reporter`.
  // Inside this child that complaint would be noise, not a finding.
  { meta: { skipReason: HOOK_TIMEOUT_SKIP_REASON } },
  () => {
    beforeAll(async () => {
      await sleep(LONGER_THAN_THAT_MS);
    }, TINY_TIMEOUT_MS);

    it(HOOK_TIMEOUT_TITLE, () => {
      expect(true).toBe(true);
    });
  },
);
