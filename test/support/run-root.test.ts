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
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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
    if (/^(EMPYREAN_SUITE_ROOT|AURORA_PEER_ROOT|LIVE_AEON|AURORA_ROOT|AURORA_REPO|AURORA_BUILT_TREE|.*_DIR|AURORA_.*_REPO)$/.test(k)) delete clean[k];
  }
  const src = `import * as S from ${JSON.stringify(SUBJECT)};\n`
    + `import * as R from ${JSON.stringify(RESOLVER)};\n${body}\n`;
  try {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', src], {
      env: { ...clean, ...env }, encoding: 'utf8', cwd: dirname(SUBJECT), stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: out, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
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
    // The accessor that conflated the two questions is gone from the consumer.
    expect(src, 'the harness must not resolve its run target from the own-checkout variable')
      .not.toContain('auroraDirOverride');
  });
});
