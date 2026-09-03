// THE OTHER TWO CHANNELS — `cycles` and `variants` on the band-preset panel.
//
// ROADMAP §5.1 row 97, second half. The schema (empyrean 12aecd5, §7.2) keeps
// THREE STATES per key and says so in rulings Q2 and Q5; the whole hazard of a
// control here is that it collapses one state into another the moment it is
// touched — absent into null, `[]` into null, a null slot into an unreached
// one. So every row below is a STATE-MACHINE row: it names the state it starts
// in, the gesture, and the exact spelling that must be in the document after,
// and it asserts the spelling by KEY PRESENCE (`'cycles' in p`), not by value
// equality that `undefined` and a missing key would both satisfy.
//
// ⚠ WHAT THESE ROWS CANNOT SEE. There is no React here: nothing below proves a
// select on screen reaches these functions. That is
// `scratchpad/variant-cycle-harness.mjs`'s job, driving the real app. And
// NOTHING here touches an engine or an emulator, so the only artifact a row can
// honestly assert is the FILE's bytes, which is why the round-trip rows compare
// `serializeEffectsPreset` text. (Until 2026-09-02 there was a second reason:
// aeon's generator refused both keys by name. It no longer does — item 5 is
// MERGED on aeon's master, not certified, see core/formats/effects/preset-lag.ts
// — but nothing in THIS file could measure a ROM either way.)

import { describe, it, expect } from 'vitest';
import {
  cyclesState, setCyclesStateCommand, addCycleChannelCommand, removeCycleChannelCommand,
  setCycleFieldCommand, newCycleChannel, emptyCyclesAdvisory, EMPTY_CYCLES_ADVISORY,
  CYCLES_STATE_OPTIONS, CYCLES_TITLE, cycleFieldTitle,
  variantsState, setVariantsStateCommand, variantSlotState, variantSlotIndices,
  setVariantSlotStateCommand, setVariantFieldCommand, toggleVariantLineCommand,
  variantFieldSeed, variantLineOn, VARIANT_FIELDS, VARIANTS_STATE_OPTIONS, VARIANT_SLOT_OPTIONS,
  VARIANTS_TITLE, variantFieldTitle, CRAM_LINES,
  newPreset,
} from '../effects-preset';
import {
  serializeEffectsPreset, parseEffectsPreset, presetDefFields, EFFECTS_PRESET_SCHEMA,
} from '../../../core/formats/effects/preset';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { SetEffectsPresetCommand } from '../../../core/editing/commands';

function library(p: EffectsPreset): EffectsPresetLibrary {
  return { presets: [p], unreadable: [], notices: [] };
}

/** Apply a command's `newPreset`, or throw loudly — a null here is a no-op the row did not ask for. */
function after(c: SetEffectsPresetCommand | null): EffectsPreset {
  expect(c, 'the gesture produced no command (a no-op) where the row expected a change').not.toBeNull();
  expect(c!.type).toBe('set-effects-preset');
  expect(c!.newPreset).not.toBeNull();
  return c!.newPreset!;
}

const ID = 'vc_probe';

// ═══════════════════════════════════════════════════════════════════════════
// cycles — three states, one spelling each
// ═══════════════════════════════════════════════════════════════════════════

