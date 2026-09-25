/**
 * Names shared by the run-completeness canaries (the subjects) and
 * `test/config/run-completeness-reporter.test.ts` (the guard), so the guard's
 * expectations are derived from the same declaration the config and fixtures
 * use rather than retyped beside them. Nothing here is a test.
 */

/**
 * Env var that makes `vitest.config.ts` widen `include` to reach the two
 * canaries below. Only the guard's child runs set it: one canary KILLS ITS OWN
 * WORKER, so a main-suite run that collected it would lose a module by design.
 */
export const CANARY_ENV_FLAG = 'AURORA_RUN_COMPLETENESS_CANARY';

/** A file whose one test passes. Relative to the repo root. */
export const PASS_FIXTURE_REL = 'test/config/fixtures/run-completeness-canary-pass.ts';

/** A second passing file, so a `--shard=1/2` child has two to split. */
export const PASS_2_FIXTURE_REL = 'test/config/fixtures/run-completeness-canary-pass-2.ts';

/**
 * A file whose test sends SIGKILL to the vitest fork running it, which is what
 * earlyoom's last stage does to a worker. Relative to the repo root.
 */
export const REAPED_FIXTURE_REL = 'test/config/fixtures/run-completeness-canary-reaped.ts';
