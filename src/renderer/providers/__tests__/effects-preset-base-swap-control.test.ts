// The `base_swap` AUTHORING SURFACE — its two numbers, the granule that fails
// loudly nowhere, and the three-channel arithmetic that must not be counted.
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
//      and the contract's own name for the one address the contract names —
//      and NO name for any other, ever.
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
  EFFECTS_PRESET_BASE_SWAP_LINE_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
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
} from '../../../core/formats/effects/preset';
import {
  newBaseSwap, newPreset, newBand, newRamp,
  BASE_SWAP_TITLE, BASE_SWAP_FIELD_TITLES,
  BASE_SWAP_ASYMMETRIES, BASE_SWAP_ASYMMETRIES_SHORT, BASE_SWAP_WHAT_YOU_SEE,
  BASE_SWAP_NAMED_TARGETS, fmtVramBase, fmtVramBaseBoth,
  baseSwapTargetGloss, baseSwapSummary,
  baseSwapLineRefusal, baseSwapTargetRefusal, baseSwapTargetNeighbours,
  setBaseSwapLineCommand, setBaseSwapTargetCommand,
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

function swapPreset(over: Partial<EffectsPresetBaseSwap> = {}): EffectsPreset {
  return { schema: 1, id: ID, base_swap: { ...newBaseSwap(), ...over } };
}
function lib(...presets: EffectsPreset[]): EffectsPresetLibrary {
  return { presets, unreadable: [], notices: [] };
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
  it('writes both keys and no third — the object is CLOSED', () => {
    expect([...EFFECTS_PRESET_BASE_SWAP_KEYS].sort()).toEqual(['line', 'target']);
    expect(Object.keys(newBaseSwap()).sort()).toEqual([...EFFECTS_PRESET_BASE_SWAP_KEYS].sort());
  });

  /**
   * ⚠ A SEED MUST NOT BE BORN ILLEGAL — `newBand`'s rule. A fresh document that
   * trips a rule the author had no hand in teaches them the editor is broken.
   * Both halves are checked against the CONSTANTS, not against the numbers the
   * seed happens to hold.
   */
  it('is inside the line range and ON the granule', () => {
    const seed = newBaseSwap();
    expect(baseSwapLineRefusal(seed, ID, seed.line)).toBeNull();
    expect(baseSwapTargetRefusal(seed, ID, seed.target)).toBeNull();
    expect(isBaseSwapTargetAligned(seed.target)).toBe(true);
    expect(seed.line).toBeGreaterThanOrEqual(LINE.min);
    expect(seed.line).toBeLessThanOrEqual(LINE.max);
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
      { base_swap: { line: number } };
    // Anti-vacuous: the fixture really is aeon's section-6 base-swap document.
    expect(Number.isInteger(shipped.base_swap.line)).toBe(true);
    expect(
      newBaseSwap().line,
      "a fresh base_swap is not seeded with the line aeon's section-6 preset actually binds. If "
      + 'the schema sentence names two lines, this derivation is reading the SUPERSEDED clause — '
      + 'the historical value, which is legal, in range and refused by nothing, so every other '
      + 'row in this file stays green while new documents are born stale.',
    ).toBe(shipped.base_swap.line);
    // ...and the schema really does name a DIFFERENT, superseded line beside it,
    // so this row is guarding against a live hazard rather than a hypothetical.
    const was = /preset fired on (\d+) as bound at aeon [0-9a-f]{6,}/
      .exec(BASE_SWAP_FIELD_TITLES.line);
    expect(was, "the schema no longer names a superseded section-6 line — if it has gone back to "
      + 'stating one number, this row still holds but its hazard is gone; see BASE_SWAP_SEED_LINE')
      .toBeTruthy();
    expect(Number(was![1])).not.toBe(newBaseSwap().line);
  });

  /**
   * AND IT IS THE ONE ADDRESS THE PANEL CAN EXPLAIN. A seed whose target this
   * editor could not name would be a first state with no sentence about it —
   * `newRamp`'s "a control whose first state does nothing teaches the author it
   * does nothing", one step further: a control whose first state cannot be
   * described teaches nothing at all.
   */
  it('seeds the address the contract NAMES, so the card can say what it does', () => {
    expect(BASE_SWAP_NAMED_TARGETS.has(newBaseSwap().target)).toBe(true);
    expect(baseSwapSummary(newBaseSwap())).toContain(BASE_SWAP_NAMED_TARGETS.get(newBaseSwap().target)!);
  });

  it('the seeded document survives the codec\'s own round trip', () => {
    const text = serializeEffectsPreset(swapPreset());
    expect(parseEffectsPreset(text, ID)).toEqual(swapPreset());
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
    const named = [...BASE_SWAP_NAMED_TARGETS.keys()][0];
    expect(fmtVramBaseBoth(named)).toBe(`${fmtVramBase(named)} (${named})`);
    expect(parseInt(fmtVramBase(named).slice(1), 16)).toBe(named);
  });

  /**
   * ⚠ THE NAME IS THE SCHEMA'S AND THERE IS EXACTLY ONE. `rampAddrGloss`'s rule:
   * the contract establishes what it establishes, and a per-address gloss Aurora
   * made up would tell an author they are pointing Plane A at a plane they are
   * not — worse than no name at all.
   */
  it('names the address the contract names, and NO OTHER', () => {
    expect(BASE_SWAP_NAMED_TARGETS.size).toBe(1);
    const [addr, name] = [...BASE_SWAP_NAMED_TARGETS][0];
    // The name really came out of the schema's own prose.
    expect(BASE_SWAP_FIELD_TITLES.target).toContain(name);
    expect(BASE_SWAP_FIELD_TITLES.target).toContain(String(addr));
    expect(baseSwapTargetGloss(addr)).toContain(name);
    expect(baseSwapTargetGloss(addr)).toContain(fmtVramBase(addr));

    // Every OTHER legal base: admitted, on the granule, and unnamed.
    for (let a = TARGET.min; a <= TARGET.max; a += G) {
      if (a === addr) continue;
      const gloss = baseSwapTargetGloss(a);
      expect(gloss, `gloss for ${a}`).toContain(fmtVramBase(a));
      expect(gloss, `gloss for ${a}`).toContain('on the granule');
      // It may CITE the named address as the only one the contract names; it
      // must never present this one as being it.
      expect(gloss.startsWith(`${fmtVramBase(a)} — ${name}`), `gloss for ${a} claims the name`)
        .toBe(false);
    }
  });

  it('an off-granule address says THAT first, because nothing else about it matters', () => {
    const gloss = baseSwapTargetGloss(G + 1);
    expect(gloss).toContain(fmtVramBase(G + 1));
    expect(gloss).toMatch(/NOT on the/);
    expect(gloss).not.toContain('on the granule;');
  });

  /**
   * The summary is the arithmetic an author would do in their head. It states
   * BOTH bases, so the sentence cannot be read as a count, and it names the
   * target only when the contract does.
   */
  it('the summary states the line, both bases, and the name only when there is one', () => {
    const named = [...BASE_SWAP_NAMED_TARGETS.keys()][0];
    const s = baseSwapSummary({ line: LINE.min, target: named });
    expect(s).toContain(`line ${LINE.min}`);
    expect(s).toContain(fmtVramBase(named));
    expect(s).toContain(String(named));
    expect(s).toContain(BASE_SWAP_NAMED_TARGETS.get(named)!);

    const unnamed = named === TARGET.min ? TARGET.min + G : TARGET.min;
    const u = baseSwapSummary({ line: 100, target: unnamed });
    expect(u).toContain(fmtVramBaseBoth(unnamed));
    expect(u).not.toContain(BASE_SWAP_NAMED_TARGETS.get(named)!);
  });
});

