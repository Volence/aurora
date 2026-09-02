/**
 * check-python-resolver — run the rows for the PYTHON half of the peer-path resolver,
 * and refuse to report a clean tree when they did not actually run.
 *
 *     npm run check:python-resolver          (and it is in the `npm test` chain)
 *
 * WHY A GATE SCRIPT AND NOT A TEST FILE
 * -------------------------------------
 * `scratchpad/lib/suite_paths.py` is Python. Vitest cannot execute it, and until
 * 2026-09-02 it had NO test file in any language at any path, which is the emptiest
 * form of the disjoint-population defect: a module with no test contributes no skip, no
 * failure and no line to any suite total, so a failing command and an empty world print
 * the same thing. The rows now exist (`scratchpad/lib/test_suite_paths.py`) and the one
 * thing that would make them worthless again is nobody running them, so they run where
 * everything else in this repo runs — inside `npm test`.
 *
 * WHY `python3 -m unittest` AND NOT PYTEST
 * ----------------------------------------
 * `unittest` is the standard library. pytest 9.1.1 happens to be installed on the
 * machine this was written on, and that is exactly the reason not to depend on it: a
 * gate in the `npm test` chain that needs a package nobody declared would pass here and
 * fail on the next checkout, and declaring it would mean adding a Python dependency to a
 * repository that has none. Nothing in these rows wants a fixture system.
 *
 * `python3` itself is NOT a new dependency: `check-ledger-timestamps` already shells out
 * to `scratchpad/ledger-timestamp-audit.py` from this same chain, and six instruments
 * under `scratchpad/` are Python. So a machine that cannot run `python3` already cannot
 * run `npm test`, and this gate reports that the same way that one does — exit 2, COULD
 * NOT MEASURE, never a quiet pass.
 *
 * WHY THIS FILE EXISTS AT ALL RATHER THAN THE BARE COMMAND IN package.json
 * -----------------------------------------------------------------------
 * A bare `python3 -m unittest discover …` in the chain is green when it runs seven rows
 * and green when it runs ZERO — a renamed file, a moved directory, a pattern that stops
 * matching, and `unittest` reports `Ran 0 tests … OK` with exit 0. That is the same
 * absence surface the rows themselves were written to close, reintroduced one level up.
 * So this file names the rows it requires, and exits 2 if any of them did not appear in
 * the run's output. Deleting a row is then a red suite, not a smaller green one.
 *
 * It also prints EVERY skip reason on stdout. The rows are written to stand down loudly
 * where a configuration does not exist — the real-main-checkout row cannot be measured
 * from a linked worktree, which is where agent sessions run — and whether that happened
 * has to be readable from the run rather than inferred from its colour.
 *
 * EXIT CODES
 *   0  every required row ran and the rows passed (skips are reported, not hidden)
 *   1  at least one row failed
 *   2  could not measure — python3 missing, the rows missing, a required row absent
 *      from the run, or no rows collected at all
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { AURORA_DIR } from '../test/support/sibling-root.mjs';

const PREFIX = 'check-python-resolver';

/** Where the rows live, and the directory `unittest` discovers from. */
const ROWS_DIR = join(AURORA_DIR, 'scratchpad', 'lib');
const ROWS_FILE = 'test_suite_paths.py';

/**
 * THE ANTI-VACUITY LIST — the rows this gate refuses to report a clean tree without.
 *
 * Named rather than counted. A count would be satisfied by seven of anything, and the
 * property that matters is that step 3 was measured in BOTH configurations plus the real
 * checkout, and that the two twins' variable tables were compared. Renaming a row is a
 * deliberate act and updating this list is part of it; deleting one silently is what
 * this list exists to stop.
 */
const REQUIRED_ROWS = [
  'Step3AnnounceTest.test_names_step_3_and_the_command_it_used',
  'Step3CwdPinTest.test_process_cwd_cannot_steer_the_derivation',
  'Step3LinkedWorktreeTest.test_answers_the_main_checkouts_parent',
  'Step3MainCheckoutTest.test_derives_the_suite_root_from_a_main_checkout_root',
  'Step3MainCheckoutTest.test_derives_it_from_a_main_checkout_subdirectory',
  'Step3RealCheckoutTest.test_and_this_checkout_when_it_is_a_main_one',
  'CrossTwinAliasTest.test_the_two_twins_accept_the_same_variables',
];

function die(msg) {
  console.error(`${PREFIX}: COULD NOT MEASURE — ${msg}`);
  process.exit(2);
}

// ---- guards: python and the rows must actually be there ---------------------

const rowsPath = join(ROWS_DIR, ROWS_FILE);
if (!existsSync(rowsPath)) {
  die(`the rows are not at ${relative(AURORA_DIR, rowsPath)}. This gate cannot tell a `
    + 'moved file from a deleted one, and either way the Python resolver went unmeasured.');
}

const version = spawnSync('python3', ['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0) {
  die(`python3 does not run here (${version.error?.message ?? `exit ${version.status}`}). `
    + 'The resolver under test is a Python module, so nothing about it was measured. '
    + '`check-ledger-timestamps` in this same chain needs python3 too.');
}

// ---- the run ----------------------------------------------------------------

// `-t` (top-level dir) is the rows' own directory so `import suite_paths` finds the
// subject beside them, which is the same import path the six instruments use.
const args = ['-m', 'unittest', 'discover', '-s', ROWS_DIR, '-t', ROWS_DIR, '-p', ROWS_FILE, '-v'];
const run = spawnSync('python3', args, { cwd: AURORA_DIR, encoding: 'utf8' });
if (run.error) die(`could not run python3 (${run.error.message}).`);

// unittest reports on stderr; the rows print their measurements on stdout.
const report = run.stderr ?? '';
const measurements = run.stdout ?? '';

if (measurements.trim()) console.log(measurements.trimEnd());
if (report.trim()) console.log(report.trimEnd());

// ---- anti-vacuity: the required rows must have appeared ----------------------

const ran = /^Ran (\d+) tests? in /m.exec(report);
if (ran === null) {
  die('the run produced no `Ran N tests` line, so this gate cannot tell a suite that '
    + `passed from one that never collected anything.\ncommand: python3 ${args.join(' ')}`);
}
const count = Number(ran[1]);
if (count === 0) {
  die(`\`python3 ${args.join(' ')}\` collected ZERO rows. The Python resolver has a test `
    + 'file and it did not run, which is the state this gate exists to make loud.');
}

const absent = REQUIRED_ROWS.filter((r) => !report.includes(r));
if (absent.length > 0) {
  die(`${absent.length} required row(s) did not appear in the run:\n`
    + absent.map((r) => `  - ${r}`).join('\n')
    + '\nEach names a property of the Python resolver that went unmeasured. If a row was '
    + 'renamed on purpose, rename it in REQUIRED_ROWS in this file too; if it was deleted, '
    + 'say in the commit which configuration is no longer covered.');
}

// ---- the verdict -------------------------------------------------------------

const skipped = (report.match(/\.\.\. skipped /g) ?? []).length;
console.log(
  `${PREFIX}: ran ${count} row(s) from ${relative(AURORA_DIR, rowsPath)} against `
  + `scratchpad/lib/suite_paths.py; all ${REQUIRED_ROWS.length} required row(s) present; `
  + `${skipped} skipped (reasons above, each naming what it did NOT measure).`);

if (run.status !== 0) {
  console.error(`${PREFIX}: FAILED — see the report above.`);
  process.exit(1);
}
process.exit(0);
