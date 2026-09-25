/**
 * run-completeness-reporter — say, in the run's own output, whether every test
 * module THIS invocation selected actually finished; fail the run when one did
 * not; and leave a record `scripts/land.mjs` checks before it pushes.
 *
 * WHY THIS EXISTS (ROADMAP row 204)
 * ---------------------------------
 * `scripts/land.mjs` refuses a non-zero `npm test`, so a RED suite is caught.
 * Nothing certified COMPLETENESS: the failure-class reporter printed
 * `no failures in this run (N module(s) reported)` with no expected N beside it,
 * and this box runs `earlyoom` with `node` and `electron` on its `--prefer`
 * list, so this lane's test runner is a first-choice kill target.
 *
 * WHAT WAS MEASURED BEFORE THIS WAS WRITTEN (vitest 4.1.4, 2026-09-25)
 * -------------------------------------------------------------------
 * The row relayed "a reaped run can exit 0" from oracle's cargo suite. On
 * vitest, every reap that could be produced here EXITED NON-ZERO:
 *
 *   kill -9 one fork worker mid-run    rc=1  `Worker exited unexpectedly`
 *   kill -15 one fork worker mid-run   rc=1  same unhandled error
 *   kill -15 the vitest process        rc=143
 *   kill -9 the vitest process         rc=137
 *   land.mjs's own execFileSync('npm', ['test']) with npm sent -15: status 143;
 *   npm sent -9: signal SIGKILL; one worker sent -9: status 1. All three throw,
 *   so land.mjs refuses.
 *
 * ⚠ BUT THE NON-ZERO EXIT IN THE WORKER CASE IS HELD BY ONE PATH, AND IT IS NOT
 * THE ONE A READER WOULD GUESS. Read off `TestRun.end` in vitest's cli-api:
 *
 *     const modules = specifications.map((spec) => spec.testModule).filter((s) => s != null);
 *     const state = isCancelling ? 'interrupted' : this.hasFailed(modules) ? 'failed' : 'passed';
 *
 * A spec that never got a module is FILTERED OUT before `onTestRunEnd` sees the
 * list, and a module left `pending` or `queued` is not "failed". The red in the
 * reaped runs came from the pool's UNHANDLED ERROR (`[vitest-pool]: Worker forks
 * emitted error`), which `_checkUnhandledErrors` turns into exitCode 1. So the
 * exit code certifies completeness only as long as every way of losing a module
 * also raises an unhandled error. This reporter checks the property itself.
 *
 * THE DISCRIMINATOR, AND WHY IT IS DERIVED
 * ----------------------------------------
 * `onTestRunStart(specifications)` is vitest telling us what THIS invocation
 * selected; `onTestRunEnd(testModules)` is what came back. Every selected spec
 * must have a module, and every module must be in a finished state (`passed`,
 * `failed` or `skipped`, never `pending` or `queued`). No count is typed anywhere:
 * a hardcoded expected N rots on every new test file.
 *
 * SUBSET POLICY
 * -------------
 * The expectation is WHAT THIS INVOCATION SELECTED. `vitest run some/file`,
 * a directory filter, `-t`, or a `--shard` is complete when everything it
 * selected finished, so a subset never goes red for being a subset (the shard
 * needs asking of vitest's sequencer; see onTestRunStart). The cost is that this reporter
 * alone cannot see a subset that should have been the whole suite (a `--shard`
 * or a filter slipped into the `test` script). That half belongs to the full
 * run, so `scripts/land.mjs` compares this record's selection against
 * `vitest list --filesOnly`, derived again at landing time.
 *
 * LOUD ON UNMEASURABLE
 * --------------------
 * If `onTestRunStart` never fired, or selected nothing, this cannot say whether
 * the run was complete. It says so, and sets exitCode 1: a run that cannot state
 * its own completeness is not certified complete.
 *
 * EXIT CODES (set via process.exitCode, as skip-report-reporter.mjs does)
 *   unchanged  COMPLETE
 *   1          INCOMPLETE or UNMEASURABLE (not in watch mode)
 *
 * THE RECORD
 * ----------
 * When `AURORA_RUN_COMPLETENESS_FILE` is set, the verdict is written there as
 * JSON. `scripts/land.mjs` sets it, and refuses to push if the file is absent
 * (the run never reached its end) or says anything but COMPLETE.
 *
 * Guarded by `test/config/run-completeness-reporter.test.ts`, which kills a real
 * vitest worker in a child run and reads this reporter's verdict back.
 */
