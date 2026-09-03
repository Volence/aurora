// The `ramp` key — empyrean 9233883, AURORA_EFFECTS_SCHEMA.md §7.4, EFFECTS-W1
// DoD item 6's authoring surface for the dense per-line vertical scroll.
//
// ═══ WHAT THIS FILE IS FOR, AND WHY IT IS NOT JUST THE CONTRACT VECTORS ═══
//
// empyrean published eleven vector rows with this amendment and they run in
// effects-preset-vectors.test.ts. They cover SHAPE: a ramp-only document parses,
// and ten malformed ones are refused. They cannot cover three things this file
// owns, all of which are ways a legal-shaped document is silently WRONG:
//
//   1. THE fp16 SIGN RULE. `{whole: -1, frac256: 128}` is -1.5, not -0.5. Both
//      numbers are in range in either reading, so NO SCHEMA AND NO VECTOR CAN
//      CATCH IT — a codec with the naive conversion passes every published row
//      and puts the floor a whole pixel out. The row below is derived from the
//      schema's own sentence, not from a comment.
//   2. THE VSRAM DISPLAY LAG. A run's value j displays on line top + j + 1. A
//      preview drawing it at top + j is one line high, which looks correct.
//   3. THE MUST NOT. A ramp is ONE linear rate over a span. There is no per-line
//      curve, and there cannot be one — the engine has no field to receive it.
//
// And one more, which is Aurora's alone: the DOCUMENT'S TYPE CHANGED. `bands`
// left the top-level `required` list and a top-level `oneOf` took over the
// exactly-one-raster-program rule. This file measures that the subset validator
// actually implements a ROOT-level `oneOf` — all four ways — rather than
// assuming it because a previous amendment forced no edit.

