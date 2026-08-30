#!/usr/bin/env node
// check-test-collection — fail when a test-shaped file on disk is not a file
// vitest actually runs.
//
// WHY THIS EXISTS
// ---------------
// vitest.config.ts collects with:
//     include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts']
// That is NARROWER than the tree it governs. `src/renderer/foo.test.ts` (not in
// a __tests__ dir), a `.test.tsx`, and any `.spec.ts` all sit in the tree
// looking exactly like tests, get type-checked by `tsc` (tsconfig includes
// `src/**/*` and `test/**/*`), and are never executed. The suite total stays
// green because a file that is never collected contributes no failures — a
// silent zero inside a green number.
//
// This is the same defect shape that bit the repo on 2026-08-29: tsconfig had
// excluded `test/**/*` for months, `tsc --noEmit` reported clean, and a real
// mistyping in test/art/composer-buffer.test.ts survived it. Partial coverage
// reads as full coverage unless something measures the gap.
//
// HOW IT MEASURES
// ---------------
// Two live enumerations, compared. No counts are hardcoded anywhere in this
// file — a count copied from a measurement is a count that stops measuring.
//
//   A. COLLECTED — `vitest list --filesOnly`, i.e. vitest itself reporting what
//      its configured include/exclude actually resolve to. We ASK vitest rather
//      than re-implementing its glob semantics: a gate that re-implements the
//      matcher can only ever agree with a wrong matcher.
//
//   B. ON DISK — a filesystem walk for test-shaped names (below).
//
//   A \ B and B \ A are both errors, for different reasons; see COMPARISON.
//
// THE TEST-SHAPED SET, AND WHY THIS SET
// -------------------------------------
// TEST_SHAPED below mirrors vitest's OWN DEFAULT include glob:
//     **/*.{test,spec}.?(c|m)[jt]s?(x)
// That is the deliberate choice. The disk side must be strictly wider than the
// configured include or the check is circular and can only ever pass; and
// "wider" needs a principled edge, not an arbitrary one. vitest's default is
// that edge: it is the set of filenames vitest itself would recognise with no
// configuration at all, so any name in it is a name whose author had every
// reason to expect would run. A file matching the default but missed by this
// repo's narrowed include is precisely the silent zero.
//
// Concretely that admits .ts .tsx .js .jsx .mts .cts .mjs .cjs after a
// `.test.`/`.spec.` segment. This repo is TypeScript-only today and every
// collected file is `.test.ts`, but the .js family stays in: a `foo.test.js`
// here would be a real test that the configured include silently drops, which
// is exactly what this gate is for. Narrowing the set to what the repo happens
// to contain today would re-create the circularity.
//
// It does NOT admit bare `test.ts`, `tests/**`, `__tests__/**` without a suffix, or
// `*-test.ts`: vitest's default would not collect those either, so calling them
// "test-shaped" would make this gate assert something vitest never promised.
//
// SCOPE OF THE WALK
// -----------------
// The whole repo, minus:
//   - `.git` and `node_modules` — never sources, and walking node_modules is
//     expensive. (node_modules is also git-ignored, so the filter below would
//     drop it anyway; this is purely for speed.)
//   - any directory that is itself a git tree (holds a `.git` entry) — see
//     NESTED GIT TREES under EXCLUSIONS; every such skip is printed.
//   - anything git-ignored, asked of git itself (`git check-ignore`) rather
//     than re-derived here. That covers dist/ and out/, and it covers the
//     hard-linked fixture trees under scratchpad/fixtures/ that .gitignore
//     names — if one of those ever holds a copy of a repo with tests in it,
//     this gate must not drown in it.
// Note the walk is NOT limited to src/ and test/. A `scratchpad/x.test.ts` that
// is committed and never run is the same defect wearing a different directory,
// and the gate should say so.
//
// EXCLUSIONS
// ----------
// There are no per-file exceptions, deliberately. Helpers such as
// test/support/peer-repo.ts fall out on their own: they carry no `.test.`/
// `.spec.` segment, so they are not test-shaped and were never candidates.
// If a future exception is ever added here it needs its reason written beside
// it — an unexplained exception is how a gate stops covering what it claims.
//
// NESTED GIT TREES (added 2026-08-30). The walk does not descend into any
// directory below the root that contains a `.git` entry (file or directory):
// a nested repository or worktree is never this tree's source, and its test
// files are that tree's business. Every skip is printed on one line
// (`skipped N nested git tree(s): ...`) so the narrowing is visible; a gate
// that quietly shrinks its own scope is the vacuous-gate class again.
//   Measured reason: on 2026-08-30 the main tree held 27 finished agent
// worktrees under .claude/worktrees/agent-*/ and this gate reported 11853
// uncollected files even though `.git/info/exclude` ignores `.claude/`.
// `git check-ignore` was NOT the failure: rerun by hand on one nested file it
// answered `.git/info/exclude:18:.claude/` correctly, with and without
// --no-index, from a worktree (whose `.git` is a file pointing at the main
// repo — the common dir's info/exclude is consulted). What failed was the
// spawn: 27 worktrees x 450 test files x ~80 bytes of path is ~1.1 MB of
// check-ignore stdout, over Node's default 1 MiB spawnSync maxBuffer, so
// spawnSync returned ENOBUFS, dropIgnored() took its "git unavailable" branch
// (the note line above the FAIL was the tell) and kept every candidate. The
// cliff sits at 26 worktrees of that name length; 27 short-named probes
// (~972 KB) pass. Skipping nested trees in the walk keeps that volume from
// ever reaching git. The cliff itself is also raised in dropIgnored()
// (maxBuffer 64 MiB, and the note now names the error): 40 plain ignored
// copies of the test set (~1.4 MB, no `.git`, the scratchpad/fixtures shape
// this header already promises not to drown in) failed the same way with the
// walk skip alone.
//
// EXIT CODES
//   0  agree — every test-shaped file is collected
//   1  disagreement — offending paths printed
//   2  could not measure (vitest failed / timed out / returned nothing).
//      Deliberately NOT 0: "couldn't measure" must never render as
//      "found no problems".

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// vitest's default include, as a regex: `.test.` or `.spec.` followed by an
// optional c/m modifier, j or t, s, and an optional x.
const TEST_SHAPED = /\.(test|spec)\.[cm]?[jt]sx?$/;

