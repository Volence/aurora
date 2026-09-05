import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../src/core/project/adapter';
import {
  parseEffectsScene,
  serializeEffectsScene,
  loadEffectsSceneLibrary,
  advisoryLayerDeformConflicts,
  effectsSceneDir,
  effectsScenePath,
  sceneIdFromFileName,
  EFFECTS_SCENE_ID_PATTERN,
  EFFECTS_LAYER_DEFAULTS,
  EFFECTS_SCENE_SCHEMA,
  EffectsSceneError,
  type EffectsScene,
} from '../../src/core/formats/effects/scene';
import { makeBgId } from '../../src/core/formats/bg-library';
import { EFFECTS_LAYER_COUNT } from '../../src/core/formats/effects/scene-ui';

/**
 * Effects scene definition codec — wave-1 surface 1.
 *
 * Contract: empyrean docs/AURORA_EFFECTS_SCHEMA.md §2/§6/§8 at 069cf59, the
 * committed JSON schema at blob cab3ca58 (empyrean a32bcb03, CR-1), aeon
 * tools/EFFECTS_CONSUMER_CONTRACT.md §2 at 00607dd5.
 */

/**
 * The smallest legal scene: `schema`, `id`, `layers`, `v_factor` and nothing
 * else — written in §5 CANONICAL key order, which is alphabetical at every
 * depth, so it is also what the writer emits.
 *
 * It reads worse than contract order: `schema` and `id` no longer lead. §5 says
 * so in as many words and accepts the cost — "a self-describing order that
 * cannot drift is worth more than a familiar one that can".
 */
const MINIMAL = JSON.stringify({
  id: 'plain',
  layers: [{ fa: 'FACTOR_1', fb: 'FACTOR_1_2', world_y: 0 }],
  schema: 1,
  v_factor: 1,
}, null, 2) + '\n';

function withDoc(mutate: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(MINIMAL) as Record<string, unknown>;
  mutate(doc);
  return JSON.stringify(doc, null, 2);
}

/**
 * In-memory FileAccess over a Record<rel, text>, same shape as the aeon tests'.
 * A path ending in '/' is a directory and exists when anything is under it —
 * which is what a real fs reports too, and what makes the absent-directory case
 * genuinely absent rather than an artefact of the fake.
 */
function memFs(files: Record<string, string>): FileAccess {
  return {
    exists: async (rel) => rel.endsWith('/')
      ? Object.keys(files).some(p => p.startsWith(rel))
      : rel in files,
    read: async (rel) => {
      if (!(rel in files)) throw new Error(`ENOENT: ${rel}`);
      return new TextEncoder().encode(files[rel]);
    },
    list: async (relDir) => Object.keys(files)
      .filter(p => p.startsWith(relDir) && !p.slice(relDir.length).includes('/'))
      .map(p => p.slice(relDir.length)),
  };
}

describe('effects scene paths', () => {
  it('places scenes in the editor-owned effects directory', () => {
    expect(effectsSceneDir('games/sonic4/data/')).toBe('games/sonic4/data/editor/effects/');
    expect(effectsScenePath('games/sonic4/data/', 'canopy_dusk'))
      .toBe('games/sonic4/data/editor/effects/canopy_dusk.json');
  });

  it('reads the scene id out of a filename, and only out of a .json one', () => {
    expect(sceneIdFromFileName('canopy_dusk.json')).toBe('canopy_dusk');
    // The same directory holds raw deform tables (§2.4 `bin` refs).
    expect(sceneIdFromFileName('tables/canopy_wind.bin')).toBeNull();
    expect(sceneIdFromFileName('README')).toBeNull();
  });
});