import { writeFileSync } from 'node:fs';

export const PREFIX = 'run-completeness';
export const RECORD_ENV = 'AURORA_RUN_COMPLETENESS_FILE';
export const COMPLETE = 'COMPLETE';
export const INCOMPLETE = 'INCOMPLETE';
export const UNMEASURABLE = 'UNMEASURABLE';

/** The module states that mean "this file ran to its end". */
const FINISHED = new Set(['passed', 'failed', 'skipped']);

/** One key per (project, file), so a multi-project config cannot alias two runs. */
function keyOf(projectName, moduleId) {
  return `${projectName ?? ''}\u0000${moduleId}`;
}

/**
 * Pure verdict. `selected` is `{ project, moduleId }[]` from onTestRunStart, or
 * null when it never fired; `modules` is `{ project, moduleId, state }[]`.
 */
export function assessCompleteness(selected, modules, reason) {
  if (!Array.isArray(selected)) {
    return {
      status: UNMEASURABLE,
      why: 'vitest never announced which modules this run selected (onTestRunStart did not fire)',
      selected: [], finished: 0, missing: [], unfinished: [],
    };
  }
  if (selected.length === 0) {
    return {
      status: UNMEASURABLE,
      why: 'this run selected no test modules at all, so there is nothing to call complete',
      selected: [], finished: 0, missing: [], unfinished: [],
    };
  }

  const byKey = new Map();
  for (const m of modules ?? []) byKey.set(keyOf(m.project, m.moduleId), m);

  const seen = new Set();
  const missing = [];
  const unfinished = [];
  let finished = 0;
  for (const s of selected) {
    const k = keyOf(s.project, s.moduleId);
    if (seen.has(k)) continue;
    seen.add(k);
    const m = byKey.get(k);
    if (!m) { missing.push(s.moduleId); continue; }
    if (!FINISHED.has(m.state)) { unfinished.push({ moduleId: s.moduleId, state: m.state }); continue; }
    finished += 1;
  }

  const ids = [...seen].map((k) => k.split('\u0000')[1]);
  const interrupted = reason === 'interrupted';
  const status = missing.length || unfinished.length || interrupted ? INCOMPLETE : COMPLETE;
  const why = status === COMPLETE ? ''
    : interrupted && !missing.length && !unfinished.length
      ? 'vitest reported the run as interrupted'
      : `${missing.length + unfinished.length} selected module(s) did not finish`;
  return { status, why, selected: ids, finished, missing, unfinished, reason: reason ?? null };
}

/**
 * Landing-side check: the record against the file list vitest derives for the
 * full configured suite (`vitest list --filesOnly`). Pure; `land.mjs` supplies
 * both halves. Returns null when the record certifies the full suite, or a
 * sentence saying why it does not.
 */
export function verifyRecordAgainstExpected(record, expectedFiles) {
  if (!record || typeof record !== 'object') return 'the completeness record is not an object';
  if (record.status !== COMPLETE) {
    return `the run's own verdict was ${record.status ?? '(none)'}: ${record.why || '(no reason given)'}`;
  }
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) {
    return 'the expected file list is empty, so there is nothing to compare the run against';
  }
  const ran = new Set(record.selected ?? []);
  const expected = new Set(expectedFiles);
  const notRun = [...expected].filter((f) => !ran.has(f));
  const extra = [...ran].filter((f) => !expected.has(f));
  if (notRun.length === 0 && extra.length === 0 && record.finished === expected.size) return null;
  const show = (xs) => xs.slice(0, 10).map((x) => `\n    ${x}`).join('') + (xs.length > 10 ? `\n    ... and ${xs.length - 10} more` : '');
  return `the run finished ${record.finished} module(s) of the ${expected.size} that \`vitest list --filesOnly\` `
    + 'selects for the full suite'
    + (notRun.length ? `; ${notRun.length} expected file(s) were never selected:${show(notRun)}` : '')
    + (extra.length ? `; ${extra.length} file(s) ran that the full list does not name:${show(extra)}` : '');
}

