// THE CONFIRM IN FRONT OF A DELETE THAT DESTROYS A FILE.
//
// Three rows and not one, on the rule `shell/new-sprite-guard.ts` states for its
// own dialog: a file with only "it asked" has tested a dialog, not the ruling.
//   • a document WITH a file asks, and the danger arm deletes it;
//   • Cancel (and Esc, and the backdrop, which both answer 'cancel') keeps it;
//   • a document with NO file — created this session and never saved — deletes
//     with no dialog, because nothing a Ctrl+Z cannot return is at stake.
//
// ⚠ THE PREDICATE IS THE LEDGER, NOT THE FILE SYSTEM. `effectsSceneFileAtRisk`
// asks whether the path is in `loadedPaths` — the same list the save derives its
// removals from — so the dialog appears exactly when the save would remove
// something. A probe of the disk would drift in both directions, and there is no
// disk here to probe anyway.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deleteSceneGuarded, deletePresetGuarded,
  effectsSceneFileAtRisk, effectsPresetFileAtRisk,
} from '../effects-delete-guard';
import { useProjectStore } from '../../state/projectStore';
import { useConfirmStore, type ConfirmRequest } from '../../state/confirmStore';
import { safeFocusIndex, SAFE_CONFIRM_KEY } from '../../components/ui/safe-focus';
import type { EffectsScene } from '../../../core/formats/effects/scene';
import type { EffectsPreset } from '../../../core/formats/effects/preset';

const SCENE_DIR = 'data/editor/effects/';
const PRESET_DIR = 'data/editor/effects/presets/';

const scene = (id: string) => ({
  schema: 1, id, v_factor: 2,
  layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_2' }],
} as unknown as EffectsScene);
const preset = (id: string) => ({ schema: 1, id } as unknown as EffectsPreset);

/** The smallest store state these two predicates read. */
function install(sceneIds: string[], loadedScenes: string[],
  presetIds: string[] = [], loadedPresets: string[] = []) {
  useProjectStore.setState({
    config: {
      raw: { zones: [{ id: 'ojz', acts: [{ id: 'act1', dataPath: 'data/ojz/act1/' }] }] },
    },
    project: {
      effectsScenes: {
        scenes: sceneIds.map(scene), unreadable: [], notices: [], loadedPaths: loadedScenes,
      },
      effectsPresets: {
        presets: presetIds.map(preset), unreadable: [], notices: [], loadedPaths: loadedPresets,
      },
    },
  } as never);
}

/** Answer the next `ask()` with `key`, capturing the request it was asked with. */
function answerWith(key: string): { seen: ConfirmRequest[] } {
  const seen: ConfirmRequest[] = [];
  useConfirmStore.setState({
    request: null, resolver: null,
    ask: async (request: ConfirmRequest) => { seen.push(request); return key; },
  } as never);
  return { seen };
}

describe('effectsSceneFileAtRisk / effectsPresetFileAtRisk', () => {
  beforeEach(() => install(['keeper'], [`${SCENE_DIR}keeper.json`],
    ['p1'], [`${PRESET_DIR}p1.json`]));

  it('names the file a delete would destroy', () => {
    expect(effectsSceneFileAtRisk('keeper')).toBe(`${SCENE_DIR}keeper.json`);
    expect(effectsPresetFileAtRisk('p1')).toBe(`${PRESET_DIR}p1.json`);
  });

  it('answers null for a document the session created and has not saved', () => {
    install(['keeper', 'born'], [`${SCENE_DIR}keeper.json`]);
    expect(effectsSceneFileAtRisk('born')).toBeNull();
  });

  it('answers null with no project open', () => {
    useProjectStore.setState({ config: null, project: null } as never);
    expect(effectsSceneFileAtRisk('keeper')).toBeNull();
  });
});

describe('deleteSceneGuarded', () => {
  beforeEach(() => install(['keeper'], [`${SCENE_DIR}keeper.json`]));

  it('ASKS, names the file, and deletes on the danger arm', async () => {
    const { seen } = answerWith('delete');
    const run = vi.fn();
    const lib = useProjectStore.getState().project!.effectsScenes;

    expect(await deleteSceneGuarded(lib, 'keeper', run)).toBe(true);

    expect(seen).toHaveLength(1);
    expect(seen[0].title).toContain('keeper');
    // The path is the fact the author needs and the one a reworded title loses.
    expect(seen[0].body).toContain(`${SCENE_DIR}keeper.json`);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).not.toBeNull();
  });

  it('does NOTHING on cancel, and "cancel" is whatever Esc and the backdrop answer', async () => {
    const run = vi.fn();
    const lib = useProjectStore.getState().project!.effectsScenes;
    for (const answer of [SAFE_CONFIRM_KEY, 'something-nobody-wrote']) {
      answerWith(answer);
      expect(await deleteSceneGuarded(lib, 'keeper', run)).toBe(false);
    }
    // ⚠ ANYTHING THAT IS NOT AN EXPLICIT DELETE IS TREATED AS A CANCEL: the
    // confirm store returns 'cancel' for Esc, the backdrop AND a superseded
    // request, and a guard testing `!== 'cancel'` would destroy the document on
    // a key nobody has written yet.
    expect(run).not.toHaveBeenCalled();
  });

  it('does not ask at all for a document with no file, and deletes it', async () => {
    install(['keeper', 'born'], [`${SCENE_DIR}keeper.json`]);
    const { seen } = answerWith('delete');
    const run = vi.fn();
    const lib = useProjectStore.getState().project!.effectsScenes;

    expect(await deleteSceneGuarded(lib, 'born', run)).toBe(true);
    expect(seen).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('offers a request the dialog can land on SAFELY (ui/safe-focus.ts)', async () => {
    const { seen } = answerWith('cancel');
    await deleteSceneGuarded(
      useProjectStore.getState().project!.effectsScenes, 'keeper', vi.fn());
    const buttons = seen[0].buttons;
    const i = safeFocusIndex(buttons);
    expect(i, 'no safe button: a bare Space would be aimed at the destructive one')
      .not.toBeNull();
    expect(buttons[i!].tone).not.toBe('danger');
    // And the destructive arm is TONED, or safe-focus cannot recognise it.
    expect(buttons.some((b) => b.tone === 'danger')).toBe(true);
  });
});

describe('deletePresetGuarded', () => {
  beforeEach(() => install([], [], ['p1'], [`${PRESET_DIR}p1.json`]));

  it('asks for a preset with a file and deletes on the danger arm', async () => {
    const { seen } = answerWith('delete');
    const run = vi.fn();
    expect(await deletePresetGuarded(
      useProjectStore.getState().project!.effectsPresets, 'p1', run)).toBe(true);
    expect(seen[0].body).toContain(`${PRESET_DIR}p1.json`);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps the preset on cancel', async () => {
    answerWith('cancel');
    const run = vi.fn();
    expect(await deletePresetGuarded(
      useProjectStore.getState().project!.effectsPresets, 'p1', run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
