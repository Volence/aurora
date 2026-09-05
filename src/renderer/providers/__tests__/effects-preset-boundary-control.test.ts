// ═══════════════════════════════════════════════════════════════════════════
// THE `boundary` AUTHORING SURFACE — EW-BOUNDARY-PANEL
// ═══════════════════════════════════════════════════════════════════════════
//
// The codec parcel (EW-BOUNDARY-CODEC) taught the panel to REFUSE on a boundary
// document. This file is about the other half: a person can now create one, set
// every field, and save it. `test/formats/effects-preset-boundary.test.ts` is
// the codec's rows and is not repeated here.
//
// ═══ ⚠ THE ROW THAT MATTERS MOST IS THE ONE THAT ASSERTS A **NON**-REFUSAL ═══
//
// `lo <= hi` and `line` inside `[lo, hi]` are the GENERATOR's by the CR's
// ruling; the schema accepts both violations and so does the codec, and
// `boundary.ts`'s header says nothing in it may become the ONLY check. A control
// that refused either would be refusing a document the contract accepts — and it
// would look like diligence. So `lo > hi` is asserted WRITABLE, with the
// advisory as the consequence. A file that only checked refusals would be green
// for a panel that had quietly become the enforcer.
//
// ═══ ⚠ AND THE SEED IS RE-PARSED FROM THE SCHEMA BYTES, NOT IMPORTED ═══
//
// `newBoundary()` reads the contract's own quoted shipped-water call. Asserting
// it against a constant this file imports from the same module would be reading
// one derivation back to itself. The expected values below are parsed HERE, out
// of the raw schema JSON, by an independent regex — two readers of one sentence.
// Four of the eight numbers (slot, pal_line, entry, count) have NO declared
// range, so nothing else in the suite could catch a wrong value for them.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  newBoundary, newPreset,
  BOUNDARY_ON_ARM, BOUNDARY_WHAT_YOU_SEE, BOUNDARY_SEED_ADVISORY,
  BOUNDARY_BOUNDED_FIELDS, BOUNDARY_OFFSCREEN_SHIP_OPTIONS,
  boundaryFieldRefusal, boundaryTintRefusal, boundarySummary,
  boundaryAdvisoriesFor, boundaryAdvisoryAttribution, boundaryOffscreenShipState,
  setBoundaryFieldCommand, setBoundaryTintCommand, setBoundaryShCommand,
  setBoundaryOffscreenShipCommand, setProgramArmCommand,
  PROGRAM_ARM_OPTIONS, programArmSeedRefusal, programArmRowTitle,
  type BoundaryNumberField,
} from '../effects-preset';
import {
  EFFECTS_PRESET_BOUNDARY_KEYS, EFFECTS_PRESET_TINT_REGION_KEYS,
  EFFECTS_PRESET_BOUNDARY_LINE_RANGE, EFFECTS_PRESET_BOUNDARY_LO_RANGE,
  EFFECTS_PRESET_BOUNDARY_HI_RANGE, EFFECTS_PRESET_BOUNDARY_CHANNEL_RANGE,
  EFFECTS_PRESET_MAX_PATCH,
  serializeEffectsPreset, parseEffectsPreset, presetProgramArm,
  type EffectsPreset, type EffectsPresetBoundary, type EffectsPresetLibrary,
} from '../../../core/formats/effects/preset';

const ID = 'probe';
const lib = (p: EffectsPreset): EffectsPresetLibrary =>
  ({ presets: [p], unreadable: [] } as unknown as EffectsPresetLibrary);

/** A boundary document of this file's own making, through the panel's own switch. */
function boundaryDoc(): EffectsPreset {
  const cmd = setProgramArmCommand(lib({ schema: 1, id: ID } as EffectsPreset), ID, 'boundary');
  if (cmd === null || !cmd.newPreset) throw new Error('the Program row has no seed for boundary');
  return cmd.newPreset;
}

const boundaryOf = (p: EffectsPreset): EffectsPresetBoundary => {
  if (!p.boundary) throw new Error('document carries no boundary');
  return p.boundary;
};
const regionOf = (b: EffectsPresetBoundary): Record<string, number> =>
  (b.on as unknown as Record<string, Record<string, number>>)[BOUNDARY_ON_ARM];