describe('effects scene reader: identity and version', () => {
  it('accepts a minimal scene: the four required keys and nothing more', () => {
    const scene = parseEffectsScene(MINIMAL, 'plain');
    expect(scene.id).toBe('plain');
    // No defaults are injected. An absent optional key stays absent, so a file
    // Aurora never edited comes back out unchanged rather than gaining a dozen
    // keys the author did not write.
    expect('v_center' in scene).toBe(false);
    expect(serializeEffectsScene(scene)).toBe(MINIMAL);
  });

  /**
   * A RETIRED KEY IS A REFUSAL, NOT A SHRUG (ROADMAP row 59).
   *
   * `precision` was retired from the contract at empyrean `0bd4753` because aeon
   * deleted the STORAGE (`scene_dsl.emp:422-423`; the struct's pad shrank
   * `u16 -> u8` at `:1009` to fill the byte it vacated). This schema is CLOSED
   * (`unevaluatedProperties: false` at the top level — its own `description`
   * explains why: on the writer path the party validating is the party
   * publishing what it writes), so deleting the key does not merely stop the UI
   * offering it. It makes a document that still carries it FAIL VALIDATION.
   *
   * THAT IS THE RULED BEHAVIOUR, not an oversight, and this row exists so nobody
   * "fixes" it back. The hub priced it in the same ruling: "the schema is closed,
   * so a scene file carrying `precision` now fails validation; no shipped scene
   * file carries it ... a tolerant read that discards a stray `precision` is
   * aurora's call." Aurora's call, made here and recorded in
   * docs/reviews/2026-08-27-retire-precision.md, is NOT to add one:
   *   - the population is empty, verified on the owner's LIVE aeon tree (both
   *     games/sonic4/data/editor/effects/*.json carry no `precision`), not
   *     inferred from the hub's grep of aeon origin/master;
   *   - a tolerant discard is a silent lossy path, which is exactly what §6
   *     hazard 1 ("round-trip what you do not understand, or refuse the file")
   *     and this codec's no-field-enumeration design exist to prevent;
   *   - the refusal is loud and names the file, and the author's fix is deleting
   *     one line.
   *
   * The row asserts the refusal is SPECIFIC, not merely that something threw: an
   * unrelated defect making every parse throw would satisfy "it throws".
   */
  it('REFUSES a legacy scene still carrying the retired `precision`: closed schema', () => {
    const legacy = withDoc((d) => { d.precision = 'cell'; });
    expect(() => parseEffectsScene(legacy, 'plain'))
      .toThrow(/does not match the effects scene schema/);
    // The refusal is ABOUT precision, not incidental: the identical document
    // without the key parses clean, so the key is the whole difference.
    expect(() => parseEffectsScene(MINIMAL, 'plain')).not.toThrow();
    // And it is the CLOSED-schema rule firing, not a type or range rule — any
    // retired or unknown key is refused the same way, which is what makes the
    // vendored schema the single place deciding what a scene may contain.
    const alien = withDoc((d) => { d.not_a_real_key = 1; });
    expect(() => parseEffectsScene(alien, 'plain'))
      .toThrow(/does not match the effects scene schema/);
    expect(EFFECTS_SCENE_SCHEMA.unevaluatedProperties).toBe(false);
  });

  it('refuses a filename stem that does not match the id', () => {
    expect(() => parseEffectsScene(MINIMAL, 'canopy_dusk'))
      .toThrow(/the filename stem and the id must match/);
  });

  it('refuses schema != 1 in its own words, not as a failed const', () => {
    const e = (() => { try { parseEffectsScene(withDoc(d => { d.schema = 2; }), 'plain'); } catch (x) { return x as Error; } })();
    expect(e).toBeInstanceOf(EffectsSceneError);
    expect(e!.message).toMatch(/refuses anything but 1/);
    expect(e!.message).toMatch(/no migration machinery/);
  });

  it('refuses a missing schema key', () => {
    expect(() => parseEffectsScene(withDoc(d => { delete d.schema; }), 'plain')).toThrow(EffectsSceneError);
  });

  it('refuses malformed JSON loudly instead of yielding an empty scene', () => {
    expect(() => parseEffectsScene('{"schema": 1,', 'plain')).toThrow(/is not valid JSON/);
    expect(() => parseEffectsScene('null', 'plain')).toThrow(/must contain a JSON object/);
    expect(() => parseEffectsScene('[]', 'plain')).toThrow(/must contain a JSON object/);
  });
});

