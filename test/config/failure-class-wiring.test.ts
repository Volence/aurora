/**
 * The failure-class reporter is only an instrument while something runs it.
 *
 * `scripts/failure-class-reporter.mjs` separates the failures that are FINDINGS
 * (assertions, which a busy machine cannot fake) from the ones that are
 * LOAD-MANUFACTURED UNTIL PROVEN OTHERWISE (timeouts and would-blocks). It is
 * wired in `vitest.config.ts`'s `reporters`, and dropping it there changes NO
 * test's output and NO exit code: the suite stays exactly as green or as red as
 * it was, and the four-failures-one-assertion distinction simply stops being
 * printed. That is the same silence the reporter exists to break, so the wiring
 * needs its own alarm.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE
 * ---------------------------------
 * This is a TEXT assertion and therefore a STRUCTURAL PROXY. It can tell you the
 * reporter is still named and still points at a file that exists. It CANNOT tell
 * you the reporter still WORKS. `test/config/failure-class-reporter.test.ts` is
 * the half that runs a child `vitest run` over deliberately-failing rows and
 * checks the buckets, and it is where behaviour is proven.
 *
 * It is a sibling of `skip-report-wiring.test.ts` rather than four more rows
 * inside it, so that the two reporters fail independently and the red says WHICH
 * one left.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  CLASS_ASSERTION,
  CLASS_TIMEOUT,
  CLASS_UNCLASSIFIED,
  PREFIX,
} from '../../scripts/failure-class-reporter.mjs';
import { CANARY_ENV_FLAG, CANARY_FIXTURE_REL } from './fixtures/failure-class-markers';

const REPO = resolve(__dirname, '../..');
const CONFIG = resolve(REPO, 'vitest.config.ts');
const LAND = resolve(REPO, 'scripts/land.mjs');
const REPORTER_REL = 'scripts/failure-class-reporter.mjs';

/** Every `./...`-style reporter path named in the config's `reporters` array. */
function declaredReporterPaths(source: string): string[] {
  const block = /reporters\s*:\s*\[([^\]]*)\]/s.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
}

