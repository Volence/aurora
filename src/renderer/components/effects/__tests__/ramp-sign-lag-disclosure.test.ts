// THE NEGATIVE-VALUE DISCLOSURE on the ramp card — ARMED 2026-09-03, and this
// file is what stops either state from becoming an unmeasured claim.
//
// ROADMAP §5.1 row 132. The premise: aeon's `raster_ramp_program` declares
// `rrp_start`/`rrp_step` as `u32` and FORWARDS the signed parameter raw, so
// every negative ramp value fails at emission and the ROM does not build.
// Measured firsthand through git objects at aeon `origin/master`
// `ddaab2820eebc00b439ea51bc7b04363aa0f2157`; the standing measurement is
// `test/formats/aeon-ramp-sign-drift.test.ts`, which reads that constructor at
// TIP on every run and goes RED the day it encodes.
//
// ═══ WHY THE DISCLOSURE IS NARROW, AND WHY THAT IS THE HARD PART ═══
//
// "ramp does not reach the game" is a DIFFERENT claim and it RETIRED earlier the
// same day (`preset-lag.ts`). Re-arming it would be a false warning — the very
// defect this parcel exists to remove, wearing the other hat. A positive ramp
// builds and runs. So the sentence is scoped to the SIGN, and the rows below
// pin both halves of that: a negative document speaks, a positive one is silent.
//
// ═══ THE POISON IS TWO-DIRECTIONAL, AND THAT IS DELIBERATE ═══
//
// The fix that created this row (aeon's own encode) is pinned both ways —
// a negative encodes, and a POSITIVE IS UNCHANGED — because an unconditional
// encode would pass a negative-only pin while silently moving every ramp in the
// tree. The same discipline here:
//
//   1. Premise FILLED (production, today) → the sentence APPEARS on a negative
//      document. A leaf hard-wired to `return null` fails this.
//   2. Premise EMPTIED (the day aeon encodes) → the sentence is GONE, even on a
//      negative document. A leaf hard-wired to speak fails this.
//
// Neither direction alone is a gate: the first passes on a leaf that always
// speaks, the second on a leaf that never does.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  RAMP_SIGN_FIELDS, RAMP_SIGN_FIELDS_AWAITING_AEON, RAMP_SIGN_LAG_LEAD,
  RAMP_SIGN_CAVEAT_LEAD, RAMP_SIGN_LAG_MEASURED_ON, RAMP_SIGN_LAG_MEASUREMENT,
  rampSignLagDisclosure, rampSignLagFields, rampSignRateCaveat,
} from '../../../../core/formats/effects/ramp-sign-lag';
import { RampSignLagDisclosure } from '../RampSignLagDisclosure';
import {
  rampRateRefusal, rampRateNeighbours, rampRateProblem,
} from '../../../providers/effects-preset';
import type { EffectsPresetRamp } from '../../../../core/formats/effects/preset';

const SIGN_MODULE = '../../../../core/formats/effects/ramp-sign-lag';
const PANEL = resolve(__dirname, '../BandPresetPanel.tsx');
const LEAF = resolve(__dirname, '../RampSignLagDisclosure.tsx');

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