describe('effects scene ids: the BG-library asymmetry', () => {
  /**
   * §2 Identity: `^[a-z][a-z0-9_]{0,31}$`. "The id becomes part of generated
   * .emp symbol names (labels), which is why hyphens and arbitrary unicode —
   * legal in Aurora's BG-library ids — are NOT legal here."
   *
   * This is the trap worth a test rather than a comment: a ref that is a
   * perfectly good bgLayoutRef is not a legal sceneRef, and both live in the
   * same sidecar (section-meta.ts) two lines apart.
   */
  it('rejects the shape of a real Aurora BG-library id', () => {
    const bgId = makeBgId('Ingame Forest', 1786630615596);
    // Derived, not asserted: makeBgId's own output, whatever it is today.
    expect(bgId).toBe('ingame-forest-1786630615596');
    expect(EFFECTS_SCENE_ID_PATTERN.test(bgId)).toBe(false);
    expect(() => parseEffectsScene(withDoc(d => { d.id = bgId; }), bgId))
      .toThrow(/does not match the effects scene schema/);
  });

  it('rejects hyphens, unicode, uppercase, a leading digit and over-length ids', () => {
    for (const bad of ['canopy-dusk', 'canopy_düsk', 'Canopy_Dusk', '1canopy', '', '_canopy',
      'a'.repeat(33)]) {
      expect(EFFECTS_SCENE_ID_PATTERN.test(bad)).toBe(false);
    }
  });

  it('accepts a 32-character lower_snake id (the boundary the schema draws)', () => {
    // pattern is ^[a-z][a-z0-9_]{0,31}$ — one leading letter plus up to 31 more.
    const maxLen = `a${'b'.repeat(31)}`;
    expect(maxLen).toHaveLength(32);
    expect(EFFECTS_SCENE_ID_PATTERN.test(maxLen)).toBe(true);
    expect(parseEffectsScene(withDoc(d => { d.id = maxLen; }), maxLen).id).toBe(maxLen);
  });
});

