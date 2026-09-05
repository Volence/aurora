// WHICH SECTIONS CAN CARRY A RASTER BAND — the derivation, against aeon's own files.
//
// ═══ WHY THIS FILE READS A REAL CHECKOUT AND NOT ONLY FIXTURES ═══
//
// The question this derivation answers was answered wrong three times on
// 2026-09-02, and EVERY wrong answer was produced by an instrument that was
// never run against the real text: one came from prose in Aurora's own panel,
// one from a parse that windowed to 800 characters after each `sec: N` and so
// missed section 0's `effects:` at offset 964. A WINDOW THAT FINDS NOTHING AND
// A FIELD THAT DOES NOT EXIST PRINT THE SAME THING.
//
// So the rows below run the parser over aeon's ACTUAL `act_descriptor.emp` and
// `ojz_effects.emp` when a checkout is reachable, and are SKIPPED WITH A REASON
// when it is not — never quietly passed on fixtures alone. The fixtures are
// here too, for the shapes the real tree cannot produce.
//
// ⚠ WHAT THE NUMBERS BELOW ARE. `[0,1,2,3,4,5]` and `{OJZ_Preset_Sec5: 5}` are
// NOT the contract and are not a list this repository holds — they are what the
// parse returns TODAY, asserted here so a changed world is distinguishable from
// a broken parser. When aeon splits `OJZ_Preset_Plain`, these rows go red and
// the correct response is to read the new numbers off the file and update them,
// not to touch the derivation. The PRODUCT never sees a literal: it renders
// whatever the parse returned on this load.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  descriptorEffectsBindings, libraryRasterChooserCalls, rasterChooserName, wiringPaths,
  unknownWiring, sectionRasterState, sectionRasterAdvisory, sectionSharers,
  wiredSections, eligibleSections, sectionWiringConditions, threadedSections,
  ownPresetSections, sectionConditionsAgreeWithState, libraryChannelCalls,
  libraryChannelChooserCalls, channelChooserName, sectionExtraChannelsCondition,
  extraChannelsAdvisory, EXTRA_SECTION_CHANNELS, type SectionRasterWiring,
} from '../section-wiring';
import { siblingPathOrUnresolved } from '../../../../../test/support/sibling-root.mjs';

