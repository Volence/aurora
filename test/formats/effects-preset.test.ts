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
  type EffectsPreset, type EffectsPresetCycleChannel, type EffectsPresetPalVariant,
} from '../../src/core/formats/effects/preset';
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