// ---------------------------------------------------------------------------
// 3. The line — and the range that is NOT the ramp's
// ---------------------------------------------------------------------------

describe('the fire line is refused at the control', () => {
  it('takes every line in the declared range and refuses both neighbours of it', () => {
    const bs = newBaseSwap();
    expect(baseSwapLineRefusal(bs, ID, LINE.min)).toBeNull();
    expect(baseSwapLineRefusal(bs, ID, LINE.max)).toBeNull();
    expect(baseSwapLineRefusal(bs, ID, LINE.min - 1)).not.toBeNull();
    expect(baseSwapLineRefusal(bs, ID, LINE.max + 1)).not.toBeNull();
    expect(baseSwapLineRefusal(bs, ID, 12.5)).toMatch(/not a whole number/);
    // ...and it says what the document still holds — `bandEdgeRefusal`'s rule.
    expect(baseSwapLineRefusal(bs, ID, LINE.max + 1)).toContain(`line is still ${bs.line}`);
  });

  /**
   * ⚠ THE ASYMMETRY IS STATED, NOT LEFT TO THE READER. `line` reaches 223 and a
   * ramp's `top` stops at 222 — a run needs a line after it and a single fire
   * does not. The row asserts the INEQUALITY from both constants first, so the
   * sentence is not asserted against numbers that might have converged.
   */
  it('the refusal names the ramp\'s different maximum, from both constants', () => {
    expect(LINE.max).not.toBe(EFFECTS_PRESET_RAMP_TOP_RANGE.max);
    const why = baseSwapLineRefusal(newBaseSwap(), ID, LINE.max + 1)!;
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
      const ok = baseSwapTargetRefusal(bs, ID, v) === null;
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
    for (const v of legal) expect(baseSwapTargetRefusal(newBaseSwap(), ID, v)).toBeNull();
    expect(baseSwapTargetRefusal(newBaseSwap(), ID, TARGET.max + 1)).not.toBeNull();
    expect(baseSwapTargetRefusal(newBaseSwap(), ID, TARGET.min - 1)).not.toBeNull();
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
    const off = bs.target - 1;
    const why = baseSwapTargetRefusal(bs, ID, off)!;
    expect(why).not.toBeNull();
    expect(why).toMatch(/^preset "probe" base_swap target:/);
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
    expect(why).toContain(`target is still ${fmtVramBaseBoth(bs.target)}`);
  });

  it('a non-integer and an out-of-range address each get their own sentence', () => {
    const bs = newBaseSwap();
    expect(baseSwapTargetRefusal(bs, ID, G + 0.5)).toMatch(/not a whole number/);
    expect(baseSwapTargetRefusal(bs, ID, TARGET.max + G)).toMatch(/outside/);
    // Each still hands over what IS available.
    expect(baseSwapTargetRefusal(bs, ID, G + 0.5)).toContain(fmtVramBaseBoth(G));
    expect(baseSwapTargetRefusal(bs, ID, TARGET.max + G)).toContain('nothing higher');
  });
});