describe('effects scene reader: the closed schema', () => {
  it('refuses an unknown top-level key', () => {
    expect(() => parseEffectsScene(withDoc(d => { d.presets = []; }), 'plain'))
      .toThrow(/unknown property "presets" \(the schema is closed\)/);
  });

  it('refuses an unknown layer key', () => {
    expect(() => parseEffectsScene(withDoc(d => {
      (d.layers as Record<string, unknown>[])[0].tint = 3;
    }), 'plain')).toThrow(/layers\/0: unknown property "tint"/);
  });

  /**
   * The two deliberately-excluded raw fields (§2.1) are REJECTED on read, not
   * preserved-and-refused-on-write. The closed schema already rejects them as
   * unknown keys; what this pins is that the reader says WHY, because "unknown
   * property layer_mask_raw" would read as an Aurora limitation rather than a
   * contract decision.
   */
  it('names the excluded raw fields and their reason', () => {
    const e = (() => { try {
      parseEffectsScene(withDoc(d => { d.layer_mask_raw = 5; d.v_deform_shift_raw = 2; }), 'plain');
    } catch (x) { return x as EffectsSceneError; } })()!;
    expect(e.issues.join('\n')).toMatch(/layer_mask_raw and v_deform_shift_raw are deliberately excluded/);
    expect(e.issues.join('\n')).toMatch(/"enabled": false/);
  });

  it('enforces the schema ranges and the layer count, at whatever the schema says it is', () => {
    const layer = { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' };
    // BOTH HALVES DERIVED FROM THE SCHEMA, never typed. This row shipped as a
    // literal `length: 9` against `/maximum 8/` and went red the day empyrean
    // `277bc15` raised the ceiling to 16 — which is the good outcome, but only
    // because 9 happened to still be legal. Had the contract moved DOWN, the
    // over-long fixture would have stayed over-long and the row would have kept
    // passing while asserting a bound that no longer existed.
    const { min, max } = EFFECTS_LAYER_COUNT;
    expect(() => parseEffectsScene(withDoc(d => { d.layers = []; }), 'plain'))
      .toThrow(new RegExp(`minimum ${min}`));
    expect(() => parseEffectsScene(withDoc(d => { d.layers = Array.from({ length: max + 1 }, () => ({ ...layer })); }), 'plain'))
      .toThrow(new RegExp(`maximum ${max}`));
    // ANTI-VACUOUS: exactly `max` layers must be ACCEPTED, or the row above
    // would pass against a parser that refused every multi-layer scene.
    expect(() => parseEffectsScene(withDoc(d => { d.layers = Array.from({ length: max }, () => ({ ...layer })); }), 'plain'))
      .not.toThrow();
    expect(() => parseEffectsScene(withDoc(d => {
      (d.layers as Record<string, unknown>[])[0].world_y = 32768;
    }), 'plain')).toThrow(/above the maximum 32767/);
    expect(() => parseEffectsScene(withDoc(d => {
      (d.layers as Record<string, unknown>[])[0].dsa = 16;
    }), 'plain')).toThrow(/above the maximum 15/);
    expect(() => parseEffectsScene(withDoc(d => {
      d.anchor = { at: { channel: 4, dsa: 0, dsb: 0 } };
    }), 'plain')).toThrow(/anchor\/at\/channel/);
  });

  it('enforces integer-ness rather than accepting a float or a boolean', () => {
    expect(() => parseEffectsScene(withDoc(d => {
      (d.layers as Record<string, unknown>[])[0].world_y = 1.5;
    }), 'plain')).toThrow(/expected integer, got number/);
    expect(() => parseEffectsScene(withDoc(d => {
      (d.layers as Record<string, unknown>[])[0].world_y = true;
    }), 'plain')).toThrow(/expected integer, got boolean/);
  });

  /**
   * Aimed at a LAYER's `fa`, which is what `$defs/factor` governs. It used to be
   * aimed at `v_factor`, and that was the item-35 defect in the test's own
   * frame: `v_factor` is a shift count and never had a `oneOf` to fall through.
   */
  it('refuses an unpublished factor name and a malformed packed triple', () => {
    const withFa = (fa: unknown) => withDoc(d => {
      (d.layers as Record<string, unknown>[])[0].fa = fa;
    });
    expect(() => parseEffectsScene(withFa('FACTOR_2_3'), 'plain'))
      .toThrow(/matches none of the 2 allowed forms/);
    expect(() => parseEffectsScene(withFa({ s1: 1, s2: 2 }), 'plain'))
      .toThrow(/matches none of the 2 allowed forms/);
    expect(() => parseEffectsScene(withFa({ s1: 1, s2: 2, op: 0, note: 'x' }), 'plain'))
      .toThrow(/matches none of the 2 allowed forms/);
  });

  /**
   * `v_factor`'s OWN refusals — the shape the `$ref` used to hide. A string is
   * refused by type, and 16 by range; both are values the old contract accepted.
   */
  it('refuses a FACTOR_* name and an out-of-range shift at v_factor', () => {
    // Bounds read out of the committed schema, so the row cannot drift from it.
    const vf = (EFFECTS_SCENE_SCHEMA.properties as Record<string, { minimum: number; maximum: number }>)
      .v_factor;
    expect(typeof vf.minimum, 'v_factor lost its numeric bounds').toBe('number');
    expect(() => parseEffectsScene(withDoc(d => { d.v_factor = 'FACTOR_0'; }), 'plain'))
      .toThrow(/v_factor: expected integer, got string/);
    expect(() => parseEffectsScene(withDoc(d => { d.v_factor = vf.maximum + 1; }), 'plain'))
      .toThrow(new RegExp(`v_factor: ${vf.maximum + 1} is above the maximum ${vf.maximum}`));
    expect(() => parseEffectsScene(withDoc(d => { d.v_factor = vf.minimum - 1; }), 'plain'))
      .toThrow(new RegExp(`v_factor: ${vf.minimum - 1} is below the minimum ${vf.minimum}`));
  });

  it('refuses a tableRef .bin path that escapes the effects directory', () => {
    const withBin = (bin: string) => withDoc(d => {
      d.deform_fg = { shared: { table: { bin }, speed: 0 } };
    });
    expect(parseEffectsScene(withBin('tables/wind.bin'), 'plain').deform_fg).toBeTruthy();
    expect(() => parseEffectsScene(withBin('../../secrets.bin'), 'plain'))
      .toThrow(/matches none of the 6 allowed forms/);
    expect(() => parseEffectsScene(withBin('wind.dat'), 'plain'))
      .toThrow(/matches none of the 6 allowed forms/);
  });
});

describe('effects scene writer: round trip', () => {
  /**
   * §2: "Aurora's wave-1 UI may expose a subset of fields, but its writer must
   * round-trip fields it does not edit." Proven on disk bytes against a
   * hand-written document, and structurally rather than by enumeration: the
   * codec never lists fields, so there is no list for one to be missing from.
   */
  it('preserves fields the UI does not edit, byte for byte', () => {
    // Written in §5 canonical order — alphabetical at every depth, including
    // inside the layer and inside `vsplit`.
    const onDisk = [
      '{',
      '  "budget_class": "ojz_heavy",',
      '  "id": "wave2_ready",',
      '  "layers": [',
      '    {',
      '      "fa": "FACTOR_1_8",',
      '      "fb": "FACTOR_1_16",',
      '      "vsplit": {',
      '        "at": 208',
      '      },',
      '      "world_y": 64',
      '    }',
      '  ],',
      '  "schema": 1,',
      '  "v_factor": 1',
      '}',
      '',
    ].join('\n');
    // Anti-vacuous: the fields whose survival is the point are really in there.
    expect(JSON.parse(onDisk).budget_class).toBe('ojz_heavy');
    expect(JSON.parse(onDisk).layers[0].vsplit.at).toBe(208);

    expect(serializeEffectsScene(parseEffectsScene(onDisk, 'wave2_ready'))).toBe(onDisk);
  });

  /**
   * Key order on the way out is §5 CANONICAL — alphabetical, recursively — so a
   * document written in some other order normalizes without losing anything.
   * The value comparison is the assertion that matters: reordering must not be
   * a disguised drop.
   *
   * It used to be the SCHEMA's declaration order. §5 ruled against that
   * (aeon 768eb2d8): alphabetical is derivable from the data alone, where a
   * declaration order has to be maintained identically in two repos.
   */
  it('normalizes key order to §5 canonical order without dropping a key', () => {
    const scrambled = JSON.stringify({
      budget_class: 'x',
      v_factor: 1,
      id: 'scrambled',
      layers: [{ fb: 'FACTOR_1', vsplit: { at: 1 }, world_y: 3, fa: 'FACTOR_1' }],
      schema: 1,
      name: 'Scrambled',
    }, null, 2);
    const out = serializeEffectsScene(parseEffectsScene(scrambled, 'scrambled'));
    expect(JSON.parse(out)).toEqual(JSON.parse(scrambled));
    // Derived from the document rather than typed: whatever keys it has, sorted.
    expect(Object.keys(JSON.parse(out)))
      .toEqual(Object.keys(JSON.parse(scrambled)).slice().sort());
    expect(Object.keys(JSON.parse(out).layers[0]))
      .toEqual(['fa', 'fb', 'vsplit', 'world_y']);
    // Subject check: alphabetical is NOT the schema's order, so a
    // schema-ordered writer fails this rather than passing by coincidence.
    const schemaOrder = Object.keys(EFFECTS_SCENE_SCHEMA.properties as Record<string, unknown>)
      .filter(k => k in JSON.parse(scrambled));
    expect(Object.keys(JSON.parse(out))).not.toEqual(schemaOrder);
    // And it is now a fixed point: writing what we wrote changes nothing.
    expect(serializeEffectsScene(parseEffectsScene(out, 'scrambled'))).toBe(out);
  });

  /**
   * §5 DETERMINISM, which binds universally — no document classes. Nothing here
   * is compared to a literal: the claim is that two writers handed the same
   * content agree with each other.
   *
   * HONEST SCOPE — this row is a REGRESSION GUARD, not a refutation. Measured:
   * it passes against the pre-§5 schema-order writer too, and it has to. A
   * scene document cannot carry a key the schema does not declare (the writer
   * refuses one), so schema order was already total over its key set and
   * already insertion-order-independent. The row that actually discriminates
   * alphabetical from schema order is the one above. What this one defends is
   * a future writer that stops normalizing at all — which is where the
   * BG override codec was, because ITS key set is open.
   */
  it('DETERMINISM: different insertion orders, identical content -> identical bytes', () => {
    const content = {
      schema: 1, id: 'det', name: 'Det',
      layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_2', vsplit: { at: 4 } }],
      v_factor: 1, budget_class: 'x',
    };
    /** The same content, every object rebuilt with its keys inserted backwards. */
    function reversedKeys(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reversedKeys);
      if (typeof value !== 'object' || value === null) return value;
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).reverse()) out[k] = reversedKeys(src[k]);
      return out;
    }
    const a = JSON.stringify(content, null, 2);
    const b = JSON.stringify(reversedKeys(content), null, 2);
    // Anti-vacuity: two real orderings of one content, not a document and itself.
    expect(b).not.toBe(a);
    expect(JSON.parse(b)).toEqual(JSON.parse(a));

    expect(serializeEffectsScene(parseEffectsScene(b, 'det')))
      .toBe(serializeEffectsScene(parseEffectsScene(a, 'det')));
  });

  /**
   * §5's COMPACTNESS half, which is the one that DOES split by document class.
   * A scene file is a handful of scalars, so it pretty-prints at indent 2 —
   * where `editor_bg_override.json`, dominated by tile arrays, minifies.
   *
   * Also a regression guard rather than a refutation: this file already
   * pretty-printed, so the row passes against the pre-§5 writer. It exists
   * because §5's letter once reached scene files and would have minified them,
   * and the ruling that says otherwise lives in the other repo.
   */
  it('ends in exactly one LF: the canonical file form (empyrean e1ebd20 §8)', () => {
    const text = serializeEffectsScene(parseEffectsScene(MINIMAL, 'plain'));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    // Two trailing newlines on the way in become one on the way out, not two,
    // and a missing one is supplied: whitespace around the document is not
    // canonical, the single terminator is.
    expect(serializeEffectsScene(parseEffectsScene(MINIMAL + '\n', 'plain'))).toBe(text);
    expect(serializeEffectsScene(parseEffectsScene(MINIMAL.trimEnd(), 'plain'))).toBe(text);
  });

  it('pretty-prints at indent 2: the scalar document class', () => {
    const text = serializeEffectsScene(parseEffectsScene(MINIMAL, 'plain'));
    expect(text).toContain('\n');
    expect(text.split('\n')[1].startsWith('  "')).toBe(true);
    expect(text.split('\n')[1]).not.toMatch(/^ {3}"|^ "/);
  });

  it('refuses to write a scene that does not match the schema', () => {
    const bad = { schema: 1, id: 'bad', layers: [], v_factor: 1 } as unknown as EffectsScene;
    expect(() => serializeEffectsScene(bad)).toThrow(/refusing to write scene "bad"/);
    const unknownKey = {
      ...JSON.parse(MINIMAL), presets: [],
    } as unknown as EffectsScene;
    expect(() => serializeEffectsScene(unknownKey)).toThrow(/unknown property "presets"/);
  });
});

