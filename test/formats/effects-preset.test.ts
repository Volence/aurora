// The raster PRESET codec — `presets/<preset_id>.json`.
//
// CONTRACT, both halves, pinned and read through git OBJECTS:
//   • empyrean contract/schema/aurora-effects-preset.schema.json — the
//     NORMATIVE writer-side half, vendored beside the codec. The pin of record
//     (revision and blob) is the provenance sidecar, NOT this comment;
//     effects-preset-schema-drift.test.ts is the gate that hashes it, and
//     effects-preset-vectors.test.ts runs the contract's own vectors.
//   • aeon docs/EDITOR_RASTER_PRESETS.md, blob
//     94db6b3a52c33d4e59011ba7043b8b9827fab38b at aeon origin/master — a WORKED
//     EXAMPLE that says of itself "This page is NOT an authority on the format".
//     Its §D document is used below as a ROUND-TRIP FIXTURE, which is the one
//     thing a worked example is unimpeachable for.
//
// WHAT THIS FILE DOES NOT TEST, DELIBERATELY: any numeric bound. aeon's §E.4 is
// that a writer must forward what the author typed so the ENGINE's refusal
// carries the measurement behind the rule. A range assertion here would be the
// clamp that ruling forbids, wearing a test's hat.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../src/core/project/adapter';
import {
  parseEffectsPreset, serializeEffectsPreset, loadEffectsPresetLibrary,
  effectsPresetDir, effectsPresetPath, presetIdFromFileName,
  presetArmIssue, presetArmFields,
  EffectsPresetError, EFFECTS_PRESET_BAND_KEYS, EFFECTS_PRESET_ON_ARMS,
  EFFECTS_PRESET_RESERVED_KEYS, EFFECTS_PRESET_ID_PATTERN, EFFECTS_PRESET_ROOT_KEYS,
  EFFECTS_PRESET_SCHEMA, presetDefFields,
  EFFECTS_PRESET_MAX_PATCH, EFFECTS_PRESET_WORLD_Y_RANGE, EFFECTS_PRESET_PATCH_ANCHOR_NONE,
  EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL,
  ANCHOR_AMP_RUNGS, ANCHOR_PERIOD_RUNGS, ANCHOR_PHASE_RANGE,
  anchorAmpRungForPeakPx, anchorPeriodRungForTicks, anchorSnapPeakPx, anchorSnapCycleSeconds,
  type EffectsPreset, type EffectsPresetCycleChannel, type EffectsPresetPalVariant,
} from '../../src/core/formats/effects/preset';
import { validateAgainstSchema, type JsonSchema } from '../../src/core/formats/effects/json-schema-subset';
import { canonicalJsonPretty } from '../../src/core/formats/canonical-json';

/**
 * aeon's own §D document, `authored_probe.json`, in the canonical form its page
 * describes: `sort_keys=True, indent=2`, keys alphabetical RECURSIVELY, plus the
 * trailing newline the §8 file-form rule adds.
 */
const AUTHORED_PROBE = JSON.stringify({
  bands: [
    { bot: 156, on: { cram: { addr: 74, colours: [14] } }, sh: false, top: 112 },
    { bot: 216, on: { cram: { addr: 74, colours: [3584] } }, sh: false, top: 172 },
  ],
  id: 'authored_probe',
  name: 'Authored probe (red / blue)',
  schema: 1,
}, null, 2) + '\n';

const MINIMAL = JSON.stringify({
  bands: [{ bot: 128, on: { cram: { addr: 74, colours: [14] } }, sh: false, top: 112 }],
  id: 'minimal',
  schema: 1,
}, null, 2) + '\n';

/** A copy of MINIMAL's document with `mutate` applied, serialized. */
function withDoc(mutate: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(MINIMAL) as Record<string, unknown>;
  mutate(doc);
  return JSON.stringify(doc, null, 2) + '\n';
}

/** In-memory FileAccess. A key ending in `/` is a directory. */
function memFs(files: Record<string, string>): FileAccess {
  return {
    async exists(rel) {
      if (rel.endsWith('/')) return Object.keys(files).some((k) => k.startsWith(rel));
      return rel in files;
    },
    async read(rel) {
      const text = files[rel];
      if (text === undefined) throw new Error(`ENOENT ${rel}`);
      return new TextEncoder().encode(text);
    },
    async list(relDir) {
      return Object.keys(files)
        .filter((k) => k.startsWith(relDir) && !k.slice(relDir.length).includes('/'))
        .map((k) => k.slice(relDir.length));
    },
  };
}

describe('preset paths', () => {
  it('puts presets in a SUBDIRECTORY of the scene library, which is the contract', () => {
    expect(effectsPresetDir('games/sonic4/data/'))
      .toBe('games/sonic4/data/editor/effects/presets/');
    expect(effectsPresetPath('games/sonic4/data/', 'authored_probe'))
      .toBe('games/sonic4/data/editor/effects/presets/authored_probe.json');
  });

  it('claims only .json filenames', () => {
    expect(presetIdFromFileName('authored_probe.json')).toBe('authored_probe');
    expect(presetIdFromFileName('table.bin')).toBeNull();
    expect(presetIdFromFileName('presets')).toBeNull();
  });
});

