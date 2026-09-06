import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['scratchpad/vertical-onscreen-rig.vitest-script.ts'], environment: 'node' },
});
