// A REFUSED EFFECTS DOCUMENT'S ID, READ BACK FROM ITS PATH (REGIONS-DOCID-TRANSCRIBED-INVERSE).
//
// Region rule 3 (editor spec §2.5) says "that scene exists and Aurora could not
// read it" instead of "no such scene" only if the id it parses out of a
// library's `unreadable[].path` is the id the author's `sceneRef` names. The
// parse used to be a basename transcription in regions/vocabulary.ts; it is now
// `sceneIdFromPath` / `presetIdFromPath`, beside the builders they invert.
//
// Three populations, one property each:
//
//   1. ROUND TRIP: builder then parser gives back the id, for each library.
//      Nested ids (`outer/inner`) are NOT legal in either library (the id
//      pattern refuses `/`, and the loaders list one directory and never
//      recurse), so the nested row states that: the pattern refuses it AND the
//      parser refuses its path, rather than pretending it round-trips.
//   2. FOREIGN PATHS ARE REFUSED with null, never a guessed basename. The row
//      that matters most is the preset library's path under the SCENE parser:
//      `editor/effects/presets/` sits inside `editor/effects/`, so a basename
//      parse reads a preset as a scene.
//   3. THROUGH THE REAL LOADERS AND THE REAL VOCABULARY: a broken file on disk
//      becomes a refused id, and a foreign path in `unreadable` becomes nothing.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../src/core/project/adapter';
import {
  effectsScenePath, sceneIdFromPath, loadEffectsSceneLibrary, EFFECTS_SCENE_ID_PATTERN,
  type EffectsSceneLibrary,
} from '../../src/core/formats/effects/scene';
import {
  effectsPresetPath, presetIdFromPath, loadEffectsPresetLibrary, EFFECTS_PRESET_ID_PATTERN,
  type EffectsPresetLibrary,
} from '../../src/core/formats/effects/preset';
import { regionBindingVocabulary } from '../../src/core/formats/regions/vocabulary';
import { unknownWiring } from '../../src/core/formats/effects/section-wiring';

const ROOT = 'games/sonic4/data/';

/** Legal ids, including the pattern's edge shapes (one letter, digits, underscores). */
const LEGAL_IDS = ['canopy_dusk', 'a', 'ojz_sec5_showcase', 'x9_y_0'];
const NESTED_ID = 'outer/inner';

const LIBRARIES = [
  {
    name: 'scene',
    build: effectsScenePath,
    parse: sceneIdFromPath,
    pattern: EFFECTS_SCENE_ID_PATTERN,
  },
  {
    name: 'preset',
    build: effectsPresetPath,
    parse: presetIdFromPath,
    pattern: EFFECTS_PRESET_ID_PATTERN,
  },
] as const;

for (const lib of LIBRARIES) {
  describe(`${lib.name} id from path: the inverse of its builder`, () => {
    it('gives back every legal id its builder was given', () => {
      for (const id of LEGAL_IDS) {
        expect(lib.pattern.test(id), `${id} is a legal ${lib.name} id`).toBe(true);
        expect(lib.parse(ROOT, lib.build(ROOT, id)), `round trip of ${id}`).toBe(id);
      }
    });

    it('a nested id is not legal, and its path is refused rather than read as an id', () => {
      expect(lib.pattern.test(NESTED_ID)).toBe(false);
      expect(lib.parse(ROOT, lib.build(ROOT, NESTED_ID))).toBeNull();
    });

    it('the round trip holds under another data root, including the empty one', () => {
      for (const root of ['', 'data/', 'some/deeper/root/']) {
        expect(lib.parse(root, lib.build(root, 'canopy_dusk'))).toBe('canopy_dusk');
      }
    });
  });
}

describe('a path that is not a document of the library is refused with null', () => {
  it('the scene parser refuses a PRESET path, which sits inside its directory', () => {
    const presetPath = effectsPresetPath(ROOT, 'canopy_dusk');
    expect(presetPath.startsWith(`${ROOT}editor/effects/`)).toBe(true); // the overlap is real
    expect(sceneIdFromPath(ROOT, presetPath)).toBeNull();
  });

  it('the preset parser refuses a SCENE path', () => {
    expect(presetIdFromPath(ROOT, effectsScenePath(ROOT, 'canopy_dusk'))).toBeNull();
  });

  it('both refuse a path under another data root, a non .json file, and an unrelated file', () => {
    const foreign = [
      effectsScenePath('other/data/', 'canopy_dusk'),
      effectsPresetPath('other/data/', 'canopy_dusk'),
      `${ROOT}editor/effects/tables/canopy_wind.bin`,
      `${ROOT}editor/effects/presets/table.bin`,
      `${ROOT}zones/ojz/act1/regions.json`,
      'canopy_dusk.json',
    ];
    for (const path of foreign) {
      expect(sceneIdFromPath(ROOT, path), `scene parser on ${path}`).toBeNull();
      expect(presetIdFromPath(ROOT, path), `preset parser on ${path}`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Through the real loaders and the real vocabulary
// ---------------------------------------------------------------------------

/** In-memory FileAccess; same shape as effects-scene.test.ts's. */
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

function vocabOf(scenes: EffectsSceneLibrary, presets: EffectsPresetLibrary) {
  return regionBindingVocabulary({
    dataRoot: ROOT,
    rasterWiring: unknownWiring('d.emp', 'l.emp', 'not read in this test'),
    effectsScenes: scenes,
    effectsPresets: presets,
    bgLibrary: [],
    bgLibraryUnresolved: [],
  });
}

describe('rule 3 vocabulary: refused ids come from the libraries\' own parse', () => {
  it('a broken scene and a broken preset on disk are REFUSED ids, not missing ones', async () => {
    const fa = memFs({
      [effectsScenePath(ROOT, 'broken_scene')]: '{ not json',
      [effectsPresetPath(ROOT, 'broken_preset')]: '{ not json',
    });
    const warn = console.warn;
    console.warn = () => {};
    let scenes: EffectsSceneLibrary;
    let presets: EffectsPresetLibrary;
    try {
      scenes = await loadEffectsSceneLibrary(fa, ROOT);
      presets = await loadEffectsPresetLibrary(fa, ROOT);
    } finally {
      console.warn = warn;
    }
    // Control: the loaders really did refuse them (an empty `unreadable` would
    // make the rows below pass on nothing).
    expect(scenes.unreadable.map(u => u.path)).toEqual([effectsScenePath(ROOT, 'broken_scene')]);
    expect(presets.unreadable.map(u => u.path)).toEqual([effectsPresetPath(ROOT, 'broken_preset')]);

    const v = vocabOf(scenes, presets);
    expect(v.sceneUnreadableIds).toEqual(['broken_scene']);
    expect(v.rasterUnreadableIds).toEqual(['broken_preset']);
  });

  it('a foreign path in `unreadable` names no id at all', () => {
    const scenes: EffectsSceneLibrary = {
      scenes: [], notices: [], loadedPaths: [],
      unreadable: [
        { path: effectsPresetPath(ROOT, 'looks_like_a_scene'), reason: 'planted' },
        { path: effectsScenePath(ROOT, 'real_refusal'), reason: 'planted' },
      ],
    };
    const presets: EffectsPresetLibrary = {
      presets: [], notices: [], loadedPaths: [],
      unreadable: [{ path: effectsScenePath(ROOT, 'looks_like_a_preset'), reason: 'planted' }],
    };
    const v = vocabOf(scenes, presets);
    expect(v.sceneUnreadableIds).toEqual(['real_refusal']);
    expect(v.rasterUnreadableIds).toEqual([]);
  });
});
