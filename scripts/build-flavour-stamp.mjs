#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE BUILD SAYS WHICH FLAVOUR IT IS. Nothing downstream has to guess.
// ═══════════════════════════════════════════════════════════════════════════
//
// BUILD-FLAVOUR-INVISIBLE, booked 2026-09-06:
//
//     "A plain build reads as FRESH to every instrument in the repo, then the
//      harness dies because the debug hooks are absent. VITE_AURORA_DEBUG=1
//      leaves no mark on the file the freshness guard stats, so build flavour
//      is a fourth state collapsed into FRESH."
//
// `src/renderer/index.tsx` imports `debug-hooks.ts` only when
// `import.meta.env.VITE_AURORA_DEBUG === '1'`, so `window.__dbg` is in the
// renderer bundle of a DEBUG build and tree-shaken out of a PLAIN one. Both
// bundles are byte-fresh by mtime, both are correct builds, and the ~180
// instruments in `scratchpad/` that query `window.__dbg` work against exactly
// one of them. The freshness guard stats `dist/main/index.mjs`; an env var
// leaves no mark there, so every instrument in the repo called a plain build
// FRESH and the harness died several hundred lines later on `__dbg` absent,
// naming neither the cause nor the fix. `scripts/land.mjs` carries the
// measurement that ruled this out of ITS scope and named the guard as where
// the fix belongs.
//
// So the build writes down what it was: this module is the writer, and
// `scratchpad/lib/run-root.mjs` (`buildFlavour`, `assertDebugBuild`) is the
// reader. `electron.vite.config.ts` mounts the plugin.
//
// ═══ WHY A STAMP AND NOT A SCAN OF THE BUNDLE ═══
//
// The tempting cheap version is to grep the built renderer for `__dbg` and
// call its absence a plain build. That reproduces the defect one level down:
// a scan cannot tell "I looked and the symbol is not there" from "I could not
// look" (the file moved, the chunk was renamed, a minifier mangled the name),
// and both would render as PLAIN. A scan also asserts a fact about the
// bundle's INTERNALS that nothing in the repo guarantees. The build knows the
// answer for free at the moment it builds, so it writes it down, and a reader
// that cannot find or parse the stamp reports UNKNOWN rather than choosing a
// side. Three states, never two.
//
// ═══ WHY THE PLUGIN IS MOUNTED ON ALL THREE BUILDS ═══
//
// electron-vite runs main, preload and renderer as three builds. The reader
// treats a stamp OLDER than `dist/main/index.mjs` as UNKNOWN (a stamp that
// predates the bundle describes an earlier build), so the stamp has to be
// written after the last bundle no matter which order the three run in.
// Mounting the same plugin on all three makes the last write win by
// construction rather than by depending on a documented ordering. The writes
// are idempotent: same content, same path.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The env var that puts `window.__dbg` in the renderer bundle. */
export const DEBUG_ENV = 'VITE_AURORA_DEBUG';

/**
 * The value that turns it on, spelled ONCE here and asserted against the app's
 * own source in `test/build-flavour.test.ts`: `src/renderer/index.tsx`
 * compares `import.meta.env.VITE_AURORA_DEBUG === '1'`, and a stamp that
 * called `VITE_AURORA_DEBUG=true` a debug build would be a stamp that lies.
 */
export const DEBUG_ENV_ON = '1';

/** Where the stamp lives, relative to a built tree's root. */
export const BUILD_FLAVOUR_REL = 'dist/build-flavour.json';

/** Bumped when the shape changes; a reader that does not know the version
 *  reports UNKNOWN rather than reading fields it may be misreading. */
export const BUILD_FLAVOUR_STAMP_VERSION = 1;

/** The two flavours a build can be. `unknown` is a READER verdict, never a
 *  value a build writes: the build always knows which one it is. */
export const FLAVOURS = ['debug', 'plain'];

/** The command that produces a debug build, in the words a person types. */
export const DEBUG_BUILD_COMMAND = `${DEBUG_ENV}=${DEBUG_ENV_ON} npm run build`;

/**
 * Which flavour an environment produces.
 *
 * The predicate is `=== '1'` because that is what `src/renderer/index.tsx`
 * tests. Anything else, including `true`, `yes` and `0`, is a PLAIN build, and
 * the raw value is recorded beside the verdict so a person who set the wrong
 * spelling can see what they set.
 */
export function flavourOf(env = process.env) {
  return env[DEBUG_ENV] === DEBUG_ENV_ON ? 'debug' : 'plain';
}

/** The stamp's contents for this environment. */
export function stampContent(env = process.env, now = new Date()) {
  return {
    stamp: BUILD_FLAVOUR_STAMP_VERSION,
    flavour: flavourOf(env),
    // The RAW value, not a boolean: "I set VITE_AURORA_DEBUG=true and got a
    // plain build" is a question the stamp should be able to answer.
    [DEBUG_ENV]: env[DEBUG_ENV] ?? null,
    at: now.toISOString(),
    by: 'scripts/build-flavour-stamp.mjs',
  };
}

/**
 * Write the stamp for `root` (a tree root, not a dist directory) and return
 * what was written.
 */
export function writeBuildFlavourStamp(root, env = process.env, now = new Date()) {
  const path = join(root, BUILD_FLAVOUR_REL);
  const content = stampContent(env, now);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
  return content;
}

/**
 * The vite plugin. `root` is the repo root the build writes `dist/` into.
 *
 * `closeBundle` rather than `writeBundle`: it runs once per build after
 * everything is on disk, so the stamp cannot land between two chunk writes.
 */
export function buildFlavourStampPlugin(root) {
  return {
    name: 'aurora-build-flavour-stamp',
    closeBundle() {
      writeBuildFlavourStamp(root);
    },
  };
}
