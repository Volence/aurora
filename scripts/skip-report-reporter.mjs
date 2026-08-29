/**
 * skip-report-reporter — make every SKIPPED test say, in the run's own output,
 * which test it was and why it did not run; and fail the run when a skip cannot
 * say why.
 *
 * WHY THIS EXISTS
 * ---------------
 * `check-test-collection.mjs` (the layer above) closes "a test file nothing
 * runs". This closes the next layer down: a file that IS collected, IS
 * executed, and SKIPS — contributing zero to a green total. In a suite summary
 * a silent skip and a pass are indistinguishable:
 *
 *     Test Files  414 passed | 2 skipped (416)
 *          Tests  5637 passed | 7 skipped (5644)
 *
 * Nothing there says WHICH seven, and nothing says why. The repo has been bitten
 * by exactly this: two `describe.skip` blocks were pinned to `s4_engine`, a repo
 * that does not exist on this machine, and measured nothing for months inside a
 * green total.
 *
 * WHY A REPORTER, AND NOT A PASS OVER `--reporter=json`
 * ----------------------------------------------------
 * Because the JSON reporter CANNOT carry the reason. Measured 2026-08-29 on
 * vitest 4.1.4: for a test skipped by `ctx.skip('<reason>')`, the JSON
 * reporter's assertion record is
 *
 *     { status: "skipped", failureMessages: [], meta: {}, tags: [] }
 *
 * — the reason is simply absent. The default reporter is no better: it prints
 * `✓ path (8 tests | 1 skipped)` and never names the test, let alone the reason.
 * `ctx.skip(note)`'s note is exposed on exactly one surface, the Reporter API's
 * `TestCase.result().note`. A gate built on the JSON output would therefore be
 * structurally unable to see the reasons this repo already writes, and would
 * report its best-documented skips as unexplained. So: a reporter.
 *
 * THE THREE REASON CHANNELS, AND WHY THREE
 * ----------------------------------------
 * A conditional skip has no single message channel in vitest, so this reads all
 * three that exist. In priority order:
 *
 *   1. meta  — `test('n', { skip: cond, meta: { skipReason: 'why' } }, fn)`.
 *      THE PREFERRED SHAPE for a conditional skip. `describe.skipIf(cond)` and
 *      `it.skipIf(cond)` take no message at all, which is the whole reason
 *      unexplained skips exist in this tree; the options form does. Measured:
 *      `meta` on a `describe` PROPAGATES to `meta()` of every test inside it, and
 *      survives a collection-time skip, so one declaration covers a whole block.
 *      It is a dedicated field — it does not deform the test's name.
 *
 *   2. note  — `ctx.skip('why')`, read from `result().note`. The RUNTIME shape:
 *      the only one available once a test has started, and the right one when
 *      the reason is only computable inside the test body. Already used across
 *      test/formats/*.
 *
 *   3. name  — the marker below appearing in the test's full name. The LEGACY
 *      shape (`test/live/s1-warp-live.test.ts` builds it), kept because it works
 *      and because it is the only channel that also survives `--reporter=json`.
 *      Not recommended for new code: a name is present whether or not anyone
 *      wrote a reason, so this channel needs a marker to tell "authored a
 *      reason" from "happens to be a long title", and a marker is a convention a
 *      reader can violate by accident. Channels 1 and 2 need no marker precisely
 *      because those fields exist ONLY when someone typed one.
 *
 *      KNOWN LIMIT, disclosed rather than papered over: a test whose name
 *      contains the word SKIPPED for unrelated reasons ("parses SKIPPED rows")
 *      would be credited with a reason it does not have. Channels 1 and 2 do not
 *      have this hole; that is why they are preferred.
 *
 * WHY AN UNEXPLAINED SKIP FAILS
 * -----------------------------
 * A skip is not a pass, and a report nobody is forced to read decays into the
 * same silence it was built to break. Printing alone would leave the next
 * `it.skipIf(cond)` someone writes just as mute as the `s4_engine` blocks were —
 * the report would faithfully print "(NO REASON GIVEN)" into a wall of green
 * output, which is the disease one layer further down.
 *
 * Note precisely what fails and what does not. SKIPPING NEVER FAILS. A
 * conditional skip on an absent fixture is CORRECT behaviour — `s1disasm`, the
 * `aeon` checkout and `s4_engine` are genuinely absent on other machines, and a
 * test that refuses to run without its fixture is doing the right thing. What
 * fails is a skip that will not say why, which is a defect in the test's
 * announcement and is fixed by typing one string. The failure message below
 * names the file, the test, and the exact shape to add.
 *
 * ANTI-VACUOUS
 * ------------
 * A check that passes when nothing was measured proves nothing. Two guards:
 *   - zero modules reported => COULD NOT MEASURE, loud and non-zero. "The runner
 *     produced nothing" must never render as "no problems found".
 *   - zero skips => an explicit line saying so. Silence on a clean run would be
 *     indistinguishable from the reporter not having run at all.
 * And `test/config/skip-report-wiring.test.ts` asserts this file is still wired
 * into vitest.config.ts, because a reporter dropped from the config would take
 * the whole gate with it and change no test's output.
 *
 * EXIT CODES (set via process.exitCode; vitest preserves it)
 *   unchanged  every skip named its reason
 *   1          at least one skip could not say why
 *   2          could not measure
 */

