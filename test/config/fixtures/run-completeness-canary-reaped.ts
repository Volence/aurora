/**
 * Run-completeness canary: the file whose worker is REAPED. Not run by the main
 * suite; run by `test/config/run-completeness-reporter.test.ts` in a child
 * `vitest run`, reached only through the include that `CANARY_ENV_FLAG` widens
 * (see run-completeness-markers.ts).
 *
 * It sends SIGKILL to its own process. Under vitest 4.1.4's default `forks`
 * pool that process is the worker running this file, so this is a real worker
 * death, the same signal earlyoom sends at its last stage, not a simulation of
 * one. Measured by hand before this canary was written: `kill -9` on a fork
 * worker in a full run left that module `pending` in onTestRunEnd.
 *
 * Not `.test.ts` for the same reason as `reporter-canary.ts`. Keep it trivial.
 */
import { it } from 'vitest';

it('is reaped mid-test', () => {
  process.kill(process.pid, 'SIGKILL');
});
