// The effects-scene agent surface, driven through `handleAgentRequest` — the
// same entry point MCP and Aether both reach.
//
// ROADMAP §6's first amendment says agent parity is REGISTRY work: one
// EDITOR_METHODS entry serves both transports, and registry-conformance.test.ts
// already proves the entries are advertised and have handler cases. What it
// cannot prove is that the cases DO the right thing, which is this file: that a
// document survives round-tripping with fields no form knows about, that an
// invalid one is refused with the codec's own issues and writes nothing, and
// that each mutation lands as exactly one undo step on the act's stack.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import type { EffectsScene, EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import { EFFECTS_V_FACTOR_LOCK } from '../../../core/formats/effects/scene-ui';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/** A section object with just the fields these tools touch. */
const section = (sceneRef: string | null = null) => ({ sceneRef, objects: [], rings: [] });

function fakeProject(library: EffectsSceneLibrary): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
        sections: [section(), section()],
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
    effectsScenes: library,
  } as never;
}

/**
 * A scene document carrying TWO things no wave-1 form edits: a custom packed
 * factor and `budget_class`. Both are legal and both are what a field-enumerating
 * round-trip would quietly lose, so every survival check below is asserted on
 * them rather than on `world_y`.
 */
const canopy = (): EffectsScene => ({
  schema: 1,
  id: 'canopy',
  name: 'Canopy',
  layers: [
    { world_y: 0, fa: 'FACTOR_1', fb: { s1: 2, s2: 4, op: 1 } },
    { world_y: 96, fa: 'FACTOR_1_2', fb: 'FACTOR_1_4', enabled: false },
  ],
  v_factor: 2,
  budget_class: 'heavy',
});

const emptyLibrary = (): EffectsSceneLibrary => ({ scenes: [], unreadable: [], notices: [], loadedPaths: [] });

const lib = () => useProjectStore.getState().project!.effectsScenes;
const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');

function open(library: EffectsSceneLibrary = emptyLibrary()): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(library) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  // Ambient by design: the tools must work from a tab that owns no history.
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

describe('list_effects_scenes', () => {
  beforeEach(() => open());

  it('reports an empty project honestly rather than erroring', async () => {
    const r = await ask({ kind: 'list-effects-scenes' }) as Record<string, unknown>;
    expect(r.scenes).toEqual([]);
    expect(r.unreadable).toEqual([]);
    expect(r.sections).toEqual([{ index: 0, sceneId: null }, { index: 1, sceneId: null }]);
  });

  it('names unreadable scene files: an id an agent must not take', async () => {
    open({
      scenes: [canopy()],
      unreadable: [{ path: 'data/editor/effects/broken.json', reason: 'not valid JSON' }],
      notices: [], loadedPaths: [],
    });
    const r = await ask({ kind: 'list-effects-scenes' }) as Record<string, unknown>;
    expect(r.scenes).toEqual([{ id: 'canopy', name: 'Canopy', layers: 2 }]);
    expect(r.unreadable).toEqual([
      { path: 'data/editor/effects/broken.json', reason: 'not valid JSON' },
    ]);
  });
});

describe('get_effects_scene', () => {
  beforeEach(() => open({ scenes: [canopy()], unreadable: [], notices: [], loadedPaths: [] }));

  it('returns the WHOLE document, including fields no form exposes', async () => {
    const r = await ask({ kind: 'get-effects-scene', id: 'canopy' }) as { scene: EffectsScene };
    expect(r.scene).toEqual(canopy());
    expect(r.scene.budget_class).toBe('heavy');
    expect(r.scene.layers[0].fb).toEqual({ s1: 2, s2: 4, op: 1 });
  });

  it('distinguishes "no such scene" from "that file would not parse"', async () => {
    await expect(ask({ kind: 'get-effects-scene', id: 'nope' })).rejects.toThrow(/not found/);
    open({
      scenes: [], notices: [], loadedPaths: [],
      unreadable: [{ path: 'data/editor/effects/broken.json', reason: 'not valid JSON' }],
    });
    await expect(ask({ kind: 'get-effects-scene', id: 'broken' }))
      .rejects.toThrow(/could not be read \(not valid JSON\)/);
  });
});