describe('the premise is ARMED, and the arming is asserted rather than assumed', () => {
  it('BOTH ramp fields are lagging — `rrp_start` and `rrp_step` are both u32 and both forwarded',
    () => {
      expect(
        [...RAMP_SIGN_FIELDS_AWAITING_AEON].sort(),
        'RAMP_SIGN_FIELDS_AWAITING_AEON has been emptied or narrowed. If aeon\'s constructor now '
        + 'encodes, that is a RETIREMENT and this file must be re-aimed at the retired state — '
        + 'see test/formats/aeon-ramp-sign-drift.test.ts, which is the only thing entitled to '
        + 'empty it.',
      ).toEqual([...RAMP_SIGN_FIELDS].sort());
    });

  it('the sentence carries a date and names where to re-measure', () => {
    const said = rampSignLagDisclosure(['step'])!;
    expect(said).not.toBeNull();
    expect(said).toContain(RAMP_SIGN_LAG_MEASURED_ON);
    expect(said).toContain(RAMP_SIGN_LAG_MEASUREMENT);
    expect(said.startsWith(RAMP_SIGN_LAG_LEAD)).toBe(true);
  });

  /** ⚠ THE SCOPE. The sentence must not re-arm the claim that retired. */
  it('⚠ IT IS ABOUT THE SIGN, NOT ABOUT `ramp` — the retired claim is NOT restated', () => {
    const said = rampSignLagDisclosure(['start', 'step'])!;
    // It says the positive case works, in as many words. Without this clause a
    // reader takes it for "ramp does not reach the game", which is false today.
    expect(said).toContain('A POSITIVE value in the same field builds and runs today');
    expect(said).toContain('this is about the sign, not about `ramp`');
    // And it does NOT claim the generator refuses the key, which is the retired
    // sentence's own wording.
    expect(said).not.toContain('does not accept');
    expect(said).not.toContain('effects_gen.py');
  });

  it('it names the mechanism precisely enough to be checked — u32, raw forward, emission', () => {
    const said = rampSignLagDisclosure(['step'])!;
    expect(said).toContain('raster_ramp_program');
    expect(said).toContain('`rrp_start`');
    expect(said).toContain('`rrp_step`');
    expect(said).toContain('u32');
    expect(said).toContain('emit.out-of-range');
  });
});

describe('the gate: which values speak, and which see nothing at all', () => {
  it('a POSITIVE ramp sees NOTHING — every ramp that has ever existed in this tier', () => {
    expect(rampSignLagFields({ start: 0, step: 1.5 })).toEqual([]);
    expect(rampSignLagFields({ start: 12, step: 0.25 })).toEqual([]);
    expect(RampSignLagDisclosure({ start: 0, step: 1.5 })).toBeNull();
  });

  it('ZERO is not negative — `0` encodes to `0` and fits u32 fine', () => {
    expect(rampSignLagFields({ start: 0, step: 0 })).toEqual([]);
    expect(RampSignLagDisclosure({ start: 0, step: 0 })).toBeNull();
  });

  it('a negative `step` speaks, and names `step` and not `start`', () => {
    expect(rampSignLagFields({ start: 4, step: -1.5 })).toEqual(['step']);
    const el = RampSignLagDisclosure({ start: 4, step: -1.5 });
    expect(el).not.toBeNull();
    const text = textOf(expand(el));
    expect(text).toBe(rampSignLagDisclosure(['step']));
    expect(text).toContain('`step` (px per scanline)');
    expect(text).not.toContain('`start` (px)');
  });

  it('a negative `start` speaks too — `rrp_start` is the same u32 and the same raw forward', () => {
    expect(rampSignLagFields({ start: -2, step: 1 })).toEqual(['start']);
    const text = textOf(expand(RampSignLagDisclosure({ start: -2, step: 1 })));
    expect(text).toBe(rampSignLagDisclosure(['start']));
    expect(text).toContain('`start` (px)');
  });

  it('both negative names both, in the order the panel paints them', () => {
    expect(rampSignLagFields({ start: -2, step: -1.5 })).toEqual(['start', 'step']);
    const text = textOf(expand(RampSignLagDisclosure({ start: -2, step: -1.5 })));
    expect(text).toContain('`start` (px) and `step` (px per scanline) are negative');
  });

  it('the leaf renders in WARNING tone, so it is not read as a footnote', () => {
    const el = RampSignLagDisclosure({ start: 0, step: -1.5 }) as React.ReactElement<{
      tone?: string;
    }>;
    expect(el.props.tone).toBe('warning');
  });
});

