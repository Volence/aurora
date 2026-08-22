// Every decision the effects facet makes, checked without React.
//
// The component is a renderer of these answers; the answers are here. What this
// file is really guarding is the class of defect the node suite normally cannot
// see at all — a dropdown offering a value the codec refuses, a `<select>`
// onChange pushing an empty undo step, a delete button that fires on a scene
// that is not there.

import { describe, it, expect } from 'vitest';
import {
  CUSTOM_FACTOR_VALUE, factorOptions, factorSelectValue, factorFromSelect,
  clampPackedField, clampWorldY, sceneListEntries, sceneRefOptions, unassignableSceneRef,
  sectionSceneCommand, createSceneCommand, deleteSceneCommand,
  addLayerCommand, removeLayerCommand, setLayerFieldCommand, setSceneFieldCommand,
  SCENE_FORM_CHOICES,
} from '../effects-aeon';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_WORLD_Y_BOUNDS, newEffectsScene,
} from '../../../core/formats/effects/scene-ui';
import { serializeEffectsScene, type EffectsScene, type EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import { EditHistory } from '../../../core/editing/history';
import type { S4Level } from '../../../core/editing/commands';

function library(scenes: EffectsScene[] = [], unreadable: EffectsSceneLibrary['unreadable'] = []): EffectsSceneLibrary {
  return { scenes, unreadable, notices: [] };
}

const canopy = () => {
  const s = newEffectsScene('canopy', 'Canopy');
  s.layers.push({ world_y: 96, fa: 'FACTOR_1_2', fb: { s1: 2, s2: 4, op: 1 } });
  return s;
};

describe('factor picker', () => {
  it('offers every schema factor plus one custom escape hatch, and nothing else', () => {
    const options = factorOptions();
    expect(options.map((o) => o.value))
      .toEqual([...EFFECTS_FACTOR_NAMES, CUSTOM_FACTOR_VALUE]);
  });

  it("uses a sentinel that cannot collide with a real factor name", () => {
    // The whole risk of a sentinel: a schema amendment adding a factor spelled
    // like it would make the picker silently un-selectable.
    expect(EFFECTS_FACTOR_NAMES as readonly string[]).not.toContain(CUSTOM_FACTOR_VALUE);
    for (const n of EFFECTS_FACTOR_NAMES) expect(n.startsWith('FACTOR_')).toBe(true);
  });

  it('selects the right option for each factor form', () => {
    expect(factorSelectValue('FACTOR_1_4')).toBe('FACTOR_1_4');
    expect(factorSelectValue({ s1: 1, s2: 2, op: 0 })).toBe(CUSTOM_FACTOR_VALUE);
  });

  it('KEEPS an existing packed triple when the picker re-selects custom', () => {
    // Re-picking "Custom packed…" on a factor that already IS packed must not
    // reset the author's tuned s1/s2/op back to a seed.
    const packed = { s1: 3, s2: 9, op: 1 as const };
    expect(factorFromSelect(CUSTOM_FACTOR_VALUE, packed)).toEqual(packed);
  });

  it('seeds a schema-legal packed triple when switching from a named factor', () => {
    const seeded = factorFromSelect(CUSTOM_FACTOR_VALUE, 'FACTOR_1');
    expect(seeded).toEqual({
      s1: EFFECTS_PACKED_FACTOR_BOUNDS.s1.min,
      s2: EFFECTS_PACKED_FACTOR_BOUNDS.s2.max,
      op: 0,
    });
    // ANTI-VACUOUS: the seed is only useful if the codec accepts it.
    const scene = newEffectsScene('probe');
    scene.layers[0].fa = seeded;
    expect(() => serializeEffectsScene(scene)).not.toThrow();
  });

  it('clamps packed fields and world_y to the schema, including NaN from an empty input', () => {
    expect(clampPackedField('s1', -4)).toBe(EFFECTS_PACKED_FACTOR_BOUNDS.s1.min);
    expect(clampPackedField('s2', 99)).toBe(EFFECTS_PACKED_FACTOR_BOUNDS.s2.max);
    // `<input type=number>` yields '' -> Number('') is 0, but a partially typed
    // '-' yields NaN, which would otherwise be written into the document.
    expect(clampPackedField('s1', NaN)).toBe(EFFECTS_PACKED_FACTOR_BOUNDS.s1.min);
    expect(clampWorldY(NaN)).toBe(EFFECTS_WORLD_Y_BOUNDS.min);
    expect(clampWorldY(-1)).toBe(EFFECTS_WORLD_Y_BOUNDS.min);
    expect(clampWorldY(999999)).toBe(EFFECTS_WORLD_Y_BOUNDS.max);
    expect(clampWorldY(96.7)).toBe(97);
  });
});

describe('scene list and section assignment', () => {
  it('labels a scene by its name, falling back to the id — never an empty row', () => {
    const named = newEffectsScene('canopy', 'Canopy at dusk');
    const unnamed = newEffectsScene('rocks');
    expect(sceneListEntries(library([named, unnamed]))).toEqual([
      { id: 'canopy', label: 'Canopy at dusk', layers: 1 },
      { id: 'rocks', label: 'rocks', layers: 1 },
    ]);
  });

  it('offers the act default plus the LOADED scenes only', () => {
    const lib = library([newEffectsScene('canopy', 'Canopy')],
      [{ path: 'data/editor/effects/broken.json', reason: 'x' }]);
    expect(sceneRefOptions(lib)).toEqual([
      { value: '', label: 'Act default' },
      { value: 'canopy', label: 'Canopy' },
    ]);
    // ...and the unreadable one is genuinely absent, not merely last.
    expect(sceneRefOptions(lib).some((o) => o.value === 'broken')).toBe(false);
  });

  it('warns about a sceneRef that names nothing assignable, and says which kind', () => {
    const lib = library([newEffectsScene('canopy')],
      [{ path: 'data/editor/effects/broken.json', reason: 'x' }]);
    expect(unassignableSceneRef(lib, null)).toBeNull();
    expect(unassignableSceneRef(lib, 'canopy')).toBeNull();
    expect(unassignableSceneRef(lib, 'broken')).toMatch(/could not be read/);
    expect(unassignableSceneRef(lib, 'gone')).toMatch(/not a scene in this project/);
  });

  it("maps the select's empty string to the model's null, and re-picking issues NOTHING", () => {
    expect(sectionSceneCommand(3, null, 'canopy'))
      .toEqual({
        type: 'set-section-scene', description: 'Section 3 scene', sectionIndex: 3,
        oldRef: null, newRef: 'canopy',
      });
    expect(sectionSceneCommand(3, 'canopy', '')?.newRef).toBeNull();
    // The no-op guard, both directions. A `<select>` fires onChange for the
    // option already selected; a command here would be an undo step that
    // visibly does nothing.
    expect(sectionSceneCommand(3, 'canopy', 'canopy')).toBeNull();
    expect(sectionSceneCommand(3, null, '')).toBeNull();
  });
});

describe('scene commands', () => {
  it('refuses a create whose id is illegal or taken, with the reason', () => {
    const lib = library([newEffectsScene('canopy')],
      [{ path: 'data/editor/effects/broken.json', reason: 'x' }]);
    expect(createSceneCommand(lib, 'Canopy-Dusk')).toEqual({
      ok: false, reason: expect.stringContaining('not a legal scene id'),
    });
    expect(createSceneCommand(lib, 'canopy')).toEqual({
      ok: false, reason: expect.stringContaining('already a scene'),
    });
    // The invisible collision: `broken` is in no list the author can see.
    expect(createSceneCommand(lib, 'broken')).toEqual({
      ok: false, reason: expect.stringContaining('could not be read'),
    });
  });

  it('creates a scene the codec accepts', () => {
    const result = createSceneCommand(library(), 'canopy_dusk', 'Canopy');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.sceneId).toBe('canopy_dusk');
    expect(result.command.oldScene).toBeNull();
    expect(() => serializeEffectsScene(result.command.newScene!)).not.toThrow();
  });

  it('deletes an existing scene and does nothing for one that is not there', () => {
    const lib = library([canopy()]);
    expect(deleteSceneCommand(lib, 'canopy')?.newScene).toBeNull();
    expect(deleteSceneCommand(lib, 'canopy')?.oldScene).toEqual(canopy());
    expect(deleteSceneCommand(lib, 'nope')).toBeNull();
  });

  it('emits NOTHING when an edit changes nothing', () => {
    const lib = library([canopy()]);
    expect(setSceneFieldCommand(lib, 'canopy', 'name', 'Canopy')).toBeNull();
    expect(setLayerFieldCommand(lib, 'canopy', 0, 'world_y', 0)).toBeNull();
    expect(setLayerFieldCommand(lib, 'canopy', 1, 'fb', { s1: 2, s2: 4, op: 1 })).toBeNull();
    // ...but a real change does emit.
    expect(setLayerFieldCommand(lib, 'canopy', 0, 'world_y', 8)).not.toBeNull();
  });

  it('DELETES an optional key rather than writing the schema default', () => {
    // The model rule scene.ts states: a default written out turns every
    // untouched load/save into a diff. Clearing `name` must return the document
    // to not-having-it.
    const lib = library([canopy()]);
    const cmd = setSceneFieldCommand(lib, 'canopy', 'name', undefined);
    expect(cmd).not.toBeNull();
    expect(cmd!.newScene).not.toHaveProperty('name');
    expect(JSON.parse(serializeEffectsScene(cmd!.newScene!))).not.toHaveProperty('name');
  });

  it('does not touch the live library — only the command carries the new state', () => {
    const live = canopy();
    const lib = library([live]);
    setLayerFieldCommand(lib, 'canopy', 0, 'world_y', 512);
    setSceneFieldCommand(lib, 'canopy', 'name', 'Changed');
    expect(live.layers[0].world_y).toBe(0);
    expect(live.name).toBe('Canopy');
  });

  it('adds layers up to the schema ceiling and then stops', () => {
    const scene = newEffectsScene('canopy');
    const lib = library([scene]);
    const h = new EditHistory();
    const level = { sections: [], effectsScenes: lib } as unknown as S4Level;

    for (let i = 1; i < EFFECTS_LAYER_COUNT.max; i++) {
      const cmd = addLayerCommand(lib, 'canopy');
      expect(cmd, `add #${i} was refused early`).not.toBeNull();
      h.execute(cmd!, level);
    }
    expect(lib.scenes[0].layers).toHaveLength(EFFECTS_LAYER_COUNT.max);
    // ANTI-VACUOUS: the full scene is still one the codec accepts...
    expect(() => serializeEffectsScene(lib.scenes[0])).not.toThrow();
    // ...and the ceiling really is a refusal, not just a validator error later.
    expect(addLayerCommand(lib, 'canopy')).toBeNull();
  });

  it('copies the layer above so a new band is a visible no-op, not a jump', () => {
    const lib = library([canopy()]);
    const cmd = addLayerCommand(lib, 'canopy')!;
    const added = cmd.newScene!.layers[2];
    expect(added.fa).toEqual(cmd.newScene!.layers[1].fa);
    expect(added.fb).toEqual(cmd.newScene!.layers[1].fb);
    expect(added.world_y).toBe(96 + 32);
  });

  it('keeps world_y in range when the layer above is already at the ceiling', () => {
    const scene = newEffectsScene('canopy');
    scene.layers[0].world_y = EFFECTS_WORLD_Y_BOUNDS.max;
    const lib = library([scene]);
    const cmd = addLayerCommand(lib, 'canopy')!;
    expect(cmd.newScene!.layers[1].world_y).toBe(EFFECTS_WORLD_Y_BOUNDS.max);
    expect(() => serializeEffectsScene(cmd.newScene!)).not.toThrow();
  });

  it('refuses to remove the last layer, or an index that is not there', () => {
    const lib = library([canopy()]);
    expect(removeLayerCommand(lib, 'canopy', 1)).not.toBeNull();
    expect(removeLayerCommand(lib, 'canopy', 5)).toBeNull();
    const single = library([newEffectsScene('rocks')]);
    expect(single.scenes[0].layers).toHaveLength(EFFECTS_LAYER_COUNT.min);
    expect(removeLayerCommand(single, 'rocks', 0)).toBeNull();
  });

  it('offers only cell precision, and both transitions', () => {
    expect([...SCENE_FORM_CHOICES.precision]).toEqual(['cell']);
    expect([...SCENE_FORM_CHOICES.transition]).toEqual(['smooth', 'instant']);
  });

  it("a whole form's worth of edits, run through history, is one step per gesture", () => {
    // The §6 bar, end to end: each provider call is one command, and each
    // command is one undoable step that returns the document exactly.
    const lib = library([canopy()]);
    const level = { sections: [], effectsScenes: lib } as unknown as S4Level;
    const h = new EditHistory();
    const before = JSON.stringify(lib.scenes[0]);

    h.execute(setLayerFieldCommand(lib, 'canopy', 0, 'fa', 'FACTOR_1_8')!, level);
    h.execute(setSceneFieldCommand(lib, 'canopy', 'v_factor', 'FACTOR_1_2')!, level);
    h.execute(addLayerCommand(lib, 'canopy')!, level);
    expect(lib.scenes[0].layers).toHaveLength(3);

    h.undo(level); h.undo(level); h.undo(level);
    expect(JSON.stringify(lib.scenes[0])).toBe(before);
    expect(h.canUndo).toBe(false);
  });
});
