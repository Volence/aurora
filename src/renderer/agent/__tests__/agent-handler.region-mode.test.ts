// assign_section_preset ON BOTH KINDS OF ACT (ruling B, 2026-09-17).
//
// On a REGION-MODE act (its regions.json exists) aeon's
// `tools/effects_gen.py check_mode_conflict` refuses a build where a section
// sidecar carries a `rasterRef`, so this tool must refuse to write one, by
// THROWING, naming that check and the Regions panel, and must still let a
// caller CLEAR a ref left on a sidecar (that clearing is the repair).
//
// On a SECTION-MODE act (no regions.json) the tool must behave exactly as
// before: the same write, the same reply, the same sentence. Both halves are
// run here against the same fixture, differing ONLY in the act's `regions`
// state, so a row that passes on one and fails on the other is about the mode.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { ActRegionsState } from '../../../core/formats/regions/act-regions';
import { noRegionsLoaded } from '../../../core/formats/regions/act-regions';
import { RASTER_SECTION_BINDING_LIMIT } from '../../../core/formats/raster-binding';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

const section = (rasterRef: string | null = null) => ({
  bgLayoutRef: null, paletteRef: null, rasterRef, sceneRef: null, objects: [], rings: [],
});

const glare = (): EffectsPreset => ({
  schema: 1, id: 'glare', name: 'Glare',
  bands: [{ top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0x0eee] } } }],
});

const library = (): EffectsPresetLibrary => ({
  presets: [glare()], unreadable: [], notices: [], loadedPaths: [],
});

/** OJZ act 1's state at aeon e2af59ea: a loaded regions.json, bindings on region rows. */
const regionMode = (): ActRegionsState => ({
  document: {
    schema: 1, act: 'ojz_act1',
    regions: [{
      id: 'sec5', name: 'Band showcase', preset: 'OJZ_Preset_Sec5',
      rasterRef: 'ojz_sec5_showcase', rect: { x: 0, y: 0, w: 4096, h: 2048 },
    }],
  },
  loadedPath: 'games/sonic4/data/editor/ojz/act1/regions.json',
  unreadable: null,
});

function open(regions: ActRegionsState, sectionRefs: (string | null)[] = [null, null]): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({
    project: {
      zones: [{
        id: 'ojz', name: 'OJZ',
        tileset: { tiles: [] },
        palette: { lines: [line(), line(), line(), line()] },
        acts: [{
          id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
          sections: sectionRefs.map((r) => section(r)),
          regions,
        }],
      }],
      chunkLibrary: [], bgLibrary: [], bgLibraryUnresolved: [],
      effectsScenes: { scenes: [], unreadable: [], notices: [], loadedPaths: [] },
      effectsPresets: library(),
    } as never,
  });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');
const refs = () => useProjectStore.getState().project!.zones[0].acts[0].sections
  .map((s) => s?.rasterRef ?? null);

describe('assign_section_preset on a SECTION-MODE act: unchanged', () => {
  beforeEach(() => open(noRegionsLoaded()));

  it('binds, replies changed with the shipped limit, and one undo takes it back', async () => {
    const r = await ask({ kind: 'assign-section-preset', section: 1, presetId: 'glare' }) as Record<string, unknown>;
    expect(r).toEqual({
      section: 1, presetId: 'glare', changed: true, binding: RASTER_SECTION_BINDING_LIMIT,
    });
    expect(refs()).toEqual([null, 'glare']);
    actHistory().undo();
    expect(refs()).toEqual([null, null]);
  });
});

describe('assign_section_preset on a REGION-MODE act (OJZ act 1 shape): refuses to bind', () => {
  beforeEach(() => open(regionMode()));

  it('THROWS, names check_mode_conflict and the Regions panel, writes nothing, burns no undo', async () => {
    let message = '';
    try {
      await ask({ kind: 'assign-section-preset', section: 1, presetId: 'glare' });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message, 'the call did not throw').not.toBe('');
    expect(message).toContain('check_mode_conflict');
    expect(message).toContain('tools/effects_gen.py');
    expect(message).toContain('region mode');
    expect(message).toContain('Regions panel');
    expect(refs(), 'refused and wrote anyway').toEqual([null, null]);
    expect(actHistory().canUndo, 'a refused call left an undo entry').toBe(false);
  });

  it('refuses a READABLE id: it is the mode refusing, not the library check', async () => {
    // ANTI-VACUOUS: `glare` is in the library, so on a section-mode act this
    // exact call succeeds (the describe above). Only the mode can refuse it.
    expect(library().presets.map((p) => p.id)).toContain('glare');
    await expect(ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' }))
      .rejects.toThrow(/check_mode_conflict/);
  });
});

describe('assign_section_preset on a REGION-MODE act: clearing a leftover sidecar ref is allowed', () => {
  beforeEach(() => open(regionMode(), ['glare', null]));

  it('null clears it, and the reply is the ordinary one', async () => {
    expect(refs()[0], 'fixture: nothing to clear').toBe('glare');
    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: null }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(refs()).toEqual([null, null]);
  });

  it('re-binding the SAME id is still refused, not waved through as a no-op', async () => {
    await expect(ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' }))
      .rejects.toThrow(/check_mode_conflict/);
  });
});