export default class RunCompletenessReporter {
  #watch = false;
  /** @type {{project: string, moduleId: string}[] | null} */
  #selected = null;
  /** Captured once, then removed from this process's env (see onInit). */
  #recordFile = process.env[RECORD_ENV] || '';

  /** The Vitest instance, for resolving a `--shard` selection. */
  #vitest = null;

  onInit(vitest) {
    this.#vitest = vitest ?? null;
    this.#watch = Boolean(vitest?.config?.watch);
    // Several suite files spawn a CHILD `vitest run` of their own. Their
    // workers are forked from this process, so without this delete each child
    // would inherit the path and write ITS verdict over the one land.mjs is
    // about to read. The main run writes last, and a child's one-file
    // selection would fail land's comparison rather than pass it, but a record
    // with two writers is not one to rely on either way.
    delete process.env[RECORD_ENV];
  }

  async onTestRunStart(specifications) {
    let specs = [...(specifications ?? [])];
    // ⚠ `--shard` IS APPLIED AFTER THIS HOOK. Measured: `vitest run --shard=1/2`
    // announces all 675 specs here and then runs 338, and `TestRun.end` drops
    // the other 337 because they never got a module. Without this, every shard
    // reads INCOMPLETE, which breaks the subset policy above. So the shard is
    // asked of vitest's OWN sequencer, the same class and call the pool makes
    // (`specs = await sequencer.shard(Array.from(specs))` in cli-api's
    // createPool), rather than re-implementing its hash. If that cannot be
    // asked, the selection stays null and the verdict is UNMEASURABLE: a shard
    // this cannot resolve is not a shard it may call complete.
    const shard = this.#vitest?.config?.shard;
    if (shard) {
      try {
        const Sequencer = this.#vitest.config.sequence.sequencer;
        specs = await new Sequencer(this.#vitest).shard(specs);
      } catch (e) {
        console.error(`${PREFIX}: could not resolve this run's --shard selection: ${e.message}`);
        this.#selected = null;
        return;
      }
    }
    this.#selected = specs.map((spec) => ({
      project: spec.project?.name ?? '',
      moduleId: spec.moduleId,
    }));
  }

  onTestRunEnd(testModules, _unhandledErrors, reason) {
    const modules = (testModules ?? []).map((m) => ({
      project: m.project?.name ?? '',
      moduleId: m.moduleId,
      state: typeof m.state === 'function' ? m.state() : undefined,
    }));
    const verdict = assessCompleteness(this.#selected, modules, reason);
    // Consumed: a watch-mode re-run must announce its own selection.
    this.#selected = null;

    const file = this.#recordFile;
    if (file) {
      try {
        writeFileSync(file, JSON.stringify({ ...verdict, at: new Date().toISOString() }));
      } catch (e) {
        console.error(`${PREFIX}: could not write the completeness record to ${file}: ${e.message}`);
      }
    }

    if (verdict.status === COMPLETE) {
      console.log(
        `\n${PREFIX}: ${COMPLETE}, ${verdict.finished} of ${verdict.selected.length} module(s) this run selected finished.`,
      );
      return;
    }

    if (verdict.status === UNMEASURABLE) {
      console.error(
        `\n${PREFIX}: COULD NOT MEASURE: ${verdict.why}.\n`
          + '  This run cannot say whether it was complete, so it is not certified complete.',
      );
    } else {
      console.error(
        `\n${PREFIX}: ${INCOMPLETE}, ${verdict.finished} of ${verdict.selected.length} module(s) this run `
          + `selected finished; ${verdict.why}.\n`
          + '  A worker reaped by the OOM killer looks like this. The totals above describe a PART\n'
          + '  of the run and must not be quoted as the suite.',
      );
      for (const id of verdict.missing) console.error(`    never reported: ${id}`);
      for (const u of verdict.unfinished) console.error(`    left ${u.state}: ${u.moduleId}`);
    }
    if (!this.#watch) process.exitCode = 1;
  }
}
