import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    globals: true,
    include: [
      'test/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      // The reporter canary's subject, reached ONLY when the guard's own child
      // run asks for it (test/config/reporter-visibility.test.ts). Off by
      // default so the main suite neither runs it nor counts its deliberate
      // skip, and so the canary's markers cannot leak into the output the guard
      // is grepping. See test/config/fixtures/reporter-canary.ts for why the
      // fixture is not named `.test.ts`.
      ...(process.env.AURORA_REPORTER_CANARY ? ['test/config/fixtures/reporter-canary.ts'] : []),
      // The failure-class reporter's subject, on the same terms and for the same
      // reasons (test/config/failure-class-reporter.test.ts). This one is even
      // more emphatically off by default: its rows FAIL ON PURPOSE, one of each
      // class, so a main-suite run that collected it would go red by design.
      ...(process.env.AURORA_FAILURE_CLASS_CANARY
        ? ['test/config/fixtures/failure-class-canary.ts']
        : []),
    ],
    // THE LINE BELOW IS LOAD-BEARING FOR TWO SEPARATE PROPERTIES. Both are
    // invisible when broken — no test fails, the suite stays green, and the
    // output simply gets quieter. Do not simplify it without reading both.
    //
    // 1. SKIP LEGIBILITY. The second reporter names every SKIPPED test with its
    //    reason and fails the run when a skip cannot say why. The default
    //    reporter prints only `✓ path (8 tests | 1 skipped)` — neither which
    //    test nor why — and a skip that cannot be told from a pass is a silent
    //    zero inside a green total.
    //
    // 2. CONSOLE VISIBILITY. Naming ANY reporter here also suppresses vitest's
    //    own auto-selection, which is `isAgent ? 'agent' : 'default'` — and
    //    `std-env`'s `isAgent` is true whenever this runs under a coding agent
    //    (CLAUDECODE, CURSOR_AGENT, AI_AGENT, …), i.e. most of the time in this
    //    repo. The `agent` reporter constructs itself with `silent: 'passed-only'`,
    //    so `console.log`/`console.warn` from a test that PASSES is swallowed.
    //    Measured on vitest 4.1.4: with this line a passing test's `console.log`
    //    appears; with it removed, it does not. A config-level `silent: false`
    //    does NOT rescue it — the agent reporter passes its own `silent` into
    //    `super()` before the caller's options, so `this.silent ??= config.silent`
    //    never fires. `process.stderr.write` survives either way, which is why
    //    the muting is easy to miss.
    //
    // 3. FAILURE CLASS. The third reporter separates the failures that are
    //    FINDINGS (assertions, which load cannot fake) from the ones that are
    //    LOAD-MANUFACTURED UNTIL PROVEN OTHERWISE (timeouts and would-blocks),
    //    and counts anything it cannot classify rather than folding it into
    //    either. It changes no exit code; a timeout still fails the suite. It
    //    exists because a merged-tree run came back with four failures, one
    //    assertion and three timeouts, and it cost FIVE full suite runs to
    //    learn that, since the output presented all four identically.
    //
    // Declared HERE rather than in the `npm test` script so a bare
    // `npx vitest run` is covered too, and so `scripts/land.mjs` (which runs
    // `npm test`) gets the classification without that script being touched.
    // Four guards watch this line:
    // `test/config/skip-report-wiring.test.ts` reads this file as text and fails
    // if the line is dropped or reordered; `test/config/reporter-visibility.test.ts`
    // proves the console output actually still comes out;
    // `test/config/failure-class-wiring.test.ts` and
    // `test/config/failure-class-reporter.test.ts` do the same pair of jobs for
    // the third reporter, the second by provoking a real failure of each class.
    reporters: [
      'default',
      './scripts/skip-report-reporter.mjs',
      './scripts/failure-class-reporter.mjs',
    ],
    // Node-env global stubs for renderer modules that construct canvases at
    // import time (see the file header). Guarded to only define missing globals.
    setupFiles: [
      'src/test/offscreen-canvas-stub.ts',
      // After the canvas stub: this one imports renderer state modules.
      'src/test/register-history-factories.ts',
    ],
  },
});
