// THE NEGATIVE-VALUE DISCLOSURE on the ramp card — ARMED 2026-09-03, RETIRED
// 2026-09-03, and this file is what stops either state from becoming an
// unmeasured claim.
//
// ROADMAP §5.1 rows 132 (the arming) and 138 (this retirement). The premise WAS:
// aeon's `raster_ramp_program` declares `rrp_start`/`rrp_step` as `u32` and
// FORWARDS the signed parameter raw, so every negative ramp value fails at
// emission and the ROM does not build. **aeon fixed it.** At `origin/master`
// `065dc790` (blob `20896f04`, read through git objects) the constructor
// computes a two's-complement image at comptime — `if start_img < 0 { start_img
// = start_img + $100000000 }`, and the same for `step_img` — AFTER the range
// ensures, and the literal spells `rrp_start: start_img, rrp_step: step_img`.
// `test/formats/aeon-ramp-sign-drift.test.ts` measured exactly that at TIP,
// went red with "THE PREMISE HAS CLEARED", and is the only thing that was
// entitled to empty `RAMP_SIGN_FIELDS_AWAITING_AEON`.
//
// ═══ THE SENTENCE IS OFF SCREEN. IT IS STILL FULLY ASSERTED. ═══
//
// ⚠ THIS IS THE POINT OF THE FILE, AND IT IS EASY TO GET WRONG. The lazy
// retirement is to invert every row into `expect(...).toBeNull()`. Do that and
// the wording — which the re-arm inherits verbatim — is asserted by NOTHING, so
// it rots quietly for however long the premise stays clear and then comes back
// as gibberish, in a WARNING tone, on an author's screen. So every content row
// below drives an EXPLICIT REPLAY of the filled premise (`THE_LAG_THAT_WAS`,
// checked in row 2 to be the real field vocabulary and not fiction) through the
// real derivations and the real components. The sentence renders nowhere in
// production and is pinned word-for-word here.
//
// ═══ AND THE POISON FLIPPED DIRECTION ═══
//
// While the sentence was live the load-bearing poison EMPTIED the premise and
// required silence: a leaf that always speaks had to fail. That direction is now
// PRODUCTION, and production's own state cannot tell a working gate from a dead
// one — a leaf hard-wired `return null` and a mount deleted outright both look
// exactly like a correct retirement.
//
// So the poison is now: RE-FILL the premise and BOTH surfaces must come back —
// the ramp card's sentence AND the caveat inside `rampRateRefusal`. A hard-wired
// `return null`, a deleted mount, or a caveat call that stopped passing the
// premise all fail there and nowhere else.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  RAMP_SIGN_FIELDS, RAMP_SIGN_FIELDS_AWAITING_AEON, RAMP_SIGN_LAG_LEAD,
  RAMP_SIGN_CAVEAT_LEAD, RAMP_SIGN_LAG_MEASURED_ON, RAMP_SIGN_LAG_MEASURED_AT,
  RAMP_SIGN_LAG_MEASUREMENT,
  rampSignLagDisclosure, rampSignLagFields, rampSignRateCaveat,
} from '../../../../core/formats/effects/ramp-sign-lag';
import type { RampSignField } from '../../../../core/formats/effects/ramp-sign-lag';
import { RampSignLagDisclosure } from '../RampSignLagDisclosure';
import {
  rampRateRefusal, rampRateNeighbours, rampRateProblem,
} from '../../../providers/effects-preset';
import type { EffectsPresetRamp } from '../../../../core/formats/effects/preset';

const SIGN_MODULE = '../../../../core/formats/effects/ramp-sign-lag';
const PANEL = resolve(__dirname, '../BandPresetPanel.tsx');
const LEAF = resolve(__dirname, '../RampSignLagDisclosure.tsx');
const HARNESS = resolve(__dirname, '../../../../../scratchpad/ramp-control-harness.mjs');