// ═══ THE INDEPENDENT READING OF THE SHIPPED WATER ═══
const SCHEMA_PATH = join(
  __dirname, '..', '..', '..', 'core', 'formats', 'effects', 'aurora-effects-preset.schema.json',
);
const SHIPPED: Record<string, number> = (() => {
  const raw = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
    $defs: { boundary: { description: string } };
  };
  const call = /patchable\(fx_tint_band\(([^)]*)\)([^)]*)\)/.exec(raw.$defs.boundary.description);
  if (!call) throw new Error('the schema no longer quotes the shipped water as a patchable() call');
  const out: Record<string, number> = {};
  for (const m of `${call[1]}${call[2]}`.matchAll(/([a-z_]+):\s*(\d+)/g)) out[m[1]] = Number(m[2]);
  return out;
})();

// ---------------------------------------------------------------------------
// 1. The seed
// ---------------------------------------------------------------------------

describe('a fresh boundary is aeon\'s shipped moving water, not a number this editor chose', () => {
  it('every field equals the contract\'s own quoted call, re-parsed from the schema bytes', () => {
    const b = newBoundary();
    // Anti-vacuous: the independent parse really found the call, with values.
    expect(Object.keys(SHIPPED).length).toBeGreaterThanOrEqual(9);
    expect(b.line).toBe(SHIPPED.line);
    expect(b.channel).toBe(SHIPPED.ch);
    expect(b.lo).toBe(SHIPPED.lo);
    expect(b.hi).toBe(SHIPPED.hi);
    expect(b.sh).toBe(SHIPPED.sh);
    expect(b.offscreen_ship).toBe(SHIPPED.offscreen_ship);
    for (const k of EFFECTS_PRESET_TINT_REGION_KEYS) {
      expect(regionOf(b)[k], `tint region ${k}`).toBe(SHIPPED[k]);
    }
  });

  it('writes every required member and no member the object does not declare', () => {
    const b = newBoundary();
    expect(Object.keys(b).sort())
      .toEqual([...EFFECTS_PRESET_BOUNDARY_KEYS, 'offscreen_ship'].sort());
    expect(Object.keys(regionOf(b)).sort()).toEqual([...EFFECTS_PRESET_TINT_REGION_KEYS].sort());
    // ⚠ AND NO `addr`. `$defs.tint_region` exists precisely because
    // `fx_tint_band` DERIVES the CRAM address; a seed carrying one would be one
    // fact with two sources and the codec refuses it by closure.
    expect(regionOf(b).addr).toBeUndefined();
  });

  /**
   * ⚠ A SEED MUST NOT BE BORN ILLEGAL — `newBand`'s rule — and this one must not
   * be born earning a cross-field warning it could have avoided either. The ONE
   * sentence it may earn is `no-motion`, which is deliberate: a fresh boundary
   * IS still, and that is how an author finds out.
   */
  it('is legal by construction, and earns exactly one advisory — the deliberate one', () => {
    const p = boundaryDoc();
    expect(() => serializeEffectsPreset(p)).not.toThrow();
    expect(parseEffectsPreset(serializeEffectsPreset(p), ID).boundary).toEqual(newBoundary());
    const rules = boundaryAdvisoriesFor(p).map((a) => a.rule);
    expect(rules).toEqual(['no-motion']);
    // The module-load guard states the same thing; this row proves the guard is
    // asserting a fact and not a tautology about itself.
    expect(BOUNDARY_SEED_ADVISORY).toBe('no-motion');
  });

  /**
   * A NEW OBJECT EVERY CALL, and the nesting is why this row exists: a shared
   * `on` object would give two presets ONE region, so editing either would edit
   * both, silently, and every shape check above would still pass.
   */
  it('is a fresh nested object each call', () => {
    const a = newBoundary();
    const b = newBoundary();
    expect(a).toEqual(b);
    regionOf(a).count = 99;
    expect(regionOf(b).count, 'two fresh boundaries share one tint region object').not.toBe(99);
  });
});

