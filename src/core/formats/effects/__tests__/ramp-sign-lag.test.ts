// GUARD RESIDUE in `ramp-sign-lag.ts`: the twelve predicates nothing was holding.
//
// This module is the SIBLING of `preset-lag.ts` and is held nearly as well: of
// 40 mutations planted in it on 2026-09-09, 26 died, one was shown incapable of
// discriminating and one does not compile.
// `src/renderer/components/effects/__tests__/ramp-sign-lag-disclosure.test.ts`
// replays the RETIRED premise explicitly and asserts most of both sentences,
// which is why the words half here scores 17 of 25 where the same half of
// `channel-bands.ts` scored 0 of 9. See
// `docs/reviews/2026-09-09-guard-residue-channel-bands.md`.
//
// ⚠ TWO OF THE SURVIVORS ARE THE EXACT PAIR THE PREVIOUS PARCEL CLOSED NEXT
// DOOR. `docs/reviews/2026-09-09-guard-residue-ramp.md` found, in
// `preset-lag.ts`, that (1) the measurement DATE was unheld because every row
// that touched it READ THE CONSTANT, and (2) the disclosure's default argument
// being the premise constant was unobservable from behaviour. Both defects are
// here too, one module over, in a file with the same shape, and neither moved
// when the other was fixed. The first two describes below are that pair, and
// `rampSignRateCaveat` makes it a TRIPLE: this file has two functions defaulting
// to the premise, not one.
//
// The rest are clauses of the two sentences that carry the WHOLE of why an
// author should not act on the advice beside them: that the ROM does not build,
// that the fields are declared UNSIGNED (which is the entire mechanism), that
// the disclosure expires, and that the caveat exists so a nearest-value
// recommendation is not read as a fix.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  RAMP_SIGN_FIELDS,
  RAMP_SIGN_FIELDS_AWAITING_AEON,
  RAMP_SIGN_LAG_MEASURED_ON,
  RAMP_SIGN_LAG_MEASURED_AT,
  RAMP_SIGN_LAG_MEASUREMENT,
  rampSignLagFields,
  rampSignLagDisclosure,
  rampSignRateCaveat,
  type RampSignField,
} from '../ramp-sign-lag';

const MODULE_PATH = fileURLToPath(new URL('../ramp-sign-lag.ts', import.meta.url));
const SOURCE = readFileSync(MODULE_PATH, 'utf8');
const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');

/** The rule character the file draws its state banners with. */
const BANNER = '═══';
/** Every ISO date on one line. Built per call: a global regex carries `lastIndex`. */
const datesIn = (line: string): string[] => line.match(/\d{4}-\d{2}-\d{2}/g) ?? [];