/**
 * ═══ THE PREMISE THAT JUST RETIRED, REPLAYED EXPLICITLY ═══
 *
 * `['start', 'step']` — BOTH fields, because `rrp_start` and `rrp_step` were
 * both `u32` and both forwarded raw, so a run that merely BEGAN below the rest
 * position was as unbuildable as one that ramped upward.
 *
 * ⚠ IT IS A REPLAY, NOT A SECOND SOURCE OF TRUTH. It never reaches production;
 * its only job is to make the retired sentence checkable. Row 2 asserts it is
 * exactly `RAMP_SIGN_FIELDS`, so it cannot drift into naming a field the
 * disclosure has no units for — a replay of fiction would assert fiction.
 *
 * ⚠ AND IT CARRIES BOTH CARDINALITIES ON PURPOSE. The derivation branches on
 * `fields.length` (`is`/`are`, one name/`X and Y`), so rows below drive it BOTH
 * ways: a single field alone would leave the plural half of the sentence
 * asserted by nothing, which is the half a re-arm most likely lands on.
 */
const THE_LAG_THAT_WAS: readonly RampSignField[] = Object.freeze<RampSignField[]>(['start', 'step']);

/** The aeon revision at which the premise was ARMED — the citation a retired sentence must NOT still carry. */
const THE_REVISION_IT_WAS_ARMED_AT = 'ddaab282';

/** Flatten an element tree to its body text. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: unknown }).children);
  return '';
}

/** Walk an element tree, calling every function-typed component it meets. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  if (typeof node.type === 'function') {
    return expand((node.type as (p: unknown) => unknown)(props));
  }
  return React.cloneElement(node, undefined, expand(props.children) as React.ReactNode);
}

/** A ramp document, so the refusal rows have something to say "still holds" about. */
const RAMP: EffectsPresetRamp = {
  top: 64, lines: 100,
  target: { vsram: { addr: 0 } },
  start: { whole: 0, frac256: 0 },
  step: { whole: 1, frac256: 0 },
};

/**
 * ═══ THE REPLAY RIG ═══
 *
 * Both surfaces read `RAMP_SIGN_FIELDS_AWAITING_AEON` out of their OWN module
 * scope, so a replay cannot be handed in as an argument at the call site the way
 * `rampSignLagDisclosure(fields)` can — the whole point of the leaf is that the
 * panel gets no say. Re-importing them with the constant stubbed is therefore
 * the only way to drive the FILLED premise through the real component and the
 * real provider rather than through a copy of their logic.
 *
 * ⚠ IT ASSERTS THE STUB TOOK. Every row built on this rig is vacuous if the mock
 * silently misses — and a mock that misses looks exactly like a correct
 * retirement, which is the failure mode this whole file exists to catch.
 */
async function withPremise(awaiting: readonly RampSignField[]): Promise<{
  leaf: typeof RampSignLagDisclosure;
  refusal: typeof rampRateRefusal;
}> {
  vi.resetModules();
  vi.doMock(SIGN_MODULE, async (importOriginal) => {
    const real = await importOriginal<typeof import('../../../../core/formats/effects/ramp-sign-lag')>();
    return { ...real, RAMP_SIGN_FIELDS_AWAITING_AEON: Object.freeze([...awaiting]) };
  });
  const sign = await import(SIGN_MODULE);
  expect(
    [...sign.RAMP_SIGN_FIELDS_AWAITING_AEON],
    'THE PREMISE STUB DID NOT TAKE, so every assertion built on this rig is vacuous — it would '
    + 'pass against a leaf hard-wired shut and a caveat hard-wired on alike.',
  ).toEqual([...awaiting]);
  const leaf = await import('../RampSignLagDisclosure');
  const prov = await import('../../../providers/effects-preset');
  return { leaf: leaf.RampSignLagDisclosure, refusal: prov.rampRateRefusal };
}

afterEach(() => {
  vi.doUnmock(SIGN_MODULE);
  vi.resetModules();
});

