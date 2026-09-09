/**
 * BUILD FLAVOUR IS VISIBLE TO THE INSTRUMENTS, AND UNKNOWN IS ITS OWN STATE.
 *
 * BUILD-FLAVOUR-INVISIBLE, booked 2026-09-06:
 *
 *     "A plain build reads as FRESH to every instrument in the repo, then the
 *      harness dies because the debug hooks are absent. VITE_AURORA_DEBUG=1
 *      leaves no mark on the file the freshness guard stats, so build flavour
 *      is a fourth state collapsed into FRESH."
 *
 * The fix is a stamp the build writes (`scripts/build-flavour-stamp.mjs`,
 * mounted in `electron.vite.config.ts`) and a reader that refuses
 * (`buildFlavour` / `assertDebugBuild` in `scratchpad/lib/run-root.mjs`).
 *
 * ═══ WHAT THESE ROWS ARE FOR, AND THE ONE THAT MATTERS MOST ═══
 *
 * The hazard in a three-state reader is that the third state quietly becomes a
 * shade of one of the other two. A reader that renders "I could not look" as
 * PLAIN has reproduced the original defect with better wording: it would tell
 * an author to rebuild when the real answer is that nothing here can say. So
 * the unknown rows below assert BOTH halves - that the verdict is `unknown`,
 * and that the refusal does not read as a claim about the build - and the
 * DISCRIMINATION row holds a built tree fixed and varies only the stamp's
 * flavour field, because "does it refuse?" is vacuous against a guard that
 * refuses everything.
 *
 * ═══ WHY THE READER HALF RUNS IN A CHILD ═══
 *
 * `scratchpad/lib/run-root.mjs` has no type declarations, so importing it from
 * a `.ts` test is an implicit `any` under `tsc --noEmit`, which is in this
 * repo's `npm test` chain. `test/support/run-root.test.ts` spawns a node child
 * for the same reason and this follows it rather than inventing a second
 * idiom. The WRITER half is imported directly: it has `build-flavour-stamp.d.mts`.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import {
  DEBUG_ENV, DEBUG_ENV_ON, BUILD_FLAVOUR_REL, BUILD_FLAVOUR_STAMP_VERSION, DEBUG_BUILD_COMMAND,
  flavourOf, stampContent, writeBuildFlavourStamp, buildFlavourStampPlugin,
} from '../scripts/build-flavour-stamp.mjs';

const SUBJECT = resolve(__dirname, '../scratchpad/lib/run-root.mjs');
const APP_ENTRY = resolve(__dirname, '../src/renderer/index.tsx');
const BUILD_CONFIG = resolve(__dirname, '../electron.vite.config.ts');

interface Run { status: number; stdout: string; stderr: string }

/** Run `body` with the reader imported as `S`, with the operator's overrides
 *  stripped so an ambient variable cannot decide a row. */
function run(body: string): Run {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) {
    if (/^(AURORA_BUILT_TREE|ELECTRON_BIN|.*_DIR)$/.test(k)) delete clean[k];
  }
  const src = `import * as S from ${JSON.stringify(SUBJECT)};\n${body}\n`;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', src], {
    env: clean, encoding: 'utf8', cwd: dirname(SUBJECT), stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: out.status ?? -1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}

/** A directory that looks built, with `dist/main/index.mjs` at a known mtime. */
function makeBuiltTree(label: string, distS = 1_700_000_000): string {
  const dir = mkdtempSync(resolve(tmpdir(), `aurora-${label}-`));
  mkdirSync(resolve(dir, 'node_modules/.bin'), { recursive: true });
  writeFileSync(resolve(dir, 'node_modules/.bin/electron'), '#!/bin/sh\n', 'utf8');
  mkdirSync(resolve(dir, 'dist/main'), { recursive: true });
  writeFileSync(resolve(dir, 'dist/main/index.mjs'), '', 'utf8');
  utimesSync(resolve(dir, 'dist/main/index.mjs'), distS, distS);
  return dir;
}