describe('set_effects_scene', () => {
  beforeEach(() => open());

  it('creates a scene as one undo step, on the ACT stack, from a tab with no history', async () => {
    const r = await ask({ kind: 'set-effects-scene', id: 'canopy', scene: canopy() });
    expect(r).toEqual({ id: 'canopy', changed: true, created: true });
    expect(lib().scenes.map(s => s.id)).toEqual(['canopy']);
    expect(lib().scenes[0].budget_class).toBe('heavy');

    expect(actHistory().canUndo).toBe(true);
    actHistory().undo();
  });

  it('refuses an invalid document with the codec\'s own issues, and writes NOTHING', async () => {
    // `layers` must have at least one item, and `v_factor` is required.
    await expect(ask({
      kind: 'set-effects-scene', id: 'canopy',
      scene: { schema: 1, id: 'canopy', layers: [], v_factor: EFFECTS_V_FACTOR_LOCK },
    })).rejects.toThrow(/schema/);
    expect(lib().scenes).toEqual([]);
    expect(actHistory().canUndo, 'a refused write must not consume an undo slot').toBe(false);
  });

  it('enforces the filename-stem identity rule the JSON schema alone cannot', async () => {
    await expect(ask({
      kind: 'set-effects-scene', id: 'canopy', scene: { ...canopy(), id: 'something_else' },
    })).rejects.toThrow(/filename stem and the id must match/);
    expect(lib().scenes).toEqual([]);
  });

  it('refuses the raw bridge fields §2.1 excludes', async () => {
    const withRaw = { ...canopy(), layer_mask_raw: 3 };
    await expect(ask({ kind: 'set-effects-scene', id: 'canopy', scene: withRaw }))
      .rejects.toThrow(/layer_mask_raw/);
    expect(lib().scenes).toEqual([]);
  });

  it('refuses a CREATE whose id collides with an unreadable file', async () => {
    open({
      scenes: [], notices: [], loadedPaths: [],
      unreadable: [{ path: 'data/editor/effects/broken.json', reason: 'x' }],
    });
    await expect(ask({
      kind: 'set-effects-scene', id: 'broken', scene: { ...canopy(), id: 'broken' },
    })).rejects.toThrow(/could not be read/);
    expect(lib().scenes).toEqual([]);
  });

  it('replaces an existing scene, and a re-send of the SAME document is not an undo step', async () => {
    open({ scenes: [canopy()], unreadable: [], notices: [], loadedPaths: [] });

    const unchanged = await ask({ kind: 'set-effects-scene', id: 'canopy', scene: canopy() });
    expect(unchanged).toEqual({ id: 'canopy', changed: false });
    expect(actHistory().canUndo, 'an unchanged re-send must not consume an undo slot').toBe(false);

    const edited = { ...canopy(), budget_class: 'light' };
    const r = await ask({ kind: 'set-effects-scene', id: 'canopy', scene: edited });
    expect(r).toEqual({ id: 'canopy', changed: true, created: false });
    expect(lib().scenes[0].budget_class).toBe('light');
    expect(actHistory().canUndo).toBe(true);
  });

  it('deletes with scene: null, and reports honestly when there was nothing there', async () => {
    open({ scenes: [canopy()], unreadable: [], notices: [], loadedPaths: [] });
    expect(await ask({ kind: 'set-effects-scene', id: 'canopy', scene: null }))
      .toEqual({ id: 'canopy', deleted: true });
    expect(lib().scenes).toEqual([]);
    expect(await ask({ kind: 'set-effects-scene', id: 'canopy', scene: null }))
      .toEqual({ id: 'canopy', deleted: false, reason: 'no such scene' });
  });
});

describe('assign_section_scene', () => {
  beforeEach(() => open({ scenes: [canopy()], unreadable: [], notices: [], loadedPaths: [] }));

  const sceneRefOf = (i: number) =>
    useProjectStore.getState().project!.zones[0].acts[0].sections[i]!.sceneRef;

  it('assigns and clears a sceneRef, one undo step each', async () => {
    expect(await ask({ kind: 'assign-section-scene', section: 1, sceneId: 'canopy' }))
      .toEqual({ section: 1, sceneId: 'canopy', changed: true });
    expect(sceneRefOf(1)).toBe('canopy');
    expect(sceneRefOf(0), 'the other section must not move').toBeNull();

    expect(await ask({ kind: 'assign-section-scene', section: 1, sceneId: null }))
      .toEqual({ section: 1, sceneId: null, changed: true });
    expect(sceneRefOf(1)).toBeNull();
  });

  it('re-assigning the same scene changes nothing and consumes no undo slot', async () => {
    await ask({ kind: 'assign-section-scene', section: 1, sceneId: 'canopy' });
    const before = actHistory().canUndo;
    expect(before).toBe(true);
    expect(await ask({ kind: 'assign-section-scene', section: 1, sceneId: 'canopy' }))
      .toEqual({ section: 1, sceneId: 'canopy', changed: false });
    // One step total, not two.
    actHistory().undo();
    expect(actHistory().canUndo).toBe(false);
    expect(sceneRefOf(1)).toBeNull();
  });

  it('refuses a scene that is not readable, and one that is not there at all', async () => {
    await expect(ask({ kind: 'assign-section-scene', section: 0, sceneId: 'nope' }))
      .rejects.toThrow(/not a readable scene/);
    open({
      scenes: [], notices: [], loadedPaths: [],
      unreadable: [{ path: 'data/editor/effects/broken.json', reason: 'x' }],
    });
    // An unreadable file is NOT assignable: the ref would name something the
    // build cannot resolve.
    await expect(ask({ kind: 'assign-section-scene', section: 0, sceneId: 'broken' }))
      .rejects.toThrow(/not a readable scene/);
  });

  it('refuses an out-of-range section rather than silently doing nothing', async () => {
    await expect(ask({ kind: 'assign-section-scene', section: 9, sceneId: 'canopy' }))
      .rejects.toThrow(/out of range \(0-1\)/);
  });
});
