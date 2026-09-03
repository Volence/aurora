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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { siblingPathOrUnresolved } from '../support/sibling-root.mjs';
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
 * THE SHIPPED SECTION-6 DOCUMENT'S OWN VALUES — line 160, target $E000.
 *
 * Not invented for this file: aeon bound exactly this at 850d4c60 and the
 * contract published it as its one new PASS vector. `the shipped section-6
 * document` describe block below reads the real file off disk when aeon is
 * present and asserts these are its values, so this constant cannot drift into
 * being a fixture nobody ships.
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
const AEON = siblingPathOrUnresolved('aeon');
const SHIPPED = join(AEON, 'games/sonic4/data/editor/effects/presets/ojz_sec6_baseswap.json');
const META = join(AEON, 'games/sonic4/data/editor/ojz/act1/section_6.meta.json');

describe('the shipped section-6 document opens', () => {
  // ⚠ SKIPPED WITH A REASON, NEVER QUIETLY: a row that cannot reach aeon's tree
  // measured NOTHING, and a green total that swallowed it would be the silent
  // zero this suite is not allowed to have.
  const need = (ctx: { skip: (reason: string) => void }): boolean => {
    if (existsSync(SHIPPED) && existsSync(META)) return true;
    ctx.skip(`SKIPPED, NOT PASSED: no aeon checkout at ${AEON} — this row opens aeon's REAL `
      + 'shipped preset and its section binding, and could not. The synthetic rows above still '
      + 'ran; what is unmeasured here is whether the document aeon actually ships opens.');
    return false;
  };

  it('parses through the real codec, with the id/filename rule enforced', (ctx) => {
    if (!need(ctx)) return;
    const text = readFileSync(SHIPPED, 'utf8');
    const preset = parseEffectsPreset(text, 'ojz_sec6_baseswap');
    expect(preset.id).toBe('ojz_sec6_baseswap');
    expect(presetRasterChannel(preset)).toBe('base_swap');
    // Its values ARE the ones this file's constant carries, so BASE_SWAP above
    // is aeon's document and not a fixture invented here.
    expect(preset.base_swap).toEqual(BASE_SWAP);
    expect(preset.bands).toBeUndefined();
    expect(preset.ramp).toBeUndefined();
  });

  it('is what section 6 is BOUND to — the reason the editor had to open it', (ctx) => {
    if (!need(ctx)) return;
    const meta = JSON.parse(readFileSync(META, 'utf8')) as { rasterRef: string | null };
    expect(meta.rasterRef).toBe('ojz_sec6_baseswap');
  });

  it('round-trips byte-for-byte through serialize, inventing and dropping nothing', (ctx) => {
    if (!need(ctx)) return;
    const preset = parseEffectsPreset(readFileSync(SHIPPED, 'utf8'), 'ojz_sec6_baseswap');
    // Asserted against a SPELLED-OUT string, not against another serialize()
    // call, so this measures the bytes rather than the writer agreeing with
    // itself. Canonical order is alphabetical, recursively (aeon §5).
    expect(serializeEffectsPreset(preset)).toBe([
      '{',
      '  "base_swap": {',
      '    "line": 160,',
      '    "target": 57344',
      '  },',
      '  "id": "ojz_sec6_baseswap",',
      '  "name": "OJZ act 1 section 6 - mid-frame nametable base swap (EFFECTS-W1 item 11a)",',
      '  "schema": 1',
      '}',
      '',
    ].join('\n'));
  });

  it('THE CONTROL: the writer pads no absent channel onto a base_swap document', (ctx) => {
    if (!need(ctx)) return;
    const preset = parseEffectsPreset(readFileSync(SHIPPED, 'utf8'), 'ojz_sec6_baseswap');
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