describe('the REFUSAL that recommended an unbuildable value now says so', () => {
  /**
   * ⚠ THIS IS THE DEFECT ITSELF. `-0.5` has no fp16 spelling, and the refusal
   * names `-1` and `0` as the nearest that do — which is TRUE about the
   * encoding and, today, half unbuildable. A named alternative carries the
   * authority of a fix; the author acts on it without question.
   */
  it('the sign-hole refusal still names -1 and 0 — THE ARITHMETIC IS NOT CORRUPTED', () => {
    expect(rampRateProblem(-0.5)).toBe('sign-hole');
    expect(rampRateNeighbours(-0.5)).toEqual({ below: -1, above: 0 });
    const said = rampRateRefusal(RAMP, 'p', 'step', -0.5)!;
    expect(said).toContain('The nearest rates you CAN have are -1 and 0');
  });

  it('...and it now carries the caveat, naming -1 as the value that will not build', () => {
    const said = rampRateRefusal(RAMP, 'p', 'step', -0.5)!;
    expect(said).toContain(RAMP_SIGN_CAVEAT_LEAD);
    expect(said).toContain('-1 is negative');
    expect(said).toContain('does not fit u32');
    // It says the neighbours are STILL the nearest spellable values, so the
    // caveat cannot be read as a retraction of the arithmetic.
    expect(said).toContain('still the nearest value this ENCODING can spell');
  });

  it('the caveat fires ONLY on a negative offer — a positive one is left alone', () => {
    // Off-grid ABOVE zero: the named pair is 1 and 1.00390625, both positive.
    const up = rampRateRefusal(RAMP, 'p', 'step', 1.001)!;
    expect(rampRateProblem(1.001)).toBe('off-grid');
    expect(up).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
    // Above the range: the offer is the MAX, positive.
    const over = rampRateRefusal(RAMP, 'p', 'step', 100000)!;
    expect(rampRateProblem(100000)).toBe('above-range');
    expect(over).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
    // Below the range: the offer is the MIN, negative — so it DOES fire.
    const under = rampRateRefusal(RAMP, 'p', 'step', -100000)!;
    expect(rampRateProblem(-100000)).toBe('below-range');
    expect(under).toContain(RAMP_SIGN_CAVEAT_LEAD);
  });

  it('an off-grid NEGATIVE offer carries it too — both named values are below zero', () => {
    const said = rampRateRefusal(RAMP, 'p', 'step', -1.001)!;
    expect(rampRateProblem(-1.001)).toBe('off-grid');
    const n = rampRateNeighbours(-1.001);
    expect(n.below!).toBeLessThan(0);
    expect(n.above!).toBeLessThan(0);
    expect(said).toContain(RAMP_SIGN_CAVEAT_LEAD);
    expect(said).toContain(`${n.below} and ${n.above} are negative`);
  });

  it('a rate that is FINE gets no sentence at all — the refusal is still null', () => {
    expect(rampRateRefusal(RAMP, 'p', 'step', -1.5)).toBeNull();
    expect(rampRateRefusal(RAMP, 'p', 'step', 1.5)).toBeNull();
  });
});

