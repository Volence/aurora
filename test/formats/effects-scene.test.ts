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
  EffectsSceneError,
  type EffectsScene,
} from '../../src/core/formats/effects/scene';
import { makeBgId } from '../../src/core/formats/bg-library';

/**
 * Effects scene definition codec — wave-1 surface 1.
 *
 * Contract: empyrean docs/AURORA_EFFECTS_SCHEMA.md §2/§6/§8 at 069cf59, the
 * committed JSON schema at blob 2d7a9fee, aeon
 * tools/EFFECTS_CONSUMER_CONTRACT.md §2 at 00607dd5.
 */

/** The smallest legal scene: `schema`, `id`, `layers`, `v_factor` and nothing else. */
const MINIMAL = JSON.stringify({
  schema: 1,
  id: 'plain',
  layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_2' }],
  v_factor: 'FACTOR_1_2',
}, null, 2);

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

describe('effects scene reader — identity and version', () => {
  it('accepts a minimal scene: the four required keys and nothing more', () => {
    const scene = parseEffectsScene(MINIMAL, 'plain');
    expect(scene.id).toBe('plain');
    // No defaults are injected. An absent optional key stays absent, so a file
    // Aurora never edited comes back out unchanged rather than gaining a dozen
    // keys the author did not write.
    expect('precision' in scene).toBe(false);
    expect('v_center' in scene).toBe(false);
    expect(serializeEffectsScene(scene)).toBe(MINIMAL);
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

describe('effects scene ids — the BG-library asymmetry', () => {
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

describe('effects scene reader — the closed schema', () => {
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

  it('enforces the schema ranges and the 1..8 layer count', () => {
    const layer = { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' };
    expect(() => parseEffectsScene(withDoc(d => { d.layers = []; }), 'plain'))
      .toThrow(/minimum 1/);
    expect(() => parseEffectsScene(withDoc(d => { d.layers = Array.from({ length: 9 }, () => ({ ...layer })); }), 'plain'))
      .toThrow(/maximum 8/);
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

  it('refuses an unpublished factor name and a malformed packed triple', () => {
    expect(() => parseEffectsScene(withDoc(d => { d.v_factor = 'FACTOR_2_3'; }), 'plain'))
      .toThrow(/matches none of the 2 allowed forms/);
    expect(() => parseEffectsScene(withDoc(d => { d.v_factor = { s1: 1, s2: 2 }; }), 'plain'))
      .toThrow(/matches none of the 2 allowed forms/);
    expect(() => parseEffectsScene(withDoc(d => { d.v_factor = { s1: 1, s2: 2, op: 0, note: 'x' }; }), 'plain'))
      .toThrow(/matches none of the 2 allowed forms/);
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

describe('effects scene writer — round trip', () => {
  /**
   * §2: "Aurora's wave-1 UI may expose a subset of fields, but its writer must
   * round-trip fields it does not edit." Proven on disk bytes against a
   * hand-written document, and structurally rather than by enumeration: the
   * codec never lists fields, so there is no list for one to be missing from.
   */
  it('preserves fields the UI does not edit, byte for byte', () => {
    const onDisk = [
      '{',
      '  "schema": 1,',
      '  "id": "wave2_ready",',
      '  "layers": [',
      '    {',
      '      "world_y": 64,',
      '      "fa": "FACTOR_1_8",',
      '      "fb": "FACTOR_1_16",',
      '      "vsplit": {',
      '        "at": 208',
      '      }',
      '    }',
      '  ],',
      '  "v_factor": "FACTOR_1_2",',
      '  "budget_class": "ojz_heavy"',
      '}',
    ].join('\n');
    // Anti-vacuous: the fields whose survival is the point are really in there.
    expect(JSON.parse(onDisk).budget_class).toBe('ojz_heavy');
    expect(JSON.parse(onDisk).layers[0].vsplit.at).toBe(208);

    expect(serializeEffectsScene(parseEffectsScene(onDisk, 'wave2_ready'))).toBe(onDisk);
  });

  /**
   * Key order on the way out is the SCHEMA's declaration order, so a document
   * written in some other order normalizes without losing anything. The value
   * comparison is the assertion that matters — reordering must not be a
   * disguised drop.
   */
  it('normalizes key order to the schema without dropping a key', () => {
    const scrambled = JSON.stringify({
      budget_class: 'x',
      v_factor: 'FACTOR_1_2',
      id: 'scrambled',
      layers: [{ fb: 'FACTOR_1', vsplit: { at: 1 }, world_y: 3, fa: 'FACTOR_1' }],
      schema: 1,
      name: 'Scrambled',
    }, null, 2);
    const out = serializeEffectsScene(parseEffectsScene(scrambled, 'scrambled'));
    expect(JSON.parse(out)).toEqual(JSON.parse(scrambled));
    expect(Object.keys(JSON.parse(out)))
      .toEqual(['schema', 'id', 'name', 'layers', 'v_factor', 'budget_class']);
    expect(Object.keys(JSON.parse(out).layers[0]))
      .toEqual(['world_y', 'fa', 'fb', 'vsplit']);
    // And it is now a fixed point: writing what we wrote changes nothing.
    expect(serializeEffectsScene(parseEffectsScene(out, 'scrambled'))).toBe(out);
  });

  it('refuses to write a scene that does not match the schema', () => {
    const bad = { schema: 1, id: 'bad', layers: [], v_factor: 'FACTOR_1' } as unknown as EffectsScene;
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
    expect(lib).toEqual({ scenes: [], unreadable: [], notices: [] });
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
    expect(lib.notices.join('\n')).toMatch(/will NOT overwrite the file/);
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