/** Metadata key carrying a skip's reason. See channel 1 above. */
const REASON_KEY = 'skipReason';

/**
 * Marker that promotes a test's NAME into a reason. See channel 3 above.
 * Deliberately uppercase and unpunctuated so it reads as deliberate at the call
 * site rather than as ordinary prose.
 */
const NAME_MARKER = 'SKIPPED';

const PREFIX = 'skip-report';

/** One line of the report, plus the classification the gate acts on. */
function classify(testCase) {
  const result = testCase.result();
  const meta = testCase.meta() ?? {};

  const fromMeta = typeof meta[REASON_KEY] === 'string' ? meta[REASON_KEY].trim() : '';
  if (fromMeta) return { channel: 'meta', reason: fromMeta };

  const fromNote = typeof result.note === 'string' ? result.note.trim() : '';
  if (fromNote) return { channel: 'note', reason: fromNote };

  if (testCase.fullName.includes(NAME_MARKER)) {
    return { channel: 'name', reason: testCase.fullName };
  }

  return { channel: null, reason: null };
}

export default class SkipReportReporter {
  /** Set from onInit; enforcement is pointless in watch mode (nothing exits). */
  #watch = false;

  onInit(vitest) {
    this.#watch = Boolean(vitest?.config?.watch);
  }

  onTestRunEnd(testModules) {
    const log = (line) => console.log(line);

    if (!Array.isArray(testModules) || testModules.length === 0) {
      console.error(
        `${PREFIX}: COULD NOT MEASURE — the run reported no test modules at all.\n` +
        '  This run says nothing about whether any test skipped silently; it is NOT\n' +
        '  evidence that none did.',
      );
      if (!this.#watch) process.exitCode = 2;
      return;
    }

    // Grouped by module so a reader sees the file they would open.
    /** @type {Map<string, {name: string, channel: string|null, reason: string|null, todo: boolean}[]>} */
    const byModule = new Map();
    let skipped = 0;
    let todos = 0;
    let unexplained = 0;

    for (const testModule of testModules) {
      for (const testCase of testModule.children.allTests()) {
        if (testCase.result().state !== 'skipped') continue;
        skipped++;

        // `it.todo` also reports as skipped. A todo IS its own declaration —
        // "this is not written yet" — so it is listed but never required to
        // carry a further reason.
        const todo = testCase.options.mode === 'todo';
        if (todo) todos++;

        const { channel, reason } = classify(testCase);
        if (!todo && channel === null) unexplained++;

        const id = testModule.relativeModuleId;
        if (!byModule.has(id)) byModule.set(id, []);
        byModule.get(id).push({ name: testCase.fullName, channel, reason, todo });
      }
    }

    if (skipped === 0) {
      // Said out loud on purpose: a clean run that printed nothing would be
      // indistinguishable from this reporter never having run.
      log(`\n${PREFIX}: no tests were skipped in this run (${testModules.length} module(s) reported).`);
      return;
    }

    log('');
    log(`${PREFIX}: ${skipped} SKIPPED test(s) in ${byModule.size} file(s). A SKIP IS NOT A PASS —`);
    log('  each of these contributed zero to the totals above.');
    for (const [id, rows] of [...byModule.entries()].sort()) {
      log('');
      log(`  ${id}`);
      for (const row of rows) {
        log(`    ↓ ${row.name}`);
        if (row.todo && row.channel === null) {
          log('        todo — declared unwritten');
        } else if (row.channel === null) {
          log('        (NO REASON GIVEN)');
        } else {
          log(`        [${row.channel}] ${row.reason}`);
        }
      }
    }
    if (todos > 0) log(`\n  (${todos} of the above ${todos === 1 ? 'is a' : 'are'} todo.)`);

    if (unexplained === 0) {
      log(`\n${PREFIX}: OK — every skip named its reason.`);
      return;
    }

    console.error(
      `\n${PREFIX}: FAIL — ${unexplained} skipped test(s) above give NO REASON.\n` +
      '\n' +
      '  A skip that does not say why is indistinguishable from a pass to anyone\n' +
      '  reading a total, which is how two blocks pinned to the deleted `s4_engine`\n' +
      '  tree measured nothing here for months inside a green suite.\n' +
      '\n' +
      '  SKIPPING IS NOT THE PROBLEM and this gate does not object to it: a test\n' +
      '  that refuses to run without an absent fixture is behaving correctly. Do\n' +
      '  NOT un-skip or delete a row to clear this. Say why instead — preferred\n' +
      '  shape, which works on `describe` (covering every test inside it) and on\n' +
      '  `it` alike:\n' +
      '\n' +
      "      describe('name', { skip: !PRESENT, meta: { skipReason: `${DIR} is absent` } }, () => {\n" +
      '\n' +
      '  or, when the reason is only known once the test is running:\n' +
      '\n' +
      "      it('name', (ctx) => { if (!PRESENT) { ctx.skip(`${DIR} is absent`); return; } … });\n",
    );
    if (!this.#watch) process.exitCode = 1;
  }
}
