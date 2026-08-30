/**
 * The strings the reporter canary emits, and the ones its guard looks for.
 *
 * They live in a THIRD file, imported by both, so the guard's expectations are
 * derived from the same declaration the fixture emits rather than retyped
 * beside it. A marker copied into the guard by hand is a marker that can stop
 * matching without either file changing in a way a reader would notice.
 *
 * Nothing here is a test. This module is imported by
 * `test/config/fixtures/reporter-canary.ts` (the subject) and by
 * `test/config/reporter-visibility.test.ts` (the guard).
 */

/**
 * Env var that makes `vitest.config.ts` widen `include` to reach the canary
 * fixture. Only the guard's child run sets it, so the main suite neither runs
 * the fixture nor counts its deliberate skip.
 *
 * `test/config/skip-report-wiring.test.ts` asserts this exact name still appears
 * in `vitest.config.ts` — renaming it in one place only will redden there.
 */
export const CANARY_ENV_FLAG = 'AURORA_REPORTER_CANARY';

/** Path of the fixture, relative to the repo root. Used by the config's `include` and by the guard's child invocation. */
export const CANARY_FIXTURE_REL = 'test/config/fixtures/reporter-canary.ts';

/** Emitted with `console.log` from a test that PASSES. */
export const CONSOLE_LOG_MARKER = 'AURORA_CANARY_LOG_e3f1a7';

/** Emitted with `console.warn` from a test that PASSES. */
export const CONSOLE_WARN_MARKER = 'AURORA_CANARY_WARN_e3f1a7';

/**
 * Written straight to `process.stderr`, which is NOT routed through vitest's
 * console capture and therefore survives every reporter. It is the canary's
 * own control: if this one is missing, the child run did not execute the
 * fixture at all, and the absence of the two above says nothing about muting.
 */
export const RAW_STDERR_MARKER = 'AURORA_CANARY_RAW_e3f1a7';

/** Title of the fixture's deliberately-skipped test, as the skip reporter prints it. */
export const SKIP_TEST_TITLE = 'is skipped so the skip reporter has a subject to name';

/** Reason carried on that skip, via the `meta.skipReason` channel. */
export const SKIP_REASON =
  'deliberate: this row exists only so the reporter canary can prove the skip reporter still names a skip and prints its reason';