describe('the premise has RETIRED, and the retirement is asserted rather than assumed', () => {
  it('1. the premise is EMPTY — aeon\'s constructor encodes, so no field is lagging', () => {
    expect(
      [...RAMP_SIGN_FIELDS_AWAITING_AEON],
      'RAMP_SIGN_FIELDS_AWAITING_AEON is not empty. If this is a RE-ARM, only '
      + 'test/formats/aeon-ramp-sign-drift.test.ts is entitled to have done it — that row reads '
      + 'aeon\'s constructor at TIP through git objects and reddens when it forwards a bare '
      + 'parameter again, and its message is the handover. If it is anything else — a hand edit, '
      + 'a merge announcement, a guess — it is a FALSE WARNING being put back on an author\'s '
      + 'screen, which is the defect this disclosure was written against, wearing the other hat.',
    ).toEqual([]);
  });

  it('2. the replay is REAL vocabulary — `THE_LAG_THAT_WAS` is exactly the two ramp sign fields',
    () => {
      expect(
        [...THE_LAG_THAT_WAS].sort(),
        'the replay below has drifted from the field vocabulary, so every wording row in this '
        + 'file is asserting a sentence about fields that do not exist.',
      ).toEqual([...RAMP_SIGN_FIELDS].sort());
      // Both cardinalities are really available from it — the derivation branches on length.
      expect(THE_LAG_THAT_WAS.length).toBe(2);
      expect(rampSignLagDisclosure([THE_LAG_THAT_WAS[0]])).not.toBeNull();
      expect(rampSignLagDisclosure([...THE_LAG_THAT_WAS])).not.toBeNull();
    });

  it('3. BOTH SURFACES RENDER NOTHING — the sentence and the caveat are off screen', () => {
    // The card's leaf, on the most negative document there is.
    expect(
      RampSignLagDisclosure({ start: -2, step: -1.5 }),
      'the ramp card still discloses a negative value after aeon encoded it — a FALSE WARNING '
      + 'telling the author a document will not build when it now does.',
    ).toBeNull();
    // The refusal's caveat, on the input that carried it while the lag was open.
    const said = rampRateRefusal(RAMP, 'p', 'step', -0.5)!;
    expect(said, 'the sign-hole refusal vanished entirely — something other than the caveat was '
      + 'retired').not.toBeNull();
    expect(said).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
    // ...and the true arithmetic SURVIVED the retirement. Only the addendum went.
    expect(said).toContain('The nearest rates you CAN have are -1 and 0');
  });

  it('4. ...and it is the PREMISE that silenced them, not a derivation that stopped working', () => {
    // Fed the filled premise by hand, both derivations still produce their text.
    expect(rampSignLagDisclosure([...THE_LAG_THAT_WAS])).not.toBeNull();
    expect(rampSignRateCaveat('step', [-1, 0], THE_LAG_THAT_WAS)).not.toBeNull();
    // And fed the real (empty) one, both go quiet.
    expect(rampSignLagDisclosure(rampSignLagFields({ start: -2, step: -1.5 }))).toBeNull();
    expect(rampSignRateCaveat('step', [-1, 0], RAMP_SIGN_FIELDS_AWAITING_AEON)).toBeNull();
  });

  it('5. the sentence carries a date and names where to re-measure', () => {
    const said = rampSignLagDisclosure(['step'])!;
    expect(said).not.toBeNull();
    expect(said).toContain(RAMP_SIGN_LAG_MEASURED_ON);
    expect(said).toContain(RAMP_SIGN_LAG_MEASUREMENT);
    expect(said.startsWith(RAMP_SIGN_LAG_LEAD)).toBe(true);
  });

  /** ⚠ THE SCOPE. The sentence must not re-arm the claim that retired before it. */
  it('6. ⚠ IT IS ABOUT THE SIGN, NOT ABOUT `ramp` — the retired claim is NOT restated', () => {
    const said = rampSignLagDisclosure([...THE_LAG_THAT_WAS])!;
    // It says the positive case works, in as many words. Without this clause a
    // reader takes it for "ramp does not reach the game", which is false.
    expect(said).toContain('A POSITIVE value in the same field builds and runs today');
    expect(said).toContain('this is about the sign, not about `ramp`');
    // And it does NOT claim the generator refuses the key, which is the other
    // retired sentence's own wording.
    expect(said).not.toContain('does not accept');
    expect(said).not.toContain('effects_gen.py');
  });

  it('7. it names the mechanism precisely enough to be checked — u32, raw forward, emission', () => {
    const said = rampSignLagDisclosure(['step'])!;
    expect(said).toContain('raster_ramp_program');
    expect(said).toContain('`rrp_start`');
    expect(said).toContain('`rrp_step`');
    expect(said).toContain('u32');
    expect(said).toContain('emit.out-of-range');
  });

  /**
   * ⚠ A RETIRED SENTENCE MUST NOT KEEP ITS ARMING CITATION. The sentence prints
   * "Measured <date> at aeon <rev>", and a re-arm inherits whatever is here. If
   * the constants still named `ddaab282` — the revision at which the constructor
   * FORWARDED — the sentence would come back citing, as evidence for the defect,
   * a revision that has since been superseded twice over, and a reader checking
   * it would find the arming measurement rather than the re-arming one.
   */
  it('8. the recorded revision is the RETIREMENT\'s, not the one the sentence was armed at', () => {
    expect(RAMP_SIGN_LAG_MEASURED_AT).toMatch(/^[0-9a-f]{8,40}$/);
    expect(
      RAMP_SIGN_LAG_MEASURED_AT,
      'the sentence still cites the revision it was ARMED at. Re-measure and re-date, or the '
      + 'next re-arm ships a stale citation as its evidence.',
    ).not.toBe(THE_REVISION_IT_WAS_ARMED_AT);
    // And the measurement still names the ENGINE SOURCE, which is the artifact
    // that can see this defect — not a page, not the generator.
    expect(RAMP_SIGN_LAG_MEASUREMENT).toContain('raster_ramp_program');
    expect(RAMP_SIGN_LAG_MEASUREMENT).not.toContain('EDITOR_RASTER_PRESETS');
  });
});