describe('effects scene library', () => {
  const ROOT = 'games/sonic4/data/';
  const DIR = 'games/sonic4/data/editor/effects/';

  /** §2: "the generator treats an absent directory as 'no editor scenes' (not an error)". */
  it('reads an absent directory as no editor scenes', async () => {
    const lib = await loadEffectsSceneLibrary(memFs({}), ROOT);
    // EXHAUSTIVE on purpose — a new field on the library that the absent-
    // directory path forgot to fill would land here rather than at whatever
    // consumer happened to read it first. `loadedPaths` is what a save may
    // REMOVE, so on this path it must be empty and not undefined.
    expect(lib).toEqual({ scenes: [], unreadable: [], notices: [], loadedPaths: [] });
  });

  it('loads every scene in the directory, sorted, ignoring non-json entries', async () => {
    const scene = (id: string) => withDoc(d => { d.id = id; });
    const lib = await loadEffectsSceneLibrary(memFs({
      [`${DIR}zenith.json`]: scene('zenith'),
      [`${DIR}alpha.json`]: scene('alpha'),
      [`${DIR}wind.bin`]: 'not json',
    }), ROOT);
    expect(lib.scenes.map(s => s.id)).toEqual(['alpha', 'zenith']);
    expect(lib.unreadable).toEqual([]);
    expect(lib.notices).toEqual([]);
  });

  /**
   * Absent and unreadable are not the same fact — the rule aeon/load.ts's
   * markUnreadable already states for section sidecars. A broken file is loud
   * and is NOT returned as a scene, so nothing can later write a
   * repaired-looking empty scene over the author's work.
   */
  it('reports an unreadable scene loudly and still loads its neighbours', async () => {
    const lib = await loadEffectsSceneLibrary(memFs({
      [`${DIR}good.json`]: withDoc(d => { d.id = 'good'; }),
      [`${DIR}broken.json`]: '{"schema": 1, "id": "broken",',
    }), ROOT);
    expect(lib.scenes.map(s => s.id)).toEqual(['good']);
    expect(lib.unreadable.map(u => u.path)).toEqual([`${DIR}broken.json`]);
    expect(lib.notices.map((n) => n.message).join('\n')).toMatch(/will NOT overwrite the file/);
  });

  it('treats an id/filename mismatch as unreadable rather than silently renaming', async () => {
    const lib = await loadEffectsSceneLibrary(memFs({
      [`${DIR}canopy_dawn.json`]: withDoc(d => { d.id = 'canopy_dusk'; }),
    }), ROOT);
    expect(lib.scenes).toEqual([]);
    expect(lib.unreadable[0].reason).toMatch(/the filename stem and the id must match/);
  });
});