const WALK_SKIP = new Set(['.git', 'node_modules']);

const TIMEOUT_MS = 120_000;

/** Repo-relative POSIX path. */
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

function fail(code, lines) {
  for (const line of lines) console.error(line);
  process.exit(code);
}

// ---------------------------------------------------------------- A. on disk

/** Repo-relative paths of nested git trees the walk refused to enter. */
const nestedTrees = [];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    fail(2, [
      'check-test-collection: COULD NOT MEASURE — failed to read a directory.',
      `  ${dir}: ${err.message}`,
      '  The on-disk enumeration is incomplete, so a "no problems" result would',
      '  be a claim this run cannot support.',
    ]);
  }
  // A directory below the root holding a `.git` entry (file for a worktree,
  // directory for a clone) is another tree, not this one. Recorded, never
  // silently dropped — the skip line is printed after the walk.
  if (dir !== ROOT && entries.some((e) => e.name === '.git')) {
    nestedTrees.push(rel(dir));
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (WALK_SKIP.has(entry.name)) continue;
      walk(abs, out);
    } else if (entry.isFile() && TEST_SHAPED.test(entry.name)) {
      out.push(rel(abs));
    }
  }
  return out;
}

/**
 * Drop git-ignored candidates. Asked of git rather than re-derived from
 * .gitignore here. If git cannot answer we keep every candidate: that can only
 * make the gate noisier (it prints paths a reader can judge), never quieter.
 */
function dropIgnored(candidates) {
  if (candidates.length === 0) return candidates;
  const res = spawnSync('git', ['check-ignore', '--stdin'], {
    cwd: ROOT,
    input: candidates.join('\n') + '\n',
    encoding: 'utf8',
    // git echoes every ignored path; Node's default 1 MiB maxBuffer overflowed
    // at ~12k paths on 2026-08-30 (ENOBUFS) and read as "git unavailable".
    maxBuffer: 64 * 1024 * 1024,
  });
  // exit 0 = some ignored, 1 = none ignored, 128 = not a repo / git error.
  if (res.error || (res.status !== 0 && res.status !== 1)) {
    const why = res.error
      ? `${res.error.code ?? ''} ${res.error.message}`.trim()
      : `exit ${res.status}: ${(res.stderr || '').trim()}`;
    console.error(
      'check-test-collection: note — `git check-ignore` unavailable ' +
        `(${why}); git-ignored paths (if any) are being kept as candidates.`,
    );
    return candidates;
  }
  const ignored = new Set(
    res.stdout.split('\n').map((s) => s.trim()).filter(Boolean),
  );
  return candidates.filter((p) => !ignored.has(p));
}

