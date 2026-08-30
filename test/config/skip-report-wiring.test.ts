/**
 * The skip reporter is only a gate while something actually runs it.
 *
 * `scripts/skip-report-reporter.mjs` names every skipped test with its reason and
 * fails the run when a skip cannot say why. It is wired in `vitest.config.ts`'s
 * `reporters`, which is a single line that a merge, a refactor or a stray
 * `--reporter=` experiment can drop — and dropping it changes NO test's output.
 * The suite would go on being green, the skip block would stop being printed, and
 * nothing would say the gate had left. That is the same silence the reporter
 * exists to break, so it needs its own alarm.
 *
 * THE SAME LINE CARRIES A SECOND PROPERTY
 * ---------------------------------------
 * Naming any reporter at all also suppresses vitest's auto-selection, which is
 * `isAgent ? 'agent' : 'default'`. Under a coding agent — most runs in this tree —
 * that would pick the `agent` reporter, whose `silent: 'passed-only'` swallows
 * `console.log`/`console.warn` from every test that PASSES. So a reader who knows
 * only the skip reason above could "simplify" this line correctly by their own
 * lights and silently take the repo's console output with it.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE
 * ---------------------------------
 * This is a TEXT assertion and therefore a STRUCTURAL PROXY. It can tell you the
 * pin is still spelled right, still first, and still points at files that exist.
 * It CANNOT tell you the pin still WORKS: a future vitest that resolves
 * `reporters` differently, a `silent` setting added elsewhere, or a setup file
 * that stubs `console` would all leave every row here green and the output mute.
 * `test/config/reporter-visibility.test.ts` is the half that runs a real child
 * `vitest run` and looks for the output — that is where behaviour is proven, and
 * it is why this file deliberately does NOT try to enumerate the ways muting can
 * arrive. (Notably it does not forbid `'agent'` appearing later in the array:
 * with `'default'` asserted first, a trailing entry cannot mute anything, so such
 * a row could never fire on its own and would only be a vacuous gate.)
 *
 * This asserts the wiring, not the behaviour; `skip-report-reporter.test.ts`
 * drives the reporter itself.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  CANARY_ENV_FLAG,
  CANARY_FIXTURE_REL,
} from './fixtures/reporter-canary-markers';

const REPO = resolve(__dirname, '../..');
const CONFIG = resolve(REPO, 'vitest.config.ts');

/** Every `./…`-style reporter path named in the config's `reporters` array. */
function declaredReporterPaths(source: string): string[] {
  const block = /reporters\s*:\s*\[([^\]]*)\]/s.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
}

describe('the skip reporter is wired into vitest.config.ts', () => {
  const source = readFileSync(CONFIG, 'utf8');

  it('ANTI-VACUOUS: the config really declares a `reporters` array to look inside', () => {
    // Without this, a config that lost the whole array would make the row below
    // assert over an empty list and could only ever pass by finding nothing.
    expect(source, 'vitest.config.ts declares no `reporters` array at all').toMatch(
      /reporters\s*:\s*\[/,
    );
    expect(declaredReporterPaths(source).length).toBeGreaterThan(0);
  });

  it('names the skip reporter among its reporters', () => {
    expect(declaredReporterPaths(source)).toContain('./scripts/skip-report-reporter.mjs');
  });

  it('every reporter path the config names exists on disk', () => {
    // Renaming or moving the file without touching the config would otherwise
    // leave a config that mentions a gate that cannot load.
    for (const p of declaredReporterPaths(source)) {
      expect(existsSync(resolve(REPO, p)), `${p} is named in vitest.config.ts but is not on disk`)
        .toBe(true);
    }
  });

  it('keeps vitest\'s own `default` reporter alongside it, and FIRST', () => {
    // Two properties in one assertion, both real:
    //   - the skip reporter prints only the skip block, so if it ever replaced
    //     'default' the suite would lose its normal pass/fail output entirely;
    //   - 'default' leading the array is also what keeps a PASSING test's
    //     console output visible, because vitest only auto-selects its muting
    //     `agent` reporter when the array is empty, and a leading 'default'
    //     prints test logs regardless of what follows it.
    expect(
      source,
      'vitest.config.ts must name \'default\' as its FIRST reporter — see the header of this ' +
        'file for the second property that depends on it',
    ).toMatch(/reporters\s*:\s*\[\s*['"]default['"]/);
  });
});

describe('the config still reaches the reporter canary\'s fixture', () => {
  // `test/config/reporter-visibility.test.ts` proves the pin's BEHAVIOUR by
  // running a child `vitest run` over a fixture that the ordinary `include`
  // deliberately does not reach. That child depends on two strings in
  // vitest.config.ts. Renaming either one there and nowhere else would leave the
  // canary child with no test files to run — a loud failure, but one whose cause
  // is three files away. These rows name the cause directly.
  const source = readFileSync(CONFIG, 'utf8');

  it('names the env flag that widens `include` for the canary child', () => {
    expect(
      source,
      `vitest.config.ts no longer mentions ${CANARY_ENV_FLAG}; the reporter canary's child run ` +
        'cannot collect its fixture without it',
    ).toContain(CANARY_ENV_FLAG);
  });

  it('names the canary fixture, and the fixture is on disk', () => {
    expect(source).toContain(CANARY_FIXTURE_REL);
    expect(
      existsSync(resolve(REPO, CANARY_FIXTURE_REL)),
      `${CANARY_FIXTURE_REL} is named in vitest.config.ts but is not on disk`,
    ).toBe(true);
  });
});

describe('the config points a reader at both of the pin\'s guards', () => {
  // The pin protects two properties that fail silently and independently. The
  // only thing that tells the next editor there are two is the comment above the
  // line, and comments rot. These rows keep the two pointers live: whoever
  // renames or deletes a guard must come back here.
  const source = readFileSync(CONFIG, 'utf8');

  /** Every `test/….test.ts` path the config mentions anywhere, comments included. */
  const pointers = [...source.matchAll(/test\/[\w./-]*\.test\.ts/g)].map((m) => m[0]);

  it('points at THIS file, the structural guard', () => {
    // Derived from this file's own location, so moving it without updating the
    // config reddens here rather than quietly orphaning the pointer.
    const self = relative(REPO, __filename);
    expect(pointers, `vitest.config.ts does not mention ${self}`).toContain(self);
  });

  it('points at a SECOND, different guard — the behavioural one', () => {
    const self = relative(REPO, __filename);
    const others = [...new Set(pointers)].filter((p) => p !== self);
    expect(
      others,
      'vitest.config.ts names only the text guard. The pin also needs its behavioural guard ' +
        '(test/config/reporter-visibility.test.ts) named, or the next reader learns about one ' +
        'property and not the other.',
    ).not.toHaveLength(0);
  });

  it('every guard the config points at exists on disk', () => {
    // ANTI-VACUOUS by construction: the two rows above guarantee this list is
    // non-empty, so this can never pass by finding nothing to check.
    for (const p of new Set(pointers)) {
      expect(existsSync(resolve(REPO, p)), `${p} is named in vitest.config.ts but is not on disk`)
        .toBe(true);
    }
  });
});
