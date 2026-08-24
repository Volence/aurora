// `set-effects-scene` — create, edit and delete a scene as ONE undo step each.
//
// The §6 acceptance bar says "every new mutation is one undo step". For a form
// with a dozen controls that is not automatic: the obvious implementation issues
// a command per control and Ctrl+Z then walks backwards through a gesture the
// author experienced as one. The command is a whole-DOCUMENT swap precisely so
// the bar holds by construction, and these rows are what say so.
//
// They also pin the two properties the swap can silently get wrong: it must not
// alias the library's live objects (a command holding the object it is meant to
// restore restores nothing), and it must not reorder the scene list on undo.

import { describe, it, expect } from 'vitest';
import { EditHistory } from '../history';
import type { S4Level, SetEffectsSceneCommand } from '../commands';
import type { EffectsScene, EffectsSceneLibrary } from '../../formats/effects/scene';
import { newEffectsScene, cloneEffectsScene } from '../../formats/effects/scene-ui';

function scene(id: string, worldY = 0, extra: Partial<EffectsScene> = {}): EffectsScene {
  const s = newEffectsScene(id, id);
  s.layers[0].world_y = worldY;
  return { ...s, ...extra };
}

function level(scenes: EffectsScene[] = [], unreadable: EffectsSceneLibrary['unreadable'] = []): S4Level {
  return {
    sections: [],
    effectsScenes: { scenes, unreadable, notices: [] },
  } as unknown as S4Level;
}

const cmd = (over: Partial<SetEffectsSceneCommand> & { sceneId: string }): SetEffectsSceneCommand => ({
  type: 'set-effects-scene',
  description: `Scene ${over.sceneId}`,
  sectionIndex: -1,
  oldScene: null,
  newScene: null,
  ...over,
});

const ids = (l: S4Level) => l.effectsScenes!.scenes.map((s) => s.id);

describe('set-effects-scene', () => {
  it('CREATES a scene, and one undo removes it again', () => {
    const l = level();
    const h = new EditHistory();
    h.execute(cmd({ sceneId: 'canopy', newScene: scene('canopy') }), l);
    expect(ids(l)).toEqual(['canopy']);

    // One step, not one per field the new scene happens to carry.
    expect(h.canUndo).toBe(true);
    h.undo(l);
    expect(ids(l)).toEqual([]);
    expect(h.canUndo).toBe(false);

    h.redo(l);
    expect(ids(l)).toEqual(['canopy']);
  });

  it('EDITS a scene in one step however many fields changed', () => {
    const before = scene('canopy', 0);
    const l = level([cloneEffectsScene(before)]);
    const h = new EditHistory();

    // A realistic multi-control gesture: world_y, both factors, the scene's
    // v_factor and its name, all in one command.
    const after = cloneEffectsScene(before);
    after.name = 'Canopy at dusk';
    after.layers[0].world_y = 96;
    after.layers[0].fa = 'FACTOR_1_4';
    after.layers[0].fb = { s1: 2, s2: 4, op: 1 };
    after.v_factor = 1;

    h.execute(cmd({ sceneId: 'canopy', oldScene: cloneEffectsScene(before), newScene: after }), l);
    expect(l.effectsScenes!.scenes[0]).toEqual(after);

    h.undo(l);
    expect(l.effectsScenes!.scenes[0]).toEqual(before);
    expect(h.canUndo, 'the five-field edit must be ONE step').toBe(false);

    h.redo(l);
    expect(l.effectsScenes!.scenes[0]).toEqual(after);
  });

  it('DELETES a scene, and undo restores it with every field it had', () => {
    // `budget_class` is deliberately a field no wave-1 form edits — a delete that
    // restored only the fields the UI knows would lose it.
    const original = scene('canopy', 0, { budget_class: 'heavy' });
    const l = level([cloneEffectsScene(original)]);
    const h = new EditHistory();

    h.execute(cmd({ sceneId: 'canopy', oldScene: cloneEffectsScene(original), newScene: null }), l);
    expect(ids(l)).toEqual([]);

    h.undo(l);
    expect(l.effectsScenes!.scenes[0]).toEqual(original);
    expect(l.effectsScenes!.scenes[0].budget_class).toBe('heavy');
  });

  it('keeps the scene list ORDER across an edit and its undo', () => {
    const l = level([scene('a'), scene('b'), scene('c')]);
    const h = new EditHistory();
    const edited = scene('b', 200);

    h.execute(cmd({ sceneId: 'b', oldScene: scene('b'), newScene: edited }), l);
    expect(ids(l), 'an edit must not move the scene to the end').toEqual(['a', 'b', 'c']);
    h.undo(l);
    expect(ids(l), 'undo must not reorder either').toEqual(['a', 'b', 'c']);
  });

  it('stores a COPY, so mutating the library afterwards cannot rewrite history', () => {
    const l = level();
    const h = new EditHistory();
    const created = scene('canopy', 0);
    h.execute(cmd({ sceneId: 'canopy', newScene: created }), l);

    // The live object in the library must not be the command's object...
    expect(l.effectsScenes!.scenes[0]).not.toBe(created);
    // ...nor may a later in-place mutation of the live object reach the command.
    l.effectsScenes!.scenes[0].layers[0].world_y = 4242;
    h.undo(l);
    h.redo(l);
    expect(l.effectsScenes!.scenes[0].layers[0].world_y,
      'redo restored a value a later mutation had leaked into the command').toBe(0);
  });

  it('throws rather than silently consuming an undo slot when the level has no library', () => {
    const l = { sections: [] } as unknown as S4Level;
    const h = new EditHistory();
    expect(() => h.execute(cmd({ sceneId: 'canopy', newScene: scene('canopy') }), l))
      .toThrow('set-effects-scene requires level.effectsScenes');
  });

  it('is act-ambient: sectionIndex -1 never reaches the section switch', () => {
    // The section branch returns early for a missing section, so a command that
    // fell through to it would apply NOTHING and still consume an undo slot. The
    // level here has no sections at all, which is what makes the row meaningful.
    const l = level();
    expect(l.sections).toHaveLength(0);
    const h = new EditHistory();
    h.execute(cmd({ sceneId: 'canopy', newScene: scene('canopy') }), l);
    expect(ids(l)).toEqual(['canopy']);
  });
});