describe('constants are DERIVED from the schema, not typed beside it', () => {
  it('reads the band key set out of the schema', () => {
    // The four keys aeon's machine-checked §B list names, sorted for comparison
    // because the schema's `required` order is its own.
    expect([...EFFECTS_PRESET_BAND_KEYS].sort()).toEqual(['bot', 'on', 'sh', 'top']);
  });

  it('reads the two ON arms, and vsram is NOT one of them', () => {
    expect([...EFFECTS_PRESET_ON_ARMS].sort()).toEqual(['cram', 'pal_region']);
    expect(EFFECTS_PRESET_ON_ARMS).not.toContain('vsram');
  });

  it('reads each arm\'s required fields', () => {
    expect([...presetArmFields('cram')].sort()).toEqual(['addr', 'colours']);
    expect([...presetArmFields('pal_region')].sort())
      .toEqual(['addr', 'count', 'entry', 'pal_line', 'slot']);
  });

  /**
   * At 6664b61 the sentence named three: cycles, fires, variants. At 12aecd5
   * the schema DECLARES cycles and variants and the sentence names only fires —
   * so the derivation is checked against the schema's own `properties`, not a
   * typed list: a reserved name is never also a declared one, and the declared
   * set carries exactly the two the amendment moved across.
   */
  it('derives the reserved wave-2 names from the schema\'s own sentence', () => {
    const declared = Object.keys(EFFECTS_PRESET_SCHEMA.properties as Record<string, unknown>);
    expect(EFFECTS_PRESET_RESERVED_KEYS.length).toBeGreaterThan(0);
    expect(EFFECTS_PRESET_RESERVED_KEYS.filter((k) => declared.includes(k))).toEqual([]);
    expect(EFFECTS_PRESET_RESERVED_KEYS).toContain('fires');
    expect(declared).toEqual(expect.arrayContaining(['cycles', 'variants']));
    expect(EFFECTS_PRESET_ROOT_KEYS).toEqual(declared);
  });

  /**
   * THE INTERFACES ARE TRANSCRIPTIONS OF THE SCHEMA'S $defs, AND THIS IS THE
   * CHECK THAT THEY STAY ONE. TypeScript cannot enumerate an interface at run
   * time, so each object literal below is typed as a Record over the
   * interface's keys (all of them, then only the REQUIRED ones): tsc refuses
   * the literal if a key is added to or dropped from the interface, and the
   * assertion refuses it if the literal stops matching the vendored schema. A
   * field renamed in a future amendment fails here, in words, before any codec
   * silently carries the old name.
   */
  type RequiredKeys<T> = { [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K }[keyof T];

  it('EffectsPresetCycleChannel is the schema\'s $defs.cycle_channel, field for field', () => {
    const all: Record<keyof EffectsPresetCycleChannel, true> =
      { line: true, first: true, count: true, period: true, dir: true };
    const required: Record<RequiredKeys<EffectsPresetCycleChannel>, true> =
      { line: true, first: true, count: true, period: true };
    const fields = presetDefFields('cycle_channel');
    expect(Object.keys(all).sort()).toEqual([...fields.required, ...fields.optional].sort());
    expect(Object.keys(required).sort()).toEqual([...fields.required].sort());
    // Anti-vacuous, and the schema's own words: dir is THE ONLY optional field.
    expect(fields.optional).toEqual(['dir']);
  });

  it('EffectsPresetPalVariant is the schema\'s $defs.pal_variant, field for field', () => {
    const all: Record<keyof EffectsPresetPalVariant, true> = {
      shift_r: true, bias_r: true, shift_g: true, bias_g: true, shift_b: true, bias_b: true, lines: true,
    };
    const required: Record<RequiredKeys<EffectsPresetPalVariant>, true> = {};
    const fields = presetDefFields('pal_variant');
    expect(Object.keys(all).sort()).toEqual([...fields.optional].sort());
    // EVERY FIELD IS OPTIONAL — the schema declares no `required` at all.
    expect(Object.keys(required)).toEqual([]);
    expect(fields.required).toEqual([]);
    expect(fields.optional.length).toBe(7);
  });

  it('reads the id pattern out of the schema', () => {
    expect(EFFECTS_PRESET_ID_PATTERN.source).toBe('^[a-z][a-z0-9_]{0,31}$');
    expect(EFFECTS_PRESET_ID_PATTERN.test('authored_probe')).toBe(true);
    // Aurora's BG-library slugs are hyphenated, and a preset id becomes an .emp
    // symbol component. A good bgLayoutRef is not a good preset id.
    expect(EFFECTS_PRESET_ID_PATTERN.test('forest-1718000000')).toBe(false);
    expect(EFFECTS_PRESET_ID_PATTERN.test('Authored')).toBe(false);
  });
});

describe('reading a preset', () => {
  it('accepts aeon\'s own worked-example document verbatim', () => {
    const p = parseEffectsPreset(AUTHORED_PROBE, 'authored_probe');
    expect(p.id).toBe('authored_probe');
    expect(p.bands).toHaveLength(2);
    expect(p.bands[0]).toEqual({
      top: 112, bot: 156, sh: false, on: { cram: { addr: 74, colours: [14] } },
    });
  });

  it('refuses malformed JSON loudly instead of yielding an empty preset', () => {
    expect(() => parseEffectsPreset('{ nope', 'minimal')).toThrow(EffectsPresetError);
    expect(() => parseEffectsPreset('{ nope', 'minimal')).toThrow(/is not valid JSON/);
  });

  it('refuses a schema version other than 1, naming the absence of migration', () => {
    expect(() => parseEffectsPreset(withDoc((d) => { d.schema = 2; }), 'minimal'))
      .toThrow(/wave 2 refuses anything but 1[\s\S]*contract change to both halves/);
  });

  it('refuses a filename/id mismatch, because the id becomes a symbol', () => {
    expect(() => parseEffectsPreset(MINIMAL, 'other_stem'))
      .toThrow(/the filename stem and the id must match/);
  });

  it('refuses an empty bands list', () => {
    expect(() => parseEffectsPreset(withDoc((d) => { d.bands = []; }), 'minimal'))
      .toThrow(/minimum 1/);
  });

  it('refuses an unknown key — the schema is CLOSED', () => {
    expect(() => parseEffectsPreset(withDoc((d) => { d.wobble = 3; }), 'minimal'))
      .toThrow(/unknown property "wobble"/);
  });

  it('refuses a RESERVED wave-2 name by name, not as a typo', () => {
    for (const key of EFFECTS_PRESET_RESERVED_KEYS) {
      const text = withDoc((d) => { d[key] = []; });
      expect(() => parseEffectsPreset(text, 'minimal'), key)
        .toThrow(/RESERVED wave-2 vocabulary[\s\S]*has not built it/);
    }
  });

  it('carries `name` through as writer-owned, and does not require it', () => {
    expect(parseEffectsPreset(MINIMAL, 'minimal').name).toBeUndefined();
    expect(parseEffectsPreset(AUTHORED_PROBE, 'authored_probe').name)
      .toBe('Authored probe (red / blue)');
  });

  it('accepts sh as a boolean OR as 0/1, and refuses anything else', () => {
    for (const sh of [true, false, 0, 1]) {
      const text = withDoc((d) => { (d.bands as Record<string, unknown>[])[0].sh = sh; });
      expect(() => parseEffectsPreset(text, 'minimal'), JSON.stringify(sh)).not.toThrow();
    }
    const bad = withDoc((d) => { (d.bands as Record<string, unknown>[])[0].sh = 2; });
    expect(() => parseEffectsPreset(bad, 'minimal')).toThrow(/allowed forms/);
  });

  it('refuses a band missing ANY of the four keys — none has a default', () => {
    for (const key of EFFECTS_PRESET_BAND_KEYS) {
      const text = withDoc((d) => { delete (d.bands as Record<string, unknown>[])[0][key]; });
      expect(() => parseEffectsPreset(text, 'minimal'), key)
        .toThrow(new RegExp(`missing required property "${key}"`));
    }
  });
});

describe('the exactly-one-arm rule', () => {
  it('refuses ZERO arms, in words about what a band is', () => {
    expect(presetArmIssue({})).toMatch(/declares no arm[\s\S]*turns nothing on/);
    const text = withDoc((d) => { (d.bands as Record<string, unknown>[])[0].on = {}; });
    expect(() => parseEffectsPreset(text, 'minimal')).toThrow(/declares no arm/);
  });

  it('refuses TWO arms, naming why two writes cannot share a band', () => {
    const two = { cram: { addr: 74, colours: [1] }, pal_region: {} };
    expect(presetArmIssue(two))
      .toMatch(/declares 2 arms[\s\S]*two restores, which is two bands/);
    const text = withDoc((d) => { (d.bands as Record<string, unknown>[])[0].on = two; });
    expect(() => parseEffectsPreset(text, 'minimal')).toThrow(/declares 2 arms/);
  });

  it('refuses an UNKNOWN arm, and says why vsram is not one', () => {
    expect(presetArmIssue({ vsram: { addr: 0 } }))
      .toMatch(/"vsram", which is not an ON arm[\s\S]*VSRAM op has none/);
    const text = withDoc((d) => {
      (d.bands as Record<string, unknown>[])[0].on = { vsram: { addr: 0 } };
    });
    expect(() => parseEffectsPreset(text, 'minimal')).toThrow(/not an ON arm/);
  });

  it('accepts exactly one arm, either one', () => {
    expect(presetArmIssue({ cram: { addr: 74, colours: [1] } })).toBeNull();
    expect(presetArmIssue({ pal_region: {} })).toBeNull();
  });

  it('does not tell the author about one defect in two vocabularies', () => {
    const text = withDoc((d) => { (d.bands as Record<string, unknown>[])[0].on = {}; });
    let issues: string[] = [];
    try { parseEffectsPreset(text, 'minimal'); } catch (e) {
      issues = (e as EffectsPresetError).issues;
    }
    // ANTI-VACUOUS: it really did report the arm defect...
    expect(issues.some((i) => /declares no arm/.test(i))).toBe(true);
    // ...and did NOT also emit the schema's generic oneOf complaint for it.
    expect(issues.some((i) => /allowed forms/.test(i))).toBe(false);
  });

  it('accepts pal_region as an arm the panel can author', () => {
    const text = withDoc((d) => {
      (d.bands as Record<string, unknown>[])[0].on = {
        pal_region: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 1 },
      };
    });
    expect(() => parseEffectsPreset(text, 'minimal')).not.toThrow();
  });
});

