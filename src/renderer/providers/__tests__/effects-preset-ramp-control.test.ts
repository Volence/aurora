// The `ramp` AUTHORING SURFACE — its refusals, its arithmetic, and the one
// place the display lag is applied.
//
// ═══ WHAT THIS FILE OWNS THAT THE CODEC'S OWN TESTS DO NOT ═══
//
// `test/formats/effects-preset-ramp.test.ts` measures the CODEC: the sign rule,
// the constants' derivations, the four-way `oneOf`, the round trip. This file
// measures the CONTROL — what an author meets when they type a number:
//
//   1. THE SPAN PAIR IS REFUSED AT AUTHOR TIME. `{top: 222, lines: 220}`
//      satisfies every schema keyword and fails the build. The refusal must fire
//      HERE, and it must carry the schema's own number rather than a retyped one.
//   2. AN UNREPRESENTABLE RATE IS REFUSED AND NAMES WHAT IS AVAILABLE. -0.5 has
//      no spelling; the refusal must say so and must offer -1 and 0, and NOTHING
//      may snap.
//   3. THE DISPLAY LAG IS APPLIED TO WHAT THE AUTHOR SEES, EXACTLY ONCE, and to
//      nothing that reaches the document.
//   4. THE BAND CONTROLS' REFUSAL ON A RAMP DOCUMENT IS A SENTENCE, not silence,
//      and the sentence and the disabling predicate are the same derivation.
//   5. THE CHANNEL SWAP IS ONE UNDOABLE COMMAND that restores exactly what was
//      there.
//
// ⚠ NOTHING HERE CAN SEE A PIXEL. The node suite has no React and no canvas, so
// every row below is about a function's answer; that the panel actually mounts
// these answers, disables the chip and paints the sentence is measured by
// `scratchpad/ramp-control-harness.mjs` (`npm run harness:ramp-control`) driving
// the real app, and by the source rows in
// `components/effects/__tests__/ramp-control-wording.test.ts`.

import { describe, it, expect } from 'vitest';
import {
  EFFECTS_PRESET_RAMP_TOP_RANGE,
  EFFECTS_PRESET_RAMP_LINES_RANGE,
  EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE,
  EFFECTS_PRESET_RAMP_SPAN_MAX,
  EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG,
  EFFECTS_PRESET_FP16_WHOLE_RANGE,
  EFFECTS_PRESET_FP16_FRAC_RANGE,
  presetFp16FromNumber,
  presetFp16ToNumber,
  presetRasterChannel,
  parseEffectsPreset,
  serializeEffectsPreset,
  type EffectsPreset,
  type EffectsPresetLibrary,
} from '../../../core/formats/effects/preset';
import {
  newRamp, newPreset, newBand,
  RAMP_KEYS, RAMP_MUST_NOT, RAMP_MUST_NOT_SHORT, RAMP_DISPLAY_LAG_NOTE,
  RAMP_RATE_MIN, RAMP_RATE_MAX, RAMP_RATE_UNIT,
  rampSpanRefusal, rampAddrRefusal, rampAddrGloss,
  rampRateProblem, rampRateNeighbours, rampRateRefusal,
  rampDisplaySpan, rampDisplayGloss, rampDriftSummary,
  setRampSpanCommand, setRampAddrCommand, setRampRateCommand,
  setRasterChannelCommand, rasterChannelSwapAdvisory, RASTER_CHANNEL_OPTIONS,
  bandControlsRefusal, lastBandRefusal, addBandCommand, removeBandCommand,
  presetListEntries, presetListSummary,
} from '../effects-preset';

const ID = 'probe';

function rampPreset(over: Partial<ReturnType<typeof newRamp>> = {}): EffectsPreset {
  return { schema: 1, id: ID, ramp: { ...newRamp(), ...over } };
}
function lib(...presets: EffectsPreset[]): EffectsPresetLibrary {
  return { presets, unreadable: [], notices: [] };
}

