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
    // ONE REACT INSTANCE IN THE BUNDLE, STATED RATHER THAN HOPED FOR.
    //
    // Without this, a build of this tree here put a THIRD copy of react's
    // module into the `project-runtime` chunk (`ReactSharedInternals =` once in
    // `classicProjectStore`, twice in `index`, once more in `project-runtime`).
    // App.tsx imports project-runtime at mount, so the first hook it ran came
    // out of the copy react-dom had never installed a dispatcher on, and the
    // renderer died before painting anything:
    //
    //   TypeError: Cannot read properties of null (reading 'useCallback')
    //     at exports.useCallback (assets/project-runtime-*.js)
    //     at useProject → at App → renderWithHooks
    //
    // The window comes up, `document.title` is "Aurora", `#root` is EMPTY, and
    // there is no console line unless you attach to CDP and enable
    // Runtime.exceptionThrown — a blank app that reads as a hung one. Measured
    // 2026-09-09 across five consecutive builds (identical hashes each time) and
    // at three commits (c8652263, aa64764d, 8b606f8b), so it is neither flaky
    // nor a regression of any recent change. Adding the dedupe collapsed the
    // extra copy and the app painted.
    //
    // It is a no-op wherever the bundler already resolved to one copy, which is
    // why it is safe to state unconditionally rather than to leave to the
    // heuristic that disagreed with itself between two machines' builds of the
    // same source.
    resolve: { dedupe: ['react', 'react-dom'] },
    plugins: [react(), flavourStamp()],
  },
});
