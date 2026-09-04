// The `base_swap` key — empyrean 5bd76ba, AURORA_EFFECTS_SCHEMA.md §7.5,
// EFFECTS-W1 DoD item 11a's authoring surface for the mid-frame nametable-base
// swap (the "Batman & Robin trick").
//
// ═══ WHY THIS FILE EXISTS BESIDE THE CONTRACT VECTORS ═══
//
// empyrean published seven vector rows with this amendment and they run in
// effects-preset-vectors.test.ts. They cover SHAPE. Three things they cannot
// cover are this file's:
//
//   1. THE THIRD `oneOf` ARM, MEASURED AS A NINE-CASE MATRIX. The root `oneOf`
//      went from two arms to three. A validator that got the two-arm case right
//      is NOT thereby proven on three, and the specific regression this repo has
//      already had once — `canonicalizeBySchema` silently skipping the
//      undeclared-key refusal for the WHOLE DOCUMENT when a `required`-only arm
//      wins — is exactly the shape a third arm could reopen. See
//      docs/reviews/2026-09-03-ew-revendor-ramp.md §Step B.
//   2. `multipleOf`, WHICH THIS SCHEMA IS THE FIRST TO USE. The subset validator
//      did not implement it and REFUSED TO VALIDATE (loudly, by design) until
//      this parcel added it. An implementation that quietly ignored the keyword
//      would pass every "shape" reading and accept a misaligned VRAM address.
//   3. WHAT THE VALUE MEANS. `target: 57344` is `$E000` is `VRAM_PLANE_B`. The
//      granule is $2000 because reg $02 DROPS the low bits silently — a
//      misaligned target is a different address, not an error.
//
// ⚠ TWO ASYMMETRIES WITH `ramp`, asserted here so nobody carries them across by
// analogy: `base_swap` has NO capability gate (no CAP_DENSE_TIER analogue) and
// its generated emission is NOT DEBUG-gated. Both are stated in the schema's own
// prose and the rows below read them from there.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  EFFECTS_PRESET_SCHEMA,
  EFFECTS_PRESET_RASTER_CHANNELS,
  EFFECTS_PRESET_ROOT_KEYS,
  EFFECTS_PRESET_BASE_SWAP_KEYS,
  EFFECTS_PRESET_BASE_SWAP_LINE_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
  EFFECTS_PRESET_RAMP_TOP_RANGE,
  isBaseSwapTargetAligned,
  presetRasterChannel,
  presetDefFields,
  parseEffectsPreset,
  serializeEffectsPreset,
  EffectsPresetError,
  type EffectsPreset,
  type EffectsPresetBaseSwap,
  type EffectsPresetRamp,
} from '../../src/core/formats/effects/preset';
import {
  validateAgainstSchema, canonicalizeBySchema, type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';

const S = EFFECTS_PRESET_SCHEMA as unknown as JsonSchema;

/** The contract's own worked band, so the matrix rows use a REAL bands arm. */
const BAND = { top: 64, bot: 96, sh: false, on: { cram: { addr: 34, colours: [546, 306] } } };

/** The contract's own worked ramp (§7.4). */
const RAMP: EffectsPresetRamp = {
  top: 128,
  lines: 64,
  target: { vsram: { addr: 2 } },
  start: { whole: 0, frac256: 0 },
  step: { whole: 1, frac256: 128 },
};

/**
 * THE CONTRACT'S PUBLISHED PASS VECTOR — line 160, target $E000.
 *
 * Not invented for this file: empyrean published exactly this with the 5bd76ba
 * amendment, and it is case 17 of the vendored vector set
 * (test/fixtures/effects/effects-preset-vectors.json). This constant is the
 * SYNTHETIC document the schema-matrix rows below are built on, and nothing more.
 *
 * ⚠ IT IS NO LONGER WHAT AEON SHIPS, AND MUST NOT BE ASSERTED TO BE. On
 * 2026-09-03 the owner moved the swap to the top of the frame — aeon 8bf6df74,
 * `line` 160 -> 3 — and the section-6 block at the bottom of this file, which
 * asserted `preset.base_swap` equalled this constant, went red for it. That row
 * was answering a question about a PEER REPO with an instrument that claims to
 * be about our codec (docs/OVERSEER.md bar 19); it now derives its expectations
 * from a vendored fixture, and the "has aeon moved?" question is asked, once,
 * where it can actually be answered: test/formats/aeon-fixture-currency.test.ts.
 *
 * That the CONTRACT's vector and aeon's document now disagree is a fact about
 * empyrean and aeon. Aurora does not adjudicate it and no row here asserts they
 * agree; it is recorded in test/fixtures/effects/ojz_sec6_baseswap.provenance.json.
 */
const BASE_SWAP: EffectsPresetBaseSwap = { line: 160, target: 57344 };

const ID = 'ojz_sec6_baseswap';
const base = { schema: 1 as const, id: ID };

// ═══════════════════════════════════════════════════════════════════════════
// THE ROOT `oneOf`, NINE WAYS. THREE ARMS, MEASURED — NOT INHERITED FROM TWO.
// ═══════════════════════════════════════════════════════════════════════════
describe('the top-level oneOf with THREE arms: exactly one raster program', () => {
  it('the schema really carries the construct these rows are about', () => {
    // Anti-vacuous, and the premise of every row below: three arms, each a
    // single-`required` branch over a declared root key, and none of them in the
    // top-level `required` list (requiring one would make the other two illegal).
    const arms = EFFECTS_PRESET_SCHEMA.oneOf as { required: string[] }[];
    expect(Array.isArray(arms)).toBe(true);
    expect(arms).toHaveLength(3);
    expect(EFFECTS_PRESET_RASTER_CHANNELS).toEqual(['bands', 'base_swap', 'ramp']);
    const required = EFFECTS_PRESET_SCHEMA.required as string[];
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      expect(EFFECTS_PRESET_ROOT_KEYS).toContain(c);
      expect(required).not.toContain(c);
    }
  });

  // ─── the three SINGLE-ARM cases: every one must be ACCEPTED ───
  const singles: [string, Record<string, unknown>][] = [
    ['bands', { bands: [BAND] }],
    ['ramp', { ramp: RAMP }],
    ['base_swap', { base_swap: BASE_SWAP }],
  ];

  for (const [name, arm] of singles) {
    it(`${name} ALONE is ACCEPTED`, () => {
      expect(validateAgainstSchema({ ...base, ...arm }, S)).toEqual([]);
      // ...and through the codec, both directions, since that is where a
      // document is actually accepted or refused.
      const doc = { ...base, ...arm } as unknown as EffectsPreset;
      expect(() => parseEffectsPreset(JSON.stringify(doc), ID)).not.toThrow();
      expect(() => serializeEffectsPreset(doc)).not.toThrow();
    });
  }

  // ─── every PAIR, and the TRIPLE: all four must be REFUSED ───
  //
  // Enumerated from `singles` rather than typed out, so a fourth raster channel
  // cannot arrive and leave a pair silently untested.
  const combos: [string, Record<string, unknown>][] = [];
  for (let i = 0; i < singles.length; i += 1) {
    for (let j = i + 1; j < singles.length; j += 1) {
      combos.push([`${singles[i][0]} + ${singles[j][0]}`, { ...singles[i][1], ...singles[j][1] }]);
    }
  }
  combos.push(['all three', Object.assign({}, ...singles.map((s) => s[1]))]);

  it('the pair enumeration really covers every pair (anti-vacuous)', () => {
    // 3 choose 2 = 3 pairs, plus the triple.
    expect(combos.map(([n]) => n)).toEqual([
      'bands + ramp', 'bands + base_swap', 'ramp + base_swap', 'all three',
    ]);
  });

  for (const [name, doc] of combos) {
    it(`${name} is REFUSED — it would author a preset aeon's build cannot lower`, () => {
      const issues = validateAgainstSchema({ ...base, ...doc }, S);
      expect(
        issues,
        `a document carrying ${name} was ACCEPTED. They all lower into the one `
        + '`raster:` slot (EffectsPreset.ep_raster) and no combinator exists, so this preset '
        + "fails aeon's build — and the editor just said it was fine.",
      ).not.toEqual([]);
      // The refusal is the exactly-one rule's, not a coincidence off some other
      // keyword: the evaluator names how many of the three forms matched.
      expect(issues.map((i) => i.message).join(' '))
        .toMatch(/matches \d+ of the 3 allowed forms/);
      expect(issues.map((i) => i.path)).toContain('');
      // ...and the codec refuses it on BOTH paths. The writer matters
      // independently: a panel builds a document without it ever passing the
      // reader, and the write path is the one this schema is closed for.
      expect(() => parseEffectsPreset(JSON.stringify({ ...base, ...doc }), ID))
        .toThrow(EffectsPresetError);
      expect(() => serializeEffectsPreset({ ...base, ...doc } as unknown as EffectsPreset))
        .toThrow(EffectsPresetError);
    });
  }

  it('NONE is REFUSED — a preset document must carry one raster program', () => {
    const issues = validateAgainstSchema({ ...base }, S);
    expect(issues, 'a document carrying NO raster program was accepted').not.toEqual([]);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/matches none of the 3 allowed forms/);
    expect(() => parseEffectsPreset(JSON.stringify(base), ID)).toThrow(EffectsPresetError);
  });

  // ═══ THE CASE THAT SILENTLY BROKE BEFORE, NOW ONCE PER ARM ═══
  //
  // `canonicalizeBySchema`'s `oneOf` arm used to recurse into the WINNING branch
  // and return, discarding the sibling `properties`. The winning branch here is
  // `{required: ['<channel>']}`, which declares none, so the function fell
  // through to `return value` and skipped the undeclared-key refusal — the only
  // reason it still exists — for the WHOLE DOCUMENT. It was fixed with the
  // `contributesPropertyAnnotations` prover at the ramp re-vendor.
  //
  // A THIRD ARM IS EXACTLY THE CHANGE THAT COULD UNDO THAT, and the fix is not
  // assumed to generalise: the row runs once per arm, because which branch WINS
  // depends on the document, and a fix that held for two winners is not thereby
  // proven for the third.
  for (const [name, arm] of singles) {
    it(`a bogus root key BESIDE a valid ${name} arm is REFUSED, not silently kept`, () => {
      // The control, so the row is not passing because everything throws.
      const legal = { ...base, ...arm };
      expect(canonicalizeBySchema(legal, S)).toEqual(legal);

      expect(
        () => canonicalizeBySchema({ ...base, ...arm, bogus_key: 7 }, S),
        'canonicalizeBySchema returned a document carrying an undeclared root key instead of '
        + `throwing, with the "${name}" arm winning the root oneOf. That is the regression from `
        + 'docs/reviews/2026-09-03-ew-revendor-ramp.md §Step B reopening: the winning branch was '
        + 'recursed into and the sibling `properties` discarded, so the undeclared-key refusal is '
        + 'skipped for the WHOLE DOCUMENT and a save silently erases every unknown field.',
      ).toThrow(/refusing to drop/);

      // And the reader refuses it too, by the schema's closure rather than by
      // canonicalization — two independent refusals of the same document.
      expect(() => parseEffectsPreset(JSON.stringify({ ...base, ...arm, bogus_key: 7 }), ID))
        .toThrow(EffectsPresetError);
    });
  }

  it('presetRasterChannel names base_swap, and null when a document carries none', () => {
    expect(presetRasterChannel({ ...base, bands: [BAND] })).toBe('bands');
    expect(presetRasterChannel({ ...base, ramp: RAMP })).toBe('ramp');
    expect(presetRasterChannel({ ...base, base_swap: BASE_SWAP })).toBe('base_swap');
    expect(presetRasterChannel({ ...base })).toBeNull();
    // The helper's return type must cover every channel the schema declares, or
    // a `switch` over it is silently non-exhaustive on the newest one.
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      expect(presetRasterChannel({ ...base, [c]: c === 'bands' ? [BAND] : {} } as never)).toBe(c);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE BOUNDS, READ OFF THE SCHEMA — INCLUDING THE GRANULE
// ═══════════════════════════════════════════════════════════════════════════
describe('base_swap bounds are the schema\'s, not retyped beside it', () => {
  it('the object is CLOSED and both members are required', () => {
    const fields = presetDefFields('base_swap');
    expect(fields.required).toEqual(['line', 'target']);
    expect(fields.optional).toEqual([]);
    expect(EFFECTS_PRESET_BASE_SWAP_KEYS).toEqual(['line', 'target']);
    expect((EFFECTS_PRESET_SCHEMA.$defs as Record<string, JsonSchema>)
      .base_swap.unevaluatedProperties).toBe(false);
  });

  it('line is fire()\'s range and is NOT the ramp\'s top range', () => {
    expect(EFFECTS_PRESET_BASE_SWAP_LINE_RANGE).toEqual({ min: 3, max: 223 });
    // ⚠ The distinction a reader will otherwise assume away. A ramp's `top` maxes
    // at 222 because a run needs a line after it; a single fire reaches 223.
    expect(EFFECTS_PRESET_BASE_SWAP_LINE_RANGE.max)
      .toBeGreaterThan(EFFECTS_PRESET_RAMP_TOP_RANGE.max);
  });

  it('target is a VRAM byte address, 0..65535, on an $2000 granule', () => {
    expect(EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE).toEqual({ min: 0, max: 65535 });
    expect(EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE).toBe(0x2000);
    // The granule is not vacuous: it must actually exclude values the range
    // admits, or it is a constraint that refuses nothing.
    const span = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max
      - EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min + 1;
    expect(span % EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE).toBe(0);
    expect(span / EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE).toBe(8);
  });

  it('WHAT 57344 MEANS: $E000, VRAM_PLANE_B, seven granules up', () => {
    // The comment that makes the key legible, asserted so it cannot rot: the
    // shipped target is Plane B's nametable base, and it is granule-aligned.
    expect(BASE_SWAP.target).toBe(0xE000);
    expect(BASE_SWAP.target / EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE).toBe(7);
    expect(isBaseSwapTargetAligned(BASE_SWAP.target)).toBe(true);
  });

  it('isBaseSwapTargetAligned refuses off-granule and out-of-range, and does NOT snap', async () => {
    expect(isBaseSwapTargetAligned(0)).toBe(true);
    expect(isBaseSwapTargetAligned(57344)).toBe(true);
    expect(isBaseSwapTargetAligned(57345)).toBe(false);
    expect(isBaseSwapTargetAligned(65536)).toBe(false);
    expect(isBaseSwapTargetAligned(-8192)).toBe(false);
    expect(isBaseSwapTargetAligned(8192.5)).toBe(false);
    // There is deliberately no snap helper: rounding 57345 to 57344 would draw
    // a different plane's picture without saying so.
    expect((await import('../../src/core/formats/effects/preset')) as Record<string, unknown>)
      .not.toHaveProperty('snapBaseSwapTarget');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `multipleOf` — THE KEYWORD THIS SCHEMA IS THE FIRST TO USE
// ═══════════════════════════════════════════════════════════════════════════
//
// A misaligned target is the failure with NO other symptom: reg $02 drops the
// low bits SILENTLY, so the VDP fetches from a different address than every
// VRAM_* consumer uses and nothing else looks wrong. If the validator ignored
// the keyword, every shape row above would still pass.
describe('multipleOf actually asserts, and is not ignored', () => {
  it('refuses 57345 and names the granule', () => {
    const issues = validateAgainstSchema(
      { ...base, base_swap: { line: 160, target: 57345 } }, S,
    );
    expect(
      issues,
      'a target one byte off the $2000 granule was ACCEPTED. Reg $02 encodes only the address '
      + 'bits above the granule and drops the rest silently, so this authors a DIFFERENT VRAM '
      + 'address with nothing else visibly wrong.',
    ).not.toEqual([]);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/not a multiple of 8192/);
    expect(issues.map((i) => i.path)).toContain('/base_swap/target');
  });

  it('accepts every one of the eight aligned addresses, and refuses their neighbours', () => {
    const g = EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE;
    for (let t = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min;
      t <= EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max; t += g) {
      expect(validateAgainstSchema({ ...base, base_swap: { line: 160, target: t } }, S))
        .toEqual([]);
      expect(validateAgainstSchema({ ...base, base_swap: { line: 160, target: t + 1 } }, S))
        .not.toEqual([]);
    }
  });

  it('the keyword is on the SUPPORTED list, so the walker does not refuse the file', async () => {
    // Before this parcel the validator threw UnsupportedSchemaError rather than
    // ignoring the keyword — the loud-on-unmeasurable behaviour that made the
    // section-6 document unopenable in a *different* way. Both the per-node
    // check and the whole-schema walk must clear.
    const { SUPPORTED_KEYWORDS, assertSchemaSupported } =
      await import('../../src/core/formats/effects/json-schema-subset');
    expect(SUPPORTED_KEYWORDS.has('multipleOf')).toBe(true);
    expect(() => assertSchemaSupported(S)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE TWO ASYMMETRIES WITH `ramp`, READ OUT OF THE SCHEMA'S OWN PROSE
// ═══════════════════════════════════════════════════════════════════════════
describe('base_swap is neither capability-gated nor DEBUG-gated', () => {
  const desc = String(
    ((EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).base_swap).description ?? '',
  );

  it('the schema says NO capability bit gates it — unlike ramp\'s CAP_DENSE_TIER', () => {
    // Read, not restated. If aeon ever DOES gate it, this sentence moves and the
    // row goes red rather than the codec's comment quietly lying.
    expect(desc).toMatch(/NO capability bit gates it/);
    expect(desc).toMatch(/OP_SET_REG dispatches unconditionally/);
    // The contrast is real: ramp's own description names the capability.
    const rampDesc = String(
      ((EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).ramp).description ?? '',
    );
    expect(rampDesc).toMatch(/CAP_DENSE_TIER/);
    expect(desc).not.toMatch(/CAP_DENSE_TIER \(\$0200\)/);
  });

  it('the schema says the generated emission is NOT DEBUG-gated', () => {
    expect(desc).toMatch(/NOT DEBUG-gated/);
    expect(desc).toMatch(/unconditional pub data reaching s4\.bin/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE DOCUMENT THAT COULD NOT BE OPENED — aeon's real shipped section-6 preset
// ═══════════════════════════════════════════════════════════════════════════
//
// This is the live consequence the vendor exists to fix: aeon shipped
// games/sonic4/data/editor/effects/presets/ojz_sec6_baseswap.json bound through
// section_6.meta.json's rasterRef, and against the PREVIOUS vendored schema
// Aurora refused it at parse ("unknown property \"base_swap\"") — so an author
// could not open section 6 at all.
// ⚠ THESE ROWS READ A VENDORED FIXTURE, NOT AEON'S WORKING TREE — bar 19.
//
// Until 2026-09-04 they read the two files above out of `siblingPathOrUnresolved('aeon')`
// and compared them against constants spelled out here: `BASE_SWAP` and a
// nine-line serialized string, both carrying `"line": 160`. On 2026-09-03 the
// owner moved the swap to the top of the frame (aeon 8bf6df74, committed and
// pushed) and both rows went red — for a change in a peer repo, in a suite whose
// job is to report on Aurora's code. The agent that hit them filed them as
// "pre-existing, not mine" and moved on, which is precisely the triage failure
// bar 19 was written from.
//
// The repair is the bar's own shape: SEPARATE THE TWO QUESTIONS.
//   · "does OUR codec open, keep and re-write this document?" — a property of
//     our code, answered here against a pin, with every expectation DERIVED from
//     the vendored bytes rather than restated as a constant. A constant that
//     restates the document is not a stronger assertion, it is a second copy of
//     the document that can go stale — which is exactly what happened.
//   · "is that pin still what aeon ships?" — a pinned blob can NEVER answer it,
//     so it lives in test/formats/aeon-fixture-currency.test.ts, which reads
//     aeon at a COMMITTED revision, names it, fails on drift with a
//     NOT AN AURORA REGRESSION prefix, and skips LOUDLY when it cannot run.
//     Both fixtures below are rows in that file's table, and its completeness
//     row fails if one is ever vendored and not listed there.
//
// The loud skip that used to guard these rows is GONE ON PURPOSE, and that is
// not a regression to silence: a vendored fixture is committed here, so "could
// not reach aeon" is no longer a state these rows can be in. A skip branch that
// can never execute is itself the vacuous construct bar 2e names. The
// loud-skip discipline did not disappear, it MOVED to the currency file, where
// unmeasurability is real — see docs/reviews/2026-09-04-baseswap-vendor-fixture.md.
const FIXTURES = resolve(__dirname, '../fixtures/effects');
const SHIPPED = join(FIXTURES, 'ojz_sec6_baseswap.json');
const META = join(FIXTURES, 'ojz_act1_section_6.meta.json');
/** The id the codec must bind — DERIVED from the fixture's filename, which is the rule under test. */
const SHIPPED_STEM = basename(SHIPPED, '.json');

const SHIPPED_TEXT = readFileSync(SHIPPED, 'utf8');
/** The document as plain JSON. Every expectation below is derived from THIS, never from a constant. */
const RAW = JSON.parse(SHIPPED_TEXT) as Record<string, unknown>;

/**
 * An INDEPENDENT canonicaliser: recursive alphabetical key order, two-space
 * indent, trailing newline (aeon §5). Deliberately written from the spec rather
 * than by calling `serializeEffectsPreset`, so the round-trip row compares the
 * writer against a second implementation instead of against itself.
 */
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
};

describe('the shipped section-6 document opens', () => {
  it('parses through the real codec, with the id/filename rule enforced', () => {
    const preset = parseEffectsPreset(SHIPPED_TEXT, SHIPPED_STEM);
    // The filename rule: the codec binds `id` to the stem it was handed, and
    // refuses a document whose own `id` disagrees.
    expect(preset.id).toBe(SHIPPED_STEM);
    expect(() => parseEffectsPreset(SHIPPED_TEXT, 'a_different_stem')).toThrow(EffectsPresetError);

    // The channel is DERIVED from the document rather than named here: whichever
    // one of the three raster keys the document carries is the one the codec
    // must report. If aeon re-authors section 6 as a `bands` document this row
    // follows it instead of going red about a number.
    const RASTER_KEYS = ['bands', 'ramp', 'base_swap'] as const;
    const present = RASTER_KEYS.filter((k) => k in RAW);
    expect(present, 'the vendored document must carry exactly one raster program').toHaveLength(1);
    expect(presetRasterChannel(preset)).toBe(present[0]);
    for (const k of RASTER_KEYS) {
      if (k !== present[0]) expect(preset[k]).toBeUndefined();
    }

    // WHAT THE CODEC IS RESPONSIBLE FOR, over the channel it did parse: the
    // exact declared key set, numbers left as numbers, values not rewritten.
    // `toEqual(RAW.base_swap)` is not a tautology — the codec could have
    // coerced, defaulted, renamed or rescaled, and this is what says it did not.
    const swap = preset.base_swap as EffectsPresetBaseSwap;
    expect(Object.keys(swap).sort()).toEqual([...EFFECTS_PRESET_BASE_SWAP_KEYS].sort());
    expect(swap).toEqual(RAW.base_swap);
    expect(Number.isInteger(swap.line) && Number.isInteger(swap.target)).toBe(true);

    // …and that the document aeon ships is one the CONTRACT admits. These read
    // the schema's own bounds, so they fail if aeon ever ships a preset the
    // editor would have to refuse — the real "can an author open section 6?".
    expect(swap.line).toBeGreaterThanOrEqual(EFFECTS_PRESET_BASE_SWAP_LINE_RANGE.min);
    expect(swap.line).toBeLessThanOrEqual(EFFECTS_PRESET_BASE_SWAP_LINE_RANGE.max);
    expect(swap.target).toBeGreaterThanOrEqual(EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min);
    expect(swap.target).toBeLessThanOrEqual(EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max);
    expect(isBaseSwapTargetAligned(swap.target)).toBe(true);
    expect(validateAgainstSchema(RAW, S)).toEqual([]);
  });

  it('is what section 6 is BOUND to — the reason the editor had to open it', () => {
    // A claim about the vendored PAIR, both pinned at the same aeon revision:
    // the section's rasterRef names the id the codec parsed out of the preset
    // beside it. It fails if one of the two is ever re-vendored alone.
    const meta = JSON.parse(readFileSync(META, 'utf8')) as { rasterRef: string | null };
    const preset = parseEffectsPreset(SHIPPED_TEXT, SHIPPED_STEM);
    expect(meta.rasterRef).toBe(preset.id);
  });

  it('round-trips byte-for-byte through serialize, inventing and dropping nothing', () => {
    const preset = parseEffectsPreset(SHIPPED_TEXT, SHIPPED_STEM);
    const written = serializeEffectsPreset(preset);

    // ⚠ NOT `serialize(parse(x)) === x`: aeon authors id/name/schema/base_swap
    // and canonical order is alphabetical, so the input is NOT canonical and
    // that identity would be false for a correct writer. The property is
    // "the writer emits the canonical rendering of what it read", and the
    // expectation is computed above by a second implementation.
    expect(written).toBe(`${JSON.stringify(canonical(RAW), null, 2)}\n`);

    // The two halves of "inventing and dropping nothing", stated separately so a
    // failure says which one broke.
    expect(JSON.parse(written)).toEqual(RAW);
    expect(Object.keys(JSON.parse(written) as object)).toEqual(Object.keys(RAW).sort());

    // Idempotent: a second pass through the codec changes nothing, so an editor
    // that opens and saves without editing does not churn the file.
    expect(serializeEffectsPreset(parseEffectsPreset(written, SHIPPED_STEM))).toBe(written);
  });

  it('THE CONTROL: the writer pads no absent channel onto a base_swap document', () => {
    const preset = parseEffectsPreset(SHIPPED_TEXT, SHIPPED_STEM);
    const written = JSON.parse(serializeEffectsPreset(preset)) as Record<string, unknown>;
    // Anti-vacuous: the schema DECLARES every one of these, so the writer had
    // every opportunity to emit them. A writer that defaulted `bands: []` would
    // author the both-keys document the oneOf refuses, on every save.
    for (const k of ['bands', 'ramp', 'cycles', 'variants', 'patch_world_ys', 'patch_motion']) {
      expect(EFFECTS_PRESET_ROOT_KEYS).toContain(k);
      expect(written).not.toHaveProperty(k);
    }
  });
});
