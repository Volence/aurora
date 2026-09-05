// The `base_swap` AUTHORING SURFACE — a LIST of bands since empyrean `8f56c2c`:
// the granule that fails loudly nowhere, the two edge lines that are neither
// inclusive nor exclusive, the order rule NOBODY downstream enforces, and the
// three-channel arithmetic that must not be counted.
//
// ═══ WHAT THIS FILE OWNS THAT THE CODEC'S OWN TESTS DO NOT ═══
//
// `test/formats/effects-preset-base-swap.test.ts` measures the CODEC: the
// constants' derivations, the granule guard, the three-arm `oneOf`, that aeon's
// real shipped document opens. This file measures the CONTROL — what an author
// meets when they type a number:
//
//   1. AN OFF-GRANULE TARGET IS REFUSED AT AUTHOR TIME, NAMES THE TWO LEGAL
//      BASES EITHER SIDE, AND NOTHING SNAPS. The granule is the one bound on
//      this surface that fails loudly NOWHERE downstream: reg $02 drops the low
//      bits silently, so an unaligned base is a different address with nothing
//      else visibly wrong.
//   2. THE ADDRESS IS SHOWN AS AN ADDRESS. Hex beside the decimal everywhere,
//      and the contract's own name for any address the contract names — and NO
//      name for any other, ever. ⚠ AT `8f56c2c` THE CONTRACT STOPPED NAMING ANY,
//      so the correct behaviour is now to name NONE and say so; the rows below
//      measure the empty set over a defined population rather than trusting a
//      lookup that returned nothing.
//   2b. ⚠ THE EDGES ARE NEITHER INCLUSIVE NOR EXCLUSIVE. `line` and
//      `restore_line` are BOTH fire lines and the register changes ~45% across
//      each; the fully swapped rows are `line+1 .. restore_line-1`. Both natural
//      readings are wrong, so the rows here check the schema's own measured
//      witness rather than an inclusive range.
//   2c. ⚠ ORDER IS ENFORCED BY NEITHER THE SCHEMA NOR AEON'S GENERATOR. Aurora
//      derives strict ascent over the flattened fire sequence and NAMES
//      `fire_lines` as the real authority. The rows prove Aurora refuses it,
//      prove the SCHEMA does NOT (or the refusal would be theatre), and prove
//      the codec still accepts such a document.
//   3. THE LINE RANGE IS NOT THE RAMP'S, and the refusal says so rather than
//      leaving the next reader to assume symmetry.
//   4. THE CONVERSION IN AND OUT IS ONE UNDOABLE COMMAND that restores exactly
//      what was there.
//   5. ⚠ NOTHING ON THIS SURFACE COUNTS THE CHANNELS. Every list is derived from
//      the schema's own `oneOf` or is a map with a module-load guard, so a
//      fourth arm is a data change — measured here per channel, in loops driven
//      by `EFFECTS_PRESET_RASTER_CHANNELS`, never by a typed triple.
//
// ⚠ NOTHING HERE CAN SEE A PIXEL. The node suite has no React and no canvas, so
// every row is about a function's answer; that the panel mounts these answers,
// paints the sentences and refuses in the real app is measured by
// `scratchpad/base-swap-control-harness.mjs` (`npm run harness:base-swap-control`)
// and by the source rows in
// `components/effects/__tests__/base-swap-control-wording.test.ts`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  EFFECTS_PRESET_BASE_SWAP_KEYS,
  EFFECTS_PRESET_BASE_SWAP_OPTIONAL_KEYS,
  EFFECTS_PRESET_BASE_SWAP_MIN_BANDS,
  EFFECTS_PRESET_BASE_SWAP_PLANES,
  EFFECTS_PRESET_BASE_SWAP_INSIDE_OFFSETS,
  EFFECTS_PRESET_BASE_SWAP_ORDER_AUTHORITY,
  EFFECTS_PRESET_BASE_SWAP_LINE_RANGE,
  EFFECTS_PRESET_BASE_SWAP_RESTORE_LINE_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
  EFFECTS_PRESET_SCHEMA,
  baseSwapInsideRows, baseSwapFires, baseSwapOrderRefusal,
  EFFECTS_PRESET_RAMP_TOP_RANGE,
  EFFECTS_PRESET_RASTER_CHANNELS,
  EFFECTS_PRESET_PROGRAM_ARMS,
  isBaseSwapTargetAligned,
  presetRasterChannel,
  presetProgramArm,
  parseEffectsPreset,
  serializeEffectsPreset,
  type EffectsPreset,
  type EffectsPresetLibrary,
  type EffectsPresetBaseSwap,
  type EffectsPresetBaseSwapBand,
} from '../../../core/formats/effects/preset';
import {
  validateAgainstSchema, type JsonSchema,
} from '../../../core/formats/effects/json-schema-subset';
import {
  newBaseSwap, newBaseSwapBand, newPreset, newBand, newRamp,
  BASE_SWAP_TITLE, BASE_SWAP_LIST_TITLE, BASE_SWAP_FIELD_TITLES,
  BASE_SWAP_ASYMMETRIES, BASE_SWAP_ASYMMETRIES_SHORT, BASE_SWAP_WHAT_YOU_SEE,
  BASE_SWAP_NAMED_TARGETS, fmtVramBase, fmtVramBaseBoth,
  baseSwapTargetGloss, baseSwapSummary, baseSwapBandSummary, baseSwapInsideRowsText,
  baseSwapOrderAdvisory, addBaseSwapBandRefusal, lastBaseSwapBandRefusal,
  baseSwapLineRefusal, baseSwapRestoreLineRefusal, baseSwapPlaneRefusal,
  baseSwapTargetRefusal, baseSwapTargetNeighbours,
  setBaseSwapLineCommand, setBaseSwapTargetCommand, setBaseSwapPlaneCommand,
  setBaseSwapRestoreLineCommand, addBaseSwapBandCommand, removeBaseSwapBandCommand,
  setProgramArmCommand, programArmSwapAdvisory, programArmSeedRefusal,
  programArmEditorGap, programArmEditorGapFor,
  PROGRAM_ARM_OPTIONS, bandControlsRefusal,
  presetListEntries, presetListSummary,
  RAMP_TITLE,
} from '../effects-preset';

const ID = 'probe';
const G = EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE;
const LINE = EFFECTS_PRESET_BASE_SWAP_LINE_RANGE;
const TARGET = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE;

const S = EFFECTS_PRESET_SCHEMA as unknown as JsonSchema;
const RESTORE = EFFECTS_PRESET_BASE_SWAP_RESTORE_LINE_RANGE;

/** A document whose band 0 carries `over` on top of the contract's own seed. */
function swapPreset(over: Partial<EffectsPresetBaseSwapBand> = {}): EffectsPreset {
  const bands = newBaseSwap();
  bands[0] = { ...bands[0], ...over };
  return { schema: 1, id: ID, base_swap: bands };
}
/** A document carrying exactly these bands. */
function swapOf(...bands: EffectsPresetBaseSwapBand[]): EffectsPreset {
  return { schema: 1, id: ID, base_swap: bands };
}
/** One band, seeded from the contract and moved to `line`. */
function bandAt(line: number, over: Partial<EffectsPresetBaseSwapBand> = {}):
EffectsPresetBaseSwapBand {
  return { ...newBaseSwapBand(), line, ...over };
}
function lib(...presets: EffectsPreset[]): EffectsPresetLibrary {
  return { presets, unreadable: [], notices: [], loadedPaths: [] };
}
/** A fresh document per channel, built by the panel's OWN seeds — never typed. */
function documentOf(channel: string): EffectsPreset {
  const p: EffectsPreset = { schema: 1, id: ID };
  const cmd = setProgramArmCommand(lib(p), ID, channel);
  if (cmd === null || !cmd.newPreset) throw new Error(`no seed for channel "${channel}"`);
  return cmd.newPreset;
}

// ---------------------------------------------------------------------------
// 1. The seed, and the two keys there are
// ---------------------------------------------------------------------------