describe('effects scene advisory (NOT enforcement)', () => {
  /**
   * §2.2 assigns the two-sources guard to sigil ("sigil enforces with the exact
   * reason"), and §2's preamble assigns value validation to the build gate
   * generally. Aurora therefore does not enforce it: parse ACCEPTS the
   * conflicting document. What Aurora offers is the advisory §2 licenses
   * explicitly ("Aurora may pre-check anything it likes as advisory UX").
   */
  const conflicting = (over: Record<string, unknown>) => withDoc(d => {
    (d.layers as Record<string, unknown>[])[0] = {
      world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1',
      deform: { own: { table: { generator: 'zero' }, shift_a: 1, shift_b: 1, phase: 0, speed: 0 } },
      ...over,
    };
  });

  it('does not enforce the two-sources guard on read or write', () => {
    const text = conflicting({ dsa: 4 });
    const scene = parseEffectsScene(text, 'plain');
    expect(serializeEffectsScene(scene)).toBeTruthy();
  });

  it('advises when deform.own coexists with a non-default dsa/dsb/phase', () => {
    const findings = advisoryLayerDeformConflicts(parseEffectsScene(conflicting({ dsa: 4, phase: 9 }), 'plain'));
    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('/layers/0');
    expect(findings[0].message).toMatch(/dsa\/phase/);
    expect(findings[0].message).toMatch(/sigil refuses this at build time/);
  });

  it('stays quiet when dsa/dsb/phase are absent or at the schema defaults', () => {
    expect(advisoryLayerDeformConflicts(parseEffectsScene(conflicting({}), 'plain'))).toEqual([]);
    // The defaults are read out of the schema, so this cannot drift from it.
    expect(EFFECTS_LAYER_DEFAULTS).toEqual({ dsa: 15, dsb: 15, phase: 0 });
    const atDefaults = conflicting({ ...EFFECTS_LAYER_DEFAULTS });
    expect(advisoryLayerDeformConflicts(parseEffectsScene(atDefaults, 'plain'))).toEqual([]);
  });

  it('stays quiet on a layer with no own deform', () => {
    const scene = parseEffectsScene(withDoc(d => {
      (d.layers as Record<string, unknown>[])[0] = { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1', dsa: 3 };
    }), 'plain');
    expect(advisoryLayerDeformConflicts(scene)).toEqual([]);
  });
});