describe('the gate: which values speak, and which see nothing — REPLAYED under the filled premise',
  () => {
    it('9. a POSITIVE ramp saw NOTHING — every ramp that has ever existed in this tier', async () => {
      expect(rampSignLagFields({ start: 0, step: 1.5 }, THE_LAG_THAT_WAS)).toEqual([]);
      expect(rampSignLagFields({ start: 12, step: 0.25 }, THE_LAG_THAT_WAS)).toEqual([]);
      const { leaf } = await withPremise(THE_LAG_THAT_WAS);
      expect(leaf({ start: 0, step: 1.5 })).toBeNull();
    });

    it('10. ZERO is not negative — `0` encodes to `0` and fits u32 fine', async () => {
      expect(rampSignLagFields({ start: 0, step: 0 }, THE_LAG_THAT_WAS)).toEqual([]);
      const { leaf } = await withPremise(THE_LAG_THAT_WAS);
      expect(leaf({ start: 0, step: 0 })).toBeNull();
    });

    it('11. a negative `step` spoke, and named `step` and not `start`', async () => {
      expect(rampSignLagFields({ start: 4, step: -1.5 }, THE_LAG_THAT_WAS)).toEqual(['step']);
      const { leaf } = await withPremise(THE_LAG_THAT_WAS);
      const el = leaf({ start: 4, step: -1.5 });
      expect(el).not.toBeNull();
      const text = textOf(expand(el));
      // Equal to the derivation, so a literal in the leaf cannot pass.
      expect(text).toBe(rampSignLagDisclosure(['step']));
      expect(text).toContain('`step` (px per scanline) is negative');
      expect(text).not.toContain('`start` (px)');
    });

    it('12. a negative `start` spoke too — `rrp_start` was the same u32 and the same raw forward',
      async () => {
        expect(rampSignLagFields({ start: -2, step: 1 }, THE_LAG_THAT_WAS)).toEqual(['start']);
        const { leaf } = await withPremise(THE_LAG_THAT_WAS);
        const text = textOf(expand(leaf({ start: -2, step: 1 })));
        expect(text).toBe(rampSignLagDisclosure(['start']));
        expect(text).toContain('`start` (px) is negative');
      });

    it('13. both negative named both, in the order the panel paints them — THE PLURAL BRANCH',
      async () => {
        expect(rampSignLagFields({ start: -2, step: -1.5 }, THE_LAG_THAT_WAS))
          .toEqual(['start', 'step']);
        const { leaf } = await withPremise(THE_LAG_THAT_WAS);
        const text = textOf(expand(leaf({ start: -2, step: -1.5 })));
        expect(text).toBe(rampSignLagDisclosure([...THE_LAG_THAT_WAS]));
        expect(text).toContain('`start` (px) and `step` (px per scanline) are negative');
      });

    it('14. the leaf rendered in WARNING tone, so it was not read as a footnote', async () => {
      const { leaf } = await withPremise(THE_LAG_THAT_WAS);
      const el = leaf({ start: 0, step: -1.5 }) as React.ReactElement<{ tone?: string }>;
      expect(el).not.toBeNull();
      expect(el.props.tone).toBe('warning');
    });
  });