// ---------------------------------------------------------------------------
// 1. The span — the pair the per-field maxima do not describe
// ---------------------------------------------------------------------------

describe('the span pair is refused AT THE CONTROL, with the schema\'s own number', () => {
  /**
   * ⚠ THE ANTI-VACUOUS HALF IS THE FIRST TWO EXPECTS. The whole point of this
   * row is that both fields are INDIVIDUALLY LEGAL — if the maxima ever stopped
   * being individually legal the row would go green for the wrong reason, so it
   * asserts that first and then asserts the pair is refused anyway.
   */
  it('top 222 and lines 220 are each in range, and the PAIR is refused', () => {
    const top = EFFECTS_PRESET_RAMP_TOP_RANGE.max;
    const lines = EFFECTS_PRESET_RAMP_LINES_RANGE.max;
    expect(top).toBeLessThanOrEqual(EFFECTS_PRESET_RAMP_TOP_RANGE.max);
    expect(lines).toBeLessThanOrEqual(EFFECTS_PRESET_RAMP_LINES_RANGE.max);
    // ...and the sum exceeds the bound, which is what makes the pair a trap.
    expect(top + lines).toBeGreaterThan(EFFECTS_PRESET_RAMP_SPAN_MAX);

    const ramp = { ...newRamp(), lines };
    const why = rampSpanRefusal(ramp, ID, 'top', top);
    expect(why).not.toBeNull();
    // THE SCHEMA'S OWN NUMBER, not a retyped one: the constant is derived from
    // the contract's prose and the sentence prints it.
    expect(why).toContain(String(EFFECTS_PRESET_RAMP_SPAN_MAX));
    expect(why).toMatch(/top \+ lines/);
    expect(why).toMatch(/^preset "probe" ramp top:/);
    // And it says what the document still holds — `bandEdgeRefusal`'s rule.
    expect(why).toContain(`top is still ${ramp.top}`);
  });

  it('names the largest OTHER value the typed one admits, so the author has a way out', () => {
    const ramp = { ...newRamp(), lines: 200 };
    const why = rampSpanRefusal(ramp, ID, 'top', 100)!;
    expect(why).not.toBeNull();
    expect(why).toContain(`the largest lines is ${EFFECTS_PRESET_RAMP_SPAN_MAX - 100}`);
  });

  it('the mirror direction refuses too — the bound is on the PAIR, not on `top`', () => {
    const ramp = { ...newRamp(), top: 200 };
    expect(rampSpanRefusal(ramp, ID, 'lines', 100)).not.toBeNull();
    expect(rampSpanRefusal(ramp, ID, 'lines', EFFECTS_PRESET_RAMP_SPAN_MAX - 200)).toBeNull();
  });

  it('a non-integer and an out-of-range value are refused separately', () => {
    const ramp = newRamp();
    expect(rampSpanRefusal(ramp, ID, 'top', 12.5)).toMatch(/not a whole number/);
    expect(rampSpanRefusal(ramp, ID, 'top', EFFECTS_PRESET_RAMP_TOP_RANGE.min - 1))
      .toContain(`${EFFECTS_PRESET_RAMP_TOP_RANGE.min}..${EFFECTS_PRESET_RAMP_TOP_RANGE.max}`);
  });

  /** ⚠ THE COMMAND WITHHOLDS THE WRITE — a refusal that only paints is decoration. */
  it('the refused pair is NOT WRITTEN — the document is unchanged', () => {
    const p = rampPreset({ lines: EFFECTS_PRESET_RAMP_LINES_RANGE.max });
    const before = JSON.stringify(p);
    const cmd = setRampSpanCommand(lib(p), ID, 'top', EFFECTS_PRESET_RAMP_TOP_RANGE.max);
    expect(cmd).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
    // ANTI-VACUOUS: a legal value on the same field DOES produce a command.
    expect(setRampSpanCommand(lib(p), ID, 'top', 3)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. The rate that cannot be typed
// ---------------------------------------------------------------------------

describe('an unrepresentable rate is refused and names what IS available', () => {
  /**
   * ═══ THE (-1, 0) HOLE ═══
   *
   * `frac256` is a magnitude and the sign lives on `whole`, so a negative value
   * needs a negative `whole` and there is none between -1 and 0. -0.5 HAS NO
   * SPELLING. A control that snapped it to 0 (or to -1) would move the author's
   * rate without saying so.
   */
  it('-0.5 is refused, is named as having no spelling, and offers -1 and 0', () => {
    // The premise, measured on the codec rather than assumed: -0.5 really is
    // unspellable, and +0.5 really is spellable, so the hole is a SIGN fact.
    expect(presetFp16FromNumber(-0.5)).toBeNull();
    expect(presetFp16FromNumber(0.5)).toEqual({ whole: 0, frac256: 128 });

    expect(rampRateProblem(-0.5)).toBe('sign-hole');
    expect(rampRateNeighbours(-0.5)).toEqual({ below: -1, above: 0 });

    const why = rampRateRefusal(newRamp(), ID, 'step', -0.5)!;
    expect(why).not.toBeNull();
    expect(why).toMatch(/HAS NO SPELLING/);
    // ⚠ IT NAMES WHAT THEY CAN HAVE. A refusal that only says no sends the
    // author hunting for a nearby value that does not exist either.
    expect(why).toContain('-1 and 0');
    expect(why).toMatch(/not rounded to either/);
    // The units say which field it is about: `step` is a RATE.
    expect(why).toContain('px per scanline');
  });

  it('NOTHING SNAPS — the command refuses the write outright', () => {
    const p = rampPreset();
    const before = JSON.stringify(p);
    expect(setRampRateCommand(lib(p), ID, 'step', -0.5)).toBeNull();
    expect(setRampRateCommand(lib(p), ID, 'start', 0.3)).toBeNull();
    expect(JSON.stringify(p)).toBe(before);
    // ANTI-VACUOUS: a representable rate on the same field DOES commit.
    const ok = setRampRateCommand(lib(p), ID, 'step', -1.5);
    expect(ok).not.toBeNull();
    expect(ok!.newPreset!.ramp!.step).toEqual({ whole: -1, frac256: 128 });
    // ...and it is the SIGN RULE's value, not the naive one.
    expect(presetFp16ToNumber(ok!.newPreset!.ramp!.step)).toBe(-1.5);
  });

  it('an off-grid rate names the two grid values around it', () => {
    expect(rampRateProblem(0.3)).toBe('off-grid');
    const n = rampRateNeighbours(0.3);
    expect(n.below).toBe(76 / 256);
    expect(n.above).toBe(77 / 256);
    const why = rampRateRefusal(newRamp(), ID, 'start', 0.3)!;
    expect(why).toContain(String(76 / 256));
    expect(why).toContain(String(77 / 256));
    expect(why).toContain(`1/${EFFECTS_PRESET_FP16_FRAC_RANGE.max + 1} px`);
  });

  it('the range ends are the AUTHORED range, built from fp16\'s own bounds', () => {
    expect(RAMP_RATE_MAX).toBe(presetFp16ToNumber({
      whole: EFFECTS_PRESET_FP16_WHOLE_RANGE.max, frac256: EFFECTS_PRESET_FP16_FRAC_RANGE.max,
    }));
    // ⚠ THE RANGE IS ASYMMETRIC, and this row states it rather than assuming a
    // symmetry that is not there: `whole` is -512..511, so the smallest value is
    // one whole pixel further from zero than the largest. A control that mirrored
    // the maximum would refuse a legal rate at the bottom end.
    expect(RAMP_RATE_MIN).toBe(presetFp16ToNumber({
      whole: EFFECTS_PRESET_FP16_WHOLE_RANGE.min, frac256: EFFECTS_PRESET_FP16_FRAC_RANGE.max,
    }));
    expect(RAMP_RATE_MIN).toBeLessThan(-RAMP_RATE_MAX);
    expect(RAMP_RATE_UNIT).toBe(1 / (EFFECTS_PRESET_FP16_FRAC_RANGE.max + 1));
    // Both ends ARE spellable — the range is inclusive, not an open interval.
    expect(presetFp16FromNumber(RAMP_RATE_MAX)).not.toBeNull();
    expect(presetFp16FromNumber(RAMP_RATE_MIN)).not.toBeNull();

    const hi = rampRateRefusal(newRamp(), ID, 'step', RAMP_RATE_MAX + 1)!;
    expect(hi).toMatch(/outside the AUTHORED range/);
    expect(hi).toContain(String(RAMP_RATE_MAX));
    // The schema's own rule: state the range, note the width, never the reverse.
    expect(hi).toMatch(/16\.16/);
    expect(rampRateNeighbours(RAMP_RATE_MAX + 1)).toEqual({ below: RAMP_RATE_MAX, above: null });
  });

  /**
   * ⚠ THE CROSS-CHECK THAT KEEPS THE PANEL AND THE CODEC IN STEP.
   *
   * `rampRateProblem` is a sentence-picker and `presetFp16FromNumber` is the
   * answer; two functions, and a control is only honest while they agree. A
   * discriminator that said "fine" where the converter says null would be a
   * control that shows no refusal and writes nothing — the silent no-op this
   * whole parcel exists to remove.
   */
  it('the discriminator and the converter agree on every case in a swept corpus', () => {
    const corpus: number[] = [];
    for (let u = -600; u <= 600; u++) corpus.push(u / 256);
    corpus.push(0, -0, 1, -1, 0.5, -0.5, 0.3, -0.3, 1 / 3,
      RAMP_RATE_MIN, RAMP_RATE_MAX, RAMP_RATE_MIN - RAMP_RATE_UNIT,
      RAMP_RATE_MAX + RAMP_RATE_UNIT, Number.NaN, Number.POSITIVE_INFINITY);
    let holes = 0;
    for (const px of corpus) {
      const spellable = presetFp16FromNumber(px) !== null;
      expect(rampRateProblem(px) === null, `px=${px}`).toBe(spellable);
      if (!spellable) holes++;
    }
    // ANTI-VACUOUS: the corpus really contains unspellable values, so the
    // agreement is not "both said yes to everything".
    expect(holes).toBeGreaterThan(200);
  });

  /**
   * The fallback in `rampRateNeighbours` is `-1` / `0`, and its docblock claims
   * that inside the range the ONLY reason a grid value is unspellable is the
   * hole. This is that claim, swept.
   */
  it('inside the range, the only unspellable grid values are the hole\'s', () => {
    let inHole = 0;
    for (let u = -1500; u <= 1500; u++) {
      const px = u / 256;
      if (presetFp16FromNumber(px) !== null) continue;
      expect(px > -1 && px < 0, `px=${px}`).toBe(true);
      inHole++;
    }
    expect(inHole).toBe(EFFECTS_PRESET_FP16_FRAC_RANGE.max);   // 255 values in (-1, 0)
  });
});

// ---------------------------------------------------------------------------
// 3. The display lag — applied to what the author sees, and to nothing else
// ---------------------------------------------------------------------------

describe('the VSRAM display lag is applied to the readout and to nothing else', () => {
  /**
   * ═══ THE JUDGEMENT, AS A ROW ═══
   *
   * MEASURED BY THE ENGINE LANE, 2026-09-03: no stage of the engine path
   * compensates — not the codec, not `tools/effects_gen.py`, not the
   * constructor. The compensation is preview-only and it is ours, so a readout
   * that speaks in SCREEN lines must add the lag, exactly once.
   *
   * The expectation is DERIVED FROM THE CONSTANT, never from the number 1: if
   * the contract ever restates the latency the row moves with it, and a row that
   * hardcoded `+ 1` would keep passing while the readout went wrong.
   */
  it('the readout adds the lag exactly once, to both ends of the span', () => {
    const ramp = { ...newRamp(), top: 64, lines: 128 };
    const span = rampDisplaySpan(ramp);
    expect(span.first).toBe(ramp.top + EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG);
    expect(span.last)
      .toBe(ramp.top + ramp.lines - 1 + EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG);
    // ANTI-VACUOUS: the lag is not zero, so "applied" and "not applied" are
    // distinguishable readings. A lag of 0 is refused at the codec's module load
    // for exactly this reason, and this row would be meaningless without it.
    expect(EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG).toBeGreaterThan(0);
    expect(span.first).not.toBe(ramp.top);
  });

  /**
   * THE CORROBORATION. With the lag applied, a maximal run's last displayed line
   * is `top + lines`, and the span interlock caps that at 223 — the last line of
   * a 224-line screen. The two constants meet exactly at the bottom of the
   * display, which is what makes the lag a reading of the contract rather than
   * an opinion: a lag of 0 would leave a line spare, a lag of 2 would run off.
   */
  it('a maximal run\'s last DISPLAYED line lands exactly on the span bound', () => {
    const top = 3;
    const lines = EFFECTS_PRESET_RAMP_SPAN_MAX - top;
    expect(rampSpanRefusal({ ...newRamp(), top }, ID, 'lines', lines)).toBeNull();
    expect(rampDisplaySpan({ ...newRamp(), top, lines }).last)
      .toBe(EFFECTS_PRESET_RAMP_SPAN_MAX);
  });

  it('the painted readout shows BOTH spans, so neither can be read as the other', () => {
    const ramp = { ...newRamp(), top: 64, lines: 128 };
    const gloss = rampDisplayGloss(ramp);
    expect(gloss).toContain('64-191');                 // the lines it writes on
    expect(gloss).toContain('65-192');                 // the lines a viewer sees
    expect(gloss).toMatch(/screen lines/);
    // And the reason is reachable on the same readout.
    expect(RAMP_DISPLAY_LAG_NOTE).toContain(String(EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG));
    expect(RAMP_DISPLAY_LAG_NOTE).toMatch(/NO STAGE OF THE ENGINE PATH compensates/);
  });

  /**
   * ⚠ AND NOTHING WRITES IT INTO THE DOCUMENT. Applying a display correction to
   * the FILE would change what the engine runs in order to fix what an editor
   * shows — so `top` goes to disk verbatim, through every command on this
   * surface and through the codec's own writer.
   */
  it('the document keeps the ENGINE\'s top — the lag never reaches disk', () => {
    // `top` 32 with the seed's `lines` 128 spans to 160, inside the interlock —
    // so this row measures the WRITE and not the span refusal.
    const p = rampPreset({ top: 64 });
    const cmd = setRampSpanCommand(lib(p), ID, 'top', 32)!;
    expect(cmd).not.toBeNull();
    expect(cmd.newPreset!.ramp!.top).toBe(32);
    const text = serializeEffectsPreset(cmd.newPreset!);
    expect(JSON.parse(text).ramp.top).toBe(32);
    expect(parseEffectsPreset(text, ID).ramp!.top).toBe(32);
    // ⚠ AND THE DISPLAY SPAN OF THE SAME DOCUMENT IS ONE LINE LATER, so this is
    // not "the lag is nowhere" — it is "the lag is in the readout and not the file".
    expect(rampDisplaySpan(cmd.newPreset!.ramp!).first)
      .toBe(32 + EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG);
  });
});

// ---------------------------------------------------------------------------
// 4. Round trip through the document
// ---------------------------------------------------------------------------

describe('a ramp authored through the controls round-trips byte for byte', () => {
  it('every command\'s output parses back identical, and grows no bands key', () => {
    let p = rampPreset();
    const apply = (c: { newPreset: EffectsPreset | null } | null): void => {
      expect(c).not.toBeNull();
      p = c!.newPreset!;
    };
    apply(setRampSpanCommand(lib(p), ID, 'top', 32));
    apply(setRampSpanCommand(lib(p), ID, 'lines', 96));
    apply(setRampAddrCommand(lib(p), ID, 2));
    apply(setRampRateCommand(lib(p), ID, 'start', -1.5));
    apply(setRampRateCommand(lib(p), ID, 'step', 0.125));

    expect(p.ramp).toEqual({
      top: 32, lines: 96, target: { vsram: { addr: 2 } },
      start: { whole: -1, frac256: 128 }, step: { whole: 0, frac256: 32 },
    });
    // The writer invents nothing: no `bands`, no `name`, no padded channels.
    expect(Object.keys(p).sort()).toEqual(['id', 'ramp', 'schema']);

    const text = serializeEffectsPreset(p);
    const back = parseEffectsPreset(text, ID);
    expect(back).toEqual(p);
    expect(serializeEffectsPreset(back)).toBe(text);
    // ...and the whole five-key set really is on disk.
    for (const k of RAMP_KEYS) expect(JSON.parse(text).ramp).toHaveProperty(k);
    expect(RAMP_KEYS).toHaveLength(5);
  });

  it('a seeded ramp is inside every bound it will be measured against', () => {
    const r = newRamp();
    expect(rampSpanRefusal(r, ID, 'top', r.top)).toBeNull();
    expect(rampSpanRefusal(r, ID, 'lines', r.lines)).toBeNull();
    expect(rampAddrRefusal(r, ID, r.target.vsram.addr)).toBeNull();
    expect(r.top + r.lines).toBeLessThanOrEqual(EFFECTS_PRESET_RAMP_SPAN_MAX);
    // ...and it is not born inert: the seeded step is a real rate.
    expect(presetFp16ToNumber(r.step)).not.toBe(0);
    // ...and it parses as a legal document, which is the only claim that counts.
    expect(parseEffectsPreset(serializeEffectsPreset(rampPreset()), ID).ramp).toEqual(r);
  });

  it('the address gloss states only what the contract establishes', () => {
    expect(rampAddrGloss(0)).toMatch(/plane A/);
    expect(rampAddrGloss(2)).toMatch(/plane B/);
    // ⚠ AND IT INVENTS NOTHING FOR THE REST. The schema says an odd address's
    // meaning is NOT ESTABLISHED, so the gloss must not name a column or a plane
    // for one.
    for (const a of [1, 3, 4, 40, 77, EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE.max]) {
      expect(rampAddrGloss(a), `addr ${a}`).not.toMatch(/plane [AB]/);
      expect(rampAddrGloss(a), `addr ${a}`).not.toMatch(/column/);
    }
    expect(rampAddrRefusal(newRamp(), ID, EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE.max + 1))
      .toContain(String(EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE.max));
  });

  it('the summary says one rate, one start, one total — and no per-line list', () => {
    const s = rampDriftSummary({ ...newRamp(), top: 64, lines: 128 });
    expect(s).toMatch(/^One rate over 128 lines:/);
    // start 0, step 0.25, 127 further lines -> 31.75
    expect(s).toContain('ends at 31.75 px');
    expect(s).toContain('a total of 31.75 px');
  });
});

// ---------------------------------------------------------------------------
// 5. The MUST NOT
// ---------------------------------------------------------------------------

describe('the per-line-curve MUST NOT is the contract\'s sentence, not ours', () => {
  it('the full wording is parsed out of the schema and names the curve', () => {
    expect(RAMP_MUST_NOT).toMatch(/a ramp authors exactly ONE linear rate/);
    expect(RAMP_MUST_NOT).toMatch(/NO per-line curve/);
    expect(RAMP_MUST_NOT).toMatch(/no field that could receive a table/);
  });

  /**
   * The two halves must make the SAME claim — `presetLimitsShort()`'s rule. A
   * short sentence that dropped the curve would leave the painted half saying
   * something the contract does not, which is how a control author reads a rule
   * that is not there.
   */
  it('the painted half carries both claims the contract half does', () => {
    expect(RAMP_MUST_NOT_SHORT).toMatch(/curve/i);
    expect(RAMP_MUST_NOT_SHORT).toMatch(/one rate/i);
    expect(RAMP_MUST_NOT_SHORT).toMatch(/one start/i);
    // ...and it really is SHORT, which is the whole reason for the split.
    expect(RAMP_MUST_NOT_SHORT.length).toBeLessThan(RAMP_MUST_NOT.length);
  });

  it('the ramp has exactly the five keys and no sixth is authorable', () => {
    expect([...RAMP_KEYS].sort()).toEqual(['lines', 'start', 'step', 'target', 'top']);
    expect(RAMP_KEYS).not.toContain('curve');
    expect(Object.keys(newRamp()).sort()).toEqual([...RAMP_KEYS].sort());
  });
});

// ---------------------------------------------------------------------------
// 6. The dead band controls, and the sentence beside them
// ---------------------------------------------------------------------------

describe('the band controls on a ramp document are refused WITH A REASON', () => {
  /**
   * ⚠ THE PREMISE FIRST, MEASURED: the band commands really are silent no-ops on
   * a ramp document. Without this the refusal row would be a sentence beside a
   * control that still worked.
   */
  it('addBandCommand and removeBandCommand really do nothing on a ramp document', () => {
    const p = rampPreset();
    expect(addBandCommand(lib(p), ID)).toBeNull();
    expect(removeBandCommand(lib(p), ID, 0)).toBeNull();
    // ANTI-VACUOUS: on a BANDS document the same call produces a command.
    expect(addBandCommand(lib(newPreset(ID)), ID)).not.toBeNull();
  });

  it('the refusal names the document, the rule and the way out', () => {
    const why = bandControlsRefusal(rampPreset())!;
    expect(why).not.toBeNull();
    expect(why).toMatch(/^preset "probe" carries a ramp, not bands\./);
    expect(why).toMatch(/EXACTLY ONE raster program/);
    expect(why).toMatch(/no combinator/);
    // THE WAY OUT, which is what makes it a reason rather than a wall.
    expect(why).toMatch(/Raster program row/);
    expect(why).toMatch(/one undo step/);
    // ...and it is silent on a bands document, so it is a condition, not decor.
    expect(bandControlsRefusal(newPreset(ID))).toBeNull();
  });

  /**
   * ⚠ THE DISABLING PREDICATE AND THE SENTENCE ARE ONE DERIVATION. This is the
   * `lastBandRefusal` idiom the brief named: the panel reads the same function
   * for `disabled` and for the Hint, so they cannot describe different
   * conditions.
   */
  it('lastBandRefusal answers the CHANNEL on a ramp document, not the band floor', () => {
    const why = lastBandRefusal(rampPreset())!;
    expect(why).toBe(bandControlsRefusal(rampPreset()));
    // ⚠ AND IT DOES NOT SAY THE FALSE THING. Without the channel arm the floor
    // arm would answer "this is its only raster band" about a document with no
    // bands at all — a disabled control passing for the wrong reason.
    expect(why).not.toMatch(/only raster band/);
    // The floor arm is untouched on a bands document.
    expect(lastBandRefusal(newPreset(ID))).toMatch(/only raster band/);
    const two = newPreset(ID);
    two.bands!.push(newBand());
    expect(lastBandRefusal(two)).toBeNull();
  });

  it('the preset list says `ramp`, not `0 bands`', () => {
    const entries = presetListEntries(lib(rampPreset(), newPreset('b')));
    expect(entries[0].channel).toBe('ramp');
    expect(presetListSummary(entries[0])).toBe('ramp');
    expect(presetListSummary(entries[1])).toBe('1 band');
  });
});

// ---------------------------------------------------------------------------
// 7. The conversion — destructive, and one Ctrl+Z
// ---------------------------------------------------------------------------

describe('switching the raster program is ONE undoable command', () => {
  it('offers exactly the schema\'s two channels', () => {
    expect(RASTER_CHANNEL_OPTIONS.map((o) => o.value).sort()).toEqual(['bands', 'ramp']);
  });

  /**
   * ═══ THE BAR THIS CONTROL HAD TO CLEAR ═══
   *
   * The conversion DISCARDS the other channel, and a destructive control that is
   * not one Ctrl+Z away was not to be built (decision cards d-29, d-30). This
   * row is that guarantee, measured at the command: `oldPreset` is the WHOLE
   * document as it was, so undo re-places it verbatim — every band back, in
   * order, with its colours.
   */
  it('bands -> ramp discards the bands, and oldPreset restores them EXACTLY', () => {
    const p = newPreset(ID, 'a name');
    p.bands!.push({ ...newBand(), top: 10, bot: 20 });
    p.bands!.push({ ...newBand(), top: 30, bot: 40, on: { cram: { addr: 34, colours: [1, 2, 3] } } });
    p.cycles = null;
    const before = JSON.stringify(p);
    expect(p.bands).toHaveLength(3);

    const cmd = setRasterChannelCommand(lib(p), ID, 'ramp')!;
    expect(cmd).not.toBeNull();
    // ONE command — one undo entry.
    expect(cmd.type).toBe('set-effects-preset');

    // The forward step really converted: a ramp, and NO bands key at all.
    expect(presetRasterChannel(cmd.newPreset!)).toBe('ramp');
    expect('bands' in cmd.newPreset!).toBe(false);
    expect(cmd.newPreset!.ramp).toEqual(newRamp());
    // ...and the channels that are not the raster one are untouched.
    expect(cmd.newPreset!.name).toBe('a name');
    expect(cmd.newPreset!.cycles).toBeNull();

    // THE UNDO SIDE, byte for byte against the document as it was.
    expect(JSON.stringify(cmd.oldPreset)).toBe(before);
  });

  it('ramp -> bands discards the ramp, and oldPreset restores it EXACTLY', () => {
    const p = rampPreset({ top: 7, lines: 11 });
    const before = JSON.stringify(p);
    const cmd = setRasterChannelCommand(lib(p), ID, 'bands')!;
    expect(presetRasterChannel(cmd.newPreset!)).toBe('bands');
    expect('ramp' in cmd.newPreset!).toBe(false);
    expect(cmd.newPreset!.bands).toEqual([newBand()]);
    expect(JSON.stringify(cmd.oldPreset)).toBe(before);
  });

  it('never authors the both-keys document the schema refuses', () => {
    for (const start of [newPreset(ID), rampPreset()]) {
      for (const to of ['bands', 'ramp']) {
        const cmd = setRasterChannelCommand(lib(start), ID, to);
        if (cmd === null) continue;   // already that channel — a no-op, not an undo entry
        const keys = Object.keys(cmd.newPreset!);
        expect(keys.filter((k) => k === 'bands' || k === 'ramp')).toHaveLength(1);
        // ...and it survives the codec, which asserts the `oneOf` on serialize.
        expect(() => serializeEffectsPreset(cmd.newPreset!)).not.toThrow();
      }
    }
  });

  it('re-selecting the channel a document already has burns no undo slot', () => {
    expect(setRasterChannelCommand(lib(rampPreset()), ID, 'ramp')).toBeNull();
    expect(setRasterChannelCommand(lib(newPreset(ID)), ID, 'bands')).toBeNull();
    expect(setRasterChannelCommand(lib(rampPreset()), ID, 'nonsense')).toBeNull();
  });

  it('the advisory NAMES what would be discarded, before the switch', () => {
    const p = newPreset(ID);
    p.bands!.push(newBand());
    expect(rasterChannelSwapAdvisory(p)).toContain('2 raster bands');
    expect(rasterChannelSwapAdvisory(p)).toMatch(/ONE undo step/);
    expect(rasterChannelSwapAdvisory(rampPreset())).toContain('this ramp');
  });
});
