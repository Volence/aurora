// THE MOVING ANCHOR — `patch_world_ys` and `patch_motion` on the band-preset panel.
//
// ROADMAP row 95 / EW-TIMELINE-CLOCK. The keys landed in the codec at
// EW-CHANNELS-WRITER (empyrean d36d704, AURORA_EFFECTS_SCHEMA.md §7.3) with
// their ladders and converters; this file is about the surface that AUTHORS
// them, and every row is written against one of the four properties a control
// on this path can violate in silence:
//
//   1. THE TWO SHIFTS ARE BASE-2 LOGARITHMS. The option lists must BE the
//      ladders, and the command must refuse an off-ladder shift rather than
//      round it: one rung of rounding is a doubling nothing reports.
//   2. THREE STATES PER INDEX, and `0` IS A REAL WORLD Y. A control that maps
//      "cleared" to 0 authors the most invasive state in the key.
//   3. A MOTION WITH NO SEED IS A NO-OP, and the author must be told.
//   4. THE SEED IS 1:1 WHOLE PIXELS. Nothing multiplies.
//
// Plus the two shape rules the positional arrays impose: a short array is never
// padded, and a positional array is never given a hole.
//
// ⚠ WHAT THESE ROWS CANNOT SEE, stated because the suite has ~6,500 of them and
// they pass over visibly broken screens. There is no React here: nothing below
// proves a select on screen reaches any of these functions, that a section is
// mounted, or that the preview's clock ticks. That is
// `scratchpad/anchor-authoring-harness.mjs`, driving the real app under CDP.
// And NO EMULATOR AND NO ROM: nothing here has seen an anchor move.

import { describe, it, expect } from 'vitest';
import {
  AnchorSeedState, AnchorMotionState,
  anchorSeedState, anchorMotionState, anchorSeedValue, anchorSweepOf, anchorChannelIndices,
  anchorSeedRefusal, anchorPhaseRefusal, anchorExtendRefusal, anchorMotionWithoutSeedAdvisory,
  anchorSweepSummary, anchorAmpRungOf, anchorPeriodRungOf, anchorOffsetAtTick,
  newAnchorSweep, newAnchorWorldY,
  setAnchorSeedStateCommand, setAnchorSeedCommand, setAnchorMotionStateCommand,
  setAnchorSweepShiftCommand, setAnchorPhaseCommand,
  ANCHOR_SEED_OPTIONS, ANCHOR_MOTION_OPTIONS, ANCHOR_AMP_OPTIONS, ANCHOR_PERIOD_OPTIONS,
  ANCHOR_SEED_TITLE, ANCHOR_MOTION_TITLE, ANCHOR_SWEEP_TITLE, anchorSweepFieldTitle,
  ANCHOR_MOTION_WITHOUT_SEED, ANCHOR_TICK_HZ, ANCHOR_MAX_PEAK_PX,
  newPreset,
} from '../effects-preset';
import {
  serializeEffectsPreset, parseEffectsPreset,
  EFFECTS_PRESET_MAX_PATCH, EFFECTS_PRESET_WORLD_Y_RANGE, EFFECTS_PRESET_PATCH_ANCHOR_NONE,
  EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL,
  ANCHOR_AMP_RUNGS, ANCHOR_PERIOD_RUNGS, ANCHOR_PHASE_RANGE,
} from '../../../core/formats/effects/preset';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { SetEffectsPresetCommand } from '../../../core/editing/commands';

function library(p: EffectsPreset): EffectsPresetLibrary {
  return { presets: [p], unreadable: [], notices: [] };
}

/** Apply a command's `newPreset`, or throw loudly — a null here is a no-op the row did not ask for. */
function after(c: SetEffectsPresetCommand | null): EffectsPreset {
  expect(c, 'the gesture produced no command (a no-op) where the row expected a change').not.toBeNull();
  expect(c!.newPreset).not.toBeNull();
  return c!.newPreset!;
}

const ID = 'anchor_probe';
const base = (): EffectsPreset => newPreset(ID);

