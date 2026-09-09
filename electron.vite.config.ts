import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { buildFlavourStampPlugin } from './scripts/build-flavour-stamp.mjs';

// THE BUILD RECORDS ITS OWN FLAVOUR (BUILD-FLAVOUR-INVISIBLE, 2026-09-06).
//
// `VITE_AURORA_DEBUG=1` decides whether `window.__dbg` is in the renderer
// bundle, and it left no mark on any file an instrument stats: a plain build
// and a debug build were both FRESH to every freshness guard in the repo, so a
// CDP harness ran against a bundle with no hooks in it and died on
// `__dbg absent` hundreds of lines later. This plugin writes
// `dist/build-flavour.json` so `scratchpad/lib/run-root.mjs` can refuse up
// front and name the command to run. See scripts/build-flavour-stamp.mjs for
// why it is a stamp rather than a scan of the bundle, and why the same plugin
// is mounted on all three builds.
const flavourStamp = () => buildFlavourStampPlugin(__dirname);

export default defineConfig({
  main: {
    plugins: [flavourStamp()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
        external: ['electron'],
      },
    },
  },
  preload: {
    plugins: [flavourStamp()],
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
        formats: ['cjs'],
      },
      rollupOptions: {
        external: ['electron'],
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react(), flavourStamp()],
  },
});