describe('writing a preset', () => {
  it('round-trips aeon\'s worked-example document BYTE-FOR-BYTE', () => {
    const p = parseEffectsPreset(AUTHORED_PROBE, 'authored_probe');
    expect(serializeEffectsPreset(p)).toBe(AUTHORED_PROBE);
  });

  it('DETERMINISM: different insertion orders, identical content -> identical bytes', () => {
    const a: EffectsPreset = {
      schema: 1, id: 'minimal',
      bands: [{ top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [14] } } }],
    };
    const b = JSON.parse(JSON.stringify({
      bands: [{ on: { cram: { colours: [14], addr: 74 } }, sh: false, bot: 128, top: 112 }],
      id: 'minimal', schema: 1,
    })) as EffectsPreset;
    expect(serializeEffectsPreset(a)).toBe(serializeEffectsPreset(b));
  });

  it('sorts keys alphabetically and RECURSIVELY — aeon\'s normative sort_keys=True', () => {
    const text = serializeEffectsPreset(parseEffectsPreset(AUTHORED_PROBE, 'authored_probe'));
    // The band object reads bot, on, sh, top — not the order a human types.
    expect(text.indexOf('"bot"')).toBeLessThan(text.indexOf('"on"'));
    expect(text.indexOf('"on"')).toBeLessThan(text.indexOf('"sh"'));
    expect(text.indexOf('"sh"')).toBeLessThan(text.indexOf('"top"'));
    // And the arm body sorts too: addr before colours.
    expect(text.indexOf('"addr"')).toBeLessThan(text.indexOf('"colours"'));
  });

  it('ends in exactly one newline', () => {
    const text = serializeEffectsPreset(parseEffectsPreset(MINIMAL, 'minimal'));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('REFUSES to write an invalid document rather than emitting one', () => {
    const bad = { schema: 1, id: 'minimal', bands: [] } as unknown as EffectsPreset;
    expect(() => serializeEffectsPreset(bad)).toThrow(/refusing to write preset/);
  });

  it('ROUND-TRIPS A DOCUMENT AURORA DID NOT AUTHOR, including an sh spelled 0/1', () => {
    // A hand-written document using integers for `sh`. Normalising it to a
    // boolean would put a diff on every load/save of the author's file.
    const handWritten = JSON.stringify({
      bands: [
        { bot: 216, on: { pal_region: { addr: 74, count: 2, entry: 5, pal_line: 2, slot: 1 } },
          sh: 1, top: 172 },
      ],
      id: 'hand',
      name: 'written by a person',
      schema: 1,
    }, null, 2) + '\n';
    const p = parseEffectsPreset(handWritten, 'hand');
    expect(serializeEffectsPreset(p)).toBe(handWritten);
  });
});