// ---------------------------------------------------------------------------
// 2. The Program row
// ---------------------------------------------------------------------------

describe('the Program row offers the fourth arm, and says what it is', () => {
  it('offers `boundary`, authorable, labelled as the patched arm it is', () => {
    const option = PROGRAM_ARM_OPTIONS.find((o) => o.value === 'boundary');
    expect(option, 'the Program row does not offer `boundary`').toBeDefined();
    expect(option!.label).not.toMatch(/not authorable/);
    // The label carries the classification, and `PROGRAM_ARM_OPTIONS` asserts at
    // module load that it agrees with the schema-derived one. This row pins that
    // the tag is really in the label the dropdown paints, so that guard is
    // comparing two things a reader can see.
    expect(option!.label).toContain('(patched, not raster)');
    expect(programArmSeedRefusal('boundary')).toBeNull();
  });

  it('the row\'s hover text follows the document instead of always explaining the ramp', () => {
    const onBoundary = programArmRowTitle(boundaryDoc());
    const onBands = programArmRowTitle(newPreset(ID));
    expect(onBoundary).not.toBe('');
    expect(onBoundary).not.toBe(onBands);
    expect(onBoundary).toMatch(/ep_patched/);
  });
});

// ---------------------------------------------------------------------------
// 3. The four bounded fields
// ---------------------------------------------------------------------------

describe('the four bounded fields refuse out of range and accept inside it', () => {
  const FIELDS: BoundaryNumberField[] = ['line', 'channel', 'lo', 'hi'];

  it('every bound is the schema\'s, and none is retyped here', () => {
    expect(BOUNDARY_BOUNDED_FIELDS.line).toEqual(EFFECTS_PRESET_BOUNDARY_LINE_RANGE);
    expect(BOUNDARY_BOUNDED_FIELDS.channel).toEqual(EFFECTS_PRESET_BOUNDARY_CHANNEL_RANGE);
    expect(BOUNDARY_BOUNDED_FIELDS.lo).toEqual(EFFECTS_PRESET_BOUNDARY_LO_RANGE);
    expect(BOUNDARY_BOUNDED_FIELDS.hi).toEqual(EFFECTS_PRESET_BOUNDARY_HI_RANGE);
    // The channel range is RASTER_MAX_PATCH stated a second way; the codec
    // asserts they agree, and this pins that this file is reading the same one.
    expect(BOUNDARY_BOUNDED_FIELDS.channel.max).toBe(EFFECTS_PRESET_MAX_PATCH - 1);
  });

  for (const field of FIELDS) {
    it(`${field}: below the minimum, above the maximum and non-integer are all refused, and the `
      + 'document does not move', () => {
      const p = boundaryDoc();
      const r = BOUNDARY_BOUNDED_FIELDS[field];
      const held = boundaryOf(p)[field];
      for (const bad of [r.min - 1, r.max + 1, 1.5]) {
        const why = boundaryFieldRefusal(boundaryOf(p), ID, field, bad);
        expect(why, `${field} accepted ${bad}`).not.toBeNull();
        expect(why!).toContain(String(held));
        expect(why!).not.toContain('undefined');
        // ...and the COMMAND is a no-op, so the sentence is not describing a
        // refusal that does not happen.
        const cmd = setBoundaryFieldCommand(lib(p), ID, field, bad);
        expect(cmd, `${field} = ${bad} produced a command`).toBeNull();
      }
      // ANTI-VACUOUS PARTNER: both ends of the declared range are accepted, so
      // the rows above measured a refusal and not a dead field.
      //
      // ⚠ A VALUE THE DOCUMENT ALREADY HOLDS IS SKIPPED, NOT ASSERTED AS A
      // COMMAND. `editPresetCommand` returns null when nothing moved — burning
      // no undo slot is correct and is asserted elsewhere — so a range endpoint
      // that happens to be the seed's own value (lo's minimum IS 3, channel's is
      // 0) would fail this row for the opposite of the reason it is written for.
      for (const good of [r.min, r.max]) {
        expect(boundaryFieldRefusal(boundaryOf(p), ID, field, good)).toBeNull();
        if (good === held) continue;
        const cmd = setBoundaryFieldCommand(lib(p), ID, field, good);
        expect(cmd, `${field} = ${good} was refused`).not.toBeNull();
        expect(boundaryOf(cmd!.newPreset!)[field]).toBe(good);
      }
    });
  }

  /**
   * ═══ ⚠ THE NON-REFUSAL, WHICH IS THE ROW THIS FILE EXISTS FOR ═══
   *
   * `lo <= hi` and `line ∈ [lo, hi]` are the GENERATOR's. The schema accepts
   * both violations, the codec accepts both, and `boundary.ts` says nothing in
   * it may become the only check. A control that refused either would look like
   * diligence and would be refusing a document the contract accepts — and every
   * other row in this file would stay green through it.
   */
  it('does NOT refuse the two cross-field rules — it warns, and the document still saves', () => {
    const p = boundaryDoc();
    const r = EFFECTS_PRESET_BOUNDARY_LO_RANGE;
    // An inverted band: lo above hi. Written through the real command.
    const inverted = setBoundaryFieldCommand(lib(p), ID, 'lo', r.max)!;
    expect(inverted, 'the control refused lo > hi — Aurora has become the enforcer of a rule the '
      + 'contract assigns to the generator, and is now refusing documents the contract accepts')
      .not.toBeNull();
    const bad = inverted.newPreset!;
    expect(boundaryOf(bad).lo).toBeGreaterThan(boundaryOf(bad).hi);
    // ⚠ SAVING IS NOT BLOCKED. The codec accepts it too, which is what makes the
    // advisory a warning rather than theatre.
    expect(() => serializeEffectsPreset(bad)).not.toThrow();
    const rules = boundaryAdvisoriesFor(bad).map((a) => a.rule);
    expect(rules, 'an inverted band produced no lo-hi advisory, so nothing anywhere would tell '
      + 'the author').toContain('lo-hi');
  });
});

