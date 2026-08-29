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
    include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    // 'default' is vitest's normal output; the second names every SKIPPED test
    // with its reason, and fails the run when a skip cannot say why. The default
    // reporter prints only `✓ path (8 tests | 1 skipped)` — neither which test
    // nor why — and a skip that cannot be told from a pass is a silent zero
    // inside a green total. Declared HERE rather than in the `npm test` script so
    // a bare `npx vitest run` is covered too; `test/config/skip-report-wiring.test.ts`
    // fails if this line is dropped.
    reporters: ['default', './scripts/skip-report-reporter.mjs'],
    // Node-env global stubs for renderer modules that construct canvases at
    // import time (see the file header). Guarded to only define missing globals.
    setupFiles: [
      'src/test/offscreen-canvas-stub.ts',
      // After the canvas stub: this one imports renderer state modules.
      'src/test/register-history-factories.ts',
    ],
  },
});