describe('a fresh base swap is legal by construction, and is the contract\'s worked example', () => {
  it('is a LIST of minItems bands, not an object — the shape that broke', () => {
    // ⚠ THE HARD BREAK, ASSERTED FROM THE SCHEMA RATHER THAN FROM THIS FILE.
    // `base_swap` was one closed {line, target} object; the single-object form
    // is REFUSED with no legacy arm, and a fresh document must be born in the
    // new shape or every save is a document aeon's loader rejects.
    expect(Array.isArray(newBaseSwap())).toBe(true);
    expect(newBaseSwap()).toHaveLength(EFFECTS_PRESET_BASE_SWAP_MIN_BANDS);
    expect(EFFECTS_PRESET_BASE_SWAP_MIN_BANDS).toBeGreaterThanOrEqual(1);
    // ANTI-VACUOUS: the OLD shape really is refused now, so "it is a list" is a
    // claim about a contract that changed and not a restatement of the type.
    expect(validateAgainstSchema(
      { schema: 1, id: ID, base_swap: { line: LINE.min, target: 0 } }, S,
    ).length, 'the schema still ACCEPTS the pre-8f56c2c single-object form')
      .toBeGreaterThan(0);
  });

  it('a band writes every required key and no undeclared one', () => {
    expect([...EFFECTS_PRESET_BASE_SWAP_KEYS].sort()).toEqual(['line', 'plane', 'target']);
    expect(Object.keys(newBaseSwapBand()).sort())
      .toEqual([...EFFECTS_PRESET_BASE_SWAP_KEYS].sort());
    // ⚠ AND `restore_line` IS OMITTED ON PURPOSE, not forgotten. Absent means
    // the band runs to the BOTTOM OF THE DISPLAY — the shipped single-edge
    // shape — and where a band ENDS is the author's decision, not Aurora's.
    expect(EFFECTS_PRESET_BASE_SWAP_OPTIONAL_KEYS).toContain('restore_line');
    expect(newBaseSwapBand().restore_line).toBeUndefined();
    expect(baseSwapInsideRows(newBaseSwapBand()).toBottom).toBe(true);
    expect(baseSwapInsideRows(newBaseSwapBand()).last).toBeNull();
  });

  it('the seeded plane is one the schema admits, and the enum is CLOSED to two', () => {
    expect(EFFECTS_PRESET_BASE_SWAP_PLANES).toContain(newBaseSwapBand().plane);
    expect(EFFECTS_PRESET_BASE_SWAP_PLANES.length).toBe(2);
    // ANTI-VACUOUS: a spelling outside the enum really is refused by the schema,
    // so the closure is the contract's and not this file's opinion.
    expect(validateAgainstSchema(
      swapPreset({ plane: 'SpriteTable' }), S,
    ).length, 'the schema accepts a VdpBase variant that is not a plane').toBeGreaterThan(0);
  });

  /**
   * ⚠ A SEED MUST NOT BE BORN ILLEGAL — `newBand`'s rule. A fresh document that
   * trips a rule the author had no hand in teaches them the editor is broken.
   * Both halves are checked against the CONSTANTS, not against the numbers the
   * seed happens to hold.
   */
  it('is inside the line range, ON the granule, and in ASCENDING fire order', () => {
    const seed = newBaseSwap();
    expect(baseSwapLineRefusal(seed, ID, 0, seed[0].line)).toBeNull();
    expect(baseSwapTargetRefusal(seed, ID, 0, seed[0].target)).toBeNull();
    expect(isBaseSwapTargetAligned(seed[0].target)).toBe(true);
    expect(seed[0].line).toBeGreaterThanOrEqual(LINE.min);
    expect(seed[0].line).toBeLessThanOrEqual(LINE.max);
    // ⚠ AND LEGAL NOW INCLUDES THE RULE NO SCHEMA KEYWORD EXPRESSES. A seed that
    // validated but that `fire_lines` refused at .emp build time would be a
    // fresh document that cannot be built, and the author had no hand in it.
    expect(baseSwapOrderRefusal(seed)).toBeNull();
    expect(validateAgainstSchema(swapPreset(), S)).toEqual([]);
  });

  /**
   * ═══ ⚠ THE SENTENCE THIS SEED IS PARSED FROM NOW CARRIES **TWO** LINE
   * NUMBERS, AND THE STALE ONE IS FIRST. ═══
   *
   * Until empyrean `c4a1da2` the schema read "The shipped section-6 preset fires
   * on 160." — one number, present tense, and the derivation could not be wrong.
   * It now reads "…fired on 160 as bound at aeon 850d4c60 and on 3 since aeon
   * 8bf6df74", because the owner moved the swap to the top of the frame. The
   * OBVIOUS repair to the broken regex — relax `/fires on/` to `/fired on/` —
   * matches, is green, and seeds **160**, a value the sentence exists to say is
   * superseded.
   *
   * ⚠ AND EVERY ROW ABOVE STAYS GREEN THROUGH THAT. 160 is inside the line
   * range, on no granule that matters, and refused by nothing: the seed rows
   * check LEGALITY, and a stale binding is perfectly legal. So the wrong repair
   * was invisible to this whole file until this row.
   *
   * THE CHECK IS AGAINST A SECOND, INDEPENDENT DOCUMENT — not a second reading
   * of the same sentence, which would agree with a wrong derivation for the same
   * reason. `preset-canonical-golden.json` carries aeon's OWN section-6 preset,
   * byte-for-byte from `origin/master`; the line it actually binds is the line a
   * fresh document must be seeded with. Two repos, one number.
   */
  it('seeds the CURRENT binding, not the superseded one the same sentence names', () => {
    const golden = JSON.parse(readFileSync(
      resolve(__dirname, '../../../../test/fixtures/effects/preset-canonical-golden.json'), 'utf8',
    )) as { documents: Record<string, string> };
    const shipped = JSON.parse(golden.documents.ojz_sec6_baseswap) as
      { base_swap: { line: number }[] };
    // Anti-vacuous: the fixture really is aeon's section-6 base-swap document,
    // in the LIST shape, with at least one band.
    expect(Array.isArray(shipped.base_swap)).toBe(true);
    expect(shipped.base_swap.length).toBeGreaterThan(0);
    expect(Number.isInteger(shipped.base_swap[0].line)).toBe(true);
    expect(
      newBaseSwap()[0].line,
      "a fresh base_swap is not seeded with the line aeon's section-6 preset actually binds. If "
      + 'the schema sentence names two lines, this derivation is reading the SUPERSEDED clause — '
      + 'the historical value, which is legal, in range and refused by nothing, so every other '
      + 'row in this file stays green while new documents are born stale.',
    ).toBe(shipped.base_swap[0].line);
    // ...and the schema really does name a DIFFERENT, superseded line beside it,
    // so this row is guarding against a live hazard rather than a hypothetical.
    // ⚠ THE SENTENCE MOVED AT `8f56c2c`: the per-field `line` description was
    // rewritten down to the range, and both worked line numbers now live in the
    // KEY's description. A matcher still aimed at the field would find nothing
    // and this row would go red for the right reason.
    const was = /presets\/ojz_sec6_baseswap\.json \{line: (\d+), target: (\d+)\}/
      .exec(BASE_SWAP_TITLE);
    expect(was, 'the schema no longer names a superseded section-6 line — if it has gone back to '
      + 'stating one number, this row still holds but its hazard is gone; see BASE_SWAP_SEED_LINE')
      .toBeTruthy();
    expect(Number(was![1])).not.toBe(newBaseSwap()[0].line);
  });

  /**
   * ═══ ⚠ THE CONTRACT STOPPED NAMING ADDRESSES AT `8f56c2c`, AND THIS ROW IS
   * THE ONE THAT CHANGED SIDES ═══
   *
   * It used to read "seeds the address the contract NAMES, so the card can say
   * what it does", and it was true: `target`'s description ended "targets 57344
   * ($E000, VRAM_PLANE_B)". The amendment rewrote that description down to the
   * range and the granule. The two `VRAM_PLANE_*` names that survive in the key's
   * prose are the HOME bases an OFF fire writes — "the engine's fact, never
   * authored" — and carry no addresses at all.
   *
   * So the seed is now legal and UNEXPLAINED, and the honest behaviour is to say
   * so rather than to keep a name Aurora would be inventing. The seed target is
   * still the shipped section-6 one (the only address the contract writes down
   * anywhere), and the ROW BELOW asserts the gloss admits it has no name.
   */
  it('seeds a legal address the contract no longer NAMES, and says so', () => {
    const seed = newBaseSwapBand();
    expect(isBaseSwapTargetAligned(seed.target)).toBe(true);
    expect(BASE_SWAP_NAMED_TARGETS.size).toBe(0);
    expect(baseSwapTargetGloss(seed.target)).toContain('names no VRAM base address');
    // ⚠ AND THE SEED IS STILL THE ONE ADDRESS THE CONTRACT WRITES DOWN, taken
    // from the clause whose disclaimer names the LINE and not the target.
    expect(BASE_SWAP_TITLE).toContain(String(seed.target));
  });

  it('the seeded document survives the codec\'s own round trip', () => {
    const text = serializeEffectsPreset(swapPreset());
    expect(parseEffectsPreset(text, ID)).toEqual(swapPreset());
  });

  it('a MULTI-band document round-trips, restore_line and all', () => {
    const p = swapOf(
      bandAt(LINE.min, { plane: EFFECTS_PRESET_BASE_SWAP_PLANES[1], restore_line: 64 }),
      bandAt(100, { restore_line: 200 }),
    );
    expect(validateAgainstSchema(p, S)).toEqual([]);
    expect(parseEffectsPreset(serializeEffectsPreset(p), ID)).toEqual(p);
  });
});

