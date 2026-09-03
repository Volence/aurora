import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['scratchpad/author-vertical-band.vitest-script.ts'], environment: 'node' },
});