// ---------------------------------------------------------------------------
// 5. The commands — the document moves only when the refusal is silent
// ---------------------------------------------------------------------------

describe('the commands withhold exactly what the refusals refuse', () => {
  it('a refused line and a refused target write NOTHING', () => {
    const p = swapPreset();
    const before = JSON.stringify(p);
    expect(setBaseSwapLineCommand(lib(p), ID, LINE.max + 1)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(p), ID, p.base_swap!.target - 1)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(p), ID, TARGET.max + G)).toBeNull();
    // ⚠ AND NOTHING SNAPPED: the document is byte-identical, not rounded to the
    // nearest granule. Snapping would point Plane A at a different picture.
    expect(JSON.stringify(p)).toBe(before);
  });

  it('a legal line and a legal target DO move the document, and carry the old one', () => {
    const p = swapPreset();
    const before = JSON.stringify(p);
    const line = setBaseSwapLineCommand(lib(p), ID, LINE.max)!;
    expect(line).not.toBeNull();
    expect(line.newPreset!.base_swap!.line).toBe(LINE.max);
    expect(line.newPreset!.base_swap!.target).toBe(p.base_swap!.target);
    expect(JSON.stringify(line.oldPreset)).toBe(before);

    const other = TARGET.min === p.base_swap!.target ? TARGET.min + G : TARGET.min;
    const target = setBaseSwapTargetCommand(lib(p), ID, other)!;
    expect(target.newPreset!.base_swap!.target).toBe(other);
    expect(JSON.stringify(target.oldPreset)).toBe(before);
  });

  it('re-typing the value a field already holds burns no undo slot', () => {
    const p = swapPreset();
    expect(setBaseSwapLineCommand(lib(p), ID, p.base_swap!.line)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(p), ID, p.base_swap!.target)).toBeNull();
  });

  it('neither command touches a document that carries a different channel', () => {
    const ramp = { schema: 1 as const, id: ID, ramp: newRamp() };
    expect(setBaseSwapLineCommand(lib(ramp), ID, LINE.max)).toBeNull();
    expect(setBaseSwapTargetCommand(lib(ramp), ID, TARGET.min)).toBeNull();
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
