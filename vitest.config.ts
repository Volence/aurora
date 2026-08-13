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
    // Node-env global stubs for renderer modules that construct canvases at
    // import time (see the file header). Guarded to only define missing globals.
    setupFiles: ['src/test/offscreen-canvas-stub.ts'],
  },
});
