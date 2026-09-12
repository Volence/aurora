// Config for scratchpad/switch-window-probe.vitest-script.ts ONLY. Not collected
// by the main suite (vitest.config.ts includes test/** and src/**/__tests__/**),
// and deliberately so: the probe measures an UNRULED behaviour, so a suite row
// would pin either the defect or a ruling nobody made
// (docs/reviews/2026-09-12-switch-window-measure.md).
//
// ONE of the main suite's two setupFiles, deliberately. The other,
// src/test/register-history-factories.ts, imports renderer state, and that
// chain reaches classic-bridge.ts, which then binds the REAL createIpcFileAccess
// before the probe's vi.mock exists (vitest does not re-mock a module a setup
// file already evaluated). Measured: with it, every open failed on
// "window.api.probePath is not a function" with 0 FileAccess calls. The probe
// calls registerHistoryFactories() itself, after its mocks, which is the whole
// body of that setup file. `reporters: ['default']` keeps a passing row's stdout
// visible under a coding agent (see vitest.config.ts, point 2 of its reporter
// comment).
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, '../src/core'),
      '@shared': resolve(__dirname, '../src/shared'),
    },
  },
  test: {
    include: ['scratchpad/switch-window-probe.vitest-script.ts'],
    environment: 'node',
    globals: true,
    reporters: ['default'],
    setupFiles: ['src/test/offscreen-canvas-stub.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
