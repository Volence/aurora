/**
 * The titles the failure-class canary fails under, and the ones its guard looks
 * for in the child run's output.
 *
 * They live in a THIRD file, imported by both, so the guard's expectations are
 * DERIVED from the same declaration the fixture emits rather than retyped beside
 * it. A title copied into the guard by hand is a title that can stop matching
 * without either file changing in a way a reader would notice, and this repo has
 * paid for a hand-copied census before.
 *
 * Nothing here is a test. This module is imported by
 * `test/config/fixtures/failure-class-canary.ts` (the subject) and by
 * `test/config/failure-class-reporter.test.ts` (the guard).
 */

/**
 * Env var that makes `vitest.config.ts` widen `include` to reach the canary
 * fixture. Only the guard's child run sets it: the fixture's rows FAIL ON
 * PURPOSE, so a main-suite run that collected it would go red by design.
 *
 * `test/config/failure-class-wiring.test.ts` asserts this exact name still
 * appears in `vitest.config.ts` (renaming it in one place only reddens there).
 */
export const CANARY_ENV_FLAG = 'AURORA_FAILURE_CLASS_CANARY';

/** Path of the fixture, relative to the repo root. Used by the config's `include` and by the guard. */
export const CANARY_FIXTURE_REL = 'test/config/fixtures/failure-class-canary.ts';

/** A plain `expect` failure. Must be bucketed ASSERTION: load cannot fake one. */
export const ASSERTION_TITLE = 'FCC_ASSERTION_fails_an_expect';

/** A test body that outruns its own timeout. Must be bucketed TIMEOUT. */
export const TEST_TIMEOUT_TITLE = 'FCC_TEST_TIMEOUT_overruns_its_own_limit';

/**
 * The suite whose `beforeAll` outruns the hook timeout. Must be bucketed
 * TIMEOUT, and it is the case a naive reporter misses completely: the error
 * lands on the SUITE and the test underneath reads `skipped`, not `failed`.
 */
export const HOOK_TIMEOUT_SUITE = 'FCC_HOOK_TIMEOUT_suite';

/** The test under that suite. It never runs; it exists to give the suite a child. */
export const HOOK_TIMEOUT_TITLE = 'FCC_HOOK_TIMEOUT_never_runs';

/**
 * The reason carried on that suite's skip. Present only to keep the SKIP
 * reporter satisfied inside the child run: a hook failure skips the tests below
 * it with no reason of their own, which that reporter rightly calls out, and its
 * complaint would be noise in this guard's output rather than a finding.
 */
export const HOOK_TIMEOUT_SKIP_REASON =
  'deliberate: this row cannot run because the suite above it times out on purpose, which is the subject of test/config/failure-class-reporter.test.ts';

/**
 * A child process that outruns its own `spawnSync` timeout, arriving as
 * `code: 'ETIMEDOUT'`. Must be bucketed TIMEOUT, and by the CODE rather than by
 * the message: the sibling row below proves the code list is an allowlist.
 */
export const WOULD_BLOCK_TITLE = 'FCC_WOULD_BLOCK_child_outruns_its_timeout';

/**
 * A bare `throw`. Must be bucketed UNCLASSIFIED and COUNTED. It is almost
 * certainly a finding, but nothing on the error says whether the machine's load
 * could have produced it, and a bucket that guessed would be claiming more than
 * this instrument measures.
 */
export const UNCLASSIFIED_TITLE = 'FCC_UNCLASSIFIED_throws_a_bare_error';

/** How many records of each class the fixture must produce. Asserted exactly, not as a floor. */
export const EXPECTED_COUNTS = {
  ASSERTION: 1,
  TIMEOUT: 3,
  UNCLASSIFIED: 1,
} as const;