const AEON = siblingPathOrUnresolved('aeon');
const DESC = join(AEON, 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp');
const LIB = join(AEON, 'games/sonic4/data/effects/ojz_effects.emp');
const haveTree = existsSync(DESC) && existsSync(LIB);

// ---------------------------------------------------------------------------
// Synthetic fixtures — the shapes the real tree cannot produce
// ---------------------------------------------------------------------------

/** A descriptor with three sections: two own presets, one binds nothing. */
const SYNTHETIC_DESC = `
comptime fn zzz_sec(sec: int, effects: Label = 0) -> Sec { }
pub const ZZZ_Act1: Act = act(sections: [
    zzz_sec(sec: 0, blocks: A,
            // a long comment, deliberately more than 800 characters after the
            // sec: 0 marker, so a parser that windows the way aeon's first
            // attempt did reports "binds nothing" for this section. ${'x'.repeat(900)}
            effects: ZZZ_Preset_Sec0),
    zzz_sec(sec: 1, blocks: B, effects: ZZZ_Preset_Shared),
    zzz_sec(sec: 2, blocks: C, effects: ZZZ_Preset_Shared),
    zzz_sec(sec: 3, blocks: D),
])`;

/**
 * ⚠ `ZZZ_Preset_Sec0` THREADS THREE OF THE SIX CHOOSERS AND NOT THE OTHERS, on
 * purpose. It is the shape a real record has (`OJZ_Preset_Sec5` threads
 * `raster`, both patch arrays and NOT `cycle`) and it is what makes condition 3
 * non-vacuous: the cycle chooser is threaded, `variants` is threaded at slot 0
 * only, and neither patch chooser is threaded at all — so one fixture covers
 * "satisfied", "partially threaded" and "threaded nowhere" without a second.
 */
const SYNTHETIC_LIB = `
pub data ZZZ_Preset_Sec0: EffectsPreset = preset(pal: P,
    raster: zzz_act1_sec_raster(sec: 0, hand: Raster_Program_None),
    cycle: zzz_act1_sec_cycle(sec: 0, hand: Pal_Cycle_None),
    variants: [ zzz_act1_sec_variant(sec: 0, slot: 0, hand: Variant_X), 0 ])
pub data ZZZ_Preset_Shared: EffectsPreset = preset(pal: P, raster: Raster_Program_None)
`;

function synthetic(): SectionRasterWiring {
  return {
    bindings: descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz'),
    threadedBy: libraryRasterChooserCalls(SYNTHETIC_LIB, rasterChooserName('zzz', 'act1')),
    channelThreadedBy: libraryChannelCalls(SYNTHETIC_LIB, 'zzz', 'act1'),
    descriptor: { path: '(synthetic)', parsed: true },
    library: { path: '(synthetic)', parsed: true },
  };
}

describe('the parse has no window: the defect that produced a wrong answer', () => {
  it('finds an `effects:` field 900+ characters after its `sec: N` marker', () => {
    // THE REGRESSION ROW FOR AEON'S OWN MISTAKE. Their ad-hoc parse windowed to
    // the first 800 characters after each `sec: N`; section 0's field sits at
    // offset 964, so it printed a confident "(none)". This fixture reproduces
    // that geometry exactly, and a windowed parser fails it.
    const b = descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz');
    expect(b[0]).toBe('ZZZ_Preset_Sec0');
  });

  it('a section that binds nothing is ABSENT, not mapped to a name', () => {
    const b = descriptorEffectsBindings(SYNTHETIC_DESC, 'zzz');
    expect(b[3]).toBeUndefined();
    expect(Object.keys(b).map(Number).sort((x, y) => x - y)).toEqual([0, 1, 2]);
  });

  it('the zone key stops the chooser call being read as a section record', () => {
    // `zzz_act1_sec_raster(sec: 5)` also matches `..._sec\(\s*sec:` if the zone
    // is not part of the pattern. It must not become a binding.
    const b = descriptorEffectsBindings(
      `${SYNTHETIC_DESC}\nraster: zzz_act1_sec_raster(sec: 7, hand: X) effects: Ghost`, 'zzz');
    expect(b[7]).toBeUndefined();
  });
});

describe('the four author-facing states', () => {
  const w = synthetic();

  it('own preset AND threaded → wired, and says nothing', () => {
    expect(sectionRasterState(w, 0)).toBe('wired');
    expect(sectionRasterAdvisory(w, 0, 'zzz_act1_sec_raster')).toBeNull();
  });

  it('a SHARED preset names the sharers and what would happen', () => {
    expect(sectionRasterState(w, 1)).toBe('shared');
    expect(sectionSharers(w, 1)).toEqual([1, 2]);
    const say = sectionRasterAdvisory(w, 1, 'zzz_act1_sec_raster')!;
    // A FACT ABOUT THE LEVEL, not a prohibition by Aurora — the distinction the
    // whole module is shaped around.
    expect(say).toMatch(/Sections 1 and 2 all share the preset record ZZZ_Preset_Shared/);
    expect(say).toMatch(/would give section 2 the same band/);
    expect(say).toMatch(/split/);
    expect(say).not.toMatch(/Aurora|you cannot|not allowed/i);
  });

  it('own preset but NOT threaded → one aeon line, and the message says so', () => {
    const w2 = { ...w, threadedBy: {} };
    expect(sectionRasterState(w2, 0)).toBe('unthreaded');
    const say = sectionRasterAdvisory(w2, 0, 'zzz_act1_sec_raster')!;
    expect(say).toMatch(/nothing threads the raster chooser into it yet/);
    expect(say).toMatch(/no preset threads zzz_act1_sec_raster\(sec: 0\)/);
    expect(say).toMatch(/one line in aeon/);
  });

  /**
   * ⚠ THIS CASE IS SYNTHETIC BECAUSE THE REAL SET IS EMPTY, and that is said
   * out loud rather than hidden. Every section 0-8 of ojz/act1 binds a preset
   * today, so the `unbound` branch is UNREACHABLE in the shipping act. It is
   * kept because it goes live the moment anyone adds a section — and it is
   * exercised on this fixture rather than pointed at section 0, which binds
   * `OJZ_Preset_Sec0` and is fully authorable. A row asserting it fires on
   * section 0 would be asserting today's wrong answer.
   */
  it('a section binding no preset at all is named as such (SYNTHETIC: no real one exists)', () => {
    expect(sectionRasterState(w, 3)).toBe('unbound');
    expect(sectionRasterAdvisory(w, 3, 'zzz_act1_sec_raster'))
      .toMatch(/binds no preset record in the act descriptor/);
  });

  it('an UNREADABLE file is "could not read", never "not allowed"', () => {
    // The standing refusal's hardest clause: a control greyed out because a
    // file was missing is indistinguishable, to the author, from one greyed out
    // because the thing is impossible.
    const u = unknownWiring('a/desc.emp', 'a/lib.emp', 'ENOENT');
    expect(sectionRasterState(u, 0)).toBe('unknown');
    const say = sectionRasterAdvisory(u, 0, 'fn')!;
    expect(say).toMatch(/could not read a\/desc\.emp/);
    expect(say).toMatch(/ENOENT/);
    expect(say).toMatch(/The binding is still written/);
    // NOT a refusal by Aurora. "Aurora cannot SAY" is honest and stays; what
    // must never appear is a sentence telling the author they may not bind.
    expect(say).not.toMatch(/you cannot|not allowed|is refused|may not/i);
  });

  it('the two derived sets, from the same wiring', () => {
    expect(wiredSections(w, 4)).toEqual([0]);
    expect(eligibleSections(w, 4)).toEqual([0]);
    expect(eligibleSections({ ...w, threadedBy: {} }, 4)).toEqual([0]);
    expect(wiredSections({ ...w, threadedBy: {} }, 4)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE TWO CONDITIONS, STATED APART (EW-SHAPE-STRIP)
// ---------------------------------------------------------------------------
//
// The strip prints two rows where the panel used to print one word. These rows
// are about the SPLIT, not about the underlying parse — that is covered above —
// and the one they exist for is the last one: `unknown` must never fold into
// `no`, on either condition, independently.

describe('the two wiring conditions, stated apart', () => {
  const w = synthetic();
  const CH = rasterChooserName('zzz', 'act1');

  it('both hold → two ✓, and the detail names the record and the call', () => {
    const c = sectionWiringConditions(w, 0, CH);
    expect(c.ownPreset.verdict).toBe('yes');
    expect(c.ownPreset.record).toBe('ZZZ_Preset_Sec0');
    expect(c.threaded.verdict).toBe('yes');
    expect(c.threaded.detail).toContain('zzz_act1_sec_raster(sec: 0)');
  });

  it('condition 1 fails and condition 2 IS STILL ASKED: no short-circuit', () => {
    // Section 1 shares its record with 2, and nothing threads sec 1. An author
    // whose strip stopped at the first failure could not tell whether fixing
    // the share would be enough.
    const c = sectionWiringConditions(w, 1, CH);
    expect(c.ownPreset.verdict).toBe('no');
    expect(c.ownPreset.detail).toContain('shared with section 2');
    expect(c.threaded.verdict).toBe('no');
    expect(c.threaded.detail).toBe('nothing threads zzz_act1_sec_raster(sec: 1)');
  });

  it('a section binding nothing fails condition 1 with its own reason', () => {
    const c = sectionWiringConditions(w, 3, CH);
    expect(c.ownPreset.verdict).toBe('no');
    expect(c.ownPreset.record).toBeNull();
    expect(c.ownPreset.detail).toBe('binds no preset record');
  });

  it('the THIRD fact (threaded by a record the section does not bind) is in the detail', () => {
    // SYNTHETIC, and unreachable in ojz/act1 today. A preset that threads sec 2
    // while section 2 binds a different record satisfies condition 2 as aeon's
    // gate words it ("no preset threads …") and still would not reach the
    // screen, so the verdict stays `yes` and the discrepancy is NAMED.
    const w2: SectionRasterWiring = { ...w, threadedBy: { ...w.threadedBy, ZZZ_Preset_Other: 2 } };
    const c = sectionWiringConditions(w2, 2, CH);
    expect(c.threaded.verdict).toBe('yes');
    expect(c.threaded.detail).toContain('but section 2 binds ZZZ_Preset_Shared');
    // …and the collapsed word still refuses it, which is the seam below.
    expect(sectionRasterState(w2, 2)).not.toBe('wired');
  });

  it('an unreadable file is `unknown` PER CONDITION, and never `no`', () => {
    const noDesc = unknownWiring('a/act_descriptor.emp', 'b/zzz_effects.emp', 'ENOENT');
    const c1 = sectionWiringConditions(noDesc, 0, CH);
    expect(c1.ownPreset.verdict).toBe('unknown');
    expect(c1.ownPreset.detail).toBe('could not read act_descriptor.emp');
    expect(c1.threaded.verdict).toBe('unknown');

    // ONE file readable, the other not: the readable condition still answers.
    const halfRead: SectionRasterWiring = {
      ...w, library: { path: 'b/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    const c2 = sectionWiringConditions(halfRead, 0, CH);
    expect(c2.ownPreset.verdict).toBe('yes');
    expect(c2.threaded.verdict).toBe('unknown');
    expect(c2.threaded.detail).toBe('could not read zzz_effects.emp');
  });

  it('THE SEAM: `wired` means both conditions on the SAME record, for every section', () => {
    // Two derivations of one fact that nothing compares is how they come apart.
    for (let i = 0; i < 4; i++) expect(sectionConditionsAgreeWithState(w, i, CH)).toBe(true);
    const w2: SectionRasterWiring = { ...w, threadedBy: { ...w.threadedBy, ZZZ_Preset_Other: 2 } };
    for (let i = 0; i < 4; i++) expect(sectionConditionsAgreeWithState(w2, i, CH)).toBe(true);
    const noLib: SectionRasterWiring = {
      ...w, library: { path: 'b', parsed: false, reason: 'ENOENT' },
    };
    for (let i = 0; i < 4; i++) expect(sectionConditionsAgreeWithState(noLib, i, CH)).toBe(true);
  });

  it('the ACT-WIDE own-preset set cannot contradict the per-section condition row', () => {
    // THE DEFECT THIS PINS, caught by the strip harness's own output: with the
    // descriptor read and the LIBRARY missing, `eligibleSections` answers `[]`
    // — it goes through `sectionRasterState`, which is `unknown` for every
    // section when either file is unreadable — so the strip printed
    // `✓ own preset ZZZ_Preset_Sec0` on the condition row and `own preset none`
    // on the act line, in the same box, at the same time.
    const noLib: SectionRasterWiring = {
      ...w, library: { path: 'b/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    expect(eligibleSections(noLib, 4)).toEqual([]);          // the trap
    expect(ownPresetSections(noLib, 4, CH)).toEqual([0]);     // the fix
    // And the invariant, over both worlds: the act-wide set is exactly the
    // sections whose own-preset condition says yes.
    for (const world of [w, noLib]) {
      const perSection = [0, 1, 2, 3]
        .filter((i) => sectionWiringConditions(world, i, CH).ownPreset.verdict === 'yes');
      expect(ownPresetSections(world, 4, CH)).toEqual(perSection);
    }
  });

  it('`threadedSections` is EXISTENCE, and is not the same set as wired', () => {
    expect(threadedSections(w, 4)).toEqual([0]);
    const w2: SectionRasterWiring = { ...w, threadedBy: { ...w.threadedBy, ZZZ_Preset_Other: 2 } };
    expect(threadedSections(w2, 4)).toEqual([0, 2]);
    expect(wiredSections(w2, 4)).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// CONDITION 3 — THE OTHER CHANNELS ONE `rasterRef` BINDS
// ---------------------------------------------------------------------------
//
// THE DEFECT THESE PIN (cold read 2026-09-05, D-A): section 5 showed ✓ own
// preset AND ✓ threaded, so Aurora told the author a raster band could be bound
// there. The build refused it anyway, because the preset also carried `cycles`
// and nothing threads `ojz_act1_sec_cycle(sec: 5)`. Two ticks was a VERDICT and
// the verdict was wrong.
//
// ⚠ THE DOCUMENTS BELOW ARE OBJECT LITERALS AND NOT `EffectsPreset`s, because
// the condition's input is structural (`ChannelBearingDocument`) and what is
// under test is the KEY PREDICATE — including the three-state absent/null/value
// distinction, which a fully-typed fixture makes harder to spell, not easier.

describe('condition 3: every OTHER chooser a bound document owes', () => {
  const w = synthetic();

  it('the parse finds a chooser call inside an ARRAY LITERAL, not just the first', () => {
    // `variants:` and the two patch arrays hold SEVERAL calls in one bracket.
    // A parameter-anchored regex sees one; aeon matches by chooser NAME for
    // exactly this reason, and so does this.
    const lib = `pub data A: EffectsPreset = preset(
      variants: [ zzz_act1_sec_variant(sec: 4, slot: 0, hand: X),
                  zzz_act1_sec_variant(sec: 4, slot: 1) ])`;
    expect(libraryChannelChooserCalls(lib, 'zzz_act1_sec_variant', 'slot'))
      .toEqual({ A: { 4: [0, 1] } });
  });

  it('an UNINDEXED chooser records the sentinel index 0, so all six read alike', () => {
    expect(libraryChannelChooserCalls(SYNTHETIC_LIB, 'zzz_act1_sec_cycle', null))
      .toEqual({ ZZZ_Preset_Sec0: { 0: [0] } });
  });

  it('the chooser names are DERIVED from the ids, aeon ActNames\' own stem', () => {
    expect(channelChooserName('ojz', 'act1', 'cycle')).toBe('ojz_act1_sec_cycle');
    expect(channelChooserName('ojz', 'act1', 'patch_world_y'))
      .toBe('ojz_act1_sec_patch_world_y');
    // …and `rasterChooserName` is the same function with 'raster'. If these two
    // ever disagreed, condition 2 and condition 3 would be reading different
    // acts out of one file.
    expect(channelChooserName('ojz', 'act1', 'raster')).toBe(rasterChooserName('ojz', 'act1'));
  });

  it('THE COLD READ\'S CASE: a document carrying `cycles` on a section that threads no cycle', () => {
    // Section 1 binds ZZZ_Preset_Shared, which threads nothing at all.
    const c = sectionExtraChannelsCondition(w, 1, { cycles: [{ line: 2 }] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('no');
    expect(c.detail).toBe('nothing threads zzz_act1_sec_cycle(sec: 1)');
    expect(c.gaps).toHaveLength(1);
    expect(c.gaps[0].channel.key).toBe('cycles');
    // …and conditions 1 and 2 are NOT what caught it on a section that has both.
    const both = sectionExtraChannelsCondition(
      w, 0, { cycles: null, patch_motion: [1, 2] }, 'zzz', 'act1', 'mine');
    const two = sectionWiringConditions(w, 0, rasterChooserName('zzz', 'act1'));
    expect(two.ownPreset.verdict).toBe('yes');
    expect(two.threaded.verdict).toBe('yes');
    expect(both.verdict).toBe('no');            // ✓ ✓ ✗ — the whole point
    expect(both.gaps.map((g) => g.channel.key)).toEqual(['patch_motion']);
  });

  it('`cycles: null` STILL owes the chooser: absent/null/value is three states', () => {
    // aeon's `owed` is `"cycles" in d`, so cycling OFF still emits a row.
    expect(sectionExtraChannelsCondition(w, 1, { cycles: null }, 'zzz', 'act1').verdict)
      .toBe('no');
    // …while an ABSENT key owes nothing, which is the majority document.
    expect(sectionExtraChannelsCondition(w, 1, {}, 'zzz', 'act1').verdict).toBe('yes');
    expect(sectionExtraChannelsCondition(w, 1, { cycles: undefined }, 'zzz', 'act1').verdict)
      .toBe('yes');
  });

  it('`variants: null` owes NOTHING: the one channel where aeon\'s predicate differs', () => {
    // aeon: `d.get("variants") is not None`, NOT `in d`. `variants` has no
    // key-level null state, so a null there is not an authored channel.
    expect(sectionExtraChannelsCondition(w, 1, { variants: null }, 'zzz', 'act1').verdict)
      .toBe('yes');
    expect(sectionExtraChannelsCondition(w, 1, { variants: [{}] }, 'zzz', 'act1').verdict)
      .toBe('no');
  });

  it('PARTIAL threading is its own answer, not a pass: a row per index', () => {
    // ZZZ_Preset_Sec0 threads the variant chooser at slot 0 only. A document
    // authoring two slots emits two rows and one of them would go unread.
    const c = sectionExtraChannelsCondition(w, 0, { variants: [{}, {}] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('no');
    expect(c.gaps[0].want).toEqual([0, 1]);
    expect(c.gaps[0].got).toEqual([0]);
    expect(c.detail).toContain('threaded only at slot 0');
    // One slot is satisfied by the same threading.
    expect(sectionExtraChannelsCondition(w, 0, { variants: [{}] }, 'zzz', 'act1').verdict)
      .toBe('yes');
  });

  it('a satisfied channel is a ✓ that NAMES what it checked', () => {
    const c = sectionExtraChannelsCondition(w, 0, { cycles: [] }, 'zzz', 'act1', 'mine');
    expect(c.verdict).toBe('yes');
    expect(c.detail).toBe('cycle threaded');
  });

  it('an UNREADABLE library is `unknown`, never `no`: the standing refusal', () => {
    const noLib: SectionRasterWiring = {
      ...w, library: { path: 'b/zzz_effects.emp', parsed: false, reason: 'ENOENT' },
    };
    const c = sectionExtraChannelsCondition(noLib, 1, { cycles: null }, 'zzz', 'act1');
    expect(c.verdict).toBe('unknown');
    expect(c.detail).toBe('could not read zzz_effects.emp');
    expect(c.gaps).toEqual([]);
  });

  it('NOTHING BOUND ticks, and the detail refuses to be read as a promise', () => {
    const c0 = sectionExtraChannelsCondition(w, 0, null, 'zzz', 'act1');
    expect(c0.verdict).toBe('yes');
    expect(c0.detail).toBe('nothing bound; cycle, variant threaded here');
    const c1 = sectionExtraChannelsCondition(w, 1, null, 'zzz', 'act1');
    expect(c1.detail).toBe('nothing bound; no extra chooser threaded here');
  });

  it('a chooser threaded in a DIFFERENT record does not count for this section', () => {
    // aeon's `channel_faults` looks the call up at `bindings.get(sec)` and
    // nowhere else: a row emitted for sec N is read only by sec N's `preset()`.
    // ZZZ_Preset_Sec0 threads `cycle(sec: 0)`; section 2 binds ZZZ_Preset_Shared.
    const shifted: SectionRasterWiring = {
      ...w,
      channelThreadedBy: { ...w.channelThreadedBy, cycle: { ZZZ_Preset_Sec0: { 2: [0] } } },
    };
    expect(sectionExtraChannelsCondition(shifted, 2, { cycles: null }, 'zzz', 'act1').verdict)
      .toBe('no');
  });

  it('the advisory SPELLS THE REMEDY and never a prohibition', () => {
    const c = sectionExtraChannelsCondition(w, 1, { cycles: null }, 'zzz', 'act1', 'mine');
    const say = extraChannelsAdvisory(c.gaps, 1, 'mine', w.bindings[1])!;
    expect(say).toContain('ZZZ_Preset_Shared, the preset record section 1 binds');
    // The exact `preset()` argument, in aeon's own `prescription` spelling.
    expect(say).toContain('cycle: zzz_act1_sec_cycle(sec: 1, hand: Pal_Cycle_None)');
    expect(say).toContain('one line in aeon');
    expect(say).not.toMatch(/you cannot|not allowed|may not|is forbidden/i);
    // No gaps, nothing to say.
    expect(extraChannelsAdvisory([], 1, 'mine', 'X')).toBeNull();
  });
});

describe('the two paths are derived from dataPath, never written down', () => {
  it('a standard aeon act', () => {
    expect(wiringPaths('games/sonic4/data/editor/ojz/act1/', 'ojz')).toEqual({
      descriptor: 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp',
      library: 'games/sonic4/data/effects/ojz_effects.emp',
    });
  });

  it('a dataPath outside data/editor/ yields null: "could not locate", not "not eligible"', () => {
    expect(wiringPaths('some/other/place/', 'ojz')).toBeNull();
    expect(wiringPaths('games/sonic4/data/editor/', 'ojz')).toBeNull();
  });
});

describe('against aeon\'s real ojz/act1: the numbers as they stand today', () => {
  const desc = haveTree ? readFileSync(DESC, 'utf8') : '';
  const lib = haveTree ? readFileSync(LIB, 'utf8') : '';
  // ⚠ SKIPPED WITH A REASON, NEVER QUIETLY. A row that cannot reach aeon's tree
  // measured NOTHING; a green total that swallowed it would be exactly the
  // silent zero this whole derivation exists to prevent.
  const need = (ctx: { skip: (reason: string) => void }): boolean => {
    if (haveTree) return true;
    ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout at ${AEON}: this row reads their real `
      + 'act_descriptor.emp and ojz_effects.emp and could not. The synthetic rows above still '
      + 'ran and cover the parser\'s shapes; what is unmeasured here is whether aeon\'s CURRENT '
      + 'files still parse the way this module expects.');
    return false;
  };

  it('every section 0-8 binds a preset record', (ctx) => {
    if (!need(ctx)) return;
    const b = descriptorEffectsBindings(desc, 'ojz');
    expect(Object.keys(b).map(Number).sort((x, y) => x - y))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // Named, so a rename in aeon is visible here rather than silently shifting
    // the eligible set.
    //
    // ⚠ RE-PINNED 2026-09-03: section 6 was `OJZ_Preset_Plain` (one of the three
    // sharers) until aeon landed item 11a's base_swap and gave 6 a preset of its
    // own. CONFIRMED INTENDED with aeon; not a regression, and not a rename —
    // section 6 LEFT the shared record, which is why the row below moved too.
    //
    // ⚠ RE-PINNED 2026-09-05: section 7 was `OJZ_Preset_Plain` (the last of the
    // sharers alongside 8) until aeon landed item 9c's live patch channels and
    // gave 7 a preset of its own, `OJZ_Preset_Sec7` — the `OJZ_WorldWater` pair
    // whose bands are channels 2 and 3 in `aeon-effects-channel-bands.json`.
    // aeon's own act_descriptor.emp says so in a comment above the `use` line.
    // Not a regression and not a rename: section 7 LEFT the shared record, which
    // is why the row below moved too — and this time it left NOBODY behind it.
    expect(b[0]).toBe('OJZ_Preset_Sec0');
    expect(b[6]).toBe('OJZ_Preset_Sec6');
    expect(b[7]).toBe('OJZ_Preset_Sec7');
    expect(b[8]).toBe('OJZ_Preset_Plain');
  });

  it('ALL NINE sections now own their preset: nothing is shared any more', (ctx) => {
    if (!need(ctx)) return;
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1')),
      channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    // ⚠ RE-PINNED 2026-09-05 with the row above, and it is ONE aeon landing seen
    // twice: section 7 acquired `OJZ_Preset_Sec7` for item 9c, so it joined the
    // eligible set and left the sharer set. Eligible 0-6 -> 0-8.
    //
    // ⚠⚠ AND THE SHARER SET IS NOW EMPTY, WHICH THIS ROW NO LONGER MEASURES.
    // `OJZ_Preset_Plain` is section 8's alone, so NO section is in the `shared`
    // state against aeon's real tree and the old `toBe('shared')` assertions had
    // nothing left to assert. They are not silently dropped: the `shared` state
    // is still covered by the SYNTHETIC rows earlier in this file, which build a
    // wiring with a genuinely shared record. What is gone is the confirmation
    // that aeon still SHIPS one — so this row asserts the emptiness explicitly
    // and goes red the day a section is pointed at another's record again.
    expect(eligibleSections(w, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const shared: number[] = [];
    for (let s = 0; s < 9; s++) {
      if (sectionRasterState(w, s) === 'shared') shared.push(s);
      // Every section is its own only sharer — the data form of "nothing is
      // shared", checked per section rather than inferred from the list above.
      expect(sectionSharers(w, s), `section ${s}`).toEqual([s]);
    }
    expect(shared,
      'aeon ships a SHARED preset record again: re-pin this row and the one above, and note '
      + 'which sections share it; the shared state is reachable against the real tree once more')
      .toEqual([]);
    // Anti-vacuous: nine sections really were examined, and they really do bind
    // nine DISTINCT records — an empty or single-record binding map would
    // satisfy "nothing is shared" while measuring nothing.
    expect(Object.keys(w.bindings).length).toBe(9);
    expect(new Set(Object.values(w.bindings)).size).toBe(9);
  });

  it('exactly TWO sections are threaded today, and it is not the same fact as eligible', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THE TWO FACTS ARE DIFFERENT AND BOTH MATTER. "Section 0 may have a
    // band" (its preset is its own) and "section 0 has one wired" (a preset
    // threads the chooser on index 0) are different claims, and conflating them
    // is how "only section 5" and "sections 0-5" were BOTH published as the
    // answer on the same day. They are {5,6} and 0-6 respectively.
    //
    // ⚠ RE-PINNED 2026-09-03, the third face of the SAME aeon landing: item 11a
    // threaded section 6's base_swap program through the chooser as well as
    // giving 6 its own preset record. The two facts moved TOGETHER this time and
    // still are not the same fact — eligible is 0-6, threaded is {5,6} — which
    // is precisely why the row keeps asserting both. CONFIRMED INTENDED.
    const calls = libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1'));
    expect(calls).toEqual({ OJZ_Preset_Sec5: 5, OJZ_Preset_Sec6: 6 });
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: calls,
      channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    expect(wiredSections(w, 9)).toEqual([5, 6]);
    expect(eligibleSections(w, 9)).not.toEqual(wiredSections(w, 9));
  });

  it('THE COLD READ REPRODUCED: section 5 is ✓ ✓ ✗ against aeon\'s real tree', (ctx) => {
    if (!need(ctx)) return;
    // ⚠ THIS IS THE ROW THE WHOLE PARCEL IS FOR. The cold reader bound a preset
    // carrying `cycles` to section 5 — the ONE section Aurora's own strip marked
    // ✓ own preset AND ✓ threaded — and aeon refused the build:
    //
    //   "But OJZ_Preset_Sec5 … threads ojz_act1_sec_cycle for sec 5 NOWHERE."
    //
    // Derived, not asserted from the report: `OJZ_Preset_Sec5` spells
    // `cycle: Pal_Cycle_None`, a literal, while threading `raster:` and both
    // patch arrays. If aeon ever threads the cycle chooser there, THIS ROW GOES
    // RED and the correct response is to read the new fact off the file.
    const chooser = rasterChooserName('ojz', 'act1');
    const w: SectionRasterWiring = {
      bindings: descriptorEffectsBindings(desc, 'ojz'),
      threadedBy: libraryRasterChooserCalls(lib, chooser),
      channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
      descriptor: { path: DESC, parsed: true },
      library: { path: LIB, parsed: true },
    };
    const two = sectionWiringConditions(w, 5, chooser);
    expect(two.ownPreset.verdict, 'section 5 owns its preset').toBe('yes');
    expect(two.threaded.verdict, 'section 5 threads the raster chooser').toBe('yes');

    const withCycles = sectionExtraChannelsCondition(
      w, 5, { cycles: [{ line: 2, first: 8, count: 4, period: 8 }] },
      'ojz', 'act1', 'coldread_water_tint');
    expect(withCycles.verdict, 'the third condition catches what the first two missed').toBe('no');
    expect(withCycles.detail).toBe('nothing threads ojz_act1_sec_cycle(sec: 5)');
    expect(extraChannelsAdvisory(withCycles.gaps, 5, 'coldread_water_tint', w.bindings[5]))
      .toContain('cycle: ojz_act1_sec_cycle(sec: 5, hand: Pal_Cycle_None)');

    // ANTI-VACUOUS, both ways. The same section PASSES for a document with no
    // extra keys (so the row is not simply always `no`), and the patch channels
    // — which OJZ_Preset_Sec5 really does thread, at four indices each — pass
    // where the cycle one fails. A parse that found nothing would fail this.
    expect(sectionExtraChannelsCondition(w, 5, {}, 'ojz', 'act1').verdict).toBe('yes');
    const patched = sectionExtraChannelsCondition(
      w, 5, { patch_world_ys: [0, 0, 0, 0], patch_motion: [0, 0, 0, 0] }, 'ojz', 'act1');
    expect(patched.verdict, 'OJZ_Preset_Sec5 threads both patch choosers at ch 0-3').toBe('yes');
    // …and a FIFTH index would not be threaded, which is aeon's partial arm.
    expect(sectionExtraChannelsCondition(
      w, 5, { patch_world_ys: [0, 0, 0, 0, 0] }, 'ojz', 'act1').verdict).toBe('no');
  });

  it('the channel TABLE still matches aeon\'s SECTION_CHANNELS', (ctx) => {
    // ⚠ THE ONE THING THIS MODULE TRANSCRIBES ACROSS A REPO BOUNDARY. Which
    // sections thread what is derived per load and never written down; the set
    // of CHANNELS is a schema fact and is a table here. A table can go silently
    // short when aeon adds a seventh key — `boundary` was the fourth added in a
    // fortnight — so the divergence is made loud in the suite instead.
    const gen = join(AEON, 'tools/effects_gen.py');
    if (!existsSync(gen)) {
      ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout at ${AEON}, so EXTRA_SECTION_CHANNELS was `
        + 'compared against nothing. What is unmeasured is whether aeon has added a chooser '
        + 'channel this table does not carry: the exact hole aeon\'s own channel_faults exists '
        + 'to close, one repo over.');
      return;
    }
    const src = readFileSync(gen, 'utf8');
    const table = /SECTION_CHANNELS\s*=\s*\(([\s\S]*?)\n\)/.exec(src);
    expect(table, 'aeon\'s SECTION_CHANNELS table could not be located in tools/effects_gen.py: '
      + 'the shape changed; re-read it rather than deleting this row').not.toBeNull();
    const arms = /ARM_CHANNELS\s*=\s*\(([^)]*)\)/.exec(src);
    expect(arms, 'aeon\'s ARM_CHANNELS could not be located').not.toBeNull();
    const armNames = [...arms![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    // The first string of each `SectionChannel(...)` row is its channel name.
    const allChannels = [...table![1].matchAll(/SectionChannel\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(allChannels.length, 'aeon\'s table parsed as empty: the regex, not the table')
      .toBeGreaterThan(2);
    const nonArm = allChannels.filter((c) => !armNames.includes(c));
    expect(EXTRA_SECTION_CHANNELS.map((c) => c.channel),
      `aeon's non-arm channels are now [${nonArm.join(', ')}]: transcribe the new row into `
      + 'EXTRA_SECTION_CHANNELS (key, param, chooser suffix, index param, owed, indices, hand) '
      + 'from tools/effects_gen.py, and check tools/effects_seam_gate.py::channel_faults for '
      + 'whether it changed shape too').toEqual(nonArm);
  });
});