describe('the preset library', () => {
  const ROOT = 'games/sonic4/data/';
  const DIR = effectsPresetDir(ROOT);

  it('an ABSENT directory is "no presets yet", not an error', async () => {
    const lib = await loadEffectsPresetLibrary(memFs({}), ROOT);
    expect(lib.presets).toEqual([]);
    expect(lib.unreadable).toEqual([]);
    expect(lib.notices).toEqual([]);
  });

  it('loads every .json and skips everything else', async () => {
    const lib = await loadEffectsPresetLibrary(memFs({
      [`${DIR}authored_probe.json`]: AUTHORED_PROBE,
      [`${DIR}minimal.json`]: MINIMAL,
      [`${DIR}notes.txt`]: 'ignored',
    }), ROOT);
    expect(lib.presets.map((p) => p.id)).toEqual(['authored_probe', 'minimal']);
    expect(lib.notices).toEqual([]);
  });

  it('an UNREADABLE file is loud, is not a preset, and is never overwritten', async () => {
    const lib = await loadEffectsPresetLibrary(memFs({
      [`${DIR}minimal.json`]: MINIMAL,
      [`${DIR}broken.json`]: '{ not json',
    }), ROOT);
    expect(lib.presets.map((p) => p.id)).toEqual(['minimal']);
    expect(lib.unreadable.map((u) => u.path)).toEqual([`${DIR}broken.json`]);
    expect(lib.notices).toHaveLength(1);
    expect(lib.notices[0].message).toMatch(/will NOT overwrite the file/);
    // "Loud" means the toast site can tell this from a confirmation. The whole
    // notice channel used to be painted green at the consumer, so it could not.
    expect(lib.notices[0].severity).toBe('error');
  });

  it('a preset whose id disagrees with its filename lands in unreadable, not presets', async () => {
    const lib = await loadEffectsPresetLibrary(memFs({
      [`${DIR}renamed.json`]: MINIMAL,
    }), ROOT);
    expect(lib.presets).toEqual([]);
    expect(lib.unreadable[0].reason).toMatch(/filename stem and the id must match/);
  });
});

