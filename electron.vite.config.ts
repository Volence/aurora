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
    // ⚠ THIS DOES NOT FIX A DEFECT IN THE SHIPPED BUILD, AND AN EARLIER DRAFT OF
    // THIS COMMENT SAID IT DID. Measured by the overseer at landing, in the MAIN
    // checkout at master: a build there produces exactly TWO copies
    // (`index`, `classicProjectStore`) both before and after this line, and the
    // app paints. The three-copy build is reproducible only in an AGENT WORKTREE,
    // whose `node_modules` is a different tree from the main checkout's, so react
    // resolves differently there. The original draft cited three commits and read
    // as "master has been crashing", which is false and is the kind of claim a
    // build config is the worst place to carry.
    //
    // WHAT IT ACTUALLY BUYS, which is still worth the line: in a worktree a build
    // put a THIRD copy of react into the `project-runtime` chunk. `App.tsx`
    // imports that chunk at mount, so the first hook ran out of a copy react-dom
    // had never installed a dispatcher on:
    //
    //   TypeError: Cannot read properties of null (reading 'useCallback')
    //     at exports.useCallback (assets/project-runtime-*.js)
    //     at useProject → at App → renderWithHooks
    //
    // The window comes up, `document.title` is "Aurora", `#root` is EMPTY, and
    // NOTHING is logged unless you attach to CDP with `Runtime.exceptionThrown`
    // enabled — a blank app that reads as a hung one. It cost an agent a long
    // detour before any of its actual parcel could start, and every future agent
    // would pay it again. So this line exists to make a WORKTREE build behave like
    // a main-checkout build, not to repair the product.
    //
    // It is a no-op wherever the bundler already resolved to one copy — which is
    // the main checkout, verified both ways at landing rather than assumed.
    resolve: { dedupe: ['react', 'react-dom'] },
    plugins: [react(), flavourStamp()],
  },
});