// ---------------------------------------------------------------------------
// 4. The four UNBOUNDED fields
// ---------------------------------------------------------------------------

describe('the tint region\'s four members have no range, and the panel does not invent one', () => {
  it('refuses non-integers only, and SAYS the range is the engine\'s', () => {
    const p = boundaryDoc();
    const region = regionOf(boundaryOf(p)) as unknown as never;
    for (const f of EFFECTS_PRESET_TINT_REGION_KEYS) {
      const why = boundaryTintRefusal(region, ID, f, 2.5);
      expect(why, `${f} accepted a fraction`).not.toBeNull();
      expect(why!).toMatch(/NO range for this field on purpose/);
      expect(why!).not.toContain('undefined');
    }
  });

  /**
   * ⚠ THE ROW THAT WOULD CATCH AN INVENTED MAXIMUM. A control that had decided
   * `entry` is 0..15 would refuse this and every "it refuses" row above would
   * still pass. The value is deliberately large and deliberately not a contract
   * number: what is asserted is that NOTHING here bounds these fields, because
   * the contract does not.
   */
  it('accepts a value no schema keyword bounds, and writes it', () => {
    const p = boundaryDoc();
    for (const f of EFFECTS_PRESET_TINT_REGION_KEYS) {
      expect(boundaryTintRefusal(regionOf(boundaryOf(p)) as unknown as never, ID, f, 4242)).toBeNull();
      const cmd = setBoundaryTintCommand(lib(p), ID, f, 4242);
      expect(cmd, `${f} = 4242 produced no command — something here has invented a range`)
        .not.toBeNull();
      expect(regionOf(boundaryOf(cmd!.newPreset!))[f]).toBe(4242);
    }
  });

  it('refuses a member the contract does not declare', () => {
    const p = boundaryDoc();
    expect(boundaryTintRefusal(regionOf(boundaryOf(p)) as unknown as never, ID, 'addr', 0))
      .toMatch(/not a member/);
  });
});

// ---------------------------------------------------------------------------
// 5. The two flags
// ---------------------------------------------------------------------------

