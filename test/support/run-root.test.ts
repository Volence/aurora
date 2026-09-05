/**
 * THE O70 SPLIT, EXERCISED WITH THE TWO VARIABLES POINTED APART.
 *
 * `AURORA_DIR` (where do I live — observed, never overridable) and
 * `AURORA_BUILT_TREE` (which built tree do I RUN AGAINST — a directory of
 * artifacts, legitimately overridable) used to be one variable. Splitting one
 * variable into two means every existing caller now names one of them, and
 * sigil's caution on the landing (empyrean `contract/SUITE_PATHS.md` @ 8be3a16)
 * is the reason this file exists:
 *
 *     "a caller assigned to the wrong half is unnoticeable while both variables
 *      point at the same directory, which they will until someone sets the
 *      override for the first time."
 *
 * WHICH SHAPE, AND WHY NOT THE OTHER ONE. Sigil proposed landing with a gate
 * asserting the two names AGREE, so the first attempt to point them apart goes
 * red and the assignments get reviewed. Declined, and the reason is worth
 * writing down: such a gate fires on the one person doing the legitimate thing —
 * the operator pinning a built tree, the whole point of the new variable — and
 * it can only ever test the configuration in which a misassignment is invisible.
 * It cannot fail for the right reason. The inverse shape can: point them APART
 * on purpose, in one child process, and assert each half followed the variable
 * it was assigned. That is what every row below does, and it is the same shape
 * as `sibling-root.test.ts`'s `EMPYREAN_SUITE_ROOT moves a PEER and does NOT
 * move AURORA_DIR`, which is already the house pattern for this question.
 *
 * WHY THE SUBJECT IS `scratchpad/lib/run-root.mjs` AND NOT THE HARNESS.
 * `mapviewport-baseline-harness.mjs` is the run-target consumer, but it spawns
 * an Electron app against a built `dist/` on import, so a test cannot execute
 * it, and a property proved only inside it is proved nowhere. The walk lives in
 * a module the harness calls and this file executes — the same code path, with
 * the caller's own location passed in, which is the contract's own remedy for a
 * resolver anchored to its own file ("extract the walk … keep the cached wrapper
 * passing the compile-time anchor so production is unchanged, and have the test
 * call the walk with the bed's …").
 *
 * Every path here is `mkdtemp`-built or read back from the subject's own export.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const SUBJECT = resolve(__dirname, '../../scratchpad/lib/run-root.mjs');
const RESOLVER = resolve(__dirname, 'sibling-root.mjs');

/** The harness's own call, verbatim, so a bed cannot drift from production. */
const HARNESS = resolve(__dirname, '../../scratchpad/mapviewport-baseline-harness.mjs');

interface Run { status: number; stdout: string; stderr: string }

function run(body: string, env: Record<string, string> = {}): Run {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) {
    // ELECTRON_BIN joined this list with O72: `electronBin()` reads it, so an
    // ambient one on the developer's shell would make every row below assert
    // against that operator's binary instead of the tree under test.
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|AURORA_ROOT|AURORA_REPO|AURORA_BUILT_TREE|ELECTRON_BIN|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
  }
  const src = `import * as S from ${JSON.stringify(SUBJECT)};\n`
    + `import * as R from ${JSON.stringify(RESOLVER)};\n${body}\n`;
  // spawnSync, not execFileSync: O72 added `announceRunRoot`, whose whole job is
  // to WRITE, and it writes to stderr. execFileSync surfaces stderr only when
  // the child fails, so a row asserting the announcement on a SUCCESSFUL run
  // read an empty string and could never have failed for the right reason.
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', src], {
    env: { ...clean, ...env }, encoding: 'utf8', cwd: dirname(SUBJECT), stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: out.status ?? -1, stdout: out.stdout ?? '', stderr: out.stderr ?? '' };
}

/**
 * Blank out comments, keeping strings and every newline.
 *
 * ⚠ NOT `replace(/\/\*[\s\S]*?\*\//g, '')`. That was the first version here and
 * it was WRONG in a way that produced a confident false failure: a `//` line in
 * `classic-playtest-harness.mjs` mentions `src/main/aether/*.ts`, so the naive
 * block-comment pass found an opening `/*` inside a LINE comment and deleted
 * everything down to the next `*​/` — including that file's `run-root` import.
 * The row then reported the one migrated harness it could not see as the one
 * harness that had not been migrated. Same character-walk as the gate's.
 */