describe('the REFUSAL that recommended an unbuildable value — and what it says now', () => {
  /**
   * ⚠ THE ARITHMETIC IS PREMISE-INDEPENDENT AND IS CHECKED AGAINST PRODUCTION.
   * `-0.5` has no fp16 spelling, and the refusal names `-1` and `0` as the
   * nearest that do. That was true while the lag was open and it is true now;
   * the retirement removed the addendum and nothing else.
   */
  it('15. the sign-hole refusal still names -1 and 0 — THE ARITHMETIC IS NOT CORRUPTED', () => {
    expect(rampRateProblem(-0.5)).toBe('sign-hole');
    expect(rampRateNeighbours(-0.5)).toEqual({ below: -1, above: 0 });
    const said = rampRateRefusal(RAMP, 'p', 'step', -0.5)!;
    expect(said).toContain('The nearest rates you CAN have are -1 and 0');
  });

  it('16. ...and under the filled premise it carried the caveat, naming -1 as unbuildable',
    async () => {
      const { refusal } = await withPremise(THE_LAG_THAT_WAS);
      const said = refusal(RAMP, 'p', 'step', -0.5)!;
      expect(said).toContain(RAMP_SIGN_CAVEAT_LEAD);
      expect(said).toContain('-1 is negative');
      expect(said).toContain('does not fit u32');
      // It said the neighbours are STILL the nearest spellable values, so the
      // caveat could not be read as a retraction of the arithmetic.
      expect(said).toContain('still the nearest value this ENCODING can spell');
    });

  it('17. the caveat fired ONLY on a negative offer — a positive one was left alone', async () => {
    const { refusal } = await withPremise(THE_LAG_THAT_WAS);
    // Off-grid ABOVE zero: the named pair is 1 and 1.00390625, both positive.
    const up = refusal(RAMP, 'p', 'step', 1.001)!;
    expect(rampRateProblem(1.001)).toBe('off-grid');
    expect(up).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
    // Above the range: the offer is the MAX, positive.
    const over = refusal(RAMP, 'p', 'step', 100000)!;
    expect(rampRateProblem(100000)).toBe('above-range');
    expect(over).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
    // Below the range: the offer is the MIN, negative — so it DID fire.
    const under = refusal(RAMP, 'p', 'step', -100000)!;
    expect(rampRateProblem(-100000)).toBe('below-range');
    expect(under).toContain(RAMP_SIGN_CAVEAT_LEAD);
  });

  it('18. an off-grid NEGATIVE offer carried it too — both named values below zero', async () => {
    const { refusal } = await withPremise(THE_LAG_THAT_WAS);
    const said = refusal(RAMP, 'p', 'step', -1.001)!;
    expect(rampRateProblem(-1.001)).toBe('off-grid');
    const n = rampRateNeighbours(-1.001);
    expect(n.below!).toBeLessThan(0);
    expect(n.above!).toBeLessThan(0);
    expect(said).toContain(RAMP_SIGN_CAVEAT_LEAD);
    expect(said).toContain(`${n.below} and ${n.above} are negative`);
  });

  it('19. a rate that is FINE gets no sentence at all — the refusal is still null', () => {
    expect(rampRateRefusal(RAMP, 'p', 'step', -1.5)).toBeNull();
    expect(rampRateRefusal(RAMP, 'p', 'step', 1.5)).toBeNull();
  });

  /**
   * ⚠ THE RETIREMENT ACROSS EVERY BRANCH THAT USED TO CARRY IT. Row 3 checks one
   * input; this checks all three, because the caveat was appended per-branch and
   * a partial retirement — one branch still speaking — is exactly the corner a
   * single-input row would never visit.
   */
  it('20. and in PRODUCTION not one of the three negative-offer branches carries it', () => {
    for (const [px, problem] of [[-0.5, 'sign-hole'], [-1.001, 'off-grid'],
      [-100000, 'below-range']] as const) {
      expect(rampRateProblem(px)).toBe(problem);
      const said = rampRateRefusal(RAMP, 'p', 'step', px)!;
      expect(said, `the ${problem} refusal still carries the retired caveat`).not.toBeNull();
      expect(said, `the ${problem} branch still carries the retired caveat`)
        .not.toContain(RAMP_SIGN_CAVEAT_LEAD);
    }
    // Both fields, not just `step` — `start` is not a rate field, so only the
    // rate fields the refusal serves are walked here.
    expect(rampRateRefusal(RAMP, 'p', 'start', -0.5)!).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
  });
});