const walked = walk(ROOT, []);
if (nestedTrees.length > 0) {
  console.log(
    `check-test-collection: skipped ${nestedTrees.length} nested git tree(s): ` +
      nestedTrees.sort().join(', '),
  );
}
const onDisk = new Set(dropIgnored(walked).sort());

// ------------------------------------------------------------- B. collected

function collectedByVitest() {
  const require = createRequire(path.join(ROOT, 'package.json'));
  let cli;
  try {
    const pkgPath = require.resolve('vitest/package.json');
    const bin = require('vitest/package.json').bin;
    const entry = typeof bin === 'string' ? bin : bin?.vitest;
    if (!entry) throw new Error('vitest package declares no `vitest` bin');
    cli = path.resolve(path.dirname(pkgPath), entry);
  } catch (err) {
    fail(2, [
      'check-test-collection: COULD NOT MEASURE — cannot resolve the vitest CLI.',
      `  ${err.message}`,
      '  Without vitest there is no second enumeration to compare against.',
    ]);
  }

  const res = spawnSync(process.execPath, [cli, 'list', '--filesOnly'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (res.error && res.error.code === 'ETIMEDOUT') {
    fail(2, [
      `check-test-collection: COULD NOT MEASURE — \`vitest list\` timed out after ${TIMEOUT_MS}ms.`,
    ]);
  }
  if (res.error) {
    fail(2, [
      'check-test-collection: COULD NOT MEASURE — could not run `vitest list`.',
      `  ${res.error.message}`,
    ]);
  }
  if (res.status !== 0) {
    fail(2, [
      `check-test-collection: COULD NOT MEASURE — \`vitest list --filesOnly\` exited ${res.status}.`,
      '  --- stderr ---',
      (res.stderr || '(empty)').trimEnd(),
      '  --- stdout ---',
      (res.stdout || '(empty)').trimEnd(),
    ]);
  }

  const lines = res.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) {
    fail(2, [
      'check-test-collection: COULD NOT MEASURE — `vitest list --filesOnly` reported',
      '  no files at all. That is either a broken config or a broken invocation;',
      '  it is NOT evidence that the tree is clean.',
      '  --- stderr ---',
      (res.stderr || '(empty)').trimEnd(),
    ]);
  }

  // Each line must be a plain repo-relative path. Anything else means the
  // output shape changed under us and this gate is no longer parsing what it
  // thinks it is — which must be loud, not quietly tolerated.
  const bad = lines.filter((l) => l.startsWith('-') || path.isAbsolute(l));
  if (bad.length > 0) {
    fail(2, [
      'check-test-collection: COULD NOT MEASURE — unexpected `vitest list --filesOnly`',
      '  output; these lines are not repo-relative paths:',
      ...bad.slice(0, 10).map((l) => `    ${l}`),
    ]);
  }

  return new Set(lines.map((l) => l.split(path.sep).join('/')));
}

const collected = collectedByVitest();

// ------------------------------------------------------------- COMPARISON

const uncollected = [...onDisk].filter((p) => !collected.has(p)).sort();
const unrecognised = [...collected].filter((p) => !onDisk.has(p)).sort();

if (uncollected.length > 0 || unrecognised.length > 0) {
  const out = [];
  if (uncollected.length > 0) {
    out.push(
      `check-test-collection: FAIL — ${uncollected.length} test-shaped file(s) on disk that vitest does not collect.`,
      '',
      'These are type-checked but never RUN. The suite total stays green while',
      'they assert nothing:',
      ...uncollected.map((p) => `    ${p}`),
      '',
      'Fix by widening `include` in vitest.config.ts, or by moving/renaming the',
      'file so an existing pattern reaches it. Do not silence this by narrowing',
      'TEST_SHAPED in this script.',
    );
  }
  if (unrecognised.length > 0) {
    if (out.length > 0) out.push('');
    out.push(
      `check-test-collection: FAIL — vitest collects ${unrecognised.length} file(s) this gate does not recognise as test-shaped.`,
      '',
      'The gate is measuring a narrower set than vitest runs, so its "everything',
      'is collected" verdict would not cover these:',
      ...unrecognised.map((p) => `    ${p}`),
      '',
      'Fix by widening TEST_SHAPED (and its comment) in this script.',
    );
  }
  out.push('');
  out.push(
    `(on disk: ${onDisk.size} test-shaped; collected by vitest: ${collected.size})`,
  );
  fail(1, out);
}

console.log(
  `check-test-collection: OK — ${onDisk.size} test-shaped file(s) on disk, ` +
    `all ${collected.size} collected by vitest.`,
);