/**
 * THE ITEM-5 PRECONDITION — `cycles` and `variants` PARSE HERE.
 *
 * empyrean's CR (docs/2026-08-30-item5-cycles-variants-cr.md §4.1, schema
 * 12aecd5) makes Aurora's re-vendor a HARD PRECONDITION on any document carrying
 * either key: the codec pins the CLOSED root, so before the re-vendor a document
 * with either key was refused by Aurora's own loader — the exact defect the
 * vertical bob hit (ROADMAP row 99). These rows were RED against the 6664b61 pin
 * (refused as "RESERVED wave-2 vocabulary") and are green at 12aecd5.
 *
 * Every document below is spelled in aeon's canonical form (`sort_keys=True,
 * indent=2` + newline) so the round-trip is asserted BYTE-FOR-BYTE, which is
 * what CR §4.6 asks for: `cycles: null` must survive a save, and a `variants`
 * array with a `null` entry must keep its index — a codec that drops nulls or
 * compacts the array changes which slot is which.
 *
 * NO CONTROL AND NO UI: that is item 12's gated half. The codec accepts; nothing
 * here authors.
 */
describe('the item-5 precondition: a document carrying cycles / variants parses here', () => {
  /** MINIMAL's document plus `extra`, in canonical (alphabetical, recursive) form. */
  function canonicalWith(extra: Record<string, unknown>): string {
    return canonicalJsonPretty({ ...(JSON.parse(MINIMAL) as Record<string, unknown>), ...extra });
  }

  it('`cycles: null` — cycling OFF — parses, is NOT read as absent, and survives a save', () => {
    const text = canonicalWith({ cycles: null });
    const p = parseEffectsPreset(text, 'minimal');
    expect('cycles' in p).toBe(true);
    expect(p.cycles).toBeNull();
    expect(serializeEffectsPreset(p)).toBe(text);
  });

  it('a one-slot `variants` array parses and survives a save', () => {
    const text = canonicalWith({ variants: [{ shift_g: 1, shift_r: 1 }] });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.variants).toEqual([{ shift_r: 1, shift_g: 1 }]);
    expect(serializeEffectsPreset(p)).toBe(text);
  });

  it('a one-channel cycle script parses and survives a save', () => {
    const text = canonicalWith({ cycles: [{ count: 4, first: 8, line: 2, period: 8 }] });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.cycles).toEqual([{ line: 2, first: 8, count: 4, period: 8 }]);
    expect(serializeEffectsPreset(p)).toBe(text);
  });

  it('`variants: [null, {...}]` keeps the null AT ITS INDEX through a save (index = slot)', () => {
    const text = canonicalWith({ variants: [null, { lines: 12, shift_g: 1 }] });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.variants).toHaveLength(2);
    expect(p.variants?.[0]).toBeNull();
    expect(serializeEffectsPreset(p)).toBe(text);
  });

  it('an UNKNOWN root key is still refused — the root stays closed', () => {
    expect(() => parseEffectsPreset(canonicalWith({ wobble: 3 }), 'minimal'))
      .toThrow(/unknown property "wobble"/);
  });

  it('`cycles` and `variants` are no longer RESERVED; `fires` still is', () => {
    expect(EFFECTS_PRESET_RESERVED_KEYS).not.toContain('cycles');
    expect(EFFECTS_PRESET_RESERVED_KEYS).not.toContain('variants');
    expect(EFFECTS_PRESET_RESERVED_KEYS).toContain('fires');
    expect(() => parseEffectsPreset(canonicalWith({ fires: [] }), 'minimal'))
      .toThrow(/fires is RESERVED wave-2 vocabulary/);
  });
});

/**
 * ═══ THE ITEM-4 AUTHORING KEY — `patch_world_ys` AND `patch_motion` ═══
 *
 * empyrean d36d704 / AURORA_EFFECTS_SCHEMA.md §7.3, against aeon's key-shape
 * artifact `81b2a719`. Step 3 of a four-step chain: aeon named the shape, the
 * hub filed the CR, THIS is Aurora accepting and writing it, and aeon's
 * generator reads it in step 4.
 *
 * THE REFUSAL THIS REPLACES WAS REAL, and the first row below reproduces it from
 * the current bytes rather than asserting it from memory. aeon's own artifact
 * records the correction: their item-4 design said an older Aurora "erases it on
 * the next save round-trip", and that is wrong about this codec — the root is
 * CLOSED (`unevaluatedProperties: false`), so a document carrying either key was
 * refused AT PARSE and no author on a tree carrying one could open the preset at
 * all. Acceptance, not preservation, is what this parcel had to deliver.
 *
 * NO CONTROL AND NO UI. The sliders and the timeline control are EW-TIMELINE-
 * CLOCK's, a different row. The codec accepts, round-trips and writes; nothing
 * here authors.
 */