describe('the panel mounts the leaf on the ramp card, gated on the DOCUMENT and nothing else', () => {
  const code = readFileSync(PANEL, 'utf8');

  it('the ramp card mounts it, fed the document\'s own two values through the codec', () => {
    const line = code.split('\n').findIndex((l) => /<RampSignLagDisclosure/.test(l));
    expect(line, 'BandPresetPanel does not mount RampSignLagDisclosure at all').toBeGreaterThan(-1);
    const mount = code.split('\n').slice(line, line + 2).join('\n');
    // Fed from the document through the ONE conversion, not from a second
    // opinion about what the fp16 pair means.
    expect(mount).toContain('start={presetFp16ToNumber(ramp.start)}');
    expect(mount).toContain('step={presetFp16ToNumber(ramp.step)}');
    // Exactly one mount site: the ramp card. The band/anchor sections author no
    // signed 16.16, so a sentence there would be a false warning.
    expect(code.split('<RampSignLagDisclosure').length - 1).toBe(1);
  });

  it('it is mounted UNCONDITIONALLY — no `&&` guard one level up that could silence it', () => {
    const line = code.split('\n').find((l) => /<RampSignLagDisclosure/.test(l))!;
    expect(line.trim().startsWith('<RampSignLagDisclosure')).toBe(true);
    expect(line).not.toContain('&&');
    expect(line).not.toContain('?');
  });

  it('the panel carries no hand-typed copy of the sentence', () => {
    expect(code).not.toContain(RAMP_SIGN_LAG_LEAD);
    expect(code).not.toContain('does not fit u32');
  });

  /**
   * ⚠ THE DEFAULT PARAMETER IS A TRAPDOOR AND THIS ROW SHUTS IT.
   *
   * `rampSignRateCaveat(field, named, awaiting = RAMP_SIGN_FIELDS_AWAITING_AEON)`
   * evaluates that default in ITS OWN module's scope, so a caller that omits the
   * third argument reads the real constant even when a test has stubbed the
   * module. The retirement poison below went GREEN against exactly that shape
   * while the caveat stayed hard-wired on — measured, not imagined. The provider
   * therefore passes the constant it imported, and this row keeps it that way.
   */
  it('⚠ the provider passes the premise EXPLICITLY — the default parameter cannot be relied on',
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
   */
  it('the CDP harness\'s [ns] needles are the constants\' own words', () => {
    const harness = readFileSync(
      resolve(__dirname, '../../../../../scratchpad/ramp-control-harness.mjs'), 'utf8',
    );
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
    expect(rampSignLagDisclosure(['start', 'step'])!)
      .toContain('`start` (px) and `step` (px per scanline) are negative');
    // ...and the phrases [ns-a] requires really are in the refusal.
    const refusal = rampRateRefusal(RAMP, 'p', 'step', -0.5)!;
    for (const needle of [
      'The nearest rates you CAN have are -1 and 0', 'does not fit u32',
      'still the nearest value this ENCODING can spell',
    ]) {
      expect(harness, `[ns-a] does not look for "${needle}"`).toContain(needle);
      expect(refusal, `the refusal does not say "${needle}"`).toContain(needle);
    }
  });

  it('the harness is REGISTERED, so it is a runner and not an orphan file', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['harness:ramp-control']).toBe('node scratchpad/ramp-control-harness.mjs');
  });

  it('the leaf holds no literal sentence either — it derives, and derives once', () => {
    const leaf = readFileSync(LEAF, 'utf8');
    expect(leaf).toContain('rampSignLagDisclosure');
    expect(leaf).toContain('rampSignLagFields');
    // The lead is IMPORTED, not retyped, so a re-word cannot leave two copies.
    expect(leaf).toContain('RAMP_SIGN_LAG_LEAD');
    expect(leaf).not.toContain('does not fit u32');
  });
});

/**
 * ═══ POISON 1 — HARD-WIRED SHUT ═══
 *
 * The premise stays as production has it (FILLED), the document is negative, and
 * the leaf must SPEAK. This is the direction a `return null` fails.
 *
 * It is asserted through the module rather than by editing the leaf, because the
 * leaf's own file is what the row above pins; a stub here proves the WIRING —
 * that the sentence on screen is the derivation's and not a literal.
 */
describe('POISON: with the premise FILLED, a negative document must SPEAK', () => {
  it('the leaf returns the derivation verbatim — a literal or a null would fail this', () => {
    const el = RampSignLagDisclosure({ start: 0, step: -1.5 });
    expect(
      el,
      'the leaf renders NOTHING for a negative `step` while the premise is ARMED. The author is '
      + 'authoring a document that CANNOT BUILD and the panel says nothing — the gate is stuck '
      + 'SHUT and the disclosure is dead code.',
    ).not.toBeNull();
    expect(textOf(expand(el))).toBe(rampSignLagDisclosure(['step']));
  });
});