describe('the panel still mounts the leaf on the ramp card, silent though it is', () => {
  const code = readFileSync(PANEL, 'utf8');

  /**
   * ⚠ THE MOST DELETABLE MOUNT IN THE PANEL. It was added FOR this disclosure,
   * the disclosure has retired, and it now renders nothing — so a "tidy away the
   * silent leaf" edit takes it with no user-visible change whatsoever, and the
   * re-arm then silently reaches no screen. That is precisely what happened to
   * the sibling `PresetLagDisclosure`'s third mount, which no row named for a
   * whole parcel. These rows are why this one is not in that position.
   */
  it('21. the ramp card mounts it, fed the document\'s own two values through the codec', () => {
    const line = code.split('\n').findIndex((l) => /<RampSignLagDisclosure/.test(l));
    expect(line, 'BandPresetPanel does not mount RampSignLagDisclosure at all. It renders nothing '
      + 'today, which is why deleting it is invisible — and why re-filling the premise would then '
      + 'put the sentence back on NO screen.').toBeGreaterThan(-1);
    const mount = code.split('\n').slice(line, line + 2).join('\n');
    // Fed from the document through the ONE conversion, not from a second
    // opinion about what the fp16 pair means.
    expect(mount).toContain('start={presetFp16ToNumber(ramp.start)}');
    expect(mount).toContain('step={presetFp16ToNumber(ramp.step)}');
    // Exactly one mount site: the ramp card. The band/anchor sections author no
    // signed 16.16, so a sentence there would be a false warning.
    expect(code.split('<RampSignLagDisclosure').length - 1).toBe(1);
  });

  it('22. it is mounted UNCONDITIONALLY — no `&&` guard one level up that could silence it', () => {
    const line = code.split('\n').find((l) => /<RampSignLagDisclosure/.test(l))!;
    expect(line.trim().startsWith('<RampSignLagDisclosure')).toBe(true);
    expect(line).not.toContain('&&');
    expect(line).not.toContain('?');
  });

  it('23. the panel carries no hand-typed copy of the sentence', () => {
    expect(code).not.toContain(RAMP_SIGN_LAG_LEAD);
    expect(code).not.toContain('does not fit u32');
  });

  /**
   * ⚠ THE DEFAULT PARAMETER IS A TRAPDOOR AND THIS ROW SHUTS IT.
   *
   * `rampSignRateCaveat(field, named, awaiting = RAMP_SIGN_FIELDS_AWAITING_AEON)`
   * evaluates that default in ITS OWN module's scope, so a caller that omits the
   * third argument reads the real constant even when a test has stubbed the
   * module. A DEFAULT PARAMETER IS A HIDDEN IMPORT. Measured, not imagined: the
   * poison went GREEN against exactly that shape while the caveat stayed
   * hard-wired on. The provider therefore passes the constant it imported, and
   * this row keeps it that way — which matters MORE now than it did while the
   * lag was open, because the re-arm poison below is the only thing that can see
   * a broken caveat, and it is the poison such a default would defeat.
   */
  it('24. ⚠ the provider passes the premise EXPLICITLY — the default parameter is a hidden import',
    () => {
      const prov = readFileSync(
        resolve(__dirname, '../../../providers/effects-preset.ts'), 'utf8',
      );
      expect(prov).toContain('rampSignRateCaveat(field, named, RAMP_SIGN_FIELDS_AWAITING_AEON)');
      expect(prov).toContain('RAMP_SIGN_FIELDS_AWAITING_AEON,\n} from \'../../core/formats/effects/ramp-sign-lag\'');
    });

  /**
   * ⚠ THE HARNESS CANNOT IMPORT TYPESCRIPT, SO ITS NEEDLES ARE COPIES — and a
   * copy that nothing checks is how a rig stays green against words the app no
   * longer paints. `npm run harness:ramp-control`'s `[ns-*]` rows search the
   * rendered page for these exact strings; this row is the retroactivity link
   * between them and the constants they are copies OF.
   *
   * ⚠ THE REFUSAL HALF IS DRIVEN THROUGH THE REPLAY, because those needles are
   * the CAVEAT's words and the caveat is off screen in production. Checked
   * against production the loop would be asserting that the harness looks for
   * text no derivation produces — vacuously true of any string.
   */
  it('25. the CDP harness\'s [ns] needles are the constants\' own words', async () => {
    const harness = readFileSync(HARNESS, 'utf8');
    expect(harness).toContain(`const NS_LEAD = '${RAMP_SIGN_LAG_LEAD}'`);
    // The caveat lead minus its ⚠ glyph, which the needle drops deliberately.
    expect(RAMP_SIGN_CAVEAT_LEAD).toContain('A NEGATIVE ONE WILL NOT BUILD TODAY');
    expect(harness).toContain("const NS_CAVEAT = 'A NEGATIVE ONE WILL NOT BUILD TODAY'");
    // And the phrases the [ns-b] row requires really are in the sentence.
    const said = rampSignLagDisclosure(['step'])!;
    for (const needle of [
      '`step` (px per scanline) is negative', 'raster_ramp_program', 'u32',
      'A POSITIVE value in the same field builds and runs today',
      'this is about the sign, not about `ramp`',
    ]) {
      expect(harness, `[ns-b] does not look for "${needle}"`).toContain(needle);
      expect(said, `the sentence does not say "${needle}"`).toContain(needle);
    }
    expect(rampSignLagDisclosure([...THE_LAG_THAT_WAS])!)
      .toContain('`start` (px) and `step` (px per scanline) are negative');
    // ...and the phrases [ns-a] requires really are in the refusal, under the
    // premise that puts them there.
    const { refusal } = await withPremise(THE_LAG_THAT_WAS);
    const armed = refusal(RAMP, 'p', 'step', -0.5)!;
    for (const needle of [
      'The nearest rates you CAN have are -1 and 0', 'does not fit u32',
      'still the nearest value this ENCODING can spell',
    ]) {
      expect(harness, `[ns-a] does not look for "${needle}"`).toContain(needle);
      expect(armed, `the refusal does not say "${needle}"`).toContain(needle);
    }
  });

  /**
   * ⚠ AND THE HARNESS MUST ASK WHICHEVER QUESTION THE PREMISE MAKES TRUE.
   *
   * Its `[ns-a]`/`[ns-b]`/`[ns-c]` rows required the sentence PAINTED. With the
   * premise empty that is now false of a correct screen, so a rig that still
   * demanded it would go red on a repo where nothing is wrong — the shape that
   * already cost this suite a run on the sibling harness. It reads the premise
   * out of the file that owns it (the `variant-cycle-harness` `[2f]` precedent)
   * and inverts, rather than being told the answer by a constant of its own.
   */
  it('26. the harness READS the premise and inverts with it, rather than assuming a state', () => {
    const harness = readFileSync(HARNESS, 'utf8');
    expect(harness, 'the harness does not read RAMP_SIGN_FIELDS_AWAITING_AEON out of the source, '
      + 'so its [ns] rows are pinned to whichever state was true the day they were written')
      .toContain('RAMP_SIGN_FIELDS_AWAITING_AEON');
    expect(harness).toContain('NS_PREMISE_OPEN');
    // The regex it parses with must actually match the declaration as it stands
    // — the sibling harness THREW at import for a whole day because a one-space
    // literal stopped matching a wrapped declaration.
    const src = readFileSync(
      resolve(__dirname, '../../../../core/formats/effects/ramp-sign-lag.ts'), 'utf8',
    );
    const m = src.match(
      /RAMP_SIGN_FIELDS_AWAITING_AEON: readonly RampSignField\[\] =\s*\n?\s*Object\.freeze<RampSignField\[\]>\(\[([^\]]*)\]\)/,
    );
    expect(m, 'the premise declaration no longer has the shape the harness parses').not.toBeNull();
    expect(m![1].split(',').map((s) => s.trim()).filter(Boolean)).toEqual([]);
  });

  it('27. the harness is REGISTERED, so it is a runner and not an orphan file', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['harness:ramp-control']).toBe('node scratchpad/ramp-control-harness.mjs');
  });

  it('28. the leaf holds no literal sentence either — it derives, and derives once', () => {
    const leaf = readFileSync(LEAF, 'utf8');
    expect(leaf).toContain('rampSignLagDisclosure');
    expect(leaf).toContain('rampSignLagFields');
    // The lead is IMPORTED, not retyped, so a re-word cannot leave two copies.
    expect(leaf).toContain('RAMP_SIGN_LAG_LEAD');
    expect(leaf).not.toContain('does not fit u32');
  });
});