describe('the item-4 authoring key: patch_world_ys / patch_motion', () => {
  function canonicalWith(extra: Record<string, unknown>): string {
    return canonicalJsonPretty({ ...(JSON.parse(MINIMAL) as Record<string, unknown>), ...extra });
  }

  /** aeon §2.2/§2.3's own example values, so the fixtures are not invented. */
  const SEEDS = [224, 314, null, null];
  const SWEEP = { amp_shift: 4, period_shift: 1, phase: 0 };

  /**
   * THE CONTROL FOR EVERY ROW BELOW: the pre-d36d704 refusal, reproduced.
   *
   * Built by DELETING the two new properties from the vendored schema — one
   * difference from the real thing, the same evaluator, the same document — so
   * "it parses now" is a measured change and not a claim about a schema nobody
   * ran. Without this row every acceptance below could be green on a codec that
   * never refused anything.
   */
  it('WAS refused before this re-vendor, and the refusal named the closed root', () => {
    const closedWithoutThem = JSON.parse(
      JSON.stringify(EFFECTS_PRESET_SCHEMA),
    ) as { properties: Record<string, unknown> };
    // Anti-vacuous: the properties really are there to delete.
    expect(Object.keys(closedWithoutThem.properties)).toEqual(
      expect.arrayContaining(['patch_world_ys', 'patch_motion']),
    );
    delete closedWithoutThem.properties.patch_world_ys;
    delete closedWithoutThem.properties.patch_motion;

    const doc = JSON.parse(canonicalWith({ patch_world_ys: SEEDS })) as unknown;
    const before = validateAgainstSchema(doc, closedWithoutThem as unknown as JsonSchema)
      .map((i) => i.message);
    expect(before).toEqual(['unknown property "patch_world_ys" (the schema is closed)']);
    // ...and the SAME document against the real vendored schema: nothing wrong.
    expect(validateAgainstSchema(doc, EFFECTS_PRESET_SCHEMA)).toEqual([]);
  });

  it('both keys are DECLARED at the root, and neither is reserved', () => {
    expect(EFFECTS_PRESET_ROOT_KEYS).toContain('patch_world_ys');
    expect(EFFECTS_PRESET_ROOT_KEYS).toContain('patch_motion');
    expect(EFFECTS_PRESET_RESERVED_KEYS).not.toContain('patch_world_ys');
    expect(EFFECTS_PRESET_RESERVED_KEYS).not.toContain('patch_motion');
  });

  it('a seed array parses, keeps its nulls AT THEIR INDEX, and survives a save', () => {
    const text = canonicalWith({ patch_world_ys: SEEDS });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.patch_world_ys).toEqual([224, 314, null, null]);
    expect(serializeEffectsPreset(p)).toBe(text);
  });

  it('a motion array parses, keeps its nulls AT THEIR INDEX, and survives a save', () => {
    const text = canonicalWith({ patch_motion: [{ sweep: SWEEP }, null, null, null] });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.patch_motion?.[0]).toEqual({ sweep: SWEEP });
    expect(p.patch_motion?.[1]).toBeNull();
    expect(serializeEffectsPreset(p)).toBe(text);
  });

  /**
   * THE THREE STATES, ALL AT ONCE, BYTE-FOR-BYTE — the `variants` rule applied
   * to both keys in one document: index 0 authored, index 1 `null`, indices 2
   * and 3 UNREACHED (the array ends). A codec that padded a short array, dropped
   * a null, or compacted one would change which channel is which, and the byte
   * comparison is what notices.
   */
  it('unreached / null / authored all survive one round trip, byte-for-byte', () => {
    const text = canonicalWith({
      patch_world_ys: [224, null],
      patch_motion: [{ sweep: { amp_shift: 3, period_shift: 2 } }, null],
    });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.patch_world_ys).toHaveLength(2);
    expect(p.patch_motion).toHaveLength(2);
    expect(serializeEffectsPreset(p)).toBe(text);
    // A SHORT ARRAY IS NOT PADDED. If the writer had filled the tail out to
    // `EFFECTS_PRESET_MAX_PATCH`, channels 2 and 3 would stop KEEPING their
    // hand-authored value and start being AUTHORED as unused — a different
    // document that this schema accepts, so only a length can say it.
    expect(EFFECTS_PRESET_MAX_PATCH).toBeGreaterThan(2);
    const written = JSON.parse(serializeEffectsPreset(p)) as EffectsPreset;
    expect(written.patch_world_ys).toHaveLength(2);
    expect(written.patch_motion).toHaveLength(2);
  });

  it('an ABSENT key stays absent through a round trip — absent is a state, not a default', () => {
    const text = MINIMAL;
    const p = parseEffectsPreset(text, 'minimal');
    expect('patch_world_ys' in p).toBe(false);
    expect('patch_motion' in p).toBe(false);
    expect(serializeEffectsPreset(p)).toBe(text);
    expect(serializeEffectsPreset(p)).not.toContain('patch_');
  });

  it('`phase` is optional and an omitted one is NOT written back as 0', () => {
    const text = canonicalWith({ patch_motion: [{ sweep: { amp_shift: 4, period_shift: 1 } }] });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.patch_motion?.[0]).toEqual({ sweep: { amp_shift: 4, period_shift: 1 } });
    expect(serializeEffectsPreset(p)).toBe(text);
    expect(serializeEffectsPreset(p)).not.toContain('phase');
  });

  // ── The refusals the schema owns, each with the wording that names it ──

  it('refuses the SENTINEL written as an integer — "unused" is spelled null', () => {
    expect(EFFECTS_PRESET_PATCH_ANCHOR_NONE).toBe(32767);
    expect(() => parseEffectsPreset(
      canonicalWith({ patch_world_ys: [EFFECTS_PRESET_PATCH_ANCHOR_NONE] }), 'minimal',
    )).toThrow(new RegExp(`forbids the constant ${EFFECTS_PRESET_PATCH_ANCHOR_NONE}`));
    // ...and the value one below it, which is NOT the sentinel, is accepted.
    expect(() => parseEffectsPreset(
      canonicalWith({ patch_world_ys: [EFFECTS_PRESET_PATCH_ANCHOR_NONE - 1] }), 'minimal',
    )).not.toThrow();
  });

  it('refuses a seed outside the u16 range, at both ends, naming the bound', () => {
    const { min, max } = EFFECTS_PRESET_WORLD_Y_RANGE;
    expect(() => parseEffectsPreset(canonicalWith({ patch_world_ys: [max + 1] }), 'minimal'))
      .toThrow(new RegExp(`${max + 1} is above the maximum ${max}`));
    expect(() => parseEffectsPreset(canonicalWith({ patch_world_ys: [min - 1] }), 'minimal'))
      .toThrow(new RegExp(`${min - 1} is below the minimum ${min}`));
    // Both ends of the legal range are accepted, so the row is not green on a
    // schema that refuses everything.
    expect(() => parseEffectsPreset(canonicalWith({ patch_world_ys: [min, max] }), 'minimal'))
      .not.toThrow();
  });

  it('refuses a fifth channel on either key, naming the cap', () => {
    const over = Array.from({ length: EFFECTS_PRESET_MAX_PATCH + 1 }, () => null);
    for (const key of ['patch_world_ys', 'patch_motion']) {
      expect(() => parseEffectsPreset(canonicalWith({ [key]: over }), 'minimal'), key)
        .toThrow(new RegExp(
          `has ${over.length} items, maximum ${EFFECTS_PRESET_MAX_PATCH}`));
    }
    // The cap itself is legal.
    expect(() => parseEffectsPreset(
      canonicalWith({ patch_world_ys: over.slice(1) }), 'minimal')).not.toThrow();
  });

  it('refuses an `approach` arm — none exists and none is reserved', () => {
    let message = '';
    try {
      parseEffectsPreset(
        canonicalWith({ patch_motion: [{ approach: { target: 1, rate: 1 } }] }), 'minimal');
    } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/patch_motion\/0/);
    expect(message).toMatch(/unknown property "approach"/);
    expect(message).toMatch(/missing required property "sweep"/);
  });

  it('refuses zero arms and two arms, and an unknown sweep field', () => {
    const bad: Record<string, unknown>[] = [
      { patch_motion: [{}] },
      { patch_motion: [{ sweep: { amp_shift: 4, period_shift: 1 }, wobble: {} }] },
      { patch_motion: [{ sweep: { amp_shift: 4, period_shift: 1, tempo: 3 } }] },
    ];
    for (const extra of bad) {
      expect(() => parseEffectsPreset(canonicalWith(extra), 'minimal'), JSON.stringify(extra))
        .toThrow(EffectsPresetError);
    }
  });

  it('refuses a shift off the end of its ladder, naming the rung bound', () => {
    const amp = ANCHOR_AMP_RUNGS[0].amp_shift;
    const period = ANCHOR_PERIOD_RUNGS[ANCHOR_PERIOD_RUNGS.length - 1].period_shift;
    expect(() => parseEffectsPreset(
      canonicalWith({ patch_motion: [{ sweep: { amp_shift: amp - 1, period_shift: 1 } }] }),
      'minimal',
    )).toThrow(new RegExp(`${amp - 1} is below the minimum ${amp}`));
    expect(() => parseEffectsPreset(
      canonicalWith({ patch_motion: [{ sweep: { amp_shift: 4, period_shift: period + 1 } }] }),
      'minimal',
    )).toThrow(new RegExp(`${period + 1} is above the maximum ${period}`));
    expect(() => parseEffectsPreset(
      canonicalWith({ patch_motion: [{ sweep: { amp_shift: 4, period_shift: 1, phase: 256 } }] }),
      'minimal',
    )).toThrow(/256 is above the maximum 255/);
  });

  /**
   * ═══ THE UNIT. THE ONE ROW THIS PARCEL SHIPS A SILENT BUG WITHOUT ═══
   *
   * `drift.rate` is 1/256 px per frame and Aurora multiplies by 256 on export.
   * `patch_world_ys` is WHOLE PIXELS and neither side converts. A seed carried
   * through the drift habit lands 256 times down the level, `anchor - Camera_Y`
   * is enormous, and the band SILENTLY NEVER APPEARS — and the schema cannot
   * catch it, because 224 × 256 = 57344 is inside the u16 range and validates
   * clean. empyrean's §7.3 says exactly that.
   *
   * So the row asserts the value AS TYPED reaches the bytes, and it asserts the
   * scaled value would be a DIFFERENT document — which is what makes it go red
   * if anything ever routes this key through a ×256. It is not a range check:
   * 57344 is legal and stays legal (this codec clamps nothing, §E.4), it is just
   * not what the author wrote.
   */
  it('carries a world Y 1:1 — a ×256 anywhere on this path would go red here', () => {
    expect(EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL).toBe(1);
    const px = 224;
    const text = canonicalWith({ patch_world_ys: [px] });
    const p = parseEffectsPreset(text, 'minimal');
    expect(p.patch_world_ys).toEqual([px]);
    const out = serializeEffectsPreset(p);
    expect(out).toBe(text);
    expect(JSON.parse(out).patch_world_ys).toEqual([px]);
    // The drift habit's number, spelled out: it is a legal document and a
    // DIFFERENT one, so a writer that applied it could not produce these bytes.
    const scaled = px * 256;
    expect(scaled).toBeLessThanOrEqual(EFFECTS_PRESET_WORLD_Y_RANGE.max);
    expect(() => parseEffectsPreset(canonicalWith({ patch_world_ys: [scaled] }), 'minimal'))
      .not.toThrow();
    expect(out).not.toContain(String(scaled));
    expect(out).toContain(String(px));
  });

  /**
   * THE LADDERS, checked against aeon §2.4's own table — the numbers a UI slider
   * must snap to. They are DERIVED from the schema (its `minimum`/`maximum` and
   * the bases it states in prose), so this row is the check that the derivation
   * produces aeon's table and not a plausible-looking neighbour.
   */
  it('derives aeon §2.4\'s ladders: 7 amplitude rungs, 9 period rungs', () => {
    expect(ANCHOR_AMP_RUNGS.map((r) => [r.amp_shift, r.peak_px, r.peak_to_peak_px])).toEqual([
      [2, 64, 128], [3, 32, 64], [4, 16, 32], [5, 8, 16], [6, 4, 8], [7, 2, 4], [8, 1, 2],
    ]);
    expect(ANCHOR_PERIOD_RUNGS.map((r) => [r.period_shift, r.ticks])).toEqual([
      [0, 256], [1, 512], [2, 1024], [3, 2048], [4, 4096],
      [5, 8192], [6, 16384], [7, 32768], [8, 65536],
    ]);
    expect(ANCHOR_PERIOD_RUNGS.map((r) => +r.seconds.toFixed(2))).toEqual([
      4.27, 8.53, 17.07, 34.13, 68.27, 136.53, 273.07, 546.13, 1092.27,
    ]);
    expect(ANCHOR_PHASE_RANGE).toEqual({ min: 0, max: 255 });
    // The shipped hand-authored precedent, OJZ_Preset_Sec0: amp_shift 4 /
    // period_shift 1 = 32 px peak-to-peak over 8.53 s.
    expect(anchorAmpRungForPeakPx(16)?.peak_to_peak_px).toBe(32);
    expect(+anchorPeriodRungForTicks(512)!.seconds.toFixed(2)).toBe(8.53);
  });

  it('an off-ladder request is REFUSED by the exact converters and SNAPPED by the snappers', () => {
    // Exact: null, never the neighbour. A converter that rounded would be the
    // silent doubling §7.3 names.
    expect(anchorAmpRungForPeakPx(20)).toBeNull();
    expect(anchorAmpRungForPeakPx(0)).toBeNull();
    expect(anchorPeriodRungForTicks(700)).toBeNull();
    // Snap: a rung, chosen in the LOG domain, so 20 px goes to 16 (a ratio of
    // 1.25) rather than to 32 (a ratio of 1.6) — a linear nearest would say 16
    // too, but 24 px is the case that separates them.
    expect(anchorSnapPeakPx(20).peak_px).toBe(16);
    expect(anchorSnapPeakPx(23).peak_px).toBe(32);   // log-nearest; a LINEAR nearest says 16
    expect(anchorSnapPeakPx(1000).peak_px).toBe(ANCHOR_AMP_RUNGS[0].peak_px);
    expect(anchorSnapPeakPx(0).peak_px)
      .toBe(ANCHOR_AMP_RUNGS[ANCHOR_AMP_RUNGS.length - 1].peak_px);
    expect(anchorSnapCycleSeconds(9).period_shift).toBe(1);
    expect(anchorSnapCycleSeconds(0.1).period_shift).toBe(0);
  });

  /**
   * EVERY WRITER PATH, not just the codec's own. The lesson this repo paid for:
   * a field dropped by a COPIER outside the codec frame survives a 3,909-test
   * suite, because the codec's own round-trip never runs through the copier.
   * `structuredClone` is the only cloner an `EffectsPreset` has (the command
   * path's `clonePreset`), asserted here so a hand-enumerating copy added later
   * has something to break. The one literal CONSTRUCTOR, `newPreset`, lives in
   * the renderer provider and is checked from there
   * (src/renderer/providers/__tests__/effects-preset-channels.test.ts).
   */
  it('survives the whole-object clone the command path uses', () => {
    const p = parseEffectsPreset(canonicalWith({
      patch_world_ys: [224, null], patch_motion: [{ sweep: SWEEP }],
    }), 'minimal');
    const cloned = structuredClone(p);
    expect(cloned.patch_world_ys).toEqual([224, null]);
    expect(cloned.patch_motion).toEqual([{ sweep: SWEEP }]);
    expect(serializeEffectsPreset(cloned)).toBe(serializeEffectsPreset(p));
  });
});