// ---------------------------------------------------------------------------
// 2. The address, shown as an address — and NOTHING is invented
// ---------------------------------------------------------------------------

describe('a VRAM base is shown as a VRAM base', () => {
  it('the hex is fixed width, derived from the range, and pairs with the decimal', () => {
    const digits = TARGET.max.toString(16).length;
    expect(fmtVramBase(TARGET.max)).toBe(`$${TARGET.max.toString(16).toUpperCase()}`);
    expect(fmtVramBase(TARGET.min)).toHaveLength(1 + digits);
    // The one an author will actually meet, both ways round.
    const seed = newBaseSwapBand().target;
    expect(fmtVramBaseBoth(seed)).toBe(`${fmtVramBase(seed)} (${seed})`);
    expect(parseInt(fmtVramBase(seed).slice(1), 16)).toBe(seed);
  });

  /**
   * ⚠ THE NAME IS THE SCHEMA'S, AND SINCE `8f56c2c` THERE ARE NONE.
   * `rampAddrGloss`'s rule: the contract establishes what it establishes, and a
   * per-address gloss Aurora made up would tell an author they are pointing a
   * plane at a picture they are not — worse than no name at all.
   *
   * ⚠ THE EMPTY SET IS MEASURED, NOT ASSUMED. An empty map from a regex that
   * stopped matching at one path is indistinguishable from a contract that
   * stopped naming anything; the first is a bug and the second is a fact. So
   * this row asserts the SEARCH SPACE is still real prose about this key — if
   * the derivation had simply lost its haystack, the module throws at load and
   * this file never runs at all.
   */
  it('names every address the contract names — which is now NONE — and no other', () => {
    // The population really is the base_swap prose, and it really no longer
    // carries an address name in the "N ($HEX, VRAM_NAME)" shape the gloss reads.
    expect(BASE_SWAP_TITLE.length).toBeGreaterThan(500);
    expect(BASE_SWAP_TITLE).toContain('base_swap');
    expect(BASE_SWAP_FIELD_TITLES.target).toMatch(/multiple of/);
    expect(/(\d+) \(\$[0-9A-Fa-f]+, VRAM_[A-Z0-9_]+\)/.test(BASE_SWAP_TITLE)).toBe(false);
    expect(/(\d+) \(\$[0-9A-Fa-f]+, VRAM_[A-Z0-9_]+\)/.test(BASE_SWAP_FIELD_TITLES.target))
      .toBe(false);
    expect(BASE_SWAP_NAMED_TARGETS.size).toBe(0);

    // EVERY legal base: admitted, on the granule, and honestly unnamed.
    for (let a = TARGET.min; a <= TARGET.max; a += G) {
      const gloss = baseSwapTargetGloss(a);
      expect(gloss, `gloss for ${a}`).toContain(fmtVramBase(a));
      expect(gloss, `gloss for ${a}`).toContain('on the granule');
      expect(gloss, `gloss for ${a}`).toContain('names no VRAM base address');
      // ⚠ AND IT NEVER PUTS A VRAM_* NAME ON ONE. The two names still in the
      // key's prose are HOME bases the engine writes, never authored — a gloss
      // that reached for one would be naming the wrong thing entirely.
      expect(/VRAM_[A-Z0-9_]+/.test(gloss), `gloss for ${a} invented a name`).toBe(false);
    }
  });

  it('an off-granule address says THAT first, because nothing else about it matters', () => {
    const gloss = baseSwapTargetGloss(G + 1);
    expect(gloss).toContain(fmtVramBase(G + 1));
    expect(gloss).toMatch(/NOT on the/);
    expect(gloss).not.toContain('on the granule;');
  });

  /**
   * The band summary is the arithmetic an author would do in their head. It
   * states BOTH bases, so the sentence cannot be read as a count, and it names
   * the plane the band actually re-points rather than assuming Plane A.
   */
  it('the band summary states the plane, the line and both bases', () => {
    const b = bandAt(LINE.min, { plane: EFFECTS_PRESET_BASE_SWAP_PLANES[1], target: TARGET.min });
    const t = baseSwapBandSummary(b);
    expect(t).toContain(`line ${LINE.min}`);
    expect(t).toContain(EFFECTS_PRESET_BASE_SWAP_PLANES[1]);
    expect(t).toContain(fmtVramBaseBoth(TARGET.min));
    // ⚠ IT MUST NOT SAY "Plane A" ON A PlaneB BAND. The pre-list surface was
    // hard-wired to Plane A because the key was; the register IS the content of
    // the inversion, and a sentence naming the wrong one is worse than silence.
    expect(t).not.toContain(EFFECTS_PRESET_BASE_SWAP_PLANES[0]);
  });

  /** The list summary is about the FLATTENED program — the fires, in order. */
  it('the list summary counts bands and names every fire in document order', () => {
    const bands = [bandAt(LINE.min, { restore_line: 64 }), bandAt(100, { restore_line: 200 })];
    const t = baseSwapSummary(bands);
    expect(t).toContain('2 bands');
    expect(t).toContain('4 fires');
    expect(t).toContain('DOCUMENT ORDER');
    expect(t).toContain(`${LINE.min}, 64, 100, 200`);
    // ANTI-VACUOUS: it really is derived from the fires, not from the length.
    expect(baseSwapFires(bands).map((f) => f.line)).toEqual([LINE.min, 64, 100, 200]);
    // A single edge is 1 band and 1 fire, and the singular reads correctly.
    expect(baseSwapSummary([bandAt(LINE.min)])).toContain('1 band, flattened');
    expect(baseSwapSummary([bandAt(LINE.min)])).toContain('1 fire ');
  });
});

// ---------------------------------------------------------------------------
// 3. The line — and the range that is NOT the ramp's
// ---------------------------------------------------------------------------