describe('cycles: the three spellings are told apart and authored exactly', () => {
  it('reads absent, null and array as three different states', () => {
    expect(cyclesState(newPreset(ID))).toBe('absent');
    expect(cyclesState({ ...newPreset(ID), cycles: null })).toBe('off');
    expect(cyclesState({ ...newPreset(ID), cycles: [] })).toBe('authored');
    expect(cyclesState({ ...newPreset(ID), cycles: [newCycleChannel()] })).toBe('authored');
  });

  it('the picker offers exactly the three states, each labelled with what it writes', () => {
    expect(CYCLES_STATE_OPTIONS.map((o) => o.value)).toEqual(['absent', 'off', 'authored']);
    expect(CYCLES_STATE_OPTIONS.find((o) => o.value === 'absent')!.label).toMatch(/absent/);
    expect(CYCLES_STATE_OPTIONS.find((o) => o.value === 'off')!.label).toMatch(/null/);
    expect(CYCLES_STATE_OPTIONS.find((o) => o.value === 'authored')!.label).toMatch(/array/);
  });

  it('absent → off writes null (the key present, the value null)', () => {
    const p = after(setCyclesStateCommand(library(newPreset(ID)), ID, 'off'));
    expect('cycles' in p).toBe(true);
    expect(p.cycles).toBeNull();
  });

  it('absent → authored seeds ONE channel, never an empty array', () => {
    const p = after(setCyclesStateCommand(library(newPreset(ID)), ID, 'authored'));
    expect(Array.isArray(p.cycles)).toBe(true);
    expect(p.cycles).toHaveLength(1);
    expect(p.cycles![0]).toEqual(newCycleChannel());
  });

  it('off → absent DELETES the key rather than writing undefined', () => {
    const p = after(setCyclesStateCommand(library({ ...newPreset(ID), cycles: null }), ID, 'absent'));
    expect('cycles' in p).toBe(false);
    expect(Object.keys(p)).not.toContain('cycles');
  });

  it('authored → off writes null and drops the script (one undo step)', () => {
    const start = { ...newPreset(ID), cycles: [newCycleChannel(), newCycleChannel()] };
    const c = setCyclesStateCommand(library(start), ID, 'off');
    const p = after(c);
    expect(p.cycles).toBeNull();
    expect(c!.oldPreset!.cycles).toHaveLength(2);
  });

  it('authored → absent deletes the key', () => {
    const p = after(setCyclesStateCommand(library({ ...newPreset(ID), cycles: [newCycleChannel()] }), ID, 'absent'));
    expect('cycles' in p).toBe(false);
  });

  it('re-picking the current state is a no-op: no command, no undo slot', () => {
    expect(setCyclesStateCommand(library(newPreset(ID)), ID, 'absent')).toBeNull();
    expect(setCyclesStateCommand(library({ ...newPreset(ID), cycles: null }), ID, 'off')).toBeNull();
    // authored → authored keeps the author's script exactly, seeds nothing.
    const two = { ...newPreset(ID), cycles: [newCycleChannel(), { line: 3, first: 0, count: 2, period: 1, dir: 1 }] };
    expect(setCyclesStateCommand(library(two), ID, 'authored')).toBeNull();
  });

  it('an EMPTY array is kept as `[]`, never rewritten as null or absence, and is advised on', () => {
    const one = { ...newPreset(ID), cycles: [newCycleChannel()] };
    const p = after(removeCycleChannelCommand(library(one), ID, 0));
    expect(Array.isArray(p.cycles)).toBe(true);
    expect(p.cycles).toEqual([]);
    expect(cyclesState(p)).toBe('authored');
    // The advisory is the schema's own sentence, not one of Aurora's.
    const advisory = emptyCyclesAdvisory(p);
    expect(advisory).toBe(EMPTY_CYCLES_ADVISORY);
    expect(CYCLES_TITLE).toContain(advisory!);
    expect(advisory).toMatch(/EMPTY array is legal JSON here/);
    expect(advisory).toMatch(/generator/);
    // ...and it says nothing when the array has members, or is null/absent.
    expect(emptyCyclesAdvisory(one)).toBeNull();
    expect(emptyCyclesAdvisory({ ...newPreset(ID), cycles: null })).toBeNull();
    expect(emptyCyclesAdvisory(newPreset(ID))).toBeNull();
    // From `[]`, picking "authored" again is a no-op: the array is the author's.
    expect(setCyclesStateCommand(library(p), ID, 'authored')).toBeNull();
  });

  it('add appends a seed channel; add on null/absent writes nothing', () => {
    const one = { ...newPreset(ID), cycles: [newCycleChannel()] };
    expect(after(addCycleChannelCommand(library(one), ID)).cycles).toHaveLength(2);
    expect(addCycleChannelCommand(library({ ...newPreset(ID), cycles: null }), ID)).toBeNull();
    expect(addCycleChannelCommand(library(newPreset(ID)), ID)).toBeNull();
  });

  it('the seed channel writes every required field and not the optional one', () => {
    const { required, optional } = presetDefFields('cycle_channel');
    const seed = newCycleChannel() as unknown as Record<string, unknown>;
    expect(Object.keys(seed).sort()).toEqual([...required].sort());
    for (const f of optional) expect(f in seed).toBe(false);
    expect(optional).toEqual(['dir']);
  });

  it('sets every field verbatim — no bound, no rounding — including values the engine will refuse', () => {
    const one = { ...newPreset(ID), cycles: [newCycleChannel()] };
    // line 0 is the character's and the constructor refuses it; period 0 and
    // a negative count are outside every ensure. All three are FORWARDED: the
    // author reads the engine's sentence, not Aurora's silence (aeon E.4).
    for (const [field, value] of [['line', 0], ['period', 0], ['count', -5], ['first', 99]] as const) {
      const p = after(setCycleFieldCommand(library(one), ID, 0, field, value));
      expect((p.cycles![0] as unknown as Record<string, number>)[field]).toBe(value);
    }
  });

  it('dir — the only optional field — can be set and UNSET, and a required field cannot be unset', () => {
    const one = { ...newPreset(ID), cycles: [newCycleChannel()] };
    const withDir = after(setCycleFieldCommand(library(one), ID, 0, 'dir', 1));
    expect(withDir.cycles![0].dir).toBe(1);
    const without = after(setCycleFieldCommand(library(withDir), ID, 0, 'dir', undefined));
    expect('dir' in without.cycles![0]).toBe(false);
    expect(setCycleFieldCommand(library(one), ID, 0, 'line', undefined)).toBeNull();
    expect(setCycleFieldCommand(library(one), ID, 0, 'nope', 1)).toBeNull();
  });

  it('field titles are the schema\'s descriptions, verbatim', () => {
    const props = (EFFECTS_PRESET_SCHEMA as unknown as { $defs: Record<string, { properties: Record<string, { description: string }> }> })
      .$defs.cycle_channel.properties;
    for (const f of Object.keys(props)) expect(cycleFieldTitle(f)).toBe(props[f].description);
    expect(CYCLES_TITLE).toBe((EFFECTS_PRESET_SCHEMA as unknown as { properties: Record<string, { description: string }> })
      .properties.cycles.description);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// variants — positional, three states per index
// ═══════════════════════════════════════════════════════════════════════════

describe('variants: absent key, unreached slot, null slot, authored slot — all distinct', () => {
  it('reads the key state and every slot state the schema names', () => {
    expect(variantsState(newPreset(ID))).toBe('absent');
    expect(variantsState({ ...newPreset(ID), variants: [] })).toBe('present');
    const p = { ...newPreset(ID), variants: [null, { shift_r: 1 }] };
    expect(variantSlotState(p, 0)).toBe('cleared');
    expect(variantSlotState(p, 1)).toBe('authored');
    expect(variantSlotState(p, 2)).toBe('unreached');
    expect(variantSlotState(newPreset(ID), 0)).toBe('unreached');
  });

  it('the pickers offer exactly the states, labelled with what they write', () => {
    expect(VARIANTS_STATE_OPTIONS.map((o) => o.value)).toEqual(['absent', 'present']);
    expect(VARIANT_SLOT_OPTIONS.map((o) => o.value)).toEqual(['unreached', 'cleared', 'authored']);
    expect(VARIANT_SLOT_OPTIONS.find((o) => o.value === 'cleared')!.label).toMatch(/null/);
    expect(VARIANT_SLOT_OPTIONS.find((o) => o.value === 'unreached')!.label).toMatch(/hand/);
  });

  it('absent → present writes `[]` (the key, reaching no slot); present → absent deletes the key', () => {
    const p = after(setVariantsStateCommand(library(newPreset(ID)), ID, 'present'));
    expect('variants' in p).toBe(true);
    expect(p.variants).toEqual([]);
    const back = after(setVariantsStateCommand(library(p), ID, 'absent'));
    expect('variants' in back).toBe(false);
    // Re-picking is a no-op either way.
    expect(setVariantsStateCommand(library(newPreset(ID)), ID, 'absent')).toBeNull();
    expect(setVariantsStateCommand(library(p), ID, 'present')).toBeNull();
    // `[]` and absent are different documents on the wire.
    expect(serializeEffectsPreset(p)).not.toBe(serializeEffectsPreset(back));
  });

  it('draws every reached slot plus one to extend into, and no count beyond that', () => {
    expect(variantSlotIndices(newPreset(ID))).toEqual([0]);
    expect(variantSlotIndices({ ...newPreset(ID), variants: [] })).toEqual([0]);
    expect(variantSlotIndices({ ...newPreset(ID), variants: [null, {}] })).toEqual([0, 1, 2]);
  });

  it('extending slot 0: cleared writes [null]; authored writes [{}] — an object with no invented numbers', () => {
    const empty = { ...newPreset(ID), variants: [] };
    const cleared = after(setVariantSlotStateCommand(library(empty), ID, 0, 'cleared'));
    expect(cleared.variants).toEqual([null]);
    const authored = after(setVariantSlotStateCommand(library(empty), ID, 0, 'authored'));
    expect(authored.variants).toEqual([{}]);
  });

  it('clearing both slots is [null, null] — the schema\'s own spelling; there is no key-level null', () => {
    const one = after(setVariantSlotStateCommand(library({ ...newPreset(ID), variants: [] }), ID, 0, 'cleared'));
    const two = after(setVariantSlotStateCommand(library(one), ID, 1, 'cleared'));
    expect(two.variants).toEqual([null, null]);
    expect(serializeEffectsPreset(two)).toContain('"variants": [\n    null,\n    null\n  ]');
  });

  it('authored → cleared replaces the object with null; cleared → authored replaces null with {}', () => {
    const p = { ...newPreset(ID), variants: [{ shift_r: 1, shift_g: 1 }] };
    const cleared = after(setVariantSlotStateCommand(library(p), ID, 0, 'cleared'));
    expect(cleared.variants).toEqual([null]);
    const authored = after(setVariantSlotStateCommand(library(cleared), ID, 0, 'authored'));
    expect(authored.variants).toEqual([{}]);
    // Re-picking authored on an authored slot keeps the author's object.
    expect(setVariantSlotStateCommand(library(p), ID, 0, 'authored')).toBeNull();
  });

  it('unreached ENDS the array at that slot: later slots go with it, in one command', () => {
    const p = { ...newPreset(ID), variants: [{ shift_r: 1 }, null, { lines: 2 }] };
    const c = setVariantSlotStateCommand(library(p), ID, 1, 'unreached');
    const q = after(c);
    expect(q.variants).toEqual([{ shift_r: 1 }]);
    expect(c!.oldPreset!.variants).toHaveLength(3);
    // The key itself stays: an array reaching fewer slots is not an absent key.
    const first = after(setVariantSlotStateCommand(library(q), ID, 0, 'unreached'));
    expect('variants' in first).toBe(true);
    expect(first.variants).toEqual([]);
    // Already-unreached is a no-op, and a hole cannot be authored.
    expect(setVariantSlotStateCommand(library(q), ID, 1, 'unreached')).toBeNull();
    expect(setVariantSlotStateCommand(library(q), ID, 5, 'cleared')).toBeNull();
    expect(setVariantSlotStateCommand(library(newPreset(ID)), ID, 0, 'cleared')).toBeNull();
  });

  it('every variant field is optional, and each can be set verbatim and unset back to absence', () => {
    expect([...VARIANT_FIELDS]).toEqual(presetDefFields('pal_variant').optional);
    expect(presetDefFields('pal_variant').required).toEqual([]);
    const p = { ...newPreset(ID), variants: [{}] };
    for (const f of VARIANT_FIELDS) {
      // Out-of-ensure values (a shift of 9, a bias of -40) are FORWARDED.
      const set = after(setVariantFieldCommand(library(p), ID, 0, f, f.startsWith('shift') ? 9 : -40));
      expect((set.variants![0] as Record<string, number>)[f]).toBe(f.startsWith('shift') ? 9 : -40);
      const unset = after(setVariantFieldCommand(library(set), ID, 0, f, undefined));
      expect(f in (unset.variants![0] as object)).toBe(false);
      expect(setVariantFieldCommand(library(set), ID, 0, f, undefined)).not.toBeNull();
    }
    expect(setVariantFieldCommand(library(p), ID, 0, 'v_pad', 0)).toBeNull();
    // A null slot takes no field.
    expect(setVariantFieldCommand(library({ ...newPreset(ID), variants: [null] }), ID, 0, 'shift_r', 1)).toBeNull();
  });

  it('the shipped deep-water spelling {shift_r: 1, shift_g: 1} survives a set of a third field untouched', () => {
    const p = { ...newPreset(ID), variants: [{ shift_r: 1, shift_g: 1 }] };
    const q = after(setVariantFieldCommand(library(p), ID, 0, 'bias_b', -2));
    expect(q.variants![0]).toEqual({ shift_r: 1, shift_g: 1, bias_b: -2 });
  });

  it('`lines` is the integer bitmask on the wire; the checkbox spelling flips ONE bit and keeps the rest', () => {
    expect(CRAM_LINES).toEqual([0, 1, 2, 3]);
    expect(variantFieldSeed('lines')).toBe(14);
    expect(variantLineOn(14, 0)).toBe(false);
    expect(variantLineOn(14, 1)).toBe(true);
    const p = { ...newPreset(ID), variants: [{ lines: 14 }] };
    const off2 = after(toggleVariantLineCommand(library(p), ID, 0, 2));
    expect(off2.variants![0]).toEqual({ lines: 10 });
    expect(typeof off2.variants![0]!.lines).toBe('number');
    // Line 0 is toggleable — the constructor refuses it, Aurora forwards it.
    const on0 = after(toggleVariantLineCommand(library(p), ID, 0, 0));
    expect(on0.variants![0]).toEqual({ lines: 15 });
    // A hand-written mask with bits above line 3 keeps them across a toggle.
    const high = { ...newPreset(ID), variants: [{ lines: 0b10110 }] };
    expect(after(toggleVariantLineCommand(library(high), ID, 0, 1)).variants![0]).toEqual({ lines: 0b10100 });
    // No `lines` key: nothing to toggle, nothing invented.
    expect(toggleVariantLineCommand(library({ ...newPreset(ID), variants: [{}] }), ID, 0, 1)).toBeNull();
  });

  it('field titles are the schema\'s descriptions, verbatim', () => {
    const props = (EFFECTS_PRESET_SCHEMA as unknown as { $defs: Record<string, { properties: Record<string, { description: string }> }> })
      .$defs.pal_variant.properties;
    for (const f of Object.keys(props)) expect(variantFieldTitle(f)).toBe(props[f].description);
    expect(VARIANTS_TITLE).toBe((EFFECTS_PRESET_SCHEMA as unknown as { properties: Record<string, { description: string }> })
      .properties.variants.description);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The file — an untouched preset is byte-identical; each state round-trips
// ═══════════════════════════════════════════════════════════════════════════

describe('round trip: what the panel does not touch, it does not change', () => {
  const ABSENT_BOTH = serializeEffectsPreset({ schema: 1, id: ID, bands: newPreset(ID).bands });

  it('a preset opened with both keys ABSENT and saved untouched is byte-identical', () => {
    const opened = parseEffectsPreset(ABSENT_BOTH, ID);
    expect('cycles' in opened).toBe(false);
    expect('variants' in opened).toBe(false);
    expect(serializeEffectsPreset(opened)).toBe(ABSENT_BOTH);
    expect(ABSENT_BOTH).not.toMatch(/cycles|variants/);
  });

  it('a no-op gesture on every control leaves the bytes alone', () => {
    const opened = parseEffectsPreset(ABSENT_BOTH, ID);
    const lib = library(opened);
    expect(setCyclesStateCommand(lib, ID, 'absent')).toBeNull();
    expect(setVariantsStateCommand(lib, ID, 'absent')).toBeNull();
    expect(setVariantSlotStateCommand(lib, ID, 0, 'unreached')).toBeNull();
    expect(addCycleChannelCommand(lib, ID)).toBeNull();
    expect(serializeEffectsPreset(lib.presets[0])).toBe(ABSENT_BOTH);
  });

  it('every spelling of both keys survives serialize → parse → serialize unchanged', () => {
    const spellings: Partial<EffectsPreset>[] = [
      {},
      { cycles: null },
      { cycles: [] },
      { cycles: [newCycleChannel()] },
      { cycles: [{ line: 1, first: 0, count: 2, period: 1, dir: 1 }, newCycleChannel()] },
      { variants: [] },
      { variants: [null] },
      { variants: [null, null] },
      { variants: [{}] },
      { variants: [{ shift_r: 1, shift_g: 1 }, null] },
      { variants: [{ lines: 14, bias_b: -3 }, { shift_b: 2 }] },
      { cycles: null, variants: [null, {}] },
    ];
    for (const s of spellings) {
      const p: EffectsPreset = { ...newPreset(ID), ...s };
      const text = serializeEffectsPreset(p);
      const back = parseEffectsPreset(text, ID);
      expect(serializeEffectsPreset(back), JSON.stringify(s)).toBe(text);
      expect('cycles' in back, JSON.stringify(s)).toBe('cycles' in s);
      expect('variants' in back, JSON.stringify(s)).toBe('variants' in s);
      expect(back.cycles, JSON.stringify(s)).toEqual(s.cycles);
      expect(back.variants, JSON.stringify(s)).toEqual(s.variants);
    }
  });

  it('the three cycles spellings serialize to three different texts, and so do the variants spellings', () => {
    const texts = ['absent', 'off', 'authored'].map((state) => {
      const lib = library(newPreset(ID));
      const c = setCyclesStateCommand(lib, ID, state as 'absent' | 'off' | 'authored');
      return serializeEffectsPreset(c ? c.newPreset! : lib.presets[0]);
    });
    expect(new Set(texts).size).toBe(3);
    expect(texts[1]).toContain('"cycles": null');
    expect(texts[2]).toContain('"cycles": [');
    expect(texts[0]).not.toContain('cycles');

    const slotTexts = ['unreached', 'cleared', 'authored'].map((state) => {
      const lib = library({ ...newPreset(ID), variants: [] });
      const c = setVariantSlotStateCommand(lib, ID, 0, state as 'unreached' | 'cleared' | 'authored');
      return serializeEffectsPreset(c ? c.newPreset! : lib.presets[0]);
    });
    expect(new Set(slotTexts).size).toBe(3);
    expect(slotTexts[0]).toContain('"variants": []');
    expect(slotTexts[1]).toContain('"variants": [\n    null\n  ]');
    expect(slotTexts[2]).toContain('"variants": [\n    {}\n  ]');
  });

  /**
   * ═══ THE ITEM-4 KEYS THROUGH THE PROVIDER'S OWN PATHS ═══
   *
   * empyrean d36d704 / §7.3. There is no CONTROL for `patch_world_ys` or
   * `patch_motion` — the sliders are EW-TIMELINE-CLOCK's row, not this parcel's
   * — but the provider is where an `EffectsPreset` is CONSTRUCTED (`newPreset`)
   * and CLONED (`clonePreset`, through every command factory), and the lesson
   * this repo paid 13-ref-sites for is that a field dropped by a copier outside
   * the codec frame survives a suite the codec's own round-trip passes. So the
   * two paths a preset takes through this module are asserted directly.
   */
  it('newPreset authors NEITHER item-4 key — absent is a state, not a gap to fill', () => {
    const fresh = newPreset(ID);
    expect('patch_world_ys' in fresh).toBe(false);
    expect('patch_motion' in fresh).toBe(false);
    // An index the array does not reach keeps the section's hand-authored
    // channel. A new document has nothing to say about a channel nobody touched,
    // and a padded `[null, null, null, null]` would say "all four unused".
    expect(serializeEffectsPreset(fresh)).not.toMatch(/patch_/);
  });

  it('both item-4 keys survive every command factory\'s clone, in all three states', () => {
    const seeded: EffectsPreset = {
      ...newPreset(ID),
      patch_world_ys: [224, null],
      patch_motion: [{ sweep: { amp_shift: 4, period_shift: 1 } }, null],
    };
    const before = serializeEffectsPreset(seeded);
    // A command factory that touches an unrelated channel: the item-4 keys ride
    // through `clonePreset` untouched, at their own lengths, nulls in place.
    const lib = library(seeded);
    const cmd = setCyclesStateCommand(lib, ID, 'off')!;
    expect(cmd.newPreset!.patch_world_ys).toEqual([224, null]);
    expect(cmd.newPreset!.patch_motion).toEqual([{ sweep: { amp_shift: 4, period_shift: 1 } }, null]);
    // ...and the OLD side of the undo record carries them too, so an undo
    // restores the channels rather than dropping them.
    expect(serializeEffectsPreset(cmd.oldPreset!)).toBe(before);
    // The written bytes differ only by the `cycles` key the gesture set.
    const after = serializeEffectsPreset(cmd.newPreset!);
    expect(after).toContain('"cycles": null');
    expect(after.replace(/ {2}"cycles": null,\n/, '')).toBe(before);
  });
});