/**
 * ═══ POISON 2 — HARD-WIRED OPEN ═══
 *
 * The premise stubbed EMPTY — the day aeon's constructor encodes — and the
 * SENTENCE MUST BE GONE, on the very same negative document that speaks above.
 *
 * ⚠ THIS IS THE DIRECTION THE PARCEL EXISTS FOR. A warning that outlives its
 * premise is a FALSE WARNING, which is the same class of defect as the
 * recommendation that started this row: both are a confident sentence the author
 * acts on that is not true any more. A leaf that always speaks passes poison 1
 * and fails here.
 */
describe('POISON: with the premise EMPTIED, the sentence is GONE', () => {
  afterEach(() => {
    vi.doUnmock(SIGN_MODULE);
    vi.resetModules();
  });

  it('a negative `step` gets NO sentence once the lag has retired', async () => {
    vi.resetModules();
    vi.doMock(SIGN_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/ramp-sign-lag')>();
      return { ...real, RAMP_SIGN_FIELDS_AWAITING_AEON: Object.freeze([]) };
    });
    const poisoned = await import('../RampSignLagDisclosure');
    // The stub took.
    const mod = await import(SIGN_MODULE);
    expect(mod.RAMP_SIGN_FIELDS_AWAITING_AEON).toEqual([]);

    expect(
      poisoned.RampSignLagDisclosure({ start: -2, step: -1.5 }),
      'the leaf still speaks with the premise EMPTY — the retirement cannot happen. The sentence '
      + 'would stay on screen after aeon\'s constructor encodes, telling the author a document '
      + 'will not build when it now does. That is a FALSE WARNING, the same defect this parcel '
      + 'was opened to remove, wearing the other hat.',
    ).toBeNull();
  });

  it('and the REFUSAL loses its caveat too, on the same input that carries it today', async () => {
    vi.resetModules();
    vi.doMock(SIGN_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/ramp-sign-lag')>();
      return { ...real, RAMP_SIGN_FIELDS_AWAITING_AEON: Object.freeze([]) };
    });
    const poisoned = await import('../../../providers/effects-preset');
    const said = poisoned.rampRateRefusal(RAMP, 'p', 'step', -0.5)!;
    expect(said, 'the sign-hole refusal vanished entirely — the caveat was appended to the wrong '
      + 'thing').not.toBeNull();
    // The true arithmetic SURVIVES the retirement; only the caveat goes.
    expect(said).toContain('The nearest rates you CAN have are -1 and 0');
    expect(
      said,
      'the refusal still carries the unbuildable caveat with the premise EMPTY — after aeon '
      + 'encodes, -1 builds, and this clause would be a false warning stapled to a correct '
      + 'recommendation.',
    ).not.toContain(RAMP_SIGN_CAVEAT_LEAD);
  });

  it('...and unstubbed — production, today — both are back', async () => {
    vi.resetModules();
    const leaf = await import('../RampSignLagDisclosure');
    expect(leaf.RampSignLagDisclosure({ start: 0, step: -1.5 })).not.toBeNull();
    const prov = await import('../../../providers/effects-preset');
    expect(prov.rampRateRefusal(RAMP, 'p', 'step', -0.5)!).toContain(RAMP_SIGN_CAVEAT_LEAD);
  });

  it('the derivations themselves are the gate — both return null on an empty premise', () => {
    expect(rampSignLagDisclosure([])).toBeNull();
    expect(rampSignLagFields({ start: -2, step: -1.5 }, [])).toEqual([]);
    expect(rampSignRateCaveat('step', [-1, 0], [])).toBeNull();
    expect(rampSignRateCaveat('start', [-1, 0], ['step'])).toBeNull();
  });
});