/** The premise as it stood when the sentence was ARMED, replayed explicitly. */
const FILLED: readonly RampSignField[] = ['start', 'step'];

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE DATE, WHICH IS THE STALENESS BOUND THE WHOLE HOLD RESTS ON
// ═══════════════════════════════════════════════════════════════════════════
describe('the state banners and the constant under them cannot drift apart', () => {
  /**
   * The banners are prose and the constant is code, so they are two authors
   * with no arbiter. This is the arbiter, and it deliberately pins NO literal
   * date: a re-measure moves the constant, and this row moves with it and only
   * then demands the prose caught up.
   */
  it('every banner carrying a date carries the measured-on date', () => {
    const banners = SOURCE.split('\n')
      .filter((l) => l.includes(BANNER))
      .filter((l) => datesIn(l).length > 0);
    // Anti-vacuous: the banners this row is about really are in the bytes.
    expect(banners.length, 'no dated state banner found in ramp-sign-lag.ts, so this row asserts '
      + 'nothing. Either the banners lost their rule characters or the file was restructured, and '
      + 'the drift this guards is unmeasured again')
      .toBeGreaterThanOrEqual(2);
    for (const line of banners) {
      for (const d of datesIn(line)) {
        expect(d, `a state banner in ramp-sign-lag.ts says ${d} while RAMP_SIGN_LAG_MEASURED_ON `
          + `says ${RAMP_SIGN_LAG_MEASURED_ON}. Re-date the banner, or re-measure and move the `
          + 'constant. That exact drift is on record in the sibling module preset-lag.ts, whose '
          + 'own docblock says why nothing caught it: nothing measured the banner')
          .toBe(RAMP_SIGN_LAG_MEASURED_ON);
      }
    }
  });

  it('the date reaches the reader in BOTH sentences, and so does the revision', () => {
    // Every row that touches this constant reads the constant, so moving it a
    // month back moves every reader with it. What can still be measured is that
    // it arrives at all, in both surfaces, so a sentence that dropped its
    // provenance tail is caught even though a wrong VALUE would not be.
    const disclosure = rampSignLagDisclosure(FILLED)!;
    expect(disclosure).not.toBeNull();
    expect(disclosure).toContain(RAMP_SIGN_LAG_MEASURED_ON);
    expect(disclosure).toContain(RAMP_SIGN_LAG_MEASURED_AT);
    expect(disclosure).toContain(RAMP_SIGN_LAG_MEASUREMENT);

    const caveat = rampSignRateCaveat('step', [-1, 0], ['step'])!;
    expect(caveat).not.toBeNull();
    expect(caveat, 'the caveat rides inside a REFUSAL an author is about to act on, so it carries '
      + 'its own provenance rather than borrowing the disclosure, which may not be on screen')
      .toContain(RAMP_SIGN_LAG_MEASURED_ON);
    expect(caveat).toContain(RAMP_SIGN_LAG_MEASURED_AT);
    expect(caveat).toContain(RAMP_SIGN_LAG_MEASUREMENT);
  });

  it('the measurement names a row that EXISTS, at a path this repo really carries', () => {
    // ⚠ THE SENTENCE'S ONE ACTIONABLE INSTRUCTION. It tells the reader which
    // row can retire the claim, and a path that resolves to nothing sends them
    // to look for a file that has never been there. Renaming the drift test
    // without re-pointing this string is a one-line edit nothing else notices.
    const cited = RAMP_SIGN_LAG_MEASUREMENT.split(' ')[0];
    expect(cited, 'the measurement string no longer OPENS with the path of the row that can '
      + 'retire the sentence; re-aim this row rather than deleting it')
      .toMatch(/^test\/.*\.test\.ts$/);
    expect(existsSync(resolve(REPO, cited)),
      `ramp-sign-lag.ts tells a reader that ${cited} is the row that can retire its sentence, and `
      + 'that path is not in this repository')
      .toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. RE-FILLING ONE LIST IS STILL THE WHOLE OF A RE-ARM, AT BOTH SURFACES
// ═══════════════════════════════════════════════════════════════════════════
describe('both surfaces default to the ONE premise constant', () => {
  /**
   * ⚠ WHY THESE ROWS READ THE SOURCE INSTEAD OF CALLING THE FUNCTION, and when
   * to retire them.
   *
   * The claim is that each function's default argument IS
   * `RAMP_SIGN_FIELDS_AWAITING_AEON`, so re-filling that one list puts both
   * sentences back everywhere with no other edit. While the premise is RETIRED
   * the constant is `[]`, so a default detached to a fresh `[]` behaves
   * identically for every input and NO behavioural row anywhere can tell the
   * two apart. A module mock cannot either: a default expression resolves
   * against this module's own binding, not against what an importer was handed.
   *
   * So the identity is only visible in the source while the list is empty. The
   * day the premise re-arms, the behavioural rows below become load-bearing on
   * their own and these two can go.
   */
  it('rampSignLagFields defaults to the premise, not a fresh empty list', () => {
    expect(SOURCE, 'rampSignLagFields\'s default argument is no longer '
      + 'RAMP_SIGN_FIELDS_AWAITING_AEON. It is silent right now because the premise is empty, but '
      + 'the module\'s contract is that re-filling ONE list re-arms every surface, and a detached '
      + 'default is a second premise nobody would think to fill')
      .toContain('awaiting: readonly RampSignField[] = RAMP_SIGN_FIELDS_AWAITING_AEON,\n): RampSignField[] {');
  });

  it('rampSignRateCaveat defaults to the SAME premise', () => {
    // ⚠ AND THIS FILE HAS TWO OF THEM, which is what makes the pair worth a
    // row rather than a note: two defaults detached separately is two premises
    // to fill, and a re-arm that filled one would put the disclosure back on
    // screen while the caveat stayed silent inside the refusal.
    expect(SOURCE, 'rampSignRateCaveat\'s default argument is no longer '
      + 'RAMP_SIGN_FIELDS_AWAITING_AEON')
      .toContain('awaiting: readonly RampSignField[] = RAMP_SIGN_FIELDS_AWAITING_AEON,\n): string | null {');
  });

  /**
   * The behavioural halves. Both are VACUOUS TODAY and say so: with the premise
   * empty every side is empty or null. They are kept because they carry the
   * weight the moment the premise re-arms, and a re-arm is a one-line edit in a
   * file whose whole point is that it can happen at any hour.
   */
  it('calling either with no argument is calling it with the premise', () => {
    const values = { start: -1, step: -1 };
    expect(rampSignLagFields(values))
      .toEqual(rampSignLagFields(values, RAMP_SIGN_FIELDS_AWAITING_AEON));
    expect(rampSignRateCaveat('step', [-1, 0]))
      .toBe(rampSignRateCaveat('step', [-1, 0], RAMP_SIGN_FIELDS_AWAITING_AEON));
    // and neither derivation is simply constant: a filled premise speaks.
    expect(rampSignLagFields(values, FILLED)).toEqual(['start', 'step']);
    expect(rampSignRateCaveat('step', [-1, 0], ['step'])).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE FIELD LIST
// ═══════════════════════════════════════════════════════════════════════════
describe('the canonical field list', () => {
  it('is frozen, so no caller can reorder the list every sentence is built from', () => {
    // `RAMP_SIGN_FIELDS` is the module singleton both sentences enumerate. A
    // caller that could sort or push it would change the words of a disclosure
    // rendered anywhere else in the process, with no other trace.
    expect(Object.isFrozen(RAMP_SIGN_FIELDS)).toBe(true);
    expect(Object.isFrozen(RAMP_SIGN_FIELDS_AWAITING_AEON)).toBe(true);
    // Anti-vacuous: `Object.isFrozen` really can answer false here.
    expect(Object.isFrozen([...RAMP_SIGN_FIELDS])).toBe(false);
  });

  it('the report is in the MODULE canonical order, never the caller order', () => {
    // ⚠ BOTH DIRECTIONS, because a filter over the caller's own list would pass
    // any row that happened to hand its fields in canonical order. The premise
    // is a list somebody edits by hand, and the sentence reads better and
    // stays stable when the fields always come out the same way round.
    const values = { start: -1, step: -1 };
    expect(rampSignLagFields(values, ['start', 'step'])).toEqual(['start', 'step']);
    expect(rampSignLagFields(values, ['step', 'start']),
      'the premise was handed in reversed and the report came back reversed, so the sentence '
      + 'names the fields in whatever order the premise list happens to be written in')
      .toEqual(['start', 'step']);
    // Anti-vacuous: the fixture really is a reversal of the canonical order.
    expect([...RAMP_SIGN_FIELDS]).toEqual(['start', 'step']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. THE CLAUSES THAT CARRY WHY AN AUTHOR MUST NOT ACT ON THE ADVICE
// ═══════════════════════════════════════════════════════════════════════════
describe('the disclosure says what actually happens, and when it expires', () => {
  const say = (): string => rampSignLagDisclosure(FILLED)!;

  it('it says the WHOLE ROM fails to build, not that something might go wrong', () => {
    // The consequence is total and immediate: the assembler refuses the
    // emission and nothing builds. A hedged verb here turns a certainty into a
    // risk an author will reasonably decide to take.
    const s = say();
    expect(s).toContain('the assembler refuses the emission');
    expect(s).toContain('[emit.out-of-range]');
    expect(s).toContain('the WHOLE ROM fails to build');
  });

  it('it says the fields are declared UNSIGNED, which is the entire mechanism', () => {
    // ⚠ THE ONE WORD THE WHOLE CLAIM TURNS ON. If `rrp_start`/`rrp_step` were
    // signed there would be no defect at all: the constructor forwarding a
    // signed value RAW is only a problem because the destination is `u32`. A
    // sentence that said `i32` would describe a build failure that could not
    // happen, and the reader has no way to check it.
    const s = say();
    expect(s).toContain('`rrp_start`');
    expect(s).toContain('`rrp_step`');
    expect(s).toContain('as `u32`');
    expect(s, 'the sentence describes the destination as a SIGNED type, which would mean there is '
      + 'no defect to disclose').not.toContain('as `i32`');
    expect(s).toContain('no two\'s-complement encode');
  });

  it('it carries its own EXPIRY, dated, and names what retires it', () => {
    // A hold with no expiry is a prohibition nobody revisits. This one names
    // the artifact property that ends it, so the retirement is a measurement
    // rather than an announcement.
    const s = say();
    expect(s).toContain(`Expires (${RAMP_SIGN_LAG_MEASURED_ON})`);
    expect(s).toContain('ENCODES instead of forwarding');
    expect(s).toContain('this sentence retires with the row');
  });

  it('it says a POSITIVE value in the same field is fine, so this is about the SIGN', () => {
    const s = say();
    expect(s).toContain('A POSITIVE value in the same field builds and runs today');
    expect(s).toContain('this is about the sign');
  });

  it('...and the other direction: an EMPTY premise yields NO sentence at all', () => {
    // PRECONDITION for the singular/plural selector one line below the guard:
    // the empty list has already returned null, so `length === 1` and
    // `length <= 1` are the same test wherever the selector is read. That is
    // why loosening it is the one plant in this file that cannot discriminate,
    // and this row is what makes the claim checkable rather than argued.
    expect(rampSignLagDisclosure([])).toBeNull();
    expect(rampSignLagFields({ start: -1, step: -1 }, [])).toEqual([]);
    expect(rampSignLagDisclosure(rampSignLagFields({ start: -1, step: -1 }, []))).toBeNull();
  });
});

describe('the caveat rides inside a refusal, and says why it is there', () => {
  const say = (): string => rampSignRateCaveat('step', [-1, 0], ['step'])!;

  it('it BEGINS with a space, because it is appended to another sentence', () => {
    // ⚠ NOT A COSMETIC. `rampRateProblem` builds a refusal and this string is
    // concatenated onto the end of it, so the space is the only thing between
    // the last word of the refusal and the first of the caveat. Losing it runs
    // two sentences together in a message an author is reading to decide what
    // to type next.
    const s = say();
    expect(s.startsWith(' '), `the caveat no longer begins with a separating space: ${JSON.stringify(s.slice(0, 40))}`)
      .toBe(true);
    expect(s.trimStart().startsWith('⚠')).toBe(true);
  });

  it('it says the named values are STILL the nearest spellable, and why that matters', () => {
    // The panel names `-1` and `0` as the nearest representable rates and that
    // is TRUE arithmetic about the encoding. The caveat must not contradict it,
    // because falsifying the neighbours to route around a peer's build defect
    // would put a lie in the panel. So it says both things at once.
    const s = say();
    expect(s).toContain('still the nearest value');
    expect(s).toContain('this ENCODING can spell');
    expect(s).toContain('the build limitation is downstream');
  });

  it('it says WHY it is there: so the recommendation is not read as a fix', () => {
    // ⚠ THE SENTENCE'S REASON FOR EXISTING, and the one clause that tells the
    // reader what to DO. A refusal that names a nearest-representable
    // alternative carries the authority of a fix, and this clause is the only
    // thing withdrawing that authority.
    expect(say()).toContain('named here so the recommendation is not taken as a fix');
  });

  it('...and the other direction: no negative neighbour, no caveat', () => {
    expect(rampSignRateCaveat('step', [1, 2], ['step'])).toBeNull();
    expect(rampSignRateCaveat('step', [null, null], ['step'])).toBeNull();
    expect(rampSignRateCaveat('step', [0], ['step']),
      'zero is not negative, and a caveat on it would fire on the one neighbour that builds')
      .toBeNull();
    // and a field the premise is not awaiting is silent even with a negative.
    expect(rampSignRateCaveat('start', [-1], ['step'])).toBeNull();
  });
});