describe('the failure-class reporter is wired into vitest.config.ts', () => {
  const source = readFileSync(CONFIG, 'utf8');

  it('ANTI-VACUOUS: the config really declares a `reporters` array to look inside', () => {
    // Without this, a config that lost the whole array would make the row below
    // assert over an empty list and could only ever pass by finding nothing.
    expect(source, 'vitest.config.ts declares no `reporters` array at all').toMatch(
      /reporters\s*:\s*\[/,
    );
    expect(declaredReporterPaths(source).length).toBeGreaterThan(0);
  });

  it('names the failure-class reporter among its reporters', () => {
    expect(declaredReporterPaths(source)).toContain(`./${REPORTER_REL}`);
  });

  it('the reporter it names is on disk', () => {
    expect(
      existsSync(resolve(REPO, REPORTER_REL)),
      `${REPORTER_REL} is named in vitest.config.ts but is not on disk`,
    ).toBe(true);
  });
});

describe('the config still reaches the failure-class canary\'s fixture', () => {
  // The behavioural guard runs a child `vitest run` over a fixture the ordinary
  // `include` deliberately cannot reach, because every row in it fails on
  // purpose. That child depends on two strings in vitest.config.ts. Renaming
  // either one there and nowhere else would leave the child with no test files
  // and a failure whose cause is three files away. These rows name it directly.
  const source = readFileSync(CONFIG, 'utf8');

  it('names the env flag that widens `include` for the canary child', () => {
    expect(
      source,
      `vitest.config.ts no longer mentions ${CANARY_ENV_FLAG}; the failure-class canary's child ` +
        'run cannot collect its fixture without it',
    ).toContain(CANARY_ENV_FLAG);
  });

  it('names the canary fixture, and the fixture is on disk', () => {
    expect(source).toContain(CANARY_FIXTURE_REL);
    expect(
      existsSync(resolve(REPO, CANARY_FIXTURE_REL)),
      `${CANARY_FIXTURE_REL} is named in vitest.config.ts but is not on disk`,
    ).toBe(true);
  });

  it('the fixture is gated so the MAIN suite never collects it', () => {
    // Not a nicety. Every row in that fixture fails deliberately, so a config
    // that included it unconditionally would add five permanent reds and the
    // repo would learn to read a red suite as normal.
    const gated = new RegExp(
      `process\\.env\\.${CANARY_ENV_FLAG}[^\\n]*\\n?[^\\n]*${CANARY_FIXTURE_REL.replace(/[.]/g, '\\.')}`,
    );
    expect(
      source,
      `${CANARY_FIXTURE_REL} must appear only behind a ${CANARY_ENV_FLAG} check in ` +
        'vitest.config.ts: its rows fail on purpose',
    ).toMatch(gated);
  });
});

describe('the landing refusal points at the classification, and cannot drift from it', () => {
  // `scripts/land.mjs` REFUSES to push when the suite fails, and its refusal is
  // the last line a reader sees. Anyone tailing that output misses the
  // `failure-class:` block entirely and then re-runs the suite hoping the red
  // goes away, which is right for a timeout and wrong for an assertion.
  //
  // ⚠ land.mjs SPELLS the strings rather than importing them, on purpose: an
  // import would let a deleted reporter break every landing at startup, and a
  // cosmetic pointer must never be able to do that. This file is the price of
  // that choice. It reads land.mjs as text and compares it against the
  // reporter's OWN exported constants, so a rename reddens here rather than
  // leaving the landing script quoting a vocabulary nothing prints any more.
  //
  // ⚠ AND IT READS THE REFUSAL LITERAL, NOT THE FILE. The first version of these
  // rows searched the whole of land.mjs and STAYED GREEN when the prefix was
  // deleted from the refusal, because the COMMENT above that refusal explains
  // what the pointer is for and mentions the prefix too. A comment outbids code
  // in a grep, and the version of this file that searched the whole source was
  // asserting that land.mjs still had a comment about the reporter.
  const source = readFileSync(LAND, 'utf8');

  /**
   * Just the argument to the `die()` that fires on a failed suite. Anchored on
   * the sentence the anti-vacuous row below proves is still there, and cut at
   * the call's close, so comments (which precede the call) are outside it.
   */
  function suiteFailureRefusal(text: string): string {
    const anchor = "die('the suite failed on the tree you were about to push";
    const start = text.indexOf(anchor);
    if (start === -1) return '';
    const end = text.indexOf(');', start);
    return end === -1 ? '' : text.slice(start, end);
  }

  const refusal = suiteFailureRefusal(source);

  it('ANTI-VACUOUS: land.mjs still refuses on a failed suite, and the refusal was found', () => {
    // Two things at once, both load-bearing: that the refusal still exists, and
    // that the extractor above still locates it. If it stopped locating it, every
    // row below would be asserting over an empty string and could only fail,
    // which is the safe direction but a confusing one, so it is named here.
    expect(source, 'scripts/land.mjs no longer refuses when the suite fails').toContain(
      'the suite failed on the tree you were about to push',
    );
    expect(
      refusal,
      'the extractor in this file could not isolate that refusal\'s text, so the rows below ' +
        'would be reading an empty string rather than the message a person sees',
    ).not.toHaveLength(0);
  });

  it('the refusal ITSELF names the reporter\'s output prefix', () => {
    expect(
      refusal,
      `land.mjs's suite-failure refusal does not mention "${PREFIX}:". That refusal is the last ` +
        'thing a reader sees, and the block it points at is the one that says whether re-running ' +
        'is even the right move. A mention in a nearby COMMENT does not count: nobody reads the ' +
        'source at the moment a landing is refused.',
    ).toContain(`${PREFIX}:`);
  });

  it('the refusal names all three classes, so it says what to do with each', () => {
    // Derived from the reporter's exports. Naming two of three would leave the
    // reader with nowhere to put the bucket that exists precisely because it
    // needs a human.
    for (const cls of [CLASS_ASSERTION, CLASS_TIMEOUT, CLASS_UNCLASSIFIED]) {
      expect(refusal, `land.mjs's suite-failure refusal does not mention ${cls}`).toContain(cls);
    }
  });
});

describe('the config points a reader at this reporter\'s guards', () => {
  // Same reasoning as the skip reporter's pointer rows beside it: the only thing
  // telling the next editor that this line carries a third property is the
  // comment above it, and comments rot. This keeps the pointers live.
  const source = readFileSync(CONFIG, 'utf8');
  const pointers = [...source.matchAll(/test\/[\w./-]*\.test\.ts/g)].map((m) => m[0]);

  it('points at THIS file, the structural guard', () => {
    // Derived from this file's own location, so moving it without updating the
    // config reddens here rather than quietly orphaning the pointer.
    const self = relative(REPO, __filename);
    expect(pointers, `vitest.config.ts does not mention ${self}`).toContain(self);
  });

  it('points at the behavioural guard as well', () => {
    expect(
      pointers,
      'vitest.config.ts names only the text guard for the failure-class reporter. The reporter ' +
        'is a reader aid rather than a gate, so the child-run guard is the ONLY thing that ' +
        'notices when it stops classifying; a reader who learns about one and not the other ' +
        'will assume the text row covers it.',
    ).toContain('test/config/failure-class-reporter.test.ts');
  });
});