/** Put a stamp of arbitrary content in a built tree, newer than its bundle. */
function stamp(dir: string, content: unknown, atS = 1_700_000_100): void {
  const path = resolve(dir, BUILD_FLAVOUR_REL);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
  utimesSync(path, atS, atS);
}

interface Asked { flavour: string; why?: string; threw: string | null; printed: string }

/** Ask the reader about a tree; `{ flavour, why, threw, printed }`. */
function ask(dir: string): Asked {
  const out = run(
    `const RUN = { root: ${JSON.stringify(dir)}, here: ${JSON.stringify(dir)}, borrowed: false };\n`
    + 'const f = S.buildFlavour(RUN);\n'
    + 'let printed = "", threw = null;\n'
    + 'try { S.assertDebugBuild(RUN, (s) => { printed += s; }); } catch (e) { threw = e.message; }\n'
    + 'process.stdout.write(JSON.stringify({ flavour: f.flavour, why: f.why, threw, printed }));',
  );
  expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
  return JSON.parse(out.stdout) as Asked;
}

/**
 * The balanced `{ ... }` body of a top-level `key:` in the config, or null.
 *
 * Brace-counted rather than regexed: `plugins` is not always the first entry of
 * a block (the renderer's sits after its `build`), so a positional pattern
 * would report a correctly mounted plugin as missing, and a pattern loose
 * enough to avoid that would stop being able to say WHICH block it found.
 */
function blockOf(src: string, key: string): string | null {
  const start = new RegExp(`\\b${key}:\\s*\\{`).exec(src);
  if (start === null) return null;
  let i = start.index + start[0].length;
  let depth = 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  return depth === 0 ? src.slice(start.index, i) : null;
}

// Strings the refusals must carry. Both are DERIVED from the writer's exports
// rather than typed here, so a rename of either cannot leave these rows
// asserting yesterday's wording.
const COMMAND = DEBUG_BUILD_COMMAND;