describe('the fire line is refused at the control', () => {
  it('takes every line in the declared range and refuses both neighbours of it', () => {
    const bs = newBaseSwap();
    expect(baseSwapLineRefusal(bs, ID, 0, LINE.min)).toBeNull();
    expect(baseSwapLineRefusal(bs, ID, 0, LINE.max)).toBeNull();
    expect(baseSwapLineRefusal(bs, ID, 0, LINE.min - 1)).not.toBeNull();
    expect(baseSwapLineRefusal(bs, ID, 0, LINE.max + 1)).not.toBeNull();
    expect(baseSwapLineRefusal(bs, ID, 0, 12.5)).toMatch(/not a whole number/);
    // ...and it says what the document still holds — `bandEdgeRefusal`'s rule.
    expect(baseSwapLineRefusal(bs, ID, 0, LINE.max + 1))
      .toContain(`line is still ${bs[0].line}`);
  });

  /**
   * ⚠ THE ASYMMETRY IS STATED, NOT LEFT TO THE READER. `line` reaches 223 and a
   * ramp's `top` stops at 222 — a run needs a line after it and a single fire
   * does not. The row asserts the INEQUALITY from both constants first, so the
   * sentence is not asserted against numbers that might have converged.
   */
  it('the refusal names the ramp\'s different maximum, from both constants', () => {
    expect(LINE.max).not.toBe(EFFECTS_PRESET_RAMP_TOP_RANGE.max);
    const why = baseSwapLineRefusal(newBaseSwap(), ID, 0, LINE.max + 1)!;
    expect(why).toContain(String(LINE.max));
    expect(why).toContain(String(EFFECTS_PRESET_RAMP_TOP_RANGE.max));
    expect(why).toMatch(/NOT THE RAMP'S RANGE/);
  });
});

// ---------------------------------------------------------------------------
// 4. The granule — the bound that fails loudly nowhere
// ---------------------------------------------------------------------------

describe('an off-granule target is refused, offered neighbours, and NOT snapped', () => {
  /**
   * THE TWO FUNCTIONS MUST AGREE, and they are two functions for the same reason
   * `rampRateProblem` and `presetFp16FromNumber` are: the codec owns the answer
   * and the panel owns the sentence. A control is only honest while they agree,
   * so this sweeps every value in a two-granule window and asserts the refusal
   * is null EXACTLY when the codec calls it aligned.
   */
  it('refuses exactly what the codec calls unaligned, over a swept window', () => {
    const bs = newBaseSwap();
    let refused = 0;
    let accepted = 0;
    for (let v = TARGET.min; v < TARGET.min + 2 * G; v++) {
      const ok = baseSwapTargetRefusal(bs, ID, 0, v) === null;
      expect(ok, `target ${v}`).toBe(isBaseSwapTargetAligned(v));
      if (ok) accepted++; else refused++;
    }
    // ANTI-VACUOUS: the sweep really contained both kinds, in the proportion the
    // granule implies — a window of 2G holds exactly 2 legal addresses.
    expect(accepted).toBe(2);
    expect(refused).toBe(2 * G - 2);
  });

  it('the whole legal set is the granule multiples inside the range, and nothing else', () => {
    const legal: number[] = [];
    for (let v = TARGET.min; v <= TARGET.max; v += G) legal.push(v);
    expect(legal).toHaveLength((TARGET.max - TARGET.min + 1) / G);
    for (const v of legal) expect(baseSwapTargetRefusal(newBaseSwap(), ID, 0, v)).toBeNull();
    expect(baseSwapTargetRefusal(newBaseSwap(), ID, 0, TARGET.max + 1)).not.toBeNull();
    expect(baseSwapTargetRefusal(newBaseSwap(), ID, 0, TARGET.min - 1)).not.toBeNull();
  });

  /**
   * THE NEIGHBOURS ARE COMPUTED, NOT TYPED — `rampRateNeighbours`' rule. A
   * refusal that only says no sends the author hunting; this one hands them the
   * two addresses either side, and the sweep proves they are the CLOSEST legal
   * ones rather than merely legal.
   */
  it('the neighbours bracket the value and nothing legal sits between', () => {
    for (let v = TARGET.min + 1; v < TARGET.min + 3 * G; v += 7) {
      const n = baseSwapTargetNeighbours(v);
      expect(n.below, `below ${v}`).not.toBeNull();
      expect(n.above, `above ${v}`).not.toBeNull();
      expect(isBaseSwapTargetAligned(n.below!)).toBe(true);
      expect(isBaseSwapTargetAligned(n.above!)).toBe(true);
      expect(n.below!).toBeLessThanOrEqual(v);
      expect(n.above!).toBeGreaterThanOrEqual(v);
      // Closest, not merely legal: the gap is one granule for an off-grid value.
      if (!isBaseSwapTargetAligned(v)) expect(n.above! - n.below!).toBe(G);
    }
  });

  it('there is nothing below the first granule and nothing above the last', () => {
    const first = Math.ceil(TARGET.min / G) * G;
    const last = Math.floor(TARGET.max / G) * G;
    expect(baseSwapTargetNeighbours(TARGET.min - 1).below).toBeNull();
    expect(baseSwapTargetNeighbours(TARGET.min - 1).above).toBe(first);
    expect(baseSwapTargetNeighbours(TARGET.max + 1).above).toBeNull();
    expect(baseSwapTargetNeighbours(TARGET.max + 1).below).toBe(last);
  });

  /**
   * ⚠ THE SENTENCE IS THE ROW THAT MATTERS. An off-granule address is not a
   * range error and fails loudly NOWHERE: reg $02 keeps the bits above the
   * granule and drops the rest silently, so the author is pointing Plane A
   * somewhere else with nothing visibly wrong. The refusal must say that, offer
   * the neighbours, and promise it did not snap.
   */
  it('the refusal says WHY, offers both neighbours, and says nothing was snapped', () => {
    const bs = newBaseSwap();
    const off = bs[0].target - 1;
    const why = baseSwapTargetRefusal(bs, ID, 0, off)!;
    expect(why).not.toBeNull();
    expect(why).toMatch(/^preset "probe" base_swap band 0 target:/);
    expect(why).toContain(fmtVramBaseBoth(off));
    expect(why).toContain(fmtVramBase(G));
    expect(why).toMatch(/DROPS the rest SILENTLY/);
    expect(why).toMatch(/NOT A RANGE ERROR/);
    const n = baseSwapTargetNeighbours(off);
    expect(why).toContain(fmtVramBaseBoth(n.below!));
    expect(why).toContain(fmtVramBaseBoth(n.above!));
    // ⚠ AND THEY ARE TWO DIFFERENT ADDRESSES. A pair that collapsed to one value
    // would still satisfy both `toContain`s above — the sentence would read "the
    // nearest legal bases are $C000 (49152) and $C000 (49152)", which offers the
    // author one way out while looking like two.
    expect(n.below).not.toBe(n.above);
    expect(why).toContain(`are ${fmtVramBaseBoth(n.below!)} and ${fmtVramBaseBoth(n.above!)}`);
    expect(why).toMatch(/NOT snapped/);
    expect(why).toContain(`target is still ${fmtVramBaseBoth(bs[0].target)}`);
  });

  it('a non-integer and an out-of-range address each get their own sentence', () => {
    const bs = newBaseSwap();
    expect(baseSwapTargetRefusal(bs, ID, 0, G + 0.5)).toMatch(/not a whole number/);
    expect(baseSwapTargetRefusal(bs, ID, 0, TARGET.max + G)).toMatch(/outside/);
    // Each still hands over what IS available.
    expect(baseSwapTargetRefusal(bs, ID, 0, G + 0.5)).toContain(fmtVramBaseBoth(G));
    expect(baseSwapTargetRefusal(bs, ID, 0, TARGET.max + G)).toContain('nothing higher');
  });
});

// ---------------------------------------------------------------------------
// 5. The commands — the document moves only when the refusal is silent
// ---------------------------------------------------------------------------

describe('the commands withhold exactly what the refusals refuse', () => {
  it('a refused line and a refused target write NOTHING', () => {
    const p = swapPreset();
    const before = JSON.stringify(p);
    expect(setBaseSwapLineCommand(lib(p), ID, 0, LINE.max + 1)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(p), ID, 0, p.base_swap![0].target - 1)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(p), ID, 0, TARGET.max + G)).toBeNull();
    // ⚠ AND NOTHING SNAPPED: the document is byte-identical, not rounded to the
    // nearest granule. Snapping would point Plane A at a different picture.
    expect(JSON.stringify(p)).toBe(before);
  });

  it('a legal line and a legal target DO move the document, and carry the old one', () => {
    const p = swapPreset();
    const before = JSON.stringify(p);
    const line = setBaseSwapLineCommand(lib(p), ID, 0, LINE.max)!;
    expect(line).not.toBeNull();
    expect(line.newPreset!.base_swap![0].line).toBe(LINE.max);
    expect(line.newPreset!.base_swap![0].target).toBe(p.base_swap![0].target);
    expect(JSON.stringify(line.oldPreset)).toBe(before);

    const other = TARGET.min === p.base_swap![0].target ? TARGET.min + G : TARGET.min;
    const target = setBaseSwapTargetCommand(lib(p), ID, 0, other)!;
    expect(target.newPreset!.base_swap![0].target).toBe(other);
    expect(JSON.stringify(target.oldPreset)).toBe(before);
  });

  it('re-typing the value a field already holds burns no undo slot', () => {
    const p = swapPreset();
    expect(setBaseSwapLineCommand(lib(p), ID, 0, p.base_swap![0].line)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(p), ID, 0, p.base_swap![0].target)).toBeNull();
    expect(setBaseSwapPlaneCommand(lib(p), ID, 0, p.base_swap![0].plane)).toBeNull();
  });

  it('an out-of-range BAND INDEX writes nothing rather than growing the list', () => {
    const p = swapPreset();
    const before = JSON.stringify(p);
    for (const i of [-1, p.base_swap!.length, 99]) {
      expect(setBaseSwapLineCommand(lib(p), ID, i, LINE.max), `line at index ${i}`).toBeNull();
      expect(setBaseSwapTargetCommand(lib(p), ID, i, TARGET.min), `target at index ${i}`).toBeNull();
      expect(setBaseSwapPlaneCommand(lib(p), ID, i, EFFECTS_PRESET_BASE_SWAP_PLANES[1]),
        `plane at index ${i}`).toBeNull();
      expect(setBaseSwapRestoreLineCommand(lib(p), ID, i, 100), `restore at index ${i}`).toBeNull();
    }
    expect(JSON.stringify(p)).toBe(before);
  });

  it('neither command touches a document that carries a different channel', () => {
    const ramp = { schema: 1 as const, id: ID, ramp: newRamp() };
    expect(setBaseSwapLineCommand(lib(ramp), ID, 0, LINE.max)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(ramp), ID, 0, TARGET.min)).toBeNull();
    expect(setBaseSwapPlaneCommand(lib(ramp), ID, 0, EFFECTS_PRESET_BASE_SWAP_PLANES[0]))
      .toBeNull();
    expect(setBaseSwapRestoreLineCommand(lib(ramp), ID, 0, 100)).toBeNull();
    expect(addBaseSwapBandCommand(lib(ramp), ID)).toBeNull();
    expect(removeBaseSwapBandCommand(lib(ramp), ID, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5b. THE PLANE — a closed choice, and the register IS the content
// ---------------------------------------------------------------------------

describe('the plane is a choice, and a closed one', () => {
  it('accepts exactly the schema\'s two spellings and refuses anything else', () => {
    const bs = newBaseSwap();
    for (const plane of EFFECTS_PRESET_BASE_SWAP_PLANES) {
      expect(baseSwapPlaneRefusal(bs, ID, 0, plane), plane).toBeNull();
    }
    // ⚠ THE ONE THAT MATTERS. `VdpBase` has five variants; three name the
    // window, the sprite table and hscroll, and a forwarded SpriteTable would
    // re-point the sprite table MID-FRAME. sigil cannot refuse a legal call, so
    // this refusal and the schema's enum are the whole defence.
    const why = baseSwapPlaneRefusal(bs, ID, 0, 'SpriteTable')!;
    expect(why).not.toBeNull();
    expect(why).toContain('SpriteTable');
    expect(why).toMatch(/sprite table mid-frame/);
    expect(why).toContain(`plane is still ${bs[0].plane}`);
    expect(baseSwapPlaneRefusal(bs, ID, 0, '')).not.toBeNull();
    expect(baseSwapPlaneRefusal(bs, ID, 0, 'planea')).not.toBeNull();
  });

  it('switching the plane moves the document and nothing else', () => {
    const p = swapPreset();
    const other = EFFECTS_PRESET_BASE_SWAP_PLANES
      .find((x) => x !== p.base_swap![0].plane)!;
    const cmd = setBaseSwapPlaneCommand(lib(p), ID, 0, other)!;
    expect(cmd.newPreset!.base_swap![0].plane).toBe(other);
    expect(cmd.newPreset!.base_swap![0].line).toBe(p.base_swap![0].line);
    expect(cmd.newPreset!.base_swap![0].target).toBe(p.base_swap![0].target);
    // A refused spelling writes nothing.
    expect(setBaseSwapPlaneCommand(lib(p), ID, 0, 'SpriteTable')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5c. ⚠ THE EDGES — NEITHER INCLUSIVE NOR EXCLUSIVE
// ---------------------------------------------------------------------------

describe('the rows a band actually swaps are the ones nobody guesses', () => {
  /**
   * ═══ THE WITNESS IS THE SCHEMA'S OWN MEASUREMENT ═══
   *
   * The schema states the rule (`line+1 .. restore_line-1`) AND a measured
   * witness (`a 3..64 band is INSIDE 4..63`). Aurora parses the rule and CHECKS
   * it against the witness at module load. This row re-reads the witness out of
   * the contract and applies it end to end, so the property is tied to the
   * contract's sentence and not to two integers typed here.
   */
  it('reproduces the schema\'s own measured witness, read back out of the schema', () => {
    const m = /a (\d+)\.\.(\d+) band is INSIDE (\d+)\.\.(\d+)/.exec(BASE_SWAP_LIST_TITLE);
    expect(m, 'the schema no longer carries the measured edge witness this row is built on')
      .toBeTruthy();
    const [line, restore, first, last] = m!.slice(1, 5).map(Number);
    const rows = baseSwapInsideRows(bandAt(line, { restore_line: restore }));
    expect(rows.first).toBe(first);
    expect(rows.last).toBe(last);
    // ⚠ AND BOTH NATURAL READINGS ARE WRONG, asserted so this row cannot pass by
    // agreeing with an inclusive implementation. The witness has first !== line
    // and last !== restore, which is exactly what makes the question a trap.
    expect(rows.first).not.toBe(line);
    expect(rows.last).not.toBe(restore);
    expect(EFFECTS_PRESET_BASE_SWAP_INSIDE_OFFSETS).toEqual({ first: 1, last: -1 });
  });

  it('an ABSENT restore_line reports an OPEN end, never an invented last row', () => {
    const rows = baseSwapInsideRows(bandAt(LINE.min));
    expect(rows.toBottom).toBe(true);
    expect(rows.last).toBeNull();
    // ⚠ NOT ZERO AND NOT THE LINE MAXIMUM. The schema states no display height
    // anywhere, so any number here would be Aurora inventing a fact in the one
    // place an author would trust it.
    expect(rows.last).not.toBe(0);
    const text = baseSwapInsideRowsText(bandAt(LINE.min));
    expect(text).toContain('bottom of the display');
    expect(text).not.toMatch(/to row \d+/);
  });

  it('the sentence CORRECTS the inclusive reading rather than leaving it available', () => {
    const text = baseSwapInsideRowsText(bandAt(3, { restore_line: 64 }));
    expect(text).toContain('4..63');
    // It names the pair an author would otherwise assume, and denies it.
    expect(text).toContain('NOT 3..64');
    expect(text).toMatch(/FIRE lines/);
  });

  it('a band with NO fully swapped row says so instead of printing a backwards range', () => {
    const rows = baseSwapInsideRows(bandAt(100, { restore_line: 101 }));
    expect(rows.empty).toBe(true);
    expect(rows.first).toBe(101);
    expect(rows.last).toBe(100);
    const text = baseSwapInsideRowsText(bandAt(100, { restore_line: 101 }));
    expect(text).toMatch(/NO row is fully swapped/);
    expect(text).not.toContain('101..100');
  });
});

// ---------------------------------------------------------------------------
// 5d. ⚠ THE ORDER RULE — NOBODY'S REFUSAL BUT `fire_lines`', MOVED EARLIER
// ---------------------------------------------------------------------------

describe('strict ascent is derived, refused early, and NAMES the real authority', () => {
  /**
   * ═══ THE ANTI-VACUOUS ROW, AND IT IS THE PREMISE OF EVERY OTHER ONE HERE ═══
   *
   * If the SCHEMA refused a descending list there would be nothing for Aurora to
   * derive and every row below would be theatre. The schema explicitly does not,
   * and neither does aeon's generator: a document validates, passes the shape
   * check, and fails at `.emp` BUILD time in `fire_lines`. This row proves the
   * gap it exists to close is real.
   */
  it('ANTI-VACUOUS: the schema and the CODEC both ACCEPT an out-of-order list', () => {
    const descending = swapOf(bandAt(100), bandAt(50));
    const overlapping = swapOf(bandAt(10, { restore_line: 100 }), bandAt(50, { restore_line: 120 }));
    const duplicated = swapOf(bandAt(50), bandAt(50));
    const inverted = swapOf(bandAt(100, { restore_line: 50 }));
    for (const doc of [descending, overlapping, duplicated, inverted]) {
      expect(validateAgainstSchema(doc, S), JSON.stringify(doc.base_swap)).toEqual([]);
      expect(() => parseEffectsPreset(JSON.stringify(doc), ID)).not.toThrow();
      expect(() => serializeEffectsPreset(doc)).not.toThrow();
      // ...and Aurora DOES have something to say about each of them.
      expect(baseSwapOrderRefusal(doc.base_swap!), JSON.stringify(doc.base_swap)).not.toBeNull();
    }
  });

  it('refuses descending, duplicated, overlapping and inverted — all four by name', () => {
    expect(baseSwapOrderRefusal([bandAt(100), bandAt(50)])).toMatch(/goes BACKWARDS from/);
    expect(baseSwapOrderRefusal([bandAt(50), bandAt(50)])).toMatch(/DUPLICATES/);
    expect(baseSwapOrderRefusal([bandAt(10, { restore_line: 100 }), bandAt(50)]))
      .toMatch(/that is an overlap/);
    expect(baseSwapOrderRefusal([bandAt(100, { restore_line: 50 })]))
      .toMatch(/ends before it begins/);
    // And ascending lists are silent, including one that touches at no point.
    expect(baseSwapOrderRefusal([bandAt(3, { restore_line: 64 }), bandAt(65, { restore_line: 66 })]))
      .toBeNull();
    expect(baseSwapOrderRefusal([bandAt(LINE.min)])).toBeNull();
  });

  /**
   * ⚠ DOCUMENT ORDER, NOT SORTED — and this row is the whole reason that
   * distinction is written down. The schema's parenthetical says "sort every
   * band's line and restore_line into one sequence and require strict ascent",
   * and a SORT DESTROYS THE EVIDENCE: `[100, 50]` sorted is `[50, 100]`, which
   * ascends. A check built on the parenthetical would accept every descending
   * document and catch only exact duplicates.
   */
  it('a sorted check would MISS this, and the document-order check does not', () => {
    const descending = [bandAt(100), bandAt(50)];
    const fires = baseSwapFires(descending).map((f) => f.line);
    expect(fires).toEqual([100, 50]);
    // The sorted sequence ascends strictly — so the parenthetical's check passes.
    const sorted = [...fires].sort((a, b) => a - b);
    expect(sorted.every((v, i) => i === 0 || v > sorted[i - 1])).toBe(true);
    // Aurora refuses it anyway, which is the stronger reading and the one the
    // load-bearing sentence states.
    expect(baseSwapOrderRefusal(descending)).not.toBeNull();
  });

  it('every message NAMES fire_lines and its file, so Aurora is not the enforcer', () => {
    const a = EFFECTS_PRESET_BASE_SWAP_ORDER_AUTHORITY;
    expect(a.symbol).toBe('fire_lines');
    expect(a.file).toMatch(/raster_dsl\.emp$/);
    // Derived, not typed: the schema really says both.
    expect(BASE_SWAP_LIST_TITLE).toContain(a.symbol);
    expect(BASE_SWAP_LIST_TITLE).toContain(a.file);
    const why = baseSwapOrderRefusal([bandAt(100), bandAt(50)])!;
    expect(why).toContain(a.symbol);
    expect(why).toContain(a.file);
    expect(why).toMatch(/NEITHER THE SCHEMA NOR AEON'S GENERATOR REFUSES THIS/);
    expect(why).toMatch(/BUILD time/);
  });

  /**
   * ⚠ THE REFUSAL FIRES ONLY ON AN EDIT THAT BREAKS AN ALREADY-SOUND LIST.
   *
   * An out-of-order document CAN arrive — the codec accepts one because the
   * contract does. If every control refused while the list was broken, the
   * author would be locked out of the only surface that could repair it, and
   * the editor would be unusable on exactly the document that needs it most.
   */
  it('refuses the edit that BREAKS order, and lets every edit through once it IS broken', () => {
    const sound = swapOf(bandAt(50), bandAt(100));
    // Moving band 1 above band 0 is refused, and nothing is written.
    expect(baseSwapLineRefusal(sound.base_swap!, ID, 1, 40)).toMatch(/not strictly ascending/);
    expect(setBaseSwapLineCommand(lib(sound), ID, 1, 40)).toBeNull();
    // A move that keeps ascent is fine.
    expect(baseSwapLineRefusal(sound.base_swap!, ID, 1, 60)).toBeNull();
    expect(setBaseSwapLineCommand(lib(sound), ID, 1, 60)).not.toBeNull();

    // ⚠ THE ESCAPE HATCH. On a list that is ALREADY broken, the same edit is
    // allowed — including one that leaves it broken, because a repair is often
    // two moves and refusing the first would make the second unreachable.
    const broken = swapOf(bandAt(100), bandAt(50));
    expect(baseSwapOrderAdvisory(broken.base_swap!)).not.toBeNull();
    expect(baseSwapLineRefusal(broken.base_swap!, ID, 1, 40)).toBeNull();
    expect(setBaseSwapLineCommand(lib(broken), ID, 1, 40)).not.toBeNull();
    // And the repair really is reachable: one legal move makes it sound again.
    const fixed = setBaseSwapLineCommand(lib(broken), ID, 1, 150)!;
    expect(baseSwapOrderRefusal(fixed.newPreset!.base_swap!)).toBeNull();
  });

  it('the standing advisory is the SAME predicate the refusal is built on', () => {
    const broken = [bandAt(100), bandAt(50)];
    expect(baseSwapOrderAdvisory(broken)).toBe(baseSwapOrderRefusal(broken));
    expect(baseSwapOrderAdvisory([bandAt(50), bandAt(100)])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5e. THE OFF FIRE — present or absent, never set-or-zero
// ---------------------------------------------------------------------------

describe('restore_line is added and removed, not cleared to a number', () => {
  it('removing it DELETES the key rather than writing a null or a zero', () => {
    const p = swapPreset({ restore_line: 100 });
    const cmd = setBaseSwapRestoreLineCommand(lib(p), ID, 0, undefined)!;
    expect(cmd).not.toBeNull();
    expect('restore_line' in cmd.newPreset!.base_swap![0]).toBe(false);
    // ⚠ A null spelling would be REFUSED by the schema: the band object is
    // closed and admits no null. So "no restore" has exactly one spelling.
    expect(validateAgainstSchema(cmd.newPreset!, S)).toEqual([]);
    expect(() => serializeEffectsPreset(cmd.newPreset!)).not.toThrow();
    expect(serializeEffectsPreset(cmd.newPreset!)).not.toContain('restore_line');
  });

  it('adding one takes the same range as the ON line and refuses outside it', () => {
    const p = swapPreset();
    expect(RESTORE.min).toBe(LINE.min);
    expect(RESTORE.max).toBe(LINE.max);
    expect(baseSwapRestoreLineRefusal(p.base_swap!, ID, 0, RESTORE.max)).toBeNull();
    expect(baseSwapRestoreLineRefusal(p.base_swap!, ID, 0, RESTORE.max + 1)).toMatch(/outside/);
    expect(baseSwapRestoreLineRefusal(p.base_swap!, ID, 0, 12.5)).toMatch(/not a whole number/);
  });

  /**
   * ⚠ THE RANGE ALONE ACCEPTS A BAND THAT ENDS BEFORE IT BEGINS, which is why
   * the order rule is the thing that refuses it. `restore_line`'s range is
   * `line`'s range verbatim and the schema deliberately does not restate
   * `restore_line > line` — `fire_lines` refuses the inverted pair by name.
   */
  it('an inverted pair is refused by the ORDER rule, not by the range', () => {
    const p = swapPreset({ line: 100 });
    // In range, and still refused.
    expect(RESTORE.min).toBeLessThan(50);
    const why = baseSwapRestoreLineRefusal(p.base_swap!, ID, 0, 50)!;
    expect(why).not.toBeNull();
    expect(why).toMatch(/ends before it begins/);
    expect(why).toContain(EFFECTS_PRESET_BASE_SWAP_ORDER_AUTHORITY.symbol);
    expect(setBaseSwapRestoreLineCommand(lib(p), ID, 0, 50)).toBeNull();
    // And a restore ABOVE the line is accepted.
    expect(baseSwapRestoreLineRefusal(p.base_swap!, ID, 0, 150)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5f. ADD and REMOVE — the list floor, and the one place there is nowhere to go
// ---------------------------------------------------------------------------

describe('bands are added and removed with reasons, never silently', () => {
  it('a new band lands ABOVE the last fire, so the list stays sound', () => {
    const p = swapOf(bandAt(50, { restore_line: 100 }));
    const cmd = addBaseSwapBandCommand(lib(p), ID)!;
    expect(cmd).not.toBeNull();
    expect(cmd.newPreset!.base_swap!).toHaveLength(2);
    expect(cmd.newPreset!.base_swap![1].line).toBe(101);
    expect(baseSwapOrderRefusal(cmd.newPreset!.base_swap!)).toBeNull();
    expect(validateAgainstSchema(cmd.newPreset!, S)).toEqual([]);
  });

  it('when the last fire is on the final legal line, ADD is refused WITH A REASON', () => {
    const p = swapOf(bandAt(LINE.max));
    const why = addBaseSwapBandRefusal(p)!;
    expect(why).not.toBeNull();
    expect(why).toContain(String(LINE.max));
    expect(why).toContain(EFFECTS_PRESET_BASE_SWAP_ORDER_AUTHORITY.symbol);
    // The disabled button and its sentence read ONE predicate.
    expect(addBaseSwapBandCommand(lib(p), ID)).toBeNull();
    // Control: one line lower and there IS room.
    expect(addBaseSwapBandRefusal(swapOf(bandAt(LINE.max - 1)))).toBeNull();
    expect(addBaseSwapBandCommand(lib(swapOf(bandAt(LINE.max - 1))), ID)).not.toBeNull();
  });

  it('the LAST band cannot be removed — minItems, with the schema\'s own reason', () => {
    const one = swapOf(bandAt(50));
    const why = lastBaseSwapBandRefusal(one)!;
    expect(why).not.toBeNull();
    expect(why).toContain(String(EFFECTS_PRESET_BASE_SWAP_MIN_BANDS));
    expect(why).toMatch(/zero-fire raster program/);
    expect(removeBaseSwapBandCommand(lib(one), ID, 0)).toBeNull();
    // ANTI-VACUOUS: a zero-band list really is refused by the schema, so the
    // floor is the contract's and not a preference.
    expect(validateAgainstSchema({ schema: 1, id: ID, base_swap: [] }, S).length)
      .toBeGreaterThan(0);
  });

  it('with two bands, removing one works and the other survives intact', () => {
    const p = swapOf(bandAt(50), bandAt(100, { restore_line: 150 }));
    expect(lastBaseSwapBandRefusal(p)).toBeNull();
    const cmd = removeBaseSwapBandCommand(lib(p), ID, 0)!;
    expect(cmd.newPreset!.base_swap!).toHaveLength(1);
    expect(cmd.newPreset!.base_swap![0]).toEqual(p.base_swap![1]);
    // Out-of-range indices write nothing.
    expect(removeBaseSwapBandCommand(lib(p), ID, -1)).toBeNull();
    expect(removeBaseSwapBandCommand(lib(p), ID, 2)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. The conversion — destructive, and one Ctrl+Z, in BOTH directions
// ---------------------------------------------------------------------------

describe('switching into and out of base_swap is ONE undoable command', () => {
  /**
   * ═══ THE BAR, AND IT IS THE SAME BAR THE RAMP PARCEL SET ═══
   *
   * The conversion DISCARDS the other channel, and a destructive control that is
   * not one Ctrl+Z away was not to be built (decision cards d-29, d-30). The
   * guarantee is structural: `editPresetCommand` carries the WHOLE old document,
   * so undo re-places it verbatim.
   *
   * ⚠ EVERY PAIR IS ENUMERATED FROM THE SCHEMA'S ARM LIST, not typed out, so a
   * fifth arm cannot arrive and leave a direction silently untested.
   *
   * ⚠ AND IT WAS THE RASTER LIST UNTIL EW-BOUNDARY-PANEL, WHICH IS THE SHAPE
   * THIS ROW'S OWN COMMENT WARNED ABOUT. `boundary` did arrive, the enumeration
   * stayed green over the three raster channels, and both directions through the
   * fourth arm — the ones where a delete loop keyed to the wrong list authors the
   * two-arm document — were the untested ones. Twelve ordered pairs now, not six.
   */
  it('every arm converts to every other, discarding one and restoring it EXACTLY', () => {
    let pairs = 0;
    for (const from of EFFECTS_PRESET_PROGRAM_ARMS) {
      for (const to of EFFECTS_PRESET_PROGRAM_ARMS) {
        if (from === to) continue;
        pairs++;
        const p = documentOf(from);
        p.name = 'a name';
        p.cycles = null;
        const before = JSON.stringify(p);
        const cmd = setProgramArmCommand(lib(p), ID, to)!;
        expect(cmd, `${from} -> ${to} produced no command`).not.toBeNull();
        expect(cmd.type).toBe('set-effects-preset');
        // The forward step really converted, and to the channel that was asked
        // for — not to "the other one".
        expect(presetProgramArm(cmd.newPreset!)).toBe(to);
        expect(from in cmd.newPreset!, `${from} survived the switch to ${to}`).toBe(false);
        // Exactly one raster key at every instant — the both-keys document the
        // schema refuses is never authored, even transiently.
        expect(Object.keys(cmd.newPreset!)
          .filter((k) => EFFECTS_PRESET_PROGRAM_ARMS.includes(k))).toHaveLength(1);
        expect(() => serializeEffectsPreset(cmd.newPreset!)).not.toThrow();
        // The channels that are not the raster one are untouched.
        expect(cmd.newPreset!.name).toBe('a name');
        expect(cmd.newPreset!.cycles).toBeNull();
        // ⚠ THE UNDO SIDE, byte for byte against the document as it was.
        expect(JSON.stringify(cmd.oldPreset), `${from} -> ${to} undo`).toBe(before);
      }
    }
    // ANTI-VACUOUS: the enumeration really produced every ordered pair.
    const n = EFFECTS_PRESET_PROGRAM_ARMS.length;
    expect(pairs).toBe(n * (n - 1));
    expect(n).toBeGreaterThanOrEqual(4);
  });

  it('bands -> base_swap keeps every band for the undo, in order, with its colours', () => {
    const p = newPreset(ID, 'a name');
    p.bands!.push({ ...newBand(), top: 10, bot: 20 });
    p.bands!.push({ ...newBand(), top: 30, bot: 40, on: { cram: { addr: 34, colours: [1, 2, 3] } } });
    const before = JSON.stringify(p);
    const cmd = setProgramArmCommand(lib(p), ID, 'base_swap')!;
    expect(cmd.newPreset!.base_swap).toEqual(newBaseSwap());
    expect('bands' in cmd.newPreset!).toBe(false);
    expect(JSON.stringify(cmd.oldPreset)).toBe(before);
    expect(cmd.oldPreset!.bands).toHaveLength(3);
    expect(cmd.oldPreset!.bands![2].on).toEqual({ cram: { addr: 34, colours: [1, 2, 3] } });
  });

  it('re-selecting the arm a document already has burns no undo slot', () => {
    for (const c of EFFECTS_PRESET_PROGRAM_ARMS) {
      expect(setProgramArmCommand(lib(documentOf(c)), ID, c), c).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. ⚠ NOTHING COUNTS THE CHANNELS — the fourth arm's rows
// ---------------------------------------------------------------------------

describe('every per-channel surface is a registry, not a branch', () => {
  /**
   * THE DEFECT CLASS, RESTATED: on 2026-09-03 a third channel arrived and three
   * separate two-way constructs went wrong at once — a label ternary, a
   * delete-one-sibling if/else, and a `!== 'ramp'` refusal. All three were
   * invisible while there were two. These rows are driven by
   * `EFFECTS_PRESET_RASTER_CHANNELS`, so they measure whatever the contract
   * declares rather than the three that happen to exist.
   */
  it('every declared ARM has a label, a seed and an editor', () => {
    // ⚠ RE-AIMED FROM `EFFECTS_PRESET_RASTER_CHANNELS` TO THE ARMS BY
    // EW-BOUNDARY-PANEL, and the widening is the point rather than a fix for a
    // broken row. Driven by the raster list, this row was green on a panel that
    // could not author `boundary` at all — it asked "does every arm that writes
    // ep_raster have a card", which is a narrower question than "does every arm
    // the dropdown OFFERS have one". The dropdown is derived from the arms, so
    // the arms are what it has to cover.
    for (const c of EFFECTS_PRESET_PROGRAM_ARMS) {
      const option = PROGRAM_ARM_OPTIONS.find((o) => o.value === c);
      expect(option, `channel "${c}" is missing from the dropdown`).toBeDefined();
      expect(option!.label).not.toBe('');
      // The seam this parcel filled: no option says "not authorable here yet".
      expect(option!.label, `"${c}" is still unauthorable`).not.toMatch(/not authorable/);
      expect(programArmSeedRefusal(c), `"${c}" has no seed`).toBeNull();
      expect(programArmEditorGapFor(c, ID), `"${c}" has no editor`).toBeNull();
    }
    expect(PROGRAM_ARM_OPTIONS).toHaveLength(EFFECTS_PRESET_PROGRAM_ARMS.length);
    // ...and the raster set is a STRICT SUBSET of what the row offers, which is
    // the fact the old spelling of this row could not see: a document can carry
    // a program that is not a raster program at all.
    expect(EFFECTS_PRESET_PROGRAM_ARMS.length).toBeGreaterThan(
      EFFECTS_PRESET_RASTER_CHANNELS.length,
    );
  });

  /**
   * ⚠ THE SEED WRITES ITS OWN KEY. The `else` in the old if/else meant "the only
   * other channel", so the first switch into a third one would have seeded
   * BANDS while the dropdown said base swap. Measured per channel, through the
   * command an author actually drives.
   */
  it('a switch to channel X authors X and no other', () => {
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      const doc = documentOf(c);
      expect(presetRasterChannel(doc), `seeding "${c}" authored the wrong channel`).toBe(c);
      expect(Object.keys(doc).filter((k) => EFFECTS_PRESET_RASTER_CHANNELS.includes(k)))
        .toHaveLength(1);
    }
  });

  /**
   * ⚠ THE ADVISORY PROMISES ONLY WHAT IT KNOWS. It is painted BEFORE the
   * gesture, so it cannot know which channel the author will pick — and it used
   * to name one anyway ("seeds a fresh ramp"), which was true only while there
   * were exactly two. It must name what is DISCARDED (which is decided) and
   * never what it becomes.
   */
  it('names what it discards and promises no particular destination', () => {
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      const advisory = programArmSwapAdvisory(documentOf(c));
      expect(advisory).toMatch(/DISCARDS/);
      expect(advisory).toMatch(/ONE undo step/);
      for (const other of EFFECTS_PRESET_RASTER_CHANNELS) {
        if (other === c) continue;
        expect(advisory, `the advisory on a ${c} document promises a fresh ${other}`)
          .not.toMatch(new RegExp(`fresh [^.]*${other.replace('_', '[ _]')}`, 'i'));
      }
    }
    // It still names the discarded body, which is the whole point of it.
    const bands = newPreset(ID);
    bands.bands!.push(newBand());
    expect(programArmSwapAdvisory(bands)).toContain('2 raster bands');
    expect(programArmSwapAdvisory(documentOf('base_swap'))).toContain('this base swap');
  });

  /** No list row reads `0 bands` for a document that has no `bands` key. */
  it('the preset list names every non-bands channel', () => {
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      const entry = presetListEntries(lib(documentOf(c)))[0];
      expect(entry.channel).toBe(c);
      const summary = presetListSummary(entry);
      expect(summary).not.toBe('');
      if (c !== 'bands') expect(summary, `"${c}" reads as a band count`).not.toMatch(/bands?$/);
    }
    expect(presetListSummary(presetListEntries(lib(documentOf('base_swap')))[0])).toBe('base swap');
    expect(presetListSummary(presetListEntries(lib(newPreset(ID)))[0])).toBe('1 band');
  });

  /** The band controls stay dead — and say why — on every non-bands channel. */
  it('the band controls are refused WITH A REASON on every channel that is not bands', () => {
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      const why = bandControlsRefusal(documentOf(c));
      if (c === 'bands') { expect(why).toBeNull(); continue; }
      expect(why, `the band controls came back to life on a ${c} document`).not.toBeNull();
      expect(why).not.toContain('undefined');
      expect(why).toMatch(/EXACTLY ONE program/)  // ⚠ 'raster program' until empyrean c4a1da2: the
      // fourth arm, `boundary`, is a PATCHED program and the rule covers it too, so
      // the sentence dropped a word it could no longer justify.;
    }
  });

  /**
   * ⚠ THE FOURTH ARM'S LANDING PAD, MEASURED AGAINST A CHANNEL THAT DOES NOT
   * EXIST. Every declared channel has a card today, so a row that could only
   * pass a real document through `programArmEditorGap` would assert nothing until
   * the defect had already shipped.
   */
  it('a channel with no card on this panel gets a sentence, not an empty section', () => {
    const future = 'future_arm';
    expect(EFFECTS_PRESET_RASTER_CHANNELS).not.toContain(future);
    const gap = programArmEditorGapFor(future, ID)!;
    expect(gap).not.toBeNull();
    expect(gap).toContain(ID);
    expect(gap).toContain(future);
    expect(gap).toMatch(/no editor for it yet/);
    // It says the document is SAFE — nothing here changed it — and warns that
    // the one control that IS live would discard it.
    expect(gap).toMatch(/opens, reads and saves correctly/);
    expect(gap).toMatch(/DISCARD/);
    // ...and it is silent for every document that can exist today.
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) expect(programArmEditorGap(documentOf(c))).toBeNull();
    expect(programArmEditorGap({ schema: 1, id: ID })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. The two asymmetries with `ramp` — stated, not left to analogy
// ---------------------------------------------------------------------------

describe('the two asymmetries with ramp reach the author', () => {
  /**
   * ⚠ A READER ARRIVING FROM `ramp` CARRIES BOTH ACROSS AND BOTH ARE WRONG:
   * `base_swap` has NO capability gate (OP_SET_REG dispatches unconditionally in
   * every game — there is no CAP_DENSE_TIER analogue) and its generated emission
   * is NOT DEBUG-gated (it is unconditional `pub` data in the release ROM).
   *
   * An assumed capability gate is exactly what a control parcel silently builds
   * a disabled button around, which is why this is asserted on the CONTRACT's
   * own words rather than on a comment.
   */
  it('both are parsed out of the schema and both say what they mean', () => {
    expect(BASE_SWAP_ASYMMETRIES).toContain('CAP_DENSE_TIER');
    expect(BASE_SWAP_ASYMMETRIES).toMatch(/NO capability bit gates it/);
    expect(BASE_SWAP_ASYMMETRIES).toMatch(/NOT DEBUG-gated/);
    // Really parsed, not retyped: the sentence is a substring of the schema's
    // own description of the key.
    expect(BASE_SWAP_TITLE).toContain(BASE_SWAP_ASYMMETRIES);
    // ANTI-VACUOUS: the ramp's own description does NOT carry this sentence, so
    // the row is about base_swap's contract and not about any preset key.
    expect(RAMP_TITLE).not.toContain(BASE_SWAP_ASYMMETRIES);
  });

  it('the painted half is shorter, different, and makes the same claim', () => {
    expect(BASE_SWAP_ASYMMETRIES_SHORT).not.toBe(BASE_SWAP_ASYMMETRIES);
    expect(BASE_SWAP_ASYMMETRIES.length).toBeGreaterThan(BASE_SWAP_ASYMMETRIES_SHORT.length);
    expect(BASE_SWAP_ASYMMETRIES_SHORT).toMatch(/[Nn]o capability gate/);
    expect(BASE_SWAP_ASYMMETRIES_SHORT).toMatch(/DEBUG-gated/);
    expect(BASE_SWAP_ASYMMETRIES_SHORT).toMatch(/release ROM/);
  });

  /**
   * WHAT AN AUTHOR SEES is QUOTED, not claimed. Aurora draws no raster program
   * (`NO_PREVIEW`), so a sentence about what the swap looks like is a claim this
   * editor has no evidence for — it belongs to whoever measured it, and the
   * schema carries their words.
   */
  it('what an author sees is the contract\'s sentence, not the editor\'s', () => {
    expect(BASE_SWAP_TITLE).toContain(BASE_SWAP_WHAT_YOU_SEE);
    expect(BASE_SWAP_WHAT_YOU_SEE).toMatch(/self-restoring/);
    expect(BASE_SWAP_WHAT_YOU_SEE).toMatch(/down/);
  });
});
