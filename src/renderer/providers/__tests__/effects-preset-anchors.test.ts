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
  anchorSweepBandFit, anchorSweepBandRefusal, anchorSweepNoBandAdvisory,
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
import type {
  EffectsPreset, EffectsPresetLibrary, EffectsPresetAnchorSweep,
} from '../../../core/formats/effects/preset';
// THE BANDS ARE AEON'S, VENDORED. Section 6's rows read the SAME module the
// panel reads, so a row cannot pass against a band table nobody ships.
import {
  EFFECTS_CHANNEL_BANDS, anchorBandFit, anchorTravelPx,
  EFFECTS_CHANNEL_BAND_EDGE_HI, EFFECTS_CHANNEL_BAND_EDGE_LO,
  EFFECTS_CHANNEL_BANDS_DECLARED, EFFECTS_CHANNEL_BANDS_GAME,
} from '../../../core/formats/effects/channel-bands';
import type { SetEffectsPresetCommand } from '../../../core/editing/commands';

function library(p: EffectsPreset): EffectsPresetLibrary {
  return { presets: [p], unreadable: [], notices: [], loadedPaths: [] };
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

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE SWEEP THAT CANNOT FIT ITS CHANNEL'S BAND — a REFUSAL, never a pass
// ═══════════════════════════════════════════════════════════════════════════
//
// aeon publishes, in `games/sonic4/data/generated/effects_channel_bands.json`
// (vendored at a pinned revision as
// `src/core/formats/effects/aeon-effects-channel-bands.json`), the screen band
// each patch channel's boundary is confined to. Its `how_to_use` is explicit
// that the fit test is ONE-DIRECTIONAL:
//
//   travel > lines   → a CERTAIN refusal, worth warning on
//   travel <= lines  → CANNOT TELL, never a clearance, because the latched
//                      line is (anchor - Camera_Y) and where the sweep sits
//                      inside [lo, hi] is decided by the camera at run time
//
// ⚠ WHAT WOULD MAKE THESE ROWS GREEN FOR A REASON OTHER THAN THE RULE HOLDING,
// asked separately from "does the warning fire" (bar 2d's operational form).
// THREE candidate green-paths, each ruled out by a named row below:
//
//   (i)  THE WARNING IS STRUCTURALLY UNREACHABLE ON THE CHANNEL UNDER TEST.
//        With today's bands this is not hypothetical, it is the situation:
//        channel 0 is 218 lines and the WIDEST rung on the ladder travels 128
//        px, so NO legal sweep can ever be refused there. A suite that only
//        exercised channel 0 would be green with the comparison inverted,
//        deleted, or pointed at the wrong field. `[6b]` states that as a
//        measured fact rather than letting it hide, and every firing row aims
//        at channel 1 (2 lines), where six of seven rungs refuse.
//   (ii) THE HELPER RETURNS NULL FOR AN UNRELATED REASON — an off-ladder
//        amp_shift, or a channel with no band — so "no warning" is produced by
//        a path that never reached the comparison. `[6d]`, `[6e]` and `[6g]`
//        assert the VERDICT, not the sentence, so the three silences are told
//        apart.
//   (iii) THE MATCHER IS TOO LOOSE (bar 2c) — a row asserting merely "some
//        string came back" would be satisfied by any refusal on this panel.
//        `[6c]` pins the numbers IN the sentence and `[6f]` pins both edge
//        behaviours, which no other refusal here mentions.
//
// ⚠ AND NOTHING BELOW CONVERTS. `lines` is a SCREEN-LINE count 1:1 with the
// authored patchable(lo:, hi:); the engine's single -1 is applied on the far
// side, in Raster_BuildSchedule. A ±1 anywhere in these rows would be the
// defect, not a fix.

describe('a sweep against its channel\'s screen band', () => {
  const sweepAt = (amp: number): EffectsPresetAnchorSweep =>
    ({ amp_shift: amp, period_shift: 1 });

  it('[6a] the ladder Aurora LABELS with is the ladder aeon\'s fit rule computes', () => {
    // The parcel's load-bearing assumption, asserted rather than believed:
    // peak_to_peak_px really is 2 * (256 >> amp_shift) on every rung.
    expect(ANCHOR_AMP_RUNGS.length).toBeGreaterThan(0);
    for (const r of ANCHOR_AMP_RUNGS) {
      expect(r.peak_to_peak_px, `amp_shift ${r.amp_shift}`).toBe(anchorTravelPx(r.amp_shift));
    }
    // ...and the summary under the select quotes that same number, so the
    // warning and the label cannot disagree on screen.
    for (const r of ANCHOR_AMP_RUNGS) {
      expect(anchorSweepSummary(sweepAt(r.amp_shift)))
        .toContain(`${r.peak_to_peak_px} px of travel`);
    }
  });

  it('[6b] the refusal is REACHABLE on channel 1 and UNREACHABLE on channel 0 — measured', () => {
    const ch0 = EFFECTS_CHANNEL_BANDS.get(0);
    const ch1 = EFFECTS_CHANNEL_BANDS.get(1);
    expect(ch0, 'aeon declares no band for channel 0').toBeDefined();
    expect(ch1, 'aeon declares no band for channel 1').toBeDefined();

    const verdicts = (c: number): string[] =>
      ANCHOR_AMP_RUNGS.map((r) => anchorBandFit(c, r.peak_to_peak_px).verdict);

    // Channel 0: 218 lines, widest rung 128 px. NO rung can be refused, so a
    // row aimed here could never fail and would prove nothing about the rule.
    expect(ANCHOR_MAX_PEAK_PX * 2).toBeLessThanOrEqual(ch0!.lines);
    expect(new Set(verdicts(0))).toEqual(new Set(['cannot-tell']));

    // Channel 1: 2 lines. Six of the seven rungs are refused; the seventh is
    // the boundary case, travel == lines, which the contract calls the widest
    // that fits — and which is therefore CANNOT TELL, not a refusal.
    expect(verdicts(1).filter((v) => v === 'cannot-fit')).toHaveLength(6);
    const narrowest = ANCHOR_AMP_RUNGS[ANCHOR_AMP_RUNGS.length - 1];
    expect(narrowest.peak_to_peak_px).toBe(ch1!.lines);
    expect(anchorBandFit(1, narrowest.peak_to_peak_px).verdict).toBe('cannot-tell');
    // ...and one line more IS refused, so the boundary is at travel == lines
    // and not one either side of it.
    expect(anchorBandFit(1, ch1!.lines + 1).verdict).toBe('cannot-fit');
  });

  it('[6c] the sentence names the travel, the band and the count — from the document', () => {
    const band = EFFECTS_CHANNEL_BANDS.get(1)!;
    const msg = anchorSweepBandRefusal(sweepAt(4), 1);
    expect(msg).not.toBeNull();
    // 32 px of travel (amp_shift 4) against a 2-line band.
    expect(msg).toContain('32 px of travel');
    expect(msg).toContain('channel 1');
    expect(msg).toContain(`${band.lo} to ${band.hi}`);
    expect(msg).toContain(`${band.lines} lines counted inclusively`);
    expect(msg).toContain(`32 > ${band.lines}`);
    // NO ±1 ANYWHERE. The numbers on screen are the document's own.
    expect(msg).not.toContain(String(band.hi + 1));
    expect(msg).not.toContain(String(band.lo - 1));
  });

  it('[6d] a legal sweep gets NO CLEARANCE — silence, and the verdict says why', () => {
    // travel == lines: the widest that fits, and still not a pass.
    const s = sweepAt(ANCHOR_AMP_RUNGS[ANCHOR_AMP_RUNGS.length - 1].amp_shift);
    expect(anchorSweepBandRefusal(s, 1)).toBeNull();
    expect(anchorSweepBandFit(s, 1)!.verdict).toBe('cannot-tell');
    // Channel 0, every rung: silent, and for the SAME reason, not for want of a
    // band. This is the row that would go red if somebody added a "fits" arm.
    for (const r of ANCHOR_AMP_RUNGS) {
      expect(anchorSweepBandRefusal(sweepAt(r.amp_shift), 0)).toBeNull();
      expect(anchorSweepBandFit(sweepAt(r.amp_shift), 0)!.verdict).toBe('cannot-tell');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ⚠ THE COVERAGE GAP THESE `no-band` ROWS WERE WRITTEN AGAINST IS CLOSED.
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Until the 2026-09-05 re-vendor (aeon ddd8881a) aeon declared bands for
  // channels 0 and 1 only, so 2 and 3 were REAL undeclared channels an author
  // could reach, and these rows drove `no-band` through the panel's own API on
  // them. aeon's section-7 `OJZ_WorldWater` pair added 2 (3..160) and 3
  // (162..223), and `EFFECTS_PRESET_MAX_PATCH` is 4 — so every channel the
  // panel can address is now declared and **`no-band` is unreachable through
  // the panel for sonic4**.
  //
  // FOUR ROWS WENT RED ON THAT RE-VENDOR AND EVERY ONE OF THEM WAS RIGHT TO.
  // They were anti-vacuity guards, and [6h]'s said in as many words: "delete it
  // or point it at a real gap". Neither deleting them nor letting them pass
  // over an empty loop is acceptable — `anchorSweepNoBandAdvisory` is still
  // live code, and the gap it discloses returns the moment aeon retires a
  // `patchable()` or Aurora grows a fifth channel. So they are pointed at a
  // SYNTHETIC undeclared channel (`UNDECLARED_CHANNEL`), and the fact that the
  // real gap is closed is asserted by `[6e0]` rather than assumed — that row
  // goes red if a real gap ever reopens, which is when these rows should go
  // back to driving it through channels an author can actually reach.
  //
  // The synthetic channel is honest about what it does and does not prove: it
  // exercises the ARM, not the panel path, and `[6e0]` is what keeps the
  // difference visible instead of letting a green suite imply the gap is
  // still being measured where authors live.

  /**
   * A channel index aeon declares no band for, chosen so the `no-band` arm can
   * still be exercised now that every panel-addressable channel is declared.
   * Derived, never typed: the first index at or above `EFFECTS_PRESET_MAX_PATCH`
   * that the vendored map does not carry.
   */
  const UNDECLARED_CHANNEL = (() => {
    for (let c = EFFECTS_PRESET_MAX_PATCH; c < EFFECTS_PRESET_MAX_PATCH + 64; c++) {
      if (!EFFECTS_CHANNEL_BANDS.has(c)) return c;
    }
    throw new Error('no undeclared channel index exists to exercise the `no-band` arm');
  })();

  it('[6e0] EVERY panel-addressable channel is declared — so `no-band` is out of an author\'s reach', () => {
    // The data fact the four rows below are shaped around, asserted rather than
    // commented. If aeon retires a `patchable()` (or Aurora grows a channel past
    // what aeon declares) this goes red, and the rows below should go back to
    // driving `no-band` through a channel an author can actually select.
    const undeclared: number[] = [];
    for (let c = 0; c < EFFECTS_PRESET_MAX_PATCH; c++) {
      if (!EFFECTS_CHANNEL_BANDS.has(c)) undeclared.push(c);
    }
    expect(undeclared,
      'a REAL coverage gap has reopened: aeon no longer declares a band for every channel the '
      + 'panel can address. `anchorSweepNoBandAdvisory` is reachable by an author again, so the '
      + 'no-band rows below should drive it through these channels instead of UNDECLARED_CHANNEL')
      .toEqual([]);
    // Anti-vacuous: there really are channels, and the map really covers them.
    expect(EFFECTS_PRESET_MAX_PATCH).toBeGreaterThan(0);
    expect(EFFECTS_CHANNEL_BANDS.size).toBeGreaterThanOrEqual(EFFECTS_PRESET_MAX_PATCH);
    // ...and the synthetic index really is outside the map, or the rows below
    // would be testing a declared channel while claiming otherwise.
    expect(EFFECTS_CHANNEL_BANDS.has(UNDECLARED_CHANNEL)).toBe(false);
    expect(UNDECLARED_CHANNEL).toBeGreaterThanOrEqual(EFFECTS_PRESET_MAX_PATCH);
  });

  it('[6e] a channel with no declared band is CANNOT TELL, never a warning', () => {
    // Silence for a DIFFERENT reason from [6d], and the verdict is what
    // separates them — a row asserting only "no message" could not.
    expect(EFFECTS_CHANNEL_BANDS.has(UNDECLARED_CHANNEL)).toBe(false);
    for (const r of ANCHOR_AMP_RUNGS) {
      expect(anchorSweepBandRefusal(sweepAt(r.amp_shift), UNDECLARED_CHANNEL)).toBeNull();
      expect(anchorSweepBandFit(sweepAt(r.amp_shift), UNDECLARED_CHANNEL)!.verdict)
        .toBe('no-band');
    }
    // Anti-vacuous: the ladder really has rungs, so the loop above compared
    // something.
    expect(ANCHOR_AMP_RUNGS.length).toBeGreaterThan(0);
  });

  it('[6f] the sentence describes BOTH edges, and does not call either one "clipped"', () => {
    const msg = anchorSweepBandRefusal(sweepAt(2), 1)!;
    // Past hi: the record is NOT EMITTED — the band vanishes, and it does NOT
    // pin to hi. Saying "clipped" or "pinned to the bottom" would be false.
    expect(EFFECTS_CHANNEL_BAND_EDGE_HI.behaviour).toBe('drop');
    expect(msg).toContain('not emitted at all');
    expect(msg).toContain('vanishes for that frame');
    expect(msg).toContain('does not pin to 223');
    // Below lo: it IS emitted, clamped up, and stays visible. The opposite
    // outcome from the same sweep.
    expect(EFFECTS_CHANNEL_BAND_EDGE_LO.behaviour).toBe('clamp_up');
    expect(msg).toContain('clamped up to 222');
    expect(msg).toContain('stays visible');
    // The one word that would flatten the asymmetry.
    expect(msg.toLowerCase()).not.toContain('clip');
  });

  it('[6g] an OFF-LADDER sweep produces no sentence and no verdict', () => {
    // A hand-written file the schema would refuse cannot reach this panel, but
    // a warning that invented a travel for one would be worse than silence —
    // `anchorSweepSummary`'s own rule, applied to the same input.
    const off = { amp_shift: 99, period_shift: 1 } as EffectsPresetAnchorSweep;
    expect(anchorAmpRungOf(off)).toBeNull();
    expect(anchorSweepBandFit(off, 1)).toBeNull();
    expect(anchorSweepBandRefusal(off, 1)).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AND THE SILENCE THAT WAS ITSELF A CLEARANCE — `no-band`, said out loud.
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `EFFECTS_PRESET_MAX_PATCH` is 4; aeon's sidecar declares bands for 0 and 1.
  // An author on channel 2 got `no-band` and the panel rendered NOTHING —
  // exactly what a well-fitting sweep on channel 1 renders. Nothing reads as
  // "we looked and it is fine", which is the reassurance this feature exists to
  // withhold, so the coverage gap is now stated.
  //
  // ⚠ AND THE ASYMMETRY IS DELIBERATE, WHICH IS WHY IT IS ASSERTED AND NOT JUST
  // COMMENTED. `cannot-tell` is ALSO permanently silent (channel 0 is 218 lines
  // against a widest sweep of 128 px, so no legal rung is ever refused there)
  // and somebody will want to make the two match. `[6i]` pins the structural
  // fact that licenses the difference: the advisory only ever appears on a
  // channel where a REFUSAL CAN NEVER APPEAR, so it never occupies the slot
  // whose emptiness is what makes a refusal legible by showing up at all.

  it('[6h] a channel aeon declares NO band for SAYS SO — it is not left blank', () => {
    // Driven on the SYNTHETIC undeclared channel: see the block above [6e0].
    // The real gap this row was written against is closed, and [6e0] is what
    // asserts that rather than this row quietly passing over an empty loop.
    const undeclared = [UNDECLARED_CHANNEL];
    expect(EFFECTS_CHANNEL_BANDS.has(UNDECLARED_CHANNEL)).toBe(false);

    // The declared list the sentence quotes, rebuilt here from the data rather
    // than copied off the screen — and it must be able to spell a list of ANY
    // length, since aeon went from two declared channels to four in one
    // re-vendor and a builder capped at two turned that into a red row about
    // phrasing rather than about the advisory.
    expect(EFFECTS_CHANNEL_BANDS_DECLARED.length,
      'CANNOT MEASURE the declared-channel phrasing: aeon declares no channels at all')
      .toBeGreaterThan(0);
    const ds = EFFECTS_CHANNEL_BANDS_DECLARED;
    const declaredPhrase = ds.length === 1
      ? `channel ${ds[0]}`
      : `channels ${ds.slice(0, -1).join(', ')} and ${ds[ds.length - 1]}`;

    for (const c of undeclared) {
      for (const r of ANCHOR_AMP_RUNGS) {
        const msg = anchorSweepNoBandAdvisory(sweepAt(r.amp_shift), c);
        expect(msg, `channel ${c}, amp_shift ${r.amp_shift}`).not.toBeNull();
        // It names the channel, the GAME whose bands these are, the coverage,
        // and the shape of the declaration an author would have to go and read.
        expect(msg).toContain(`channel ${c}`);
        expect(msg).toContain(EFFECTS_CHANNEL_BANDS_GAME);
        expect(msg).toContain(declaredPhrase);
        expect(msg).toContain('patchable(lo:, hi:)');
        // ...and it says what is MISSING. Never a clearance — same bar as the
        // rest of this path: no "fits", no "ok", no tick.
        expect(msg).toContain('never as a clearance');
        expect(msg!.toLowerCase()).not.toContain('fits');
        expect(msg).not.toMatch(/\bok\b/i);
        expect(msg).not.toContain('✓');
        // The verdict behind it, so a sentence produced by some other path
        // could not satisfy this row.
        expect(anchorSweepBandFit(sweepAt(r.amp_shift), c)!.verdict).toBe('no-band');
      }
    }

    // An OFF-LADDER sweep still gets nothing, on an undeclared channel too:
    // the advisory follows `anchorSweepBandFit`'s null, not the channel index.
    const off = { amp_shift: 99, period_shift: 1 } as EffectsPresetAnchorSweep;
    expect(anchorSweepNoBandAdvisory(off, undeclared[0])).toBeNull();
  });

  it('[6i] the advisory NEVER lands in the slot a refusal can use — the reason cannot-tell stays silent', () => {
    // THE STRUCTURAL PROPERTY, asserted rather than trusted. Both hints render
    // in the same position under `Travel`. Leaving that position empty on a
    // healthy sweep is what makes a refusal legible by APPEARING, so a
    // permanent note there would cost the refusal its loudest signal — but only
    // on a channel where a refusal can appear at all.
    // Every panel-addressable channel PLUS the synthetic undeclared one, so the
    // property is checked on both kinds of channel. Sweeping 0..MAX_PATCH alone
    // would now only ever see declared channels and could not tell you that the
    // advisory stays out of the refusal's slot, because it would never fire.
    const channels = [...Array(EFFECTS_PRESET_MAX_PATCH).keys(), UNDECLARED_CHANNEL];
    for (const c of channels) {
      const refusable = ANCHOR_AMP_RUNGS
        .filter((r) => anchorSweepBandRefusal(sweepAt(r.amp_shift), c) !== null);
      const advised = ANCHOR_AMP_RUNGS
        .filter((r) => anchorSweepNoBandAdvisory(sweepAt(r.amp_shift), c) !== null);
      // Never both on one channel, and never both on one rung.
      expect(refusable.length === 0 || advised.length === 0,
        `channel ${c} produces BOTH a band refusal and a no-band advisory`).toBe(true);
      // The advisory is all-or-nothing per channel: it is a property of the
      // channel's declaration, not of the rung the author picked.
      expect(advised.length === 0 || advised.length === ANCHOR_AMP_RUNGS.length,
        `channel ${c} advises on ${advised.length} of ${ANCHOR_AMP_RUNGS.length} rungs`).toBe(true);
      // And it appears on exactly the channels aeon does not declare.
      expect(advised.length > 0).toBe(!EFFECTS_CHANNEL_BANDS.has(c));
    }
    // Anti-vacuous: the loop above really saw BOTH kinds of channel, and really
    // saw a refusal — a sweep over declared channels alone, or over channels on
    // which nothing is ever refused, would satisfy the property vacuously.
    expect(EFFECTS_CHANNEL_BANDS.size).toBeGreaterThan(0);
    expect(channels.some((c) => EFFECTS_CHANNEL_BANDS.has(c))).toBe(true);
    expect(channels.some((c) => !EFFECTS_CHANNEL_BANDS.has(c))).toBe(true);
    expect(channels.some((c) => ANCHOR_AMP_RUNGS
      .some((r) => anchorSweepBandRefusal(sweepAt(r.amp_shift), c) !== null)),
    'no channel in this sweep can produce a refusal at all, so "never both" is vacuous')
      .toBe(true);
  });

  it('[6j] CENSUS: every channel × rung, one verdict, and the sentences it is allowed', () => {
    // The counts must SUM. A row that checks a couple of interesting cells
    // cannot notice a cell that produces two sentences, or none where one is
    // owed — and "cannot-tell says nothing" is a claim about EVERY such cell,
    // not about the two this suite happens to name.
    const seen: Record<string, number> = { 'no-band': 0, 'cannot-tell': 0, 'cannot-fit': 0 };
    let cells = 0;
    // The census spans every panel-addressable channel PLUS the synthetic
    // undeclared one, so all three arms are still reached now that aeon
    // declares a band for all four real channels. See the block above [6e0].
    const channels = [...Array(EFFECTS_PRESET_MAX_PATCH).keys(), UNDECLARED_CHANNEL];
    for (const c of channels) {
      for (const r of ANCHOR_AMP_RUNGS) {
        const s = sweepAt(r.amp_shift);
        const fit = anchorSweepBandFit(s, c)!;
        const refusal = anchorSweepBandRefusal(s, c);
        const advisory = anchorSweepNoBandAdvisory(s, c);
        const where = `channel ${c}, amp_shift ${r.amp_shift}`;
        cells += 1;
        seen[fit.verdict] += 1;
        if (fit.verdict === 'cannot-fit') {
          expect(refusal, where).not.toBeNull();
          expect(advisory, where).toBeNull();
        } else if (fit.verdict === 'no-band') {
          expect(refusal, where).toBeNull();
          expect(advisory, where).not.toBeNull();
        } else {
          // ⚠ `cannot-tell` SAYS NOTHING, AND THAT IS THE DELIBERATE HALF.
          // It is aeon's own named verdict — the check RAN and the contract
          // says its result is unknowable at author time — not a coverage gap
          // of Aurora's. Making this speak too would put a permanent note in
          // the refusal's own slot on every well-authored sweep in the editor.
          // See `anchorSweepNoBandAdvisory`'s header before changing it.
          expect(refusal, where).toBeNull();
          expect(advisory, where).toBeNull();
        }
      }
    }
    expect(cells).toBe(channels.length * ANCHOR_AMP_RUNGS.length);
    expect(seen['no-band'] + seen['cannot-tell'] + seen['cannot-fit']).toBe(cells);
    // All three arms are actually exercised — a census over a sample that only
    // reached one verdict would prove nothing about the other two.
    for (const v of ['no-band', 'cannot-tell', 'cannot-fit']) {
      expect(seen[v], `the census never reached "${v}"`).toBeGreaterThan(0);
    }
  });
});