describe('build-flavour stamp: the build records what it was', () => {
  it('the flavour predicate is the one the app itself tests', () => {
    // DERIVED FROM THE APP, not restated. `src/renderer/index.tsx` decides
    // whether `window.__dbg` exists at all; a stamp using a different
    // comparison would be a stamp that lies about the bundle it describes.
    const entry = readFileSync(APP_ENTRY, 'utf8');
    const m = /import\.meta\.env\.([A-Z_]+)\s*===\s*'([^']*)'/.exec(entry);
    expect(m, `no import.meta.env comparison found in ${APP_ENTRY}; this row cannot derive its `
      + 'expectation and refuses to assert a typed-in one').not.toBeNull();
    expect(m?.[1], 'the stamp watches a different variable from the app').toBe(DEBUG_ENV);
    expect(m?.[2], 'the stamp calls a different value "on" from the app').toBe(DEBUG_ENV_ON);
  });

  it('classifies the environment the way the app does, and records the raw value', () => {
    expect(flavourOf({ [DEBUG_ENV]: DEBUG_ENV_ON })).toBe('debug');
    // Every near miss is a PLAIN build, because the app's `=== '1'` says so.
    for (const v of ['true', 'yes', '0', '', 'TRUE']) {
      expect(flavourOf({ [DEBUG_ENV]: v }), `${DEBUG_ENV}=${JSON.stringify(v)}`).toBe('plain');
    }
    expect(flavourOf({})).toBe('plain');
    // The raw value survives, so "I set it to true and got a plain build" is
    // answerable from the stamp.
    expect(stampContent({ [DEBUG_ENV]: 'true' })[DEBUG_ENV]).toBe('true');
    expect(stampContent({})[DEBUG_ENV]).toBeNull();
    expect(stampContent({}).stamp).toBe(BUILD_FLAVOUR_STAMP_VERSION);
  });

  it('writes the stamp where the reader looks, from the plugin hook the build calls', () => {
    const dir = makeBuiltTree('flavour-write');
    try {
      writeBuildFlavourStamp(dir, { [DEBUG_ENV]: DEBUG_ENV_ON });
      const written = JSON.parse(readFileSync(resolve(dir, BUILD_FLAVOUR_REL), 'utf8')) as
        { flavour: string };
      expect(written.flavour).toBe('debug');

      // The plugin is the production path: the row above proves the writer, this
      // proves the hook electron-vite actually calls reaches it.
      const before = process.env[DEBUG_ENV];
      try {
        delete process.env[DEBUG_ENV];
        buildFlavourStampPlugin(dir).closeBundle();
        const viaPlugin = JSON.parse(readFileSync(resolve(dir, BUILD_FLAVOUR_REL), 'utf8')) as
          { flavour: string };
        expect(viaPlugin.flavour, 'the plugin must read the live environment, not a snapshot')
          .toBe('plain');
      } finally {
        if (before === undefined) delete process.env[DEBUG_ENV];
        else process.env[DEBUG_ENV] = before;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * THE STAMP IS ONLY WORTH ANYTHING IF THE BUILD MOUNTS IT, and the reader
   * reports UNKNOWN forever if it does not. That is loud rather than silent,
   * but a repo whose every harness refuses is not a working repo, so the
   * mounting is asserted here.
   *
   * All three builds, deliberately: the reader treats a stamp older than
   * `dist/main/index.mjs` as UNKNOWN, so the stamp has to be written after
   * whichever of the three finishes last, whatever order electron-vite runs
   * them in.
   */
  it('the build config mounts the stamp plugin on all three builds', () => {
    const cfg = readFileSync(BUILD_CONFIG, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(cfg, 'the config must import the stamp plugin').toContain('build-flavour-stamp.mjs');
    for (const build of ['main', 'preload', 'renderer']) {
      const body = blockOf(cfg, build);
      expect(body, `no ${build}: { ... } block found in ${BUILD_CONFIG}; this row cannot say `
        + 'anything about a block it could not find').not.toBeNull();
      expect(/plugins:\s*\[[^\]]*flavourStamp\(\)/.test(body ?? ''),
        `the ${build} build does not mount the flavour stamp plugin, so a build in which `
        + `${build} finishes last leaves a stamp older than the bundle it describes, and every `
        + 'instrument then reports UNKNOWN').toBe(true);
    }
  });
});

describe('build-flavour reader: three states, and unknown is not a shade of the other two', () => {
  /**
   * THE ROW THE WHOLE PARCEL RESTS ON. One built tree per side, identical in
   * every respect except the one field, so the opposite verdicts can only have
   * come from the flavour. A guard that refused both would pass a "does it
   * throw?" row and be worthless.
   */
  it('DISCRIMINATES: a debug stamp runs and a plain stamp refuses, same tree shape', () => {
    const dbg = makeBuiltTree('flavour-debug');
    const plain = makeBuiltTree('flavour-plain');
    try {
      stamp(dbg, stampContent({ [DEBUG_ENV]: DEBUG_ENV_ON }));
      stamp(plain, stampContent({}));

      const d = ask(dbg);
      expect(d.flavour).toBe('debug');
      expect(d.threw, 'a debug build must just run').toBeNull();
      expect(d.printed, 'and must SAY which flavour it is, which is the visibility this parcel '
        + 'exists for').toContain('DEBUG');

      const p = ask(plain);
      expect(p.flavour).toBe('plain');
      expect(p.threw, 'a plain build must be refused by an instrument needing the hooks')
        .not.toBeNull();
      expect(p.threw).toContain('PLAIN BUILD');
      // THE REFUSAL NAMES THE VARIABLE AND THE COMMAND. This is the difference
      // between this parcel and a better error message.
      expect(p.threw, 'the refusal must name the variable').toContain(DEBUG_ENV);
      expect(p.threw, 'and the command to run').toContain(COMMAND);
      expect(p.threw, 'and the tree to run it in').toContain(plain);
      expect(p.printed, 'a refusal must not also print a provenance line').toBe('');
    } finally {
      for (const d of [dbg, plain]) rmSync(d, { recursive: true, force: true });
    }
  });

  /**
   * FOUR WAYS THE QUESTION GOES UNANSWERABLE, and every one of them is
   * `unknown` rather than a guess. The second assertion in each pair is the
   * load-bearing one: an unknown that reads as PLAIN is the original defect
   * wearing a better message.
   */
  const unanswerable: ReadonlyArray<[string, (dir: string) => void, string]> = [
    ['no stamp at all', () => { /* nothing written */ }, 'no readable build-flavour stamp'],
    ['a stamp that is not JSON', (d) => stamp(d, '{ not json'), 'not readable JSON'],
    ['a stamp that is not an object', (d) => stamp(d, '"debug"'), 'does not hold an object'],
    ['a stamp from a future version', (d) => stamp(d, { stamp: 99, flavour: 'debug' }),
      'stamp version 99'],
    ['a stamp naming an unknown flavour',
      (d) => stamp(d, { stamp: BUILD_FLAVOUR_STAMP_VERSION, flavour: 'turbo' }),
      'flavour this reader does not know'],
    // The bundle was rebuilt by something that does not stamp: the old stamp is
    // still there, still parses, and describes a build that no longer exists.
    ['a stamp older than the bundle it would describe',
      (d) => stamp(d, stampContent({ [DEBUG_ENV]: DEBUG_ENV_ON }), 1_699_999_000),
      'OLDER than'],
  ];

  for (const [name, prepare, expected] of unanswerable) {
    it(`reports UNKNOWN, in those words, for ${name}`, () => {
      const dir = makeBuiltTree('flavour-unknown');
      try {
        prepare(dir);
        const r = ask(dir);
        expect(r.flavour, `${name} must not resolve to a flavour`).toBe('unknown');
        expect(r.why).toContain(expected);
        expect(r.threw, 'an unanswerable question must not become a pass').not.toBeNull();
        expect(r.threw).toContain('BUILD FLAVOUR UNKNOWN');
        // ⚠ THE HALF THAT MATTERS. `unknown` must not be rendered as either
        // state: not as a claim the build is plain, and not as a pass.
        expect(r.threw, 'an unknown must not be reported as a plain build')
          .not.toContain('PLAIN BUILD');
        expect(r.threw, 'and it must still say what to type').toContain(COMMAND);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  /**
   * THE VISIBILITY HALF OF THE ROW. `assertFreshBuild` is what the ~18
   * instruments that ask about the bundle at all already call, and flavour was
   * in none of its output. It PRINTS rather than refuses there: a plain build
   * is a legitimate thing for an instrument that never touches `window.__dbg`
   * to run against, so the refusal belongs to `assertDebugBuild`.
   */
  it('assertFreshBuild now says which flavour it just called fresh, and still passes a plain one',
    () => {
      const dir = makeBuiltTree('flavour-fresh', 1_700_000_000);
      try {
        mkdirSync(resolve(dir, 'src'), { recursive: true });
        writeFileSync(resolve(dir, 'src/a.ts'), '// source\n', 'utf8');
        utimesSync(resolve(dir, 'src/a.ts'), 1_699_999_000, 1_699_999_000);
        stamp(dir, stampContent({}));
        const out = run(
          'let printed = "", threw = null;\n'
          + `try { S.assertFreshBuild({ root: ${JSON.stringify(dir)}, here: ${JSON.stringify(dir)}, borrowed: false }, (s) => { printed += s; }); }\n`
          + 'catch (e) { threw = e.message; }\n'
          + 'process.stdout.write(JSON.stringify({ printed, threw }));',
        );
        expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
        const r = JSON.parse(out.stdout) as { printed: string; threw: string | null };
        expect(r.threw, 'a fresh plain build is still fresh; this must not become a refusal')
          .toBeNull();
        expect(r.printed, 'the freshness line is unchanged').toContain('build: FRESH');
        expect(r.printed, 'and the flavour is now beside it').toContain('build flavour: PLAIN');
        expect(r.printed, 'naming the command, where a person is reading')
          .toContain(COMMAND);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
});