/**
 * ═══ POISON — THE LOAD-BEARING DIRECTION, NOW THAT THE SENTENCE IS RETIRED ═══
 *
 * ⚠ WHILE THE LAG WAS OPEN this poison ran the other way: empty the premise, and
 * the leaf had to fall silent. **That direction is production now**, and
 * production cannot tell a working gate from a dead one — a leaf hard-wired
 * `return null`, a mount deleted, a caveat call that quietly stopped passing the
 * premise, and a correct retirement all look identical from here.
 *
 * So: RE-FILL the premise, and BOTH surfaces must come back — the ramp card's
 * sentence AND the caveat inside `rampRateRefusal`, in full, equal to the
 * derivation rather than to a literal. This is the only thing in the repository
 * that can see whether the re-arm still works, and every "it is silent" row
 * above passes without it.
 */
describe('POISON: RE-FILL the premise and BOTH surfaces must come BACK', () => {
  it('29. the card\'s leaf speaks again, returning the derivation verbatim', async () => {
    const { leaf } = await withPremise(THE_LAG_THAT_WAS);
    const el = leaf({ start: 0, step: -1.5 });
    expect(
      el,
      'the leaf renders NOTHING for a negative `step` even with the premise RE-FILLED. The '
      + 'retirement has been made permanent by accident — a `return null`, a dropped premise '
      + 'read, or a deleted derivation — so if aeon ever forwards a bare parameter again the '
      + 'author will author a document that CANNOT BUILD and the panel will say nothing.',
    ).not.toBeNull();
    // Equal to the derivation, so a hard-wired literal cannot pass either.
    expect(textOf(expand(el))).toBe(rampSignLagDisclosure(['step']));
    expect((el as React.ReactElement<{ tone?: string }>).props.tone).toBe('warning');
  });

  it('30. the refusal\'s caveat comes back too, on the same input production leaves bare', async () => {
    const { refusal } = await withPremise(THE_LAG_THAT_WAS);
    const said = refusal(RAMP, 'p', 'step', -0.5)!;
    expect(said, 'the sign-hole refusal vanished entirely — the caveat was appended to the wrong '
      + 'thing').not.toBeNull();
    expect(
      said,
      'the refusal does NOT regain its caveat with the premise RE-FILLED, so the re-arm reaches '
      + 'the card but not the refusal — and the refusal is the surface that RECOMMENDS the '
      + 'unbuildable value, with all the authority a named alternative carries.',
    ).toContain(RAMP_SIGN_CAVEAT_LEAD);
    // The true arithmetic is present in BOTH states; it is not what moves.
    expect(said).toContain('The nearest rates you CAN have are -1 and 0');
  });

  it('31. ...and unstubbed — production, today — BOTH are silent again', async () => {
    vi.resetModules();
    const leaf = await import('../RampSignLagDisclosure');
    expect(leaf.RampSignLagDisclosure({ start: -2, step: -1.5 })).toBeNull();
    const prov = await import('../../../providers/effects-preset');
    expect(prov.rampRateRefusal(RAMP, 'p', 'step', -0.5)!).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
  });

  it('32. the derivations themselves are the gate — both directions, both surfaces', () => {
    // Empty premise: silent.
    expect(rampSignLagDisclosure([])).toBeNull();
    expect(rampSignLagFields({ start: -2, step: -1.5 }, [])).toEqual([]);
    expect(rampSignRateCaveat('step', [-1, 0], [])).toBeNull();
    // A premise that does not name the field in question: still silent.
    expect(rampSignRateCaveat('start', [-1, 0], ['step'])).toBeNull();
    // Filled premise: both speak.
    expect(rampSignLagFields({ start: -2, step: -1.5 }, THE_LAG_THAT_WAS))
      .toEqual(['start', 'step']);
    expect(rampSignLagDisclosure([...THE_LAG_THAT_WAS])).toContain('does not reach the game');
    expect(rampSignRateCaveat('step', [-1, 0], THE_LAG_THAT_WAS))
      .toContain('WILL NOT BUILD TODAY');
    // ...but only on a negative offer, whatever the premise says.
    expect(rampSignRateCaveat('step', [0, 1], THE_LAG_THAT_WAS)).toBeNull();
  });
});