function stripComments(src: string): string {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') { out[i] = ' '; i++; } continue; }
    if (two === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') { if (src[i] !== '\n') out[i] = ' '; i++; }
      out[i] = ' '; out[i + 1] = ' '; i += 2; continue;
    }
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      const q = src[i++];
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

/** A directory that LOOKS built: both files `isRunnableTree` requires. */
function makeBuiltTree(label: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), `aurora-${label}-`));
  mkdirSync(resolve(dir, 'node_modules/.bin'), { recursive: true });
  writeFileSync(resolve(dir, 'node_modules/.bin/electron'), '#!/bin/sh\n', 'utf8');
  mkdirSync(resolve(dir, 'dist/main'), { recursive: true });
  writeFileSync(resolve(dir, 'dist/main/index.mjs'), '', 'utf8');
  return dir;
}

describe('run-root: the two halves of the O70 split, POINTED APART', () => {
  /**
   * THE ROW SIGIL'S CAUTION ASKS FOR, in its non-vacuous form.
   *
   * One child. `AURORA_BUILT_TREE` names a built tree that is NOT the tree the
   * caller lives in and NOT the aurora checkout. Then:
   *   · the run-target consumer FOLLOWS it (assigned to question 2 — correct);
   *   · `AURORA_DIR` is UNMOVED (question 1 — a fact, not a knob);
   *   · `borrowed` is true, which is the flag the harness prints so a reader
   *     knows whose build the numbers came from.
   *
   * Each half rules out a different wrong assignment. Without the first, a
   * subject that ignored the new variable entirely passes. Without the second, a
   * subject that made `AURORA_BUILT_TREE` an alias of the checkout — the O69
   * shape, one rename later — passes.
   */
  it('the run target follows AURORA_BUILT_TREE while AURORA_DIR does not move', () => {
    const built = makeBuiltTree('pinned-build');
    const lives = mkdtempSync(resolve(tmpdir(), 'aurora-lives-in-'));
    try {
      const out = run(
        `const r = S.resolveRunRoot(${JSON.stringify(lives)});\n`
        + 'process.stdout.write(JSON.stringify({ ...r, auroraDir: R.AURORA_DIR }));',
        { AURORA_BUILT_TREE: built },
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, unknown>;
      expect(r.root, 'the run target must follow the variable it was assigned').toBe(built);
      expect(r.auroraDir, 'the own checkout is observed and cannot be moved by this variable')
        .toBe(resolve(RESOLVER, '../../..'));
      expect(r.auroraDir).not.toBe(built);
      expect(r.source).toContain(`pinned: AURORA_BUILT_TREE=${built}`);
      // …and `here` was not silently substituted for either of them.
      expect(r.borrowed).toBe(true);
    } finally {
      rmSync(built, { recursive: true, force: true });
      rmSync(lives, { recursive: true, force: true });
    }
  });

  /**
   * THE ANTI-VACUOUS CONTROL for the row above: with the two variables NOT
   * pointed apart, the run target is the caller's own tree and `borrowed` is
   * false. A subject that returned the pinned tree unconditionally, or that
   * reported `borrowed` unconditionally, passes the row above and fails here.
   */
  it('with nothing pinned, a built caller runs in-tree and is NOT borrowed', () => {
    const built = makeBuiltTree('in-tree');
    try {
      const out = run(
        `const r = S.resolveRunRoot(${JSON.stringify(built)});\nprocess.stdout.write(JSON.stringify(r));`,
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, unknown>;
      expect(r.root).toBe(built);
      expect(r.here).toBe(built);
      expect(r.borrowed, 'the caller lives in the tree it ran against').toBe(false);
      expect(r.source).toContain('in-tree:');
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * THE WALK, which is the reason the override exists at all: a caller in a tree
   * with no build borrows the nearest built ancestor and SAYS SO.
   *
   * Built for real — the row makes a tree with both files and an unbuilt child
   * beneath it — rather than by injecting a predicate, so what runs is the
   * production `isRunnableTree`.
   */
  it('an unbuilt caller borrows the nearest built ancestor and reports borrowed', () => {
    const built = makeBuiltTree('ancestor');
    const child = resolve(built, 'nested/worktree-shaped');
    try {
      mkdirSync(child, { recursive: true });
      const out = run(
        `const r = S.resolveRunRoot(${JSON.stringify(child)});\nprocess.stdout.write(JSON.stringify(r));`,
      );
      const r = JSON.parse(out.stdout) as Record<string, unknown>;
      expect(r.root).toBe(built);
      expect(r.here).toBe(child);
      expect(r.borrowed).toBe(true);
      expect(r.source).toContain('walked up');
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * A PIN THAT NAMES NOTHING REFUSES — it does not quietly walk instead.
   *
   * The failure this closes: an operator types a stale path, the harness falls
   * back to a tree that IS built, runs, and reports a number for the build the
   * operator did not name. The refusal comes out of the resolver, not out of
   * this module, which is why it is asserted here rather than assumed.
   */
  it('a pinned tree that does not exist refuses rather than falling back to the walk', () => {
    const built = makeBuiltTree('would-have-been-found');
    try {
      const absent = resolve(built, 'no-such-build');
      const out = run(
        `const r = S.resolveRunRoot(${JSON.stringify(built)});\nprocess.stdout.write(JSON.stringify(r));`,
        { AURORA_BUILT_TREE: absent },
      );
      expect(out.status, `expected a refusal; got ${out.status} with stdout ${out.stdout}`).not.toBe(0);
      expect(out.stderr).toContain('SuitePathError');
      expect(out.stderr).toContain(`AURORA_BUILT_TREE=${absent}`);
      // NOT the walk's answer: a fallback here is the silent-wrong-build case.
      expect(out.stdout).toBe('');
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * ─────────── THE SECOND ROW: THE UNSET PATH, CONSTRUCTED NOT AMBIENT ───────────
   *
   * The apart-rows above prove each consumer follows the right NAME. They never
   * run the new name's UNSET path, so they are green whatever that path does
   * (empyrean `contract/SUITE_PATHS.md` @ c9bc05f, "Two rows, not one").
   *
   * WHICH OF THE THREE SHAPES THIS SPLIT TAKES, since the contract makes the
   * split declare it: `AURORA_BUILT_TREE` is **no default** — unset, the
   * resolver reports none. But the consumer of that none is not a fallback to
   * the old name; it is **an independent second derivation** (the walk), and the
   * sub-case that is MEANT to differ, because it searches for a BUILD rather
   * than a checkout and "a linked worktree is a real checkout and an unrunnable
   * one". That is the artifacts carve-out, so what these rows assert is not
   * equality — equality is the WRONG assertion here — but the announcement:
   * *"that the run ANNOUNCES the tree it chose, by name, and marks it when that
   * tree is not the one the script lives in."*
   *
   * CONSTRUCTED, and the row PROVES it rather than trusting `run`'s scrubber:
   * the child prints back what it saw in its own environment for both names, so
   * a row that went green because an ambient `AURORA_BUILT_TREE` happened to be
   * set — or because the scrub regex stopped matching — is not possible.
   */
  it('with BOTH names scrubbed, the announcement names the tree it chose and MARKS it borrowed', () => {
    const built = makeBuiltTree('announce-ancestor');
    const child = resolve(built, 'nested/no-build-here');
    try {
      mkdirSync(child, { recursive: true });
      const out = run(
        `const r = S.resolveRunRoot(${JSON.stringify(child)});\n`
        + 'process.stdout.write(JSON.stringify({\n'
        + '  line: S.describeRunRoot(r), borrowed: r.borrowed,\n'
        + '  sawBuilt: process.env[R.AURORA_BUILT_TREE_ENV] ?? "(unset)",\n'
        + '  sawDir: process.env[R.AURORA_DIR_ENV] ?? "(unset)",\n'
        + '}));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, string | boolean>;
      // The row is CONSTRUCTED: neither name was present in the child at all.
      expect(r.sawBuilt, 'an ambient override would make this row prove nothing').toBe('(unset)');
      expect(r.sawDir).toBe('(unset)');
      // …and with nobody having chosen, the derivation still SAYS what it did.
      expect(r.borrowed).toBe(true);
      expect(r.line, 'the announcement must name the tree the run is against').toContain(built);
      expect(r.line, 'and the tree the script lives in, so the two are readable apart').toContain(child);
      expect(r.line, 'and MARK it, because those two are not the same tree').toContain('BORROWED');
      expect(r.line).toContain('walked up');
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * THE ANTI-VACUOUS HALF of the row above, and it is the one that matters here:
   * a `describeRunRoot` that printed `BORROWED` unconditionally would satisfy
   * the contract's letter and tell a reader nothing, which is the same failure
   * as never printing it. Same shape, one built tree, no borrowing.
   */
  it('…and does NOT mark it when the tree it chose IS the one the script lives in', () => {
    const built = makeBuiltTree('announce-in-tree');
    try {
      const out = run(
        `const r = S.resolveRunRoot(${JSON.stringify(built)});\n`
        + 'process.stdout.write(JSON.stringify({ line: S.describeRunRoot(r), borrowed: r.borrowed }));',
      );
      const r = JSON.parse(out.stdout) as Record<string, string | boolean>;
      expect(r.borrowed).toBe(false);
      expect(r.line, 'it still names the tree: that half is owed on every run').toContain(built);
      expect(r.line, 'nothing was borrowed, so nothing may say so').not.toContain('BORROWED');
      expect(r.line).toContain('in-tree:');
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * ───────────── O72: THE TWO ARTIFACT PATHS, AND WHO COMPOSES THEM ─────────────
   *
   * `resolveRunRoot` answers with a DIRECTORY. Before O72 each of 104
   * instruments then composed the two artifact paths off a name of its own —
   * and 103 of them composed them off `AURORA_DIR`, the CHECKOUT, which is the
   * misassignment the O70 split exists to end and which is invisible from the
   * main checkout because both names are one directory there.
   *
   * These rows exercise the composition itself, with the caller's tree and the
   * built tree pointed APART, so a helper that quietly reached for `AURORA_DIR`
   * instead of its argument cannot pass.
   */
  it('electronBin and distMain compose off the tree they are GIVEN, not the checkout', () => {
    const built = makeBuiltTree('given-tree');
    try {
      const out = run(
        `const e = S.electronBin(${JSON.stringify(built)});\n`
        + `const m = S.distMain(${JSON.stringify(built)});\n`
        + 'process.stdout.write(JSON.stringify({ e, m, auroraDir: R.AURORA_DIR }));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, string>;
      expect(r.e).toBe(`${built}/node_modules/.bin/electron`);
      expect(r.m).toBe(`${built}/dist/main/index.mjs`);
      // The anti-vacuous half: the checkout is a DIFFERENT directory here, and
      // a helper that ignored its argument would have answered with it.
      expect(r.auroraDir).not.toBe(built);
      expect(r.e).not.toContain(r.auroraDir);
      expect(r.m).not.toContain(r.auroraDir);
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * ELECTRON_BIN STILL WORKS, and it is asserted rather than assumed.
   *
   * It predates the split, `docs/OVERSEER.md` documents it as the override an
   * agent worktree uses, and 61 instruments read it directly before O72. The
   * migration moved that read into one function; a migration that silently
   * dropped it would break every agent worktree and no other row here would go
   * red, because every other row runs with it scrubbed.
   */
  it('electronBin still honours ELECTRON_BIN, and it wins over the tree', () => {
    const built = makeBuiltTree('override-loses');
    try {
      const pinned = '/some/other/place/electron';
      const out = run(
        `process.stdout.write(JSON.stringify({\n`
        + `  withOverride: S.electronBin(${JSON.stringify(built)}),\n`
        + '  saw: process.env.ELECTRON_BIN ?? "(unset)",\n'
        + '}));',
        { ELECTRON_BIN: pinned },
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, string>;
      expect(r.saw, 'constructed, not ambient').toBe(pinned);
      expect(r.withOverride).toBe(pinned);
      // …and it does NOT leak into the other half: ELECTRON_BIN names one FILE,
      // so `distMain` must be untouched by it.
      const out2 = run(
        `process.stdout.write(S.distMain(${JSON.stringify(built)}));`, { ELECTRON_BIN: pinned },
      );
      expect(out2.stdout).toBe(`${built}/dist/main/index.mjs`);
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * THE WHOLE MIGRATION, IN ITS WORKTREE SHAPE — the row the main checkout
   * cannot produce.
   *
   * A linked git worktree is a real checkout with no `node_modules/` and no
   * `dist/`, sitting under a tree that has both. That is modelled exactly here:
   * an empty directory nested under a built one. The PRE-MIGRATION composition
   * (`<checkout>/node_modules/.bin/electron`) names a file that is not there;
   * `runTarget` answers with the built ancestor's paths and marks the run
   * borrowed. Both halves are asserted, because the second alone would pass for
   * a helper that always returned the ancestor.
   */
  it('runTarget from a worktree-shaped caller resolves the BUILT tree, where the old form found nothing', () => {
    const built = makeBuiltTree('worktree-parent');
    const worktree = resolve(built, '.claude/worktrees/agent-bed');
    try {
      mkdirSync(worktree, { recursive: true });
      const out = run(
        `import { existsSync } from 'node:fs';\n`
        + `const here = ${JSON.stringify(worktree)};\n`
        + 'const t = S.runTarget(here);\n'
        + 'process.stdout.write(JSON.stringify({\n'
        + '  electron: t.electron, main: t.main, root: t.root, borrowed: t.borrowed,\n'
        + '  newFormResolves: existsSync(t.electron) && existsSync(t.main),\n'
        + '  oldFormResolves: existsSync(`${here}/node_modules/.bin/electron`)\n'
        + '                    && existsSync(`${here}/dist/main/index.mjs`),\n'
        + '}));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, string | boolean>;
      expect(r.oldFormResolves, 'the pre-migration composition names files that are not there')
        .toBe(false);
      expect(r.newFormResolves, 'the migrated composition names files that ARE there').toBe(true);
      expect(r.root).toBe(built);
      expect(r.electron).toBe(`${built}/node_modules/.bin/electron`);
      expect(r.main).toBe(`${built}/dist/main/index.mjs`);
      expect(r.borrowed, 'and the run says whose build it measured').toBe(true);
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * THE ANNOUNCEMENT ACTUALLY LEAVES THE PROCESS, and on stderr.
   *
   * 104 instruments call `announceRunRoot` at module scope. A version that
   * composed the line and dropped it would leave every one of them silent about
   * whose build produced their numbers, which is the failure the carve-out
   * names, and no other row here would notice: they all read the RETURN value.
   */
  it('announceRunRoot writes the line to stderr and returns the value unchanged', () => {
    const built = makeBuiltTree('announce-writes');
    const worktree = resolve(built, 'nested/unbuilt');
    try {
      mkdirSync(worktree, { recursive: true });
      const out = run(
        `const t = S.runTarget(${JSON.stringify(worktree)});\n`
        + 'const back = S.announceRunRoot(t);\n'
        + 'process.stdout.write(JSON.stringify({ same: back === t, root: back.root }));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      expect(JSON.parse(out.stdout)).toEqual({ same: true, root: built });
      // stdout carries the measurement; provenance goes to stderr so it cannot
      // corrupt output another script reads.
      expect(out.stderr, 'the announcement must reach stderr').toContain(built);
      expect(out.stderr).toContain('BORROWED');
      expect(out.stdout, 'and must NOT be mixed into stdout').not.toContain('BORROWED');
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });

  /**
   * THE POPULATION IS WIRED — a set difference, not a count.
   *
   * Every `scratchpad/**` instrument that LAUNCHES the built app must resolve
   * what it launches through this module. "Launches" is read off the source the
   * way `check-harness-guards.mjs` reads it: the file names an `ELECTRON`
   * binding, or one of the two artifact paths, in code.
   *
   * ⚠⚠ THE POPULATION COMES FROM GIT, NOT FROM A DIRECTORY READ, AND THAT IS THE
   * WHOLE CORRECTNESS OF THIS ROW. It was a `readdirSync` walk when O72 landed,
   * it was GREEN in the worktree it was written in, and it went RED on the
   * merged tree naming four files: `effects-foreground-harness.mjs`,
   * `effects-foreground-2-harness.mjs`, `priority-zoom-probe.mjs`,
   * `short-viewport-harness.mjs`. All four are named INDIVIDUALLY in
   * `.gitignore` — nine such instruments sit at `scratchpad/` depth 1 on the
   * owner's machine, 172 present against 163 tracked — and an agent worktree is
   * a fresh checkout that carries none of them.
   *
   * Two things were wrong with that, and only the second is about this repo:
   *
   *   · A filesystem walk lets **whatever debris a given machine happens to
   *     carry** decide the colour. Green meant "this checkout has no stray
   *     instruments", never "the repo is correct", and it was red FOREVER on the
   *     owner's machine until someone edited files git does not track. Pass and
   *     fail both decided outside the repo — bar 19's family.
   *   · A gitignored instrument is DELIBERATELY outside the repo's contract.
   *     This repo cannot police what it does not carry, and a gate demanding
   *     edits to untracked local files asks for a change nobody can review or
   *     revert.
   *
   * WHY `ls-files` TWICE AND NOT ONCE, which is a deviation from the fix as
   * literally specified and is argued here rather than done quietly. Tracked-only
   * would fix the defect above and open one the gate that polices this same area
   * explicitly refuses to open: a brand-new instrument written the old way is
   * UNTRACKED at the exact moment its author runs `npm test`, which is the
   * moment this row exists to speak. `scripts/check-peer-path-literals.mjs`
   * enumerates the filesystem and then drops **only** what `git check-ignore`
   * names, and says why in as many words — *"UNTRACKED-BUT-NOT-IGNORED FILES ARE
   * STILL SCANNED, deliberately … Filtering on 'tracked' instead of 'ignored'
   * would open that hole in the ordinary write-test-commit path."* That is
   * exactly the population below, spelled in git rather than in `readdirSync`:
   * tracked, plus untracked-and-not-ignored. Two checks policing one population
   * must agree about what that population IS, or they drift — and them
   * disagreeing about these four files, in the other direction, is precisely the
   * failure being fixed. Dropping the second call is a one-line change if the
   * tracked-only reading is preferred.
   *
   * ⚠ THE PREDICATE THAT DOES NOT WORK, recorded because it was the first one
   * written here and it went red for a reason worth keeping: "names an artifact
   * path in code" collapses to 11 files AFTER the migration, because a migrated
   * harness says `RUN.electron` and `MAIN` and never spells either path again. A
   * survey predicate that the fix itself invalidates measures the fix, not the
   * property.
   *
   * A hardcoded floor would rot, so the anti-vacuous half is only "the
   * enumeration found a population at all". The real recurrence guard is rule 4
   * of `check-peer-path-literals.mjs`, which polices the composition rather than
   * the import; this row is its structural companion and catches the other shape
   * — a harness that resolves correctly but by its own private copy.
   *
   * EXCLUDED, each for a stated reason: `lib/run-root.mjs` IS the module;
   * `check-harness-guards.mjs` and `lib/harness-guard.mjs` read those strings to
   * RECOGNISE a launcher and to build a pkill pattern, never to open a file;
   * `ozone-x11-proof.mjs` drives a synthetic probe app and needs the binary half
   * only — it takes `electronBin` and is asserted separately below.
   */
  it('every scratchpad instrument that launches the app resolves it through this module', () => {
    const repo = resolve(__dirname, '../..');
    /**
     * LOUD ON UNMEASURABLE. If git cannot answer, this row must say so rather
     * than fall through to an empty list, which would render as a clean tree.
     */
    const gitList = (args: string[]): string[] => {
      const out = spawnSync('git', ['-C', repo, 'ls-files', ...args, '--', 'scratchpad'],
        { encoding: 'utf8' });
      if (out.status !== 0) {
        throw new Error(`could not enumerate the population: git ls-files ${args.join(' ')} `
          + `exited ${out.status}: ${out.stderr}`);
      }
      return (out.stdout ?? '').split('\n').filter(Boolean);
    };
    const files = [...new Set([
      ...gitList([]),                              // tracked
      ...gitList(['--others', '--exclude-standard']), // new, and not ignored
    ])].filter((p) => p.endsWith('.mjs')).sort();

    const EXCLUDE = [
      'lib/run-root.mjs', 'lib/harness-guard.mjs', 'check-harness-guards.mjs', 'ozone-x11-proof.mjs',
    ];
    const launchers: string[] = [];
    const missing: string[] = [];
    for (const rel of files) {
      if (EXCLUDE.some((x) => rel.endsWith(x))) continue;
      const code = stripComments(readFileSync(resolve(repo, rel), 'utf8'));
      if (!/(?:^|[^.\w$])ELECTRON\b|node_modules\/\.bin\/electron|dist\/main\/index\.mjs/.test(code)) continue;
      launchers.push(rel);
      if (!/from '\.{1,2}\/(?:\.\.\/)*lib\/run-root\.mjs'/.test(code)) missing.push(rel);
    }
    // ANTI-VACUOUS: an enumeration that found nothing proves nothing.
    expect(launchers.length, 'no instrument launches the app: the enumeration found nothing')
      .toBeGreaterThan(50);
    expect(missing, `these launch the built app without the run-target module:\n${missing.join('\n')}`)
      .toEqual([]);
  });

  /**
   * THE ONE EXCEPTION, ASSERTED RATHER THAN LISTED.
   *
   * `ozone-x11-proof.mjs` is excluded from the row above because it drives a
   * synthetic probe app and would refuse to run on an unbuilt clone if it
   * demanded a `dist/`. An exclusion nobody checks is how a file quietly stops
   * resolving through the module at all, so what it DOES take is asserted here.
   */
  it('the ozone proof still takes the shared electron resolution, by its binary half', () => {
    const src = readFileSync(resolve(__dirname, '../../scratchpad/ozone-x11-proof.mjs'), 'utf8');
    expect(src).toContain("from './lib/run-root.mjs'");
    expect(src).toContain('electronBin(');
    // …and no longer reads the override itself, which is now `electronBin`'s job.
    expect(stripComments(src)).not.toContain('process.env.ELECTRON_BIN');
  });

  /**
   * THE CONSUMER IS ACTUALLY WIRED TO THIS MODULE.
   *
   * Every row above measures `run-root.mjs`. None of them can see the harness
   * quietly keeping a private copy of the walk, which is precisely the
   * misassignment sigil's caution is about — and the harness cannot be executed
   * here (it spawns Electron against a built `dist/` on import). So the wiring
   * is asserted structurally: the harness imports the module, calls it, and no
   * longer reaches for the own-checkout variable's accessor.
   */
  it('mapviewport-baseline-harness resolves its run target through this module', () => {
    const src = execFileSync('/bin/cat', [HARNESS], { encoding: 'utf8' });
    expect(src).toContain("from './lib/run-root.mjs'");
    expect(src).toContain('resolveRunRoot(');
    // …and it prints the announcement through the module too, rather than
    // composing its own line where no row can reach it.
    expect(src).toContain('describeRunRoot(RUN_ROOT)');
    // The accessor that conflated the two questions is gone from the consumer.
    expect(src, 'the harness must not resolve its run target from the own-checkout variable')
      .not.toContain('auroraDirOverride');
  });
});

/**
 * O52 — THE STALENESS GATE, AND THE HALF IT WAS NEVER CAPABLE OF.
 *
 * Eighteen instruments carried this gate inline and every one of them compared
 * `statSync(MAIN)` — the tree the run is AGAINST — against `find ${join(ROOT,
 * 'src')}` — the tree the file LIVES IN. In the main checkout those are one
 * directory. In a linked worktree they are two, and a worktree's `src/` mtimes
 * are its CHECKOUT time, so the gate fired unconditionally however fresh the
 * bundle was: it could refuse, and it could not pass.
 *
 * ⚠ SO "DOES IT FIRE?" IS A VACUOUS ROW HERE. A gate that fires unconditionally
 * passes such a row trivially, and a test built out of it would re-certify the
 * bug. The property is DISCRIMINATION — fires on a stale bundle, silent on a
 * fresh one — and both halves are asserted against trees whose mtimes are set by
 * hand, from a caller that lives somewhere else entirely (`here` !== `root`, the
 * worktree shape). The fresh row is the one the shipped expression could not
 * pass.
 */
describe('run-root: build freshness names ONE tree, and discriminates', () => {
  /** A built tree with `src/` too, and both mtimes stamped. */
  function makeTreeWithSource(label: string, distS: number, srcS: number): string {
    const dir = makeBuiltTree(label);
    mkdirSync(resolve(dir, 'src/renderer'), { recursive: true });
    writeFileSync(resolve(dir, 'src/main.ts'), '// source\n', 'utf8');
    writeFileSync(resolve(dir, 'src/renderer/App.tsx'), '// source\n', 'utf8');
    utimesSync(resolve(dir, 'src/main.ts'), srcS, srcS);
    utimesSync(resolve(dir, 'src/renderer/App.tsx'), srcS, srcS);
    utimesSync(resolve(dir, 'dist/main/index.mjs'), distS, distS);
    return dir;
  }

  /**
   * `here` is a SEPARATE tree whose sources are NEWER than either bundle below —
   * the worktree shape, and the exact operand the old expression used. Every row
   * in this block therefore runs in the environment where the shipped gate was
   * incapable of green.
   */
  function makeCallerTree(newestS: number): string {
    const dir = mkdtempSync(resolve(tmpdir(), 'aurora-lives-in-'));
    mkdirSync(resolve(dir, 'src'), { recursive: true });
    writeFileSync(resolve(dir, 'src/main.ts'), '// a different tree\n', 'utf8');
    utimesSync(resolve(dir, 'src/main.ts'), newestS, newestS);
    return dir;
  }

  const T = 1_700_000_000;

  it("is SILENT on a fresh bundle even when the CALLER's sources are newer", () => {
    const root = makeTreeWithSource('fresh-build', T + 100, T);
    const here = makeCallerTree(T + 9_999);      // newer than that bundle, as a checkout is
    try {
      const out = run(
        `const f = S.buildFreshness({ root: ${JSON.stringify(root)}, here: ${JSON.stringify(here)}, borrowed: true });\n`
        + 'process.stdout.write(JSON.stringify(f));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const f = JSON.parse(out.stdout) as Record<string, unknown>;
      expect(f.verdict, "the caller's own src/ must not enter the comparison at all").toBe('fresh');
      expect(f.root).toBe(root);
      expect(f.count, 'it must have actually found the sources it compared against').toBe(2);
      // …and the operand it used is inside the tree the run is against.
      expect(String(f.newestFile).startsWith(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(here, { recursive: true, force: true });
    }
  });

  it('FIRES on a stale bundle, from the same caller, naming the file and the tree', () => {
    const root = makeTreeWithSource('stale-build', T, T + 100);
    const here = makeCallerTree(T + 9_999);
    try {
      const out = run(
        `const f = S.buildFreshness({ root: ${JSON.stringify(root)}, here: ${JSON.stringify(here)}, borrowed: true });\n`
        + 'process.stdout.write(JSON.stringify(f));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const f = JSON.parse(out.stdout) as Record<string, unknown>;
      expect(f.verdict).toBe('stale');
      // The two rows differ ONLY in the built tree's own mtimes: same caller,
      // same shape, opposite verdicts. That is the discrimination.
      expect(String(f.newestFile).startsWith(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(here, { recursive: true, force: true });
    }
  });

  /**
   * LOUD ON UNMEASURABLE. A built tree with no `src/` cannot answer the question
   * at all, and the one thing that must never happen is for it to answer
   * "fresh". Both no-source shapes are covered because they fail differently: an
   * absent directory and a present-but-empty one.
   */
  it('refuses, never passes, when the tree carries no sources to compare', () => {
    const root = makeBuiltTree('no-src');
    const empty = makeBuiltTree('empty-src');
    mkdirSync(resolve(empty, 'src'), { recursive: true });
    writeFileSync(resolve(empty, 'src/notes.md'), 'not a source\n', 'utf8');
    try {
      const out = run(
        'const mk = (root) => S.buildFreshness({ root, here: root, borrowed: false });\n'
        + `const a = mk(${JSON.stringify(root)});\n`
        + `const b = mk(${JSON.stringify(empty)});\n`
        + 'let threw = null;\n'
        + `try { S.assertFreshBuild({ root: ${JSON.stringify(root)}, here: ${JSON.stringify(root)}, borrowed: false }, () => {}); }\n`
        + 'catch (e) { threw = e.message; }\n'
        + 'process.stdout.write(JSON.stringify({ a, b, threw }));',
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as {
        a: { verdict: string; why: string };
        b: { verdict: string; why: string };
        threw: string | null;
      };
      expect(r.a.verdict).toBe('unmeasurable');
      expect(r.a.why).toContain('does not exist');
      expect(r.b.verdict, 'a src/ with no .ts/.tsx is unmeasurable, not fresh').toBe('unmeasurable');
      expect(r.b.why).toContain('no .ts/.tsx');
      expect(r.threw, 'unmeasurable must REFUSE, not warn').toContain('BUILD FRESHNESS UNMEASURABLE');
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  });

  /**
   * A missing bundle is unmeasurable too, and it is the mapviewport shape: that
   * harness `statSync`d a hand-composed `dist/` path, so a tree without one gave
   * an ENOENT stack instead of a sentence. It now returns a verdict.
   */
  it('a tree with no built bundle is unmeasurable, not a crash', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'aurora-unbuilt-'));
    try {
      const out = run(
        `process.stdout.write(JSON.stringify(S.buildFreshness({ root: ${JSON.stringify(dir)}, here: ${JSON.stringify(dir)}, borrowed: false })));`,
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const f = JSON.parse(out.stdout) as { verdict: string; why: string };
      expect(f.verdict).toBe('unmeasurable');
      expect(f.why).toContain('no readable built bundle');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * THE BORROWED HALF, ANSWERED RATHER THAN WAVED AT. "Are this checkout's
   * sources in that bundle?" is not answerable from mtimes across two trees, so
   * it is answered by CONTENT — and both directions are asserted, because a
   * comparator that reported drift unconditionally would satisfy the second half
   * alone.
   */
  it('borrowed drift is measured by content, and reports BOTH identical and drifted', () => {
    const root = makeTreeWithSource('drift-root', T + 100, T);
    const same = makeTreeWithSource('drift-same', T + 100, T);
    const other = makeTreeWithSource('drift-other', T + 100, T);
    writeFileSync(resolve(other, 'src/main.ts'), '// EDITED in the caller only\n', 'utf8');
    writeFileSync(resolve(other, 'src/extra.ts'), '// only here\n', 'utf8');
    try {
      const out = run(
        `const d = (here) => S.borrowedSourceDrift({ root: ${JSON.stringify(root)}, here, borrowed: true });\n`
        + `process.stdout.write(JSON.stringify({ same: d(${JSON.stringify(same)}), other: d(${JSON.stringify(other)}) }));`,
      );
      expect(out.status, `stderr:\n${out.stderr}`).toBe(0);
      const r = JSON.parse(out.stdout) as Record<string, {
        comparable: boolean; differing: string[]; onlyHere: string[]; onlyRoot: string[]; total: number;
      }>;
      expect(r.same.comparable).toBe(true);
      expect(r.same.differing, 'byte-identical sources must report NO drift').toEqual([]);
      expect(r.same.onlyHere).toEqual([]);
      expect(r.same.onlyRoot).toEqual([]);
      expect(r.other.differing).toEqual(['main.ts']);
      expect(r.other.onlyHere).toEqual(['extra.ts']);
    } finally {
      for (const d of [root, same, other]) rmSync(d, { recursive: true, force: true });
    }
  });

  /**
   * THE CONSUMERS ARE WIRED TO IT, and no copy of the old expression survives.
   * Structural, for the same reason the mapviewport row above is: these files
   * spawn Electron on import and cannot be executed here. The population is
   * DERIVED — every tracked `.mjs` under scratchpad/ — so a nineteenth copy
   * pasted into a new instrument fails this row rather than hiding behind a list.
   */
  it("no instrument still compares a built bundle against its OWN checkout's src/", () => {
    const files = execFileSync('git', ['ls-files', 'scratchpad/*.mjs'], {
      cwd: resolve(__dirname, '../..'), encoding: 'utf8',
    }).split('\n').filter(Boolean);
    expect(files.length, 'the population must be non-empty or this row asserts nothing')
      .toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const rel of files) {
      if (rel.endsWith('scratchpad/lib/run-root.mjs')) continue;         // the one place it is spelled
      if (rel.endsWith('scratchpad/check-harness-guards.mjs')) continue; // the rule's own text
      const src = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      if (/STALER than src/.test(src) || /stat -c %Y/.test(src)) offenders.push(rel);
    }
    expect(offenders, 'these still hand-roll the two-tree staleness gate').toEqual([]);
  });
});