/** Author channel `i`'s seed, from a preset that reaches channel `i - 1`. */
function withSeeds(...values: (number | null)[]): EffectsPreset {
  return { ...base(), patch_world_ys: values };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE LADDERS — the options ARE the rungs, and a shift is never rounded
// ═══════════════════════════════════════════════════════════════════════════

describe('the shift controls offer the ladder and nothing between', () => {
  it('the amplitude options are exactly the codec\'s rungs, in order, one per rung', () => {
    expect(ANCHOR_AMP_OPTIONS.map((o) => o.value)).toEqual(ANCHOR_AMP_RUNGS.map((r) => r.amp_shift));
    // ANTI-VACUOUS: the ladder has to have more than one rung for "offers the
    // ladder" to mean anything, and the labels have to carry the PHYSICAL
    // quantity — a select of seven "amp_shift = N" is the log leaking onto the
    // screen, which is what the schema says a UI must not make an author read.
    expect(ANCHOR_AMP_OPTIONS.length).toBeGreaterThan(1);
    for (const r of ANCHOR_AMP_RUNGS) {
      const o = ANCHOR_AMP_OPTIONS.find((x) => x.value === r.amp_shift)!;
      expect(o.label).toContain(`${r.peak_px} px`);
      expect(o.label).toContain(`${r.peak_to_peak_px} px of travel`);
    }
  });

  it('the period options are exactly the codec\'s rungs, labelled in seconds AND ticks', () => {
    expect(ANCHOR_PERIOD_OPTIONS.map((o) => o.value))
      .toEqual(ANCHOR_PERIOD_RUNGS.map((r) => r.period_shift));
    expect(ANCHOR_PERIOD_OPTIONS.length).toBeGreaterThan(1);
    for (const r of ANCHOR_PERIOD_RUNGS) {
      const o = ANCHOR_PERIOD_OPTIONS.find((x) => x.value === r.period_shift)!;
      expect(o.label).toContain(`${r.seconds.toFixed(2)} s`);
      expect(o.label).toContain(`${r.ticks} ticks`);
    }
  });

  it('⚠ AN OFF-LADDER SHIFT IS REFUSED, NOT ROUNDED — on both ladders, both ends', () => {
    const p = { ...base(), patch_motion: [{ sweep: newAnchorSweep() }] };
    const lib = library(p);
    const ampLo = ANCHOR_AMP_RUNGS[0].amp_shift;
    const ampHi = ANCHOR_AMP_RUNGS[ANCHOR_AMP_RUNGS.length - 1].amp_shift;
    const perLo = ANCHOR_PERIOD_RUNGS[0].period_shift;
    const perHi = ANCHOR_PERIOD_RUNGS[ANCHOR_PERIOD_RUNGS.length - 1].period_shift;
    expect(setAnchorSweepShiftCommand(lib, ID, 0, 'amp_shift', ampLo - 1)).toBeNull();
    expect(setAnchorSweepShiftCommand(lib, ID, 0, 'amp_shift', ampHi + 1)).toBeNull();
    expect(setAnchorSweepShiftCommand(lib, ID, 0, 'amp_shift', ampLo + 0.5)).toBeNull();
    expect(setAnchorSweepShiftCommand(lib, ID, 0, 'period_shift', perLo - 1)).toBeNull();
    expect(setAnchorSweepShiftCommand(lib, ID, 0, 'period_shift', perHi + 1)).toBeNull();
    // AND THE LEGAL COUNTERPARTS COMMIT, in the same row, so none of the above
    // is green on a command that refuses everything.
    for (const r of ANCHOR_AMP_RUNGS) {
      const out = setAnchorSweepShiftCommand(lib, ID, 0, 'amp_shift', r.amp_shift);
      if (r.amp_shift === p.patch_motion![0]!.sweep.amp_shift) continue; // a no-op is null by design
      expect(after(out).patch_motion![0]!.sweep.amp_shift).toBe(r.amp_shift);
    }
    for (const r of ANCHOR_PERIOD_RUNGS) {
      const out = setAnchorSweepShiftCommand(lib, ID, 0, 'period_shift', r.period_shift);
      if (r.period_shift === p.patch_motion![0]!.sweep.period_shift) continue;
      expect(after(out).patch_motion![0]!.sweep.period_shift).toBe(r.period_shift);
    }
  });

  it('a NEW sweep is the schema\'s own shipped precedent, and its phase is ABSENT', () => {
    const s = newAnchorSweep();
    // Read the precedent out of the schema in this process, so the row cannot
    // agree with a hardcoded pair in the provider.
    const m = /anchor_sweep\(amp_shift: (\d+), period_shift: (\d+)\)/.exec(ANCHOR_SWEEP_TITLE);
    expect(m, 'the schema no longer names a hand-authored precedent').not.toBeNull();
    expect(s.amp_shift).toBe(Number(m![1]));
    expect(s.period_shift).toBe(Number(m![2]));
    expect(anchorAmpRungOf(s)).not.toBeNull();
    expect(anchorPeriodRungOf(s)).not.toBeNull();
    expect('phase' in s).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THREE STATES PER INDEX — and 0 is a real world Y
// ═══════════════════════════════════════════════════════════════════════════

describe('the seed key keeps three states apart', () => {
  it('reads unreached, null and a number as three different states', () => {
    const p = withSeeds(100, null);
    expect(anchorSeedState(p, 0)).toBe('authored');
    expect(anchorSeedState(p, 1)).toBe('unused');
    expect(anchorSeedState(p, 2)).toBe('unreached');
    expect(anchorSeedState(base(), 0)).toBe('unreached');
  });

  it('⚠ 0 IS A REAL WORLD Y — it reads as authored, not as empty', () => {
    const p = withSeeds(0);
    expect(anchorSeedState(p, 0)).toBe('authored');
    expect(anchorSeedValue(p, 0)).toBe(0);
    // and null is NOT 0
    expect(anchorSeedValue(withSeeds(null), 0)).toBeNull();
  });

  it('⚠ A NEW CHANNEL IS NOT BORN ON 0, and the number it is born on is derived', () => {
    expect(newAnchorWorldY()).not.toBe(0);
    expect(anchorSeedRefusal(newAnchorWorldY())).toBeNull();
    const p = after(setAnchorSeedStateCommand(library(base()), ID, 0, 'authored'));
    expect(p.patch_world_ys).toEqual([newAnchorWorldY()]);
  });

  it('each of the three seed spellings is authored exactly, by KEY PRESENCE', () => {
    const lib = library(base());
    const authored = after(setAnchorSeedStateCommand(lib, ID, 0, 'authored'));
    expect('patch_world_ys' in authored).toBe(true);
    expect(typeof authored.patch_world_ys![0]).toBe('number');

    const unused = after(setAnchorSeedStateCommand(library(authored), ID, 0, 'unused'));
    expect(unused.patch_world_ys).toEqual([null]);

    // BACK TO UNREACHED TAKES THE KEY WITH IT — Aurora never writes `[]` here.
    const gone = after(setAnchorSeedStateCommand(library(unused), ID, 0, 'unreached'));
    expect('patch_world_ys' in gone).toBe(false);
  });

  it('the motion key keeps the same three states, with its own spellings', () => {
    const lib = library(base());
    const sweep = after(setAnchorMotionStateCommand(lib, ID, 0, 'sweep'));
    expect(anchorMotionState(sweep, 0)).toBe('sweep');
    expect(anchorSweepOf(sweep, 0)).toEqual(newAnchorSweep());

    const still = after(setAnchorMotionStateCommand(library(sweep), ID, 0, 'still'));
    expect(still.patch_motion).toEqual([null]);
    expect(anchorMotionState(still, 0)).toBe('still');

    const gone = after(setAnchorMotionStateCommand(library(still), ID, 0, 'unreached'));
    expect('patch_motion' in gone).toBe(false);
    expect(anchorMotionState(gone, 0)).toBe('unreached');
  });

  it('every option label says the SPELLING it writes, and none of them says "0"', () => {
    // The hazard the whole key carries: a picker reading "none" beside a number
    // field is one an author can reasonably read as zero.
    expect(ANCHOR_SEED_OPTIONS.map((o) => o.value))
      .toEqual<AnchorSeedState[]>(['unreached', 'unused', 'authored']);
    expect(ANCHOR_MOTION_OPTIONS.map((o) => o.value))
      .toEqual<AnchorMotionState[]>(['unreached', 'still', 'sweep']);
    const unusedLabel = ANCHOR_SEED_OPTIONS.find((o) => o.value === 'unused')!.label;
    expect(unusedLabel).toContain('null');
    expect(unusedLabel).not.toMatch(/\b0\b/);
    for (const o of [...ANCHOR_SEED_OPTIONS, ...ANCHOR_MOTION_OPTIONS]) {
      expect(o.label.length).toBeGreaterThan(8);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. NEVER PAD, NEVER HOLE
// ═══════════════════════════════════════════════════════════════════════════

describe('the positional arrays are neither padded nor holed', () => {
  it('⚠ AUTHORING CHANNEL 0 LEAVES A LENGTH-1 ARRAY while MAX_PATCH is bigger', () => {
    expect(EFFECTS_PRESET_MAX_PATCH).toBeGreaterThan(1);
    const p = after(setAnchorSeedStateCommand(library(base()), ID, 0, 'authored'));
    expect(p.patch_world_ys!.length).toBe(1);
    // and the SERIALISED bytes carry a length-1 array too, which is the artifact
    // the generator reads — an object comparison cannot see a writer that pads.
    const round = parseEffectsPreset(serializeEffectsPreset(p), ID);
    expect(round.patch_world_ys!.length).toBe(1);
  });

  it('an index past the end of the array is REFUSED with a sentence naming the channel', () => {
    const p = withSeeds(100);
    expect(anchorExtendRefusal(p, 'seed', 0)).toBeNull();   // reached
    expect(anchorExtendRefusal(p, 'seed', 1)).toBeNull();   // ends exactly here
    const why = anchorExtendRefusal(p, 'seed', 2);
    expect(why).not.toBeNull();
    expect(why).toContain('Channel 1');
    // The MOTION key has its own length: with no motion at all, channel 1 is
    // blocked even though the seed reaches it.
    expect(anchorExtendRefusal(p, 'motion', 0)).toBeNull();
    expect(anchorExtendRefusal(p, 'motion', 1)).not.toBeNull();
  });

  it('and the command refuses the same index the sentence refuses — no hole is opened', () => {
    const p = withSeeds(100);
    expect(setAnchorSeedStateCommand(library(p), ID, 2, 'authored')).toBeNull();
    expect(setAnchorMotionStateCommand(library(p), ID, 1, 'sweep')).toBeNull();
    // ANTI-VACUOUS: the reachable index in the same breath.
    expect(after(setAnchorSeedStateCommand(library(p), ID, 1, 'authored'))
      .patch_world_ys!.length).toBe(2);
  });

  it('the schema\'s maxItems is the cap, and it is not exceeded', () => {
    let p: EffectsPreset = base();
    for (let i = 0; i < EFFECTS_PRESET_MAX_PATCH; i++) {
      p = after(setAnchorSeedStateCommand(library(p), ID, i, 'authored'));
    }
    expect(p.patch_world_ys!.length).toBe(EFFECTS_PRESET_MAX_PATCH);
    expect(setAnchorSeedStateCommand(library(p), ID, EFFECTS_PRESET_MAX_PATCH, 'authored'))
      .toBeNull();
    expect(anchorChannelIndices(p).length).toBe(EFFECTS_PRESET_MAX_PATCH);
  });

  it('the panel draws every reached channel plus one, from EITHER key\'s length', () => {
    expect(anchorChannelIndices(base())).toEqual([0]);
    expect(anchorChannelIndices(withSeeds(1, 2))).toEqual([0, 1, 2]);
    expect(anchorChannelIndices({ ...base(), patch_motion: [null, null, null] }))
      .toEqual([0, 1, 2, 3]);
  });

  it('unreached at index 1 drops channel 1 and everything after it, and nothing before', () => {
    const p = withSeeds(10, 20, 30);
    const out = after(setAnchorSeedStateCommand(library(p), ID, 1, 'unreached'));
    expect(out.patch_world_ys).toEqual([10]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. THE UNIT, AND THE TWO REFUSALS
// ═══════════════════════════════════════════════════════════════════════════

describe('the seed is whole pixels, 1:1, and nothing on this path multiplies', () => {
  it('⚠ THE WRITTEN VALUE IS THE TYPED VALUE — no scale anywhere on the path', () => {
    expect(EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL).toBe(1);
    const p = withSeeds(0);
    for (const px of [1, 17, 224, 1000]) {
      const out = after(setAnchorSeedCommand(library(p), ID, 0, px));
      expect(out.patch_world_ys![0]).toBe(px);
      // and through the BYTES, because that is what aeon reads.
      expect(serializeEffectsPreset(out)).toContain(`${px}`);
    }
  });

  it('the u16 range and the sentinel are refused, and legal neighbours are not', () => {
    const { min, max } = EFFECTS_PRESET_WORLD_Y_RANGE;
    expect(anchorSeedRefusal(min - 1)).not.toBeNull();
    expect(anchorSeedRefusal(max + 1)).not.toBeNull();
    expect(anchorSeedRefusal(1.5)).not.toBeNull();
    expect(anchorSeedRefusal(min)).toBeNull();
    expect(anchorSeedRefusal(max)).toBeNull();

    const sentinel = anchorSeedRefusal(EFFECTS_PRESET_PATCH_ANCHOR_NONE);
    expect(sentinel).not.toBeNull();
    expect(sentinel).toContain(String(EFFECTS_PRESET_PATCH_ANCHOR_NONE));
    // AND IT POINTS AT THE OTHER SPELLING rather than just saying no.
    expect(sentinel).toContain('null');
    expect(anchorSeedRefusal(EFFECTS_PRESET_PATCH_ANCHOR_NONE - 1)).toBeNull();
    expect(anchorSeedRefusal(EFFECTS_PRESET_PATCH_ANCHOR_NONE + 1)).toBeNull();
  });

  it('a refused world Y never reaches the document', () => {
    const lib = library(withSeeds(100));
    expect(setAnchorSeedCommand(lib, ID, 0, EFFECTS_PRESET_PATCH_ANCHOR_NONE)).toBeNull();
    expect(setAnchorSeedCommand(lib, ID, 0, EFFECTS_PRESET_WORLD_Y_RANGE.max + 1)).toBeNull();
    expect(after(setAnchorSeedCommand(lib, ID, 0, 99)).patch_world_ys).toEqual([99]);
  });

  it('phase is the one continuous field, bounded, and optional in both directions', () => {
    const lib = library({ ...base(), patch_motion: [{ sweep: newAnchorSweep() }] });
    expect(anchorPhaseRefusal(ANCHOR_PHASE_RANGE.min)).toBeNull();
    expect(anchorPhaseRefusal(ANCHOR_PHASE_RANGE.max)).toBeNull();
    expect(anchorPhaseRefusal(ANCHOR_PHASE_RANGE.max + 1)).not.toBeNull();
    expect(anchorPhaseRefusal(-1)).not.toBeNull();
    expect(anchorPhaseRefusal(1.5)).not.toBeNull();

    const set = after(setAnchorPhaseCommand(lib, ID, 0, 64));
    expect(set.patch_motion![0]!.sweep.phase).toBe(64);
    // ⚠ AN EXPLICIT 0 IS A DIFFERENT DOCUMENT FROM AN ABSENT PHASE, and both are
    // reachable — the constructor defaults it to 0, so a control that could only
    // write 0 could never take the key back out.
    const zero = after(setAnchorPhaseCommand(library(set), ID, 0, 0));
    expect('phase' in zero.patch_motion![0]!.sweep).toBe(true);
    expect(zero.patch_motion![0]!.sweep.phase).toBe(0);
    const unset = after(setAnchorPhaseCommand(library(zero), ID, 0, undefined));
    expect('phase' in unset.patch_motion![0]!.sweep).toBe(false);
    expect(setAnchorPhaseCommand(lib, ID, 0, 999)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. A MOTION WITH NO SEED SHOWS NOTHING — and the author is told, in the
//    SCHEMA'S words
// ═══════════════════════════════════════════════════════════════════════════

describe('a motion on a channel with no seed is called out', () => {
  it('the advisory is the schema\'s own sentence, not one this repo wrote', () => {
    expect(ANCHOR_SEED_TITLE).toContain(ANCHOR_MOTION_WITHOUT_SEED);
    expect(ANCHOR_MOTION_WITHOUT_SEED).toContain('A seed without a motion');
    expect(ANCHOR_MOTION_WITHOUT_SEED.length).toBeGreaterThan(60);
  });

  it('fires on a sweep with an unreached seed, and on one with a null seed', () => {
    const unreached: EffectsPreset = { ...base(), patch_motion: [{ sweep: newAnchorSweep() }] };
    expect(anchorMotionWithoutSeedAdvisory(unreached, 0)).toBe(ANCHOR_MOTION_WITHOUT_SEED);
    const nulled: EffectsPreset = { ...unreached, patch_world_ys: [null] };
    expect(anchorMotionWithoutSeedAdvisory(nulled, 0)).toBe(ANCHOR_MOTION_WITHOUT_SEED);
  });

  it('and is SILENT when the channel has a seed, or has no sweep — including on 0', () => {
    const ok: EffectsPreset = {
      ...base(), patch_world_ys: [100], patch_motion: [{ sweep: newAnchorSweep() }],
    };
    expect(anchorMotionWithoutSeedAdvisory(ok, 0)).toBeNull();
    // ⚠ 0 IS A SEED. An advisory that treated it as empty would fire here, which
    // is the same defect one layer up.
    expect(anchorMotionWithoutSeedAdvisory({ ...ok, patch_world_ys: [0] }, 0)).toBeNull();
    // no motion at all, and an explicit "still" — neither is a no-op to warn about
    expect(anchorMotionWithoutSeedAdvisory(base(), 0)).toBeNull();
    expect(anchorMotionWithoutSeedAdvisory({ ...base(), patch_motion: [null] }, 0)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE CLOCK'S ARITHMETIC — the one thing about the preview a node row CAN see
// ═══════════════════════════════════════════════════════════════════════════

describe('the sweep the preview draws is the sweep the file describes', () => {
  it('the excursion is the rung\'s peak, and it crosses the seed at half a cycle', () => {
    for (const amp of ANCHOR_AMP_RUNGS) {
      const s = { amp_shift: amp.amp_shift, period_shift: ANCHOR_PERIOD_RUNGS[0].period_shift };
      const T = ANCHOR_PERIOD_RUNGS[0].ticks;
      expect(anchorOffsetAtTick(s, 0)).toBeCloseTo(0, 6);
      expect(anchorOffsetAtTick(s, T / 4)).toBeCloseTo(amp.peak_px, 6);
      expect(anchorOffsetAtTick(s, T / 2)).toBeCloseTo(0, 6);
      expect(anchorOffsetAtTick(s, (3 * T) / 4)).toBeCloseTo(-amp.peak_px, 6);
      // and it is PERIODIC at the rung's own length, not at some other one
      expect(anchorOffsetAtTick(s, T + T / 4)).toBeCloseTo(amp.peak_px, 6);
    }
  });

  it('the period rung is what sets the cycle length — a different rung, a different curve', () => {
    const a = { amp_shift: 4, period_shift: ANCHOR_PERIOD_RUNGS[0].period_shift };
    const b = { amp_shift: 4, period_shift: ANCHOR_PERIOD_RUNGS[1].period_shift };
    const quarterOfA = ANCHOR_PERIOD_RUNGS[0].ticks / 4;
    expect(Math.abs(anchorOffsetAtTick(a, quarterOfA)))
      .toBeGreaterThan(Math.abs(anchorOffsetAtTick(b, quarterOfA)) + 1);
  });

  it('phase shifts the start, and 1/4 of the table is a quarter cycle', () => {
    const steps = ANCHOR_PHASE_RANGE.max + 1;
    const s = { amp_shift: 4, period_shift: 0, phase: steps / 4 };
    const amp = anchorAmpRungOf(s)!;
    expect(anchorOffsetAtTick(s, 0)).toBeCloseTo(amp.peak_px, 6);
    // an ABSENT phase behaves as 0, which is what anchor_sweep() defaults it to
    expect(anchorOffsetAtTick({ amp_shift: 4, period_shift: 0 }, 0)).toBeCloseTo(0, 6);
  });

  it('the preview\'s two derived constants come off the ladder, not off a literal', () => {
    expect(ANCHOR_TICK_HZ).toBe(ANCHOR_PERIOD_RUNGS[0].ticks / ANCHOR_PERIOD_RUNGS[0].seconds);
    expect(ANCHOR_MAX_PEAK_PX).toBe(Math.max(...ANCHOR_AMP_RUNGS.map((r) => r.peak_px)));
    // and the scale is the LADDER's tallest rung, so a small sweep draws small
    expect(ANCHOR_MAX_PEAK_PX).toBeGreaterThan(
      Math.min(...ANCHOR_AMP_RUNGS.map((r) => r.peak_px)));
  });

  it('an off-ladder sweep yields NO excursion rather than a plausible wrong one', () => {
    const bad = { amp_shift: 99, period_shift: 0 };
    expect(anchorAmpRungOf(bad)).toBeNull();
    expect(anchorOffsetAtTick(bad, 123)).toBe(0);
    expect(anchorSweepSummary(bad)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. THE WORDS AN AUTHOR READS
// ═══════════════════════════════════════════════════════════════════════════

describe('the field titles are the contract\'s own prose, reaching the panel', () => {
  it('each title is the schema\'s description and carries its own hazard', () => {
    expect(ANCHOR_SEED_TITLE).toContain('WHOLE PIXELS');
    expect(ANCHOR_SEED_TITLE).toContain('NEITHER SIDE CONVERTS');
    expect(ANCHOR_MOTION_TITLE).toContain('CAP_ANCHOR_MOTION');
    expect(anchorSweepFieldTitle('amp_shift')).toContain('amp_shift');
    expect(anchorSweepFieldTitle('period_shift')).toContain('period_shift');
    expect(anchorSweepFieldTitle('phase').length).toBeGreaterThan(40);
  });

  it('the summary reads in px and seconds, and tracks the rungs it is given', () => {
    const a = anchorSweepSummary({ amp_shift: 4, period_shift: 1 })!;
    expect(a).toContain(`${anchorAmpRungOf({ amp_shift: 4, period_shift: 1 })!.peak_to_peak_px} px`);
    expect(a).toContain(`${anchorPeriodRungOf({ amp_shift: 4, period_shift: 1 })!.seconds.toFixed(2)} s`);
    const b = anchorSweepSummary({ amp_shift: 2, period_shift: 1 })!;
    expect(b).not.toBe(a);
    // phase reads as a fraction of the cycle, which is what it is
    expect(anchorSweepSummary({ amp_shift: 4, period_shift: 1, phase: 128 })).toContain('50%');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. THE ROUND TRIP — the artifact aeon actually reads
// ═══════════════════════════════════════════════════════════════════════════

describe('everything this surface authors survives to the bytes', () => {
  it('a fully authored channel round-trips byte-identically, three states and all', () => {
    let p: EffectsPreset = base();
    p = after(setAnchorSeedStateCommand(library(p), ID, 0, 'authored'));
    p = after(setAnchorSeedCommand(library(p), ID, 0, 320));
    p = after(setAnchorMotionStateCommand(library(p), ID, 0, 'sweep'));
    p = after(setAnchorSweepShiftCommand(library(p), ID, 0, 'amp_shift', 2));
    p = after(setAnchorPhaseCommand(library(p), ID, 0, 64));
    p = after(setAnchorSeedStateCommand(library(p), ID, 1, 'unused'));

    const text = serializeEffectsPreset(p);
    const round = parseEffectsPreset(text, ID);
    expect(serializeEffectsPreset(round)).toBe(text);
    expect(round.patch_world_ys).toEqual([320, null]);
    expect(round.patch_motion).toEqual([{ sweep: { amp_shift: 2, period_shift: 1, phase: 64 } }]);
    // ⚠ THE TWO ARRAYS ARE DIFFERENT LENGTHS AND STAY THAT WAY. A writer that
    // "tidied" them into one length would author a channel nobody asked for.
    expect(round.patch_world_ys!.length).not.toBe(round.patch_motion!.length);
  });

  it('and the document the panel produces VALIDATES — the refusal is real', () => {
    // ANTI-VACUOUS COMPANION: the same shape with a hand-written sentinel is
    // REFUSED, so the row above is not green on a parser that accepts anything.
    const good = serializeEffectsPreset(
      { ...base(), patch_world_ys: [10], patch_motion: [{ sweep: newAnchorSweep() }] });
    expect(parseEffectsPreset(good, ID).patch_world_ys).toEqual([10]);
    const bad = JSON.stringify(
      { schema: 1, id: ID, bands: base().bands,
        patch_world_ys: [EFFECTS_PRESET_PATCH_ANCHOR_NONE] });
    expect(() => parseEffectsPreset(bad, ID)).toThrow(/32767|const/);
  });
});
