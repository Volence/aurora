/**
 * Run-completeness canary: the file that FINISHES. Not run by the main suite;
 * run by `test/config/run-completeness-reporter.test.ts` in a child
 * `vitest run`, reached only through the include that `CANARY_ENV_FLAG` widens
 * (see run-completeness-markers.ts). Not `.test.ts` for the same reason as
 * `reporter-canary.ts`: check-test-collection.mjs would fail a test-shaped file
 * the ordinary include cannot reach. Keep it trivial.
 */
import { it, expect } from 'vitest';

it('finishes', () => {
  expect(1 + 1).toBe(2);
});
