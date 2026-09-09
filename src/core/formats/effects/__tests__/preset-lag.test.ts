// GUARD RESIDUE in `preset-lag.ts`: the two predicates nothing was holding.
//
// This module is the best-held surface the GUARD-SEAT-RESIDUE row has met. Of
// 16 mutations planted in it on 2026-09-09, 12 died and 2 more were shown to be
// incapable of discriminating at all: `preset-lag-disclosure.test.ts` asserts
// every clause of the sentence, both numbers of it, the lead, the measurement it
// names, and the premise itself, from both directions.
// See `docs/reviews/2026-09-09-guard-residue-ramp.md`.
//
// Two survived, and neither is a clause of the sentence. They are the two facts
// ABOUT the sentence that live outside it:
//
//   1. THE DATE. `PRESET_LAG_MEASURED_ON` is printed twice inside the disclosure
//      and is the staleness bound the whole hold rests on, and every row that
//      touches it reads the constant, so moving the constant a month back moved
//      the sentence with it and nothing noticed.
//   2. THE DEFAULT ARGUMENT. `presetLagDisclosure`'s default parameter IS
//      `PRESET_KEYS_AWAITING_AEON`, and that identity is the module's stated
//      claim that re-filling one list re-arms all five mount sites. Detaching it
//      to a fresh `[]` left the whole suite green.
//
// ⚠ THE MODULE ASKED FOR THE FIRST ROW IN ITS OWN WORDS. Its docblock records
// that between the arming and the retirement the header banner still read
// "RETIRED (AGAIN) 2026-09-03" while the constant below held `['boundary']`, and
// says why nothing caught it: "Nothing measured the banner, so nothing went
// red." This measures the banner.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PRESET_KEYS_AWAITING_AEON, PRESET_LAG_MEASURED_ON, presetLagDisclosure,
} from '../preset-lag';

const MODULE_PATH = fileURLToPath(new URL('../preset-lag.ts', import.meta.url));
const SOURCE = readFileSync(MODULE_PATH, 'utf8');

/** The rule character the file draws its state banners with. */
const BANNER = '═══';
/** How the file marks a banner that describes a PAST state it keeps for the reasoning. */
const HISTORY = 'KEPT FOR ITS REASONING';
/** Every ISO date on one line. Built per call: a global regex carries `lastIndex`. */
const datesIn = (line: string): string[] => line.match(/\d{4}-\d{2}-\d{2}/g) ?? [];

describe('the state banner and the constant under it cannot drift apart', () => {
  /**
   * The banner is prose and the constant is code, so they are two authors with
   * no arbiter. This is the arbiter. It deliberately does NOT pin a literal
   * date: a re-measure moves the constant, and this row must move with it and
   * only then demand the prose caught up.
   */
  it('every CURRENT banner carrying a date carries the measured-on date', () => {
    const banners = SOURCE.split('\n')
      .filter((l) => l.includes(BANNER))
      .filter((l) => !l.includes(HISTORY))
      .filter((l) => datesIn(l).length > 0);

    // Anti-vacuous: the banners this is about really are in the bytes.
    expect(
      banners.length,
      'no dated state banner found in preset-lag.ts, so this row is asserting nothing. Either the '
      + 'banners lost their rule characters or the file was restructured, and the drift this '
      + 'guards is unmeasured again.',
    ).toBeGreaterThanOrEqual(2);

    for (const line of banners) {
      for (const d of datesIn(line)) {
        expect(
          d,
          `a state banner in preset-lag.ts says ${d} while PRESET_LAG_MEASURED_ON says `
          + `${PRESET_LAG_MEASURED_ON}. That exact drift happened once already, in the gap between `
          + 'the arming and the retirement, and nothing went red because nothing read the banner. '
          + 'Re-date the banner, or re-measure and move the constant. A banner describing a PAST '
          + `state is exempt and marks itself so by saying ${HISTORY}.`,
        ).toBe(PRESET_LAG_MEASURED_ON);
      }
    }
  });

  /** And the date really does reach the reader, in both numbers of the sentence. */
  it('the sentence prints that date, on the singular premise and the plural one', () => {
    for (const replay of [['boundary'], ['patch_motion', 'patch_world_ys']]) {
      const s = presetLagDisclosure(replay)!;
      expect(s).not.toBeNull();
      expect(s.split(PRESET_LAG_MEASURED_ON).length - 1,
        'the disclosure names its measurement date fewer than twice').toBeGreaterThanOrEqual(2);
    }
  });
});

describe('re-filling ONE list is still the whole of a re-arm', () => {
  /**
   * ⚠ WHY THIS ROW READS THE SOURCE INSTEAD OF CALLING THE FUNCTION, and when to
   * retire it.
   *
   * The claim is that `presetLagDisclosure`'s default argument IS
   * `PRESET_KEYS_AWAITING_AEON`, so re-filling that one list puts the sentence
   * back everywhere with no other edit. While the premise is RETIRED the
   * constant is `[]`, so a default detached to a fresh `[]` behaves identically
   * for every input, and NO behavioural row anywhere can tell the two apart. A
   * module mock cannot either: the default expression resolves against this
   * module's own binding, not against whatever an importer was handed.
   *
   * So the identity is only visible in the source while the list is empty, and
   * the honest instrument is to read it. The day the premise re-arms, the row
   * below this one becomes load-bearing on its own and this one can go.
   */
  it('the default argument names the premise constant, not a fresh empty list', () => {
    const decl = SOURCE.split('\n').find((l) => l.includes('export function presetLagDisclosure('));
    expect(decl, 'presetLagDisclosure is no longer declared on one line; re-aim this row').toBeDefined();
    expect(
      decl,
      'presetLagDisclosure\'s default argument is no longer PRESET_KEYS_AWAITING_AEON. Every one of '
      + 'the five mount sites reads the constant explicitly today, so this is silent right now, but '
      + 'the module\'s contract is that re-filling ONE list re-arms the disclosure everywhere, and a '
      + 'detached default is a second premise nobody would think to fill.',
    ).toContain('keys: readonly string[] = PRESET_KEYS_AWAITING_AEON');
  });

  /**
   * The behavioural half. It is VACUOUS TODAY and says so: with the premise
   * empty both sides are null. It is kept because it is the row that carries the
   * weight the moment the premise re-arms, and a re-arm is a one-line edit in a
   * file whose whole point is that it can happen at any hour.
   */
  it('calling it with no argument is calling it with the premise', () => {
    expect(presetLagDisclosure()).toBe(presetLagDisclosure(PRESET_KEYS_AWAITING_AEON));
    // and the derivation is not simply constant: a non-empty premise speaks
    expect(presetLagDisclosure(['boundary'])).not.toBeNull();
  });
});