import { describe, it, expect } from 'vitest';
import {
  EFFECTS_PRESET_SCHEMA,
  EFFECTS_PRESET_RASTER_CHANNELS,
  EFFECTS_PRESET_RAMP_TOP_RANGE,
  EFFECTS_PRESET_RAMP_LINES_RANGE,
  EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE,
  EFFECTS_PRESET_RAMP_SPAN_MAX,
  EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG,
  EFFECTS_PRESET_FP16_WHOLE_RANGE,
  EFFECTS_PRESET_FP16_FRAC_RANGE,
  EFFECTS_PRESET_FP16_SIGNED_EXAMPLE,
  presetFp16ToNumber,
  presetFp16FromNumber,
  presetRasterChannel,
  parseEffectsPreset,
  serializeEffectsPreset,
  EffectsPresetError,
  type EffectsPreset,
  type EffectsPresetRamp,
} from '../../src/core/formats/effects/preset';
import {
  validateAgainstSchema, canonicalizeBySchema, type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';

const S = EFFECTS_PRESET_SCHEMA as unknown as JsonSchema;

/** The contract's own worked band, so the four-way rows use a REAL bands arm. */
const BAND = { top: 64, bot: 96, sh: false, on: { cram: { addr: 34, colours: [546, 306] } } };

/** The contract's own worked ramp (§7.4: plane B floor, 64 lines from 128). */
const RAMP: EffectsPresetRamp = {
  top: 128,
  lines: 64,
  target: { vsram: { addr: 2 } },
  start: { whole: 0, frac256: 0 },
  step: { whole: 1, frac256: 128 },
};

const ID = 'ojz_sec2_floor';
const base = { schema: 1 as const, id: ID };

// ═══════════════════════════════════════════════════════════════════════════
// THE ROOT `oneOf` — FOUR WAYS, MEASURED, NOT ASSUMED
// ═══════════════════════════════════════════════════════════════════════════
//
// The 6664b61 amendment put `unevaluatedProperties: false` beside an in-place
// applicator for the first time and FORCED an edit to json-schema-subset.ts.
// The d36d704 one forced none. Neither result transfers to this one: this is the
// first committed contract schema to put an `oneOf` at the DOCUMENT ROOT, and
// "a previous amendment needed nothing" is not a measurement of this one.
//
// The failure that matters is the one that ACCEPTS: a validator that let a
// both-keys document through would hand an author a preset the engine refuses at
// build, with the editor saying it is fine.
describe('the top-level oneOf: exactly one raster program per document', () => {
  it('the schema really carries the construct these rows are about', () => {
    // Anti-vacuous, and it is the whole premise: `bands` must NOT be required
    // any more, and the `oneOf` must be at the ROOT rather than somewhere the
    // rows below would never reach.
    expect(EFFECTS_PRESET_SCHEMA.required as string[]).not.toContain('bands');
    expect(Array.isArray(EFFECTS_PRESET_SCHEMA.oneOf)).toBe(true);
    expect(EFFECTS_PRESET_RASTER_CHANNELS).toEqual(['bands', 'ramp']);
    // ...and the channels are DERIVED from that `oneOf`, not restated: every one
    // of them is a declared root property.
    const props = Object.keys(EFFECTS_PRESET_SCHEMA.properties as Record<string, unknown>);
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) expect(props).toContain(c);
  });

  it('bands ALONE is accepted', () => {
    expect(validateAgainstSchema({ ...base, bands: [BAND] }, S)).toEqual([]);
  });

  it('ramp ALONE is accepted — the shape that did not exist before 9233883', () => {
    expect(validateAgainstSchema({ ...base, ramp: RAMP }, S)).toEqual([]);
  });

  it('BOTH is REFUSED — the failure mode that would author an unbuildable preset', () => {
    const issues = validateAgainstSchema({ ...base, bands: [BAND], ramp: RAMP }, S);
    expect(
      issues,
      'a document carrying BOTH raster programs was ACCEPTED. Both lower into the one `raster:` '
      + 'slot and the engine has no combinator that mixes a sparse fire list with a dense run, so '
      + 'this preset fails aeon\'s build — and the editor just said it was fine.',
    ).not.toEqual([]);
    // The refusal is the exactly-one rule's, not a coincidence from some other
    // keyword: the evaluator says it matched TWO forms.
    expect(issues.map((i) => i.message).join(' ')).toMatch(/matches 2 of the 2 allowed forms/);
    expect(issues.map((i) => i.path)).toContain('');
  });

  it('NEITHER is REFUSED — a preset document must carry one raster program', () => {
    const issues = validateAgainstSchema({ ...base }, S);
    expect(issues, 'a document carrying NO raster program was accepted').not.toEqual([]);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/matches none of the 2 allowed forms/);
  });

  it('...and the codec refuses both-and-neither too, not only the raw validator', () => {
    for (const [name, doc] of [
      ['both', { ...base, bands: [BAND], ramp: RAMP }],
      ['neither', { ...base }],
    ] as [string, unknown][]) {
      expect(
        () => parseEffectsPreset(JSON.stringify(doc), ID),
        `parseEffectsPreset accepted the "${name}" document`,
      ).toThrow(EffectsPresetError);
    }
    // The WRITE path refuses it too — a document can reach the writer without
    // coming through the reader (the panel builds one), and that is the path
    // this schema is closed for.
    expect(() => serializeEffectsPreset(
      { ...base, bands: [BAND], ramp: RAMP } as unknown as EffectsPreset,
    )).toThrow(EffectsPresetError);
  });

  /**
   * ═══ THE FINDING THE FOUR-WAY PROBE TURNED UP BESIDE THE ANSWER ═══
   *
   * `canonicalizeBySchema` exists for ONE thing now that its ordering no longer
   * reaches disk (serializing sorts alphabetically afterwards): it THROWS on a
   * key the schema does not declare, so writing can never silently erase a
   * field. Its `oneOf` arm recursed into the winning branch and returned — and
   * the winning branch here is `{required: ['bands']}`, which declares no
   * `properties`, so the function fell through to `return value` and skipped
   * the refusal entirely.
   *
   * The hole was already open at `$defs.band.properties.on`, which has carried
   * the same `properties` + `required`-only `oneOf` shape since 6664b61. It was
   * invisible there because validation refuses such a document first. Hoisting
   * the shape to the ROOT is what made it worth finding: at the root it covers
   * the whole document.
   */
  it('canonicalizeBySchema still refuses an undeclared key BESIDE the root oneOf', () => {
    // The control: a legal document canonicalizes to itself, so the row below
    // is not passing because the function throws on everything.
    const legal = { ...base, ramp: RAMP };
    expect(canonicalizeBySchema(legal, S)).toEqual(legal);
    expect(canonicalizeBySchema({ ...base, bands: [BAND] }, S)).toEqual({ ...base, bands: [BAND] });

    expect(
      () => canonicalizeBySchema({ ...base, bands: [BAND], bogus_key: 7 }, S),
      'canonicalizeBySchema returned a document carrying an undeclared root key instead of '
      + 'throwing. The root `oneOf` branch was taken and the sibling `properties` discarded, so '
      + 'the undeclared-key refusal — the only reason this function still exists — is silently '
      + 'skipped for the WHOLE DOCUMENT.',
    ).toThrow(/refusing to drop/);
  });

  it('...and at $defs.band.properties.on, where the same shape has lived since 6664b61', () => {
    const on = (EFFECTS_PRESET_SCHEMA as unknown as Record<string, Record<string, Record<string,
      Record<string, JsonSchema>>>>).$defs.band.properties.on;
    // Control: a legal one-arm `on` canonicalizes to itself.
    expect(canonicalizeBySchema({ cram: { addr: 34, colours: [546, 306] } }, on, S))
      .toEqual({ cram: { addr: 34, colours: [546, 306] } });
    expect(
      () => canonicalizeBySchema({ cram: { addr: 34, colours: [546, 306] }, bogus: 1 }, on, S),
      'the same hole is open one level down, where it has been since the preset schema landed',
    ).toThrow(/refusing to drop/);
  });

  it('presetRasterChannel names the channel a document carries', () => {
    expect(presetRasterChannel({ ...base, bands: [BAND] })).toBe('bands');
    expect(presetRasterChannel({ ...base, ramp: RAMP })).toBe('ramp');
    expect(presetRasterChannel({ ...base })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fp16 — THE SIGN RULE, AND THE ROW THAT NAMES -1.5
// ═══════════════════════════════════════════════════════════════════════════
describe('fp16: frac256 is a MAGNITUDE and the sign is whole\'s', () => {
  it('THE NAMED ROW: fp16(-1, 128) is -1.5, not -0.5', () => {
    // Derived, not typed beside the assertion: the pair AND the expected value
    // are read out of the schema's own `$defs.fp16` description, which states
    // the example precisely because the semantics are not the obvious ones. The
    // module throws at load if that sentence stops matching, so this row cannot
    // quietly become a restatement of a comment.
    expect(EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.fp).toEqual({ whole: -1, frac256: 128 });
    expect(EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.value).toBe(-1.5);

    expect(
      presetFp16ToNumber(EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.fp),
      'the fp16 conversion used the naive `whole + frac256/256`. That yields -0.5 for the '
      + 'schema\'s own worked example, which is -1.5 — a WHOLE PIXEL out, with both numbers still '
      + 'inside their declared ranges, so no schema and no contract vector can catch it. The sign '
      + 'is `whole`\'s alone and applies to the whole value.',
    ).toBe(EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.value);

    // And spelled out the other way, so the row cannot pass by echoing itself:
    // the naive reading is a DIFFERENT number, and this is not it.
    const naive = EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.fp.whole
      + EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.fp.frac256 / 256;
    expect(naive).toBe(-0.5);
    expect(presetFp16ToNumber(EFFECTS_PRESET_FP16_SIGNED_EXAMPLE.fp)).not.toBe(naive);
  });

  it('moves AWAY from zero in both directions, exactly as the engine computes it', () => {
    // The engine spells it (whole * 65536) - (frac256 * 256) for whole < 0.
    const rows: [number, number, number][] = [
      [0, 0, 0],
      [0, 128, 0.5],
      [1, 128, 1.5],
      [-1, 128, -1.5],
      [-2, 64, -2.25],
      [-1, 0, -1],
      [511, 255, 511 + 255 / 256],
      [-512, 255, -(512 + 255 / 256)],
    ];
    for (const [whole, frac256, expected] of rows) {
      expect(presetFp16ToNumber({ whole, frac256 }), `fp16(${whole}, ${frac256})`).toBe(expected);
    }
  });

  it('round-trips every representable value, and the inverse never invents one', () => {
    let checked = 0;
    for (const whole of [-512, -300, -2, -1, 0, 1, 2, 300, 511]) {
      for (const frac256 of [0, 1, 64, 128, 200, 255]) {
        const fp = { whole, frac256 };
        const px = presetFp16ToNumber(fp);
        const back = presetFp16FromNumber(px);
        // The (-1, 0) hole: {whole: 0, frac256: n} with a negative intent has no
        // spelling, so a NEGATIVE zero-whole pair is the one input that cannot
        // survive the trip. It is not produced by this loop (whole 0 is
        // positive), so every pair here must come back.
        expect(back, `fp16(${whole}, ${frac256}) -> ${px} did not come back`).toEqual(fp);
        checked++;
      }
    }
    // Anti-vacuous: the loop really ran.
    expect(checked).toBe(54);
  });

  it('refuses what it cannot spell exactly, rather than rounding an author\'s value', () => {
    // Not a whole number of 1/256 px.
    expect(presetFp16FromNumber(0.3)).toBeNull();
    // ⚠ THE (-1, 0) HOLE. The sign is `whole`'s, and there is no negative whole
    // between -1 and 0, so -0.5 HAS NO SPELLING: {whole: 0, frac256: 128} is
    // +0.5. A control must show that rather than snap across it.
    expect(presetFp16FromNumber(-0.5)).toBeNull();
    expect(presetFp16FromNumber(-0.00390625)).toBeNull();
    // ...but its positive twin is fine, which is what makes the hole a hole.
    expect(presetFp16FromNumber(0.5)).toEqual({ whole: 0, frac256: 128 });
    // Zero itself is spellable — it is not in the open interval.
    expect(presetFp16FromNumber(0)).toEqual({ whole: 0, frac256: 0 });
    // Outside the AUTHORED range (fp16's ensures, not the 16.16 storage width).
    expect(presetFp16FromNumber(512)).toBeNull();
    expect(presetFp16FromNumber(-513)).toBeNull();
    expect(presetFp16FromNumber(Number.NaN)).toBeNull();
    expect(presetFp16FromNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('the authored range is fp16\'s ensures, not the 16.16 storage width', () => {
    expect(EFFECTS_PRESET_FP16_WHOLE_RANGE).toEqual({ min: -512, max: 511 });
    expect(EFFECTS_PRESET_FP16_FRAC_RANGE).toEqual({ min: 0, max: 255 });
    // The storage could hold roughly -32768..32767 — about 64x. A control built
    // on the width would offer an author values the build refuses, so the schema
    // is checked to be the NARROW one and not the wide one.
    expect(EFFECTS_PRESET_FP16_WHOLE_RANGE.max).toBeLessThan(32767);
    // ...and the schema really refuses the out-of-range pair, per contract row.
    const fp16Node = (EFFECTS_PRESET_SCHEMA as unknown as Record<string, Record<string, JsonSchema>>)
      .$defs.fp16;
    expect(validateAgainstSchema({ whole: 512, frac256: 0 }, fp16Node, S)).not.toEqual([]);
    expect(validateAgainstSchema({ whole: 0, frac256: 256 }, fp16Node, S)).not.toEqual([]);
    expect(validateAgainstSchema({ whole: -512, frac256: 255 }, fp16Node, S)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SPAN, AND THE DISPLAY LAG A PREVIEW WILL GET WRONG
// ═══════════════════════════════════════════════════════════════════════════
describe('ramp bounds, derived from the schema and never typed beside it', () => {
  it('the per-field ranges are the schema\'s own', () => {
    expect(EFFECTS_PRESET_RAMP_TOP_RANGE).toEqual({ min: 3, max: 222 });
    expect(EFFECTS_PRESET_RAMP_LINES_RANGE).toEqual({ min: 1, max: 220 });
    expect(EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE).toEqual({ min: 0, max: 78 });
  });

  it('⚠ THE PER-FIELD MAXIMA ARE NOT THE CONTRACT — the SUM is, and it is 223', () => {
    expect(EFFECTS_PRESET_RAMP_SPAN_MAX).toBe(223);
    // The trap, stated as a row: both maxima together satisfy every keyword in
    // the schema and are refused by the engine's frame-rewind interlock. A
    // control offering them as a valid pair offers a build failure.
    const bothMaxima = EFFECTS_PRESET_RAMP_TOP_RANGE.max + EFFECTS_PRESET_RAMP_LINES_RANGE.max;
    expect(bothMaxima).toBeGreaterThan(EFFECTS_PRESET_RAMP_SPAN_MAX);
    expect(validateAgainstSchema(
      { ...base, ramp: { ...RAMP, top: 222, lines: 220 } }, S,
    ), 'the schema is expected NOT to catch the span — JSON Schema cannot express a constraint '
      + 'over two fields, which is exactly why EFFECTS_PRESET_RAMP_SPAN_MAX exists')
      .toEqual([]);
    // Each maximum is the loosest the sum admits with the other at its floor.
    expect(EFFECTS_PRESET_RAMP_TOP_RANGE.max + EFFECTS_PRESET_RAMP_LINES_RANGE.min)
      .toBe(EFFECTS_PRESET_RAMP_SPAN_MAX);
    expect(EFFECTS_PRESET_RAMP_TOP_RANGE.min + EFFECTS_PRESET_RAMP_LINES_RANGE.max)
      .toBe(EFFECTS_PRESET_RAMP_SPAN_MAX);
  });

  it('⚠ THE VSRAM DISPLAY LAG IS +1 — a preview drawing at top + j is one line high', () => {
    expect(EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG).toBe(1);
    // The constant exists so the control parcel cannot re-derive it wrong; the
    // row states the formula it is FOR, in the form a renderer will use it.
    const displayLineOf = (ramp: EffectsPresetRamp, j: number): number =>
      ramp.top + j + EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG;
    expect(displayLineOf(RAMP, 0)).toBe(129);
    expect(displayLineOf(RAMP, RAMP.lines - 1)).toBe(192);
    // ...and it is NOT applied by the codec: a document's `top` is the engine's
    // `top`, written and read verbatim. Applying it here would put the
    // compensation in the file, where the generator would apply it again.
    const round = parseEffectsPreset(JSON.stringify({ ...base, ramp: RAMP }), ID);
    expect(round.ramp!.top).toBe(RAMP.top);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUND TRIP, AND THE CONTROL THAT THE WRITER INVENTS AND PADS NOTHING
// ═══════════════════════════════════════════════════════════════════════════
describe('a ramp document round-trips, and the writer adds nothing of its own', () => {
  const MINIMAL = { schema: 1, id: ID, ramp: RAMP };

  it('parses to exactly what JSON.parse produced — no key gained, none lost', () => {
    const preset = parseEffectsPreset(JSON.stringify(MINIMAL, null, 2) + '\n', ID);
    expect(preset).toEqual(MINIMAL);
    // Specifically: the OTHER channel did not appear. A codec that normalised
    // an absent `bands` to `[]` would author the both-keys document the schema
    // refuses, and it would do it on every save of every ramp preset.
    expect('bands' in preset).toBe(false);
  });

  it('serializes back byte-for-byte to the canonical form, and re-parses identically', () => {
    const preset = parseEffectsPreset(JSON.stringify(MINIMAL), ID);
    const text = serializeEffectsPreset(preset);
    // aeon §5: alphabetical, recursively, matching
    // json.dumps(obj, sort_keys=True, indent=2). Spelled out as an expected
    // STRING rather than compared to another serialize() call, so the row is a
    // measurement of the bytes and not of the function agreeing with itself.
    expect(text).toBe([
      '{',
      '  "id": "ojz_sec2_floor",',
      '  "ramp": {',
      '    "lines": 64,',
      '    "start": {',
      '      "frac256": 0,',
      '      "whole": 0',
      '    },',
      '    "step": {',
      '      "frac256": 128,',
      '      "whole": 1',
      '    },',
      '    "target": {',
      '      "vsram": {',
      '        "addr": 2',
      '      }',
      '    },',
      '    "top": 128',
      '  },',
      '  "schema": 1',
      '}',
      '',
    ].join('\n'));
    // ...and the trip closes: re-reading those bytes gives the same document.
    expect(parseEffectsPreset(text, ID)).toEqual(MINIMAL);
    expect(serializeEffectsPreset(parseEffectsPreset(text, ID))).toBe(text);
  });

  it('THE CONTROL: the writer invents no field and pads no absent one', () => {
    const text = serializeEffectsPreset(parseEffectsPreset(JSON.stringify(MINIMAL), ID));
    const out = JSON.parse(text) as Record<string, unknown>;

    // Every OPTIONAL root key the author did not write stays unwritten. This is
    // the row that would catch a writer defaulting `bands: []`, `cycles: null`,
    // `variants: []` or a `name` — each of which is a DIFFERENT document, and
    // the first of which does not even build.
    expect(Object.keys(out).sort()).toEqual(['id', 'ramp', 'schema']);
    for (const k of ['bands', 'name', 'cycles', 'variants', 'patch_world_ys', 'patch_motion']) {
      expect(k in out, `the writer invented "${k}"`).toBe(false);
    }
    // Nothing was added INSIDE the ramp either — all five members, no more.
    expect(Object.keys(out.ramp as object).sort())
      .toEqual(['lines', 'start', 'step', 'target', 'top']);
    expect(Object.keys((out.ramp as { start: object }).start).sort())
      .toEqual(['frac256', 'whole']);
    expect(Object.keys((out.ramp as { target: object }).target)).toEqual(['vsram']);

    // Anti-vacuous, and it is the point of the control: the schema DECLARES
    // those absent keys, so the writer had every opportunity to emit them. A
    // row asserting "the writer omitted a key the schema never had" proves
    // nothing.
    const declared = Object.keys(EFFECTS_PRESET_SCHEMA.properties as Record<string, unknown>);
    for (const k of ['bands', 'name', 'cycles', 'variants']) expect(declared).toContain(k);
  });

  it('a document with the OTHER optional channels alongside `ramp` round-trips too', () => {
    // `cycles` and `variants` are not raster programs — they are other channels
    // of the same preset, and the `oneOf` says nothing about them. A ramp
    // document may carry them, and `cycles: null` must survive as null.
    const rich = {
      schema: 1, id: ID, name: 'OJZ act 1 section 2 - pseudo-3D floor',
      ramp: RAMP, cycles: null,
    };
    const preset = parseEffectsPreset(JSON.stringify(rich), ID);
    expect(preset).toEqual(rich);
    expect(JSON.parse(serializeEffectsPreset(preset))).toEqual(rich);
    // The null really survived as null and was not dropped to absent.
    expect('cycles' in JSON.parse(serializeEffectsPreset(preset))).toBe(true);
    expect(JSON.parse(serializeEffectsPreset(preset)).cycles).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE MUST NOT: ONE LINEAR RATE, ONE START, NO PER-LINE CURVE
// ═══════════════════════════════════════════════════════════════════════════
//
// Recorded as rows and not only as prose, because the parcel that builds the
// CONTROL is the one that would get this wrong: an author asking for "the floor
// speeds up near the horizon" wants a curve, and a control that offered one
// would write a document the engine cannot honour. The schema refuses it by
// CLOSURE — the object is closed and the key does not exist — which is a
// refusal that only holds as long as nobody widens the object.
describe('THE MUST NOT — a per-line curve is not authorable, and must not become so', () => {
  it('a `curve` key is refused, by the ramp object being CLOSED', () => {
    const withCurve = { ...base, ramp: { ...RAMP, curve: [0, 1, 2, 3] } };
    const issues = validateAgainstSchema(withCurve, S);
    expect(
      issues,
      'a `curve` key was ACCEPTED on a ramp. A ramp has ONE rate and ONE start and no field that '
      + 'could receive a table (rrp_step / rrp_start, raster.emp:590-591), so this document would '
      + 'validate, generate, and be silently wrong on hardware.',
    ).not.toEqual([]);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/the schema is closed/);
    expect(() => parseEffectsPreset(JSON.stringify(withCurve), ID)).toThrow(EffectsPresetError);
  });

  it('the ramp object really IS closed — the refusal is not coming from elsewhere', () => {
    const ramp = (EFFECTS_PRESET_SCHEMA as unknown as Record<string, Record<string, JsonSchema>>)
      .$defs.ramp;
    expect(ramp.unevaluatedProperties, 'the ramp object is no longer closed, so the per-line-curve '
      + 'MUST NOT is now enforced by nothing at all').toBe(false);
    // The five members are ALL required — the constructor defaults none of them.
    expect([...(ramp.required as string[])].sort())
      .toEqual(['lines', 'start', 'step', 'target', 'top']);
    // And there is no per-line vocabulary among them: `step` is a rate.
    expect(Object.keys(ramp.properties as object).sort())
      .toEqual(['lines', 'start', 'step', 'target', 'top']);
  });

  it('the target has exactly one arm, and no CRAM arm is reserved', () => {
    const target = (EFFECTS_PRESET_SCHEMA as unknown as Record<string, Record<string, JsonSchema>>)
      .$defs.ramp_target;
    expect(Object.keys(target.properties as object)).toEqual(['vsram']);
    expect(target.unevaluatedProperties).toBe(false);
    // A `cram` arm is refused rather than reserved: an arm with nothing behind
    // it advertises a shape this codec is not shaped for.
    expect(validateAgainstSchema(
      { ...base, ramp: { ...RAMP, target: { cram: { addr: 0 } } } }, S,
    )).not.toEqual([]);
  });
});