describe('the two boolean-or-0/1 fields keep the document\'s own spelling', () => {
  it('sh: an integer document stays integers, a boolean document stays booleans', () => {
    const p = boundaryDoc();
    // The seed is parsed from `sh: 1`, so it is an integer document.
    expect(typeof boundaryOf(p).sh).toBe('number');
    const off = setBoundaryShCommand(lib(p), ID, false)!;
    expect(boundaryOf(off.newPreset!).sh).toBe(0);

    const asBool = boundaryDoc();
    boundaryOf(asBool).sh = true;
    const offBool = setBoundaryShCommand(lib(asBool), ID, false)!;
    expect(
      boundaryOf(offBool.newPreset!).sh,
      'a hand-written boolean document was normalised to integers, which puts a diff on every '
      + 'load/save of a file the author never edited',
    ).toBe(false);
  });

  /**
   * `offscreen_ship` is OPTIONAL with `patchable`'s own default of false, so
   * "absent" and "false" are the same to the engine and DIFFERENT documents on
   * disk. A two-way toggle would materialise the key on the first glance at the
   * control.
   */
  it('offscreen_ship has three states, and "not written" really deletes the key', () => {
    expect(BOUNDARY_OFFSCREEN_SHIP_OPTIONS.map((o) => o.value))
      .toEqual(['absent', 'off', 'on']);
    const p = boundaryDoc();
    expect(boundaryOffscreenShipState(boundaryOf(p))).toBe('on');

    const gone = setBoundaryOffscreenShipCommand(lib(p), ID, 'absent')!;
    expect('offscreen_ship' in boundaryOf(gone.newPreset!)).toBe(false);
    expect(boundaryOffscreenShipState(boundaryOf(gone.newPreset!))).toBe('absent');
    expect(() => serializeEffectsPreset(gone.newPreset!)).not.toThrow();

    // ...and "off" is a DIFFERENT document from "absent", which is the whole
    // reason there are three states rather than two.
    const off = setBoundaryOffscreenShipCommand(lib(gone.newPreset!), ID, 'off')!;
    expect('offscreen_ship' in boundaryOf(off.newPreset!)).toBe(true);
    expect(boundaryOffscreenShipState(boundaryOf(off.newPreset!))).toBe('off');
    expect(JSON.stringify(off.newPreset)).not.toBe(JSON.stringify(gone.newPreset));
  });
});

// ---------------------------------------------------------------------------
// 6. The advisories reach a surface WITH their attribution
// ---------------------------------------------------------------------------

describe('every advisory reaches the panel carrying who enforces it', () => {
  /**
   * ⚠ THE ATTRIBUTION IS THE POINT. `enforced_by` is a FIELD rather than a
   * docblock in `boundary.ts` precisely so a surface that paints `text` cannot
   * drop it — the difference between "the editor thinks this is wrong" and
   * "aeon's generator will reject this". This is the renderer helper, and it
   * reads the field.
   */
  it('the attribution helper paints the field and nothing hard-coded', () => {
    const p = boundaryDoc();
    for (const a of boundaryAdvisoriesFor(p)) {
      const line = boundaryAdvisoryAttribution(a);
      expect(line).toContain(a.enforced_by);
      expect(line).not.toContain('undefined');
      expect(a.advisory).toBe(true);
    }
    // ...and it is not a constant dressed up as a derivation: the four rules do
    // not all name the same enforcer, and the one that names NOTHING is the one
    // with no engine check behind it.
    const seed = boundaryAdvisoriesFor(p)[0];
    expect(boundaryAdvisoryAttribution(seed)).toMatch(/nothing; this document is legal/);
  });

  /**
   * ⚠ THE FOURTH ADVISORY IS INDEX-WISE, AND A CHECK THAT ONLY ASKED "does this
   * document have patch_motion?" WOULD GO QUIET HERE. The same two keys authored
   * at the wrong index leave the boundary just as still.
   */
  it('a boundary seeded and swept at the WRONG index is still warned about, by index', () => {
    const p = boundaryDoc();
    boundaryOf(p).channel = 0;
    p.patch_world_ys = [null, 100];
    p.patch_motion = [null, { sweep: { amp_shift: 5, period_shift: 5, phase: 0 } }] as never;
    const still = boundaryAdvisoriesFor(p).find((a) => a.rule === 'no-motion');
    expect(still, 'the document authors both positional keys — at index 1, while the boundary '
      + 'follows channel 0 — and nothing warned').toBeDefined();
    expect(still!.text).toContain('patch_world_ys[0]');
    expect(still!.text).toContain('patch_motion[0]');

    // ANTI-VACUOUS PARTNER: at the RIGHT index the sentence retires, so the row
    // above measured the index and not the mere presence of the rule.
    boundaryOf(p).channel = 1;
    expect(boundaryAdvisoriesFor(p).find((a) => a.rule === 'no-motion')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. The summary
// ---------------------------------------------------------------------------

describe('the summary does the arithmetic an author would otherwise do in their head', () => {
  it('names the band\'s line count inclusively, and the two asymmetric failures', () => {
    const b = newBoundary();
    const s = boundarySummary(b);
    expect(s).toContain(`${b.hi - b.lo + 1} lines`);
    expect(s).toContain(String(b.line));
    expect(s).toContain(String(b.channel));
    // The asymmetry is the thing nobody guesses: past hi the record is DROPPED,
    // below lo it is CLAMPED and still drawn.
    expect(s).toMatch(/DROPPED/);
    expect(s).toMatch(/CLAMPED UP/);
  });

  it('says "an empty band" rather than a negative count when lo is above hi', () => {
    const b = { ...newBoundary(), lo: 200, hi: 100 };
    expect(boundarySummary(b)).toContain('an empty band');
    expect(boundarySummary(b)).not.toMatch(/-\d+ lines/);
  });
});

// ---------------------------------------------------------------------------
// 8. The document a boundary preset actually becomes
// ---------------------------------------------------------------------------

describe('the round trip, through the codec, on a fully authored boundary', () => {
  it('every field an author can set survives a save and a reload byte-stably', () => {
    const p = boundaryDoc();
    const edits: [BoundaryNumberField, number][] = [
      ['line', 120], ['channel', 2], ['lo', 50], ['hi', 200],
    ];
    let doc = p;
    for (const [f, v] of edits) doc = setBoundaryFieldCommand(lib(doc), ID, f, v)!.newPreset!;
    for (const f of EFFECTS_PRESET_TINT_REGION_KEYS) {
      // ⚠ NOT A VALUE THE SEED ALREADY HOLDS: a no-op command returns null,
      // correctly, and would read here as a control that does not work.
      const v = regionOf(boundaryOf(doc))[f] + 7;
      doc = setBoundaryTintCommand(lib(doc), ID, f, v)!.newPreset!;
    }
    doc = setBoundaryShCommand(lib(doc), ID, false)!.newPreset!;
    doc = setBoundaryOffscreenShipCommand(lib(doc), ID, 'absent')!.newPreset!;
    // ...and the anchor keys, at the channel the boundary follows, so this is
    // the document the whole feature is for: a boundary that MOVES.
    doc = { ...doc, patch_world_ys: [null, null, 500], patch_motion: [null, null,
      { sweep: { amp_shift: 5, period_shift: 5, phase: 0 } }] } as never;

    const text = serializeEffectsPreset(doc);
    const back = parseEffectsPreset(text, ID);
    expect(back.boundary).toEqual(doc.boundary);
    expect(presetProgramArm(back)).toBe('boundary');
    // BYTE-STABLE: a second write of the parsed document produces the same text.
    expect(serializeEffectsPreset(back)).toBe(text);
    // ...and it earns NO advisory at all, which is the state an author is aiming
    // for. ⚠ That is not a clearance and this file does not read it as one — see
    // `boundaryAdvisories`' own header; it is the absence of the four sentences.
    expect(boundaryAdvisoriesFor(back)).toEqual([]);
  });

  it('what the author will see is QUOTED from the contract, not claimed here', () => {
    expect(BOUNDARY_WHAT_YOU_SEE).not.toBe('');
    expect(BOUNDARY_WHAT_YOU_SEE).toMatch(/anchor/);
    // Aurora draws no raster program, so the sentence must be the schema's own.
    const raw = readFileSync(SCHEMA_PATH, 'utf8');
    expect(raw).toContain(BOUNDARY_WHAT_YOU_SEE);
  });
});
